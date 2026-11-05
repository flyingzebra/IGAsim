# REST-style Graph responses (including @odata.nextLink)
Connect-MgGraph -Scopes "User.Read.All,Group.Read.All"
Invoke-MgGraphRequest -Method GET -Uri '/v1.0/users?$top=1'
Invoke-MgGraphRequest -Method GET -Uri '/v1.0/groups?$select=id,displayName'
