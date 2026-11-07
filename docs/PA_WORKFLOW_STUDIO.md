# NoCode JS Workflow Studio v0.2

## Open the tool

Open [`tools/NoCodeJS-Studio.html`](../tools/NoCodeJS-Studio.html) in a modern browser. No installation, Node.js, npm or backend is required. The **workflow engine** and **JSON editor** work offline using the existing IGAsim scripts. The **NoCode JS visual designer** still loads `sequential-workflow-designer@0.40.4` from jsDelivr when requested. An internet connection is necessary for the visual canvas until the MIT-licensed browser assets are vendored locally. The NoCode JS Workflow Machine is not used: `PA_CORE.js` executes a compatible subset of workflows.

The tool is intentionally separate from `index.html`. It constructs its own `PowerShellJS.PowerShellSimulator` instance and provides the same shared in-memory AD/Entra engine to `PA_CORE.js` through the existing `PA_APP.js` adapter interface. Running the studio and main PowerShell page in two separate tabs **does not** synchronize their data. Within the studio, all actions share its own in-memory environment.

## Typical workflow

1. Select a workflow in the example picker, then click **Load example**.
2. Click **Open NoCode JS canvas** to design visually when online, or edit the JSON definition and click **Apply & validate**.
3. Click **Run workflow** and inspect the execution trace, workflow state and AD/Entra counters.
4. Use **Export JSON** or **Import JSON** for definitions. JSON exports only the definition, not any runtime state.
5. Click **Reset identity sandbox** to restore fictional data and Graph connection state. This does not reset the definition.

Included examples: hybrid inventory, joiner AD changes, new access catalog, new access package and condition/variables. The joiner and governance examples mutate *fictional* in-memory records.

## Files

- `tools/NoCodeJS-Studio.html` — tool entry point, loads existing identity/runtime modules.
- `tools/NoCodeJS-Studio.css` — standalone responsive studio styling.
- `tools/NoCodeJS-Studio.js` — samples, sandbox statistics, outline and step traces; delegates editor and execution to `PA_APP.js` / `PA_CORE.js`.
- `res/PA_LIBRARY.js` — fully validated reusable examples using the NoCode JS JSON definition format.
- `test/PA_LIBRARY.test.js` — template validation and execution tests, part of `test/index.html`.
- `test/PA_STUDIO.test.js` — standalone studio DOM and UI smoke checks, part of `test/index.html`.

## Constraints

All workflows are **simulated**. There is no real Power Automate, Graph authentication, cloud tenant, AD connection, email, scheduled execution when browser is closed, or approval service. Supported actions are the `PA_CORE.js` v0.1 subset (manual trigger, PowerShell, simulated Graph CRUD, variables, logging, true/false conditions). There is no import of Microsoft Power Automate flow packages and no guarantee of full NoCode JS Workflow Machine feature parity.

Studio v0.2 is designed to preserve all existing IGAsim components. It does not modify `COM_TERM`, `PS_CORE`, `AD_CORE`, `ENTRA_CORE` or the existing `PA_APP`/`PA_CORE` modules.
