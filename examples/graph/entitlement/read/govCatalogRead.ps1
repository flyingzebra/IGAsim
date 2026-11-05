# List catalogs and inspect a specific catalog
Connect-MgGraph -Scopes "EntitlementManagement.Read.All"
Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/catalogs?$select=id,displayName,state,catalogType'
Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/catalogs/f0000000-0000-4000-8000-000000001002?$expand=accessPackages'
