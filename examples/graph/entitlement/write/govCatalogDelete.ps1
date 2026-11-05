# Create a temporary catalog, then DELETE the returned ID
Connect-MgGraph -Scopes "EntitlementManagement.ReadWrite.All"
$catalog = Invoke-MgGraphRequest -Method POST -Uri '/v1.0/identityGovernance/entitlementManagement/catalogs' -Body '{"displayName":"Temporary Catalog","description":"Delete-me demo"}'
$catalog
Invoke-MgGraphRequest -Method DELETE -Uri "/v1.0/identityGovernance/entitlementManagement/catalogs/$catalog.id"
Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/catalogs?$select=id,displayName'
