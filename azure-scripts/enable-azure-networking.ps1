# ============================================================
# Azure Networking Enable Script for Vehicle Insurance Claims
# Run this script daily to enable Blob Storage and Cosmos DB access
# ============================================================

param(
    [string]$ResourceGroup = $env:AZURE_RESOURCE_GROUP,
    [string]$StorageAccountName = $env:AZURE_STORAGE_ACCOUNT_NAME,
    [string]$CosmosAccountName = $env:COSMOS_DB_ACCOUNT_NAME,
    [string]$SubscriptionId = $env:AZURE_SUBSCRIPTION_ID
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Azure Networking Enable Script" -ForegroundColor Cyan
Write-Host "  Vehicle Insurance Claims Processing" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Check if Azure CLI is installed
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Azure CLI is not installed. Please install it first." -ForegroundColor Red
    Write-Host "  Install: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli" -ForegroundColor Yellow
    exit 1
}

# Check if logged in
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "[INFO] Not logged into Azure. Starting login..." -ForegroundColor Yellow
    az login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Azure login failed." -ForegroundColor Red
        exit 1
    }
}

Write-Host "[OK] Logged in as: $($account.user.name)" -ForegroundColor Green

# Set subscription if provided
if ($SubscriptionId) {
    Write-Host "[INFO] Setting subscription to: $SubscriptionId" -ForegroundColor Yellow
    az account set --subscription $SubscriptionId
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to set subscription." -ForegroundColor Red
        exit 1
    }
}

# Validate required parameters
if (-not $ResourceGroup) {
    Write-Host "[ERROR] ResourceGroup is required. Set AZURE_RESOURCE_GROUP env var or pass -ResourceGroup" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  Resource Group: $ResourceGroup"
Write-Host "  Storage Account: $StorageAccountName"
Write-Host "  Cosmos Account: $CosmosAccountName"
Write-Host ""

# ============================================================
# BLOB STORAGE - Enable Public Network Access
# ============================================================
if ($StorageAccountName) {
    Write-Host "------------------------------------------------------------" -ForegroundColor Yellow
    Write-Host "[BLOB STORAGE] Enabling network access..." -ForegroundColor Yellow
    Write-Host "------------------------------------------------------------" -ForegroundColor Yellow
    
    try {
        # Option 1: Enable public network access (allow all)
        Write-Host "  Enabling public network access..." -ForegroundColor Gray
        az storage account update `
            --name $StorageAccountName `
            --resource-group $ResourceGroup `
            --public-network-access Enabled `
            --default-action Allow `
            --output none
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Blob Storage: Public network access ENABLED" -ForegroundColor Green
        } else {
            throw "Failed to enable public network access"
        }
        
        # Verify the settings
        $storageProps = az storage account show `
            --name $StorageAccountName `
            --resource-group $ResourceGroup `
            --query "{publicNetworkAccess:publicNetworkAccess, defaultAction:networkRuleSet.defaultAction}" `
            --output json | ConvertFrom-Json
        
        Write-Host "  Current Settings:" -ForegroundColor Gray
        Write-Host "    Public Network Access: $($storageProps.publicNetworkAccess)" -ForegroundColor Gray
        Write-Host "    Default Action: $($storageProps.defaultAction)" -ForegroundColor Gray
        
    } catch {
        Write-Host "[ERROR] Failed to enable Blob Storage networking: $_" -ForegroundColor Red
    }
} else {
    Write-Host "[SKIP] Blob Storage: No account name provided" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================
# COSMOS DB - Enable Public Network Access
# ============================================================
if ($CosmosAccountName) {
    Write-Host "------------------------------------------------------------" -ForegroundColor Yellow
    Write-Host "[COSMOS DB] Enabling network access..." -ForegroundColor Yellow
    Write-Host "------------------------------------------------------------" -ForegroundColor Yellow
    
    try {
        # Enable public network access for Cosmos DB
        # Note: Use --public-network-access instead of --enable-public-network
        Write-Host "  Enabling public network access..." -ForegroundColor Gray
        az cosmosdb update `
            --name $CosmosAccountName `
            --resource-group $ResourceGroup `
            --public-network-access ENABLED `
            --output none
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Cosmos DB: Public network access ENABLED" -ForegroundColor Green
        } else {
            throw "Failed to enable public network access"
        }
        
        # Verify the settings
        $cosmosProps = az cosmosdb show `
            --name $CosmosAccountName `
            --resource-group $ResourceGroup `
            --query "{publicNetworkAccess:publicNetworkAccess, ipRules:ipRules}" `
            --output json | ConvertFrom-Json
        
        Write-Host "  Current Settings:" -ForegroundColor Gray
        Write-Host "    Public Network Access: $($cosmosProps.publicNetworkAccess)" -ForegroundColor Gray
        
    } catch {
        Write-Host "[ERROR] Failed to enable Cosmos DB networking: $_" -ForegroundColor Red
    }
} else {
    Write-Host "[SKIP] Cosmos DB: No account name provided" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Script Complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To schedule this script to run daily:" -ForegroundColor Yellow
Write-Host '  schtasks /create /tn "EnableAzureNetworking" /tr "powershell -File enable-azure-networking.ps1" /sc daily /st 08:00' -ForegroundColor Gray
Write-Host ""
