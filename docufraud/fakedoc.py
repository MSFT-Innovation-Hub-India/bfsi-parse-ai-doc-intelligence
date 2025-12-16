#!/usr/bin/env python3
"""
LLM-Based Fake Document Detection System
Uses Azure OpenAI Vision with reasoning to detect fraudulent documents

Checks for:
- Email legitimacy (domain, format, consistency)
- PAN card validity (format, patterns)
- Domain name verification
- Document authenticity indicators
- Inconsistencies and red flags
"""

import os
import sys
import json
import argparse
import datetime
import base64
from pathlib import Path
from typing import Dict, Any, List, Optional
import re
import socket
try:
    import dns.resolver
    DNS_AVAILABLE = True
except ImportError:
    DNS_AVAILABLE = False
    print("Warning: dnspython not installed. Domain MX record checking will be skipped.")
import requests
from urllib.parse import urlparse

import fitz  # PyMuPDF
from PIL import Image

# Add parent directory to path for config import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config import AzureOpenAIConfig, get_openai_client
from prompt_manager import get_fake_document_detection_prompt, get_fake_document_system_prompt

# Initialize Azure OpenAI client from environment
client = get_openai_client()


class FakeDocumentDetector:
    """LLM-based fake document detection with comprehensive reasoning"""
    
    def __init__(self):
        self.client = client
        self.report_dir = "fraud_detection_reports"
        os.makedirs(self.report_dir, exist_ok=True)
        
        # Known fraud patterns
        self.email_typos = {
            'gmial.com': 'gmail.com',
            'gmali.com': 'gmail.com',
            'gmai.com': 'gmail.com',
            'yahooo.com': 'yahoo.com',
            'yaho.com': 'yahoo.com',
            'outlok.com': 'outlook.com',
            'outlock.com': 'outlook.com',
            'hotmial.com': 'hotmail.com',
            'hotmali.com': 'hotmail.com',
        }
        
        self.domain_typos = {
            'goggle.com': 'google.com',
            'gogle.com': 'google.com',
            'facebok.com': 'facebook.com',
            'facbook.com': 'facebook.com',
            'micros0ft.com': 'microsoft.com',
            'amaz0n.com': 'amazon.com',
            'amazn.com': 'amazon.com',
        }
        
        self.suspicious_tlds = ['.tk', '.ml', '.ga', '.cf', '.xyz', '.top', '.click', '.pw']
    
    def verify_domain_exists(self, domain: str) -> Dict[str, Any]:
        """Verify if a domain actually exists using DNS and HTTP checks"""
        result = {
            'domain': domain,
            'exists': False,
            'has_dns': False,
            'has_mx_records': False,
            'responds_to_http': False,
            'details': []
        }
        
        try:
            # Remove www. if present
            clean_domain = domain.replace('www.', '')
            
            # Check DNS resolution
            try:
                socket.gethostbyname(clean_domain)
                result['has_dns'] = True
                result['details'].append(f"âœ“ Domain {clean_domain} has DNS records")
            except socket.gaierror:
                result['details'].append(f"âœ— Domain {clean_domain} does NOT resolve (likely fake)")
                return result
            
            # Check MX records (email server)
            if DNS_AVAILABLE:
                try:
                    mx_records = dns.resolver.resolve(clean_domain, 'MX')
                    if mx_records:
                        result['has_mx_records'] = True
                        result['details'].append(f"âœ“ Domain has email servers (MX records)")
                except:
                    result['details'].append(f"âš  Domain has NO email servers (suspicious for business)")
            else:
                result['details'].append(f"âš  MX record check skipped (dnspython not installed)")
            
            # Check if website responds
            try:
                response = requests.head(f"http://{clean_domain}", timeout=5, allow_redirects=True)
                if response.status_code < 500:
                    result['responds_to_http'] = True
                    result['details'].append(f"âœ“ Website responds (status {response.status_code})")
            except:
                try:
                    response = requests.head(f"https://{clean_domain}", timeout=5, allow_redirects=True)
                    if response.status_code < 500:
                        result['responds_to_http'] = True
                        result['details'].append(f"âœ“ Website responds via HTTPS")
                except:
                    result['details'].append(f"âš  Website does not respond")
            
            # Overall verdict
            result['exists'] = result['has_dns']
            
        except Exception as e:
            result['details'].append(f"Error checking domain: {str(e)}")
        
        return result
    
    def validate_pan_format(self, pan: str) -> Dict[str, Any]:
        """Strictly validate PAN card format"""
        result = {
            'pan': pan,
            'valid': False,
            'issues': []
        }
        
        # Remove spaces
        pan = pan.strip().upper()
        
        # Check length
        if len(pan) != 10:
            result['issues'].append(f"Invalid length: {len(pan)} chars (must be exactly 10)")
            return result
        
        # Check pattern: 5 letters + 4 digits + 1 letter
        pattern = r'^[A-Z]{5}[0-9]{4}[A-Z]$'
        if not re.match(pattern, r'' + pan):
            result['issues'].append(f"Invalid pattern: must be 5 letters + 4 digits + 1 letter")
            return result
        
        # Check for obvious fakes
        if pan[0:5] in ['AAAAA', 'XXXXX', 'ZZZZZ', 'BBBBB']:
            result['issues'].append(f"Obvious fake: repeated letters '{pan[0:5]}'")
            return result
        
        if pan[5:9] in ['0000', '9999', '1111', '2222']:
            result['issues'].append(f"Obvious fake: repeated digits '{pan[5:9]}'")
            return result
        
        # 4th character should indicate entity type
        entity_type = pan[3]
        valid_types = ['P', 'C', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G']
        if entity_type not in valid_types:
            result['issues'].append(f"Invalid entity type '{entity_type}' at position 4")
        
        if not result['issues']:
            result['valid'] = True
            result['issues'].append(f"Format is valid")
        
        return result
    
    def extract_and_verify_details(self, text: str) -> Dict[str, Any]:
        """Extract and verify emails, domains, and PANs from text"""
        verification = {
            'emails': [],
            'domains': [],
            'pans': [],
            'fraud_indicators': []
        }
        
        # Extract emails
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        emails = re.findall(email_pattern, text, re.IGNORECASE)
        
        for email in emails:
            email_lower = email.lower()
            domain = email_lower.split('@')[1]
            
            email_info = {
                'email': email,
                'domain': domain,
                'is_typo': False,
                'typo_of': None,
                'suspicious_tld': False,
                'domain_exists': False,
                'verification': None
            }
            
            # Check for typos
            for typo, correct in self.email_typos.items():
                if typo in domain:
                    email_info['is_typo'] = True
                    email_info['typo_of'] = correct
                    verification['fraud_indicators'].append(
                        f"ðŸš¨ CRITICAL: Email domain '{domain}' is typo of '{correct}'"
                    )
            
            # Check for suspicious TLD
            for tld in self.suspicious_tlds:
                if domain.endswith(tld):
                    email_info['suspicious_tld'] = True
                    verification['fraud_indicators'].append(
                        f"âš ï¸ WARNING: Email uses suspicious TLD '{tld}'"
                    )
            
            # Verify domain exists
            if not email_info['is_typo']:
                print(f"  Verifying domain: {domain}...")
                domain_check = self.verify_domain_exists(domain)
                email_info['verification'] = domain_check
                email_info['domain_exists'] = domain_check['exists']
                
                if not domain_check['exists']:
                    verification['fraud_indicators'].append(
                        f"ðŸš¨ CRITICAL: Email domain '{domain}' does NOT exist!"
                    )
                elif not domain_check['has_mx_records']:
                    verification['fraud_indicators'].append(
                        f"âš ï¸ WARNING: Domain '{domain}' has no email server"
                    )
            
            verification['emails'].append(email_info)
        
        # Extract domains (from URLs/websites)
        domain_pattern = r'(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)'
        domains = re.findall(domain_pattern, text)
        
        for domain in set(domains):
            if '@' not in domain:  # Skip emails
                domain_lower = domain.lower()
                domain_info = {
                    'domain': domain_lower,
                    'is_typo': False,
                    'typo_of': None,
                    'exists': False,
                    'verification': None
                }
                
                # Check for typos
                for typo, correct in self.domain_typos.items():
                    if typo in domain_lower:
                        domain_info['is_typo'] = True
                        domain_info['typo_of'] = correct
                        verification['fraud_indicators'].append(
                            f"ðŸš¨ CRITICAL: Domain '{domain_lower}' is typo of '{correct}'"
                        )
                
                # Verify domain exists
                if not domain_info['is_typo']:
                    print(f"  Verifying domain: {domain_lower}...")
                    domain_check = self.verify_domain_exists(domain_lower)
                    domain_info['verification'] = domain_check
                    domain_info['exists'] = domain_check['exists']
                    
                    if not domain_check['exists']:
                        verification['fraud_indicators'].append(
                            f"ðŸš¨ CRITICAL: Domain '{domain_lower}' does NOT exist!"
                        )
                
                verification['domains'].append(domain_info)
        
        # Extract and validate PANs
        pan_pattern = r'\b[A-Z]{5}[0-9]{4}[A-Z]\b'
        pans = re.findall(pan_pattern, text)
        
        for pan in pans:
            print(f"  Validating PAN: {pan}...")
            pan_validation = self.validate_pan_format(pan)
            verification['pans'].append(pan_validation)
            
            if not pan_validation['valid']:
                for issue in pan_validation['issues']:
                    verification['fraud_indicators'].append(f"ðŸš¨ CRITICAL PAN Issue: {issue}")
        
        return verification
    
    def encode_image(self, image_path: str) -> str:
        """Encode image to base64"""
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')
    
    def extract_text_from_pdf(self, pdf_path: str) -> tuple[str, List[str]]:
        """Extract text and images from PDF"""
        doc = fitz.open(pdf_path)
        all_text = ""
        image_paths = []
        
        temp_dir = "temp_extracted_images"
        os.makedirs(temp_dir, exist_ok=True)
        
        for page_num, page in enumerate(doc):
            all_text += page.get_text()
            
            # Extract images from page
            image_list = page.get_images()
            for img_index, img in enumerate(image_list):
                xref = img[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]
                image_path = os.path.join(temp_dir, f"page_{page_num}_img_{img_index}.{image_ext}")
                
                with open(image_path, "wb") as img_file:
                    img_file.write(image_bytes)
                image_paths.append(image_path)
        
        doc.close()
        return all_text, image_paths
    
    def create_detection_prompt(self) -> str:
        """Create comprehensive prompt for fake document detection"""
        return get_fake_document_detection_prompt()
    
    def analyze_document_with_llm(self, image_path: str, extracted_text: str = "") -> Dict[str, Any]:
        """Analyze document using LLM vision + reasoning"""
        
        base64_image = self.encode_image(image_path)
        prompt = self.create_detection_prompt()
        
        # Add extracted text context if available
        if extracted_text:
            prompt += f"\n\n**EXTRACTED TEXT FROM DOCUMENT:**\n{extracted_text[:2000]}"  # Limit text size
        
        messages = [
            {
                "role": "system",
                "content": "You are an expert fraud detection AI specializing in document authenticity verification."
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}"
                        }
                    }
                ]
            }
        ]
        
        try:
            response = self.client.chat.completions.create(
                model=AzureOpenAIConfig.DEPLOYMENT,
                messages=messages,
                max_tokens=4000,
                temperature=0.1  # Low temperature for consistent analysis
            )
            
            response_text = response.choices[0].message.content
            
            # Try to extract JSON from response
            json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL)
            if json_match:
                analysis = json.loads(json_match.group(1))
            else:
                # If no JSON block, try to parse entire response
                analysis = {
                    "verdict": "ERROR",
                    "confidence_score": 0,
                    "raw_response": response_text
                }
            
            return analysis
            
        except Exception as e:
            return {
                "verdict": "ERROR",
                "error": str(e),
                "confidence_score": 0
            }
    
    def detect_fake_document(self, file_path: str) -> Dict[str, Any]:
        """Main detection function"""
        
        print(f"\n{'='*60}")
        print(f"ANALYZING: {file_path}")
        print(f"{'='*60}\n")
        
        file_ext = Path(file_path).suffix.lower()
        extracted_text = ""
        image_paths = []
        
        # Handle different file types
        if file_ext == '.pdf':
            print("ðŸ“„ Extracting text and images from PDF...")
            extracted_text, image_paths = self.extract_text_from_pdf(file_path)
            
            # Verify details from extracted text
            print("\nðŸ” Verifying document details...")
            verification_results = self.extract_and_verify_details(extracted_text)
            if not image_paths:
                # Convert first page to image if no images extracted
                doc = fitz.open(file_path)
                page = doc[0]
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                temp_img = "temp_pdf_page.png"
                pix.save(temp_img)
                image_paths = [temp_img]
                doc.close()
        
        elif file_ext in ['.jpg', '.jpeg', '.png', '.bmp']:
            print("ðŸ–¼ï¸  Processing image file...")
            image_paths = [file_path]
            
            # Try OCR to extract text for verification
            print("\nðŸ” Extracting text for verification...")
            try:
                import pytesseract
                from PIL import Image as PILImage
                img = PILImage.open(file_path)
                extracted_text = pytesseract.image_to_string(img)
                verification_results = self.extract_and_verify_details(extracted_text)
            except:
                print("  (OCR not available, skipping text verification)")
                verification_results = {'fraud_indicators': [], 'emails': [], 'domains': [], 'pans': []}
        
        else:
            return {"error": f"Unsupported file type: {file_ext}"}
        
        # Show verification results
        if verification_results['fraud_indicators']:
            print(f"\nâš ï¸  FOUND {len(verification_results['fraud_indicators'])} FRAUD INDICATORS:")
            for indicator in verification_results['fraud_indicators']:
                print(f"   {indicator}")
        else:
            print("\nâœ“ No obvious fraud indicators found in verification")
        
        # Analyze with LLM
        print("\nðŸ¤– Analyzing with AI...")
        
        # Add verification context to the analysis
        verification_context = f"""

**PRE-VERIFICATION RESULTS:**
- Emails found: {len(verification_results['emails'])}
- Domains found: {len(verification_results['domains'])}
- PANs found: {len(verification_results['pans'])}
- FRAUD INDICATORS: {len(verification_results['fraud_indicators'])}

"""
        if verification_results['fraud_indicators']:
            verification_context += "**CRITICAL ISSUES DETECTED:**\n"
            for indicator in verification_results['fraud_indicators']:
                verification_context += f"- {indicator}\n"
        
        # Add details about emails
        for email_info in verification_results['emails']:
            if email_info.get('is_typo'):
                verification_context += f"\nðŸš¨ Email '{email_info['email']}' has TYPO - should be '{email_info['typo_of']}'\n"
            elif not email_info.get('domain_exists'):
                verification_context += f"\nðŸš¨ Email domain '{email_info['domain']}' DOES NOT EXIST!\n"
        
        # Add details about domains
        for domain_info in verification_results['domains']:
            if domain_info.get('is_typo'):
                verification_context += f"\nðŸš¨ Domain '{domain_info['domain']}' is TYPO of '{domain_info['typo_of']}'\n"
            elif not domain_info.get('exists'):
                verification_context += f"\nðŸš¨ Domain '{domain_info['domain']}' DOES NOT EXIST!\n"
        
        # Add details about PANs
        for pan_info in verification_results['pans']:
            if not pan_info['valid']:
                verification_context += f"\nðŸš¨ PAN '{pan_info['pan']}' is INVALID:\n"
                for issue in pan_info['issues']:
                    verification_context += f"   - {issue}\n"
        
        analysis = self.analyze_document_with_llm(image_paths[0], extracted_text + verification_context)
        
        # Add metadata
        analysis['metadata'] = {
            'file_path': file_path,
            'file_type': file_ext,
            'analysis_timestamp': datetime.datetime.now().isoformat(),
            'extracted_text_length': len(extracted_text)
        }
        
        # Display results
        self.display_results(analysis)
        
        # Save report
        report_path = self.save_report(analysis, file_path)
        print(f"\nðŸ“Š Report saved: {report_path}")
        
        return analysis
    
    def display_results(self, analysis: Dict[str, Any]):
        """Display analysis results in a clear format"""
        
        print(f"\n{'='*60}")
        print("FRAUD DETECTION RESULTS")
        print(f"{'='*60}\n")
        
        if analysis.get('verdict') == 'ERROR':
            print(f"âŒ ERROR: {analysis.get('error', 'Unknown error')}")
            if 'raw_response' in analysis:
                print(f"\nRaw Response:\n{analysis['raw_response'][:500]}...")
            return
        
        # Verdict with emoji
        verdict = analysis.get('verdict', 'UNKNOWN')
        verdict_emoji = {
            'FAKE': 'ðŸš¨',
            'LEGITIMATE': 'âœ…',
            'SUSPICIOUS': 'âš ï¸',
            'UNKNOWN': 'â“'
        }
        
        print(f"{verdict_emoji.get(verdict, 'â“')} VERDICT: {verdict}")
        print(f"ðŸ“Š CONFIDENCE: {analysis.get('confidence_score', 0)}%")
        print(f"âš¡ RISK LEVEL: {analysis.get('risk_level', 'UNKNOWN')}")
        
        if 'summary' in analysis:
            print(f"\nðŸ“ SUMMARY:\n{analysis['summary']}")
        
        # Red flags
        if 'red_flags' in analysis and analysis['red_flags']:
            print(f"\n{'='*60}")
            print("ðŸš© RED FLAGS:")
            print(f"{'='*60}")
            for flag in analysis['red_flags']:
                severity = flag.get('severity', 'UNKNOWN')
                emoji = {'LOW': 'ðŸŸ¡', 'MEDIUM': 'ðŸŸ ', 'HIGH': 'ðŸ”´', 'CRITICAL': 'ðŸ”´ðŸ”´'}.get(severity, 'âšª')
                print(f"\n{emoji} {flag.get('category', 'Unknown').upper()} - {severity}")
                print(f"   {flag.get('description', 'No description')}")
                if 'evidence' in flag:
                    print(f"   Evidence: {flag['evidence']}")
        
        # Detailed findings
        if 'detailed_findings' in analysis:
            print(f"\n{'='*60}")
            print("DETAILED FINDINGS:")
            print(f"{'='*60}")
            
            findings = analysis['detailed_findings']
            
            # Email analysis
            if 'email_analysis' in findings:
                email = findings['email_analysis']
                print(f"\nðŸ“§ EMAIL ANALYSIS: {email.get('verdict', 'N/A')}")
                if email.get('emails_found'):
                    print(f"   Found: {', '.join(email['emails_found'])}")
                if email.get('issues'):
                    for issue in email['issues']:
                        print(f"   âš ï¸  {issue}")
            
            # PAN analysis
            if 'pan_analysis' in findings:
                pan = findings['pan_analysis']
                print(f"\nðŸ†” PAN ANALYSIS: {pan.get('verdict', 'N/A')}")
                if pan.get('pan_numbers_found'):
                    print(f"   Found: {', '.join(pan['pan_numbers_found'])}")
                if pan.get('issues'):
                    for issue in pan['issues']:
                        print(f"   âš ï¸  {issue}")
            
            # Domain analysis
            if 'domain_analysis' in findings:
                domain = findings['domain_analysis']
                print(f"\nðŸŒ DOMAIN ANALYSIS: {domain.get('verdict', 'N/A')}")
                if domain.get('domains_found'):
                    print(f"   Found: {', '.join(domain['domains_found'])}")
                if domain.get('suspicious_domains'):
                    print(f"   ðŸš¨ Suspicious: {', '.join(domain['suspicious_domains'])}")
                if domain.get('issues'):
                    for issue in domain['issues']:
                        print(f"   âš ï¸  {issue}")
            
            # Document quality
            if 'document_quality' in findings:
                quality = findings['document_quality']
                print(f"\nðŸ“„ DOCUMENT QUALITY:")
                print(f"   Visual: {quality.get('visual_quality', 'N/A')}")
                print(f"   Formatting: {quality.get('formatting', 'N/A')}")
                print(f"   Completeness: {quality.get('completeness', 'N/A')}")
                if quality.get('issues'):
                    for issue in quality['issues']:
                        print(f"   âš ï¸  {issue}")
        
        # Recommendations
        if 'recommendations' in analysis and analysis['recommendations']:
            print(f"\n{'='*60}")
            print("ðŸ’¡ RECOMMENDATIONS:")
            print(f"{'='*60}")
            for i, rec in enumerate(analysis['recommendations'], 1):
                print(f"{i}. {rec}")
        
        # Reasoning
        if 'reasoning' in analysis:
            print(f"\n{'='*60}")
            print("ðŸ§  REASONING:")
            print(f"{'='*60}")
            print(analysis['reasoning'])
    
    def save_report(self, analysis: Dict[str, Any], original_file: str) -> str:
        """Save analysis report to file"""
        
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        base_name = Path(original_file).stem
        
        # Save JSON report
        json_report = os.path.join(self.report_dir, f"fraud_report_{base_name}_{timestamp}.json")
        with open(json_report, 'w', encoding='utf-8') as f:
            json.dump(analysis, f, indent=2, ensure_ascii=False)
        
        # Save text report
        txt_report = os.path.join(self.report_dir, f"fraud_report_{base_name}_{timestamp}.txt")
        with open(txt_report, 'w', encoding='utf-8') as f:
            f.write(f"FRAUD DETECTION REPORT\n")
            f.write(f"Generated: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"File: {original_file}\n")
            f.write(f"{'='*80}\n\n")
            
            f.write(f"VERDICT: {analysis.get('verdict', 'UNKNOWN')}\n")
            f.write(f"CONFIDENCE: {analysis.get('confidence_score', 0)}%\n")
            f.write(f"RISK LEVEL: {analysis.get('risk_level', 'UNKNOWN')}\n\n")
            
            if 'summary' in analysis:
                f.write(f"SUMMARY:\n{analysis['summary']}\n\n")
            
            f.write(f"{'='*80}\n")
            f.write(json.dumps(analysis, indent=2, ensure_ascii=False))
        
        return json_report


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="Detect fake documents using LLM reasoning",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python fakedoc.py document.pdf
  python fakedoc.py invoice.jpg
  python fakedoc.py --file medical_report.pdf
        """
    )
    
    parser.add_argument(
        'file',
        nargs='?',
        help='Path to document file (PDF, JPG, PNG)'
    )
    parser.add_argument(
        '--file',
        dest='file_path',
        help='Alternative way to specify file path'
    )
    
    args = parser.parse_args()
    
    # Get file path
    file_path = args.file or args.file_path
    
    if not file_path:
        parser.print_help()
        sys.exit(1)
    
    if not os.path.exists(file_path):
        print(f"âŒ Error: File not found: {file_path}")
        sys.exit(1)
    
    # Run detection
    detector = FakeDocumentDetector()
    detector.detect_fake_document(file_path)


if __name__ == "__main__":
    main()
