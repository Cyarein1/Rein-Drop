// Example parameters for infra/main.bicep - copy to beta.bicepparam and fill in.
// Identifiers only: secrets go into Key Vault (docs/azure/BETA_DEPLOYMENT.md, step 4), never here.
using 'main.bicep'

param prefix = 'rd-beta'
// Phase 1: false. Phase 2 (after the Key Vault secrets exist): true.
param deployApps = false
// Leave false unless you accept the PostgreSQL server's monthly baseline cost (runbook "Database").
param deployPostgres = false
// az ad signed-in-user show --query id -o tsv
param vaultWriterObjectId = '<your-entra-object-id>'
param logDailyCapGb = '0.2'

param registryServer = 'ghcr.io'
// '' for public images; your GitHub user for private ones (token in Key Vault "registry-password").
param registryUsername = ''
param imagePrefix = 'ghcr.io/<github-owner>/rein-drop'
param imageTag = '<git-commit-sha>'

param entraAuthority = 'https://<tenant-subdomain>.ciamlogin.com'
param entraTenantId = '<tenant-guid>'
param entraApiClientId = '<api-app-client-id>'
param entraWebClientId = '<web-app-client-id>'
param stripePriceIds = 'pro=price_...,ultimate=price_...'
param ebayClientId = '<ebay-app-id>'
param ebayMarketplaceId = 'EBAY_US'
param foundryEndpoint = 'https://<resource>.openai.azure.com'
param foundryDeployment = '<deployment-name>'
param huntPollIntervalMinutes = 30
param pushProvider = 'none'
