# Create a simulated app registration and linked service principal
Connect-MgGraph -Scopes "Application.ReadWrite.All"
New-MgApplication -DisplayName "Inventory Demo API" -SignInAudience AzureADMyOrg
Get-MgApplication -Filter "displayName eq 'Inventory Demo API'"
Get-MgServicePrincipal -All | Select-Object displayName,appId
