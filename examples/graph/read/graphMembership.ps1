# Compare direct with transitive membership in a nested group
Connect-MgGraph -Scopes "Group.Read.All"
Get-MgGroup -All | Select-Object displayName,id
Get-MgGroupMember -GroupId f0000000-0000-4000-8000-000000000202 |
  Select-Object displayName,id
Get-MgGroupTransitiveMember -GroupId f0000000-0000-4000-8000-000000000202 |
  Select-Object displayName,id
