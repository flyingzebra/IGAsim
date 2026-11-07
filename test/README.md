# IGAsim browser regression tests

Open **[`test/index.html`](index.html)** directly in a modern browser from the IGAsim directory. The browser regression dashboard automatically runs all thirteen suites, displays per-check pass/fail results, and has a **Run all suites** button to rerun them.

**No Node.js, npm, terminal, web server, download or external testing library is required.** The browser uses ordinary `<script src="...">` tags to load the same `../res/` modules as the main application. All identity fixtures are fictional and remain in memory.

| Suite | Coverage | Expected checks |
|---|---|---:|
| `PS_TESTS.js` | PowerShell v0.2 parser, virtual filesystem, AD, session and terminal | 50 |
| `PS_TESTS_v01.js` | Legacy PowerShell v0.1 compatibility | 18 |
| `ActiveDirectory.test.js` | Standalone LDAP engine | 33 |
| `AD_INTEGRATION_SMOKE.js` | Shared AD/LDAP backend integration | 14 |
| `ENTRA_CORE.test.js` | Graph API, fixture isolation and standalone demo | 53 |
| `PS_GRAPH_TESTS.js` | Graph PowerShell cmdlets and browser app bootstrap | 54 |
| `PS_GRAPH_SAMPLES.test.js` | 14 Graph examples and DOM editor controls | 17 |
| `ENTITLEMENT_TESTS.js` | Catalog/package CRUD and nine entitlement-management examples | 32 |
| `TERMINAL_SCROLL.test.js` | Actual terminal DOM, long-line layout, scrolling, prompt usability | 7 |
| `PA_TESTS.js` | NoCode JS-compatible workflow runner, identity dispatch and error handling | 16 |
| `PA_LIBRARY.test.js` | Five sample workflows, definitions, Graph CRUD and AD actions | 9 |
| `PA_STUDIO.test.js` | Browser Studio DOM integration and execution history | 8 |
| `PA_CONVENTIONS.test.js` | Named constructors, direct instance methods, isolation and public APIs | 6 |
| **Total** | | **317** |

## How it works

- `index.html` is the graphical suite runner, and `dashboard.js` collects results.
- `suite.html` runs each suite in a separate browser iframe, with classic scripts loaded from `../res/`. This prevents state and top-level declarations leaking between suites.
- `browser-assert.js` implements lightweight dependency-free assertions. `browser-kit.js` captures test progress, returns browser errors to the dashboard, and uses fresh `srcdoc` frames for isolation tests.
- `app-fixture.js` provides a small DOM/terminal double for the **same `res/PS_APP.js`** bootstrap used in the real application. The standalone Entra demo likewise exposes shared `tools/EntraDirectory-demo.js` controls for browser testing.
- No `require()`, `node:fs`, `node:vm`, Node runner or network/file-fetch API is used by the regression tests.

## Coverage boundaries

The initial 278 browser checks are retained, with 39 PowerAutomateJS, Studio and convention checks registered. Tests that previously inspected local source files with Node now exercise browser-loaded constructors and executable script paths. Since browser security prevents silently reading sibling `.ps1` and HTML files over `file://`, strict byte-for-byte parity checks of standalone `.ps1` copies are replaced by parser and execution checks of the editor's actual scripts. If editing standalone `.ps1` copies, manually compare them with the editor samples. A full visual inspection of the production `index.html` is still recommended.

The suite is offline and simulation-only: it never authenticates to Microsoft Graph, AD DS, Entra ID, or SAP. Browser behavior may differ across engines; test in your preferred browser before release.

The terminal scrolling suite creates a real `TERMINAL` inside a layout-capable iframe, using the production `res/COM_TERM.js`, `res/COM_TERM.css` and `res/PS_APP.css`. Unlike the application fixture, it measures actual browser scroll dimensions and scroll offsets.
