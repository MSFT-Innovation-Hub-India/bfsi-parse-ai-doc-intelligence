"""
Centralized Configuration Module for Parse-AI
Loads configuration from environment variables with .env file support
Uses Azure Managed Identity for authentication (no API keys required)
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from azure.identity import DefaultAzureCredential, get_bearer_token_provider

# Load .env file from project root
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)

# Global credential instance (reused across all Azure services)
_azure_credential = None

def get_azure_credential():
    """Get or create the Azure credential instance using Managed Identity"""
    global _azure_credential
    if _azure_credential is None:
        # DefaultAzureCredential will use Managed Identity in Azure,
        # and fall back to other auth methods (Azure CLI, VS Code, etc.) for local development
        _azure_credential = DefaultAzureCredential()
    return _azure_credential


class AzureOpenAIConfig:
    """Azure OpenAI Configuration (Primary) - Uses Managed Identity"""
    ENDPOINT = os.getenv('AZURE_OPENAI_ENDPOINT')
    API_VERSION = os.getenv('AZURE_OPENAI_API_VERSION', '2025-01-01-preview')
    DEPLOYMENT = os.getenv('AZURE_OPENAI_DEPLOYMENT', 'gpt-4.1')
    
    @classmethod
    def validate(cls):
        """Validate that required configuration is present"""
        if not cls.ENDPOINT:
            raise ValueError("AZURE_OPENAI_ENDPOINT is not set in environment variables")
        return True
    
    @classmethod
    def get_token_provider(cls):
        """Get Azure AD token provider for OpenAI authentication"""
        return get_bearer_token_provider(
            get_azure_credential(),
            "https://cognitiveservices.azure.com/.default"
        )


class AzureOpenAIXRayConfig:
    """Azure OpenAI Configuration for X-Ray Analysis - Uses Managed Identity"""
    ENDPOINT = os.getenv('AZURE_OPENAI_XRAY_ENDPOINT')
    API_VERSION = os.getenv('AZURE_OPENAI_XRAY_API_VERSION', '2024-12-01-preview')
    DEPLOYMENT = os.getenv('AZURE_OPENAI_XRAY_DEPLOYMENT', 'gpt-4o')
    
    @classmethod
    def validate(cls):
        """Validate that required configuration is present"""
        if not cls.ENDPOINT:
            raise ValueError("AZURE_OPENAI_XRAY_ENDPOINT is not set in environment variables")
        return True
    
    @classmethod
    def get_token_provider(cls):
        """Get Azure AD token provider for OpenAI authentication"""
        return get_bearer_token_provider(
            get_azure_credential(),
            "https://cognitiveservices.azure.com/.default"
        )


class AzureStorageConfig:
    """Azure Blob Storage Configuration - Uses Managed Identity"""
    ACCOUNT_URL = os.getenv('AZURE_STORAGE_ACCOUNT_URL')  # e.g., https://youraccount.blob.core.windows.net
    CONTAINER_NAME = os.getenv('AZURE_STORAGE_CONTAINER_NAME', 'apollo')
    
    @classmethod
    def validate(cls):
        """Validate that required configuration is present"""
        if not cls.ACCOUNT_URL:
            raise ValueError("AZURE_STORAGE_ACCOUNT_URL is not set in environment variables")
        return True
    
    @classmethod
    def get_credential(cls):
        """Get Azure credential for Blob Storage authentication"""
        return get_azure_credential()


class APIConfig:
    """API Server Configuration"""
    HOST = os.getenv('API_HOST', '0.0.0.0')
    # Azure App Service sets PORT env variable, fallback to API_PORT or 8000
    PORT = int(os.getenv('PORT', os.getenv('API_PORT', '8000')))
    # Disable debug mode in production (Azure sets WEBSITE_INSTANCE_ID)
    DEBUG = os.getenv('API_DEBUG', 'false' if os.getenv('WEBSITE_INSTANCE_ID') else 'true').lower() == 'true'
    UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'uploads')
    MAX_CONTENT_LENGTH = int(os.getenv('MAX_CONTENT_LENGTH', '16777216'))  # 16MB


def get_openai_client():
    """Get configured Azure OpenAI client for primary operations using Managed Identity"""
    from openai import AzureOpenAI
    
    AzureOpenAIConfig.validate()
    return AzureOpenAI(
        api_version=AzureOpenAIConfig.API_VERSION,
        azure_endpoint=AzureOpenAIConfig.ENDPOINT,
        azure_ad_token_provider=AzureOpenAIConfig.get_token_provider(),
    )


def get_xray_openai_client():
    """Get configured Azure OpenAI client for X-Ray analysis using Managed Identity"""
    from openai import AzureOpenAI
    
    AzureOpenAIXRayConfig.validate()
    return AzureOpenAI(
        api_version=AzureOpenAIXRayConfig.API_VERSION,
        azure_endpoint=AzureOpenAIXRayConfig.ENDPOINT,
        azure_ad_token_provider=AzureOpenAIXRayConfig.get_token_provider(),
    )


def get_blob_service_client():
    """Get configured Azure Blob Service Client using Managed Identity"""
    from azure.storage.blob import BlobServiceClient
    
    AzureStorageConfig.validate()
    return BlobServiceClient(
        account_url=AzureStorageConfig.ACCOUNT_URL,
        credential=AzureStorageConfig.get_credential()
    )


# Validate configuration on import (optional - can be disabled for testing)
def validate_all():
    """Validate all required configuration is present"""
    errors = []
    
    try:
        AzureOpenAIConfig.validate()
    except ValueError as e:
        errors.append(str(e))
    
    try:
        AzureStorageConfig.validate()
    except ValueError as e:
        errors.append(str(e))
    
    # Test credential acquisition
    try:
        credential = get_azure_credential()
        print("✅ Azure Managed Identity credential acquired successfully")
    except Exception as e:
        errors.append(f"Failed to acquire Azure credential: {str(e)}")
    
    if errors:
        print("⚠️  Configuration warnings:")
        for error in errors:
            print(f"   - {error}")
    else:
        print("✅ All configuration validated successfully")
    
    return len(errors) == 0
