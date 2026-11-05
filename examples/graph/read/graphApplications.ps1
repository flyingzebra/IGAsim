# Inventory the tenant's applications, service principals and devices
Connect-MgGraph -Scopes "Application.Read.All,Device.Read.All"
Get-MgApplication -All | Select-Object displayName,appId
Get-MgServicePrincipal -All | Select-Object displayName,appId,accountEnabled
Get-MgDevice -All | Select-Object displayName,operatingSystem,accountEnabled
