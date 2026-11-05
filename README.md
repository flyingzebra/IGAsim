# PowerShellJS v0.2 — Offline PowerShell + Simulated AD

A **static, browser-only** PowerShell *subset* simulator with a separate parser, runtime, simulated Windows filesystem, and simulated Active Directory / LDAP provider. It is **not** Microsoft PowerShell, a real AD controller, an LDAP client, or a production script validation tool. No Node.js, server, installation, or internet access is needed to use the application.

## Quick start

1. Open **`PowerShellJS_v0.2_standalone.html`** in Chrome/Edge/Firefox/Safari, or open `index.html` in the development folder.
2. Use the example buttons (AD users, LDAP filter, Group membership, Modify AD, If / foreach, Virtual files).
3. Click **Run script** or press Ctrl/Cmd+Enter. You can also type single commands into `COM_TERM`.
4. Click **Inspect AST** to see the parsed control-flow structure before execution.
5. **Reset sandbox** reinitializes variables, virtual files, directory users, groups, memberships and the query log. Terminal command history in `localStorage` is separate.

Run the engine tests (Node is used ONLY for tests): `node PS_TESTS.js`. Original backward compatibility checks: `node PS_TESTS_v01.js`.

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
  +-- PS_AD_COMMANDS.js               [ActiveDirectory-style cmdlets and Search-LDAP]
         |
     PS_AD.js                         [simulated LDAP filter evaluator + in-memory AD]
         |
     Synthetic seed data             [corp.example.com; 7 users, nested groups, OUs, computers]
```

To embed the interpreter without a terminal:

```html
<script src="PS_PARSER.js"></script>
<script src="PS_AD.js"></script>
<script src="PS_AD_COMMANDS.js"></script>
<script src="PS_CORE.js"></script>
<script>
const ps = new PowerShellJS.PowerShellSimulator();
ps.execute('Get-ADUser -Filter * -Properties Department')
  .then(reply => console.log(reply.objects, reply.errors));
</script>
```

Custom fictional directory fixtures are supported programmatically with `new PowerShellJS.PowerShellSimulator({directoryEntries: yourEntries})`. Each entry needs a `distinguishedName` and suitable AD-like attributes, including `objectClass`/`objectCategory`; reset restores a cloned fixture. Only use sanitized data, not production directory exports containing personal or confidential information.

The terminal adapter continues to accept any engine implementing `execute(source)` (returns `{success, output, errors, effects, cwd, objects}`), `getPrompt()` and `reset()`. The supplied `COM_TERM` sources are copied **byte-for-byte**, not modified.

## Core v0.2 functionality

**Parser/runtime improvements:** explicit statement AST, nested `if (expression) { ... } else { ... }`, `foreach ($name in $array) { ... }`, simple `function Name($arg) { ... }`, quote/brace-safe multi-statement parsing, line continuations in pipelines, block comments, better parse errors and command-output assignment (`$users = Get-ADUser ...`). Supports session variables, property access, arithmetic/comparisons, quoted strings and simple PowerShell object pipelines. Input/output and session remain independent from the browser UI.

**AD cmdlets in the simulated provider:** `Get-ADRootDSE`, `Get-ADUser`, `Get-ADGroup`, `Get-ADComputer`, `Get-ADOrganizationalUnit`, `Get-ADObject`, `Get-ADGroupMember` (`-Recursive`), `Get-ADPrincipalGroupMembership`, `Set-ADUser` (department/title/mail), `Enable-ADAccount`, `Disable-ADAccount`, `Add-ADGroupMember`, `Remove-ADGroupMember`, `Get-LDAPQueryLog`. `Search-LDAP` (alias `Invoke-LDAPSearch`) is a lower-level provider operation with `-BaseDN`, `-Filter`, `-Scope`, `-Attributes`, `-SizeLimit`.

**Directory filters:** `-Filter` supports a subset of the AD expression language (`-eq`, `-ne`, `-like`, `-notlike`, `-gt`, `-ge`, `-lt`, `-le`, `-and`, `-or`, `-not`, parentheses); `-LDAPFilter` supports a subset of RFC 4515 LDAP filter grammar (`&`, `|`, `!`, attribute equality, presence, substrings, `>=`, `<=`, `~=`, escaped hex characters, and AD bitwise/transitive matching OIDs). `-SearchBase` and `-SearchScope Base|OneLevel|Subtree` apply to the simulated DN hierarchy. `-Properties` controls projection for `Get-AD*` searches.

**PowerShell pipeline vs. LDAP query:** These are different layers. The `-LDAPFilter` string is evaluated *inside* the virtual directory; `|` passes **objects** from one PowerShell cmdlet to another. `Search-LDAP` is simulated **in memory**; it does not perform any LDAP network bind. A future real-AD connector would require a separately designed authenticated service/proxy, not direct browser LDAP socket access.

## Example scripts

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

- `node PS_TESTS.js`: 44 regression tests covering parser, control flow, virtual filesystem, AD queries, LDAP filters, bitwise and transitive matching, group mutations, reset and error handling.
- `node PS_TESTS_v01.js`: original 18 v0.1 compatibility tests.
- JavaScript syntax checks pass. An automated graphical Chromium smoke test **could not complete** in the provided environment; open the standalone HTML in a desktop browser for a manual UI check.

## References

- Microsoft Learn: [Get-ADUser](https://learn.microsoft.com/en-us/powershell/module/activedirectory/get-aduser), [about_ActiveDirectory_Filter](https://learn.microsoft.com/en-us/powershell/module/activedirectory/about/about_activedirectory_filter), [LDAP search filter syntax](https://learn.microsoft.com/en-us/windows/win32/adsi/search-filter-syntax), and [about_Pipelines](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_pipelines).
