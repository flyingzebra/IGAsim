# Inspect fictional directory role assignments
Connect-MgGraph -Scopes "RoleManagement.Read.Directory"
Get-MgDirectoryRole -All | Select-Object displayName,id
Get-MgDirectoryRoleMember -DirectoryRoleId f0000000-0000-4000-8000-000000000601 |
  Select-Object displayName,userPrincipalName
