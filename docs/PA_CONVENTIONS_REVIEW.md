# PowerAutomateJS coding conventions review

The NoCode JS integration was initially implemented with immediate invocation wrappers, prototype methods, two-space indentation and compact multi-statement blocks. Those patterns contradicted `docs/CODING_CONVENTIONS.md`.

This update covers all three new JavaScript modules in `res/`:

| File | Browser container | Public interface |
|---|---|---|
| `res/PA_CORE.js` | `function PowerAutomateCore()` | `var PowerAutomateJS = new PowerAutomateCore()`; `WorkflowEngine`, `assertValid`, `sampleDefinition`, `interpolate` |
| `res/PA_LIBRARY.js` | `function NoCodeWorkflowLibraryContainer()` | `var NoCodeWorkflowLibrary = new NoCodeWorkflowLibraryContainer()`; `list`, `get` |
| `res/PA_APP.js` | `function PowerAutomateApp(powerShellApp)` | `var PowerAutomateJSApp`, initialized only when the UI and its shared PowerShell host exist; `engine`, `getDefinition`, `setDefinition` |

Each container uses four-space indentation, Allman braces for executable blocks, direct `this` methods and instance-owned mutable state. Helpers live inside the constructors; no IIFEs, factories for defining containers, runtime `globalThis` assignment, `class`, module exports, or prototype-forwarding methods are required. The optional vendor-supplied NoCode JS UMD bundle is a third-party dependency and is not rewritten to match first-party conventions.

The public API is retained for `tools/NoCodeJS-Studio.js` and existing regression suites; workflow definitions, execution behavior, Graph/PowerShell dispatch and optional CDN editor loading are not intentionally altered. This is primarily a structural and formatting refactor.

## Checks

`test/PA_CONVENTIONS.test.js` validates named constructors, own instance methods, API stability, multi-instance isolation, cloned library datasets and absence of runtime module dependencies. It is registered with the existing browser suite dashboard in `test/index.html`, alongside `PA_TESTS.js`, `PA_LIBRARY.test.js` and `PA_STUDIO.test.js`.

Open `test/index.html` via `file://` to run tests; no Node.js is needed for the application or browser regressions.
