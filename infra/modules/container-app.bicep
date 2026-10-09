// One Container App on the Consumption profile. Secrets are Key Vault references read with the
// shared user-assigned identity; plain settings are env vars. Ingress is optional (the worker has none).

param location string
param tags object
param name string
param environmentId string
param identityId string
param vaultUri string
param image string

@description('HTTP port the container listens on; 0 = no ingress (background process).')
param targetPort int = 0

@description('Plain (non-secret) environment variables: [{ name, value }].')
param env array = []

@description('Secrets: [{ envName, vaultSecret }] - the env var gets the Key Vault secret named vaultSecret.')
param secrets array = []

param minReplicas int = 0
param maxReplicas int = 1
param cpu string = '0.25'
param memory string = '0.5Gi'

@description('Liveness / readiness path ("" = no HTTP probes).')
param healthPath string = ''
param readyPath string = ''

@description('Private registry: server ("" = public images), username, Key Vault secret holding the password / token.')
param registryServer string = ''
param registryUsername string = ''
param registryCredentialVaultKey string = ''

var usesRegistry = !empty(registryServer) && !empty(registryUsername)
var appSecrets = concat(
  map(secrets, s => { name: toLower(replace(s.vaultSecret, '_', '-')), keyVaultUrl: '${vaultUri}secrets/${s.vaultSecret}', identity: identityId }),
  usesRegistry ? [{ name: 'registry-password', keyVaultUrl: '${vaultUri}secrets/${registryCredentialVaultKey}', identity: identityId }] : []
)
var secretEnv = map(secrets, s => { name: s.envName, secretRef: toLower(replace(s.vaultSecret, '_', '-')) })
var probes = concat(
  empty(healthPath) ? [] : [{ type: 'Liveness', httpGet: { path: healthPath, port: targetPort }, periodSeconds: 30, initialDelaySeconds: 10 }],
  empty(readyPath) ? [] : [{ type: 'Readiness', httpGet: { path: readyPath, port: targetPort }, periodSeconds: 30, initialDelaySeconds: 10 }]
)

resource app 'Microsoft.App/containerApps@2024-03-01' = {
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
      activeRevisionsMode: 'Single'
      secrets: appSecrets
      registries: usesRegistry ? [{ server: registryServer, username: registryUsername, passwordSecretRef: 'registry-password' }] : []
      ingress: targetPort > 0
        ? {
            external: true
            targetPort: targetPort
            transport: 'auto'
            allowInsecure: false
          }
        : null
    }
    template: {
      containers: [
        {
          name: name
          image: image
          env: concat(env, secretEnv)
          resources: { cpu: json(cpu), memory: memory }
          probes: probes
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

output fqdn string = targetPort > 0 ? app.properties.configuration.ingress.fqdn : ''
