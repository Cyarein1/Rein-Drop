// Foundation for the beta: logs (with a daily cap), one user-assigned managed identity for every
// app / job, and a Key Vault (RBAC) that only that identity can read secrets from.
// Nothing here has a fixed monthly fee: Log Analytics bills ingested GB (capped below), Key Vault
// Standard bills operations, managed identities are free.

param location string
param prefix string
param tags object

@description('Log Analytics daily ingestion cap in GB - logs stop being collected for the day when reached.')
param logDailyCapGb string

@description('Object id of a person / group allowed to write secrets (Key Vault Secrets Officer). Empty = none.')
param vaultWriterObjectId string

// Built-in role definition ids (Azure RBAC).
var keyVaultSecretsUser = '4633458b-17de-408a-b874-0445c86b69e6'
var keyVaultSecretsOfficer = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'

resource logs 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${prefix}-logs'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: json(logDailyCapGb) }
  }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${prefix}-apps-id'
  location: location
  tags: tags
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  // Vault names are global, 3-24 characters.
  name: take('${prefix}-kv-${uniqueString(resourceGroup().id)}', 24)
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
  }
}

// The apps read secrets through the managed identity - no secret values in templates or app settings.
resource appsCanReadSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, identity.id, keyVaultSecretsUser)
  scope: vault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUser)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource adminCanWriteSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(vaultWriterObjectId)) {
  name: guid(vault.id, vaultWriterObjectId, keyVaultSecretsOfficer)
  scope: vault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsOfficer)
    principalId: vaultWriterObjectId
  }
}

output logsCustomerId string = logs.properties.customerId
output logsName string = logs.name
output identityId string = identity.id
output identityClientId string = identity.properties.clientId
output vaultName string = vault.name
output vaultUri string = vault.properties.vaultUri
