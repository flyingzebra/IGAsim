# Create then remove a transient package using its returned ID
Connect-MgGraph -Scopes "EntitlementManagement.ReadWrite.All"
$package = Invoke-MgGraphRequest -Method POST -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages' -Body '{"displayName":"Temporary Package","catalog":{"id":"f0000000-0000-4000-8000-000000001002"}}'
$package
Invoke-MgGraphRequest -Method DELETE -Uri "/v1.0/identityGovernance/entitlementManagement/accessPackages/$package.id"
Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages?%24filter=catalogId%20eq%20%27f0000000-0000-4000-8000-000000001002%27'
