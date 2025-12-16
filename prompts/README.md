# Prompt Management System

This directory contains all AI prompts and instructions used throughout the Parse-AI system. Prompts have been extracted from the code into separate text files for better maintainability, version control, and easier updates.

## Directory Structure

```
prompts/
├── medical_analysis_prompt.txt           - Medical document analysis instructions
├── medical_system_prompt.txt              - Medical analysis AI system prompt
├── generic_document_analysis_prompt.txt   - Generic document analysis instructions
├── generic_document_system_prompt.txt     - Generic document AI system prompt
├── xray_analysis_prompt.txt               - X-ray/radiology report generation
├── xray_system_prompt.txt                 - X-ray analysis AI system prompt
├── co_document_comparison_prompt_template.txt  - Cross-document fraud detection
├── co_document_system_prompt.txt          - Cross-document AI system prompt
├── tampering_detection_prompt.txt         - Document tampering detection
├── tampering_detection_system_prompt.txt  - Tampering detection AI system prompt
├── fake_document_detection_prompt.txt     - Fake document detection
└── fake_document_system_prompt.txt        - Fake document detection AI system prompt
```

## Usage

### Loading Prompts in Code

Use the `prompt_manager.py` module to load prompts:

```python
from prompt_manager import (
    get_medical_analysis_prompt,
    get_medical_system_prompt,
    get_xray_analysis_prompt,
    get_co_document_comparison_prompt,
    get_tampering_detection_prompt,
    get_fake_document_detection_prompt
)

# Example: Load medical analysis prompts
analysis_prompt = get_medical_analysis_prompt()
system_prompt = get_medical_system_prompt()

# Example: Load comparison prompt with parameters
comparison_prompt = get_co_document_comparison_prompt(
    doc1_type="Medical Bill",
    doc2_type="Prescription",
    current_date="December 16, 2025"
)
```

### Prompt Types

1. **Analysis Prompts** - Instructions for the AI on what to analyze and extract
2. **System Prompts** - Define the AI's role, expertise, and behavior

## Benefits

✅ **Easier Maintenance** - Update prompts without modifying code  
✅ **Version Control** - Track prompt changes in git separately from code  
✅ **A/B Testing** - Test different prompt variations easily  
✅ **Documentation** - Prompts are self-documenting and reviewable  
✅ **Collaboration** - Non-developers can review and suggest prompt improvements  
✅ **Reusability** - Share prompts across different parts of the application  

## Editing Prompts

1. Open the relevant `.txt` file in the `prompts/` directory
2. Make your changes
3. Save the file
4. The changes will be automatically picked up on the next run (prompts are cached in memory)

### Template Variables

Some prompts support template variables:

- `{doc1_type}`, `{doc2_type}` - Document type names in comparison prompts
- `{current_date}` - Current date for time-sensitive checks
- `{metadata}` - Document metadata in tampering detection

These are replaced by the `prompt_manager.py` module when loading.

## Prompt Engineering Guidelines

When editing prompts, follow these best practices:

1. **Be Specific** - Clearly define what you want the AI to do
2. **Provide Structure** - Use clear sections and formatting
3. **Give Examples** - Show expected output format (especially for JSON)
4. **Set Context** - Define the AI's role and expertise
5. **Include Rules** - Specify strict rules for edge cases
6. **Add Instructions** - Clarify ambiguous situations
7. **Maintain Consistency** - Use similar language across related prompts

## Testing Prompts

After modifying a prompt:

1. Test with sample documents
2. Verify the output format is correct
3. Check edge cases and error handling
4. Document any significant changes in git commits

## Related Files

- `prompt_manager.py` - Main prompt loading module
- `config.py` - Configuration and environment variables
- `.env` - Environment configuration (API keys, endpoints, etc.)

## Need Help?

- Check existing prompts for examples
- Review the `prompt_manager.py` module for available functions
- Test changes in a development environment first
