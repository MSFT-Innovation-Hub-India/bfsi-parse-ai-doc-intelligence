#!/usr/bin/env python3
"""
doc_tamper_detector.py

Detect likely edits in screenshots of documents using multiple forensic signals:
 - Error Level Analysis (ELA)
 - RGB channel inconsistency maps
 - Local variance / noise map
 - SSIM (structural similarity) vs a blurred version
 - OCR-based field mismatch (optional; requires pytesseract + Tesseract)

Usage:
    python doc_tamper_detector.py --image path/to/screenshot.png --bbox "x1,y1,x2,y2"
    --bbox is optional: if you know the region (e.g. name box) put coordinates; otherwise whole-image analysis runs.

Outputs: prints summary, writes diagnostic images to ./out_{timestamp}/
"""

import os
import sys
import argparse
import math
import numpy as np
from PIL import Image, ImageChops, ImageFilter, ImageOps, ImageEnhance
import cv2
from skimage.metrics import structural_similarity as ssim
import pytesseract
import json
import datetime

# -------------------------
# Helper forensic functions
# -------------------------

def ensure_outdir(base="out"):
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    out = f"{base}_{ts}"
    os.makedirs(out, exist_ok=True)
    return out

def load_image(path):
    img = Image.open(path).convert("RGB")
    return img

def save_pil(img, path):
    img.save(path)

# 1) Error Level Analysis (ELA)
def ela_image(pil_img, quality=90):
    """
    Returns ELA image (PIL) and normalized numpy array 0..255
    """
    temp = ".__ela_temp.jpg"
    pil_img.save(temp, 'JPEG', quality=quality)
    reloaded = Image.open(temp).convert('RGB')
    ela = ImageChops.difference(pil_img, reloaded)
    # amplify
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

# 2) RGB channel difference map
def rgb_channel_map(npimg):
    """
    npimg: HxWx3 uint8
    returns channel variance / difference map (HxW float)
    """
    r,g,b = npimg[:,:,0].astype(int), npimg[:,:,1].astype(int), npimg[:,:,2].astype(int)
    # simple metric: std across channels
    stacked = np.stack([r,g,b], axis=2)
    std = np.std(stacked, axis=2)
    return std

# 3) Local variance / noise map
def local_variance_map(gray, ksize=9):
    """
    Compute local variance using a box filter
    """
    img = gray.astype(np.float32)
    mean = cv2.blur(img, (ksize,ksize))
    mean_sq = cv2.blur(img*img, (ksize,ksize))
    var = mean_sq - mean*mean
    var[var < 0] = 0
    return var

# 4) SSIM map vs blurred version (edited text often has different structural signature)
def ssim_map(gray):
    blurred = cv2.GaussianBlur(gray, (7,7), 0)
    # ssim from skimage returns scalar or full map? use windowed approach via slide
    # compute full-image SSIM using skimage (global) as a coarse measure:
    score = ssim(gray, blurred)
    return score

# 5) OCR text extraction (requires pytesseract & Tesseract installed)
def ocr_text(pil_img, lang='eng', config='--psm 6'):
    txt = pytesseract.image_to_string(pil_img, lang=lang, config=config)
    return txt

# 6) Region statistical comparison: compare suspicious region to adjacent text baseline
def compare_region_stats(npimg, bbox):
    x1,y1,x2,y2 = bbox
    H,W = npimg.shape[:2]
    # clamp
    x1,x2 = max(0,int(x1)), min(W,int(x2))
    y1,y2 = max(0,int(y1)), min(H,int(y2))
    region = npimg[y1:y2, x1:x2]
    # pick a baseline area just below region (if possible) of same size
    h = y2 - y1
    w = x2 - x1
    baseline_y1 = min(H - h, y2 + 5)
    baseline = npimg[baseline_y1:baseline_y1+h, x1:x1+w]
    if baseline.size == 0 or region.size == 0:
        return None
    # compute mean, std, local variance histograms
    reg_gray = cv2.cvtColor(region, cv2.COLOR_RGB2GRAY)
    bl_gray = cv2.cvtColor(baseline, cv2.COLOR_RGB2GRAY)
    stats = {
        "reg_mean": float(np.mean(reg_gray)),
        "reg_std": float(np.std(reg_gray)),
        "bl_mean": float(np.mean(bl_gray)),
        "bl_std": float(np.std(bl_gray)),
    }
    # difference metrics
    stats["mean_diff"] = abs(stats["reg_mean"] - stats["bl_mean"])
    stats["std_ratio"] = stats["reg_std"] / (stats["bl_std"] + 1e-6)
    # histogram correlation
    h_reg = cv2.calcHist([reg_gray],[0],None,[64],[0,256]).flatten()
    h_bl = cv2.calcHist([bl_gray],[0],None,[64],[0,256]).flatten()
    h_reg_norm = h_reg / (h_reg.sum()+1e-9)
    h_bl_norm = h_bl / (h_bl.sum()+1e-9)
    # histogram intersection
    hist_corr = float(np.sum(np.minimum(h_reg_norm, h_bl_norm)))
    stats["hist_intersection"] = hist_corr
    return stats

# Combined heuristic decision
def evaluate_scores(ela_arr, rgb_std, var_map, ssim_score, region_stats=None):
    """
    Returns a combined tamper_score 0..1 (higher = more likely tampered) and reasons
    """
    reasons = []
    # ELA: compute mean high-intensity fraction
    ela_thresh = 30
    ela_hot = np.mean(ela_arr > ela_thresh)
    if ela_hot > 0.02:
        reasons.append(f"ELA: notable differing compression regions ({ela_hot*100:.2f}% hot pixels)")
    # RGB std: mean std; high std can indicate unnatural channel mix for synthetic text
    mean_rgb_std = float(np.mean(rgb_std))
    if mean_rgb_std < 4:
        reasons.append("RGB: unusually low channel variance (flattened color channels)")
    if mean_rgb_std > 12:
        reasons.append("RGB: high channel variance (possible overlay from different source)")
    # local variance
    mean_var = float(np.mean(var_map))
    if mean_var < 10:
        reasons.append("Noise: image appears overly smooth (possible pasted/filled region)")
    if mean_var > 200:
        reasons.append("Noise: very high local variance (scan noise or heavy editing artifacts)")
    # ssim
    if ssim_score > 0.98:
        reasons.append("SSIM: nearly identical to blurred version (low texture) -> suspicious")
    if ssim_score < 0.85:
        reasons.append("SSIM: structural differences with blur (ok/normal)")
    # region stats
    reg_flag = False
    if region_stats is not None:
        if region_stats["mean_diff"] > 8 or region_stats["hist_intersection"] < 0.6 or region_stats["std_ratio"] < 0.6 or region_stats["std_ratio"] > 1.8:
            reasons.append("Region Stats: region differs statistically from nearby baseline (possible edit)")
            reg_flag = True
    # compute score from heuristics
    score = 0.0
    score += min(1.0, ela_hot * 10) * 0.25
    score += min(1.0, (mean_rgb_std/20.0)) * 0.2
    score += min(1.0, (abs(mean_var-50)/150.0)) * 0.2
    score += (1.0 - max(0.0, min(1.0, (ssim_score - 0.7)/0.3))) * 0.15  # lower ssim -> less suspicious here
    if reg_flag:
        score += 0.2
    score = max(0.0, min(1.0, score))
    return score, reasons

# -------------------------
# Main CLI routine
# -------------------------
def main():
    parser = argparse.ArgumentParser(description="Document tamper detector for screenshots")
    parser.add_argument("--image", "-i", required=True, help="Path to screenshot image")
    parser.add_argument("--bbox", "-b", default=None, help="Optional bbox of suspicious region x1,y1,x2,y2")
    parser.add_argument("--no-ocr", action="store_true", help="Skip OCR (if pytesseract not installed)")
    parser.add_argument("--out", default=None, help="Output folder prefix")
    args = parser.parse_args()

    outdir = ensure_outdir(args.out or "out")
    img_pil = load_image(args.image)
    W,H = img_pil.size
    print(f"Loaded image {args.image} size {W}x{H}. Outdir: {outdir}")

    # Convert to numpy
    npimg = np.array(img_pil)
    gray = cv2.cvtColor(npimg, cv2.COLOR_RGB2GRAY)

    # ELA
    ela_pil, ela_arr = ela_image(img_pil)
    ela_path = os.path.join(outdir, "ela.png")
    save_pil(ela_pil, ela_path)
    print(f"Saved ELA -> {ela_path}")

    # RGB std map
    rgb_std = rgb_channel_map(npimg)
    # normalize and save visualization
    rgb_vis = (255 * (rgb_std - rgb_std.min()) / (np.ptp(rgb_std)+1e-9)).astype(np.uint8)
    cv2.imwrite(os.path.join(outdir, "rgb_std.png"), rgb_vis)

    # local variance map
    var_map = local_variance_map(gray, ksize=9)
    var_vis = (255 * (var_map - var_map.min()) / (np.ptp(var_map)+1e-9)).astype(np.uint8)
    cv2.imwrite(os.path.join(outdir, "local_var.png"), var_vis)

    # ssim
    ssim_score = ssim_map(gray)
    print(f"SSIM vs blurred image (coarse) = {ssim_score:.4f}")

    # region stats if bbox provided
    region_stats = None
    if args.bbox:
        try:
            coords = [int(x) for x in args.bbox.split(",")]
            if len(coords) == 4:
                region_stats = compare_region_stats(npimg, coords)
                with open(os.path.join(outdir,"region_stats.json"), "w") as f:
                    json.dump(region_stats, f, indent=2)
                print("Region stats (saved).")
            else:
                print("bbox must be x1,y1,x2,y2")
        except Exception as e:
            print("Could not compute region stats:", e)

    # OCR (optional)
    ocrtxt = None
    if not args.no_ocr:
        try:
            ocrtxt = ocr_text(img_pil)
            with open(os.path.join(outdir,"ocr.txt"), "w", encoding="utf8") as f:
                f.write(ocrtxt)
            print("OCR text saved.")
        except Exception as e:
            print("OCR failed (is Tesseract installed & in PATH?):", e)

    score, reasons = evaluate_scores(ela_arr, rgb_std, var_map, ssim_score, region_stats)
    verdict = "LIKELY TAMPERED" if score > 0.45 else "LIKELY ORIGINAL/NO OBVIOUS TAMPERING"
    print("\n===== SUMMARY =====")
    print(f"Tamper score: {score:.3f}  Verdict: {verdict}")
    if reasons:
        print("Reasons / signals detected:")
        for r in reasons:
            print(" -", r)
    else:
        print("No strong forensic signals detected.")
    print(f"Diagnostic images + files saved in: {outdir}")
    print("===================\n")

if __name__ == "__main__":
    main()