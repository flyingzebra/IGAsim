# Separate fictional directories: no synchronization is implied
Get-ADUser -Filter * | Select-Object Name,SamAccountName,Department
Connect-MgGraph -Scopes "User.Read.All"
Get-MgUser -All | Select-Object displayName,userPrincipalName,department
