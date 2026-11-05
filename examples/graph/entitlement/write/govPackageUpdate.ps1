# PATCH an existing package; catalog linkage is immutable
Connect-MgGraph -Scopes "EntitlementManagement.ReadWrite.All"
Invoke-MgGraphRequest -Method PATCH -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages/f0000000-0000-4000-8000-000000001101' -Body '{"description":"Revised engineering starter access","isHidden":true}'
Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages/f0000000-0000-4000-8000-000000001101?$select=id,displayName,isHidden,description'
