// Container Apps environment with only the Consumption workload profile (serverless: billed per
// vCPU-second / GiB-second / request, with a monthly free grant per subscription; no Dedicated
// plan management fee because no Dedicated profile exists).

param location string
param prefix string
param tags object
param logsName string

resource logs 'Microsoft.OperationalInsights/workspaces@2022-10-01' existing = {
  name: logsName
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-env'
  location: location
  tags: tags
  properties: {
    workloadProfiles: [
      { name: 'Consumption', workloadProfileType: 'Consumption' }
    ]
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

output id string = environment.id
output defaultDomain string = environment.properties.defaultDomain
