# Parse-AI Azure App Service Deployment Guide

## Prerequisites

1. Azure subscription
2. Azure CLI installed (`az login`)
3. Resource Group created

## Step 1: Create Azure Resources

```bash
# Variables - customize these
RESOURCE_GROUP="parse-ai-rg"
LOCATION="eastus"
APP_SERVICE_PLAN="parse-ai-plan"
BACKEND_APP_NAME="parse-ai-api"
FRONTEND_APP_NAME="parse-ai-frontend"
STORAGE_ACCOUNT="parseaistorage"

# Create App Service Plan (B2 or higher recommended for AI workloads)
az appservice plan create \
  --name $APP_SERVICE_PLAN \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku B2 \
  --is-linux

# Create Backend App Service (Python 3.11)
az webapp create \
  --name $BACKEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_SERVICE_PLAN \
  --runtime "PYTHON:3.11"

# Enable Managed Identity
az webapp identity assign \
  --name $BACKEND_APP_NAME \
  --resource-group $RESOURCE_GROUP
```

## Step 2: Grant RBAC Permissions

```bash
# Get the Managed Identity principal ID
PRINCIPAL_ID=$(az webapp identity show --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP --query principalId -o tsv)

# Grant access to Azure OpenAI (repeat for each OpenAI resource)
OPENAI_RESOURCE_ID="/subscriptions/{sub-id}/resourceGroups/{rg}/providers/Microsoft.CognitiveServices/accounts/{openai-name}"
az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Cognitive Services User" \
  --scope $OPENAI_RESOURCE_ID

# Grant access to Storage Account
STORAGE_RESOURCE_ID="/subscriptions/{sub-id}/resourceGroups/{rg}/providers/Microsoft.Storage/storageAccounts/{storage-name}"
az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Storage Blob Data Contributor" \
  --scope $STORAGE_RESOURCE_ID
```

## Step 3: Configure App Settings

```bash
az webapp config appsettings set \
  --name $BACKEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings \
    AZURE_OPENAI_ENDPOINT="https://your-openai.openai.azure.com/" \
    AZURE_OPENAI_DEPLOYMENT="gpt-4.1" \
    AZURE_OPENAI_XRAY_ENDPOINT="https://your-xray-openai.openai.azure.com/" \
    AZURE_OPENAI_XRAY_DEPLOYMENT="gpt-4o" \
    AZURE_STORAGE_ACCOUNT_URL="https://yourstorage.blob.core.windows.net" \
    AZURE_STORAGE_CONTAINER_NAME="apollo" \
    CORS_ORIGINS="https://$FRONTEND_APP_NAME.azurewebsites.net" \
    API_DEBUG="false" \
    SCM_DO_BUILD_DURING_DEPLOYMENT="true"
```

## Step 4: Configure Startup Command

```bash
az webapp config set \
  --name $BACKEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --startup-file "startup.sh"
```

## Step 5: Deploy Backend

### Option A: Deploy from local folder
```bash
cd api-server
zip -r ../api-server.zip .
az webapp deployment source config-zip \
  --name $BACKEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --src ../api-server.zip
```

### Option B: Deploy via GitHub Actions
See `.github/workflows/azure-deploy.yml` (create if needed)

## Step 6: Deploy Frontend (Static Web App)

```bash
# Create Static Web App for Next.js frontend
az staticwebapp create \
  --name $FRONTEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --source https://github.com/your-repo \
  --location $LOCATION \
  --branch main \
  --app-location "/frontend" \
  --output-location ".next" \
  --login-with-github
```

Or deploy to a separate Node.js App Service:
```bash
az webapp create \
  --name $FRONTEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_SERVICE_PLAN \
  --runtime "NODE:18-lts"
```

## Step 7: Set Frontend Environment Variable

In the frontend, set the API URL:
```bash
# For Static Web App
az staticwebapp appsettings set \
  --name $FRONTEND_APP_NAME \
  --setting-names NEXT_PUBLIC_API_URL="https://$BACKEND_APP_NAME.azurewebsites.net"

# For App Service
az webapp config appsettings set \
  --name $FRONTEND_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings NEXT_PUBLIC_API_URL="https://$BACKEND_APP_NAME.azurewebsites.net"
```

## Troubleshooting

### View Logs
```bash
az webapp log tail --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP
```

### Check App Service Status
```bash
az webapp show --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP --query state
```

### SSH into Container
```bash
az webapp ssh --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP
```

## Important Notes

1. **Background Jobs**: The current threading approach may not work reliably in App Service. Consider migrating to Azure Functions + Queue Storage for production.

2. **File Storage**: Uploaded files are stored locally and will be lost on restart. Use Azure Blob Storage for persistent file storage.

3. **Scaling**: If you enable auto-scaling, in-memory job storage (`analysis_jobs`) won't be shared across instances. Use Azure Redis Cache for shared state.

4. **Timeouts**: Azure App Service has a default 230-second timeout. Long-running AI analyses may need to use async patterns with polling.
