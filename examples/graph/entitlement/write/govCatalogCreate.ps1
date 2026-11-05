# POST a fictional user-managed catalog; save the new ID
Connect-MgGraph -Scopes "EntitlementManagement.ReadWrite.All"
$catalog = Invoke-MgGraphRequest -Method POST -Uri '/v1.0/identityGovernance/entitlementManagement/catalogs' -Body '{"displayName":"HR Lifecycle","description":"Fictional HR entitlements","state":"published","isExternallyVisible":false}'
$catalog
Invoke-MgGraphRequest -Method GET -Uri "/v1.0/identityGovernance/entitlementManagement/catalogs/$catalog.id"
