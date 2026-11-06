# IGAsim: one AD_CORE directory engine

Base repository commit: `97849321560f5e01703fa7690fe0564adfef7ca8`.

## Dependencies

`index.html` loads these scripts in order (with the separate Entra Graph modules now included):

```html
<script src="res/COM_TERM.js"></script>
<script src="res/PS_PARSER.js"></script>
<script src="res/AD_CORE.js"></script>
<script src="res/PS_AD_COMMANDS.js"></script>
<script src="res/ENTRA_CORE.js"></script>
<script src="res/PS_GRAPH_COMMANDS.js"></script>
<script src="res/PS_CORE.js"></script>
<script src="res/PS_TERMINAL_ADAPTER.js"></script>
```

`tools/ActiveDirectory-demo.html` only needs `../res/AD_CORE.js`.
The retired `res/PS_AD.js` and `res/ActiveDirectory.js` are removed. No fetched JSON file, network LDAP server, or module loader is needed.

## Data ownership and public API

`AD_CORE.js` declares `function ActiveDirectory(seed, options)` containing its own `this.DB` and `this.LDAP` instance method. Its original `contoso.local` fixture is kept unchanged for the LDAP demo and public `new ActiveDirectory()` calls.

The PowerShell-specific adapter is also declared in `AD_CORE.js` as `function PowerShellADContainer()`. Its `SimulatedDirectory()` is a *compatibility facade* around `this.AD = new ActiveDirectory(...)`, **not a second mutable directory database**. Its exposed `this.LDAP()` delegates to `this.AD.LDAP()`, and `this.all()`, `this.search()`, and mutations read/write the shared `this.AD.DB` state. It keeps PowerShell-facing APIs such as `get`, `byDN`, `search`, `members`, `groupsOf`, `snapshot`, `reset`, `parseADFilter`, and error codes. Returned entry proxies give callers familiar flat/scalar attributes rather than LDAP's arrays, while preserving writable-property compatibility through the LDAP `modify` operation.

`new PowerShellJS.PowerShellSimulator()` still creates the **original PowerShell `corp.example.com` seed** (seven people, nested business role groups, computers and OUs), converted to LDAP entry format at initialization. The original `directoryEntries` option still accepts flat legacy objects. The demo's default `new ActiveDirectory()` still starts with the original three Contoso people. Different instances have independent data; edits never cross browser pages or sessions.

PowerShell `-Filter` is parsed by the legacy AD expression parser (moved into `AD_CORE.js`), then applied to candidates read through `LDAP('search')`. PowerShell `-LDAPFilter` and `Search-LDAP` pass the filter to the canonical `LDAP('search')` implementation. AD cmdlets for `Set-ADUser`, enabling/disabling accounts, and adding/removing group members use `LDAP('modify')`. The authoritative group-membership link is the group's `member` attribute; the directory computes `memberOf` backlinks so nested LDAP matching remains current after edits.

## Functionality preserved

The PowerShell pipeline, AST and script parser, terminal adapter, virtual filesystem, cmdlet/alias registry, AD filters, LDAP filters, numeric AD matching rules, recursive membership, group mutations, query logging, reset/snapshot behavior, LDAP bind/compare/add/modify/delete, RootDSE queries, and original fixtures are preserved.

The compatibility layer retains the `PowerShellAD` global *namespace* for existing modules and tests, but **all directory data lives in an `ActiveDirectory` instance**. No `class`, IIFE or CommonJS wrapper was introduced in browser code.

## Testing (repository root)

```bash
node test/PS_TESTS.js
node test/PS_TESTS_v01.js
node test/ActiveDirectory.test.js
node test/AD_INTEGRATION_SMOKE.js
```

The suites contain 50 + 18 + 33 + 14 checks (115 total). The integration suite verifies PowerShell-to-LDAP and LDAP-to-PowerShell visibility, raw LDAP add/modify/delete, mutable memberships, bitwise account filters, reset, nested groups and preservation of both fixtures.

## Known limits

LDAP is a browser-side approximation, not an LDAP wire-protocol implementation or a security boundary. `PowerShellAD.SimulatedDirectory` remains a compatibility facade; a future simplification could have PowerShell command modules use the LDAP request/response structure directly. Initial PowerShell fixture data is held inline in `AD_CORE.js`, not fetched from a file.

## Entra ID note (later integration)

The simulated Entra tenant is implemented independently in `ENTRA_CORE.js` and accessed by `PS_GRAPH_COMMANDS.js` through its public Graph API. This does **not** replace or modify the canonical on-prem `AD_CORE.js` LDAP engine; the two fictional directory datasets are distinct. See `docs/PS_GRAPH_COMMANDS.md`.
