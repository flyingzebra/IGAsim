# Simulated Microsoft Entra tenant and session
Connect-MgGraph -Scopes "User.Read.All,Group.Read.All"
Get-MgContext
Get-MgOrganization
Get-MgUser -All | Select-Object displayName,userPrincipalName
Get-MgGroup -All | Select-Object displayName,description
