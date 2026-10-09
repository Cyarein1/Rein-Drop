// Rein Drop - first Azure-hosted beta (decision 0015, runbook docs/azure/BETA_DEPLOYMENT.md).
// Resource-group scope. Deploy in two phases:
//   1. deployApps=false (default): logs, managed identity, Key Vault, Container Apps environment.
//      Then put the secrets into Key Vault (names below) - never into parameters or this file.
//   2. deployApps=true: API, worker, web (Container Apps, Consumption) + the migration job.
// Nothing with a large fixed monthly fee is created by default: no Container Registry (images come
// from GitHub Container Registry), no PostgreSQL server (deployPostgres=false - bring a connection
// string), no Dedicated workload profile, no Front Door / VNet.

targetScope = 'resourceGroup'

@description('Azure region for everything.')
param location string = resourceGroup().location

@description('Short name prefix for resources, e.g. "rd-beta".')
@maxLength(12)
param prefix string = 'rd-beta'

param tags object = { app: 'rein-drop', environment: 'beta' }

@description('Phase 2: create the apps and the migration job (needs the Key Vault secrets to exist).')
param deployApps bool = false

@description('Create an Azure PostgreSQL Flexible Server (B1ms). Has a monthly baseline cost - see the runbook.')
param deployPostgres bool = false

@description('Object id of the person / group who writes secrets into Key Vault (az ad signed-in-user show --query id).')
param vaultWriterObjectId string = ''

@description('Log Analytics daily ingestion cap (GB) - keeps log costs bounded.')
param logDailyCapGb string = '0.2'

// --- images --------------------------------------------------------------------------------------
@description('Image registry host, e.g. ghcr.io')
param registryServer string = 'ghcr.io'
@description('Registry user for private images ("" = public images, no credentials).')
param registryUsername string = ''
@description('Image repository prefix, e.g. ghcr.io/<owner>/rein-drop')
param imagePrefix string = 'ghcr.io/OWNER/rein-drop'
@description('Image tag to run, e.g. a git commit SHA.')
param imageTag string = 'latest'

// --- application settings (identifiers, not secrets) ---------------------------------------------
param entraAuthority string = ''
param entraTenantId string = ''
param entraApiClientId string = ''
param entraWebClientId string = ''
@description('Stripe plan -> price mapping, e.g. "pro=price_...,ultimate=price_..."')
param stripePriceIds string = ''
param ebayClientId string = ''
param ebayMarketplaceId string = 'EBAY_US'
param foundryEndpoint string = ''
param foundryDeployment string = ''
@description('How often each live Hunt is searched (minutes) - drives source and AI cost (D7).')
param huntPollIntervalMinutes int = 30
@description('Push sender for the worker: expo | none')
@allowed(['expo', 'none'])
param pushProvider string = 'none'

// --- optional PostgreSQL ---------------------------------------------------------------------------
param postgresAdminLogin string = 'reindropadmin'
@secure()
param postgresAdminPassword string = ''

// Key Vault secret names the apps read (create them in phase 1 -> 2; see the runbook).
var kv = {
  databaseUrl: 'database-url'
  stripeSecretKey: 'stripe-secret-key'
  stripeWebhookSecret: 'stripe-webhook-secret'
  entraWebClientSecret: 'entra-web-client-secret'
  authSessionSecret: 'auth-session-secret'
  foundryApiKey: 'foundry-api-key'
  ebayClientSecret: 'ebay-client-secret'
  registryPassword: 'registry-password'
}

module foundation 'modules/foundation.bicep' = {
  name: 'foundation'
  params: { location: location, prefix: prefix, tags: tags, logDailyCapGb: logDailyCapGb, vaultWriterObjectId: vaultWriterObjectId }
}

module environment 'modules/environment.bicep' = {
  name: 'environment'
  params: { location: location, prefix: prefix, tags: tags, logsName: foundation.outputs.logsName }
}

module postgres 'modules/postgres.bicep' = if (deployPostgres) {
  name: 'postgres'
  params: { location: location, prefix: prefix, tags: tags, administratorLogin: postgresAdminLogin, administratorPassword: postgresAdminPassword }
}

var apiName = '${prefix}-api'
var webName = '${prefix}-web'
var apiUrl = 'https://${apiName}.${environment.outputs.defaultDomain}'
var webUrl = 'https://${webName}.${environment.outputs.defaultDomain}'

module api 'modules/container-app.bicep' = if (deployApps) {
  name: 'api'
  params: {
    location: location
    tags: tags
    environmentId: environment.outputs.id
    identityId: foundation.outputs.identityId
    vaultUri: foundation.outputs.vaultUri
    registryServer: registryServer
    registryUsername: registryUsername
    registryCredentialVaultKey: kv.registryPassword
    name: apiName
    image: '${imagePrefix}-api:${imageTag}'
    targetPort: 4000
    healthPath: '/health'
    readyPath: '/ready'
    // Scale to zero when idle (cold start on the first request). One replica max while rate-limit
    // counters are in memory (docs/security/hardening-2026-10.md).
    minReplicas: 0
    maxReplicas: 1
    cpu: '0.5'
    memory: '1Gi'
    env: [
      { name: 'NODE_ENV', value: 'production' }
      { name: 'PORT', value: '4000' }
      { name: 'TRUST_PROXY_HOPS', value: '1' }
      { name: 'AUTH_PROVIDER', value: 'entra' }
      { name: 'ENTRA_AUTHORITY', value: entraAuthority }
      { name: 'ENTRA_TENANT_ID', value: entraTenantId }
      { name: 'ENTRA_API_CLIENT_ID', value: entraApiClientId }
      { name: 'BILLING_PROVIDER', value: 'stripe' }
      { name: 'STRIPE_PRICE_IDS', value: stripePriceIds }
      { name: 'WEB_APP_URL', value: webUrl }
      { name: 'EBAY_SOURCE', value: 'api' }
      { name: 'EBAY_CLIENT_ID', value: ebayClientId }
      { name: 'EBAY_MARKETPLACE_ID', value: ebayMarketplaceId }
    ]
    secrets: [
      { envName: 'DATABASE_URL', vaultSecret: kv.databaseUrl }
      { envName: 'STRIPE_SECRET_KEY', vaultSecret: kv.stripeSecretKey }
      { envName: 'STRIPE_WEBHOOK_SECRET', vaultSecret: kv.stripeWebhookSecret }
      { envName: 'EBAY_CLIENT_SECRET', vaultSecret: kv.ebayClientSecret }
    ]
  }
}

module worker 'modules/container-app.bicep' = if (deployApps) {
  name: 'worker'
  params: {
    location: location
    tags: tags
    environmentId: environment.outputs.id
    identityId: foundation.outputs.identityId
    vaultUri: foundation.outputs.vaultUri
    registryServer: registryServer
    registryUsername: registryUsername
    registryCredentialVaultKey: kv.registryPassword
    name: '${prefix}-worker'
    image: '${imagePrefix}-worker:${imageTag}'
    // Always one replica: the scheduler / queue loop runs continuously (no ingress).
    minReplicas: 1
    maxReplicas: 1
    cpu: '0.25'
    memory: '0.5Gi'
    env: [
      { name: 'NODE_ENV', value: 'production' }
      { name: 'HUNT_POLL_INTERVAL_MINUTES', value: string(huntPollIntervalMinutes) }
      { name: 'AI_PROVIDER', value: 'foundry' }
      { name: 'FOUNDRY_ENDPOINT', value: foundryEndpoint }
      { name: 'FOUNDRY_DEPLOYMENT', value: foundryDeployment }
      { name: 'NOTIFICATION_DELIVERY', value: 'disabled' }
      { name: 'PUSH_PROVIDER', value: pushProvider }
      { name: 'EBAY_SOURCE', value: 'api' }
      { name: 'EBAY_CLIENT_ID', value: ebayClientId }
      { name: 'EBAY_MARKETPLACE_ID', value: ebayMarketplaceId }
    ]
    secrets: [
      { envName: 'DATABASE_URL', vaultSecret: kv.databaseUrl }
      { envName: 'FOUNDRY_API_KEY', vaultSecret: kv.foundryApiKey }
      { envName: 'EBAY_CLIENT_SECRET', vaultSecret: kv.ebayClientSecret }
    ]
  }
}

module web 'modules/container-app.bicep' = if (deployApps) {
  name: 'web'
  params: {
    location: location
    tags: tags
    environmentId: environment.outputs.id
    identityId: foundation.outputs.identityId
    vaultUri: foundation.outputs.vaultUri
    registryServer: registryServer
    registryUsername: registryUsername
    registryCredentialVaultKey: kv.registryPassword
    name: webName
    image: '${imagePrefix}-web:${imageTag}'
    targetPort: 3000
    minReplicas: 0
    maxReplicas: 2
    cpu: '0.5'
    memory: '1Gi'
    env: [
      { name: 'NODE_ENV', value: 'production' }
      { name: 'AUTH_PROVIDER', value: 'entra' }
      { name: 'API_BASE_URL', value: apiUrl }
      { name: 'APP_BASE_URL', value: webUrl }
      { name: 'ENTRA_AUTHORITY', value: entraAuthority }
      { name: 'ENTRA_TENANT_ID', value: entraTenantId }
      { name: 'ENTRA_WEB_CLIENT_ID', value: entraWebClientId }
      { name: 'ENTRA_API_CLIENT_ID', value: entraApiClientId }
    ]
    secrets: [
      { envName: 'ENTRA_WEB_CLIENT_SECRET', vaultSecret: kv.entraWebClientSecret }
      { envName: 'AUTH_SESSION_SECRET', vaultSecret: kv.authSessionSecret }
    ]
  }
}

module migrate 'modules/migrate-job.bicep' = if (deployApps) {
  name: 'migrate'
  params: {
    location: location
    tags: tags
    name: '${prefix}-migrate'
    environmentId: environment.outputs.id
    identityId: foundation.outputs.identityId
    vaultUri: foundation.outputs.vaultUri
    image: '${imagePrefix}-migrate:${imageTag}'
    databaseUrlVaultKey: kv.databaseUrl
    registryServer: registryServer
    registryUsername: registryUsername
    registryCredentialVaultKey: kv.registryPassword
  }
}

output keyVaultName string = foundation.outputs.vaultName
output apiUrl string = apiUrl
output webUrl string = webUrl
output stripeWebhookUrl string = '${apiUrl}/billing/webhooks/stripe'
output entraWebRedirectUri string = '${webUrl}/auth/callback'
output postgresHost string = postgres.?outputs.host ?? ''
output keyVaultSecretNames object = kv
