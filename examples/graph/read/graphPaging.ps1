# -Top limits a page; -All follows @odata.nextLink
Connect-MgGraph -Scopes "User.Read.All"
Get-MgUser -Top 1 -CountVariable userCount
$userCount
Get-MgUser -All -Top 1 -Property "id,displayName,department" |
  Select-Object displayName,department
