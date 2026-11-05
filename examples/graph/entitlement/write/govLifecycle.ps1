# Full package lifecycle: POST -> GET -> PATCH -> GET -> DELETE
Connect-MgGraph -Scopes "EntitlementManagement.ReadWrite.All"
$package = Invoke-MgGraphRequest -Method POST -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages' -Body '{"displayName":"Lifecycle Example","catalog":{"id":"f0000000-0000-4000-8000-000000001002"}}'
Invoke-MgGraphRequest -Method GET -Uri "/v1.0/identityGovernance/entitlementManagement/accessPackages/$package.id"
Invoke-MgGraphRequest -Method PATCH -Uri "/v1.0/identityGovernance/entitlementManagement/accessPackages/$package.id" -Body '{"description":"Reviewed by the IGA team","isHidden":true}'
Invoke-MgGraphRequest -Method GET -Uri "/v1.0/identityGovernance/entitlementManagement/accessPackages/$package.id"
Invoke-MgGraphRequest -Method DELETE -Uri "/v1.0/identityGovernance/entitlementManagement/accessPackages/$package.id"
Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages?%24filter=displayName%20eq%20%27Lifecycle%20Example%27'
