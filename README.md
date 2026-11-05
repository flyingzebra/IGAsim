# PowerShellJS v0.2 — Offline PowerShell, Active Directory and Entra ID

A **static, browser-only** PowerShell *subset* simulator with a separate parser, runtime, simulated Windows filesystem, and simulated Active Directory / LDAP provider and a Microsoft Entra ID / Graph provider. It is **not** Microsoft PowerShell, a real AD controller, an LDAP client, or a production script validation tool. No Node.js, server, installation, or internet access is needed to use the application.

## Quick start

1. Open **`index.html`** in Chrome/Edge/Firefox/Safari. The standalone LDAP console remains available at `tools/ActiveDirectory-demo.html`.
2. Use the example buttons (AD users, LDAP filter, Group membership, Modify AD, If / foreach, Virtual files, Entra ID / Graph). Expand **More Entra ID / Graph scripts** for 14 additional scenarios and **Entra ID Governance: access catalogs & packages (9)** for nine Entitlement Management Graph CRUD examples.
3. Click **Run script** or press Ctrl/Cmd+Enter. You can also type single commands into `COM_TERM`.
4. Click **Inspect AST** to see the parsed control-flow structure before execution.
5. **Reset sandbox** reinitializes variables, virtual files, on-premises directory objects, cloud tenant objects, simulated Graph connection and LDAP query log. Terminal command history in `localStorage` is separate.

Run the engine tests from the repository root (Node is used **only** for tests): `node res/PS_TESTS.js`, `node res/PS_TESTS_v01.js`, `node res/ActiveDirectory.test.js`, and `node res/AD_INTEGRATION_SMOKE.js`, `node res/ENTRA_CORE.test.js`, and `node res/PS_GRAPH_TESTS.js`.

## Architecture

```
index.html + PS_APP.css
         |
COM_TERM.js + COM_TERM.css             [unchanged generic terminal]
         |
PS_TERMINAL_ADAPTER.js                [host adapter + interchangeable engine registry]
         |
PS_CORE.js                            [PowerShell session + execution engine]
  +-- PS_PARSER.js                    [structural lexer/parser and script AST]
  +-- PS_AD_COMMANDS.js               [on-premises AD cmdlets + Search-LDAP]
  |      └── AD_CORE.js               [ActiveDirectory.LDAP() + corp.example.com fixture]
  +-- PS_GRAPH_COMMANDS.js            [Graph PowerShell cmdlets + Invoke-MgGraphRequest]
         └── ENTRA_CORE.js           [EntraDirectory.Graph() + northwind.example fixture]
```

To embed the interpreter without a terminal:

```html
<script src="PS_PARSER.js"></script>
<script src="AD_CORE.js"></script>
<script src="PS_AD_COMMANDS.js"></script>
<script src="ENTRA_CORE.js"></script>
<script src="PS_GRAPH_COMMANDS.js"></script>
<script src="PS_CORE.js"></script>
<script>
const ps = new PowerShellJS.PowerShellSimulator();
ps.execute('Get-ADUser -Filter * -Properties Department')
  .then(reply => console.log(reply.objects, reply.errors));
</script>
```

Custom fictional on-prem AD and cloud tenant fixtures are supported programmatically with `new PowerShellJS.PowerShellSimulator({directoryEntries: yourEntries, entraSeed: yourEntraDB})`. Each entry needs a `distinguishedName` and suitable AD-like attributes, including `objectClass`/`objectCategory`; reset restores a cloned fixture. Only use sanitized data, not production directory exports containing personal or confidential information.

The terminal adapter continues to accept any engine implementing `execute(source)` (returns `{success, output, errors, effects, cwd, objects}`), `getPrompt()` and `reset()`. The supplied `COM_TERM` sources are copied **byte-for-byte**, not modified.

The main application and the standalone LDAP console both load `res/AD_CORE.js`.
Each page creates its **own in-memory instance**: the PowerShell simulator retains its `corp.example.com` users/groups/computers, while the LDAP demo retains `contoso.local`. `PS_AD.js` is no longer included or needed. See [AD_CORE integration](docs/AD_CORE_INTEGRATION.md).

**Cloud integration:** `index.html` now also loads `ENTRA_CORE.js` and `PS_GRAPH_COMMANDS.js`. The PowerShell simulator has an independent fictional `northwind.example` tenant with users, groups and applications. `Connect-MgGraph` simulates a connection (no login or scope enforcement), `Get-MgUser`/`Get-MgGroup` query it, and `Invoke-MgGraphRequest` exposes raw Graph-style operations. [Graph PowerShell command guide](docs/PS_GRAPH_COMMANDS.md) and [Graph core API](docs/README-ENTRA_CORE.md).

**Entitlement Management:** `ENTRA_CORE.js` now models access package catalogs and access packages with Graph GET/POST/PATCH/DELETE operations. Both catalogs and packages include a fictional read-only fixture, and their relationship is maintained. Nine sample scripts in `index.html` exercise CRUD through `Invoke-MgGraphRequest`. This version models metadata only; it does **not** implement resource role assignments, policies, access requests or actual access grants. See [Entitlement Management API and examples](docs/ENTITLEMENT_MANAGEMENT.md).

## Core v0.2 functionality

**Parser/runtime improvements:** explicit statement AST, nested `if (expression) { ... } else { ... }`, `foreach ($name in $array) { ... }`, simple `function Name($arg) { ... }`, quote/brace-safe multi-statement parsing, line continuations in pipelines, block comments, better parse errors and command-output assignment (`$users = Get-ADUser ...`). Supports session variables, property access, arithmetic/comparisons, quoted strings and simple PowerShell object pipelines. Input/output and session remain independent from the browser UI.

**AD cmdlets in the simulated provider:** `Get-ADRootDSE`, `Get-ADUser`, `Get-ADGroup`, `Get-ADComputer`, `Get-ADOrganizationalUnit`, `Get-ADObject`, `Get-ADGroupMember` (`-Recursive`), `Get-ADPrincipalGroupMembership`, `Set-ADUser` (department/title/mail), `Enable-ADAccount`, `Disable-ADAccount`, `Add-ADGroupMember`, `Remove-ADGroupMember`, `Get-LDAPQueryLog`. `Search-LDAP` (alias `Invoke-LDAPSearch`) is a lower-level provider operation with `-BaseDN`, `-Filter`, `-Scope`, `-Attributes`, `-SizeLimit`.

**Directory filters:** `-Filter` supports a subset of the AD expression language (`-eq`, `-ne`, `-like`, `-notlike`, `-gt`, `-ge`, `-lt`, `-le`, `-and`, `-or`, `-not`, parentheses); `-LDAPFilter` supports a subset of RFC 4515 LDAP filter grammar (`&`, `|`, `!`, attribute equality, presence, substrings, `>=`, `<=`, `~=`, escaped hex characters, and AD bitwise/transitive matching OIDs). `-SearchBase` and `-SearchScope Base|OneLevel|Subtree` apply to the simulated DN hierarchy. `-Properties` controls projection for `Get-AD*` searches.

**Graph cmdlets:** `Connect-MgGraph`, `Disconnect-MgGraph`, `Get-MgContext`, `Get-MgUser`, `Get-MgGroup`, member queries, application/service-principal/device/role reads, supported new/update/remove operations, and `Invoke-MgGraphRequest`. Graph `-Filter` uses OData (`department eq 'IT'`), not LDAP. `-All` follows Graph pages. See [Graph command details](docs/PS_GRAPH_COMMANDS.md).

**PowerShell pipeline vs. LDAP query:** These are different layers. The `-LDAPFilter` string is evaluated *inside* the virtual directory; `|` passes **objects** from one PowerShell cmdlet to another. `Search-LDAP` is simulated **in memory**; it does not perform any LDAP network bind. A future real-AD connector would require a separately designed authenticated service/proxy, not direct browser LDAP socket access.

The built-in Graph example library includes tenant inventory, user filtering, paging, nested group membership, directory roles, application inventory, direct Graph REST calls and simulated mutations. See [Graph script library](docs/GRAPH_SCRIPT_LIBRARY.md).

**Governance examples:** open the new expandable section in `index.html` for nine read-only and CRUD scripts covering access catalogs and packages. Example `.ps1` files are also under `examples/graph/entitlement/`. All operations remain local to the fictional `northwind.example` tenant; Reset sandbox reverts changes.

## Example scripts

```powershell
# Cloud tenant (simulation only; no actual Microsoft authentication)
Connect-MgGraph -Scopes "User.Read.All,Group.Read.All"
Get-MgUser -Filter "department eq 'IT'" -Property "id,displayName,department"
Get-MgGroup -All
Invoke-MgGraphRequest -Method GET -Uri '/v1.0/users?$top=1'
```


```powershell
# Directory query via AD filter expression
Get-ADUser -Filter { Department -eq 'Finance' -and Enabled -eq $true } -Properties Department,Mail |
  Select-Object Name,SamAccountName,Department,Mail

# RFC 4515 LDAP filter via simulated provider
Search-LDAP -BaseDN 'OU=Users,DC=corp,DC=example,DC=com' -Scope Subtree -Filter '(&(objectCategory=person)(department=IT))' -Attributes cn,mail

# Nested business roles and membership
Get-ADGroupMember -Identity APP_Reporting -Recursive |
  Select-Object Name,SamAccountName

# Command result assignment and control flow
$users = Get-ADUser -Filter 'Enabled -eq $true' -Properties Department
foreach ($u in $users) {
  if ($u.Department -eq 'IT') { Write-Output $u.SamAccountName }
}

# In-memory updates; reset sandbox reverses changes
Set-ADUser -Identity leo.chen -Department Operations
Add-ADGroupMember -Identity BR_Operations -Members leo.chen
Get-LDAPQueryLog
```

## Deliberate limitations and correctness caveats

- The grammar is **not complete PowerShell**. Unsupported examples include `param` blocks, advanced functions, `switch`, `try/catch`, `for`, `@(...)` array literals, pipelines of scriptblock expressions, PowerShell provider paths, splatting, advanced parameter binding, and PowerShell's full coercion/scope rules. The `Where-Object` script block is limited to one property comparison.
- Directory schema, matching rules, group expansion and returned default properties are **approximations**. Many LDAP controls/operators, DN escaping cases, schema constraints, security descriptors, replicated state and AD-specific semantics are not implemented. `-Filter` / `-LDAPFilter` are distinct and should not be mixed. Unknown AD parameters fail explicitly.
- No real network, OS calls, LDAP binds, credentials, AD DS or authentication; modifications are session-only. Test data is fictional; domain `corp.example.com` is reserved for examples.
- Scripts have resource limits (maximum source size, statement count, output size, pipeline items, block depth/iterations). Scripts are interpreted without JavaScript `eval()`.
- Command extensions are **JavaScript loaded into the host page**; only load trusted extensions. Do not treat this as a sandbox for untrusted JavaScript modules.
- A script that works here may behave differently on Windows PowerShell 5.1 or PowerShell 7. Do not assume production correctness.

## Testing

- `node res/PS_GRAPH_TESTS.js`: cloud PowerShell cmdlet and integration tests.
- `node res/PS_GRAPH_SAMPLES.test.js`: all 14 selectable Microsoft Graph example scripts and the UI button wiring.
- `node res/ENTRA_CORE.test.js`: standalone Graph core tests.
- `node res/ENTITLEMENT_TESTS.js`: governance core CRUD tests, relationship integrity, 9 runnable scripts, and HTML button/Run verification.

- `node res/PS_TESTS.js`: 50 regression tests covering parser, control flow, virtual filesystem, AD queries, LDAP filters, bitwise and transitive matching, group mutations, reset and error handling.
- `node res/PS_TESTS_v01.js`: original 18 v0.1 compatibility tests.
- `node res/ActiveDirectory.test.js`: 33 standalone LDAP tests.
- `node res/AD_INTEGRATION_SMOKE.js`: 14 shared-backend integration tests.
- JavaScript syntax checks pass. An automated graphical Chromium smoke test **could not complete** in the provided environment; open the standalone HTML in a desktop browser for a manual UI check.

## References

- Microsoft Learn: [Get-ADUser](https://learn.microsoft.com/en-us/powershell/module/activedirectory/get-aduser), [about_ActiveDirectory_Filter](https://learn.microsoft.com/en-us/powershell/module/activedirectory/about/about_activedirectory_filter), [LDAP search filter syntax](https://learn.microsoft.com/en-us/windows/win32/adsi/search-filter-syntax), and [about_Pipelines](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_pipelines).
