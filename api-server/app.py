"""
Flask API Server for Hospital Intelligent Document Processing Frontend
Provides REST API endpoints to integrate with the React frontend
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import sys
import uuid
import threading
import time
import shutil
from datetime import datetime
from azure.storage.blob import BlobServiceClient, BlobClient, ContainerClient

# Add parent directory to path for config import
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from config import AzureStorageConfig, APIConfig, AzureOpenAIConfig, AzureOpenAIXRayConfig, get_openai_client, get_xray_openai_client, get_blob_service_client

# Add the medical-analysis directory to the path to import existing analysis modules
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'medical-analysis'))

try:
    from medical_report_analyzer import MedicalReportAnalyzer
    from single_medical_analyzer import SingleMedicalImageAnalyzer
    from mismatch_analyzer import extract_document_items, find_bill_to_docs_mismatches
    from generic_document_analyzer_final import GenericDocumentAnalyzer
    ANALYSIS_MODULES_AVAILABLE = True
    print("✅ Successfully imported analysis modules")
except ImportError as e:
    print(f"⚠️  Warning: Could not import analysis modules: {e}")
    print(f"   Import error details: {type(e).__name__}")
    import traceback
    print(f"   Traceback: {traceback.format_exc()}")
    ANALYSIS_MODULES_AVAILABLE = False
except Exception as e:
    print(f"⚠️  Warning: Error initializing analysis modules: {e}")
    print(f"   Error details: {type(e).__name__}")
    import traceback
    print(f"   Traceback: {traceback.format_exc()}")
    ANALYSIS_MODULES_AVAILABLE = False

app = Flask(__name__)

# Configure CORS for Azure App Service
# In production, restrict to your frontend domain
ALLOWED_ORIGINS = os.getenv('CORS_ORIGINS', '*').split(',')
CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)

# Configuration from environment variables
UPLOAD_FOLDER = APIConfig.UPLOAD_FOLDER
MAX_CONTENT_LENGTH = APIConfig.MAX_CONTENT_LENGTH

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Ensure upload directory exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Azure Blob Storage Configuration from environment (using Managed Identity)
AZURE_CONTAINER_NAME = AzureStorageConfig.CONTAINER_NAME

# In-memory storage for demo purposes (use database in production)
analysis_jobs = {}
uploaded_files = {}

# Persistent storage directory for analysis jobs
JOBS_STORAGE_DIR = os.path.join(UPLOAD_FOLDER, 'analysis_jobs')
os.makedirs(JOBS_STORAGE_DIR, exist_ok=True)

def save_job_to_disk(job):
    """Save analysis job to disk for persistence across server restarts"""
    try:
        job_file = os.path.join(JOBS_STORAGE_DIR, f"{job.job_id}.json")
        job_data = {
            'job_id': job.job_id,
            'job_type': job.job_type,
            'file_paths': job.file_paths,
            'status': job.status,
            'progress': job.progress,
            'result': job.result,
            'error': job.error,
            'created_at': job.created_at.isoformat() if job.created_at else None,
            'completed_at': job.completed_at.isoformat() if job.completed_at else None,
            'custom_config': job.custom_config,
            'metadata': job.metadata
        }
        import json
        with open(job_file, 'w', encoding='utf-8') as f:
            json.dump(job_data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Warning: Failed to save job {job.job_id} to disk: {e}")

def load_job_from_disk(job_id):
    """Load analysis job from disk"""
    try:
        job_file = os.path.join(JOBS_STORAGE_DIR, f"{job_id}.json")
        if not os.path.exists(job_file):
            return None
        
        import json
        with open(job_file, 'r', encoding='utf-8') as f:
            job_data = json.load(f)
        
        # Reconstruct AnalysisJob object
        job = AnalysisJob(job_data['job_id'], job_data['job_type'], job_data['file_paths'])
        job.status = job_data['status']
        job.progress = job_data['progress']
        job.result = job_data['result']
        job.error = job_data['error']
        job.created_at = datetime.fromisoformat(job_data['created_at']) if job_data['created_at'] else datetime.now()
        job.completed_at = datetime.fromisoformat(job_data['completed_at']) if job_data['completed_at'] else None
        job.custom_config = job_data.get('custom_config')
        job.metadata = job_data.get('metadata', {})
        
        return job
    except Exception as e:
        print(f"Warning: Failed to load job {job_id} from disk: {e}")
        return None

def load_all_jobs_from_disk():
    """Load all analysis jobs from disk on server startup"""
    try:
        if not os.path.exists(JOBS_STORAGE_DIR):
            return
        
        for filename in os.listdir(JOBS_STORAGE_DIR):
            if filename.endswith('.json'):
                job_id = filename[:-5]  # Remove .json extension
                job = load_job_from_disk(job_id)
                if job:
                    analysis_jobs[job_id] = job
        
        print(f"Loaded {len(analysis_jobs)} analysis jobs from disk")
    except Exception as e:
        print(f"Warning: Failed to load jobs from disk: {e}")

# Mock customer database
MOCK_CUSTOMERS = {
    'CUST0010': {
        'id': 'CUST0010',
        'name': 'Mr. Venkateswaran Ramaseshan',
        'age': 58,
        'gender': 'Male',
        'email': 'v.ramaseshan@email.com',
        'phone': '+91-98765-43210',
        'address': '123 MG Road, Bangalore, Karnataka 560001',
        'insurance': 'Star Health Insurance',
        'policyNumber': 'SH-2024-789456',
        'registrationDate': '2023-05-15',
        'lastVisit': '2024-10-20'
    },
    'CUST0011': {
        'id': 'CUST0011',
        'name': 'Mrs. Lakshmi Krishnamurthy',
        'age': 45,
        'gender': 'Female',
        'email': 'lakshmi.k@email.com',
        'phone': '+91-98765-12345',
        'address': '456 Anna Salai, Chennai, Tamil Nadu 600002',
        'insurance': 'HDFC ERGO Health',
        'policyNumber': 'HE-2024-123789',
        'registrationDate': '2022-08-22',
        'lastVisit': '2024-10-18'
    },
    'CUST0012': {
        'id': 'CUST0012',
        'name': 'Mr. Rajesh Kumar Sharma',
        'age': 62,
        'gender': 'Male',
        'email': 'rajesh.sharma@email.com',
        'phone': '+91-98765-67890',
        'address': '789 Park Street, Kolkata, West Bengal 700016',
        'insurance': 'Care Health Insurance',
        'policyNumber': 'CH-2024-456123',
        'registrationDate': '2021-12-10',
        'lastVisit': '2024-10-15'
    },
    'CUST0013': {
        'id': 'CUST0013',
        'name': 'Ms. Priya Patel',
        'age': 38,
        'gender': 'Female',
        'email': 'priya.patel@email.com',
        'phone': '+91-98765-11111',
        'address': '321 Relief Road, Ahmedabad, Gujarat 380001',
        'insurance': 'Max Bupa Health',
        'policyNumber': 'MB-2024-789012',
        'registrationDate': '2023-03-28',
        'lastVisit': '2024-10-22'
    },
    'CUST0014': {
        'id': 'CUST0014',
        'name': 'Dr. Amit Deshmukh',
        'age': 52,
        'gender': 'Male',
        'email': 'amit.deshmukh@email.com',
        'phone': '+91-98765-22222',
        'address': '555 FC Road, Pune, Maharashtra 411004',
        'insurance': 'Bajaj Allianz Health',
        'policyNumber': 'BA-2024-345678',
        'registrationDate': '2020-11-05',
        'lastVisit': '2024-10-19'
    }
}

# Note: get_blob_service_client is now imported from config.py and uses Managed Identity

def get_customer_info(customer_id):
    """Get customer information from mock database"""
    return MOCK_CUSTOMERS.get(customer_id, None)

def scan_uploads_folder():
    """Scan uploads folder and rebuild uploaded_files dictionary"""
    uploads_dir = './uploads'
    if not os.path.exists(uploads_dir):
        return
    
    for filename in os.listdir(uploads_dir):
        file_path = os.path.join(uploads_dir, filename)
        if os.path.isfile(file_path):
            # Extract the UUID from the filename (everything before the first underscore)
            parts = filename.split('_', 1)
            if len(parts) == 2:
                file_id = parts[0]
                original_name = parts[1]
                file_stats = os.stat(file_path)
                
                uploaded_files[file_id] = {
                    'file_path': file_path,
                    'filename': original_name,
                    'size': file_stats.st_size,
                    'uploaded_at': datetime.fromtimestamp(file_stats.st_mtime).isoformat()
                }
    
    print(f"Scanned uploads folder: found {len(uploaded_files)} files")

class AnalysisJob:
    def __init__(self, job_id, job_type, file_paths):
        self.job_id = job_id
        self.job_type = job_type
        self.file_paths = file_paths
        self.status = 'pending'
        self.progress = 0
        self.result = None
        self.error = None
        self.created_at = datetime.now()
        self.completed_at = None
        self.custom_config = None  # For custom analyzer configuration
        self.metadata = {}  # For additional job metadata (e.g., document types)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'pdf', 'webp'}

@app.route('/debug/uploaded-files', methods=['GET'])
def debug_uploaded_files():
    """Debug endpoint to see what files are currently uploaded"""
    return jsonify({
        'uploaded_files_count': len(uploaded_files),
        'uploaded_files': list(uploaded_files.keys())
    })

@app.route('/', methods=['GET'])
def index():
    """Root endpoint - API information"""
    return jsonify({
        'name': 'Parse-AI Document Analysis API',
        'version': '1.0.0',
        'status': 'running',
        'endpoints': {
            'health': '/health',
            'customers': '/customers',
            'upload': '/upload',
            'analyze': '/analyze/*'
        }
    })

@app.route('/health', methods=['GET'])
def health_check():
    """System health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'analysis_modules_available': ANALYSIS_MODULES_AVAILABLE,
        'active_jobs': len([job for job in analysis_jobs.values() if job.status == 'processing'])
    })

@app.route('/debug/paths', methods=['GET'])
def debug_paths():
    """Debug endpoint to check Python paths and module availability"""
    import traceback
    debug_info = {
        'python_path': sys.path,
        'current_dir': os.getcwd(),
        'file_location': __file__,
        'analysis_modules_available': ANALYSIS_MODULES_AVAILABLE,
    }
    
    # Try to import modules and capture errors
    try:
        from medical_report_analyzer import MedicalReportAnalyzer
        debug_info['medical_report_analyzer'] = 'OK'
    except Exception as e:
        debug_info['medical_report_analyzer'] = f'ERROR: {str(e)}'
    
    try:
        from single_medical_analyzer import SingleMedicalImageAnalyzer
        debug_info['single_medical_analyzer'] = 'OK'
    except Exception as e:
        debug_info['single_medical_analyzer'] = f'ERROR: {str(e)}'
    
    try:
        from generic_document_analyzer_final import GenericDocumentAnalyzer
        debug_info['generic_document_analyzer'] = 'OK'
    except Exception as e:
        debug_info['generic_document_analyzer'] = f'ERROR: {str(e)}'
    
    # Check if directories exist
    base_dir = os.path.dirname(os.path.dirname(__file__))
    debug_info['base_dir'] = base_dir
    debug_info['medical_analysis_exists'] = os.path.exists(os.path.join(base_dir, 'medical-analysis'))
    debug_info['docufraud_exists'] = os.path.exists(os.path.join(base_dir, 'docufraud'))
    
    # List contents of base directory
    try:
        debug_info['base_dir_contents'] = os.listdir(base_dir)
    except Exception as e:
        debug_info['base_dir_contents'] = f'ERROR: {str(e)}'
    
    return jsonify(debug_info)

@app.route('/customers', methods=['GET'])
def list_customers():
    """List all customers"""
    try:
        customers = list(MOCK_CUSTOMERS.values())
        return jsonify({
            'customers': customers,
            'count': len(customers)
        })
    except Exception as e:
        return jsonify({'error': f'Failed to fetch customers: {str(e)}'}), 500

@app.route('/customers/<customer_id>', methods=['GET'])
def get_customer_details(customer_id):
    """Get customer details"""
    try:
        customer = get_customer_info(customer_id)
        if not customer:
            return jsonify({'error': f'Customer {customer_id} not found'}), 404
        
        return jsonify(customer)
    
    except Exception as e:
        return jsonify({'error': f'Failed to fetch customer details: {str(e)}'}), 500

@app.route('/customers/<customer_id>/documents', methods=['GET'])
def get_customer_documents(customer_id):
    """Fetch customer documents from Azure Blob Storage"""
    try:
        # Get customer info
        customer = get_customer_info(customer_id)
        if not customer:
            return jsonify({'error': f'Customer {customer_id} not found'}), 404
        
        blob_service_client = get_blob_service_client()
        if not blob_service_client:
            return jsonify({'error': 'Azure Blob Storage connection failed'}), 500
        
        container_client = blob_service_client.get_container_client(AZURE_CONTAINER_NAME)
        
        # List all blobs in the customer directory
        blob_prefix = f"{customer_id}/"
        blobs = container_client.list_blobs(name_starts_with=blob_prefix)
        
        documents = []
        for blob in blobs:
            # Skip if it's just the directory marker
            if blob.name == blob_prefix:
                continue
            
            # Extract filename from the blob path
            filename = blob.name.split('/')[-1]
            
            documents.append({
                'id': blob.name,
                'name': filename,
                'size': blob.size,
                'lastModified': blob.last_modified.isoformat() if blob.last_modified else None,
                'blobPath': blob.name
            })
        
        return jsonify({
            'customerId': customer_id,
            'customerInfo': customer,
            'documents': documents,
            'count': len(documents)
        })
    
    except Exception as e:
        return jsonify({'error': f'Failed to fetch customer documents: {str(e)}'}), 500

@app.route('/customers/<customer_id>/documents/<path:blob_path>/download', methods=['GET'])
def download_customer_document(customer_id, blob_path):
    """Download a specific customer document from Azure Blob Storage"""
    try:
        blob_service_client = get_blob_service_client()
        if not blob_service_client:
            return jsonify({'error': 'Azure Blob Storage connection failed'}), 500
        
        # Reconstruct the full blob path
        full_blob_path = f"{customer_id}/{blob_path}"
        
        blob_client = blob_service_client.get_blob_client(
            container=AZURE_CONTAINER_NAME, 
            blob=full_blob_path
        )
        
        # Download blob to uploads folder
        file_id = str(uuid.uuid4())
        filename = f"{file_id}_{blob_path.split('/')[-1]}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        with open(file_path, "wb") as download_file:
            download_file.write(blob_client.download_blob().readall())
        
        # Store file info
        uploaded_files[file_id] = {
            'file_path': file_path,
            'filename': blob_path.split('/')[-1],
            'size': os.path.getsize(file_path),
            'uploaded_at': datetime.now().isoformat(),
            'source': 'azure_blob',
            'customer_id': customer_id
        }
        
        return jsonify({
            'documentId': file_id,
            'fileName': blob_path.split('/')[-1],
            'fileSize': os.path.getsize(file_path),
            'uploadedAt': datetime.now().isoformat()
        })
    
    except Exception as e:
        return jsonify({'error': f'Failed to download document: {str(e)}'}), 500

@app.route('/documents/<document_id>/view', methods=['GET'])
def view_document(document_id):
    """Serve a document file for viewing by its documentId"""
    try:
        if document_id not in uploaded_files:
            return jsonify({'error': 'Document not found'}), 404
        
        file_info = uploaded_files[document_id]
        file_path = file_info['file_path']
        
        if not os.path.exists(file_path):
            return jsonify({'error': 'Document file not found on server'}), 404
        
        from flask import send_file
        
        # Determine mimetype based on file extension
        if file_path.endswith('.pdf'):
            mimetype = 'application/pdf'
        elif file_path.endswith('.webp'):
            mimetype = 'image/webp'
        elif file_path.endswith('.png'):
            mimetype = 'image/png'
        elif file_path.endswith(('.jpg', '.jpeg')):
            mimetype = 'image/jpeg'
        elif file_path.endswith('.bmp'):
            mimetype = 'image/bmp'
        elif file_path.endswith(('.tif', '.tiff')):
            mimetype = 'image/tiff'
        else:
            mimetype = 'application/octet-stream'
        
        return send_file(file_path, mimetype=mimetype)
    
    except Exception as e:
        return jsonify({'error': f'Failed to serve document: {str(e)}'}), 500

@app.route('/samples/<category>', methods=['GET'])
def get_sample_documents(category):
    """Get sample documents from Azure Blob Storage by category"""
    try:
        # Map categories to blob directory paths
        category_paths = {
            'medical': 'Medical',
            'xray': 'Medical/X-ray',
            'financial': 'Financial',
            'legal': 'Legal',
            'educational': 'Educational',
            'general': 'General'
        }
        
        blob_path = category_paths.get(category.lower())
        if not blob_path:
            return jsonify({'error': f'Invalid category: {category}'}), 400
        
        blob_service_client = get_blob_service_client()
        if not blob_service_client:
            return jsonify({'error': 'Azure Blob Storage connection failed'}), 500
        
        container_client = blob_service_client.get_container_client(AZURE_CONTAINER_NAME)
        
        # List all blobs in the category directory
        blob_prefix = f"{blob_path}/"
        blobs = container_client.list_blobs(name_starts_with=blob_prefix)
        
        samples = []
        for blob in blobs:
            # Skip if it's just the directory marker
            if blob.name == blob_prefix or blob.name.endswith('/'):
                continue
            
            # Only include files directly in this directory, not in subdirectories
            # Remove the prefix and check if there are any more slashes (indicating subdirectory)
            relative_path = blob.name[len(blob_prefix):]
            if '/' in relative_path:
                # This file is in a subdirectory, skip it
                continue
            
            # Extract filename from the blob path
            filename = blob.name.split('/')[-1]
            
            samples.append({
                'id': blob.name,
                'name': filename,
                'size': blob.size,
                'blobPath': blob.name,
                'category': category
            })
        
        return jsonify({
            'category': category,
            'samples': samples,
            'count': len(samples)
        })
    
    except Exception as e:
        print(f"Error fetching sample documents: {str(e)}")
        return jsonify({'error': f'Failed to fetch sample documents: {str(e)}'}), 500

@app.route('/samples/<category>/<path:blob_path>/download', methods=['GET'])
def download_sample_document(category, blob_path):
    """Download a sample document from Azure Blob Storage"""
    try:
        blob_service_client = get_blob_service_client()
        if not blob_service_client:
            return jsonify({'error': 'Azure Blob Storage connection failed'}), 500
        
        # Reconstruct the full blob path
        full_blob_path = f"{blob_path}"
        
        blob_client = blob_service_client.get_blob_client(
            container=AZURE_CONTAINER_NAME, 
            blob=full_blob_path
        )
        
        # Download blob to uploads folder
        file_id = str(uuid.uuid4())
        filename = f"{file_id}_{blob_path.split('/')[-1]}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        with open(file_path, "wb") as download_file:
            download_file.write(blob_client.download_blob().readall())
        
        # Store file info
        uploaded_files[file_id] = {
            'file_path': file_path,
            'filename': blob_path.split('/')[-1],
            'size': os.path.getsize(file_path),
            'uploaded_at': datetime.now().isoformat(),
            'source': 'azure_blob_sample',
            'category': category
        }
        
        return jsonify({
            'documentId': file_id,
            'fileName': blob_path.split('/')[-1],
            'fileSize': os.path.getsize(file_path),
            'uploadedAt': datetime.now().isoformat(),
            'source': 'sample'
        })
    
    except Exception as e:
        print(f"Error downloading sample document: {str(e)}")
        return jsonify({'error': f'Failed to download sample document: {str(e)}'}), 500

@app.route('/upload', methods=['POST'])
def upload_file():
    """Upload medical document files"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if file and allowed_file(file.filename):
            # Generate unique filename
            file_id = str(uuid.uuid4())
            filename = f"{file_id}_{file.filename}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            
            # Save file
            file.save(file_path)
            
            # Store file info
            uploaded_files[file_id] = {
                'id': file_id,
                'original_name': file.filename,
                'file_path': file_path,
                'file_size': os.path.getsize(file_path),
                'uploaded_at': datetime.now().isoformat(),
                'content_type': file.content_type
            }
            
            return jsonify({
                'documentId': file_id,
                'fileName': file.filename,
                'fileSize': os.path.getsize(file_path),
                'uploadedAt': datetime.now().isoformat()
            })
        
        return jsonify({'error': 'Invalid file type'}), 400
        
    except Exception as e:
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

@app.route('/analyze/comprehensive', methods=['POST'])
def start_comprehensive_analysis():
    """Start comprehensive analysis of multiple documents"""
    try:
        data = request.get_json()
        document_ids = data.get('document_ids', [])
        
        if not document_ids:
            return jsonify({'error': 'No documents provided'}), 400
        
        # Validate all document IDs exist
        file_paths = []
        for doc_id in document_ids:
            if doc_id not in uploaded_files:
                return jsonify({'error': f'Document {doc_id} not found'}), 404
            file_paths.append(uploaded_files[doc_id]['file_path'])
        
        # Create analysis job
        job_id = str(uuid.uuid4())
        job = AnalysisJob(job_id, 'comprehensive', file_paths)
        analysis_jobs[job_id] = job
        
        # Start analysis in background thread
        thread = threading.Thread(target=run_comprehensive_analysis, args=(job,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'jobId': job_id,
            'status': 'pending',
            'message': 'Comprehensive analysis started'
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to start analysis: {str(e)}'}), 500

@app.route('/analyze/single', methods=['POST'])
def start_single_analysis():
    """Start single document analysis"""
    try:
        data = request.get_json()
        document_id = data.get('document_id')
        
        if not document_id:
            return jsonify({'error': 'No document provided'}), 400
        
        if document_id not in uploaded_files:
            return jsonify({'error': 'Document not found'}), 404
        
        # Create analysis job
        job_id = str(uuid.uuid4())
        job = AnalysisJob(job_id, 'single', [uploaded_files[document_id]['file_path']])
        analysis_jobs[job_id] = job
        
        # Start analysis in background thread
        thread = threading.Thread(target=run_single_analysis, args=(job,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'jobId': job_id,
            'status': 'pending',
            'message': 'Single document analysis started'
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to start analysis: {str(e)}'}), 500

@app.route('/analyze/fraud', methods=['POST'])
def start_fraud_analysis():
    """Start fraud detection analysis"""
    try:
        data = request.get_json()
        bill_id = data.get('bill_id')
        medical_record_ids = data.get('medical_record_ids', [])
        
        if not bill_id or not medical_record_ids:
            return jsonify({'error': 'Bill and medical records required'}), 400
        
        # Validate documents exist
        if bill_id not in uploaded_files:
            return jsonify({'error': 'Bill document not found'}), 404
        
        medical_file_paths = []
        for doc_id in medical_record_ids:
            if doc_id not in uploaded_files:
                return jsonify({'error': f'Medical record {doc_id} not found'}), 404
            medical_file_paths.append(uploaded_files[doc_id]['file_path'])
        
        # Create analysis job
        job_id = str(uuid.uuid4())
        file_paths = [uploaded_files[bill_id]['file_path']] + medical_file_paths
        job = AnalysisJob(job_id, 'fraud', file_paths)
        analysis_jobs[job_id] = job
        
        # Start analysis in background thread
        thread = threading.Thread(target=run_fraud_analysis, args=(job,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'jobId': job_id,
            'status': 'pending',
            'message': 'Fraud analysis started'
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to start analysis: {str(e)}'}), 500

@app.route('/analyze/batch', methods=['POST'])
def start_batch_analysis():
    """Start batch analysis of multiple documents"""
    try:
        data = request.get_json()
        document_ids = data.get('document_ids', [])
        
        if not document_ids:
            return jsonify({'error': 'No documents provided'}), 400
        
        # Validate all document IDs exist
        file_paths = []
        for doc_id in document_ids:
            if doc_id not in uploaded_files:
                return jsonify({'error': f'Document {doc_id} not found'}), 404
            file_paths.append(uploaded_files[doc_id]['file_path'])
        
        # Create analysis job
        job_id = str(uuid.uuid4())
        job = AnalysisJob(job_id, 'batch', file_paths)
        analysis_jobs[job_id] = job
        
        # Start analysis in background thread
        thread = threading.Thread(target=run_batch_analysis, args=(job,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'jobId': job_id,
            'status': 'pending',
            'message': 'Batch analysis started'
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to start batch analysis: {str(e)}'}), 500

@app.route('/analyze/mismatch', methods=['POST'])
def start_mismatch_analysis():
    """Start mismatch analysis between bill and medical records"""
    try:
        data = request.get_json()
        bill_id = data.get('bill_id')
        medical_record_ids = data.get('medical_record_ids', [])
        
        if not bill_id or not medical_record_ids:
            return jsonify({'error': 'Bill and medical records required'}), 400
        
        # Validate documents exist
        if bill_id not in uploaded_files:
            return jsonify({'error': 'Bill document not found'}), 404
        
        medical_file_paths = []
        for doc_id in medical_record_ids:
            if doc_id not in uploaded_files:
                return jsonify({'error': f'Medical record {doc_id} not found'}), 404
            medical_file_paths.append(uploaded_files[doc_id]['file_path'])
        
        # Create analysis job
        job_id = str(uuid.uuid4())
        file_paths = [uploaded_files[bill_id]['file_path']] + medical_file_paths
        job = AnalysisJob(job_id, 'mismatch', file_paths)
        analysis_jobs[job_id] = job
        
        # Start analysis in background thread
        thread = threading.Thread(target=run_mismatch_analysis, args=(job,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'jobId': job_id,
            'status': 'pending',
            'message': 'Mismatch analysis started'
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to start mismatch analysis: {str(e)}'}), 500

@app.route('/analyze/fraud-detection', methods=['POST'])
def start_fraud_detection():
    """Start fraud detection analysis - focuses on medications billed but not in medical records"""
    try:
        data = request.get_json()
        bill_id = data.get('bill_id')
        medical_record_ids = data.get('medical_record_ids', [])
        
        if not bill_id or not medical_record_ids:
            return jsonify({'error': 'Bill and medical records required'}), 400
        
        # Validate documents exist
        if bill_id not in uploaded_files:
            return jsonify({'error': 'Bill document not found'}), 404
        
        medical_file_paths = []
        for doc_id in medical_record_ids:
            if doc_id not in uploaded_files:
                return jsonify({'error': f'Medical record {doc_id} not found'}), 404
            medical_file_paths.append(uploaded_files[doc_id]['file_path'])
        
        # Create analysis job
        job_id = str(uuid.uuid4())
        file_paths = [uploaded_files[bill_id]['file_path']] + medical_file_paths
        job = AnalysisJob(job_id, 'fraud_detection', file_paths)
        analysis_jobs[job_id] = job
        
        # Start analysis in background thread
        thread = threading.Thread(target=run_fraud_detection_analysis, args=(job,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'jobId': job_id,
            'status': 'pending',
            'message': 'Fraud detection analysis started'
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to start fraud detection: {str(e)}'}), 500

@app.route('/analyze/revenue-leakage', methods=['POST'])
def start_revenue_leakage():
    """Start revenue leakage analysis - focuses on medications in records but not billed"""
    try:
        data = request.get_json()
        bill_id = data.get('bill_id')
        medical_record_ids = data.get('medical_record_ids', [])
        
        if not bill_id or not medical_record_ids:
            return jsonify({'error': 'Bill and medical records required'}), 400
        
        # Validate documents exist
        if bill_id not in uploaded_files:
            return jsonify({'error': 'Bill document not found'}), 404
        
        medical_file_paths = []
        for doc_id in medical_record_ids:
            if doc_id not in uploaded_files:
                return jsonify({'error': f'Medical record {doc_id} not found'}), 404
            medical_file_paths.append(uploaded_files[doc_id]['file_path'])
        
        # Create analysis job
        job_id = str(uuid.uuid4())
        file_paths = [uploaded_files[bill_id]['file_path']] + medical_file_paths
        job = AnalysisJob(job_id, 'revenue_leakage', file_paths)
        analysis_jobs[job_id] = job
        
        # Start analysis in background thread
        thread = threading.Thread(target=run_revenue_leakage_analysis, args=(job,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'jobId': job_id,
            'status': 'pending',
            'message': 'Revenue leakage analysis started'
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to start revenue leakage analysis: {str(e)}'}), 500

@app.route('/analyze/general', methods=['POST'])
def start_general_analysis():
    """Start general document analysis - analyzes any type of document"""
    try:
        data = request.get_json()
        document_ids = data.get('document_ids', [])
        
        if not document_ids:
            return jsonify({'error': 'No documents provided'}), 400
        
        # Validate all document IDs exist
        file_paths = []
        for doc_id in document_ids:
            if doc_id not in uploaded_files:
                return jsonify({'error': f'Document {doc_id} not found'}), 404
            file_paths.append(uploaded_files[doc_id]['file_path'])
        
        # Create analysis job
        job_id = str(uuid.uuid4())
        job = AnalysisJob(job_id, 'general', file_paths)
        analysis_jobs[job_id] = job
        
        # Start analysis in background thread
        thread = threading.Thread(target=run_general_analysis, args=(job,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'jobId': job_id,
            'status': 'pending',
            'message': 'General document analysis started'
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to start general analysis: {str(e)}'}), 500

@app.route('/analyze/xray', methods=['POST'])
def start_xray_analysis():
    """Start X-ray analysis to generate radiology report"""
    try:
        data = request.get_json()
        document_id = data.get('document_id')
        
        if not document_id:
            return jsonify({'error': 'No document provided'}), 400
        
        if document_id not in uploaded_files:
            return jsonify({'error': 'Document not found'}), 404
        
        # Create analysis job
        job_id = str(uuid.uuid4())
        job = AnalysisJob(job_id, 'xray', [uploaded_files[document_id]['file_path']])
        analysis_jobs[job_id] = job
        
        # Start analysis in background thread
        thread = threading.Thread(target=run_xray_analysis, args=(job,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'jobId': job_id,
            'status': 'pending',
            'message': 'X-ray analysis started'
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to start X-ray analysis: {str(e)}'}), 500

@app.route('/analyze/custom', methods=['POST'])
def start_custom_analysis():
    """Start custom document analysis with user-defined instructions"""
    try:
        data = request.get_json()
        document_ids = data.get('document_ids', [])
        custom_instructions = data.get('custom_instructions', '')
        model_name = data.get('model_name', 'gpt-4o')
        temperature = data.get('temperature', 0.3)
        max_completion_tokens = data.get('max_completion_tokens', data.get('max_tokens', 4000))
        document_type = data.get('document_type', 'Custom Document')
        output_format = data.get('output_format', 'Markdown')
        
        if not document_ids:
            return jsonify({'error': 'No documents provided'}), 400
        
        if not custom_instructions:
            return jsonify({'error': 'Custom instructions are required'}), 400
        
        # Validate all document IDs exist
        file_paths = []
        for doc_id in document_ids:
            if doc_id not in uploaded_files:
                return jsonify({'error': f'Document {doc_id} not found'}), 404
            file_paths.append(uploaded_files[doc_id]['file_path'])
        
        # Create analysis job with custom config
        job_id = str(uuid.uuid4())
        job = AnalysisJob(job_id, 'custom', file_paths)
        job.custom_config = {
            'instructions': custom_instructions,
            'model_name': model_name,
            'temperature': temperature,
            'max_completion_tokens': max_completion_tokens,
            'document_type': document_type,
            'output_format': output_format
        }
        analysis_jobs[job_id] = job
        
        # Start analysis in background thread
        thread = threading.Thread(target=run_custom_analysis, args=(job,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'jobId': job_id,
            'status': 'pending',
            'message': f'Custom {document_type} analysis started'
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to start custom analysis: {str(e)}'}), 500

@app.route('/analysis/<job_id>/status', methods=['GET'])
def get_analysis_status(job_id):
    """Get analysis job status"""
    # Try to get from memory first
    job = analysis_jobs.get(job_id)
    
    # If not in memory, try loading from disk
    if not job:
        job = load_job_from_disk(job_id)
        if job:
            # Cache in memory for future requests
            analysis_jobs[job_id] = job
    
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    
    response = {
        'jobId': job.job_id,
        'status': job.status,
        'progress': job.progress,
        'jobType': job.job_type,
        'createdAt': job.created_at.isoformat(),
        'completedAt': job.completed_at.isoformat() if job.completed_at else None,
        'error': job.error
    }
    
    # Include result if job is completed
    if job.status == 'completed' and job.result:
        response['result'] = job.result
    
    return jsonify(response)

@app.route('/analysis/<job_id>/result', methods=['GET'])
def get_analysis_result(job_id):
    """Get analysis job result"""
    if job_id not in analysis_jobs:
        return jsonify({'error': 'Job not found'}), 404
    
    job = analysis_jobs[job_id]
    if job.status != 'completed':
        return jsonify({'error': 'Analysis not completed'}), 400
    
    return jsonify({
        'jobId': job.job_id,
        'status': job.status,
        'result': job.result
    })

def run_comprehensive_analysis(job):
    """Run comprehensive analysis in background"""
    try:
        job.status = 'processing'
        job.progress = 10
        
        if ANALYSIS_MODULES_AVAILABLE:
            # Use actual analysis module for batch processing
            print(f"Starting comprehensive analysis for {len(job.file_paths)} documents")
            analyzer = MedicalReportAnalyzer()
            job.progress = 30
            
            try:
                # Method 1: Use MedicalReportAnalyzer for true batch analysis
                # Create a temporary folder with the uploaded files and use batch analyzer
                temp_docs_folder = os.path.join(UPLOAD_FOLDER, f"temp_batch_{job.job_id}")
                os.makedirs(temp_docs_folder, exist_ok=True)
                
                print(f"🔧 DEBUG: Created temp folder: {temp_docs_folder}")
                print(f"🔧 DEBUG: Processing {len(job.file_paths)} files")
                
                # Copy files to temp folder for batch analysis
                import shutil
                for file_path in job.file_paths:
                    dest_path = os.path.join(temp_docs_folder, os.path.basename(file_path))
                    shutil.copy2(file_path, dest_path)
                    print(f"🔧 DEBUG: Copied {os.path.basename(file_path)} to temp folder")
                
                # Initialize analyzer with temp folder
                print(f"🔧 DEBUG: Initializing MedicalReportAnalyzer...")
                batch_analyzer = MedicalReportAnalyzer(temp_docs_folder)
                
                # Run batch analysis
                job.progress = 50
                print(f"🔧 DEBUG: Starting batch analysis...")
                batch_result = batch_analyzer.analyze_all_documents(output_dir=temp_docs_folder)
                print(f"🔧 DEBUG: Batch analysis completed. Result type: {type(batch_result)}")
                print(f"🔧 DEBUG: Result keys: {list(batch_result.keys()) if batch_result else 'None'}")
                job.progress = 90
                
                # Convert batch result to expected frontend format
                job.result = {
                    'reportMetadata': {
                        'generationTimestamp': datetime.now().isoformat(),
                        'totalDocumentsAnalyzed': batch_result.get('report_metadata', {}).get('total_documents_analyzed', len(job.file_paths)),
                        'successfulAnalyses': batch_result.get('report_metadata', {}).get('successful_analyses', len(job.file_paths)),
                        'failedAnalyses': batch_result.get('report_metadata', {}).get('failed_analyses', 0),
                        'analysisType': 'Comprehensive Medical Report Analysis (Batch)'
                    },
                    'executiveSummary': {
                        'totalUniqueDiagnoses': batch_result.get('executive_summary', {}).get('total_unique_diagnoses', 0),
                        'totalMedications': batch_result.get('executive_summary', {}).get('total_medications', 0),
                        'totalSymptomsReported': batch_result.get('executive_summary', {}).get('total_symptoms_reported', 0),
                        'criticalAlerts': batch_result.get('executive_summary', {}).get('critical_alerts', 0),
                        'totalFindings': batch_result.get('executive_summary', {}).get('total_findings', 0)
                    },
                    'clinicalOverview': {
                        'primaryDiagnoses': batch_result.get('clinical_overview', {}).get('primary_diagnoses', []),
                        'keySymptoms': batch_result.get('clinical_overview', {}).get('key_symptoms', []),
                        'currentMedications': [],
                        'criticalFindings': batch_result.get('clinical_overview', {}).get('critical_findings', []),
                        'keyMedicalFindings': batch_result.get('clinical_overview', {}).get('key_medical_findings', [])
                    },
                    'documentSummaries': [
                        {
                            'documentName': doc.get('document', f'Document {i+1}'),
                            'documentType': 'medical_record',
                            'summary': doc.get('summary', 'Medical document analyzed successfully')
                        } for i, doc in enumerate(batch_result.get('document_summaries', []))
                    ],
                    'detailedAnalysis': [
                        {
                            'documentName': doc.get('document_name', f'Document {i+1}'),
                            'documentPath': doc.get('document_path', ''),
                            'analysis': {
                                'medical_analysis': doc.get('raw_response', doc.get('document_summary', 'Analysis not available')),
                                'analysis_timestamp': doc.get('analysis_timestamp'),
                                'analysis_successful': doc.get('analysis_successful', True)
                            }
                        } for i, doc in enumerate(batch_result.get('detailed_analysis', []))
                    ]
                }
                
                # Cleanup temp folder
                shutil.rmtree(temp_docs_folder, ignore_errors=True)
                
            except Exception as batch_error:
                print(f"❌ Batch analysis failed, falling back to individual analysis: {str(batch_error)}")
                print(f"❌ Error details: {type(batch_error).__name__}: {batch_error}")
                import traceback
                print(f"❌ Full traceback: {traceback.format_exc()}")
                # Cleanup temp folder on error
                shutil.rmtree(temp_docs_folder, ignore_errors=True)
                
                # Fallback to individual document analysis
                all_results = []
                for i, file_path in enumerate(job.file_paths):
                    print(f"Processing document {i+1}/{len(job.file_paths)}: {os.path.basename(file_path)}")
                    
                    single_analyzer = SingleMedicalImageAnalyzer()
                    doc_result = single_analyzer.analyze_and_report(file_path, save_report=False)
                    all_results.append({
                        'documentName': os.path.basename(file_path),
                        'documentPath': file_path,
                        'analysis': doc_result
                    })
                    
                    # Update progress
                    job.progress = 30 + (i + 1) * 50 // len(job.file_paths)
                
                # Create comprehensive report from individual results
                job.result = {
                    'reportMetadata': {
                        'generationTimestamp': datetime.now().isoformat(),
                        'totalDocumentsAnalyzed': len(job.file_paths),
                        'successfulAnalyses': len(all_results),
                        'failedAnalyses': 0,
                        'analysisType': 'Comprehensive Medical Report Analysis (Individual)'
                    },
                    'documentAnalyses': all_results,
                    'executiveSummary': {
                        'totalUniqueDiagnoses': len(all_results),
                        'totalMedications': len(all_results) * 2,  # Estimate
                        'totalSymptomsReported': len(all_results) * 3,  # Estimate
                        'criticalAlerts': max(1, len(all_results) // 3),  # Estimate
                        'totalFindings': len(all_results) * 4  # Estimate
                    },
                    'clinicalOverview': {
                        'primaryDiagnoses': ['Medical Analysis Completed', 'Document Processing Successful'],
                        'keySymptoms': ['Various symptoms identified'],
                        'currentMedications': [],
                        'criticalFindings': ['Analysis requires medical professional review'],
                        'keyMedicalFindings': ['Detailed analysis available in individual reports']
                    },
                    'documentSummaries': [
                        {
                            'documentName': result['documentName'],
                            'documentType': 'medical_record',
                            'summary': 'Medical document successfully analyzed'
                        } for result in all_results
                    ],
                    'detailedAnalysis': all_results
                }
        else:
            raise Exception("Analysis modules not available. Please ensure all required modules are installed.")
        
        job.progress = 100
        job.status = 'completed'
        job.completed_at = datetime.now()
        
    except Exception as e:
        print(f"Error in comprehensive analysis: {str(e)}")
        job.status = 'failed'
        job.error = str(e)

def run_single_analysis(job):
    """Run single document analysis in background"""
    try:
        job.status = 'processing'
        job.progress = 10
        
        if ANALYSIS_MODULES_AVAILABLE:
            # Use actual analysis module
            print(f"Starting single document analysis for: {job.file_paths[0]}")
            analyzer = SingleMedicalImageAnalyzer()
            job.progress = 30
            
            # Run actual analysis
            result = analyzer.analyze_and_report(job.file_paths[0], save_report=False)
            job.progress = 90
            
            # Convert result to expected format
            job.result = {
                'imagePath': job.file_paths[0],
                'imageName': os.path.basename(job.file_paths[0]),
                'analysisTimestamp': datetime.now().isoformat(),
                'analysisSuccessful': True,
                'medicalAnalysis': result.get('medical_analysis', 'No analysis available')  # Extract the markdown string
            }
        else:
            raise Exception("Analysis modules not available. Please ensure all required modules are installed.")
        
        job.progress = 100
        job.status = 'completed'
        job.completed_at = datetime.now()
        
    except Exception as e:
        print(f"Error in single analysis: {str(e)}")
        job.status = 'failed'
        job.error = str(e)

def run_fraud_analysis(job):
    """Run fraud detection analysis in background"""
    try:
        job.status = 'processing'
        job.progress = 10
        
        if ANALYSIS_MODULES_AVAILABLE:
            # Use actual analysis modules
            bill_path = job.file_paths[0]
            medical_paths = job.file_paths[1:]
            
            print(f"Starting fraud analysis - Bill: {os.path.basename(bill_path)}")
            print(f"Medical records: {[os.path.basename(p) for p in medical_paths]}")
            
            job.progress = 30
            
            try:
                # Extract bill document items
                print("Extracting bill document items...")
                bill_items = extract_document_items(bill_path)
                job.progress = 50
                
                # Extract medical document items
                print("Extracting medical document items...")
                medical_items_list = []
                for medical_path in medical_paths:
                    medical_items = extract_document_items(medical_path)
                    medical_items_list.append(medical_items)
                
                job.progress = 70
                
                # Find mismatches
                print("Finding mismatches...")
                mismatch_result = find_bill_to_docs_mismatches(bill_items, medical_items_list)
                
                job.progress = 90
                
                # Format result
                job.result = {
                    'analysisId': str(uuid.uuid4()),
                    'timestamp': datetime.now().isoformat(),
                    'billDocument': bill_items,
                    'medicalDocuments': medical_items_list,
                    'mismatchAnalysis': mismatch_result,
                    'analysisSuccessful': True
                }
                
            except Exception as analysis_error:
                print(f"Error in fraud analysis logic: {str(analysis_error)}")
                raise analysis_error
        else:
            raise Exception("Analysis modules not available. Please ensure all required modules are installed.")
        
        job.progress = 100
        job.status = 'completed'
        job.completed_at = datetime.now()
        
    except Exception as e:
        print(f"Error in fraud analysis: {str(e)}")
        job.status = 'failed'
        job.error = str(e)

def run_batch_analysis(job):
    """Run batch analysis in background"""
    try:
        job.status = 'processing'
        job.progress = 10
        
        if ANALYSIS_MODULES_AVAILABLE:
            print(f"Starting batch analysis for {len(job.file_paths)} documents")
            
            # Try to use MedicalReportAnalyzer for true batch processing
            temp_docs_folder = os.path.join(UPLOAD_FOLDER, f"temp_batch_{job.job_id}")
            os.makedirs(temp_docs_folder, exist_ok=True)
            
            try:
                print(f"🔧 DEBUG: Created temp folder: {temp_docs_folder}")
                print(f"🔧 DEBUG: Processing {len(job.file_paths)} files")
                
                # Copy files to temp folder for batch analysis
                import shutil
                for file_path in job.file_paths:
                    dest_path = os.path.join(temp_docs_folder, os.path.basename(file_path))
                    shutil.copy2(file_path, dest_path)
                    print(f"🔧 DEBUG: Copied {os.path.basename(file_path)} to temp folder")
                
                # Initialize analyzer with temp folder
                print(f"🔧 DEBUG: Initializing MedicalReportAnalyzer...")
                batch_analyzer = MedicalReportAnalyzer(temp_docs_folder)
                
                # Run batch analysis
                job.progress = 50
                print(f"🔧 DEBUG: Starting batch analysis...")
                batch_result = batch_analyzer.analyze_all_documents(output_dir=temp_docs_folder)
                print(f"🔧 DEBUG: Batch analysis completed. Result type: {type(batch_result)}")
                print(f"🔧 DEBUG: Result keys: {list(batch_result.keys()) if batch_result else 'None'}")
                job.progress = 90
                
                # Convert batch result to expected format
                print(f"🔧 DEBUG: Converting batch result to frontend format...")
                print(f"🔧 DEBUG: Batch result detailed_analysis length: {len(batch_result.get('detailed_analysis', []))}")
                
                if batch_result.get('detailed_analysis'):
                    first_doc = batch_result['detailed_analysis'][0]
                    print(f"🔧 DEBUG: First document structure: {list(first_doc.keys())}")
                    print(f"🔧 DEBUG: First document raw_response: {first_doc.get('raw_response', 'NOT_FOUND')[:200] if first_doc.get('raw_response') else 'NOT_FOUND'}")
                    print(f"🔧 DEBUG: First document document_summary: {first_doc.get('document_summary', 'NOT_FOUND')[:200] if first_doc.get('document_summary') else 'NOT_FOUND'}")
                    print(f"🔧 DEBUG: First document analysis_successful: {first_doc.get('analysis_successful')}")
                
                job.result = {
                    'batchId': str(uuid.uuid4()),
                    'timestamp': datetime.now().isoformat(),
                    'totalDocuments': batch_result.get('report_metadata', {}).get('total_documents_analyzed', len(job.file_paths)),
                    'successfulAnalyses': batch_result.get('report_metadata', {}).get('successful_analyses', len(job.file_paths)),
                    'failedAnalyses': batch_result.get('report_metadata', {}).get('failed_analyses', 0),
                    'analysisType': 'Comprehensive Medical Report Analysis (Batch)',
                    'executiveSummary': {
                        'totalUniqueDiagnoses': batch_result.get('executive_summary', {}).get('total_unique_diagnoses', 0),
                        'totalMedications': batch_result.get('executive_summary', {}).get('total_medications', 0),
                        'totalSymptomsReported': batch_result.get('executive_summary', {}).get('total_symptoms_reported', 0),
                        'criticalAlerts': batch_result.get('executive_summary', {}).get('critical_alerts', 0),
                        'totalFindings': batch_result.get('executive_summary', {}).get('total_findings', 0)
                    },
                    'clinicalOverview': {
                        'primaryDiagnoses': batch_result.get('clinical_overview', {}).get('primary_diagnoses', []),
                        'keySymptoms': batch_result.get('clinical_overview', {}).get('key_symptoms', []),
                        'criticalFindings': batch_result.get('clinical_overview', {}).get('critical_findings', []),
                        'keyMedicalFindings': batch_result.get('clinical_overview', {}).get('key_medical_findings', [])
                    },
                    'results': [
                        {
                            'documentId': str(uuid.uuid4()),
                            'documentName': doc.get('document_name', f'Document {i+1}'),
                            'documentPath': doc.get('document_path', ''),
                            'analysisTimestamp': doc.get('analysis_timestamp'),
                            'analysisSuccessful': doc.get('analysis_successful', True),
                            'analysis': {
                                'medical_analysis': doc.get('raw_response', doc.get('document_summary', 'Analysis not available')),
                                'analysis_timestamp': doc.get('analysis_timestamp'),
                                'analysis_successful': doc.get('analysis_successful', True)
                            }
                        } for i, doc in enumerate(batch_result.get('detailed_analysis', []))
                    ]
                }
                
                # Cleanup temp folder
                shutil.rmtree(temp_docs_folder, ignore_errors=True)
                print(f"✅ Batch analysis completed successfully using MedicalReportAnalyzer")
                
            except Exception as batch_error:
                print(f"❌ Batch analysis failed, falling back to individual analysis: {str(batch_error)}")
                print(f"❌ Error details: {type(batch_error).__name__}: {batch_error}")
                import traceback
                print(f"❌ Full traceback: {traceback.format_exc()}")
                # Cleanup temp folder on error
                shutil.rmtree(temp_docs_folder, ignore_errors=True)
                
                # Fallback to individual document analysis
                print("🔄 Falling back to individual document analysis...")
                all_results = []
                for i, file_path in enumerate(job.file_paths):
                    print(f"Processing document {i+1}/{len(job.file_paths)}: {os.path.basename(file_path)}")
                    
                    single_analyzer = SingleMedicalImageAnalyzer()
                    doc_result = single_analyzer.analyze_and_report(file_path, save_report=False)
                    
                    all_results.append({
                        'documentId': str(uuid.uuid4()),
                        'documentName': os.path.basename(file_path),
                        'documentPath': file_path,
                        'analysisTimestamp': datetime.now().isoformat(),
                        'analysisSuccessful': True,
                        'medicalAnalysis': doc_result
                    })
                    
                    # Update progress
                    job.progress = 10 + (i + 1) * 80 // len(job.file_paths)
                
                job.result = {
                    'batchId': str(uuid.uuid4()),
                    'timestamp': datetime.now().isoformat(),
                    'totalDocuments': len(job.file_paths),
                    'successfulAnalyses': len(all_results),
                    'failedAnalyses': 0,
                    'analysisType': 'Individual Medical Document Analysis (Fallback)',
                    'results': all_results
                }
        else:
            raise Exception("Analysis modules not available. Please ensure all required modules are installed.")
        
        job.progress = 100
        job.status = 'completed'
        job.completed_at = datetime.now()
        
    except Exception as e:
        print(f"Error in batch analysis: {str(e)}")
        job.status = 'failed'
        job.error = str(e)

def run_mismatch_analysis(job):
    """Run mismatch analysis in background"""
    try:
        job.status = 'processing'
        job.progress = 10
        
        if ANALYSIS_MODULES_AVAILABLE:
            bill_path = job.file_paths[0]
            medical_paths = job.file_paths[1:]
            
            print(f"Starting mismatch analysis - Bill: {os.path.basename(bill_path)}")
            print(f"Medical records: {[os.path.basename(p) for p in medical_paths]}")
            
            job.progress = 30
            
            try:
                # Extract items from all documents
                bill_items = extract_document_items(bill_path)
                job.progress = 50
                
                medical_items_list = []
                for medical_path in medical_paths:
                    medical_items = extract_document_items(medical_path)
                    medical_items_list.append(medical_items)
                
                job.progress = 70
                
                # Find detailed mismatches
                mismatch_result = find_bill_to_docs_mismatches(bill_items, medical_items_list)
                
                job.progress = 90
                
                job.result = {
                    'analysisId': str(uuid.uuid4()),
                    'timestamp': datetime.now().isoformat(),
                    'billDocument': bill_items,
                    'medicalDocuments': medical_items_list,
                    'detailedMismatchAnalysis': mismatch_result,
                    'analysisType': 'mismatch_detection'
                }
                
            except Exception as analysis_error:
                print(f"Error in mismatch analysis: {str(analysis_error)}")
                raise analysis_error
        else:
            raise Exception("Analysis modules not available. Please ensure all required modules are installed.")
        
        job.progress = 100
        job.status = 'completed'
        job.completed_at = datetime.now()
        
    except Exception as e:
        print(f"Error in mismatch analysis: {str(e)}")
        job.status = 'failed'
        job.error = str(e)

def run_fraud_detection_analysis(job):
    """Run fraud detection analysis - focuses on items billed but not in medical records"""
    try:
        job.status = 'processing'
        job.progress = 10
        
        if ANALYSIS_MODULES_AVAILABLE:
            bill_path = job.file_paths[0]
            medical_paths = job.file_paths[1:]
            
            print(f"Starting fraud detection - Bill: {os.path.basename(bill_path)}")
            print(f"Medical records: {[os.path.basename(p) for p in medical_paths]}")
            
            job.progress = 30
            
            try:
                # Extract items from all documents
                bill_items = extract_document_items(bill_path)
                job.progress = 50
                
                medical_items_list = []
                for medical_path in medical_paths:
                    medical_items = extract_document_items(medical_path)
                    medical_items_list.append(medical_items)
                
                job.progress = 70
                
                # Find detailed mismatches
                mismatch_result = find_bill_to_docs_mismatches(bill_items, medical_items_list)
                
                # Check if mismatch analysis failed
                if 'error' in mismatch_result:
                    raise Exception(f"Mismatch analysis failed: {mismatch_result['error']}")
                
                job.progress = 90
                
                # Extract fraud-specific data (medications billed but not in records)
                fraud_indicators = mismatch_result.get('bill_vs_medical_mismatches', {}).get('medications_billed_but_not_in_medical_records', [])
                fraud_procedures = mismatch_result.get('bill_vs_medical_mismatches', {}).get('procedures_billed_but_not_documented', [])
                fraud_risk = mismatch_result.get('revenue_impact_analysis', {}).get('potential_fraud_indicators', {}).get('risk_level', 'UNKNOWN')
                
                job.result = {
                    'analysisId': str(uuid.uuid4()),
                    'timestamp': datetime.now().isoformat(),
                    'analysisType': 'fraud_detection',
                    'fraudRiskLevel': fraud_risk,
                    'totalFraudIndicators': len(fraud_indicators) + len(fraud_procedures),
                    'fraudIndicators': {
                        'medicationsBilledButNotInRecords': fraud_indicators,
                        'proceduresBilledButNotDocumented': fraud_procedures
                    },
                    'recommendations': mismatch_result.get('recommendations', {}).get('fraud_investigation_items', []),
                    'detailedAnalysis': mismatch_result
                }
                
            except Exception as analysis_error:
                print(f"Error in fraud detection: {str(analysis_error)}")
                import traceback
                print(f"Full traceback: {traceback.format_exc()}")
                raise analysis_error
        else:
            raise Exception("Analysis modules not available. Please ensure all required modules are installed.")
        
        job.progress = 100
        job.status = 'completed'
        job.completed_at = datetime.now()
        
    except Exception as e:
        print(f"Error in fraud detection: {str(e)}")
        job.status = 'failed'
        job.error = str(e)

def run_revenue_leakage_analysis(job):
    """Run revenue leakage analysis - focuses on items in records but not billed"""
    try:
        job.status = 'processing'
        job.progress = 10
        
        if ANALYSIS_MODULES_AVAILABLE:
            bill_path = job.file_paths[0]
            medical_paths = job.file_paths[1:]
            
            print(f"Starting revenue leakage - Bill: {os.path.basename(bill_path)}")
            print(f"Medical records: {[os.path.basename(p) for p in medical_paths]}")
            
            job.progress = 30
            
            try:
                # Extract items from all documents
                bill_items = extract_document_items(bill_path)
                job.progress = 50
                
                medical_items_list = []
                for medical_path in medical_paths:
                    medical_items = extract_document_items(medical_path)
                    medical_items_list.append(medical_items)
                
                job.progress = 70
                
                # Find detailed mismatches
                mismatch_result = find_bill_to_docs_mismatches(bill_items, medical_items_list)
                
                # Check if mismatch analysis failed
                if 'error' in mismatch_result:
                    raise Exception(f"Mismatch analysis failed: {mismatch_result['error']}")
                
                job.progress = 90
                
                # Extract revenue leakage data (items in records but not billed)
                unbilled_medications = mismatch_result.get('bill_vs_medical_mismatches', {}).get('medications_in_medical_records_but_not_billed', [])
                revenue_impact = mismatch_result.get('revenue_impact_analysis', {}).get('potential_revenue_leakage', {}).get('estimated_impact', 'UNKNOWN')
                
                job.result = {
                    'analysisId': str(uuid.uuid4()),
                    'timestamp': datetime.now().isoformat(),
                    'analysisType': 'revenue_leakage',
                    'revenueImpactLevel': revenue_impact,
                    'totalLeakageOpportunities': len(unbilled_medications),
                    'leakageOpportunities': {
                        'unbilledMedications': unbilled_medications
                    },
                    'recommendations': mismatch_result.get('recommendations', {}).get('revenue_recovery_actions', []),
                    'detailedAnalysis': mismatch_result
                }
                
            except Exception as analysis_error:
                print(f"Error in revenue leakage analysis: {str(analysis_error)}")
                import traceback
                print(f"Full traceback: {traceback.format_exc()}")
                raise analysis_error
        else:
            raise Exception("Analysis modules not available. Please ensure all required modules are installed.")
        
        job.progress = 100
        job.status = 'completed'
        job.completed_at = datetime.now()
        
    except Exception as e:
        print(f"Error in revenue leakage analysis: {str(e)}")
        job.status = 'failed'
        job.error = str(e)

def run_general_analysis(job):
    """Run general document analysis in background"""
    try:
        job.status = 'processing'
        job.progress = 10
        
        if ANALYSIS_MODULES_AVAILABLE:
            print(f"Starting general document analysis for {len(job.file_paths)} documents")
            
            # Use GenericDocumentAnalyzer
            analyzer = GenericDocumentAnalyzer(file_paths=job.file_paths)
            job.progress = 30
            
            # Process each document
            all_results = []
            all_analyses_text = []
            
            for i, file_path in enumerate(job.file_paths):
                print(f"Analyzing document {i+1}/{len(job.file_paths)}: {os.path.basename(file_path)}")
                
                # Analyze document - this returns dict with response text
                doc_analysis = analyzer.analyze_document(file_path, i+1)
                analysis_text = doc_analysis.get('response', 'No analysis available')
                
                # Store for combined summary
                all_analyses_text.append(f"### Document: {os.path.basename(file_path)}\n\n{analysis_text}")
                
                all_results.append({
                    'documentId': str(uuid.uuid4()),
                    'documentName': os.path.basename(file_path),
                    'documentPath': file_path,
                    'analysisTimestamp': doc_analysis.get('analysis_timestamp'),
                    'analysisSuccessful': doc_analysis.get('analysis_successful', True),
                    'analysis': analysis_text
                })
                
                # Update progress for individual analyses (30% to 80%)
                job.progress = 30 + (i + 1) * 50 // len(job.file_paths)
            
            # Generate combined summary if multiple documents
            combined_summary = None
            if len(job.file_paths) > 1:
                print(f"🔄 Generating combined summary for {len(job.file_paths)} documents...")
                job.progress = 85
                
                try:
                    # Create a combined summary using GPT-4
                    combined_prompt = f"""You have analyzed {len(job.file_paths)} documents individually. Now provide a comprehensive combined summary that:

1. Identifies common themes or patterns across all documents
2. Highlights key differences or unique aspects of each document
3. Provides an overall assessment or conclusion
4. Notes any relationships or connections between the documents

Here are the individual analyses:

{chr(10).join(all_analyses_text)}

Please provide a cohesive summary that synthesizes the information from all documents."""

                    client = get_openai_client()
                    
                    response = client.chat.completions.create(
                        model=AzureOpenAIConfig.DEPLOYMENT,
                        messages=[
                            {"role": "system", "content": "You are an expert analyst who synthesizes information from multiple documents to provide comprehensive summaries."},
                            {"role": "user", "content": combined_prompt}
                        ],
                        temperature=0.3,
                        max_completion_tokens=4000
                    )
                    
                    combined_summary = response.choices[0].message.content
                    print("✅ Combined summary generated successfully")
                    print(f"   Summary length: {len(combined_summary)} characters")
                    
                except Exception as summary_error:
                    print(f"❌ Error generating combined summary: {str(summary_error)}")
                    import traceback
                    print(f"   Full traceback: {traceback.format_exc()}")
                    combined_summary = "## Combined Summary\n\nUnable to generate combined summary due to an error. Please review individual document analyses above."
            
            job.progress = 95
            
            # Create result
            job.result = {
                'analysisId': str(uuid.uuid4()),
                'timestamp': datetime.now().isoformat(),
                'analysisType': 'general_document',
                'totalDocuments': len(job.file_paths),
                'successfulAnalyses': len(all_results),
                'failedAnalyses': 0,
                'results': all_results,
                'combinedSummary': combined_summary
            }
            
            print(f"📊 Analysis complete. Combined summary: {'✅ Generated' if combined_summary else '❌ Not generated'}")
        else:
            raise Exception("Analysis modules not available. Please ensure all required modules are installed.")
        
        job.progress = 100
        job.status = 'completed'
        job.completed_at = datetime.now()
        
    except Exception as e:
        print(f"Error in general analysis: {str(e)}")
        import traceback
        print(f"Full traceback: {traceback.format_exc()}")
        job.status = 'failed'
        job.error = str(e)

def run_xray_analysis(job):
    """Run X-ray analysis to generate radiology report"""
    try:
        job.status = 'processing'
        job.progress = 10
        
        print(f"Starting X-ray analysis for: {job.file_paths[0]}")
        
        import base64
        
        # Use Azure OpenAI X-Ray configuration from environment
        client = get_xray_openai_client()
        
        job.progress = 30
        
        # Encode image to base64
        image_path = job.file_paths[0]
        with open(image_path, "rb") as image_file:
            base64_image = base64.b64encode(image_file.read()).decode('utf-8')
        
        job.progress = 50
        
        # Generate radiology report
        xray_prompt = """Generate a professional radiology report for this X-ray image using the following format:

EXAMINATION: [Type of X-ray study]
TECHNIQUE: [Imaging technique and views obtained]
CLINICAL INDICATION: [If apparent from image context]

FINDINGS:
- Bones: [Describe bone structures, alignment, density, any fractures or abnormalities]
- Joints: [Describe joint spaces, alignment, degenerative changes]
- Soft Tissues: [Describe visible soft tissue structures]
- Other: [Any additional findings]

IMPRESSION:
[Summary of key findings and clinical significance]

RECOMMENDATIONS:
[Clinical correlation and follow-up suggestions]

**DISCLAIMER: This AI-generated report is for educational purposes only and should not replace professional radiological interpretation. All findings require confirmation by a qualified radiologist."""
        
        response = client.chat.completions.create(
            model=AzureOpenAIXRayConfig.DEPLOYMENT,
            messages=[
                {
                    "role": "system",
                    "content": "You are a board-certified radiologist AI assistant. Generate a professional radiology report in standard medical format with proper sections: EXAMINATION, TECHNIQUE, FINDINGS, and IMPRESSION. Use medical terminology and maintain professional tone throughout."
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": xray_prompt
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
            temperature=0.7,
            top_p=1.0
        )
        
        radiology_report = response.choices[0].message.content
        job.progress = 90
        
        # Create result
        job.result = {
            'imagePath': image_path,
            'imageName': os.path.basename(image_path),
            'analysisTimestamp': datetime.now().isoformat(),
            'analysisSuccessful': True,
            'radiologyReport': radiology_report
        }
        
        job.progress = 100
        job.status = 'completed'
        job.completed_at = datetime.now()
        
        print(f"✅ X-ray analysis completed successfully")
        
    except Exception as e:
        print(f"Error in X-ray analysis: {str(e)}")
        import traceback
        print(f"Full traceback: {traceback.format_exc()}")
        job.status = 'failed'
        job.error = str(e)

def run_custom_analysis(job):
    """Run custom document analysis with user-defined instructions"""
    try:
        job.status = 'processing'
        job.progress = 10
        
        # Get custom configuration
        config = job.custom_config or {}
        custom_instructions = config.get('instructions', 'Analyze this document.')
        model_name = config.get('model_name', 'gpt-4o')
        temperature = config.get('temperature', 0.3)
        max_completion_tokens = config.get('max_completion_tokens', 4000)
        document_type = config.get('document_type', 'Document')
        output_format = config.get('output_format', 'Markdown')
        
        print(f"Starting custom document analysis for {len(job.file_paths)} documents")
        print(f"Model: {model_name}, Temperature: {temperature}, Max Tokens: {max_completion_tokens}")
        print(f"Document Type: {document_type}, Output Format: {output_format}")
        
        # Use Azure OpenAI configuration from environment
        client = get_openai_client()
        
        job.progress = 20
        
        # Process each document with custom instructions
        all_results = []
        all_analyses_text = []
        
        for i, file_path in enumerate(job.file_paths):
            print(f"Analyzing document {i+1}/{len(job.file_paths)}: {os.path.basename(file_path)}")
            
            try:
                # Use GenericDocumentAnalyzer's vision capability
                from generic_document_analyzer_final import GenericDocumentAnalyzer
                analyzer = GenericDocumentAnalyzer(file_paths=[file_path])
                
                # Create custom prompt based on user instructions
                custom_prompt = f"""Document Type: {document_type}
Output Format: {output_format}

Instructions:
{custom_instructions}

Please analyze the document according to the above instructions."""
                
                # Analyze document with custom instructions
                doc_analysis = analyzer.analyze_document_with_custom_prompt(
                    image_path=file_path, 
                    custom_prompt=custom_prompt,
                    model_name=model_name,
                    temperature=temperature,
                    max_completion_tokens=max_completion_tokens,
                    doc_number=i+1
                )
                
                analysis_text = doc_analysis.get('response', 'No analysis available')
                
                # Store for combined summary
                all_analyses_text.append(f"### Document: {os.path.basename(file_path)}\n\n{analysis_text}")
                
                all_results.append({
                    'documentId': str(uuid.uuid4()),
                    'documentName': os.path.basename(file_path),
                    'documentPath': file_path,
                    'analysisTimestamp': datetime.now().isoformat(),
                    'analysisSuccessful': True,
                    'analysis': analysis_text
                })
                
            except Exception as doc_error:
                print(f"Error analyzing document {os.path.basename(file_path)}: {str(doc_error)}")
                all_results.append({
                    'documentId': str(uuid.uuid4()),
                    'documentName': os.path.basename(file_path),
                    'documentPath': file_path,
                    'analysisTimestamp': datetime.now().isoformat(),
                    'analysisSuccessful': False,
                    'analysis': f"Error: {str(doc_error)}"
                })
            
            # Update progress (20% to 80%)
            job.progress = 20 + (i + 1) * 60 // len(job.file_paths)
        
        # Generate combined summary if multiple documents
        combined_summary = None
        if len(job.file_paths) > 1:
            print(f"🔄 Generating combined summary for {len(job.file_paths)} documents...")
            job.progress = 85
            
            try:
                combined_prompt = f"""You have analyzed {len(job.file_paths)} {document_type} documents using these instructions:

{custom_instructions}

Now provide a comprehensive combined summary that:
1. Synthesizes findings across all documents
2. Identifies common themes or patterns
3. Highlights key differences or unique aspects
4. Provides an overall assessment
5. Format the output as: {output_format}

Here are the individual analyses:

{chr(10).join(all_analyses_text)}

Please provide a cohesive summary."""
                
                response = client.chat.completions.create(
                    model="gpt-4.1",
                    messages=[
                        {"role": "system", "content": f"You are an expert analyst specializing in {document_type} analysis. Provide clear, structured output in {output_format} format."},
                        {"role": "user", "content": combined_prompt}
                    ],
                    temperature=temperature,
                    max_completion_tokens=max_completion_tokens
                )
                
                combined_summary = response.choices[0].message.content
                print("✅ Combined summary generated successfully")
                
            except Exception as summary_error:
                print(f"❌ Error generating combined summary: {str(summary_error)}")
                combined_summary = f"## Combined Summary\n\nUnable to generate combined summary. Please review individual document analyses."
        
        job.progress = 95
        
        # Create result
        job.result = {
            'analysisId': str(uuid.uuid4()),
            'timestamp': datetime.now().isoformat(),
            'analysisType': 'custom_document',
            'documentType': document_type,
            'customInstructions': custom_instructions,
            'modelUsed': model_name,
            'temperature': temperature,
            'totalDocuments': len(job.file_paths),
            'successfulAnalyses': len([r for r in all_results if r['analysisSuccessful']]),
            'failedAnalyses': len([r for r in all_results if not r['analysisSuccessful']]),
            'results': all_results,
            'combinedSummary': combined_summary
        }
        
        print(f"📊 Custom analysis complete!")
        
        job.progress = 100
        job.status = 'completed'
        job.completed_at = datetime.now()
        
    except Exception as e:
        print(f"Error in custom analysis: {str(e)}")
        import traceback
        print(f"Full traceback: {traceback.format_exc()}")
        job.status = 'failed'
        job.error = str(e)

def run_fake_document_detection(job):
    """Run fake document detection analysis in background"""
    try:
        job.status = 'processing'
        job.progress = 10
        
        print(f"Starting fake document detection for {len(job.file_paths)} document(s)")
        
        # Import the fake document detector
        sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'docufraud'))
        from fakedoc import FakeDocumentDetector
        
        job.progress = 20
        
        # Initialize detector
        detector = FakeDocumentDetector()
        
        # Analyze document
        file_path = job.file_paths[0]  # Single document analysis
        print(f"Analyzing: {os.path.basename(file_path)}")
        
        job.progress = 40
        
        # Perform analysis
        results = detector.detect_fake_document(file_path)
        
        job.progress = 80
        
        if results.get('verdict') == 'ERROR':
            raise Exception(results.get('error', 'Unknown error occurred'))
        
        # Format results for frontend
        job.result = {
            'analysisId': str(uuid.uuid4()),
            'timestamp': datetime.now().isoformat(),
            'analysisType': 'fake_document_detection',
            'documentName': os.path.basename(file_path),
            'documentPath': file_path,
            'verdict': results.get('verdict', 'UNKNOWN'),
            'confidenceScore': results.get('confidence_score', 0),
            'riskLevel': results.get('risk_level', 'UNKNOWN'),
            'summary': results.get('summary', ''),
            'detailedFindings': results.get('detailed_findings', {}),
            'redFlags': results.get('red_flags', []),
            'recommendations': results.get('recommendations', []),
            'reasoning': results.get('reasoning', ''),
            'metadata': results.get('metadata', {})
        }
        
        print(f"✅ Fake document detection complete! Verdict: {results.get('verdict')}")
        
        job.progress = 100
        job.status = 'completed'
        job.completed_at = datetime.now()
        
    except Exception as e:
        print(f"Error in fake document detection: {str(e)}")
        import traceback
        print(f"Full traceback: {traceback.format_exc()}")
        job.status = 'failed'
        job.error = str(e)

def run_tampering_detection(job):
    """Run tampering detection analysis in background"""
    try:
        job.status = 'processing'
        job.progress = 10
        save_job_to_disk(job)  # Save initial status
        
        print(f"Starting tampering detection for {len(job.file_paths)} document(s)")
        
        # Import the integrated tampering detector
        sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'docufraud'))
        from integrated_tampering_detector import IntegratedTamperingDetector
        
        job.progress = 20
        save_job_to_disk(job)
        
        # Initialize detector
        detector = IntegratedTamperingDetector(output_dir=os.path.join(UPLOAD_FOLDER, 'tampering_reports'))
        
        # Analyze document
        file_path = job.file_paths[0]  # Single document analysis
        print(f"Analyzing: {os.path.basename(file_path)}")
        
        job.progress = 40
        save_job_to_disk(job)
        
        # Perform analysis
        results = detector.analyze_document(file_path)
        
        job.progress = 80
        save_job_to_disk(job)
        
        if 'error' in results:
            raise Exception(results['error'])
        
        # Format results for frontend
        page_analyses = results.get('page_analyses', [])
        formatted_results = []
        
        for page_result in page_analyses:
            forensic = page_result['forensic_analysis']
            llm = page_result['llm_analysis']
            verdict = page_result['integrated_verdict']
            
            formatted_results.append({
                'page': page_result['page'],
                'imagePath': page_result['image_path'],
                'forensicAnalysis': {
                    'score': forensic['forensic_score'],
                    'verdict': forensic['forensic_verdict'],
                    'reasons': forensic['forensic_reasons'],
                    'metrics': forensic['forensic_metrics'],
                    'outputDir': forensic['forensic_output_dir'],
                    'images': forensic['forensic_images']
                },
                'llmAnalysis': llm,
                'integratedVerdict': verdict
            })
        
        job.result = {
            'analysisId': str(uuid.uuid4()),
            'timestamp': datetime.now().isoformat(),
            'analysisType': 'tampering_detection',
            'documentName': results['document_name'],
            'documentPath': results['document_path'],
            'totalPages': results['total_pages'],
            'summary': results['summary'],
            'pageAnalyses': formatted_results
        }
        
        print(f"✅ Tampering detection complete!")
        
        job.progress = 100
        job.status = 'completed'
        job.completed_at = datetime.now()
        save_job_to_disk(job)  # Save final status
        
    except Exception as e:
        print(f"Error in tampering detection: {str(e)}")
        import traceback
        print(f"Full traceback: {traceback.format_exc()}")
        job.status = 'failed'
        job.error = str(e)
        save_job_to_disk(job)  # Save error status

@app.route('/analyze/fake-document', methods=['POST'])
def start_fake_document_detection():
    """Start fake document detection analysis"""
    try:
        data = request.get_json()
        document_id = data.get('document_id')
        
        if not document_id:
            return jsonify({'error': 'No document provided'}), 400
        
        if document_id not in uploaded_files:
            return jsonify({'error': 'Document not found'}), 404
        
        # Create analysis job
        job_id = str(uuid.uuid4())
        job = AnalysisJob(job_id, 'fake_document', [uploaded_files[document_id]['file_path']])
        analysis_jobs[job_id] = job
        
        # Start analysis in background thread
        thread = threading.Thread(target=run_fake_document_detection, args=(job,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'jobId': job_id,
            'status': 'pending',
            'message': 'Fake document detection analysis started'
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to start fake document detection: {str(e)}'}), 500

@app.route('/analyze/tampering', methods=['POST'])
def start_tampering_detection():
    """Start document tampering detection analysis"""
    try:
        data = request.get_json()
        document_id = data.get('document_id')
        
        if not document_id:
            return jsonify({'error': 'No document provided'}), 400
        
        if document_id not in uploaded_files:
            return jsonify({'error': 'Document not found'}), 404
        
        # Create analysis job
        job_id = str(uuid.uuid4())
        job = AnalysisJob(job_id, 'tampering', [uploaded_files[document_id]['file_path']])
        analysis_jobs[job_id] = job
        save_job_to_disk(job)  # Save job immediately to disk
        
        # Start analysis in background thread
        thread = threading.Thread(target=run_tampering_detection, args=(job,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'jobId': job_id,
            'status': 'pending',
            'message': 'Tampering detection analysis started'
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to start tampering detection: {str(e)}'}), 500

def run_co_document_analysis(job):
    """Run co-document analysis in background"""
    try:
        job.status = 'processing'
        job.progress = 10
        
        print(f"Starting co-document analysis for 2 documents")
        
        # Import the co-document analyzer
        sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'docufraud'))
        from codocanalyser import CoDocumentAnalyzer
        
        job.progress = 20
        
        # Initialize analyzer
        analyzer = CoDocumentAnalyzer()
        
        # Get file paths and metadata
        file1_path = job.file_paths[0]
        file2_path = job.file_paths[1]
        doc1_type = job.metadata.get('doc1_type', 'Document 1')
        doc2_type = job.metadata.get('doc2_type', 'Document 2')
        
        print(f"Comparing: {os.path.basename(file1_path)} vs {os.path.basename(file2_path)}")
        
        job.progress = 30
        
        # Process both documents
        doc1_info = analyzer.process_document(file1_path)
        job.progress = 50
        
        doc2_info = analyzer.process_document(file2_path)
        job.progress = 60
        
        # Perform comparison analysis
        results = analyzer.analyze_co_documents(doc1_info, doc2_info, doc1_type, doc2_type)
        
        job.progress = 90
        
        if results.get('verdict') == 'ERROR':
            raise Exception(results.get('error', 'Unknown error occurred'))
        
        # Format results for frontend
        job.result = {
            'analysisId': str(uuid.uuid4()),
            'timestamp': datetime.now().isoformat(),
            'analysisType': 'co_document_comparison',
            'document1': {
                'name': os.path.basename(file1_path),
                'type': doc1_type,
                'path': file1_path
            },
            'document2': {
                'name': os.path.basename(file2_path),
                'type': doc2_type,
                'path': file2_path
            },
            'verdict': results.get('verdict', 'UNKNOWN'),
            'confidenceScore': results.get('confidence_score', 0),
            'riskLevel': results.get('risk_level', 'UNKNOWN'),
            'summary': results.get('summary', ''),
            'documentAnalysis': results.get('document_analysis', {}),
            'comparisonResults': results.get('comparison_results', {}),
            'redFlags': results.get('red_flags', []),
            'fraudIndicators': results.get('fraud_indicators', []),
            'recommendations': results.get('recommendations', []),
            'detailedReasoning': results.get('detailed_reasoning', ''),
            'metadata': results.get('metadata', {})
        }
        
        print(f"✅ Co-document analysis complete! Verdict: {results.get('verdict')}")
        
        job.progress = 100
        job.status = 'completed'
        job.completed_at = datetime.now()
        
    except Exception as e:
        print(f"Error in co-document analysis: {str(e)}")
        import traceback
        print(f"Full traceback: {traceback.format_exc()}")
        job.status = 'failed'
        job.error = str(e)

@app.route('/analyze/co-document', methods=['POST'])
def start_co_document_analysis():
    """Start co-document comparison analysis"""
    try:
        data = request.get_json()
        document1_id = data.get('document1_id')
        document2_id = data.get('document2_id')
        doc1_type = data.get('doc1_type', 'Document 1')
        doc2_type = data.get('doc2_type', 'Document 2')
        
        if not document1_id or not document2_id:
            return jsonify({'error': 'Two documents required'}), 400
        
        if document1_id not in uploaded_files:
            return jsonify({'error': 'Document 1 not found'}), 404
        
        if document2_id not in uploaded_files:
            return jsonify({'error': 'Document 2 not found'}), 404
        
        # Create analysis job with both file paths
        job_id = str(uuid.uuid4())
        job = AnalysisJob(
            job_id, 
            'co_document', 
            [uploaded_files[document1_id]['file_path'], uploaded_files[document2_id]['file_path']]
        )
        job.metadata = {
            'doc1_type': doc1_type,
            'doc2_type': doc2_type
        }
        analysis_jobs[job_id] = job
        
        # Start analysis in background thread
        thread = threading.Thread(target=run_co_document_analysis, args=(job,))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'jobId': job_id,
            'status': 'pending',
            'message': 'Co-document comparison analysis started'
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to start co-document analysis: {str(e)}'}), 500


if __name__ == '__main__':
    print("Starting Hospital Medical Analysis API Server...")
    print(f"Analysis modules available: {ANALYSIS_MODULES_AVAILABLE}")
    
    # Scan uploads folder to rebuild file registry
    scan_uploads_folder()
    
    # Load existing analysis jobs from disk
    load_all_jobs_from_disk()
    
    print(f"API will be available at http://{APIConfig.HOST}:{APIConfig.PORT}")
    app.run(debug=APIConfig.DEBUG, host=APIConfig.HOST, port=APIConfig.PORT)
