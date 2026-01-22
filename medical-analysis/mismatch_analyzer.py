import os
import json
import base64
from datetime import datetime
from typing import List, Dict, Any
import fitz  # PyMuPDF
import tempfile
import sys

# Add parent directory to path for config import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config import AzureOpenAIConfig, get_openai_client

# Initialize Azure OpenAI client from environment
client = get_openai_client()

def encode_image(image_path: str) -> str:
    """Encode image to base64 string"""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def convert_pdf_to_images(pdf_path: str) -> List[str]:
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
        print(f"✅ Converted to {len(image_paths)} images")
        return image_paths
        
    except Exception as e:
        print(f"❌ Error converting PDF: {str(e)}")
        return []

def extract_document_items(file_path: str) -> dict:
    """Extract items from a document (medications, procedures, services)"""
    print(f"🔍 Extracting items from: {os.path.basename(file_path)}")
    
    try:
        # Handle PDF files by converting to images first
        if file_path.lower().endswith('.pdf'):
            print(f"📄 PDF detected, converting to images...")
            image_paths = convert_pdf_to_images(file_path)
            if not image_paths:
                return {
                    "error": "Unable to convert PDF to images",
                    "file_path": file_path,
                    "document_type": "bill",
                    "medications": [],
                    "procedures": [],
                    "services": [],
                    "diagnoses": []
                }
            # Use the first page for analysis
            image_path = image_paths[0]
            print(f"✅ Using converted image: {os.path.basename(image_path)}")
        else:
            image_path = file_path
            
        base64_image = encode_image(image_path)
        
        prompt = """
        Extract ALL items mentioned in this medical document. Focus on:
        
        1. MEDICATIONS/DRUGS (prescribed or administered)
        2. MEDICAL PROCEDURES (performed or planned)
        3. MEDICAL SERVICES (consultations, tests, treatments)
        4. DIAGNOSES (conditions identified)
        
        Return response in this JSON format:
        {
            "document_type": "prescription/bill/medical_record/lab_report",
            "document_date": "date if visible",
            "provider": "hospital/clinic name",
            "medications": [
                {
                    "name": "exact drug name as written",
                    "generic_name": "generic equivalent if different",
                    "route": "oral/IV/IM/topical etc",
                    "indication": "reason for prescription if mentioned"
                }
            ],
            "procedures": [
                {
                    "name": "procedure name",
                    "type": "diagnostic/therapeutic/surgical",
                    "indication": "reason if mentioned"
                }
            ],
            "services": [
                {
                    "name": "consultation/test/treatment name",
                    "type": "consultation/diagnostic/therapeutic",
                    "department": "specialty if mentioned"
                }
            ],
            "diagnoses": [
                {
                    "condition": "diagnosis name",
                    "type": "primary/secondary/suspected",
                    "icd_code": "code if visible"
                }
            ],
            "summary": "brief description of document content and purpose"
        }
        
        Extract ALL items mentioned, even if briefly. Be thorough and accurate.
        Use exact names as written in the document.
        """
        
        response = client.chat.completions.create(
            model=AzureOpenAIConfig.DEPLOYMENT,
            messages=[
                {
                    "role": "system",
                    "content": "You are a medical documentation specialist. Extract comprehensive item lists from medical documents."
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}"}}
                    ]
                }
            ],
            max_completion_tokens=2048,
            temperature=0.1
        )
        
        response_text = response.choices[0].message.content
        
        # Parse JSON response
        try:
            # Remove markdown code blocks if present
            if '```json' in response_text:
                json_start = response_text.find('```json') + 7
                json_end = response_text.find('```', json_start)
                if json_end != -1:
                    json_text = response_text[json_start:json_end].strip()
                else:
                    json_text = response_text[json_start:].strip()
            elif '```' in response_text:
                json_start = response_text.find('```') + 3
                json_end = response_text.find('```', json_start)
                if json_end != -1:
                    json_text = response_text[json_start:json_end].strip()
                else:
                    json_text = response_text[json_start:].strip()
            else:
                json_start = response_text.find('{')
                json_end = response_text.rfind('}') + 1
                if json_start != -1 and json_end > json_start:
                    json_text = response_text[json_start:json_end]
                else:
                    print(f"❌ No JSON found in extract_document_items response")
                    print(f"Response preview: {response_text[:500]}")
                    return {
                        "error": "No JSON found in response", 
                        "file_name": os.path.basename(file_path),
                        "file_path": file_path,
                        "medications": [],
                        "procedures": [],
                        "services": [],
                        "diagnoses": []
                    }
            
            result = json.loads(json_text)
            result["file_name"] = os.path.basename(file_path)
            result["file_path"] = file_path
            return result
        except json.JSONDecodeError as e:
            print(f"❌ JSON parsing failed in extract_document_items: {str(e)}")
            print(f"Response preview: {response_text[:500]}")
            print(f"Attempted to parse: {json_text[:200] if 'json_text' in locals() else 'N/A'}")
            return {
                "error": f"JSON parsing failed: {str(e)}", 
                "file_name": os.path.basename(file_path),
                "file_path": file_path,
                "medications": [],
                "procedures": [],
                "services": [],
                "diagnoses": []
            }
            
    except Exception as e:
        return {
            "error": str(e), 
            "file_name": os.path.basename(file_path),
            "file_path": file_path,
            "medications": [],
            "procedures": [],
            "services": [],
            "diagnoses": []
        }

def find_bill_to_docs_mismatches(bill_data: Dict, medical_docs: List[Dict]) -> dict:
    """Find mismatches between bill and medical documents - focus on bill vs docs comparison"""
    print("🔄 Analyzing mismatches between BILL and MEDICAL DOCUMENTS...")
    
    try:
        # Prepare data for analysis
        analysis_data = {
            "bill_document": bill_data,
            "medical_documents": medical_docs
        }
        analysis_text = json.dumps(analysis_data, indent=2)
        
        prompt = f"""
        Compare BILL vs MEDICAL RECORDS with EXTREME ACCURACY:
        
        CRITICAL RULES:
        1. If you don't recognize or understand a drug/generic name - IGNORE IT, don't flag it
        2. Only flag medications you are ABSOLUTELY CERTAIN about
        3. Match intelligently: brand names, generic names, abbreviations (e.g., "Paracetamol" = "PCM" = "Acetaminophen")
        4. Consider common medical abbreviations (e.g., "Inj." = "Injection", "Tab" = "Tablet")
        5. If there's ANY doubt about whether a medication matches - treat it as a match, don't flag as mismatch
        6. Only report TRUE mismatches where you are 100% confident the medication is absent
        
        When in doubt - DON'T flag it. Accuracy over completeness.
        
        DATA:
        {analysis_text}
        
        Return ONLY valid JSON (no markdown, no extra text):
        {{
            "bill_vs_medical_mismatches": {{
                "medications_billed_but_not_in_medical_records": [
                    {{"medication": "exact name from bill", "concern": "Professional description of the discrepancy and clinical context"}}
                ],
                "medications_in_medical_records_but_not_billed": [
                    {{"medication": "exact name from medical record", "found_in": ["document names"], "concern": "Professional assessment of unbilled medication"}}
                ],
                "procedures_billed_but_not_documented": [
                    {{"procedure": "name", "concern": "Professional clinical assessment"}}
                ]
            }},
            "revenue_impact_analysis": {{
                "potential_revenue_leakage": {{
                    "unbilled_medications": ["list only medications that are genuinely not billed"],
                    "estimated_impact": "HIGH/MEDIUM/LOW"
                }},
                "potential_fraud_indicators": {{
                    "phantom_billing": ["list only items that are genuinely phantom - not just name variations"],
                    "risk_level": "HIGH/MEDIUM/LOW"
                }}
            }},
            "recommendations": {{
                "fraud_investigation_items": ["Professional, actionable recommendations for investigation"],
                "revenue_recovery_actions": ["Professional, actionable revenue recovery recommendations"]
            }}
        }}
        
        IMPORTANT: 
        - ACCURACY IS CRITICAL - only flag medications you are 100% certain about
        - If you don't recognize a drug name or are unsure - IGNORE IT, don't include it
        - Be conservative - only flag TRUE mismatches, never flag uncertain cases
        - If a medication appears in both but with different names, DON'T flag it as mismatch
        - Write all concerns and recommendations in PROFESSIONAL medical billing audit language
        - Use clinical terminology and maintain formal, objective tone
        - Return empty arrays [] if no genuine mismatches found or if uncertain
        - Return ONLY the JSON object
        """
        
        response = client.chat.completions.create(
            model=AzureOpenAIConfig.DEPLOYMENT,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert medical billing auditor conducting a professional compliance audit. CRITICAL: Only report medications you are 100% certain about. If you don't recognize or understand a drug/generic name - IGNORE IT completely. Match medications intelligently across brand/generic/abbreviations. When uncertain - DON'T flag it. Use professional medical billing audit language - be formal, clinical, and objective. Avoid casual phrases. Accuracy is more important than completeness. Return ONLY valid JSON, no markdown."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            max_completion_tokens=4000,
            temperature=0.1
        )
        
        response_text = response.choices[0].message.content
        
        # Parse JSON response
        try:
            # Remove markdown code blocks if present
            if '```json' in response_text:
                json_start = response_text.find('```json') + 7
                json_end = response_text.find('```', json_start)
                if json_end != -1:
                    json_text = response_text[json_start:json_end].strip()
                else:
                    json_text = response_text[json_start:].strip()
            elif '```' in response_text:
                json_start = response_text.find('```') + 3
                json_end = response_text.find('```', json_start)
                if json_end != -1:
                    json_text = response_text[json_start:json_end].strip()
                else:
                    json_text = response_text[json_start:].strip()
            else:
                json_start = response_text.find('{')
                json_end = response_text.rfind('}') + 1
                if json_start != -1 and json_end > json_start:
                    json_text = response_text[json_start:json_end]
                else:
                    print(f"❌ No JSON found in response")
                    print(f"Response preview: {response_text[:500]}")
                    return {"error": "No JSON found in response"}
            
            result = json.loads(json_text)
            return result
        except json.JSONDecodeError as e:
            print(f"❌ JSON parsing failed: {str(e)}")
            print(f"Response preview: {response_text[:500]}")
            print(f"Attempted to parse: {json_text[:200] if 'json_text' in locals() else 'N/A'}")
            return {"error": f"Failed to parse JSON response: {str(e)}"}
            
    except Exception as e:
        return {"error": f"Analysis failed: {str(e)}"}

def find_document_mismatches(document_extracts: List[Dict]) -> dict:
    """Find mismatches between documents (items in one document but not in others)"""
    print("🔄 Analyzing mismatches between documents...")
    
    try:
        extracts_text = json.dumps(document_extracts, indent=2)
        
        prompt = f"""
        Analyze these medical documents to find MISMATCHES and DISCREPANCIES with EXTREME ACCURACY:
        
        CRITICAL RULES FOR ACCURATE CROSS-REFERENCING:
        1. MEDICATION MATCHING:
           - Match brand names to generic names (e.g., "Crocin" = "Paracetamol" = "PCM")
           - Match abbreviations (e.g., "Inj." = "Injection", "Tab" = "Tablet", "Cap" = "Capsule")
           - Match route variations ("IV" = "Intravenous", "IM" = "Intramuscular", "PO" = "Oral")
           - If you don't recognize a drug name - IGNORE IT, don't flag as mismatch
           - Only flag TRUE absences, not name variations
        
        2. PROCEDURE MATCHING:
           - Match medical procedure synonyms and abbreviations
           - Consider standard procedure variations
           - Only flag if genuinely absent, not just named differently
        
        3. WHEN IN DOUBT - DON'T FLAG IT:
           - Accuracy over completeness
           - Only report 100% certain mismatches
           - Empty arrays are better than false positives
        
        4. PROFESSIONAL LANGUAGE:
           - Use formal medical audit terminology
           - Be clinical and objective
           - Avoid casual phrases
        
        DOCUMENTS:
        {extracts_text}
        
        Identify mismatches in this JSON format:
        {{
            "analysis_summary": {{
                "total_documents": {len(document_extracts)},
                "document_types_found": ["list of document types"],
                "analysis_focus": "mismatch_detection_between_documents"
            }},
            "medication_mismatches": {{
                "prescribed_but_not_billed": [
                    {{
                        "medication": "drug name",
                        "found_in": "document name/type where prescribed",
                        "missing_from": ["document types where it should appear but doesn't"],
                        "concern": "potential revenue leakage or fraud"
                    }}
                ],
                "billed_but_not_prescribed": [
                    {{
                        "medication": "drug name",
                        "found_in": "billing document",
                        "missing_from": ["prescription/medical record"],
                        "concern": "potential phantom billing"
                    }}
                ],
                "name_discrepancies": [
                    {{
                        "brand_name": "brand name used",
                        "generic_name": "generic name used",
                        "documents": ["where each appears"],
                        "concern": "billing confusion or substitution issues"
                    }}
                ]
            }},
            "procedure_mismatches": {{
                "mentioned_but_not_billed": [
                    {{
                        "procedure": "procedure name",
                        "mentioned_in": "document where referenced",
                        "missing_from": ["billing documents"],
                        "concern": "potential unbilled service"
                    }}
                ],
                "billed_but_not_documented": [
                    {{
                        "procedure": "procedure name", 
                        "billed_in": "billing document",
                        "missing_from": ["medical records"],
                        "concern": "potential phantom billing"
                    }}
                ]
            }},
            "service_mismatches": {{
                "provided_but_not_billed": [
                    {{
                        "service": "service name",
                        "documented_in": "document where mentioned",
                        "missing_from": ["billing records"],
                        "concern": "revenue leakage"
                    }}
                ],
                "billed_but_not_provided": [
                    {{
                        "service": "service name",
                        "billed_in": "billing document", 
                        "missing_from": ["service records"],
                        "concern": "potential fraud"
                    }}
                ]
            }},
            "diagnosis_mismatches": {{
                "diagnosed_but_no_treatment": [
                    {{
                        "diagnosis": "condition name",
                        "found_in": "diagnostic document",
                        "expected_treatment": "treatments that should follow",
                        "concern": "incomplete care or missing billing"
                    }}
                ],
                "treatment_without_diagnosis": [
                    {{
                        "treatment": "medication or procedure",
                        "found_in": "treatment document",
                        "missing_diagnosis": "condition that would justify treatment",
                        "concern": "unnecessary treatment or fraud"
                    }}
                ]
            }},
            "cross_document_inconsistencies": [
                {{
                    "inconsistency": "description of what doesn't match",
                    "documents_involved": ["list of documents with conflicting info"],
                    "impact": "revenue/fraud/clinical impact",
                    "recommendation": "action to resolve"
                }}
            ],
            "revenue_leakage_indicators": [
                {{
                    "indicator": "specific mismatch indicating lost revenue",
                    "evidence": "documents showing the gap",
                    "estimated_impact": "HIGH/MEDIUM/LOW"
                }}
            ],
            "fraud_indicators": [
                {{
                    "indicator": "specific mismatch suggesting fraud",
                    "evidence": "documents showing the discrepancy", 
                    "risk_level": "HIGH/MEDIUM/LOW"
                }}
            ],
            "recommendations": {{
                "immediate_actions": [
                    "urgent items to investigate or correct"
                ],
                "documentation_improvements": [
                    "ways to prevent future mismatches"
                ],
                "billing_corrections": [
                    "items that need billing review"
                ],
                "clinical_reviews": [
                    "treatments that need medical review"
                ]
            }}
        }}
        
        CRITICAL REMINDERS:
        - Match medications intelligently (brand = generic, abbreviations)
        - If uncertain about a drug name - IGNORE IT completely
        - Only flag 100% certain mismatches
        - Use professional medical audit language in all descriptions
        - Be specific about what's missing where
        - Focus on presence/absence of items, not costs or quantities
        - Return empty arrays if no genuine mismatches found
        """
        
        response = client.chat.completions.create(
            model=AzureOpenAIConfig.DEPLOYMENT,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert medical audit specialist with deep pharmaceutical knowledge. CRITICAL: Match medications intelligently across brand/generic names and abbreviations. Only flag TRUE mismatches where items are genuinely absent - never flag name variations. If you don't recognize a drug name, IGNORE it. Use professional medical audit language. Accuracy is more important than finding all possible issues. Return ONLY valid JSON."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            max_completion_tokens=4000,
            temperature=0.05
        )
        
        response_text = response.choices[0].message.content
        
        # Parse JSON response
        try:
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            if json_start != -1 and json_end != -1:
                json_text = response_text[json_start:json_end]
                return json.loads(json_text)
            else:
                return {"error": "No JSON found in response"}
        except json.JSONDecodeError:
            return {"error": "Failed to parse JSON response"}
            
    except Exception as e:
        return {"error": f"Analysis failed: {str(e)}"}

def display_document_extracts(extracts: List[Dict]):
    """Display what was extracted from each document"""
    print("\n📄 DOCUMENT EXTRACTS")
    print("="*60)
    
    for i, extract in enumerate(extracts, 1):
        if "error" not in extract:
            print(f"\n{i}. {extract.get('file_name', 'Unknown')} ({extract.get('document_type', 'Unknown')})")
            print(f"   Provider: {extract.get('provider', 'Unknown')}")
            print(f"   Date: {extract.get('document_date', 'Unknown')}")
            
            # Medications
            medications = extract.get('medications', [])
            if medications:
                print(f"   Medications ({len(medications)}):")
                for med in medications:
                    route = f" ({med.get('route', 'unknown route')})" if med.get('route') else ""
                    print(f"      💊 {med.get('name', 'Unknown')}{route}")
            
            # Procedures
            procedures = extract.get('procedures', [])
            if procedures:
                print(f"   Procedures ({len(procedures)}):")
                for proc in procedures:
                    print(f"      🏥 {proc.get('name', 'Unknown')} ({proc.get('type', 'unknown type')})")
            
            # Services
            services = extract.get('services', [])
            if services:
                print(f"   Services ({len(services)}):")
                for service in services:
                    print(f"      🔬 {service.get('name', 'Unknown')} ({service.get('type', 'unknown type')})")
            
            # Diagnoses
            diagnoses = extract.get('diagnoses', [])
            if diagnoses:
                print(f"   Diagnoses ({len(diagnoses)}):")
                for dx in diagnoses:
                    print(f"      🩺 {dx.get('condition', 'Unknown')} ({dx.get('type', 'unknown type')})")
            
            print(f"   Summary: {extract.get('summary', 'No summary')}")
        else:
            print(f"\n{i}. {extract.get('file_name', 'Unknown')} - ❌ Error: {extract.get('error', 'Unknown')}")

def display_bill_vs_docs_analysis(analysis: Dict):
    """Display bill vs medical documents analysis results"""
    print("\n🔍 BILL vs MEDICAL DOCUMENTS ANALYSIS")
    print("="*60)
    
    if "error" in analysis:
        print(f"❌ Analysis Error: {analysis['error']}")
        return
    
    # Summary
    summary = analysis.get('analysis_summary', {})
    print(f"📊 Analysis Summary:")
    print(f"   Bill Document: {summary.get('bill_document', 'Unknown')}")
    print(f"   Medical Documents: {summary.get('medical_documents_count', 'Unknown')} documents")
    
    # Bill vs Medical Mismatches
    print(f"\n💰 BILL vs MEDICAL RECORDS MISMATCHES")
    mismatches = analysis.get('bill_vs_medical_mismatches', {})
    
    # Medications billed but not in medical records
    billed_not_medical = mismatches.get('medications_billed_but_not_in_medical_records', [])
    if billed_not_medical:
        print(f"   🚨 Medications BILLED but NOT in Medical Records ({len(billed_not_medical)}):")
        for item in billed_not_medical:
            print(f"      💰➡️❌ {item.get('medication', 'Unknown')}")
            print(f"         Billed in: {item.get('billed_in', 'Unknown')}")
            print(f"         Searched in: {', '.join(item.get('searched_in', ['Unknown']))}")
            print(f"         Concern: {item.get('concern', 'Unknown')}")
    else:
        print(f"   ✅ All billed medications found in medical records")
    
    # Medications in medical records but not billed
    medical_not_billed = mismatches.get('medications_in_medical_records_but_not_billed', [])
    if medical_not_billed:
        print(f"   💸 Medications in Medical Records but NOT BILLED ({len(medical_not_billed)}):")
        for item in medical_not_billed:
            print(f"      📋➡️💰 {item.get('medication', 'Unknown')}")
            print(f"         Found in: {', '.join(item.get('found_in', ['Unknown']))}")
            print(f"         Missing from: {item.get('missing_from', 'Unknown')}")
            print(f"         Concern: {item.get('concern', 'Unknown')}")
    else:
        print(f"   ✅ All medical record medications appear to be billed")
    
    # Procedures billed but not documented
    proc_billed_not_doc = mismatches.get('procedures_billed_but_not_documented', [])
    if proc_billed_not_doc:
        print(f"   🚨 Procedures BILLED but NOT DOCUMENTED ({len(proc_billed_not_doc)}):")
        for item in proc_billed_not_doc:
            print(f"      💰➡️❌ {item.get('procedure', 'Unknown')}")
            print(f"         Concern: {item.get('concern', 'Unknown')}")
    
    # Services documented but not billed
    services_doc_not_billed = mismatches.get('services_documented_but_not_billed', [])
    if services_doc_not_billed:
        print(f"   💸 Services DOCUMENTED but NOT BILLED ({len(services_doc_not_billed)}):")
        for item in services_doc_not_billed:
            print(f"      📋➡️💰 {item.get('service', 'Unknown')}")
            print(f"         Documented in: {', '.join(item.get('documented_in', ['Unknown']))}")
    
    # Medication Name Discrepancies
    print(f"\n💊 MEDICATION NAME DISCREPANCIES")
    name_discrepancies = analysis.get('medication_name_discrepancies', [])
    if name_discrepancies:
        for discrepancy in name_discrepancies:
            same_drug = "✅" if discrepancy.get('likely_same_drug') == 'yes' else "❓"
            print(f"   {same_drug} Bill: '{discrepancy.get('bill_name', 'Unknown')}' ↔️ Medical Record: '{discrepancy.get('medical_record_name', 'Unknown')}'")
            print(f"      Type: {discrepancy.get('generic_vs_brand', 'Unknown')}")
            print(f"      Documents: {', '.join(discrepancy.get('documents', ['Unknown']))}")
    else:
        print(f"   ✅ No significant medication name discrepancies found")
    
    # Billing Completeness Assessment
    print(f"\n📊 BILLING COMPLETENESS ASSESSMENT")
    completeness = analysis.get('billing_completeness_assessment', {})
    print(f"   Medical Record Medications: {completeness.get('total_medications_in_medical_records', 'Unknown')}")
    print(f"   Billed Medications: {completeness.get('total_medications_in_bill', 'Unknown')}")
    print(f"   Properly Billed: {completeness.get('medications_properly_billed', 'Unknown')}")
    print(f"   Billing Coverage: {completeness.get('billing_coverage_percentage', 'Unknown')}")
    print(f"   Documentation Coverage: {completeness.get('documentation_coverage_percentage', 'Unknown')}")
    
    # Revenue Impact Analysis
    print(f"\n💰 REVENUE IMPACT ANALYSIS")
    revenue_impact = analysis.get('revenue_impact_analysis', {})
    
    revenue_leakage = revenue_impact.get('potential_revenue_leakage', {})
    print(f"   Revenue Leakage Impact: {revenue_leakage.get('estimated_impact', 'Unknown')}")
    
    unbilled_meds = revenue_leakage.get('unbilled_medications', [])
    if unbilled_meds:
        print(f"   Unbilled Medications:")
        for med in unbilled_meds:
            print(f"      💸 {med}")
    
    fraud_indicators = revenue_impact.get('potential_fraud_indicators', {})
    print(f"   Fraud Risk Level: {fraud_indicators.get('risk_level', 'Unknown')}")
    
    phantom_billing = fraud_indicators.get('phantom_billing', [])
    if phantom_billing:
        print(f"   Phantom Billing Indicators:")
        for item in phantom_billing:
            print(f"      🚨 {item}")
    
    # Recommendations
    print(f"\n📋 RECOMMENDATIONS")
    recommendations = analysis.get('recommendations', {})
    
    billing_corrections = recommendations.get('billing_corrections', [])
    if billing_corrections:
        print(f"   Billing Corrections:")
        for correction in billing_corrections:
            print(f"      💰 {correction}")
    
    revenue_recovery = recommendations.get('revenue_recovery_actions', [])
    if revenue_recovery:
        print(f"   Revenue Recovery:")
        for action in revenue_recovery:
            print(f"      💸 {action}")
    
    fraud_investigation = recommendations.get('fraud_investigation_items', [])
    if fraud_investigation:
        print(f"   Fraud Investigation:")
        for item in fraud_investigation:
            print(f"      🔍 {item}")

def display_mismatch_analysis(analysis: Dict):
    """Display mismatch analysis results"""
    print("\n🔍 MISMATCH ANALYSIS RESULTS")
    print("="*60)
    
    if "error" in analysis:
        print(f"❌ Analysis Error: {analysis['error']}")
        return
    
    # Summary
    summary = analysis.get('analysis_summary', {})
    print(f"📊 Analysis Summary:")
    print(f"   Total Documents: {summary.get('total_documents', 'Unknown')}")
    print(f"   Document Types: {', '.join(summary.get('document_types_found', ['Unknown']))}")
    
    # Medication Mismatches
    print(f"\n💊 MEDICATION MISMATCHES")
    med_mismatches = analysis.get('medication_mismatches', {})
    
    prescribed_not_billed = med_mismatches.get('prescribed_but_not_billed', [])
    if prescribed_not_billed:
        print(f"   Prescribed but NOT Billed ({len(prescribed_not_billed)}):")
        for item in prescribed_not_billed:
            print(f"      📋➡️💰 {item.get('medication', 'Unknown')}")
            print(f"         Found in: {item.get('found_in', 'Unknown')}")
            print(f"         Missing from: {', '.join(item.get('missing_from', ['Unknown']))}")
            print(f"         Concern: {item.get('concern', 'Unknown')}")
    
    billed_not_prescribed = med_mismatches.get('billed_but_not_prescribed', [])
    if billed_not_prescribed:
        print(f"   Billed but NOT Prescribed ({len(billed_not_prescribed)}):")
        for item in billed_not_prescribed:
            print(f"      💰➡️📋 {item.get('medication', 'Unknown')}")
            print(f"         Found in: {item.get('found_in', 'Unknown')}")
            print(f"         Missing from: {', '.join(item.get('missing_from', ['Unknown']))}")
            print(f"         Concern: {item.get('concern', 'Unknown')}")
    
    name_discrepancies = med_mismatches.get('name_discrepancies', [])
    if name_discrepancies:
        print(f"   Name Discrepancies ({len(name_discrepancies)}):")
        for item in name_discrepancies:
            print(f"      🔄 Brand: {item.get('brand_name', 'Unknown')} ↔️ Generic: {item.get('generic_name', 'Unknown')}")
            print(f"         Documents: {', '.join(item.get('documents', ['Unknown']))}")
    
    # Procedure Mismatches
    print(f"\n🏥 PROCEDURE MISMATCHES")
    proc_mismatches = analysis.get('procedure_mismatches', {})
    
    mentioned_not_billed = proc_mismatches.get('mentioned_but_not_billed', [])
    if mentioned_not_billed:
        print(f"   Mentioned but NOT Billed ({len(mentioned_not_billed)}):")
        for item in mentioned_not_billed:
            print(f"      📋➡️💰 {item.get('procedure', 'Unknown')}")
            print(f"         Mentioned in: {item.get('mentioned_in', 'Unknown')}")
            print(f"         Missing from: {', '.join(item.get('missing_from', ['Unknown']))}")
    
    billed_not_documented = proc_mismatches.get('billed_but_not_documented', [])
    if billed_not_documented:
        print(f"   Billed but NOT Documented ({len(billed_not_documented)}):")
        for item in billed_not_documented:
            print(f"      💰➡️📋 {item.get('procedure', 'Unknown')}")
            print(f"         Billed in: {item.get('billed_in', 'Unknown')}")
            print(f"         Missing from: {', '.join(item.get('missing_from', ['Unknown']))}")
    
    # Service Mismatches
    print(f"\n🔬 SERVICE MISMATCHES")
    service_mismatches = analysis.get('service_mismatches', {})
    
    provided_not_billed = service_mismatches.get('provided_but_not_billed', [])
    if provided_not_billed:
        print(f"   Provided but NOT Billed ({len(provided_not_billed)}):")
        for item in provided_not_billed:
            print(f"      📋➡️💰 {item.get('service', 'Unknown')}")
            print(f"         Documented in: {item.get('documented_in', 'Unknown')}")
    
    billed_not_provided = service_mismatches.get('billed_but_not_provided', [])
    if billed_not_provided:
        print(f"   Billed but NOT Provided ({len(billed_not_provided)}):")
        for item in billed_not_provided:
            print(f"      💰➡️📋 {item.get('service', 'Unknown')}")
            print(f"         Billed in: {item.get('billed_in', 'Unknown')}")
    
    # Cross-Document Inconsistencies
    print(f"\n⚠️ CROSS-DOCUMENT INCONSISTENCIES")
    inconsistencies = analysis.get('cross_document_inconsistencies', [])
    if inconsistencies:
        for i, inconsistency in enumerate(inconsistencies, 1):
            print(f"   {i}. {inconsistency.get('inconsistency', 'Unknown')}")
            print(f"      Documents: {', '.join(inconsistency.get('documents_involved', ['Unknown']))}")
            print(f"      Impact: {inconsistency.get('impact', 'Unknown')}")
            print(f"      Recommendation: {inconsistency.get('recommendation', 'Unknown')}")
    
    # Revenue Leakage Indicators
    print(f"\n💰 REVENUE LEAKAGE INDICATORS")
    revenue_indicators = analysis.get('revenue_leakage_indicators', [])
    if revenue_indicators:
        for indicator in revenue_indicators:
            impact_color = "🔴" if indicator.get('estimated_impact') == 'HIGH' else "🟡" if indicator.get('estimated_impact') == 'MEDIUM' else "🟢"
            print(f"   {impact_color} {indicator.get('indicator', 'Unknown')}")
            print(f"      Evidence: {indicator.get('evidence', 'Unknown')}")
    else:
        print("   ✅ No significant revenue leakage indicators found")
    
    # Fraud Indicators
    print(f"\n🚨 FRAUD INDICATORS")
    fraud_indicators = analysis.get('fraud_indicators', [])
    if fraud_indicators:
        for indicator in fraud_indicators:
            risk_color = "🔴" if indicator.get('risk_level') == 'HIGH' else "🟡" if indicator.get('risk_level') == 'MEDIUM' else "🟢"
            print(f"   {risk_color} {indicator.get('indicator', 'Unknown')}")
            print(f"      Evidence: {indicator.get('evidence', 'Unknown')}")
    else:
        print("   ✅ No significant fraud indicators found")
    
    # Recommendations
    print(f"\n📋 RECOMMENDATIONS")
    recommendations = analysis.get('recommendations', {})
    
    immediate = recommendations.get('immediate_actions', [])
    if immediate:
        print(f"   Immediate Actions:")
        for action in immediate:
            print(f"      🔥 {action}")
    
    billing = recommendations.get('billing_corrections', [])
    if billing:
        print(f"   Billing Corrections:")
        for correction in billing:
            print(f"      💰 {correction}")
    
    clinical = recommendations.get('clinical_reviews', [])
    if clinical:
        print(f"   Clinical Reviews:")
        for review in clinical:
            print(f"      🩺 {review}")

def main():
    """Main function to find mismatches between bill and medical documents"""
    print("🔍 BILL vs MEDICAL DOCUMENTS MISMATCH ANALYZER")
    print("="*60)
    print("Analyzes BILL against MEDICAL RECORDS to find:")
    print("• Items billed but not documented")
    print("• Items documented but not billed")
    print("• Revenue leakage opportunities")
    print("• Potential phantom billing")
    print("="*60)
    
    docs_folder = r"c:\vehicleinsurance\MEDICAL\fraud\docs"
    
    if not os.path.exists(docs_folder):
        print(f"❌ Docs folder not found: {docs_folder}")
        return
    
    # Separate PDF bills from other documents
    bill_files = []
    medical_record_files = []
    
    for file in os.listdir(docs_folder):
        file_path = os.path.join(docs_folder, file)
        if os.path.isfile(file_path):
            if file.lower().endswith('.pdf') and ('bill' in file.lower() or 'invoice' in file.lower()):
                bill_files.append(file_path)
            elif file.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.bmp')):
                medical_record_files.append(file_path)
    
    if not bill_files:
        print(f"❌ No bill PDF files found in {docs_folder}")
        return
        
    if not medical_record_files:
        print(f"❌ No medical record image files found in {docs_folder}")
        return
    
    print(f"� Found {len(bill_files)} bill file(s) and {len(medical_record_files)} medical record files")
    print(f"   Bill files: {[os.path.basename(f) for f in bill_files]}")
    print(f"   Medical record files: {[os.path.basename(f) for f in medical_record_files]}")
    
    try:
        # Phase 1: Extract items from bill (convert PDF to images first)
        print(f"\n📄 PHASE 1: Bill Analysis")
        print("-" * 50)
        
        all_bill_images = []
        temp_files = []
        
        for bill_file in bill_files:
            print(f"Processing bill: {os.path.basename(bill_file)}")
            bill_images = convert_pdf_to_images(bill_file)
            all_bill_images.extend(bill_images)
            temp_files.extend(bill_images)
        
        bill_extracts = []
        for i, image_path in enumerate(all_bill_images, 1):
            extract = extract_document_items(image_path)
            extract["source_type"] = "bill"
            bill_extracts.append(extract)
        
        # Phase 2: Extract items from medical records
        print(f"\n📄 PHASE 2: Medical Records Analysis")
        print("-" * 50)
        
        medical_extracts = []
        for image_path in medical_record_files:
            extract = extract_document_items(image_path)
            extract["source_type"] = "medical_record"
            medical_extracts.append(extract)
        
        # Display extracts
        print(f"\n📄 BILL DOCUMENTS")
        display_document_extracts(bill_extracts)
        
        print(f"\n📄 MEDICAL RECORD DOCUMENTS")
        display_document_extracts(medical_extracts)
        
        # Phase 3: Bill vs Medical Records Comparison
        print(f"\n🔄 PHASE 3: Bill vs Medical Records Comparison")
        print("-" * 50)
        
        # For now, use the first bill extract for comparison
        if bill_extracts:
            primary_bill = bill_extracts[0]
            bill_vs_docs_analysis = find_bill_to_docs_mismatches(primary_bill, medical_extracts)
            display_bill_vs_docs_analysis(bill_vs_docs_analysis)
        
        # Phase 4: Overall cross-reference analysis (optional)
        print(f"\n🔄 PHASE 4: Overall Cross-Reference Analysis")
        print("-" * 50)
        
        all_extracts = bill_extracts + medical_extracts
        overall_mismatch_analysis = find_document_mismatches(all_extracts)
        display_mismatch_analysis(overall_mismatch_analysis)
        
        # Save results
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"bill_vs_docs_analysis_{timestamp}.json"
        
        results = {
            "metadata": {
                "timestamp": timestamp,
                "total_bill_documents": len(bill_extracts),
                "total_medical_documents": len(medical_extracts),
                "analysis_type": "bill_vs_medical_documents_mismatch_detection",
                "focus": "revenue_leakage_and_phantom_billing_detection"
            },
            "bill_extracts": bill_extracts,
            "medical_record_extracts": medical_extracts,
            "bill_vs_docs_analysis": bill_vs_docs_analysis if 'bill_vs_docs_analysis' in locals() else {},
            "overall_mismatch_analysis": overall_mismatch_analysis
        }
        
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            print(f"\n💾 Bill vs Docs analysis saved to: {filename}")
        except Exception as e:
            print(f"❌ Error saving results: {str(e)}")
        
        # Clean up temporary files
        if temp_files:
            print("🧹 Cleaning up temporary files...")
            for temp_file in temp_files:
                try:
                    if os.path.exists(temp_file):
                        os.remove(temp_file)
                except:
                    pass
        
        print(f"\n✅ Bill vs Medical Documents analysis completed!")
        
    except Exception as e:
        print(f"❌ Error during analysis: {str(e)}")

if __name__ == "__main__":
    main()
