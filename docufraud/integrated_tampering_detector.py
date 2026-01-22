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
from scipy import ndimage
import fitz  # PyMuPDF

# Add parent directory to path for config import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config import AzureOpenAIConfig, get_openai_client
from prompt_manager import get_integrated_tampering_detection_prompt, get_tampering_detection_system_prompt

# Initialize Azure OpenAI client from environment
client = get_openai_client()


class ForensicAnalyzer:
    """Mathematical and forensic analysis functions with advanced computer vision"""
    
    def __init__(self, is_scanned_document=False):
        self.is_scanned_document = is_scanned_document
        self.ela_threshold = 25
        self.min_region_area = 300
        self.noise_sensitivity = 1.0
    
    @staticmethod
    def ensure_outdir(base="out"):
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        out = f"{base}_{ts}"
        os.makedirs(out, exist_ok=True)
        return out
    
    def detect_ela(self, image_path, quality=90):
        """Error Level Analysis - Detects JPEG compression inconsistencies"""
        original = Image.open(image_path).convert('RGB')
        
        buffer = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
        temp_path = buffer.name
        buffer.close()
        
        original.save(temp_path, format='JPEG', quality=quality)
        compressed = Image.open(temp_path)
        
        original_np = np.array(original).astype(np.float32)
        compressed_np = np.array(compressed).astype(np.float32)
        
        ela = np.abs(original_np - compressed_np) * 15
        ela = np.clip(ela, 0, 255).astype(np.uint8)
        
        try:
            os.remove(temp_path)
        except:
            pass
        
        return ela
    
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
    
    def detect_local_noise_anomaly(self, image):
        """Detect local noise anomalies - areas with different noise characteristics"""
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32)
        else:
            gray = image.astype(np.float32)
        
        kernel_size = 15
        local_mean = cv2.blur(gray, (kernel_size, kernel_size))
        local_sq_mean = cv2.blur(gray**2, (kernel_size, kernel_size))
        local_var = local_sq_mean - local_mean**2
        local_std = np.sqrt(np.maximum(local_var, 0))
        
        global_std = np.std(gray)
        
        low_noise_mask = local_std < (global_std * 0.3)
        high_noise_mask = local_std > (global_std * 2.0)
        
        anomaly_map = np.zeros_like(gray)
        anomaly_map[low_noise_mask] = 255
        anomaly_map[high_noise_mask] = 200
        
        return anomaly_map.astype(np.uint8), local_std
    
    def detect_color_inconsistency(self, image):
        """Detect color/saturation inconsistencies that indicate editing"""
        if len(image.shape) != 3:
            return None
        
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV).astype(np.float32)
        saturation = hsv[:, :, 1]
        
        kernel_size = 21
        local_mean = cv2.blur(saturation, (kernel_size, kernel_size))
        local_sq_mean = cv2.blur(saturation**2, (kernel_size, kernel_size))
        local_var = local_sq_mean - local_mean**2
        
        uniform_sat = local_var < 50
        
        hue = hsv[:, :, 0]
        hue_local_mean = cv2.blur(hue, (kernel_size, kernel_size))
        hue_local_sq_mean = cv2.blur(hue**2, (kernel_size, kernel_size))
        hue_local_var = hue_local_sq_mean - hue_local_mean**2
        
        uniform_hue = hue_local_var < 20
        suspicious = (uniform_sat & uniform_hue).astype(np.uint8) * 255
        
        return suspicious
    
    def detect_noise_inconsistency(self, image):
        """Detect noise pattern inconsistencies"""
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image
        
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        
        kernel_size = 5
        mean = cv2.blur(laplacian, (kernel_size, kernel_size))
        sqr_mean = cv2.blur(laplacian**2, (kernel_size, kernel_size))
        variance = sqr_mean - mean**2
        
        variance = np.abs(variance)
        variance = ((variance - variance.min()) / (variance.max() - variance.min() + 1e-8) * 255).astype(np.uint8)
        
        return variance
    
    def extract_tampered_regions_from_noise(self, noise_map, image, min_pixels=80):
        """Extract tampered regions from noise analysis map with adaptive thresholding"""
        from scipy import ndimage
        
        img_h, img_w = noise_map.shape[:2]
        
        global_mean = np.mean(noise_map)
        global_std = np.std(noise_map)
        
        base_threshold = 120
        if global_mean > 5:
            threshold = base_threshold + int((global_mean - 5) * 5)
        else:
            threshold = base_threshold
        threshold = min(threshold, 160)
        
        _, bright_mask = cv2.threshold(noise_map, threshold, 255, cv2.THRESH_BINARY)
        
        kernel = np.ones((10, 10), np.uint8)
        bright_mask = cv2.morphologyEx(bright_mask, cv2.MORPH_CLOSE, kernel)
        
        labeled, num_features = ndimage.label(bright_mask)
        
        regions = []
        
        for i in range(1, num_features + 1):
            region_coords = np.where(labeled == i)
            pixel_count = len(region_coords[0])
            
            if pixel_count < min_pixels:
                continue
            
            y1, y2 = np.min(region_coords[0]), np.max(region_coords[0])
            x1, x2 = np.min(region_coords[1]), np.max(region_coords[1])
            x, y = x1, y1
            w, h = x2 - x1 + 1, y2 - y1 + 1
            
            if x < 5 or y < 5 or (x + w) > (img_w - 5) or (y + h) > (img_h - 5):
                continue
            
            if pixel_count > (img_h * img_w * 0.15):
                continue
            
            region_values = noise_map[region_coords]
            region_mean = np.mean(region_values)
            
            intensity_ratio = region_mean / (global_mean + 1e-8)
            
            is_high_ratio = intensity_ratio >= 17
            is_medium_ratio_large_region = intensity_ratio >= 12 and pixel_count >= 500
            
            if not (is_high_ratio or is_medium_ratio_large_region):
                continue
            
            confidence = min((region_mean - global_mean) / (255 - global_mean + 1e-8), 1.0)
            
            regions.append({
                'x': int(x), 'y': int(y), 'width': int(w), 'height': int(h),
                'area': int(pixel_count),
                'center': (int(x + w//2), int(y + h//2)),
                'intensity': float(region_mean),
                'intensity_ratio': float(intensity_ratio),
                'confidence': max(float(confidence), 0.7),
                'reasons': ['High noise variance (tampering indicator)']
            })
        
        regions.sort(key=lambda r: r['intensity'], reverse=True)
        
        return regions, bright_mask, {
            'global_mean': float(global_mean),
            'global_std': float(global_std),
            'threshold': int(threshold),
            'num_features': int(num_features)
        }
    
    def detect_copy_move(self, image):
        """Detect copy-move forgery using feature matching"""
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image
        
        orb = cv2.ORB_create(nfeatures=1000)
        keypoints, descriptors = orb.detectAndCompute(gray, None)
        
        if descriptors is None or len(keypoints) < 2:
            return None, []
        
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        matches = bf.knnMatch(descriptors, descriptors, k=2)
        
        suspicious_regions = []
        min_distance = 50
        
        for match_pair in matches:
            if len(match_pair) == 2:
                m, n = match_pair
                if m.distance < 0.75 * n.distance:
                    pt1 = keypoints[m.queryIdx].pt
                    pt2 = keypoints[m.trainIdx].pt
                    dist = np.sqrt((pt1[0] - pt2[0])**2 + (pt1[1] - pt2[1])**2)
                    if dist > min_distance:
                        suspicious_regions.append({
                            'point1': pt1,
                            'point2': pt2,
                            'confidence': 1 - (m.distance / 256)
                        })
        
        result_img = image.copy()
        for region in suspicious_regions[:20]:
            pt1 = tuple(map(int, region['point1']))
            pt2 = tuple(map(int, region['point2']))
            cv2.circle(result_img, pt1, 5, (0, 0, 255), -1)
            cv2.circle(result_img, pt2, 5, (0, 255, 0), -1)
            cv2.line(result_img, pt1, pt2, (255, 0, 0), 1)
        
        return result_img, suspicious_regions
    
    def detect_if_scanned(self, image):
        """Detect if the image is a scanned/photocopied document"""
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image
        
        indicators = {
            'is_scanned': False,
            'confidence': 0.0,
            'reasons': []
        }
        
        score = 0
        
        noise = cv2.Laplacian(gray, cv2.CV_64F)
        noise_std = np.std(noise)
        if 5 < noise_std < 30:
            score += 1
            indicators['reasons'].append("Uniform noise pattern consistent with scanning")
        
        edges = cv2.Canny(gray, 50, 150)
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, 100, minLineLength=100, maxLineGap=10)
        if lines is not None and len(lines) > 10:
            score += 1
            indicators['reasons'].append("Document structure detected")
        
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        white_ratio = np.sum(binary == 255) / binary.size
        if white_ratio > 0.3:
            score += 1
            indicators['reasons'].append("Paper-like background detected")
        
        indicators['confidence'] = min(score / 3.0, 1.0)
        indicators['is_scanned'] = score >= 2
        
        return indicators
    
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
    
    def __init__(self, output_dir: str = "integrated_reports", is_scanned_document: bool = False):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.forensic = ForensicAnalyzer(is_scanned_document=is_scanned_document)
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
        """Perform comprehensive mathematical forensic analysis"""
        print(f"\nPerforming advanced forensic analysis on: {image_path}")
        
        # Create forensic output directory
        forensic_outdir = self.forensic.ensure_outdir(str(self.output_dir / "forensic"))
        
        # Load image
        img_pil = Image.open(image_path).convert("RGB")
        npimg = np.array(img_pil)
        gray = cv2.cvtColor(npimg, cv2.COLOR_RGB2GRAY)
        image_bgr = cv2.cvtColor(npimg, cv2.COLOR_RGB2BGR)
        
        # 1. Detect if scanned document
        print("  [1/6] Detecting document type...")
        scan_info = self.forensic.detect_if_scanned(image_bgr)
        if scan_info['is_scanned']:
            print(f"    ✓ SCANNED DOCUMENT (confidence: {scan_info['confidence']*100:.0f}%)")
            self.forensic.is_scanned_document = True
        else:
            print("    ✓ Digital/original image")
        
        # 2. Noise Analysis (PRIMARY detection method)
        print("  [2/6] Running noise analysis...")
        noise_map = self.forensic.detect_noise_inconsistency(image_bgr)
        noise_path = os.path.join(forensic_outdir, "noise_analysis.png")
        cv2.imwrite(noise_path, noise_map)
        
        # 3. Extract tampered regions from noise
        print("  [3/6] Extracting tampered regions...")
        tampered_regions, noise_binary, noise_stats = self.forensic.extract_tampered_regions_from_noise(
            noise_map, image_bgr, min_pixels=80
        )
        noise_regions_path = os.path.join(forensic_outdir, "noise_regions.png")
        cv2.imwrite(noise_regions_path, noise_binary)
        print(f"    Found {len(tampered_regions)} tampered regions")
        
        # 4. Error Level Analysis
        print("  [4/6] Running ELA...")
        ela_arr = self.forensic.detect_ela(image_path, quality=90)
        ela_path = os.path.join(forensic_outdir, "ela.png")
        cv2.imwrite(ela_path, ela_arr)
        
        # 5. Copy-Move Detection
        print("  [5/6] Detecting copy-move...")
        copy_move_img, copy_move_regions = self.forensic.detect_copy_move(image_bgr)
        if copy_move_img is not None:
            copy_move_path = os.path.join(forensic_outdir, "copy_move.png")
            cv2.imwrite(copy_move_path, copy_move_img)
        
        # 6. Local noise anomaly
        print("  [6/6] Analyzing local noise anomalies...")
        noise_anomaly, local_std = self.forensic.detect_local_noise_anomaly(image_bgr)
        anomaly_path = os.path.join(forensic_outdir, "noise_anomaly.png")
        cv2.imwrite(anomaly_path, noise_anomaly)
        
        # Color inconsistency
        color_inconsistency = self.forensic.detect_color_inconsistency(image_bgr)
        if color_inconsistency is not None:
            color_path = os.path.join(forensic_outdir, "color_inconsistency.png")
            cv2.imwrite(color_path, color_inconsistency)
        
        # Calculate forensic score based on findings
        score = 0.0
        reasons = []
        
        # Primary indicator: tampered regions from noise analysis
        if len(tampered_regions) > 0:
            score += min(len(tampered_regions) * 0.3, 0.6)
            reasons.append(f"Detected {len(tampered_regions)} tampered regions via noise analysis")
            for region in tampered_regions[:3]:
                reasons.append(f"  Region at ({region['x']},{region['y']}) - intensity ratio: {region['intensity_ratio']:.1f}")
        
        # Copy-move indicator
        if len(copy_move_regions) > 10:
            score += 0.2
            reasons.append(f"Copy-move indicators: {len(copy_move_regions)} suspicious matches")
        
        # ELA analysis
        ela_hot = np.mean(ela_arr > 30)
        if ela_hot > 0.02:
            score += 0.15
            reasons.append(f"ELA hot pixels: {ela_hot*100:.2f}%")
        
        # Cap score at 1.0
        score = min(score, 1.0)
        
        return {
            'forensic_score': score,
            'forensic_verdict': 'LIKELY TAMPERED' if score > 0.45 else 'LIKELY ORIGINAL',
            'forensic_reasons': reasons,
            'forensic_metrics': {
                'ela_hot_pixels_ratio': ela_hot,
                'tampered_regions_count': len(tampered_regions),
                'copy_move_matches': len(copy_move_regions),
                'noise_threshold': noise_stats['threshold'],
                'noise_global_mean': noise_stats['global_mean']
            },
            'tampered_regions': tampered_regions,
            'copy_move_regions': copy_move_regions,
            'scan_info': scan_info,
            'forensic_output_dir': forensic_outdir,
            'forensic_images': {
                'ela': ela_path,
                'noise_analysis': noise_path,
                'noise_regions': noise_regions_path,
                'noise_anomaly': anomaly_path,
                'copy_move': os.path.join(forensic_outdir, "copy_move.png") if copy_move_img is not None else None
            }
        }
    
    def analyze_with_llm_reasoning(self, image_path: str, forensic_results: Dict[str, Any]) -> Dict[str, Any]:
        """Use LLM reasoning enhanced with comprehensive forensic data"""
        
        base64_image = self.encode_image(image_path)
        
        # Create detailed forensic summary
        tampered_regions_summary = ""
        if forensic_results.get('tampered_regions'):
            tampered_regions_summary = "\n\nDETECTED TAMPERING REGIONS (from noise analysis):\n"
            for i, region in enumerate(forensic_results['tampered_regions'][:5], 1):
                tampered_regions_summary += f"""
Region {i} at ({region['x']}, {region['y']}), size {region['width']}x{region['height']}:
  - Confidence: {region['confidence']*100:.0f}%
  - Intensity Ratio: {region['intensity_ratio']:.1f}x (threshold: 17x)
  - Area: {region['area']} pixels
  - Evidence: {', '.join(region.get('reasons', []))}
"""
        
        scan_status = "SCANNED DOCUMENT" if forensic_results.get('scan_info', {}).get('is_scanned') else "Digital Image"
        
        forensic_summary = f"""
ADVANCED FORENSIC ANALYSIS RESULTS:
- Document Type: {scan_status}
- Forensic Score: {forensic_results['forensic_score']:.3f} (0=clean, 1=tampered)
- Verdict: {forensic_results['forensic_verdict']}
- Tampered Regions Found: {forensic_results['forensic_metrics']['tampered_regions_count']}
- ELA Hot Pixels: {forensic_results['forensic_metrics']['ela_hot_pixels_ratio']*100:.2f}%
- Copy-Move Matches: {forensic_results['forensic_metrics']['copy_move_matches']}
- Noise Analysis Threshold: {forensic_results['forensic_metrics']['noise_threshold']}

Forensic Indicators:
{chr(10).join('- ' + r for r in forensic_results['forensic_reasons']) if forensic_results['forensic_reasons'] else '- No strong forensic signals detected'}
{tampered_regions_summary}
"""
        
        # Get prompts from prompt manager
        analysis_prompt = get_integrated_tampering_detection_prompt(
            forensic_summary=forensic_summary,
            ela_hot_pixels=f"{forensic_results['forensic_metrics']['ela_hot_pixels_ratio']*100:.2f}",
            tampered_regions_count=str(forensic_results['forensic_metrics']['tampered_regions_count']),
            copy_move_matches=str(forensic_results['forensic_metrics']['copy_move_matches']),
            noise_threshold=str(forensic_results['forensic_metrics']['noise_threshold'])
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
                max_completion_tokens=16000,
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
            print(f"  Forensic Score: {forensic_results['forensic_score']:.3f}")
            
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
        
        # Agreement check - both must agree for high confidence
        forensic_says_tampered = forensic_score > 0.45
        llm_says_tampered = llm_tampering and llm_confidence > 0.5
        
        # If they agree, use combined score; if they disagree, be conservative
        if forensic_says_tampered == llm_says_tampered:
            # Agreement - use weighted average
            agreement = 'AGREE'
            if llm_says_tampered:
                combined_score = (forensic_score * 0.5 + llm_confidence * 0.5)
            else:
                combined_score = (forensic_score * 0.5 + (1 - llm_confidence) * 0.5) * 0.5  # Low score when both say clean
        else:
            # Disagreement - be conservative, lean toward "needs review"
            agreement = 'DISAGREE'
            combined_score = (forensic_score + llm_confidence) / 2  # Simple average
            # Cap at medium confidence when disagreement
            combined_score = min(combined_score, 0.6)
        
        # Determine final verdict based on agreement and scores
        if agreement == 'AGREE' and forensic_says_tampered and llm_says_tampered:
            if combined_score > 0.7:
                verdict = "TAMPERING DETECTED - HIGH CONFIDENCE"
                risk = "CRITICAL"
            else:
                verdict = "LIKELY TAMPERED"
                risk = "HIGH"
        elif agreement == 'DISAGREE':
            # When forensic and AI disagree, require human review
            verdict = "INCONCLUSIVE - REQUIRES MANUAL REVIEW"
            risk = "MEDIUM"
        elif combined_score > 0.35:
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
            'agreement': agreement,
            'forensic_verdict': 'TAMPERED' if forensic_says_tampered else 'ORIGINAL',
            'llm_verdict': 'TAMPERED' if llm_says_tampered else 'ORIGINAL'
        }
    
    def _create_summary(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Create summary of all analyses"""
        
        # Check if any page has tampering detected or is inconclusive
        def page_has_issues(r):
            verdict = r['integrated_verdict'].get('verdict', '')
            llm_detected = r['llm_analysis'].get('tampering_detected', False)
            forensic_score = r['forensic_analysis']['forensic_score']
            # Tampering if: high combined score, OR inconclusive, OR LLM detected with high confidence
            return (
                r['integrated_verdict']['combined_score'] > 0.5 or
                'INCONCLUSIVE' in verdict or
                (llm_detected and r['llm_analysis'].get('confidence_score', 0) >= 60)
            )
        
        tampering_detected = any(page_has_issues(r) for r in results)
        
        # Determine summary status text
        any_inconclusive = any('INCONCLUSIVE' in r['integrated_verdict'].get('verdict', '') for r in results)
        if any_inconclusive:
            status_text = 'INCONCLUSIVE - MANUAL REVIEW REQUIRED'
        elif tampering_detected:
            status_text = 'TAMPERING DETECTED'
        else:
            status_text = 'NO TAMPERING DETECTED'
        
        max_risk = max((r['integrated_verdict']['risk_level'] for r in results),
                      key=lambda x: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].index(x))
        
        total_anomalies = sum(
            len(r['llm_analysis'].get('detected_anomalies', [])) for r in results
        )
        
        return {
            'tampering_detected': tampering_detected,
            'status_text': status_text,
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
                f"FORENSIC [{page_result['forensic_analysis']['forensic_score']:.2f}]: ELA {fmetrics['ela_hot_pixels_ratio']*100:.1f}% | Tampered Regions: {fmetrics['tampered_regions_count']} | Copy-Move: {fmetrics['copy_move_matches']} | Noise Threshold: {fmetrics['noise_threshold']}",
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
