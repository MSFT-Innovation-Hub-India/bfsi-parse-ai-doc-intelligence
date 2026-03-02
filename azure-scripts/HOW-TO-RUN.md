# Enable Azure Networking — How to Run

Run this command from the **root of the repository** in PowerShell to re-enable public network access for Blob Storage and Cosmos DB:

```powershell
powershell -ExecutionPolicy Bypass -Command { $env:AZURE_RESOURCE_GROUP = "fsi-demos"; $env:AZURE_STORAGE_ACCOUNT_NAME = "fsidemo"; $env:COSMOS_DB_ACCOUNT_NAME = "fsiauto"; & ".\scripts\enable-azure-networking.ps1" }
```

### What it does

- Opens public network access on the **fsidemo** Blob Storage account
- Opens public network access on the **fsiauto** Cosmos DB account
- Both changes are scoped to the **fsi-demos** resource group

### When to run

Run this whenever Azure has restricted access to these resources (e.g., after inactivity or a policy change) before starting the application.

### Prerequisites

- Azure CLI installed — [install guide](https://learn.microsoft.com/cli/azure/install-azure-cli)
- Logged in via `az login` with an account that has Contributor access to the `fsi-demos` resource group
