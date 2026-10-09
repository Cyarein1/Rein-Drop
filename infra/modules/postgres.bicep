// OPTIONAL - only deployed with deployPostgres=true. Azure Database for PostgreSQL Flexible Server,
// Burstable B1ms, 32 GB. This is an always-on server with a monthly baseline cost (compute + storage),
// unless the subscription still has the Azure free account's 12-month PostgreSQL allowance.
// Check the pricing calculator before enabling it (docs/azure/BETA_DEPLOYMENT.md, "Database").

param location string
param tags object
param prefix string

@minLength(1)
param administratorLogin string

@secure()
param administratorPassword string

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${prefix}-pg-${uniqueString(resourceGroup().id)}'
  location: location
  tags: tags
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '17'
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    storage: { storageSizeGB: 32, autoGrow: 'Disabled' }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
  }
}

// Container Apps (Consumption) egress has no fixed IPs: allow Azure services. TLS is required.
resource allowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: server
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: 'reindrop'
}

output host string = server.properties.fullyQualifiedDomainName
