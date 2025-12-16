#!/usr/bin/env python3
"""
Single Medical Image Analyzer
Analyzes a single medical document/image and provides comprehensive medical findings
"""

import os
import base64
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, Any
import sys

# Add parent directory to path for config import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config import AzureOpenAIConfig, get_openai_client

# Initialize Azure OpenAI client from environment
client = get_openai_client()

class SingleMedicalImageAnalyzer:
    """Analyze a single medical image and extract comprehensive medical information"""
    
    def __init__(self):
        self.supported_formats = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'}
    
    def encode_image(self, image_path: str) -> str:
        """Encode image to base64 string"""
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')
    
    def validate_image(self, image_path: str) -> bool:
        """Validate if the image file exists and is supported"""
        if not os.path.exists(image_path):
            print(f"❌ Error: Image file not found: {image_path}")
            return False
        
        # Extended format support including PDF and WebP
        supported = ['.tif', '.tiff', '.bmp', '.jpg', '.png', '.jpeg', '.pdf', '.webp']
        file_ext = os.path.splitext(image_path)[1].lower()
        if file_ext not in supported:
            print(f"❌ Error: Unsupported file format: {file_ext}")
            print(f"   Supported formats: {', '.join(supported)}")
            return False
        
        return True
    
    def analyze_medical_image(self, image_path: str) -> Dict[str, Any]:
        """Analyze a single medical image and extract medical information"""
        image_name = os.path.basename(image_path)
        print(f"🔍 Analyzing medical image: {image_name}")
        
        try:
            # Encode image to base64
            base64_image = self.encode_image(image_path)
            
            # Define medical analysis prompt
            analysis_prompt = """
            You are an expert medical document analyst. Analyze this medical image thoroughly and provide a comprehensive medical analysis.

            Extract and identify the following information:

            1. **Document Type**: What type of medical document is this?
            2. **Patient Information**: Any visible patient details (anonymize sensitive data)
            3. **Medical Conditions**: Diagnoses, medical conditions, or health issues mentioned
            4. **Symptoms**: Current symptoms or complaints listed
            5. **Medications**: Any medications, dosages, or treatments mentioned
            6. **Test Results**: Laboratory values, vital signs, or test findings
            7. **Clinical Observations**: Important medical observations or notes
            8. **Key Medical Findings**: Significant findings that stand out
            9. **Critical Alerts**: Any urgent or concerning findings
            10. **Document Summary**: Overall summary of the medical content

            Provide a detailed analysis in a clear, structured format. Focus on:
            - Medical accuracy and completeness
            - Extracting ALL visible medical information
            - Identifying any critical or urgent findings
            - Providing clinical insights where appropriate
            - Maintaining patient confidentiality

            Format your response as a comprehensive medical analysis report.
            """
            
            # Call Azure OpenAI Vision API
            response = client.chat.completions.create(
                model=AzureOpenAIConfig.DEPLOYMENT,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a senior medical specialist with expertise in analyzing medical documents, clinical assessment, and medical informatics. Provide thorough, accurate medical analysis."
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
                max_tokens=4096,
                temperature=0.2,  # Lower temperature for consistent medical analysis
                top_p=0.95
            )
            
            # Get the analysis result
            analysis_result = response.choices[0].message.content
            
            analysis_data = {
                "image_path": image_path,
                "image_name": image_name,
                "analysis_timestamp": datetime.now().isoformat(),
                "analysis_successful": True,
                "medical_analysis": analysis_result
            }
            
            print(f"✅ Analysis completed successfully")
            return analysis_data
            
        except Exception as e:
            print(f"❌ Error analyzing image: {str(e)}")
            return {
                "image_path": image_path,
                "image_name": image_name,
                "analysis_timestamp": datetime.now().isoformat(),
                "analysis_successful": False,
                "error": str(e),
                "medical_analysis": f"Analysis failed: {str(e)}"
            }
    
    def create_report(self, analysis_data: Dict[str, Any]) -> str:
        """Create a formatted medical report"""
        report = []
        report.append("=" * 80)
        report.append("SINGLE MEDICAL IMAGE ANALYSIS REPORT")
        report.append("=" * 80)
        report.append(f"Image: {analysis_data['image_name']}")
        report.append(f"Analysis Date: {analysis_data['analysis_timestamp']}")
        report.append(f"Status: {'✅ Success' if analysis_data['analysis_successful'] else '❌ Failed'}")
        report.append("")
        
        if analysis_data['analysis_successful']:
            report.append("🏥 MEDICAL ANALYSIS")
            report.append("-" * 40)
            report.append(analysis_data['medical_analysis'])
        else:
            report.append("❌ ANALYSIS ERROR")
            report.append("-" * 40)
            report.append(f"Error: {analysis_data.get('error', 'Unknown error')}")
        
        report.append("")
        report.append("=" * 80)
        report.append("END OF ANALYSIS REPORT")
        report.append("=" * 80)
        
        return "\n".join(report)
    
    def save_report(self, analysis_data: Dict[str, Any], output_dir: str = None) -> str:
        """Save the analysis report to a text file"""
        if output_dir is None:
            output_dir = os.path.dirname(os.path.abspath(analysis_data['image_path']))
        
        # Create output filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        image_base = os.path.splitext(analysis_data['image_name'])[0]
        report_file = os.path.join(output_dir, f"medical_analysis_{image_base}_{timestamp}.txt")
        
        # Generate and save report
        report_content = self.create_report(analysis_data)
        with open(report_file, 'w', encoding='utf-8') as f:
            f.write(report_content)
        
        print(f"💾 Report saved: {report_file}")
        return report_file
    
    def analyze_and_report(self, image_path: str, save_report: bool = True, output_dir: str = None) -> Dict[str, Any]:
        """Main method to analyze image and optionally save report"""
        print("🚀 Starting Single Medical Image Analysis")
        print(f"📄 Target Image: {image_path}")
        
        # Validate image
        if not self.validate_image(image_path):
            return {}
        
        try:
            # Analyze the image
            analysis_data = self.analyze_medical_image(image_path)
            
            # Save report if requested
            if save_report and analysis_data.get('analysis_successful'):
                report_file = self.save_report(analysis_data, output_dir)
                analysis_data['report_file'] = report_file
            
            # Display summary
            if analysis_data.get('analysis_successful'):
                print("\n" + "=" * 60)
                print("ANALYSIS SUMMARY")
                print("=" * 60)
                print(f"✅ Successfully analyzed: {analysis_data['image_name']}")
                if save_report:
                    print(f"📄 Report saved to: {analysis_data.get('report_file', 'Unknown')}")
                print("\n📋 Quick Preview:")
                # Show first few lines of analysis
                analysis_lines = analysis_data['medical_analysis'].split('\n')
                for line in analysis_lines[:5]:
                    if line.strip():
                        print(f"   {line.strip()}")
                if len(analysis_lines) > 5:
                    print("   ... (see full report for complete analysis)")
            else:
                print(f"\n❌ Analysis failed for: {analysis_data['image_name']}")
                print(f"Error: {analysis_data.get('error', 'Unknown error')}")
            
            return analysis_data
            
        except Exception as e:
            print(f"❌ Unexpected error: {str(e)}")
            return {}

def main():
    """Main function with command line interface"""
    parser = argparse.ArgumentParser(
        description="Single Medical Image Analyzer - Analyze individual medical documents",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python single_medical_analyzer.py image.jpg
  python single_medical_analyzer.py path/to/medical_doc.png --no-save
  python single_medical_analyzer.py scan.jpg --output-dir reports/
        """
    )
    
    parser.add_argument(
        'image_path',
        help='Path to the medical image to analyze'
    )
    
    parser.add_argument(
        '--no-save',
        action='store_true',
        help='Do not save the analysis report to file'
    )
    
    parser.add_argument(
        '--output-dir',
        help='Directory to save the analysis report (default: same as image)'
    )
    
    args = parser.parse_args()
    
    print("🏥 Single Medical Image Analyzer")
    print("=" * 50)
    
    # Initialize analyzer
    analyzer = SingleMedicalImageAnalyzer()
    
    # Analyze the image
    save_report = not args.no_save
    results = analyzer.analyze_and_report(
        image_path=args.image_path,
        save_report=save_report,
        output_dir=args.output_dir
    )
    
    if results:
        print("\n✅ Analysis completed!")
    else:
        print("\n❌ Analysis failed!")

def analyze_image_simple(image_path: str) -> str:
    """Simple function to analyze an image and return the analysis text"""
    analyzer = SingleMedicalImageAnalyzer()
    if not analyzer.validate_image(image_path):
        return "Error: Invalid image file"
    
    analysis_data = analyzer.analyze_medical_image(image_path)
    if analysis_data.get('analysis_successful'):
        return analysis_data['medical_analysis']
    else:
        return f"Analysis failed: {analysis_data.get('error', 'Unknown error')}"

if __name__ == "__main__":
    main()
