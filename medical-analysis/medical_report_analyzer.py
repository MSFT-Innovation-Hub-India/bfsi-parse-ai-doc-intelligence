import os
import json
import base64
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any
import fitz  # PyMuPDF for PDF handling
import tempfile
import sys

# Add parent directory to path for config import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config import AzureOpenAIConfig, get_openai_client
from prompt_manager import get_medical_analysis_prompt, get_medical_system_prompt

# Initialize Azure OpenAI client from environment
client = get_openai_client()

class MedicalReportAnalyzer:
    """Analyze medical documents from docs2 folder and generate comprehensive medical summaries"""
    
    def __init__(self, docs_folder: str = None):
        if docs_folder is None:
            self.docs_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs2")
        else:
            self.docs_folder = docs_folder
        
        self.extracted_data = []
        self.summary = {
            "total_documents": 0,
            "processing_timestamp": datetime.now().isoformat(),
            "documents_processed": [],
            "analysis_type": "Medical Report Analysis"
        }
    
    def encode_image(self, image_path: str) -> str:
        """Encode image to base64 string"""
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')
    
    def convert_pdf_to_images(self, pdf_path: str) -> List[str]:
        """Convert PDF pages to images and return list of image paths"""
        print(f"📄 Converting PDF: {os.path.basename(pdf_path)}")
        
        temp_dir = tempfile.mkdtemp()
        image_paths = []
        
        try:
            pdf_document = fitz.open(pdf_path)
            
            for page_num in range(len(pdf_document)):
                page = pdf_document.load_page(page_num)
                mat = fitz.Matrix(2.0, 2.0)  # High resolution
                pix = page.get_pixmap(matrix=mat)
                
                image_path = os.path.join(temp_dir, f"{os.path.basename(pdf_path)}_page_{page_num+1}.png")
                pix.save(image_path)
                image_paths.append(image_path)
            
            pdf_document.close()
            print(f"✅ Converted {len(pdf_document)} page(s) to images")
            return image_paths
            
        except Exception as e:
            print(f"❌ Error converting PDF: {str(e)}")
            return []
    
    def get_medical_documents(self) -> List[str]:
        """Get all medical document images from docs2 folder"""
        print(f"📁 Scanning for medical documents in: {self.docs_folder}")
        
        if not os.path.exists(self.docs_folder):
            raise FileNotFoundError(f"Documents folder not found: {self.docs_folder}")
        
        # Supported formats (images and PDFs)
        supported_formats = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.pdf'}
        
        document_paths = []
        for file in os.listdir(self.docs_folder):
            file_path = os.path.join(self.docs_folder, file)
            if os.path.isfile(file_path):
                file_ext = os.path.splitext(file)[1].lower()
                if file_ext in supported_formats:
                    document_paths.append(file_path)
                    print(f"   📄 Found: {file}")
        
        if not document_paths:
            print(f"⚠️  No supported image files found in {self.docs_folder}")
            print(f"   Supported formats: {', '.join(supported_formats)}")
        
        return sorted(document_paths)
    
    def analyze_medical_document(self, image_path: str, doc_number: int) -> Dict[str, Any]:
        """Analyze a single medical document and extract comprehensive medical information"""
        doc_name = os.path.basename(image_path)
        print(f"🔍 Analyzing document {doc_number}: {doc_name}")
        
        try:
            # Handle PDF files by converting to images first
            if image_path.lower().endswith('.pdf'):
                print(f"📄 PDF detected, converting to images...")
                image_paths = self.convert_pdf_to_images(image_path)
                if not image_paths:
                    raise Exception("Unable to convert PDF to images")
                # Use the first page for analysis (or analyze all pages if needed)
                actual_image_path = image_paths[0]
                print(f"✅ Using converted image from page 1")
            else:
                actual_image_path = image_path
            
            # Encode image to base64
            base64_image = self.encode_image(actual_image_path)
            
            # Load prompts from external files
            analysis_prompt = get_medical_analysis_prompt()
            system_prompt = get_medical_system_prompt()
            
            # Call Azure OpenAI Vision API
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
                max_completion_tokens=4096,
                temperature=0.2,  # Lower temperature for more consistent medical analysis
                top_p=0.95
            )
            
            # Parse the JSON response
            response_text = response.choices[0].message.content
            
            # Try to extract JSON from the response
            try:
                json_start = response_text.find('{')
                json_end = response_text.rfind('}') + 1
                if json_start != -1 and json_end != -1:
                    json_text = response_text[json_start:json_end]
                    analyzed_data = json.loads(json_text)
                else:
                    # If no JSON found, create a basic structure
                    analyzed_data = {
                        "document_metadata": {"document_type": "unknown", "document_quality": "poor"},
                        "medical_summary": {"primary_diagnosis": "Unable to extract"},
                        "document_summary": "Unable to parse structured data from document",
                        "raw_response": response_text
                    }
            except json.JSONDecodeError as e:
                print(f"⚠️  JSON parsing error for {doc_name}: {str(e)}")
                analyzed_data = {
                    "document_metadata": {"document_type": "unknown", "document_quality": "poor"},
                    "medical_summary": {"primary_diagnosis": "Parsing error"},
                    "document_summary": f"JSON parsing failed: {str(e)}",
                    "raw_response": response_text
                }
            
            # Add processing metadata
            document_analysis = {
                "document_number": doc_number,
                "document_name": doc_name,
                "document_path": image_path,
                "analysis_timestamp": datetime.now().isoformat(),
                "analysis_successful": "raw_response" in analyzed_data or "document_summary" in analyzed_data,
                **analyzed_data
            }
            
            print(f"✅ Document {doc_number} analyzed successfully")
            return document_analysis
            
        except Exception as e:
            print(f"❌ Error analyzing document {doc_number} ({doc_name}): {str(e)}")
            return {
                "document_number": doc_number,
                "document_name": doc_name,
                "document_path": image_path,
                "analysis_timestamp": datetime.now().isoformat(),
                "analysis_successful": False,
                "error": str(e),
                "document_summary": f"Analysis failed: {str(e)}"
            }
    
    def generate_comprehensive_report(self) -> Dict[str, Any]:
        """Generate a comprehensive medical report from all analyzed documents"""
        print("📊 Generating comprehensive medical report...")
        
        # Collect all medical information
        all_diagnoses = []
        all_medications = []
        all_symptoms = []
        all_red_flags = []
        all_findings = []
        document_summaries = []
        
        successful_analyses = []
        failed_analyses = []
        
        for doc_analysis in self.extracted_data:
            if doc_analysis.get("analysis_successful", False):
                successful_analyses.append(doc_analysis)
                
                # Collect medical information
                if "medical_summary" in doc_analysis:
                    med_summary = doc_analysis["medical_summary"]
                    if med_summary.get("primary_diagnosis"):
                        all_diagnoses.append(med_summary["primary_diagnosis"])
                    if med_summary.get("secondary_diagnoses"):
                        all_diagnoses.extend(med_summary["secondary_diagnoses"])
                    if med_summary.get("current_symptoms"):
                        all_symptoms.extend(med_summary["current_symptoms"])
                
                if "medications_and_treatments" in doc_analysis:
                    meds = doc_analysis["medications_and_treatments"].get("current_medications", [])
                    all_medications.extend(meds)
                
                if "red_flags" in doc_analysis:
                    all_red_flags.extend(doc_analysis["red_flags"])
                
                if "key_findings" in doc_analysis:
                    key_findings = doc_analysis["key_findings"]
                    for key in ["significant_findings", "abnormal_results", "notable_observations"]:
                        if key_findings.get(key):
                            all_findings.extend(key_findings[key])
                
                document_summaries.append({
                    "document": doc_analysis["document_name"],
                    "summary": doc_analysis.get("document_summary", "No summary available")
                })
            else:
                failed_analyses.append(doc_analysis)
        
        # Create comprehensive report
        comprehensive_report = {
            "report_metadata": {
                "generation_timestamp": datetime.now().isoformat(),
                "total_documents_analyzed": len(self.extracted_data),
                "successful_analyses": len(successful_analyses),
                "failed_analyses": len(failed_analyses),
                "analysis_type": "Comprehensive Medical Report Analysis"
            },
            "executive_summary": {
                "total_unique_diagnoses": len(set(all_diagnoses)),
                "total_medications": len(all_medications),
                "total_symptoms_reported": len(set(all_symptoms)),
                "critical_alerts": len(all_red_flags),
                "total_findings": len(set(all_findings))
            },
            "clinical_overview": {
                "primary_diagnoses": list(set(all_diagnoses)),
                "key_symptoms": list(set(all_symptoms)),
                "current_medications": all_medications,
                "critical_findings": list(set(all_red_flags)),
                "key_medical_findings": list(set(all_findings))
            },
            "document_summaries": document_summaries,
            "detailed_analysis": successful_analyses,
            "processing_errors": failed_analyses if failed_analyses else None
        }
        
        return comprehensive_report
    
    def create_readable_report(self, comprehensive_report: Dict[str, Any]) -> str:
        """Create a human-readable medical report"""
        report = []
        report.append("=" * 100)
        report.append("COMPREHENSIVE MEDICAL REPORT ANALYSIS")
        report.append("=" * 100)
        
        metadata = comprehensive_report["report_metadata"]
        report.append(f"Report Generated: {metadata['generation_timestamp']}")
        report.append(f"Documents Analyzed: {metadata['total_documents_analyzed']}")
        report.append(f"Successful Analyses: {metadata['successful_analyses']}")
        if metadata['failed_analyses'] > 0:
            report.append(f"Failed Analyses: {metadata['failed_analyses']}")
        report.append("")
        
        # Executive Summary
        exec_summary = comprehensive_report["executive_summary"]
        report.append("📋 EXECUTIVE SUMMARY")
        report.append("-" * 50)
        report.append(f"• Unique Diagnoses Found: {exec_summary['total_unique_diagnoses']}")
        report.append(f"• Medications Identified: {exec_summary['total_medications']}")
        report.append(f"• Symptoms Reported: {exec_summary['total_symptoms_reported']}")
        report.append(f"• Critical Alerts: {exec_summary['critical_alerts']}")
        report.append(f"• Key Findings: {exec_summary['total_findings']}")
        report.append("")
        
        # Clinical Overview
        clinical = comprehensive_report["clinical_overview"]
        
        report.append("🏥 CLINICAL OVERVIEW")
        report.append("-" * 50)
        
        # Diagnoses
        report.append("📊 PRIMARY DIAGNOSES:")
        if clinical["primary_diagnoses"]:
            for i, diagnosis in enumerate(clinical["primary_diagnoses"], 1):
                report.append(f"   {i}. {diagnosis}")
        else:
            report.append("   No diagnoses clearly identified")
        report.append("")
        
        # Key Symptoms
        report.append("🔍 KEY SYMPTOMS:")
        if clinical["key_symptoms"]:
            for i, symptom in enumerate(clinical["key_symptoms"], 1):
                report.append(f"   {i}. {symptom}")
        else:
            report.append("   No symptoms clearly identified")
        report.append("")
        
        # Medications
        report.append("💊 CURRENT MEDICATIONS:")
        if clinical["current_medications"]:
            for i, med in enumerate(clinical["current_medications"], 1):
                if isinstance(med, dict):
                    report.append(f"   {i}. {med.get('name', 'Unknown')} - {med.get('dosage', 'Dosage not specified')}")
                    if med.get('frequency'):
                        report.append(f"      Frequency: {med['frequency']}")
                    if med.get('indication'):
                        report.append(f"      Indication: {med['indication']}")
                else:
                    report.append(f"   {i}. {med}")
                report.append("")
        else:
            report.append("   No medications clearly identified")
            report.append("")
        
        # Critical Findings
        if clinical["critical_findings"]:
            report.append("🚨 CRITICAL FINDINGS & RED FLAGS:")
            report.append("-" * 50)
            for i, finding in enumerate(clinical["critical_findings"], 1):
                report.append(f"   {i}. {finding}")
            report.append("")
        
        # Key Medical Findings
        report.append("� KEY MEDICAL FINDINGS:")
        report.append("-" * 50)
        if clinical["key_medical_findings"]:
            for i, finding in enumerate(clinical["key_medical_findings"], 1):
                report.append(f"   {i}. {finding}")
        else:
            report.append("   No specific key findings identified")
        report.append("")
        
        # Document Summaries
        report.append("📄 DOCUMENT-BY-DOCUMENT SUMMARY")
        report.append("-" * 50)
        for doc_summary in comprehensive_report["document_summaries"]:
            report.append(f"📋 {doc_summary['document']}:")
            report.append(f"   {doc_summary['summary']}")
            report.append("")
        
        # Processing Errors
        if comprehensive_report.get("processing_errors"):
            report.append("⚠️  PROCESSING ERRORS")
            report.append("-" * 50)
            for error in comprehensive_report["processing_errors"]:
                report.append(f"❌ {error['document_name']}: {error.get('error', 'Unknown error')}")
            report.append("")
        
        report.append("=" * 100)
        report.append("END OF MEDICAL REPORT")
        report.append("=" * 100)
        
        return "\n".join(report)
    
    def save_results(self, comprehensive_report: Dict[str, Any], output_dir: str = None) -> str:
        """Save comprehensive results to readable report file only"""
        if output_dir is None:
            output_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Create output file with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = os.path.join(output_dir, f"medical_report_summary_{timestamp}.txt")
        
        # Create readable report
        readable_report = self.create_readable_report(comprehensive_report)
        with open(report_file, 'w', encoding='utf-8') as f:
            f.write(readable_report)
        
        print(f"💾 Results saved:")
        print(f"   📄 Summary Report: {report_file}")
        
        return report_file
    
    def analyze_all_documents(self, output_dir: str = None) -> Dict[str, Any]:
        """Main method to analyze all medical documents in docs2 folder"""
        print("🚀 Starting Medical Report Analysis")
        print(f"📁 Analyzing documents from: {self.docs_folder}")
        
        try:
            # Step 1: Get all medical documents
            document_paths = self.get_medical_documents()
            
            if not document_paths:
                print("❌ No documents found to analyze")
                return {}
            
            print(f"📊 Found {len(document_paths)} documents to analyze")
            
            # Step 2: Analyze each document
            for i, doc_path in enumerate(document_paths, 1):
                doc_analysis = self.analyze_medical_document(doc_path, i)
                self.extracted_data.append(doc_analysis)
            
            # Step 3: Generate comprehensive report
            comprehensive_report = self.generate_comprehensive_report()
            
            # Step 4: Save results
            report_file = self.save_results(comprehensive_report, output_dir)
            
            print("✅ Medical report analysis completed successfully!")
            print(f"📈 Summary: {len(self.extracted_data)} documents analyzed")
            
            return comprehensive_report
            
        except Exception as e:
            print(f"❌ Error during analysis: {str(e)}")
            raise

def main():
    """Main function to run the medical report analyzer"""
    print("=" * 100)
    print("MEDICAL REPORT ANALYZER - GPT-4o Vision")
    print("Comprehensive Medical Document Analysis System")
    print("=" * 100)
    
    try:
        # Initialize analyzer
        analyzer = MedicalReportAnalyzer()
        
        # Run analysis
        results = analyzer.analyze_all_documents()
        
        if results:
            # Display quick summary
            print("\n" + "=" * 60)
            print("ANALYSIS COMPLETE - QUICK SUMMARY")
            print("=" * 60)
            
            metadata = results["report_metadata"]
            exec_summary = results["executive_summary"]
            
            print(f"📋 Documents Processed: {metadata['successful_analyses']}/{metadata['total_documents_analyzed']}")
            print(f"🏥 Diagnoses Found: {exec_summary['total_unique_diagnoses']}")
            print(f"💊 Medications Identified: {exec_summary['total_medications']}")
            print(f"🔍 Symptoms Reported: {exec_summary['total_symptoms_reported']}")
            print(f"🚨 Critical Alerts: {exec_summary['critical_alerts']}")
            print(f"� Key Findings: {exec_summary['total_findings']}")
            
            # Show key findings
            clinical = results["clinical_overview"]
            if clinical["primary_diagnoses"]:
                print(f"\n🏥 Key Diagnoses:")
                for diagnosis in clinical["primary_diagnoses"][:3]:  # Show top 3
                    print(f"   • {diagnosis}")
            
            if clinical["key_medical_findings"]:
                print(f"\n� Key Medical Findings:")
                for finding in clinical["key_medical_findings"][:3]:  # Show top 3
                    print(f"   • {finding}")
            
            print("\n✅ Analysis complete! Check the generated summary report for detailed medical analysis.")
        else:
            print("⚠️  No analysis results generated")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        print("Please check the error details and try again.")

if __name__ == "__main__":
    main()
