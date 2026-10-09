// Manually triggered Container Apps job that applies database migrations (prisma migrate deploy).
// Start it before rolling out a release: az containerapp job start -n <prefix>-migrate -g <rg>
// Jobs bill only while an execution runs.

param location string
param tags object
param name string
param environmentId string
param identityId string
param vaultUri string
param image string
param databaseUrlVaultKey string
param registryServer string = ''
param registryUsername string = ''
param registryCredentialVaultKey string = ''

var usesRegistry = !empty(registryServer) && !empty(registryUsername)

resource job 'Microsoft.App/jobs@2024-03-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identityId}': {} }
  }
  properties: {
    environmentId: environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 600
      replicaRetryLimit: 0
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      secrets: concat(
        [{ name: 'database-url', keyVaultUrl: '${vaultUri}secrets/${databaseUrlVaultKey}', identity: identityId }],
        usesRegistry ? [{ name: 'registry-password', keyVaultUrl: '${vaultUri}secrets/${registryCredentialVaultKey}', identity: identityId }] : []
      )
      registries: usesRegistry ? [{ server: registryServer, username: registryUsername, passwordSecretRef: 'registry-password' }] : []
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: image
          env: [{ name: 'DATABASE_URL', secretRef: 'database-url' }]
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
        }
      ]
    }
  }
}
