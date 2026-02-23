"""
Cosmos DB Storage Module for Parse-AI
Persists uploaded file metadata and analysis results to Azure Cosmos DB.
Uses Managed Identity for authentication (no keys required).
"""

import os
import sys
import json
import traceback
from datetime import datetime

# Add parent directory for config import
sys.path.append(os.path.dirname(__file__))
from config import AzureCosmosConfig, AzureStorageConfig, get_cosmos_client, get_blob_service_client

# ---------------------------------------------------------------------------
# Module-level lazy singletons
# ---------------------------------------------------------------------------
_cosmos_client = None
_database = None
_documents_container = None
_results_container = None


def _get_containers():
    """
    Lazily initialise and return (documents_container, results_container).
    Returns (None, None) when Cosmos DB is not configured so the rest of the
    app can keep running without it.
    """
    global _cosmos_client, _database, _documents_container, _results_container

    if _documents_container is not None and _results_container is not None:
        return _documents_container, _results_container

    try:
        AzureCosmosConfig.validate()
    except ValueError as e:
        print(f"⚠️  Cosmos DB not configured: {e}")
        return None, None

    try:
        _cosmos_client = get_cosmos_client()
        _database = _cosmos_client.get_database_client(AzureCosmosConfig.DATABASE_NAME)
        _documents_container = _database.get_container_client(AzureCosmosConfig.DOCUMENTS_CONTAINER)
        _results_container = _database.get_container_client(AzureCosmosConfig.RESULTS_CONTAINER)
        print("✅ Cosmos DB containers initialised successfully")
        return _documents_container, _results_container
    except Exception as e:
        print(f"⚠️  Failed to initialise Cosmos DB: {e}")
        return None, None


# ===========================
#  DOCUMENT / FILE METADATA
# ===========================

def save_document_metadata(file_id: str, metadata: dict) -> bool:
    """
    Save uploaded-file metadata to the *documents* container.

    Expected `metadata` keys (all optional – we store whatever is provided):
        original_name, blob_name, file_size, uploaded_at,
        content_type, storage_type, customer_id, source, category …

    Partition key: /partitionKey  (set to customer_id or "uploads")
    """
    docs_container, _ = _get_containers()
    if docs_container is None:
        return False

    try:
        item = {
            "id": file_id,
            "partitionKey": metadata.get("customer_id", "uploads"),
            "fileId": file_id,
            **metadata,
            "savedAt": datetime.utcnow().isoformat() + "Z",
        }
        # Remove None / non-serialisable values
        item = _clean_for_cosmos(item)

        docs_container.upsert_item(item)
        print(f"✅ Cosmos: saved document metadata for {file_id}")
        return True
    except Exception as e:
        print(f"❌ Cosmos: failed to save document metadata for {file_id}: {e}")
        traceback.print_exc()
        return False


def get_document_metadata(file_id: str, partition_key: str = "uploads") -> dict | None:
    """Read a single document's metadata from Cosmos DB."""
    docs_container, _ = _get_containers()
    if docs_container is None:
        return None

    try:
        item = docs_container.read_item(item=file_id, partition_key=partition_key)
        return item
    except Exception:
        return None


def list_documents(partition_key: str = "uploads", max_items: int = 100) -> list:
    """List documents from Cosmos DB for a given partition key."""
    docs_container, _ = _get_containers()
    if docs_container is None:
        return []

    try:
        query = "SELECT * FROM c WHERE c.partitionKey = @pk ORDER BY c.savedAt DESC"
        params = [{"name": "@pk", "value": partition_key}]
        items = list(
            docs_container.query_items(
                query=query,
                parameters=params,
                max_item_count=max_items,
            )
        )
        return items
    except Exception as e:
        print(f"❌ Cosmos: failed to list documents: {e}")
        return []


# ===========================
#  ANALYSIS RESULTS / JOBS
# ===========================

def save_analysis_result(job_id: str, job_data: dict) -> bool:
    """
    Save an analysis job (status + result) to the *analysis_results* container.

    Partition key: /partitionKey  (set to job_type)
    """
    _, results_container = _get_containers()
    if results_container is None:
        return False

    try:
        item = {
            "id": job_id,
            "partitionKey": job_data.get("job_type", "unknown"),
            "jobId": job_id,
            **job_data,
            "savedAt": datetime.utcnow().isoformat() + "Z",
        }
        item = _clean_for_cosmos(item)

        results_container.upsert_item(item)
        print(f"✅ Cosmos: saved analysis result for job {job_id}")
        return True
    except Exception as e:
        print(f"❌ Cosmos: failed to save analysis result for job {job_id}: {e}")
        traceback.print_exc()
        return False


def get_analysis_result(job_id: str, job_type: str = None) -> dict | None:
    """
    Read a single analysis result from Cosmos DB.
    If `job_type` (partition key) is not known, falls back to a cross-partition query.
    """
    _, results_container = _get_containers()
    if results_container is None:
        return None

    try:
        if job_type:
            return results_container.read_item(item=job_id, partition_key=job_type)

        # Cross-partition query fallback
        query = "SELECT * FROM c WHERE c.id = @id"
        params = [{"name": "@id", "value": job_id}]
        items = list(
            results_container.query_items(
                query=query,
                parameters=params,
                enable_cross_partition_query=True,
            )
        )
        return items[0] if items else None
    except Exception:
        return None


def list_analysis_results(job_type: str = None, max_items: int = 100) -> list:
    """List analysis results, optionally filtered by job_type."""
    _, results_container = _get_containers()
    if results_container is None:
        return []

    try:
        if job_type:
            query = "SELECT * FROM c WHERE c.partitionKey = @jt ORDER BY c.savedAt DESC"
            params = [{"name": "@jt", "value": job_type}]
            items = list(
                results_container.query_items(
                    query=query,
                    parameters=params,
                    max_item_count=max_items,
                )
            )
        else:
            query = "SELECT * FROM c ORDER BY c.savedAt DESC"
            items = list(
                results_container.query_items(
                    query=query,
                    parameters=[],
                    enable_cross_partition_query=True,
                    max_item_count=max_items,
                )
            )
        return items
    except Exception as e:
        print(f"❌ Cosmos: failed to list analysis results: {e}")
        return []


# ===========================
#  HELPERS
# ===========================

def _clean_for_cosmos(obj):
    """
    Recursively clean a dict/list so it is JSON-serialisable for Cosmos DB.
    - Converts datetime objects to ISO strings
    - Removes keys with None values
    - Converts non-string keys to strings
    """
    if isinstance(obj, dict):
        cleaned = {}
        for k, v in obj.items():
            key = str(k) if not isinstance(k, str) else k
            val = _clean_for_cosmos(v)
            if val is not None:
                cleaned[key] = val
        return cleaned
    elif isinstance(obj, list):
        return [_clean_for_cosmos(item) for item in obj]
    elif isinstance(obj, datetime):
        return obj.isoformat() + "Z"
    elif isinstance(obj, (str, int, float, bool)):
        return obj
    else:
        # Fallback: try str()
        try:
            return str(obj)
        except Exception:
            return None


def job_to_dict(job) -> dict:
    """
    Convert an AnalysisJob object to a plain dict suitable for Cosmos DB.
    Call this from app.py before passing to save_analysis_result().
    """
    return {
        "job_id": job.job_id,
        "job_type": job.job_type,
        "file_paths": job.file_paths,
        "status": job.status,
        "progress": job.progress,
        "result": job.result,
        "error": job.error,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "custom_config": job.custom_config,
        "metadata": job.metadata,
    }


# ===========================
#  RESULT IMAGES  –  Blob Storage
#  Container: parseai-results
# ===========================

def upload_result_image(local_path: str, job_id: str, image_name: str = None) -> str | None:
    """
    Upload a single result image to the *parseai-results* blob container.

    Blob path:  results/<job_id>/<image_name>
    Returns the blob name on success, None on failure.
    """
    if not os.path.isfile(local_path):
        print(f"⚠️  File not found, skipping blob upload: {local_path}")
        return None

    try:
        blob_service = get_blob_service_client()
        container_name = AzureStorageConfig.RESULTS_CONTAINER_NAME

        if not image_name:
            image_name = os.path.basename(local_path)

        blob_name = f"results/{job_id}/{image_name}"

        blob_client = blob_service.get_blob_client(
            container=container_name, blob=blob_name
        )

        with open(local_path, "rb") as f:
            blob_client.upload_blob(f, overwrite=True)

        print(f"  ✅ Blob: uploaded {blob_name}")
        return blob_name
    except Exception as e:
        print(f"  ❌ Blob: failed to upload {local_path}: {e}")
        return None


def upload_result_images(forensic_images: dict, job_id: str) -> dict:
    """
    Upload all forensic images for a job.

    `forensic_images` is a dict like:
        { "ela": "/path/to/ela.png", "noise_analysis": "/path/to/noise_analysis.png", … }

    Returns a new dict with the same keys but blob names as values:
        { "ela": "results/<job_id>/ela.png", … }
    """
    blob_refs = {}
    for key, local_path in forensic_images.items():
        if local_path and os.path.isfile(str(local_path)):
            blob_name = upload_result_image(str(local_path), job_id, f"{key}.png")
            if blob_name:
                blob_refs[key] = blob_name
    return blob_refs


def upload_source_image(local_path: str, job_id: str, page: int = 1) -> str | None:
    """Upload the source / page image for a result to blob storage."""
    if not local_path or not os.path.isfile(str(local_path)):
        return None
    blob_name = f"results/{job_id}/page_{page}_source{os.path.splitext(local_path)[1]}"
    return upload_result_image(local_path, job_id, os.path.basename(blob_name))


def get_result_image(blob_name: str) -> bytes | None:
    """
    Download a result image from the *parseai-results* container.
    Returns raw bytes on success, None on failure.
    """
    try:
        blob_service = get_blob_service_client()
        container_name = AzureStorageConfig.RESULTS_CONTAINER_NAME
        blob_client = blob_service.get_blob_client(
            container=container_name, blob=blob_name
        )
        return blob_client.download_blob().readall()
    except Exception as e:
        print(f"❌ Blob: failed to download {blob_name}: {e}")
        return None


def get_result_image_url(blob_name: str) -> str:
    """
    Build the full public/managed URL for a result image blob.
    (Used when constructing API response URLs.)
    """
    return f"{AzureStorageConfig.ACCOUNT_URL}/{AzureStorageConfig.RESULTS_CONTAINER_NAME}/{blob_name}"
