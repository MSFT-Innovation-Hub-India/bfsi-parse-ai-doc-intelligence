# Parse-AI: Document Analysis & Fraud Detection

AI-powered document analysis system using Azure OpenAI GPT-4 Vision for medical documents, fraud detection, and tampering identification.

## Features

- **Document Analysis** - Medical reports, X-rays, generic documents, batch processing
- **Fraud Detection** - Cross-document comparison, fake detection, tampering analysis

## Quick Start

**Prerequisites:** Python 3.8+, Node.js 16+, Azure OpenAI API access

## Installation

```bash
# Clone and setup
git clone <your-repo-url>
cd Parse-AI

# Backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt

# Frontend
cd hospital-frontend
npm install
cd ..

# Configure environment
cp .env.example .env
# Edit .env with your Azure OpenAI credentials
```

**Required in `.env`:**
```env
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT=
```

**Frontend `.env.local`:**
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Running

```bash
# Backend (http://localhost:8000)
python api-server/app.py

# Frontend (http://localhost:3000)
cd hospital-frontend
npm run dev
```

## API Usage

**Upload & Analyze:**
```bash
POST /upload                    # Upload document
POST /analyze/single            # Single doc analysis
POST /analyze/comprehensive     # Multi-doc analysis
POST /analyze/xray              # X-ray analysis
POST /analyze/fraud             # Fraud detection
GET  /analysis/<job_id>/status  # Check status
GET  /analysis/<job_id>/result  # Get results
```

## Project Structure

```
api-server/           # Flask backend
fraud/               # Analysis modules
docufraud/           # Fraud detection
hospital-frontend/   # Next.js frontend
  └── src/
      ├── components/
      └── pages/
prompts/             # AI prompts (external files)
config.py            # Configuration loader
prompt_manager.py    # Prompt management
.env                 # Environment variables (gitignored)
```

## Frontend

Built with Next.js 14, React, TypeScript, and Tailwind CSS.

**Key Components:**
- **Analysis Views** - Single, Comprehensive, X-ray, Custom, Fraud
- **Customer Management** - Upload, history, document tracking
- **Result Viewer** - Formatted analysis display

**Development:**
```bash
cd hospital-frontend
npm run dev          # Development server
npm run build        # Production build
npm run lint         # Lint code
```

## Configuration

**Prompts:** All AI prompts in `prompts/*.txt` - edit to customize behavior (see [prompts/README.md](prompts/README.md))

**Config:** 
- `config.py` - Backend configuration
- `.env` - API keys and endpoints
- `hospital-frontend/.env.local` - Frontend API URL

## Troubleshooting

- **Import errors:** `pip install -r requirements.txt`
- **Auth fails:** Check `.env` credentials
- **Frontend connection:** Verify `NEXT_PUBLIC_API_URL`
- **Analysis fails:** Check Azure OpenAI quota/deployment names
