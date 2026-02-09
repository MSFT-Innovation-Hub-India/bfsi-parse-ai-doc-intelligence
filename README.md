# Parse-AI: Document Analysis & Fraud Detection

AI-powered document analysis system using Azure OpenAI GPT-4 Vision for medical documents, fraud detection, and tampering identification.

## Features

- **Document Analysis** - Medical reports, X-rays, generic documents, batch processing
- **Fraud Detection** - Cross-document comparison, fake detection, tampering analysis
- **Customer Management** - Upload, storage, analysis history
- **Secure Authentication** - Uses Azure Managed Identity (no API keys required)

## Quick Start

**Prerequisites:** Python 3.8+, Node.js 16+, Azure OpenAI access with Managed Identity

## Installation

```bash
# Clone and setup
git clone https://github.com/MSFT-Innovation-Hub-India/bfsi-parse-ai-doc-intelligence.git
cd bfsi-parse-ai-doc-intelligence

# Backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/macOS
pip install -r requirements.txt

# Frontend
cd frontend
npm install
cd ..

# Configure environment
cp .env.example .env
# Edit .env with your Azure resource endpoints
```

**Required in `.env`:**
```env
# Azure OpenAI (Managed Identity - no API key needed)
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=gpt-4.1

# Azure Blob Storage (Managed Identity - no connection string with keys needed)
AZURE_STORAGE_ACCOUNT_URL=https://yourstorageaccount.blob.core.windows.net
AZURE_STORAGE_CONTAINER_NAME=your-container-name
```

**Azure RBAC Setup (Required for Managed Identity):**
1. Enable System-assigned or User-assigned Managed Identity on your Azure resource
2. Grant the identity **"Cognitive Services OpenAI User"** role on Azure OpenAI resources
3. Grant the identity **"Storage Blob Data Contributor"** role on the Storage Account

**Local Development:** Uses Azure CLI credentials (`az login`) or VS Code credentials automatically

**Frontend `.env.local`:**
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Running Locally

```bash
# Backend (http://localhost:8000)
python api-server/app.py

# Frontend (http://localhost:3000)
cd frontend
npm run dev
```

---

## Deployment Options

### Option 1: Azure Container Apps (Recommended)

Azure Container Apps provides a fully managed serverless container platform with built-in autoscaling, HTTPS, and managed identity support.

#### Prerequisites

- Azure CLI installed and logged in (`az login`)
- Docker installed (for building container images)
- Azure Container Registry (ACR) or ability to create one

#### Step 1: Set Environment Variables

```bash
# Configure these variables for your environment
RESOURCE_GROUP="parse-ai-rg"
LOCATION="eastus"
ACR_NAME="parseaiacr"
ENVIRONMENT_NAME="parse-ai-env"
BACKEND_APP_NAME="parse-ai-api"
FRONTEND_APP_NAME="parse-ai-frontend"

# Azure OpenAI and Storage configuration
AZURE_OPENAI_ENDPOINT="https://your-openai.openai.azure.com/"
AZURE_OPENAI_DEPLOYMENT="gpt-4.1"
AZURE_OPENAI_XRAY_ENDPOINT="https://your-openai.openai.azure.com/"
AZURE_OPENAI_XRAY_DEPLOYMENT="gpt-4o"
AZURE_STORAGE_ACCOUNT_URL="https://yourstorage.blob.core.windows.net"
AZURE_STORAGE_CONTAINER_NAME="apollo"
```

#### Step 2: Create Azure Resources

```bash
# Create Resource Group
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create Azure Container Registry
az acr create --resource-group $RESOURCE_GROUP --name $ACR_NAME --sku Basic --admin-enabled true

# Get ACR credentials
ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer -o tsv)
ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv)

# Create Container Apps Environment
az containerapp env create \
  --name $ENVIRONMENT_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION
```

#### Step 3: Build and Push Container Images

```bash
# Login to ACR
az acr login --name $ACR_NAME

# Build and push Backend image
docker build -t $ACR_LOGIN_SERVER/parse-ai-api:latest .
docker push $ACR_LOGIN_SERVER/parse-ai-api:latest

# Build and push Frontend image
docker build -t $ACR_LOGIN_SERVER/parse-ai-frontend:latest \
  --build-arg NEXT_PUBLIC_API_URL=https://$BACKEND_APP_NAME.$LOCATION.azurecontainerapps.io \
  ./frontend
docker push $ACR_LOGIN_SERVER/parse-ai-frontend:latest
```

#### Step 4: Deploy Backend Container App

```bash
# Create Backend Container App with Managed Identity
az containerapp create \
  --name $BACKEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --environment $ENVIRONMENT_NAME \
  --image $ACR_LOGIN_SERVER/parse-ai-api:latest \
  --registry-server $ACR_LOGIN_SERVER \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --target-port 8000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 5 \
  --cpu 1.0 \
  --memory 2.0Gi \
  --env-vars \
    AZURE_OPENAI_ENDPOINT="$AZURE_OPENAI_ENDPOINT" \
    AZURE_OPENAI_DEPLOYMENT="$AZURE_OPENAI_DEPLOYMENT" \
    AZURE_OPENAI_API_VERSION="2024-02-01" \
    AZURE_OPENAI_XRAY_ENDPOINT="$AZURE_OPENAI_XRAY_ENDPOINT" \
    AZURE_OPENAI_XRAY_DEPLOYMENT="$AZURE_OPENAI_XRAY_DEPLOYMENT" \
    AZURE_OPENAI_XRAY_API_VERSION="2024-12-01-preview" \
    AZURE_STORAGE_ACCOUNT_URL="$AZURE_STORAGE_ACCOUNT_URL" \
    AZURE_STORAGE_CONTAINER_NAME="$AZURE_STORAGE_CONTAINER_NAME" \
    API_DEBUG="false" \
  --system-assigned

# Get Backend URL
BACKEND_URL=$(az containerapp show --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP --query properties.configuration.ingress.fqdn -o tsv)
echo "Backend URL: https://$BACKEND_URL"
```

#### Step 5: Configure Managed Identity Permissions

```bash
# Get the Managed Identity principal ID
PRINCIPAL_ID=$(az containerapp show --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP --query identity.principalId -o tsv)

# Grant access to Azure OpenAI
OPENAI_RESOURCE_ID="/subscriptions/{subscription-id}/resourceGroups/{openai-rg}/providers/Microsoft.CognitiveServices/accounts/{openai-name}"
az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Cognitive Services OpenAI User" \
  --scope $OPENAI_RESOURCE_ID

# Grant access to Storage Account
STORAGE_RESOURCE_ID="/subscriptions/{subscription-id}/resourceGroups/{storage-rg}/providers/Microsoft.Storage/storageAccounts/{storage-name}"
az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Storage Blob Data Contributor" \
  --scope $STORAGE_RESOURCE_ID
```

#### Step 6: Deploy Frontend Container App

```bash
# Rebuild frontend with correct API URL
docker build -t $ACR_LOGIN_SERVER/parse-ai-frontend:latest \
  --build-arg NEXT_PUBLIC_API_URL=https://$BACKEND_URL \
  ./frontend
docker push $ACR_LOGIN_SERVER/parse-ai-frontend:latest

# Create Frontend Container App
az containerapp create \
  --name $FRONTEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --environment $ENVIRONMENT_NAME \
  --image $ACR_LOGIN_SERVER/parse-ai-frontend:latest \
  --registry-server $ACR_LOGIN_SERVER \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --target-port 3000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 3 \
  --cpu 0.5 \
  --memory 1.0Gi \
  --env-vars \
    NEXT_PUBLIC_API_URL="https://$BACKEND_URL"

# Get Frontend URL
FRONTEND_URL=$(az containerapp show --name $FRONTEND_APP_NAME --resource-group $RESOURCE_GROUP --query properties.configuration.ingress.fqdn -o tsv)
echo "Frontend URL: https://$FRONTEND_URL"
```

#### Step 7: Configure CORS (Optional)

```bash
# Update backend with CORS settings
az containerapp update \
  --name $BACKEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars CORS_ORIGINS="https://$FRONTEND_URL"
```

#### Container Apps Scaling Configuration

```bash
# Configure HTTP scaling rules
az containerapp update \
  --name $BACKEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --scale-rule-name http-scaling \
  --scale-rule-type http \
  --scale-rule-http-concurrency 50
```

#### Monitoring and Logs

```bash
# View real-time logs
az containerapp logs show \
  --name $BACKEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --follow

# View revision logs
az containerapp revision list \
  --name $BACKEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  -o table
```

---

### Option 2: Azure App Service

See [AZURE_DEPLOYMENT.md](AZURE_DEPLOYMENT.md) for detailed App Service deployment instructions.

---

### Option 3: Docker Compose (Local/Self-Hosted)

```bash
# Create docker-compose.yml
version: '3.8'
services:
  backend:
    build: .
    ports:
      - "8000:8000"
    environment:
      - AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT}
      - AZURE_OPENAI_DEPLOYMENT=${AZURE_OPENAI_DEPLOYMENT}
      - AZURE_STORAGE_ACCOUNT_URL=${AZURE_STORAGE_ACCOUNT_URL}
      - AZURE_STORAGE_CONTAINER_NAME=${AZURE_STORAGE_CONTAINER_NAME}
    volumes:
      - uploads:/app/uploads

  frontend:
    build:
      context: ./frontend
      args:
        - NEXT_PUBLIC_API_URL=http://localhost:8000
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  uploads:

# Run with docker-compose
docker-compose up -d
```

---

## API Usage

**Upload & Analyze:**
```bash
POST /upload                    # Upload document
POST /analyze/single            # Single doc analysis
POST /analyze/comprehensive     # Multi-doc analysis
POST /analyze/xray              # X-ray analysis
POST /analyze/fraud             # Fraud detection
POST /analyze/general           # General document analysis
POST /analyze/custom            # Custom analysis with instructions
GET  /analysis/<job_id>/status  # Check status
GET  /analysis/<job_id>/result  # Get results
```

**Example Request:**
```bash
# Upload a document
curl -X POST -F "file=@document.pdf" https://your-api-url/upload

# Start analysis
curl -X POST -H "Content-Type: application/json" \
  -d '{"document_id": "uuid-from-upload"}' \
  https://your-api-url/analyze/single
```

## Project Structure

```
├── api-server/           # Flask backend API
│   └── app.py           # Main API server
├── medical-analysis/    # Analysis modules
│   ├── medical_report_analyzer.py
│   ├── single_medical_analyzer.py
│   ├── generic_document_analyzer_final.py
│   └── xrayanalysis.py
├── docufraud/           # Fraud detection modules
├── frontend/            # Next.js frontend
│   └── src/
│       ├── components/
│       └── pages/
├── prompts/             # AI prompts (external files)
├── config.py            # Configuration loader
├── prompt_manager.py    # Prompt management
├── Dockerfile           # Backend container definition
├── docker-compose.yml   # Multi-container setup
├── requirements.txt     # Python dependencies
├── startup.sh          # Azure App Service startup
└── .env                # Environment variables (gitignored)
```

## Frontend

Built with Next.js 14, React, TypeScript, and Tailwind CSS.

**Key Components:**
- **Analysis Views** - Single, Comprehensive, X-ray, Custom, Fraud
- **Customer Management** - Upload, history, document tracking
- **Result Viewer** - Formatted analysis display

**Development:**
```bash
cd frontend
npm run dev          # Development server
npm run build        # Production build
npm run lint         # Lint code
```

## Configuration

**Prompts:** All AI prompts in `prompts/*.txt` - edit to customize behavior (see [prompts/README.md](prompts/README.md))

**Config:** 
- `config.py` - Backend configuration
- `.env` - API endpoints and settings
- `frontend/.env.local` - Frontend API URL

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Import errors | Run `pip install -r requirements.txt` |
| Auth fails | Verify Managed Identity is enabled and RBAC roles are assigned |
| Local dev auth | Run `az login` to authenticate with Azure CLI |
| Frontend connection | Verify `NEXT_PUBLIC_API_URL` points to backend |
| Analysis fails | Check Azure OpenAI quota and deployment names |
| Storage access denied | Ensure "Storage Blob Data Contributor" role is assigned |
| Container App not starting | Check logs with `az containerapp logs show` |
| CORS errors | Update `CORS_ORIGINS` environment variable |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
