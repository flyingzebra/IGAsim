# PowerAutomateJS v0.1 — NoCode JS integration

This feature introduces browser-only workflow execution for the IGAsim fictional identity environment, with an **optional visual editor based on the MIT-licensed NoCode JS Sequential Workflow Designer**.

## Architecture and dependencies

```
index.html
  ├─ existing COM_TERM + PowerShellJS + AD_CORE + ENTRA_CORE (unchanged)
  └─ PA_APP.js + PA_APP.css
       ├─ PA_CORE.js             local workflow runner, no dependencies
       ├─ shared PowerShellJSApp.adapter.engine
       │    ├─ engine.execute()   PowerShell action, including Search-LDAP
       │    └─ session.entra.Graph() in-memory Graph API, GET/POST/PATCH/DELETE
       └─ NoCode JS Sequential Workflow Designer 0.40.4 (optional visual canvas)
```

The **runtime**, JSON editor, import/export and browser tests all work offline from `file://` with no Node.js, npm or server. To avoid bundling upstream build artifacts without verified copies, the visual editor is loaded **only when the user clicks `Visual designer`** from the version-pinned CDN `https://cdn.jsdelivr.net/npm/sequential-workflow-designer@0.40.4`. The visual editor **needs internet on its first load**; an offline or blocked CDN leaves the JSON editor and runtime available and shows a clear warning. This is a deliberate v0.1 packaging limitation, not a claim of a fully offline NoCode JS canvas. Future work: vendor the verified MIT-licensed `dist/index.umd.js` and CSS under `res/vendor/` and switch the loader to local assets.

No Microsoft service calls are made. Remote CDNs serve only the optional designer's static assets. Do not input personal or sensitive production data into this demonstration.

## Use

1. Open `index.html` as before. The existing terminal and PowerShell script editor remain unchanged.
2. Scroll to **PowerAutomateJS — NoCode JS workflows**.
3. Click **Run flow** to execute the provided hybrid AD/Graph sample against the same in-memory identity stores used by the terminal.
4. Click **Visual designer** to load NoCode JS (internet needed); drag task or condition steps into the flow and edit their properties in the right-hand inspector. Each edit updates the JSON definition.
5. Alternatively, edit JSON directly and click **Apply JSON**. `Import JSON` and `Export JSON` use local browser file APIs.
6. Click **Reset sandbox** in the existing terminal panel to reset changes made by PowerShell or workflow actions. Workflow definitions are not reset by that button; **Sample flow** restores the sample definition.
7. Open `test/index.html` and run the new `PA_TESTS.js` suite along with the existing regressions.

## Definition contract

A workflow is JSON-compatible with NoCode JS Sequential Workflow Designer. The root object includes `properties: {}` and `sequence: []`; each step includes `id`, `name`, `componentType`, `type`, and `properties`.

**Root first step is required:** a `task/trigger` with `{ "event": "manual" }`. Other task step types:

| Type | Properties | Behavior |
|---|---|---|
| `powershell` | `script` | Execute through the *existing* `PowerShellJS` session. Supports AD, LDAP, Graph cmdlets exposed there. |
| `graph` | `method`, `uri`, `body` | Direct local Graph emulator `GET`, `POST`, `PATCH`, `DELETE`; URI must begin `/v1.0/`; body is optional JSON. Run `Connect-MgGraph` in a preceding PowerShell step to establish the shared simulated Graph session. |
| `setVariable` | `name`, `source`, `value` | Write `variables.<name>` from a literal/JSON value or a safe dotted `path` into run state. |
| `log` | `message` | Append a trace message. `${lastStatus}` and `${variables.x}` interpolate state paths (no eval). |
| `condition` | `path`, `operator`, `value` | NoCode JS `switch` step with `branches: { "true": [], "false": [] }`; runs selected branch. |

Supported condition operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `exists`, `notExists`, `includes`.

Per-run context exposes `event`, `variables`, `last` (last Graph response body or PowerShell objects), `lastStatus` (Graph HTTP code or 200/400 for PowerShell) and `lastPowerShell` (latest PowerShell execution result). After any failure, execution halts and the trace reports the failing step; previous in-memory writes **are not rolled back**. Reset sandbox to restore fixtures.

## Limitations and security boundaries

- **No real Power Automate platform or flow import**; JSON is NoCode JS / IGAsim's own format, not Microsoft's cloud-flow package format.
- **No scheduling while the page is closed**, webhooks, real Graph authentication, email, external HTTP connector, persistent approval engine or background jobs. Only a **manual trigger** is active in v0.1; future event triggers require wiring an IGAsim event bus.
- Up to 120 steps, maximum nesting depth 8. Unsupported steps and invalid definitions fail closed. No `eval` is used.
- All writes are simulation-only in the shared PowerShell/Entra/AD in-memory instances.
- The NoCode JS **Designer** is integrated; the NoCode JS **Workflow Machine** is not bundled. `PA_CORE.js` interprets compatible definitions without XState or a build process. This is intentional for the browser-only constraint.
- NoCode JS is MIT-licensed: https://github.com/nocode-js/sequential-workflow-designer . The CDN version is pinned to `0.40.4`; consider local vendoring for an entirely offline visual editor before release.

## Browser regression suite

`test/PA_TESTS.js` covers schema validation, shared AD/Graph state, Graph CRUD mutation and reset, PowerShell actions, conditions, variables, trigger matching, path safety, failure handling and concurrent-run rejection. No new Node.js, test libraries, network or bundling steps are added to `test/index.html`.
