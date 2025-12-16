import os
import base64
import sys

# Add parent directory to path for config import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config import AzureOpenAIXRayConfig, get_xray_openai_clientfrom prompt_manager import get_xray_analysis_prompt, get_xray_system_prompt
# Initialize Azure OpenAI client for X-Ray analysis from environment
client = get_xray_openai_client()

def encode_image(image_path):
    """Encode image to base64 string"""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def analyze_image(image_path=None, image_url=None, analysis_type="general"):
    """
    Analyze an image using Azure OpenAI Vision
    
    Args:
        image_path: Local path to image file
        image_url: URL to image
        analysis_type: Type of analysis - "general", "medical", "xray", "caption"
    """
    
    # Prepare the image content
    if image_path and os.path.exists(image_path):
        base64_image = encode_image(image_path)
        image_content = {
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{base64_image}"
            }
        }
    elif image_url:
        image_content = {
            "type": "image_url",
            "image_url": {
                "url": image_url
            }
        }
    else:
        raise ValueError("Either image_path or image_url must be provided")
    
    # Set system prompt based on analysis type
    system_prompts = {
        "general": "You are an AI assistant that analyzes images and provides detailed descriptions.",
        "medical": "You are a medical imaging specialist. Analyze the provided medical image and provide professional insights about any visible conditions, abnormalities, or notable features. Include disclaimers about seeking professional medical advice.",
        "xray": "You are a board-certified radiologist AI assistant. Generate a professional radiology report in standard medical format with proper sections: EXAMINATION, TECHNIQUE, FINDINGS, and IMPRESSION. Use medical terminology and maintain professional tone throughout.",
        "caption": "You are an image captioning specialist. Generate a concise, descriptive caption for the provided image."
    }
    
    user_prompts = {
        "general": "Please analyze this image and provide a detailed description of what you see.",
        "medical": "Analyze this medical image. Describe any visible conditions, abnormalities, or notable medical findings. Please include appropriate medical disclaimers.",
        "xray": """Generate a professional radiology report for this X-ray image using the following format:

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

**DISCLAIMER: This AI-generated report is for educational purposes only and should not replace professional radiological interpretation. All findings require confirmation by a qualified radiologist.**""",
        "caption": "Generate a descriptive caption for this image."
    }
    
    response = client.chat.completions.create(
        model=AzureOpenAIXRayConfig.DEPLOYMENT,
        messages=[
            {
                "role": "system",
                "content": system_prompts.get(analysis_type, system_prompts["general"])
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": user_prompts.get(analysis_type, user_prompts["general"])
                    },
                    image_content
                ]
            }
        ],
        max_tokens=4096,
        temperature=0.7,
        top_p=1.0
    )
    
    return response.choices[0].message.content

def main():
    """Main function for X-ray analysis"""
    print("=== X-ray Analysis Tool ===")
    
    # Get image input
    print("Choose image source:")
    print("1. Local image file")
    print("2. Image URL")
    
    choice = input("Enter your choice (1 or 2): ").strip()
    
    if choice == "1":
        image_path = input("Enter the path to your X-ray image file: ").strip()
        if not os.path.exists(image_path):
            print(f"Error: File '{image_path}' not found.")
            return
        
        print(f"\nAnalyzing X-ray image: {image_path}")
        print("Processing...")
        
        try:
            result = analyze_image(image_path=image_path, analysis_type="xray")
            print("\n" + "="*50)
            print("RADIOLOGY REPORT:")
            print("="*50)
            print(result)
        except Exception as e:
            print(f"Error analyzing image: {str(e)}")
    
    elif choice == "2":
        image_url = input("Enter the X-ray image URL: ").strip()
        
        print(f"\nAnalyzing X-ray image from URL: {image_url}")
        print("Processing...")
        
        try:
            result = analyze_image(image_url=image_url, analysis_type="xray")
            print("\n" + "="*50)
            print("RADIOLOGY REPORT:")
            print("="*50)
            print(result)
        except Exception as e:
            print(f"Error analyzing image: {str(e)}")
    
    else:
        print("Invalid choice. Please run the program again.")

if __name__ == "__main__":
    main()