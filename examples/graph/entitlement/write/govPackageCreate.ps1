# POST a package linked to the built-in General catalog
Connect-MgGraph -Scopes "EntitlementManagement.ReadWrite.All"
$package = Invoke-MgGraphRequest -Method POST -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages' -Body '{"displayName":"HR Basic Access","description":"Demo access bundle","isHidden":false,"catalog":{"id":"f0000000-0000-4000-8000-000000001001"}}'
$package
Invoke-MgGraphRequest -Method GET -Uri "/v1.0/identityGovernance/entitlementManagement/accessPackages/$package.id?%24expand=catalog"
