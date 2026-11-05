# PATCH the fictional Engineering catalog (Reset sandbox restores it)
Connect-MgGraph -Scopes "EntitlementManagement.ReadWrite.All"
Invoke-MgGraphRequest -Method PATCH -Uri '/v1.0/identityGovernance/entitlementManagement/catalogs/f0000000-0000-4000-8000-000000001002' -Body '{"description":"Engineering access curated by IGA","isExternallyVisible":true}'
Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/catalogs/f0000000-0000-4000-8000-000000001002'
