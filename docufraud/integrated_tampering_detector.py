#!/usr/bin/env python3
"""
Integrated Document Tampering Detection System
Combines mathematical forensic analysis with LLM reasoning for comprehensive tampering detection

This system:
1. Performs mathematical/forensic analysis (ELA, RGB variance, local variance, SSIM, region stats)
2. Uses Azure OpenAI Vision with LLM reasoning to interpret findings
3. Generates comprehensive reports with both quantitative and qualitative insights
"""

import os
import sys
import json
import argparse
import datetime
import base64
import tempfile
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageChops, ImageFilter, ImageEnhance
import cv2
from skimage.metrics import structural_similarity as ssim
import pytesseract
import fitz  # PyMuPDF

# Add parent directory to path for config import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config import AzureOpenAIConfig, get_openai_client
from prompt_manager import get_integrated_tampering_detection_prompt, get_tampering_detection_system_prompt

# Initialize Azure OpenAI client from environment
client = get_openai_client()


class ForensicAnalyzer:
    """Mathematical and forensic analysis functions"""
    
    @staticmethod
    def ensure_outdir(base="out"):
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        out = f"{base}_{ts}"
        os.makedirs(out, exist_ok=True)
        return out
    
    @staticmethod
    def ela_image(pil_img, quality=90):
        """Error Level Analysis"""
        temp = ".__ela_temp.jpg"
        pil_img.save(temp, 'JPEG', quality=quality)
        reloaded = Image.open(temp).convert('RGB')
        ela = ImageChops.difference(pil_img, reloaded)
        
        extrema = ela.getextrema()
        max_diff = max([ex[1] for ex in extrema])
        if max_diff == 0:
            scale = 1
        else:
            scale = 255.0 / max_diff
        ela = ImageEnhance.Brightness(ela).enhance(scale)
        
        try:
            os.remove(temp)
        except:
            pass
        
        return ela, np.array(ela.convert('L'))
    
    @staticmethod
    def rgb_channel_map(npimg):
        """RGB channel variance map"""
        r, g, b = npimg[:,:,0].astype(int), npimg[:,:,1].astype(int), npimg[:,:,2].astype(int)
        stacked = np.stack([r, g, b], axis=2)
        std = np.std(stacked, axis=2)
        return std
    
    @staticmethod
    def local_variance_map(gray, ksize=9):
        """Local variance/noise map"""
        img = gray.astype(np.float32)
        mean = cv2.blur(img, (ksize, ksize))
        mean_sq = cv2.blur(img*img, (ksize, ksize))
        var = mean_sq - mean*mean
        var[var < 0] = 0
        return var
    
    @staticmethod
    def ssim_map(gray):
        """SSIM vs blurred version"""
        blurred = cv2.GaussianBlur(gray, (7, 7), 0)
        score = ssim(gray, blurred)
        return score
    
    @staticmethod
    def compare_region_stats(npimg, bbox):
        """Compare region statistics to baseline"""
        x1, y1, x2, y2 = bbox
        H, W = npimg.shape[:2]
        x1, x2 = max(0, int(x1)), min(W, int(x2))
        y1, y2 = max(0, int(y1)), min(H, int(y2))
        region = npimg[y1:y2, x1:x2]
        
        h = y2 - y1
        w = x2 - x1
        baseline_y1 = min(H - h, y2 + 5)
        baseline = npimg[baseline_y1:baseline_y1+h, x1:x1+w]
        
        if baseline.size == 0 or region.size == 0:
            return None
        
        reg_gray = cv2.cvtColor(region, cv2.COLOR_RGB2GRAY)
        bl_gray = cv2.cvtColor(baseline, cv2.COLOR_RGB2GRAY)
        
        stats = {
            "reg_mean": float(np.mean(reg_gray)),
            "reg_std": float(np.std(reg_gray)),
            "bl_mean": float(np.mean(bl_gray)),
            "bl_std": float(np.std(bl_gray)),
        }
        
        stats["mean_diff"] = abs(stats["reg_mean"] - stats["bl_mean"])
        stats["std_ratio"] = stats["reg_std"] / (stats["bl_std"] + 1e-6)
        
        h_reg = cv2.calcHist([reg_gray], [0], None, [64], [0, 256]).flatten()
        h_bl = cv2.calcHist([bl_gray], [0], None, [64], [0, 256]).flatten()
        h_reg_norm = h_reg / (h_reg.sum() + 1e-9)
        h_bl_norm = h_bl / (h_bl.sum() + 1e-9)
        hist_corr = float(np.sum(np.minimum(h_reg_norm, h_bl_norm)))
        stats["hist_intersection"] = hist_corr
        
        return stats
    
    @staticmethod
    def evaluate_scores(ela_arr, rgb_std, var_map, ssim_score, region_stats=None):
        """Combined heuristic decision"""
        reasons = []
        
        # ELA analysis
        ela_thresh = 30
        ela_hot = np.mean(ela_arr > ela_thresh)
        if ela_hot > 0.02:
            reasons.append(f"ELA: notable differing compression regions ({ela_hot*100:.2f}% hot pixels)")
        
        # RGB std analysis
        mean_rgb_std = float(np.mean(rgb_std))
        if mean_rgb_std < 4:
            reasons.append("RGB: unusually low channel variance (flattened color channels)")
        if mean_rgb_std > 12:
            reasons.append("RGB: high channel variance (possible overlay from different source)")
        
        # Local variance
        mean_var = float(np.mean(var_map))
        if mean_var < 10:
            reasons.append("Noise: image appears overly smooth (possible pasted/filled region)")
        if mean_var > 200:
            reasons.append("Noise: very high local variance (scan noise or heavy editing artifacts)")
        
        # SSIM
        if ssim_score > 0.98:
            reasons.append("SSIM: nearly identical to blurred version (low texture) -> suspicious")
        if ssim_score < 0.85:
            reasons.append("SSIM: structural differences with blur (ok/normal)")
        
        # Region stats
        reg_flag = False
        if region_stats is not None:
            if (region_stats["mean_diff"] > 8 or 
                region_stats["hist_intersection"] < 0.6 or 
                region_stats["std_ratio"] < 0.6 or 
                region_stats["std_ratio"] > 1.8):
                reasons.append("Region Stats: region differs statistically from nearby baseline (possible edit)")
                reg_flag = True
        
        # Compute score
        score = 0.0
        score += min(1.0, ela_hot * 10) * 0.25
        score += min(1.0, (mean_rgb_std/20.0)) * 0.2
        score += min(1.0, (abs(mean_var-50)/150.0)) * 0.2
        score += (1.0 - max(0.0, min(1.0, (ssim_score - 0.7)/0.3))) * 0.15
        if reg_flag:
            score += 0.2
        score = max(0.0, min(1.0, score))
        
        return score, reasons, {
            'ela_hot_pixels_ratio': float(ela_hot),
            'mean_rgb_std': mean_rgb_std,
            'mean_local_variance': mean_var,
            'ssim_score': float(ssim_score),
            'region_stats': region_stats
        }


class IntegratedTamperingDetector:
    """Integrated tampering detector combining forensics and LLM reasoning"""
    
    def __init__(self, output_dir: str = "integrated_reports"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.forensic = ForensicAnalyzer()
        self.temp_dir = Path(tempfile.gettempdir()) / "integrated_tampering"
        self.temp_dir.mkdir(exist_ok=True)
    
    def encode_image(self, image_path: str) -> str:
        """Encode image to base64"""
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')
    
    def convert_pdf_to_images(self, pdf_path: str) -> List[str]:
        """Convert PDF pages to images"""
        doc = fitz.open(pdf_path)
        image_paths = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            image_path = self.temp_dir / f"page_{page_num + 1}.png"
            pix.save(str(image_path))
            image_paths.append(str(image_path))
        
        doc.close()
        return image_paths
    
    def perform_forensic_analysis(self, image_path: str, bbox: Optional[List[int]] = None) -> Dict[str, Any]:
        """Perform mathematical forensic analysis"""
        print(f"\nPerforming forensic analysis on: {image_path}")
        
        # Create forensic output directory
        forensic_outdir = self.forensic.ensure_outdir(str(self.output_dir / "forensic"))
        
        # Load image
        img_pil = Image.open(image_path).convert("RGB")
        npimg = np.array(img_pil)
        gray = cv2.cvtColor(npimg, cv2.COLOR_RGB2GRAY)
        
        # ELA
        ela_pil, ela_arr = self.forensic.ela_image(img_pil)
        ela_path = os.path.join(forensic_outdir, "ela.png")
        ela_pil.save(ela_path)
        
        # RGB std map
        rgb_std = self.forensic.rgb_channel_map(npimg)
        rgb_vis = (255 * (rgb_std - rgb_std.min()) / (np.ptp(rgb_std)+1e-9)).astype(np.uint8)
        cv2.imwrite(os.path.join(forensic_outdir, "rgb_std.png"), rgb_vis)
        
        # Local variance map
        var_map = self.forensic.local_variance_map(gray, ksize=9)
        var_vis = (255 * (var_map - var_map.min()) / (np.ptp(var_map)+1e-9)).astype(np.uint8)
        cv2.imwrite(os.path.join(forensic_outdir, "local_var.png"), var_vis)
        
        # SSIM
        ssim_score = self.forensic.ssim_map(gray)
        
        # Region stats
        region_stats = None
        if bbox:
            region_stats = self.forensic.compare_region_stats(npimg, bbox)
        
        # Evaluate scores
        score, reasons, metrics = self.forensic.evaluate_scores(
            ela_arr, rgb_std, var_map, ssim_score, region_stats
        )
        
        return {
            'forensic_score': score,
            'forensic_verdict': 'LIKELY TAMPERED' if score > 0.45 else 'LIKELY ORIGINAL',
            'forensic_reasons': reasons,
            'forensic_metrics': metrics,
            'forensic_output_dir': forensic_outdir,
            'forensic_images': {
                'ela': ela_path,
                'rgb_std': os.path.join(forensic_outdir, "rgb_std.png"),
                'local_var': os.path.join(forensic_outdir, "local_var.png")
            }
        }
    
    def analyze_with_llm_reasoning(self, image_path: str, forensic_results: Dict[str, Any]) -> Dict[str, Any]:
        """Use LLM reasoning enhanced with forensic data"""
        
        base64_image = self.encode_image(image_path)
        
        # Create forensic summary for prompt
        forensic_summary = f"""
MATHEMATICAL FORENSIC ANALYSIS RESULTS:
- Forensic Score: {forensic_results['forensic_score']:.3f} (0=clean, 1=tampered)
- Verdict: {forensic_results['forensic_verdict']}
- ELA Hot Pixels: {forensic_results['forensic_metrics']['ela_hot_pixels_ratio']*100:.2f}%
- RGB Channel Std Dev: {forensic_results['forensic_metrics']['mean_rgb_std']:.2f}
- Local Variance: {forensic_results['forensic_metrics']['mean_local_variance']:.2f}
- SSIM Score: {forensic_results['forensic_metrics']['ssim_score']:.4f}

Forensic Indicators Detected:
{chr(10).join('- ' + r for r in forensic_results['forensic_reasons']) if forensic_results['forensic_reasons'] else '- No strong forensic signals detected'}
"""
        
        # Get prompts from prompt manager
        analysis_prompt = get_integrated_tampering_detection_prompt(
            forensic_summary=forensic_summary,
            ela_hot_pixels=f"{forensic_results['forensic_metrics']['ela_hot_pixels_ratio']*100:.2f}",
            mean_rgb_std=f"{forensic_results['forensic_metrics']['mean_rgb_std']:.2f}",
            mean_local_variance=f"{forensic_results['forensic_metrics']['mean_local_variance']:.2f}",
            ssim_score=f"{forensic_results['forensic_metrics']['ssim_score']:.4f}"
        )
        
        system_prompt = get_tampering_detection_system_prompt()

        try:
            response = client.chat.completions.create(
                model=AzureOpenAIConfig.DEPLOYMENT,
                messages=[
                    {
                        "role": "system",
                        "content": system_prompt
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": analysis_prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": "data:image/jpeg;base64," + base64_image
                                }
                            }
                        ]
                    }
                ],
                temperature=0.1,
                max_tokens=16000,
                response_format={"type": "json_object"}
            )
            
            analysis_text = response.choices[0].message.content
            analysis_result = json.loads(analysis_text)
            
            return analysis_result
            
        except Exception as e:
            return {
                'error': f"LLM analysis failed: {str(e)}",
                'tampering_detected': None,
                'confidence_score': 0
            }
    
    def analyze_document(self, file_path: str, bbox: Optional[str] = None) -> Dict[str, Any]:
        """Perform integrated analysis on a document"""
        
        print(f"\n{'='*80}")
        print(f"INTEGRATED TAMPERING DETECTION")
        print(f"Document: {file_path}")
        print(f"{'='*80}")
        
        if not os.path.exists(file_path):
            return {'error': f'File not found: {file_path}'}
        
        # Parse bbox if provided
        bbox_coords = None
        if bbox:
            try:
                bbox_coords = [int(x) for x in bbox.split(",")]
                if len(bbox_coords) != 4:
                    print("Warning: bbox must be x1,y1,x2,y2 - ignoring")
                    bbox_coords = None
            except:
                print("Warning: Invalid bbox format - ignoring")
                bbox_coords = None
        
        # Convert PDF to images if needed
        if file_path.lower().endswith('.pdf'):
            print("\nConverting PDF to images...")
            image_paths = self.convert_pdf_to_images(file_path)
        else:
            image_paths = [file_path]
        
        # Analyze each page/image
        results = []
        for idx, img_path in enumerate(image_paths, 1):
            print(f"\n{'='*60}")
            print(f"Analyzing Page/Image {idx}/{len(image_paths)}")
            print(f"{'='*60}")
            
            # Step 1: Forensic Analysis
            forensic_results = self.perform_forensic_analysis(img_path, bbox_coords)
            print(f"✓ Forensic Analysis Complete")
            print(f"  Score: {forensic_results['forensic_score']:.3f}")
            print(f"  Verdict: {forensic_results['forensic_verdict']}")
            
            # Step 2: LLM Reasoning
            print(f"\nPerforming LLM visual analysis with forensic context...")
            llm_results = self.analyze_with_llm_reasoning(img_path, forensic_results)
            print(f"✓ LLM Analysis Complete")
            print(f"  Tampering Detected: {'YES ⚠️' if llm_results.get('tampering_detected') else 'NO ✓'}")
            print(f"  Confidence: {llm_results.get('confidence_score', 0)}%")
            print(f"  Risk Level: {llm_results.get('risk_level', 'UNKNOWN')}")
            
            # Combine results
            combined_result = {
                'page': idx,
                'image_path': img_path,
                'forensic_analysis': forensic_results,
                'llm_analysis': llm_results,
                'integrated_verdict': self._create_integrated_verdict(forensic_results, llm_results)
            }
            
            results.append(combined_result)
        
        # Create final report
        final_report = {
            'document_name': os.path.basename(file_path),
            'document_path': file_path,
            'analysis_timestamp': datetime.datetime.now().isoformat(),
            'total_pages': len(image_paths),
            'page_analyses': results,
            'summary': self._create_summary(results)
        }
        
        return final_report
    
    def _create_integrated_verdict(self, forensic: Dict[str, Any], llm: Dict[str, Any]) -> Dict[str, Any]:
        """Create integrated verdict combining both analyses"""
        
        # Weight both analyses
        forensic_score = forensic['forensic_score']
        llm_confidence = llm.get('confidence_score', 0) / 100.0
        llm_tampering = llm.get('tampering_detected', False)
        
        # Combined score (weighted average)
        combined_score = (forensic_score * 0.4 + llm_confidence * 0.6) if llm_tampering else (forensic_score * 0.4)
        
        # Determine final verdict
        if combined_score > 0.7 or (forensic_score > 0.6 and llm_tampering):
            verdict = "TAMPERING DETECTED - HIGH CONFIDENCE"
            risk = "CRITICAL"
        elif combined_score > 0.5 or (forensic_score > 0.45 and llm_tampering):
            verdict = "LIKELY TAMPERED - MEDIUM CONFIDENCE"
            risk = "HIGH"
        elif combined_score > 0.3 or forensic_score > 0.35:
            verdict = "POSSIBLE TAMPERING - REQUIRES REVIEW"
            risk = "MEDIUM"
        else:
            verdict = "NO SIGNIFICANT TAMPERING DETECTED"
            risk = "LOW"
        
        return {
            'combined_score': float(combined_score),
            'verdict': verdict,
            'risk_level': risk,
            'forensic_contribution': forensic_score,
            'llm_contribution': llm_confidence,
            'agreement': 'AGREE' if (forensic_score > 0.45) == llm_tampering else 'DISAGREE'
        }
    
    def _create_summary(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Create summary of all analyses"""
        
        tampering_detected = any(r['integrated_verdict']['combined_score'] > 0.5 for r in results)
        max_risk = max((r['integrated_verdict']['risk_level'] for r in results),
                      key=lambda x: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].index(x))
        
        total_anomalies = sum(
            len(r['llm_analysis'].get('detected_anomalies', [])) for r in results
        )
        
        return {
            'tampering_detected': tampering_detected,
            'highest_risk_level': max_risk,
            'pages_analyzed': len(results),
            'total_anomalies_found': total_anomalies,
            'average_forensic_score': float(np.mean([r['forensic_analysis']['forensic_score'] for r in results])),
            'average_llm_confidence': float(np.mean([r['llm_analysis'].get('confidence_score', 0) for r in results]))
        }
    
    def generate_report(self, analysis_results: Dict[str, Any]) -> str:
        """Generate concise, focused tampering report"""
        
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        report_path = self.output_dir / f"tampering_report_{timestamp}.txt"
        json_path = self.output_dir / f"tampering_report_{timestamp}.json"
        
        # Save JSON
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(analysis_results, f, indent=2, ensure_ascii=False)
        
        # Generate concise text report
        lines = [
            "=" * 85,
            "DOCUMENT TAMPERING DETECTION REPORT",
            "=" * 85,
            f"Document: {analysis_results['document_name']}",
            f"Date: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')} | Pages: {analysis_results['total_pages']}",
            "",
            ">>> VERDICT",
            f"Status: {'⚠️ TAMPERED' if analysis_results['summary']['tampering_detected'] else '✓ AUTHENTIC'} | Risk: {analysis_results['summary']['highest_risk_level']}",
            f"Confidence: Forensic {analysis_results['summary']['average_forensic_score']:.0%} + AI {analysis_results['summary']['average_llm_confidence']:.0f}% | Anomalies: {analysis_results['summary']['total_anomalies_found']}",
        ]
        
        # Page-by-page analysis
        for page_result in analysis_results['page_analyses']:
            fmetrics = page_result['forensic_analysis']['forensic_metrics']
            verdict = page_result['integrated_verdict']
            llm = page_result['llm_analysis']
            
            lines.extend([
                f"\n{'='*85}",
                f"PAGE {page_result['page']} | {verdict['verdict']} ({verdict['risk_level']})",
                f"Score: {verdict['combined_score']:.2f} | Agreement: {verdict['agreement']}",
                "",
                f"FORENSIC [{page_result['forensic_analysis']['forensic_score']:.2f}]: ELA {fmetrics['ela_hot_pixels_ratio']*100:.1f}% | RGB {fmetrics['mean_rgb_std']:.1f} | Var {fmetrics['mean_local_variance']:.0f} | SSIM {fmetrics['ssim_score']:.3f}",
            ])
            
            # Show red flags if any
            if page_result['forensic_analysis']['forensic_reasons']:
                lines.append("Red Flags: " + " | ".join(page_result['forensic_analysis']['forensic_reasons'][:2]))
            
            # AI assessment (truncated)
            assessment = llm.get('overall_assessment', 'N/A')
            lines.extend([
                "",
                f"AI ANALYSIS [{llm.get('confidence_score', 0)}%]:",
                assessment[:400] + "..." if len(assessment) > 400 else assessment,
            ])            # Document type
            doc_id = llm.get('document_identification', {})
            if doc_id and doc_id.get('document_type'):
                lines.append(f"\nDocument Type: {doc_id.get('document_type', 'Unknown')}")
            
            # Key forensic correlation
            correlation = llm.get('forensic_visual_correlation', {})
            if correlation and correlation.get('overall_correlation'):
                lines.extend([
                    "",
                    "KEY FINDING:",
                    correlation['overall_correlation'][:300] + "..." if len(correlation['overall_correlation']) > 300 else correlation['overall_correlation'],
                ])
            
            # Skip region-by-region (covered in tampering regions below)
            
            # Tampered regions (compact)
            tampering_regions = llm.get('tampering_regions', [])
            if tampering_regions:
                lines.extend([
                    "",
                    f"TAMPERED REGIONS ({len(tampering_regions)} found):",
                    "-" * 85,
                ])
                
                for idx, region in enumerate(tampering_regions[:5], 1):  # Limit to 5
                    lines.extend([
                        f"\n#{idx}. {region.get('exact_location', 'Unknown')} [{region.get('confidence_this_region', '?')}%]",
                        f"    Method: {region.get('suspected_tampering_method', 'Unknown')}",
                        f"    Evidence: {region.get('visual_description', 'N/A')[:150]}...",
                    ])
                    
                    anomalies = region.get('specific_anomalies', [])
                    if anomalies:
                        lines.append(f"    Issues: {', '.join(anomalies[:3])}")
            
            # Technique
            technique = llm.get('tampering_technique_identification', {})
            if technique and technique.get('primary_method'):
                lines.append(f"\nTechnique: {technique['primary_method']} ({technique.get('skill_level_assessment', 'Unknown')} skill)")
            
            # Detailed reasoning (truncated)
            reasoning = llm.get('detailed_reasoning', '')
            if reasoning and len(reasoning) > 200:
                lines.extend([
                    "",
                    "DETAILED ANALYSIS:",
                    reasoning[:600] + "..." if len(reasoning) > 600 else reasoning,
                ])
            
            # clearForensic images location
            lines.append(f"\nForensic Images: {page_result['forensic_analysis']['forensic_output_dir']}")
        
        lines.extend([
            f"\n{'='*85}",
            "Report combines mathematical forensics (ELA, RGB, variance) + AI vision analysis",
            f"{'='*85}",
        ])
        
        report_text = "\n".join(lines)
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(report_text)
        
        print(f"\n✓ Text report saved: {report_path}")
        print(f"✓ JSON results saved: {json_path}")
        
        return str(report_path)


def main():
    parser = argparse.ArgumentParser(
        description='Integrated Document Tampering Detection (Forensics + LLM)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Analyze a single document
  python integrated_tampering_detector.py document.pdf
  
  # Analyze with specific region of interest
  python integrated_tampering_detector.py screenshot.png --bbox "100,200,300,250"
  
  # Specify output directory
  python integrated_tampering_detector.py document.jpg --output my_reports/
        """
    )
    
    parser.add_argument(
        'file',
        help='Path to document file (PDF, JPG, PNG, etc.)'
    )
    
    parser.add_argument(
        '--bbox', '-b',
        default=None,
        help='Optional bounding box for suspicious region: x1,y1,x2,y2'
    )
    
    parser.add_argument(
        '--output', '-o',
        default='integrated_reports',
        help='Output directory for reports (default: integrated_reports)'
    )
    
    args = parser.parse_args()
    
    # Initialize detector
    detector = IntegratedTamperingDetector(output_dir=args.output)
    
    # Analyze document
    print(f"\n{'='*100}")
    print("INTEGRATED TAMPERING DETECTION SYSTEM")
    print("Combining Mathematical Forensics + AI Vision Analysis")
    print(f"{'='*100}")
    
    results = detector.analyze_document(args.file, args.bbox)
    
    if 'error' in results:
        print(f"\n❌ Error: {results['error']}")
        sys.exit(1)
    
    # Generate report
    report_path = detector.generate_report(results)
    
    # Print summary
    print(f"\n{'='*100}")
    print("ANALYSIS COMPLETE")
    print(f"{'='*100}")
    print(f"\nFinal Verdict: {results['page_analyses'][0]['integrated_verdict']['verdict']}")
    print(f"Risk Level: {results['page_analyses'][0]['integrated_verdict']['risk_level']}")
    print(f"Combined Score: {results['page_analyses'][0]['integrated_verdict']['combined_score']:.3f}")
    print(f"\nDetailed report saved: {report_path}")
    print(f"{'='*100}\n")


if __name__ == "__main__":
    main()
