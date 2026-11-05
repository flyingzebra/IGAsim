# IGAsim — Microsoft Graph PowerShell commands (v0.1)

**Scope:** `res/PS_GRAPH_COMMANDS.js` bridges the existing PowerShellJS simulator to the **local** `res/ENTRA_CORE.js` directory. It does not contact Microsoft, use real OAuth tokens, or implement Microsoft's full PowerShell SDK.

## Module architecture

```text
index.html + COM_TERM.js
    └── PS_CORE.js  (PowerShellSimulator + Session)
          ├── PS_AD_COMMANDS.js  ── AD_CORE.js        (LDAP / corp.example.com)
          └── PS_GRAPH_COMMANDS.js ── ENTRA_CORE.js  (Graph / northwind.example)
```

Both directories belong to each **PowerShellSimulator** instance. The existing LDAP commands retain their implementation. Each new session creates its own `new EntraDirectory(seed, { requireAuth: true })`. `reset()` restores both directory fixtures, clears PowerShell state, and disconnects the simulated Graph session.

The command adapter does **not** access or change `ENTRA_CORE.DB` to execute operations; it calls the public `session.entra.Graph(method, endpoint, request)` interface. It only reads `DB.tenantId` to report the fictional connection context.

### Classic script loading order

```html
<script src="res/PS_PARSER.js"></script>
<script src="res/AD_CORE.js"></script>
<script src="res/PS_AD_COMMANDS.js"></script>
<script src="res/ENTRA_CORE.js"></script>
<script src="res/PS_GRAPH_COMMANDS.js"></script>
<script src="res/PS_CORE.js"></script>
```

`COM_TERM.js`, `PS_TERMINAL_ADAPTER.js` and the stylesheets are also loaded by the actual `index.html`. The standalone `tools/EntraDirectory-demo.html` continues to work directly with `ENTRA_CORE.js` and does not load the PowerShell engine.

## Quick start

```powershell
# All operations below are fictional and happen in memory.
Connect-MgGraph -Scopes "User.Read.All,Group.Read.All"
Get-MgContext
Get-MgUser -All
Get-MgUser -Filter "department eq 'IT'" -Property "id,displayName,department"
Get-MgGroup -All
Get-MgGroupMember -GroupId f0000000-0000-4000-8000-000000000201
Disconnect-MgGraph
```

The PowerShellJS parser supports a subset of syntax, not arbitrary PowerShell expressions. For JSON bodies, provide a quoted JSON string or an in-memory object from a variable. Single-quoted strings avoid expansion of Graph query parameters such as `$top`.

```powershell
Connect-MgGraph
Invoke-MgGraphRequest -Method GET -Uri '/v1.0/users?$top=1'
Invoke-MgGraphRequest -Method GET -Uri /v1.0/users -Query '{"$top":"1"}'
```

`Invoke-MgGraphRequest` returns the **raw Graph JSON body**, including `value`, `@odata.count` and `@odata.nextLink` when applicable. Higher-level `Get-Mg*` cmdlets return the objects in the `value` array, so they work naturally with PowerShell pipelines.

## Implemented cmdlets

| Command(s) | Supported features |
|---|---|
| `Connect-MgGraph`, `Disconnect-MgGraph`, `Get-MgContext` | Simulated connection; optional `-Scopes`, `-TenantId` (fictional tenant only) |
| `Get-MgUser`, `Get-MgGroup` | `-UserId` / `-GroupId`, `-Filter`, `-Property` / `-Select`, `-OrderBy`, `-Top`, `-All`, `-CountVariable` |
| `Get-MgApplication`, `Get-MgServicePrincipal`, `Get-MgDevice`, `Get-MgDirectoryRole` | Matching `-...Id` or collection query parameters above |
| `Get-MgOrganization` | Get fictional organization, optionally select fields |
| `Get-MgGroupMember`, `Get-MgGroupTransitiveMember` | `-GroupId`, paging, `-Property` and `-All` |
| `Get-MgUserMemberOf`, `Get-MgGroupMemberOf`, `Get-MgDirectoryRoleMember` | Relationship traversal, paging |
| `New-MgUser`, `New-MgGroup`, `New-MgApplication`, `New-MgServicePrincipal` | JSON `-BodyParameter` or supported direct property parameters |
| `Update-MgUser`, `Update-MgGroup`, `Update-MgApplication`, `Update-MgServicePrincipal` | JSON `-BodyParameter` or supported writable properties; optional `-PassThru` |
| `Remove-MgUser`, `Remove-MgGroup`, `Remove-MgApplication`, `Remove-MgServicePrincipal` | Remove by object ID |
| `New-MgGroupMemberByRef`, `Remove-MgGroupMemberByRef` | `-GroupId` with `-DirectoryObjectId`; creation also supports `-BodyParameter` |
| `Invoke-MgGraphRequest` | `-Method GET|POST|PATCH|DELETE`, `-Uri`, optional JSON `-Body`, `-Headers`, `-Query` |

For list queries `-Top` controls the **page size** in this simulator (1–999). `-All` follows `@odata.nextLink` until exhausted, with limits of 100 pages and 5,000 returned objects. Without `-All`, a list command returns its first page. `-CountVariable total` requests `$count=true` with a simulated `ConsistencyLevel: eventual` header and saves the count to `$total`.

`Get-MgUser` uses Graph's default property projection. `department` or `accountEnabled` may not appear unless explicitly requested with `-Property`. This mimics Graph projection rather than the on-prem `Get-ADUser` output.

### Mutations

```powershell
Connect-MgGraph
Update-MgUser -UserId ada.martin@northwind.example -Department Security
Get-MgUser -UserId ada.martin@northwind.example -Property "id,displayName,department"

New-MgUser -DisplayName "Dana Owens" -UserPrincipalName dana@northwind.example -MailNickname dana -AccountEnabled $true -PasswordProfile '{"password":"SIMULATED-PASSWORD"}'
New-MgGroup -DisplayName "Demo Group" -MailNickname demo -MailEnabled $false -SecurityEnabled $true -GroupTypes ""

# Adding and removing members by reference
New-MgGroupMemberByRef -GroupId f0000000-0000-4000-8000-000000000201 -DirectoryObjectId f0000000-0000-4000-8000-000000000102
Remove-MgGroupMemberByRef -GroupId f0000000-0000-4000-8000-000000000201 -DirectoryObjectId f0000000-0000-4000-8000-000000000102
```

All writes are made through `ENTRA_CORE.Graph()` and are visible immediately to subsequent Graph PowerShell commands, and vice versa. The fictional user password supplied to `New-MgUser` is discarded by the Graph core and is never persisted.

## Important limitations

- **No real authentication.** `Connect-MgGraph` only toggles a local session flag, and `-Scopes` are displayed but **not enforced** as permissions. A connected session does not confer actual access to Microsoft Entra ID.
- **No network requests.** There is no `fetch`, LDAP bridge, OAuth, MSAL, SDK or external library dependency.
- `-Filter` uses an **OData subset**, such as `department eq 'IT'`, and is distinct from LDAP and `Get-ADUser -Filter` syntax.
- Cmdlet parameters are intentionally limited. Unsupported parameters raise errors rather than pretending to work. PowerShell hash tables, splatting, advanced authentication parameter sets, `$expand`, batch/delta endpoints and real Graph paging tokens are out of scope.
- `-BodyParameter`, `-Headers` and `-Query` accept JSON strings or pre-existing JavaScript object values; the PowerShellJS parser doesn't support full PowerShell hash-table syntax.
- The Graph core applies basic body validation, duplicate/cycle checks and HTTP-style errors, but it does not enforce real Graph service rules, tenant permissions or data retention.
- The AD and Entra fixtures remain **separate**. Synchronizing on-prem identities to Entra ID is a future IGA feature, not part of this change.

## Tests

Run from the repository root:

```bash
node res/PS_GRAPH_TESTS.js
node res/PS_TESTS.js
node res/PS_TESTS_v01.js
node res/ENTRA_CORE.test.js
node res/ActiveDirectory.test.js
node res/AD_INTEGRATION_SMOKE.js
```

`PS_GRAPH_TESTS.js` covers session behavior, routing to Graph, query/filter/paging, CRUD, group references, failure cases, reset, independent instances, classic browser scripts and continued on-prem AD support. A fake-DOM/terminal smoke test also verifies that the HTML Entra example button runs through the adapter. A full graphical browser check still needs to be done locally.
