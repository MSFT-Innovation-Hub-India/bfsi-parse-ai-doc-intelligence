import os
import json
import base64
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any
import fitz  # PyMuPDF for PDF handling
import tempfile
import sys
import argparse

# Add parent directory to path for config import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config import AzureOpenAIConfig, get_openai_client
from prompt_manager import get_generic_document_analysis_prompt, get_generic_document_system_prompt

# Initialize Azure OpenAI client from environment
client = get_openai_client()

class GenericDocumentAnalyzer:
    """Analyze any type of document (medical, legal, financial, general, etc.) and generate comprehensive summaries"""
    
    def __init__(self, docs_folder: str = None, file_paths: List[str] = None):
        """
        Initialize the analyzer
        
        Args:
            docs_folder: Path to folder containing documents (used if file_paths is None)
            file_paths: List of specific file paths to analyze (overrides docs_folder)
        """
        self.file_paths = file_paths
        
        if file_paths is None:
            if docs_folder is None:
                self.docs_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs2")
            else:
                self.docs_folder = docs_folder
        else:
            self.docs_folder = None
        
        self.extracted_data = []
        self.summary = {
            "total_documents": 0,
            "processing_timestamp": datetime.now().isoformat(),
            "documents_processed": [],
            "analysis_type": "Generic Document Analysis"
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
            total_pages = len(pdf_document)
            
            for page_num in range(total_pages):
                page = pdf_document.load_page(page_num)
                mat = fitz.Matrix(2.0, 2.0)  # High resolution
                pix = page.get_pixmap(matrix=mat)
                
                image_path = os.path.join(temp_dir, f"{os.path.basename(pdf_path)}_page_{page_num+1}.png")
                pix.save(image_path)
                image_paths.append(image_path)
            
            pdf_document.close()
            print(f"✅ Converted {total_pages} page(s) to images")
            return image_paths
            
        except Exception as e:
            print(f"❌ Error converting PDF: {str(e)}")
            return []
    
    def get_documents(self) -> List[str]:
        """Get all document images from docs2 folder or from specified file paths"""
        
        # If specific file paths were provided, use them
        if self.file_paths:
            print(f"📁 Using {len(self.file_paths)} file(s) provided from command line")
            valid_paths = []
            for file_path in self.file_paths:
                abs_path = os.path.abspath(file_path)
                if os.path.isfile(abs_path):
                    valid_paths.append(abs_path)
                    print(f"   📄 Found: {os.path.basename(abs_path)}")
                else:
                    print(f"   ⚠️  File not found: {file_path}")
            
            if not valid_paths:
                print("❌ No valid files found")
            return sorted(valid_paths)
        
        # Otherwise, scan the docs folder
        print(f"📁 Scanning for documents in: {self.docs_folder}")
        
        if not os.path.exists(self.docs_folder):
            raise FileNotFoundError(f"Documents folder not found: {self.docs_folder}")
        
        # Supported formats (images and PDFs)
        supported_formats = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.pdf', '.webp'}
        
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
    
    def analyze_document(self, image_path: str, doc_number: int) -> Dict[str, Any]:
        """Analyze a single document and extract comprehensive information"""
        doc_name = os.path.basename(image_path)
        print(f"🔍 Analyzing document {doc_number}: {doc_name}")
        
        try:
            # Handle PDF files by converting to images first
            if image_path.lower().endswith('.pdf'):
                print(f"📄 PDF detected, converting to images...")
                image_paths = self.convert_pdf_to_images(image_path)
                if not image_paths:
                    raise Exception("Unable to convert PDF to images")
                
                # Analyze ALL pages of the PDF for comprehensive analysis
                print(f"📊 Analyzing all {len(image_paths)} page(s) of the PDF...")
                all_pages_data = []
                
                for page_num, page_path in enumerate(image_paths, 1):
                    print(f"   📄 Analyzing page {page_num}/{len(image_paths)}...")
                    page_base64 = self.encode_image(page_path)
                    all_pages_data.append({
                        "page_number": page_num,
                        "image_base64": page_base64
                    })
                
                # Use all pages for comprehensive analysis
                actual_image_path = None  # Will handle multiple pages
            else:
                actual_image_path = image_path
                all_pages_data = None
            
            # Prepare content for analysis
            if all_pages_data:
                # Multi-page PDF analysis
                content_parts = [
                    {
                        "type": "text",
                        "text": f"This is a multi-page document with {len(all_pages_data)} pages. Analyze ALL pages comprehensively and extract information from the ENTIRE document."
                    }
                ]
                for page_data in all_pages_data:
                    content_parts.append({
                        "type": "text",
                        "text": f"\n--- PAGE {page_data['page_number']} ---"
                    })
                    content_parts.append({
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{page_data['image_base64']}"
                        }
                    })
            else:
                # Single image analysis
                base64_image = self.encode_image(actual_image_path)
                content_parts = None
            
            # Load prompts from external files
            analysis_prompt = get_generic_document_analysis_prompt()
            system_prompt = get_generic_document_system_prompt()
            
            # Call Azure OpenAI Vision API
            if content_parts:
                # Multi-page analysis
                user_content = [{"type": "text", "text": analysis_prompt}] + content_parts
            else:
                # Single page analysis
                user_content = [
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
            
            response = client.chat.completions.create(
                model=AzureOpenAIConfig.DEPLOYMENT,
                messages=[
                    {
                        "role": "system",
                        "content": system_prompt
                    },
                    {
                        "role": "user",
                        "content": user_content
                    }
                ],
                max_tokens=16000,  # Increased significantly for multi-page analysis
                temperature=0.1,  # Very low temperature for maximum accuracy and detail
                top_p=0.95
            )
            
            # Get the response text
            response_text = response.choices[0].message.content
            
            # Display the complete response in terminal
            print("\n" + "=" * 100)
            print(f"ANALYSIS RESULT FOR: {doc_name}")
            print("=" * 100 + "\n")
            print(response_text)
            print("\n" + "=" * 100 + "\n")
            
            # Return simple structure for record keeping
            document_analysis = {
                "document_number": doc_number,
                "document_name": doc_name,
                "document_path": image_path,
                "analysis_timestamp": datetime.now().isoformat(),
                "analysis_successful": True,
                "response": response_text
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
    
    def analyze_document_with_custom_prompt(self, image_path: str, custom_prompt: str, 
                                             model_name: str = None, temperature: float = 0.3, 
                                             max_tokens: int = 4000, doc_number: int = 1) -> Dict[str, Any]:
        """Analyze a single document with custom instructions and parameters"""
        doc_name = os.path.basename(image_path)
        print(f"🔍 Analyzing document {doc_number}: {doc_name} (Custom Analysis)")
        
        try:
            # Handle PDF files by converting to images first
            if image_path.lower().endswith('.pdf'):
                print(f"📄 PDF detected, converting to images...")
                image_paths = self.convert_pdf_to_images(image_path)
                if not image_paths:
                    raise Exception("Unable to convert PDF to images")
                
                # Analyze ALL pages of the PDF for comprehensive analysis
                print(f"📊 Analyzing all {len(image_paths)} page(s) of the PDF...")
                all_pages_data = []
                
                for page_num, page_path in enumerate(image_paths, 1):
                    print(f"   📄 Analyzing page {page_num}/{len(image_paths)}...")
                    page_base64 = self.encode_image(page_path)
                    all_pages_data.append({
                        "page_number": page_num,
                        "image_base64": page_base64
                    })
                
                # Use all pages for comprehensive analysis
                actual_image_path = None  # Will handle multiple pages
            else:
                actual_image_path = image_path
                all_pages_data = None
            
            # Prepare content for analysis
            if all_pages_data:
                # Multi-page PDF analysis
                content_parts = [
                    {
                        "type": "text",
                        "text": f"This is a multi-page document with {len(all_pages_data)} pages. Analyze ALL pages comprehensively and extract information from the ENTIRE document."
                    }
                ]
                for page_data in all_pages_data:
                    content_parts.append({
                        "type": "text",
                        "text": f"\n--- PAGE {page_data['page_number']} ---"
                    })
                    content_parts.append({
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{page_data['image_base64']}"
                        }
                    })
            else:
                # Single image analysis
                base64_image = self.encode_image(actual_image_path)
                content_parts = None
            
            # Use custom prompt provided by user
            analysis_prompt = custom_prompt
            
            # Call Azure OpenAI Vision API with custom parameters
            if content_parts:
                # Multi-page analysis
                user_content = [{"type": "text", "text": analysis_prompt}] + content_parts
            else:
                # Single page analysis
                user_content = [
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
            
            # Use custom model name if provided, otherwise use default deployment
            actual_model = model_name if model_name else deployment
            
            response = client.chat.completions.create(
                model=actual_model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert document analyst. Follow the user's instructions precisely and provide thorough, professional analysis."
                    },
                    {
                        "role": "user",
                        "content": user_content
                    }
                ],
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=0.95
            )
            
            # Get the response text
            response_text = response.choices[0].message.content
            
            # Display the complete response in terminal
            print("\n" + "=" * 100)
            print(f"CUSTOM ANALYSIS RESULT FOR: {doc_name}")
            print("=" * 100 + "\n")
            print(response_text)
            print("\n" + "=" * 100 + "\n")
            
            # Return simple structure for record keeping
            document_analysis = {
                "document_number": doc_number,
                "document_name": doc_name,
                "document_path": image_path,
                "analysis_timestamp": datetime.now().isoformat(),
                "analysis_successful": True,
                "response": response_text
            }
            
            print(f"✅ Document {doc_number} analyzed successfully with custom instructions")
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
        """Generate a simple summary report"""
        successful_analyses = []
        failed_analyses = []
        
        for doc_analysis in self.extracted_data:
            if doc_analysis.get("analysis_successful", False):
                successful_analyses.append(doc_analysis)
            else:
                failed_analyses.append(doc_analysis)
        
        # Create simple report
        comprehensive_report = {
            "report_metadata": {
                "generation_timestamp": datetime.now().isoformat(),
                "total_documents_analyzed": len(self.extracted_data),
                "successful_analyses": len(successful_analyses),
                "failed_analyses": len(failed_analyses)
            },
            "detailed_analysis": successful_analyses,
            "processing_errors": failed_analyses if failed_analyses else None
        }
        
        return comprehensive_report
    
    def create_readable_report(self, comprehensive_report: Dict[str, Any]) -> str:
        """No longer needed - analysis is shown in terminal"""
        return ""
    
    def save_results(self, comprehensive_report: Dict[str, Any], output_dir: str = None) -> str:
        """No file saving - analysis is displayed in terminal only"""
        return None
    
    def analyze_all_documents(self, output_dir: str = None) -> Dict[str, Any]:
        """Main method to analyze all documents in docs2 folder or specified files"""
        print("🚀 Starting Document Analysis")
        
        if self.file_paths:
            print(f"📁 Analyzing {len(self.file_paths)} file(s) from command line")
        else:
            print(f"📁 Analyzing documents from: {self.docs_folder}")
        
        try:
            # Step 1: Get all documents
            document_paths = self.get_documents()
            
            if not document_paths:
                print("❌ No documents found to analyze")
                return {}
            
            print(f"📊 Found {len(document_paths)} documents to analyze")
            
            # Step 2: Analyze each document
            for i, doc_path in enumerate(document_paths, 1):
                doc_analysis = self.analyze_document(doc_path, i)
                self.extracted_data.append(doc_analysis)
            
            # Step 3: Generate simple report
            comprehensive_report = self.generate_comprehensive_report()
            
            print("\n✅ Document analysis completed successfully!")
            print(f"📈 Summary: {len(self.extracted_data)} documents analyzed")
            
            return comprehensive_report
            
        except Exception as e:
            print(f"❌ Error during analysis: {str(e)}")
            raise

def main():
    """Main function to run the generic document analyzer"""
    
    # Set up argument parser
    parser = argparse.ArgumentParser(
        description='Generic Document Analyzer - Analyze any type of document (medical, legal, financial, etc.)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  # Analyze all documents in docs2 folder
  python generic_document_analyzer_final.py
  
  # Analyze specific files
  python generic_document_analyzer_final.py file1.pdf file2.jpg file3.png
  
  # Analyze files with custom output directory
  python generic_document_analyzer_final.py file1.pdf -o ./reports
  
  # Analyze documents from a specific folder
  python generic_document_analyzer_final.py --folder ./mydocs
        '''
    )
    
    parser.add_argument('files', nargs='*', help='One or more files to analyze (supports PDF, JPG, PNG, etc.)')
    parser.add_argument('-f', '--folder', help='Folder containing documents to analyze (default: docs2)')
    parser.add_argument('-o', '--output', help='Output directory for reports (default: current script directory)')
    
    args = parser.parse_args()
    
    print("=" * 100)
    print("GENERIC DOCUMENT ANALYZER - GPT-4 Vision")
    print("Comprehensive Document Analysis System for Any Document Type")
    print("=" * 100)
    
    try:
        # Determine what to analyze
        if args.files:
            # Analyze specific files provided as arguments
            analyzer = GenericDocumentAnalyzer(file_paths=args.files)
        elif args.folder:
            # Analyze documents from specified folder
            analyzer = GenericDocumentAnalyzer(docs_folder=args.folder)
        else:
            # Default: analyze documents from docs2 folder
            analyzer = GenericDocumentAnalyzer()
        
        # Run analysis - results are already displayed in terminal
        results = analyzer.analyze_all_documents(output_dir=args.output)
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        print("Please check the error details and try again.")
        sys.exit(1)

if __name__ == "__main__":
    main()
