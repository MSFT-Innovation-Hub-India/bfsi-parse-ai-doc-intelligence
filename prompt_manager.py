"""
Prompt Management Module for Parse-AI
Centralized prompt storage and loading for AI analysis operations.
"""

import os
from pathlib import Path
from datetime import datetime
from typing import Dict

# Get the prompts directory path
PROMPTS_DIR = Path(__file__).parent / "prompts"


class PromptLoader:
    """Load and manage AI prompts from external files"""
    
    _cache: Dict[str, str] = {}
    
    @classmethod
    def load_prompt(cls, prompt_name: str) -> str:
        """
        Load a prompt from the prompts directory.
        
        Args:
            prompt_name: Name of the prompt file (without .txt extension)
            
        Returns:
            The prompt text
        """
        if prompt_name in cls._cache:
            return cls._cache[prompt_name]
        
        prompt_path = PROMPTS_DIR / f"{prompt_name}.txt"
        
        if not prompt_path.exists():
            raise FileNotFoundError(f"Prompt file not found: {prompt_path}")
        
        with open(prompt_path, 'r', encoding='utf-8') as f:
            prompt_text = f.read()
        
        cls._cache[prompt_name] = prompt_text
        return prompt_text
    
    @classmethod
    def clear_cache(cls):
        """Clear the prompt cache (useful for development/testing)"""
        cls._cache = {}


# Prompt loading functions for each analysis type
def get_medical_analysis_prompt() -> str:
    """Get the medical document analysis prompt"""
    return PromptLoader.load_prompt("medical_analysis_prompt")


def get_medical_system_prompt() -> str:
    """Get the medical analysis system prompt"""
    return PromptLoader.load_prompt("medical_system_prompt")


def get_generic_document_analysis_prompt() -> str:
    """Get the generic document analysis prompt"""
    return PromptLoader.load_prompt("generic_document_analysis_prompt")


def get_generic_document_system_prompt() -> str:
    """Get the generic document system prompt"""
    return PromptLoader.load_prompt("generic_document_system_prompt")


def get_xray_analysis_prompt() -> str:
    """Get the X-ray analysis prompt"""
    return PromptLoader.load_prompt("xray_analysis_prompt")


def get_xray_system_prompt() -> str:
    """Get the X-ray system prompt"""
    return PromptLoader.load_prompt("xray_system_prompt")


def get_co_document_comparison_prompt(doc1_type: str = "Document 1", 
                                      doc2_type: str = "Document 2",
                                      current_date: str = None) -> str:
    """
    Get the co-document comparison prompt with variables substituted.
    
    Args:
        doc1_type: Type/name of first document
        doc2_type: Type/name of second document
        current_date: Current date string (defaults to today)
    
    Returns:
        Formatted prompt with variables substituted
    """
    if current_date is None:
        current_date = datetime.now().strftime("%B %d, %Y")
    
    prompt_template = PromptLoader.load_prompt("co_document_comparison_prompt_template")
    
    # Replace placeholders
    prompt = prompt_template.replace("{doc1_type}", doc1_type)
    prompt = prompt.replace("{doc2_type}", doc2_type)
    prompt = prompt.replace("{current_date}", current_date)
    
    return prompt


def get_co_document_system_prompt() -> str:
    """Get the co-document analysis system prompt"""
    return PromptLoader.load_prompt("co_document_system_prompt")


def get_tampering_detection_prompt(metadata: str = "") -> str:
    """
    Get the tampering detection prompt.
    
    Args:
        metadata: Document metadata to include in the prompt
        
    Returns:
        Formatted prompt with metadata
    """
    prompt_template = PromptLoader.load_prompt("tampering_detection_prompt")
    return prompt_template.replace("{metadata}", metadata)


def get_tampering_detection_system_prompt() -> str:
    """Get the tampering detection system prompt"""
    return PromptLoader.load_prompt("tampering_detection_system_prompt")


def get_fake_document_detection_prompt(current_date: str = None) -> str:
    """
    Get the fake document detection prompt.
    
    Args:
        current_date: Current date string (defaults to today)
        
    Returns:
        Formatted prompt with current date
    """
    if current_date is None:
        current_date = datetime.now().strftime("%B %d, %Y")
    
    prompt_template = PromptLoader.load_prompt("fake_document_detection_prompt")
    return prompt_template.replace("{current_date}", current_date)


def get_fake_document_system_prompt() -> str:
    """Get the fake document detection system prompt"""
    return PromptLoader.load_prompt("fake_document_system_prompt")


def get_integrated_tampering_detection_prompt(forensic_summary: str, 
                                               ela_hot_pixels: str, 
                                               mean_rgb_std: str,
                                               mean_local_variance: str, 
                                               ssim_score: str) -> str:
    """
    Get the integrated tampering detection prompt with forensic data.
    
    Args:
        forensic_summary: Full forensic analysis summary
        ela_hot_pixels: ELA hot pixels percentage
        mean_rgb_std: RGB channel standard deviation
        mean_local_variance: Local variance mean
        ssim_score: SSIM score
        
    Returns:
        Formatted prompt with forensic metrics
    """
    prompt_template = PromptLoader.load_prompt("integrated_tampering_detection_prompt")
    
    # Replace placeholders
    prompt = prompt_template.replace("{forensic_summary}", forensic_summary)
    prompt = prompt.replace("{ela_hot_pixels}", ela_hot_pixels)
    prompt = prompt.replace("{mean_rgb_std}", mean_rgb_std)
    prompt = prompt.replace("{mean_local_variance}", mean_local_variance)
    prompt = prompt.replace("{ssim_score}", ssim_score)
    
    return prompt


def get_multi_document_comparison_prompt(num_documents: int) -> str:
    """
    Get the multi-document comparison prompt.
    
    Args:
        num_documents: Number of documents being compared
        
    Returns:
        Formatted prompt with document count
    """
    prompt_template = PromptLoader.load_prompt("multi_document_comparison_prompt")
    return prompt_template.replace("{num_documents}", str(num_documents))


def get_multi_document_comparison_system_prompt() -> str:
    """Get the multi-document comparison system prompt"""
    return PromptLoader.load_prompt("multi_document_comparison_system_prompt")


# Export all functions
__all__ = [
    'PromptLoader',
    'get_medical_analysis_prompt',
    'get_medical_system_prompt',
    'get_generic_document_analysis_prompt',
    'get_generic_document_system_prompt',
    'get_xray_analysis_prompt',
    'get_xray_system_prompt',
    'get_co_document_comparison_prompt',
    'get_co_document_system_prompt',
    'get_tampering_detection_prompt',
    'get_tampering_detection_system_prompt',
    'get_fake_document_detection_prompt',
    'get_fake_document_system_prompt',
    'get_integrated_tampering_detection_prompt',
    'get_multi_document_comparison_prompt',
    'get_multi_document_comparison_system_prompt'
]
