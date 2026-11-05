# IGAsim — Microsoft Entra Entitlement Management v0.1

## Concepts

An **access package catalog** is an administrative container for access packages and, in the full Microsoft Entra service, the resources that access packages can reference. A **catalog** has a name, description, state (`published` or `unpublished`) and external visibility setting. The built-in **General** catalog is service-managed.

An **access package** belongs to one catalog. In Microsoft Entra, a package can provide a bundle of resource roles (such as group membership) and can be governed by assignment/request policies. **This version implements catalog and package metadata CRUD only.** It does not model catalog resource registration, resource-role scopes, assignment policies, approval flows, assignment requests, provisioning, entitlement granting or license checking. Creating an access package **does not grant access** to any user.

The simulator reuses `res/ENTRA_CORE.js` with the established public `new EntraDirectory().Graph(method, endpoint, {body,query,headers})` API. It is synchronous and fully offline. Existing users, groups, applications, LDAP and PowerShell features are unchanged. Data is per instance, and `Reset()` or **Reset sandbox** restores the fictional fixture. No Microsoft Graph network calls, authentication, real access rights or enforcement of the scopes in `Connect-MgGraph` occur.

## Default demo data

| Type | Display name | ID | State/link |
| --- | --- | --- | --- |
| Catalog | General | `f0000000-0000-4000-8000-000000001001` | `serviceDefault`, published |
| Catalog | Engineering | `f0000000-0000-4000-8000-000000001002` | `userManaged`, published |
| Package | Engineering Starter | `f0000000-0000-4000-8000-000000001101` | Engineering catalog |
| Package | Employee Essentials | `f0000000-0000-4000-8000-000000001102` | General catalog |

These names, IDs and package relationships are **fictional**. Freshly created records have generated unique IDs and timestamps.

## Implemented Microsoft Graph-compatible routes

All paths use `/v1.0/identityGovernance/entitlementManagement/`:

| Method | Route | Response |
| --- | --- | --- |
| GET | `catalogs` | `200` collection with `value`, pagination and OData filtering |
| POST | `catalogs` | `201` created catalog and `Location` header |
| GET | `catalogs/{id}` | `200` catalog |
| PATCH | `catalogs/{id}` | `204` no content |
| DELETE | `catalogs/{id}` | `204` no content if user-managed and empty |
| GET | `accessPackages` | `200` collection with `value`, pagination and OData filtering |
| POST | `accessPackages` | `201` created access package and `Location` header |
| GET | `accessPackages/{id}` | `200` access package |
| PATCH | `accessPackages/{id}` | `204` no content |
| DELETE | `accessPackages/{id}` | `204` no content |

A package **must** link to an existing published catalog when created. Use the official nested create shape `"catalog":{"id":"..."}`. A `catalogId` string is also accepted for compatibility with Microsoft tutorial examples; it is a simulator convenience and does not imply the package can be moved to a different catalog afterward.

Additional supported relationship reads:
- `GET catalogs/{id}?$expand=accessPackages`
- `GET accessPackages/{id}?$expand=catalog`
- `GET catalogs/{id}/accessPackages` (simulator convenience)
- `GET accessPackages/{id}/catalog` (simulator convenience)

Supported list query options are `$filter` (limited `eq`, `ne`, comparison, `startswith`, `endswith`, `contains`), `$select`, `$orderby`, `$top`, `$skiptoken` and `$count` (requires `ConsistencyLevel: eventual`, as in the existing Graph core). Query grammar is deliberately a limited subset of Microsoft Graph. Unsupported parameters, fields and endpoints return explicit Graph-style JSON errors. Filter and selection work on `catalogId`, names, state, visibility and other documented simulated fields. `$expand` supports only the two relationships noted above.

### CRUD examples in PowerShell

`index.html` includes nine selectable examples under **Entra ID Governance: access catalogs & packages (9)**. Each is also available in `examples/graph/entitlement/read/` or `examples/graph/entitlement/write/` as a `.ps1` file.

```powershell
Connect-MgGraph -Scopes "EntitlementManagement.ReadWrite.All"

# Create a catalog
$catalog = Invoke-MgGraphRequest -Method POST `
  -Uri '/v1.0/identityGovernance/entitlementManagement/catalogs' `
  -Body '{"displayName":"HR Lifecycle","state":"published"}'

# Read it back, using its returned ID
Invoke-MgGraphRequest -Method GET `
  -Uri "/v1.0/identityGovernance/entitlementManagement/catalogs/$catalog.id"

# Update and remove it
Invoke-MgGraphRequest -Method PATCH `
  -Uri "/v1.0/identityGovernance/entitlementManagement/catalogs/$catalog.id" `
  -Body '{"description":"Reviewed by IGA"}'
Invoke-MgGraphRequest -Method DELETE `
  -Uri "/v1.0/identityGovernance/entitlementManagement/catalogs/$catalog.id"
```

The examples in the HTML editor have been tested against the project's **limited PowerShell subset**. When a URL contains an OData option such as `$filter` and the URL must be double-quoted for variable interpolation, encode `$` as `%24`; this avoids accidental PowerShell variable expansion.

## Validation and safeguards

- **General** is intentionally protected against PATCH and DELETE in this simulator.
- Catalogs with any access packages cannot be deleted; delete their packages first (`409 Request_ResourceConflict`).
- A package is linked to one catalog; PATCH cannot change `catalog` or `catalogId`.
- A catalog must be `published` before a package can be created in it.
- `id`, `catalogType`, `createdDateTime` and `modifiedDateTime` cannot be supplied as writable properties. `isExternallyVisible` and `isHidden` must be booleans.
- `404` for unknown catalog/package references; `400` for invalid request bodies; `405` for unsupported HTTP methods; read-only built-in catalogs use `403`.
- Existing custom tenant seeds that predate governance support can omit both governance arrays; they default to empty arrays.
- No authorization checks or real access changes are performed. The General protection and nonempty-catalog deletion guard are deliberate simulator safety rules rather than comprehensive reproductions of production Microsoft Graph behavior.

## Test commands

```bash
node res/ENTITLEMENT_TESTS.js
node res/ENTRA_CORE.test.js
node res/PS_GRAPH_TESTS.js
node res/PS_GRAPH_SAMPLES.test.js
node res/PS_TESTS.js
node res/PS_TESTS_v01.js
node res/ActiveDirectory.test.js
node res/AD_INTEGRATION_SMOKE.js
```

## Microsoft documentation

- [Entitlement management API overview](https://learn.microsoft.com/en-us/graph/api/resources/entitlementmanagement-overview?view=graph-rest-1.0)
- [Access package catalog resource](https://learn.microsoft.com/en-us/graph/api/resources/accesspackagecatalog?view=graph-rest-1.0)
- [Access package resource](https://learn.microsoft.com/en-us/graph/api/resources/accesspackage?view=graph-rest-1.0)
- [Create a catalog](https://learn.microsoft.com/en-us/graph/api/entitlementmanagement-post-catalogs?view=graph-rest-1.0)
- [Create an access package](https://learn.microsoft.com/en-us/graph/api/entitlementmanagement-post-accesspackages?view=graph-rest-1.0)
