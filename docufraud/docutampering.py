#!/usr/bin/env python3
"""
Document Tampering Detection System
Uses LLM reasoning with Azure OpenAI Vision to detect document tampering, forgery, and manipulation
"""

import os
import sys
import json
import base64
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import fitz  # PyMuPDF
import tempfile
from openai import AzureOpenAI
from PIL import Image, ImageStat
import imagehash

# Add parent directory to path for config import
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import AzureOpenAIConfig, get_openai_client
from prompt_manager import (
    get_tampering_detection_prompt, 
    get_tampering_detection_system_prompt,
    get_multi_document_comparison_prompt,
    get_multi_document_comparison_system_prompt
)

# Initialize Azure OpenAI client
client = get_openai_client()


class DocumentTamperingDetector:
    """Advanced document tampering detection using LLM reasoning and image analysis"""
    
    def __init__(self, output_dir: str = "tampering_reports"):
        """Initialize the tampering detector"""
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.temp_dir = Path(tempfile.gettempdir()) / "tampering_analysis"
        self.temp_dir.mkdir(exist_ok=True)
        
    def encode_image(self, image_path: str) -> str:
        """Encode image to base64 string"""
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')
    
    def convert_pdf_to_images(self, pdf_path: str) -> List[str]:
        """Convert PDF pages to images"""
        doc = fitz.open(pdf_path)
        image_paths = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x zoom for better quality
            
            image_path = self.temp_dir / f"page_{page_num + 1}.png"
            pix.save(str(image_path))
            image_paths.append(str(image_path))
        
        doc.close()
        return image_paths
    
    def calculate_image_metrics(self, image_path: str) -> Dict[str, Any]:
        """Calculate various image quality and consistency metrics"""
        try:
            img = Image.open(image_path)
            
            # Calculate statistics
            stat = ImageStat.Stat(img)
            
            # Calculate perceptual hash for similarity detection
            phash = str(imagehash.phash(img))
            dhash = str(imagehash.dhash(img))
            
            metrics = {
                'width': img.width,
                'height': img.height,
                'mode': img.mode,
                'format': img.format,
                'mean_brightness': sum(stat.mean) / len(stat.mean),
                'stddev': sum(stat.stddev) / len(stat.stddev),
                'perceptual_hash': phash,
                'difference_hash': dhash,
                'entropy': img.entropy() if hasattr(img, 'entropy') else None
            }
            
            return metrics
        except Exception as e:
            return {'error': str(e)}
    
    def extract_metadata(self, file_path: str) -> Dict[str, Any]:
        """Extract file and image metadata"""
        metadata = {
            'file_name': os.path.basename(file_path),
            'file_size': os.path.getsize(file_path),
            'file_extension': Path(file_path).suffix,
            'creation_time': datetime.fromtimestamp(os.path.getctime(file_path)).isoformat(),
            'modification_time': datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat(),
        }
        
        # Calculate file hash
        with open(file_path, 'rb') as f:
            file_hash = hashlib.sha256(f.read()).hexdigest()
            metadata['sha256_hash'] = file_hash
        
        # Try to extract image metadata
        if file_path.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif')):
            try:
                img = Image.open(file_path)
                exif_data = img.getexif()
                if exif_data:
                    metadata['exif_data'] = {k: str(v) for k, v in exif_data.items()}
                metadata['image_metrics'] = self.calculate_image_metrics(file_path)
            except Exception as e:
                metadata['metadata_extraction_error'] = str(e)
        
        return metadata
    
    def analyze_with_llm_reasoning(self, image_path: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Use LLM reasoning to detect tampering indicators"""
        
        base64_image = self.encode_image(image_path)
        
        # Get prompts from prompt manager
        metadata_str = json.dumps(metadata, indent=2)
        analysis_prompt = get_tampering_detection_prompt(metadata=metadata_str)
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
                            {
                                "type": "text",
                                "text": analysis_prompt
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}"
                                }
                            }
                        ]
                    }
                ],
                temperature=0.1,  # Low temperature for consistent, factual analysis
                max_completion_tokens=4000,
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
    
    def perform_multi_document_comparison(self, image_paths: List[str]) -> Dict[str, Any]:
        """Compare multiple documents or pages for consistency"""
        
        if len(image_paths) < 2:
            return {'comparison': 'Not applicable - single document'}
        
        # Get prompts from prompt manager
        comparison_prompt = get_multi_document_comparison_prompt(len(image_paths))
        system_prompt = get_multi_document_comparison_system_prompt()

        # Encode all images
        encoded_images = []
        for img_path in image_paths[:5]:  # Limit to 5 for API constraints
            try:
                encoded_images.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{self.encode_image(img_path)}"
                    }
                })
            except Exception as e:
                print(f"Warning: Could not encode {img_path}: {e}")
        
        if not encoded_images:
            return {'error': 'No images could be encoded for comparison'}
        
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
                            {"type": "text", "text": comparison_prompt}
                        ] + encoded_images
                    }
                ],
                temperature=0.1,
                max_completion_tokens=3000,
                response_format={"type": "json_object"}
            )
            
            comparison_text = response.choices[0].message.content
            return json.loads(comparison_text)
            
        except Exception as e:
            return {'error': f"Comparison analysis failed: {str(e)}"}
    
    def generate_tampering_report(self, results: Dict[str, Any], output_path: str):
        """Generate a comprehensive tampering detection report"""
        
        report_lines = [
            "=" * 80,
            "DOCUMENT TAMPERING DETECTION REPORT",
            "=" * 80,
            f"\nGenerated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"Document: {results.get('document_name', 'Unknown')}",
            "\n" + "=" * 80,
            "\n## EXECUTIVE SUMMARY",
            "-" * 80
        ]
        
        # Overall assessment
        for doc_analysis in results.get('document_analyses', []):
            tampering = doc_analysis.get('tampering_detected', False)
            confidence = doc_analysis.get('confidence_score', 0)
            risk = doc_analysis.get('risk_level', 'UNKNOWN')
            
            report_lines.extend([
                f"\nDocument: {doc_analysis.get('document_name', 'Unknown')}",
                f"Tampering Detected: {'YES âš ï¸' if tampering else 'NO âœ“'}",
                f"Confidence Score: {confidence}%",
                f"Risk Level: {risk}",
                f"\n{doc_analysis.get('overall_assessment', 'No assessment available')}"
            ])
        
        # Detailed findings
        report_lines.extend([
            "\n\n" + "=" * 80,
            "## DETAILED FINDINGS",
            "=" * 80
        ])
        
        for idx, doc_analysis in enumerate(results.get('document_analyses', []), 1):
            report_lines.append(f"\n### Document {idx}: {doc_analysis.get('document_name', 'Unknown')}")
            report_lines.append("-" * 80)
            
            # Anomalies
            anomalies = doc_analysis.get('detected_anomalies', [])
            if anomalies:
                report_lines.append("\n#### Detected Anomalies:")
                for anomaly in anomalies:
                    report_lines.extend([
                        f"\nâ€¢ Category: {anomaly.get('category', 'Unknown')}",
                        f"  Severity: {anomaly.get('severity', 'Unknown')}",
                        f"  Issue: {anomaly.get('issue', 'N/A')}",
                        f"  Location: {anomaly.get('location', 'N/A')}",
                        f"  Evidence: {anomaly.get('evidence', 'N/A')}"
                    ])
            
            # Red flags
            red_flags = doc_analysis.get('red_flags', [])
            if red_flags:
                report_lines.append("\n#### Red Flags:")
                for flag in red_flags:
                    report_lines.append(f"â€¢ {flag}")
            
            # Authenticity indicators
            auth_indicators = doc_analysis.get('authenticity_indicators', [])
            if auth_indicators:
                report_lines.append("\n#### Authenticity Indicators:")
                for indicator in auth_indicators:
                    report_lines.append(f"â€¢ {indicator}")
            
            # Technical findings
            tech_findings = doc_analysis.get('technical_findings', {})
            if tech_findings:
                report_lines.append("\n#### Technical Analysis:")
                for key, value in tech_findings.items():
                    report_lines.append(f"â€¢ {key.replace('_', ' ').title()}: {value}")
            
            # Metadata
            metadata = doc_analysis.get('metadata', {})
            if metadata:
                report_lines.append("\n#### Metadata:")
                for key, value in metadata.items():
                    if key not in ['exif_data', 'image_metrics']:
                        report_lines.append(f"â€¢ {key.replace('_', ' ').title()}: {value}")
            
            # Recommendations
            recommendations = doc_analysis.get('recommendations', [])
            if recommendations:
                report_lines.append("\n#### Recommendations:")
                for rec in recommendations:
                    report_lines.append(f"â€¢ {rec}")
            
            # Detailed reasoning
            reasoning = doc_analysis.get('detailed_reasoning', '')
            if reasoning:
                report_lines.extend([
                    "\n#### Detailed Analysis:",
                    reasoning
                ])
        
        # Cross-document comparison
        comparison = results.get('cross_document_comparison', {})
        if comparison and 'error' not in comparison:
            report_lines.extend([
                "\n\n" + "=" * 80,
                "## CROSS-DOCUMENT COMPARISON",
                "=" * 80,
                f"\nConsistency Score: {comparison.get('consistency_score', 'N/A')}%",
                f"Documents Authentic Together: {comparison.get('documents_authentic_together', 'Unknown')}",
            ])
            
            inconsistencies = comparison.get('inconsistencies_found', [])
            if inconsistencies:
                report_lines.append("\n### Inconsistencies Found:")
                for inc in inconsistencies:
                    report_lines.append(f"â€¢ {inc}")
            
            variations = comparison.get('suspicious_variations', [])
            if variations:
                report_lines.append("\n### Suspicious Variations:")
                for var in variations:
                    report_lines.append(f"â€¢ {var}")
            
            if comparison.get('recommendation'):
                report_lines.append(f"\n### Recommendation:\n{comparison['recommendation']}")
        
        # Final recommendations
        report_lines.extend([
            "\n\n" + "=" * 80,
            "## FINAL VERDICT",
            "=" * 80,
            "\n" + results.get('final_verdict', 'Analysis completed. Review detailed findings above.'),
            "\n" + "=" * 80
        ])
        
        # Write report
        report_text = "\n".join(report_lines)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(report_text)
        
        print(f"\nâœ“ Report saved: {output_path}")
        return report_text
    
    def analyze_document(self, file_path: str, document_name: Optional[str] = None) -> Dict[str, Any]:
        """Analyze a single document for tampering"""
        
        print(f"\n{'='*80}")
        print(f"Analyzing: {file_path}")
        print(f"{'='*80}")
        
        if not os.path.exists(file_path):
            return {'error': f'File not found: {file_path}'}
        
        document_name = document_name or os.path.basename(file_path)
        
        # Extract metadata
        print("Extracting metadata...")
        metadata = self.extract_metadata(file_path)
        
        # Convert PDF to images if needed
        if file_path.lower().endswith('.pdf'):
            print("Converting PDF to images...")
            image_paths = self.convert_pdf_to_images(file_path)
        else:
            image_paths = [file_path]
        
        # Analyze each page/image
        document_analyses = []
        for idx, img_path in enumerate(image_paths, 1):
            print(f"\nAnalyzing page/image {idx}/{len(image_paths)}...")
            
            # Get image-specific metrics if not already in metadata
            if img_path != file_path:
                page_metadata = {
                    **metadata,
                    'page_number': idx,
                    'image_metrics': self.calculate_image_metrics(img_path)
                }
            else:
                page_metadata = metadata
            
            # Perform LLM reasoning analysis
            analysis = self.analyze_with_llm_reasoning(img_path, page_metadata)
            analysis['document_name'] = f"{document_name} (Page {idx})" if len(image_paths) > 1 else document_name
            analysis['metadata'] = page_metadata
            
            document_analyses.append(analysis)
            
            print(f"  Tampering Detected: {'YES âš ï¸' if analysis.get('tampering_detected') else 'NO âœ“'}")
            print(f"  Confidence: {analysis.get('confidence_score', 0)}%")
            print(f"  Risk Level: {analysis.get('risk_level', 'UNKNOWN')}")
        
        # Perform cross-document comparison if multiple pages
        cross_comparison = {}
        if len(image_paths) > 1:
            print("\nPerforming cross-document consistency analysis...")
            cross_comparison = self.perform_multi_document_comparison(image_paths)
        
        # Determine final verdict
        any_tampering = any(d.get('tampering_detected', False) for d in document_analyses)
        max_risk = max((d.get('risk_level', 'NONE') for d in document_analyses), 
                      key=lambda x: ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].index(x))
        
        if any_tampering:
            final_verdict = f"âš ï¸ TAMPERING DETECTED - Risk Level: {max_risk}\n\nThis document shows signs of manipulation or forgery. Further investigation is recommended."
        else:
            final_verdict = "âœ“ NO TAMPERING DETECTED\n\nThe document appears authentic based on the analysis. However, this should not be considered a definitive authentication without additional verification."
        
        results = {
            'document_name': document_name,
            'file_path': file_path,
            'analysis_timestamp': datetime.now().isoformat(),
            'document_analyses': document_analyses,
            'cross_document_comparison': cross_comparison,
            'final_verdict': final_verdict,
            'summary': {
                'tampering_detected': any_tampering,
                'highest_risk_level': max_risk,
                'pages_analyzed': len(image_paths),
                'total_anomalies': sum(len(d.get('detected_anomalies', [])) for d in document_analyses)
            }
        }
        
        return results
    
    def analyze_multiple_documents(self, file_paths: List[str]) -> Dict[str, Any]:
        """Analyze multiple related documents"""
        
        print(f"\n{'='*80}")
        print(f"ANALYZING {len(file_paths)} DOCUMENTS")
        print(f"{'='*80}")
        
        all_results = []
        all_image_paths = []
        
        for file_path in file_paths:
            result = self.analyze_document(file_path)
            all_results.append(result)
            
            # Collect image paths for cross-analysis
            if file_path.lower().endswith('.pdf'):
                all_image_paths.extend(self.convert_pdf_to_images(file_path)[:1])  # First page
            else:
                all_image_paths.append(file_path)
        
        # Perform overall comparison
        print("\nPerforming comprehensive cross-document analysis...")
        overall_comparison = self.perform_multi_document_comparison(all_image_paths)
        
        return {
            'individual_analyses': all_results,
            'overall_comparison': overall_comparison,
            'analysis_timestamp': datetime.now().isoformat(),
            'total_documents': len(file_paths)
        }


def main():
    """Main function for command-line usage"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Document Tampering Detection using LLM Reasoning',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Analyze a single document
  python docutampering.py document.pdf
  
  # Analyze multiple documents
  python docutampering.py doc1.pdf doc2.jpg doc3.png
  
  # Specify output directory
  python docutampering.py document.pdf --output reports/
        """
    )
    
    parser.add_argument(
        'files',
        nargs='+',
        help='Path(s) to document file(s) to analyze (PDF, JPG, PNG, etc.)'
    )
    
    parser.add_argument(
        '--output',
        '-o',
        default='tampering_reports',
        help='Output directory for reports (default: tampering_reports)'
    )
    
    args = parser.parse_args()
    
    # Initialize detector
    detector = DocumentTamperingDetector(output_dir=args.output)
    
    # Analyze document(s)
    if len(args.files) == 1:
        # Single document analysis
        results = detector.analyze_document(args.files[0])
        
        # Generate report
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        report_path = detector.output_dir / f"tampering_report_{timestamp}.txt"
        detector.generate_tampering_report(results, str(report_path))
        
        # Save JSON results
        json_path = detector.output_dir / f"tampering_report_{timestamp}.json"
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        print(f"âœ“ JSON results saved: {json_path}")
        
    else:
        # Multiple documents analysis
        results = detector.analyze_multiple_documents(args.files)
        
        # Generate individual reports
        for idx, individual_result in enumerate(results['individual_analyses'], 1):
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            report_path = detector.output_dir / f"tampering_report_doc{idx}_{timestamp}.txt"
            detector.generate_tampering_report(individual_result, str(report_path))
        
        # Save combined JSON
        json_path = detector.output_dir / f"tampering_report_combined_{timestamp}.json"
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        print(f"âœ“ Combined JSON results saved: {json_path}")
    
    print(f"\n{'='*80}")
    print("ANALYSIS COMPLETE")
    print(f"{'='*80}")


if __name__ == "__main__":
    main()
