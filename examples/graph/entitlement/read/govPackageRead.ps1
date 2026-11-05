# Find the access packages in a catalog and expand their parent catalogs
Connect-MgGraph -Scopes "EntitlementManagement.Read.All"
Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages?%24filter=catalogId%20eq%20%27f0000000-0000-4000-8000-000000001002%27'
Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages/f0000000-0000-4000-8000-000000001101?$expand=catalog'
