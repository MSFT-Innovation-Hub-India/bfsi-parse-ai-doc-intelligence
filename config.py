"""
Centralized Configuration Module for Parse-AI
Loads configuration from environment variables with .env file support
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from project root
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)


class AzureOpenAIConfig:
    """Azure OpenAI Configuration (Primary)"""
    ENDPOINT = os.getenv('AZURE_OPENAI_ENDPOINT')
    API_KEY = os.getenv('AZURE_OPENAI_API_KEY')
    API_VERSION = os.getenv('AZURE_OPENAI_API_VERSION', '2025-01-01-preview')
    DEPLOYMENT = os.getenv('AZURE_OPENAI_DEPLOYMENT', 'gpt-4.1')
    
    @classmethod
    def validate(cls):
        """Validate that required configuration is present"""
        if not cls.ENDPOINT:
            raise ValueError("AZURE_OPENAI_ENDPOINT is not set in environment variables")
        if not cls.API_KEY:
            raise ValueError("AZURE_OPENAI_API_KEY is not set in environment variables")
        return True


class AzureOpenAIXRayConfig:
    """Azure OpenAI Configuration for X-Ray Analysis"""
    ENDPOINT = os.getenv('AZURE_OPENAI_XRAY_ENDPOINT')
    API_KEY = os.getenv('AZURE_OPENAI_XRAY_API_KEY')
    API_VERSION = os.getenv('AZURE_OPENAI_XRAY_API_VERSION', '2024-12-01-preview')
    DEPLOYMENT = os.getenv('AZURE_OPENAI_XRAY_DEPLOYMENT', 'gpt-4o')
    
    @classmethod
    def validate(cls):
        """Validate that required configuration is present"""
        if not cls.ENDPOINT:
            raise ValueError("AZURE_OPENAI_XRAY_ENDPOINT is not set in environment variables")
        if not cls.API_KEY:
            raise ValueError("AZURE_OPENAI_XRAY_API_KEY is not set in environment variables")
        return True


class AzureStorageConfig:
    """Azure Blob Storage Configuration"""
    CONNECTION_STRING = os.getenv('AZURE_STORAGE_CONNECTION_STRING')
    CONTAINER_NAME = os.getenv('AZURE_STORAGE_CONTAINER_NAME', 'apollo')
    
    @classmethod
    def validate(cls):
        """Validate that required configuration is present"""
        if not cls.CONNECTION_STRING:
            raise ValueError("AZURE_STORAGE_CONNECTION_STRING is not set in environment variables")
        return True


class APIConfig:
    """API Server Configuration"""
    HOST = os.getenv('API_HOST', '0.0.0.0')
    PORT = int(os.getenv('API_PORT', '8000'))
    DEBUG = os.getenv('API_DEBUG', 'true').lower() == 'true'
    UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'uploads')
    MAX_CONTENT_LENGTH = int(os.getenv('MAX_CONTENT_LENGTH', '16777216'))  # 16MB


def get_openai_client():
    """Get configured Azure OpenAI client for primary operations"""
    from openai import AzureOpenAI
    
    AzureOpenAIConfig.validate()
    return AzureOpenAI(
        api_version=AzureOpenAIConfig.API_VERSION,
        azure_endpoint=AzureOpenAIConfig.ENDPOINT,
        api_key=AzureOpenAIConfig.API_KEY,
    )


def get_xray_openai_client():
    """Get configured Azure OpenAI client for X-Ray analysis"""
    from openai import AzureOpenAI
    
    AzureOpenAIXRayConfig.validate()
    return AzureOpenAI(
        api_version=AzureOpenAIXRayConfig.API_VERSION,
        azure_endpoint=AzureOpenAIXRayConfig.ENDPOINT,
        api_key=AzureOpenAIXRayConfig.API_KEY,
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
    
    if errors:
        print("⚠️  Configuration warnings:")
        for error in errors:
            print(f"   - {error}")
    else:
        print("✅ All configuration validated successfully")
    
    return len(errors) == 0
