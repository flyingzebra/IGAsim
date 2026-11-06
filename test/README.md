# IGAsim regression tests

The `test/` directory contains **Node-only** regression suites. Browser runtime JavaScript, CSS and simulation data remain in `res/`, and the application still opens offline using `index.html`.

From the repository root:

```bash
node test/run-all.js
```

Run an individual suite with `node test/PS_TESTS.js`, etc. The runner uses the Node executable and resolves test paths independently of the current working directory. Each suite loads JavaScript from `../res/` using its own file location, not the shell's current directory. The UI-oriented tests also load `../index.html` and `../examples/`.

| Suite | Covers |
|---|---|
| `PS_TESTS.js` | PowerShell v0.2 parser, AD commands, session and terminal |
| `PS_TESTS_v01.js` | Legacy PowerShell v0.1 regression |
| `ActiveDirectory.test.js` | Standalone LDAP engine (`AD_CORE.js`) |
| `AD_INTEGRATION_SMOKE.js` | Shared LDAP/PowerShell directory integration |
| `ENTRA_CORE.test.js` | Microsoft Graph-style Entra core |
| `PS_GRAPH_TESTS.js` | Graph PowerShell cmdlets and DOM harness |
| `PS_GRAPH_SAMPLES.test.js` | Embedded Graph examples and HTML script selection |
| `ENTITLEMENT_TESTS.js` | Catalog/package CRUD and entitlement examples |

`test/run-all.js` runs all eight suites and returns a nonzero exit code if any suite fails. These tests **do not replace** interactive browser verification and do not use real Entra ID, LDAP or SAP services.
