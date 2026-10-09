// Monthly Cost Management budget for the beta resource group (subscription-scope deployment).
//   az deployment sub create --location <region> --template-file infra/budget.bicep \
//     --parameters amount=<whole currency units> startDate=<YYYY-MM-01> contactEmails='["you@example.com"]' resourceGroupName=<rg>
// Budgets only NOTIFY - they never stop or delete resources. What to do when an alert fires is in
// docs/azure/BETA_DEPLOYMENT.md ("When a budget alert fires").

targetScope = 'subscription'

param budgetName string = 'rein-drop-beta-monthly'

@description('Monthly budget in the billing currency of the subscription (whole units). Your decision - no default.')
@minValue(1)
param amount int

@description('First day of the current or a coming month, YYYY-MM-01 (at most three months ahead).')
param startDate string

@description('Who gets the alerts.')
@minLength(1)
param contactEmails array

@description('Resource group the beta runs in - costs outside it are not counted.')
param resourceGroupName string

resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: budgetName
  properties: {
    category: 'Cost'
    amount: amount
    timeGrain: 'Monthly'
    timePeriod: { startDate: startDate }
    filter: {
      dimensions: { name: 'ResourceGroupName', operator: 'In', values: [resourceGroupName] }
    }
    notifications: {
      actual50: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 50, thresholdType: 'Actual', contactEmails: contactEmails }
      actual80: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 80, thresholdType: 'Actual', contactEmails: contactEmails }
      actual100: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 100, thresholdType: 'Actual', contactEmails: contactEmails }
      forecast100: { enabled: true, operator: 'GreaterThan', threshold: 100, thresholdType: 'Forecasted', contactEmails: contactEmails }
    }
  }
}

output budgetId string = budget.id
