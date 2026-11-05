# OData filtering is different from AD LDAP filtering
Connect-MgGraph -Scopes "User.Read.All"
Get-MgUser -Filter "department eq 'IT'" -Property "id,displayName,department,accountEnabled" |
  Select-Object displayName,department,accountEnabled
Get-MgUser -Filter "accountEnabled eq false" -Property "displayName,userPrincipalName,accountEnabled"
