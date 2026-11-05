# PowerShellJS v0.1 — Offline Browser Simulator

A standalone PowerShell-inspired interpreter written in plain JavaScript with a simulated Windows-like `C:\` filesystem. It does **not** launch or embed Microsoft PowerShell. The user's `COM_TERM.js` and `COM_TERM.css` are included **unchanged** as a generic terminal component.

## How to run

- **One file:** open `PowerShellJS_v0.1_standalone.html` in a modern desktop browser. No install, server, internet or build step.
- **Development folder:** open `index.html` from this folder. It loads the adjacent `COM_TERM.js`, `COM_TERM.css`, `PS_CORE.js`, `PS_TERMINAL_ADAPTER.js`, and `PS_APP.css`.
- **Tests:** run `node PS_TESTS.js` in this folder. Node is needed only for tests, *not* to run the browser app.
- Use the command prompt directly, or edit a multiline script and click **Run script** (Ctrl/Cmd+Enter). History is kept by COM_TERM in localStorage when permitted; variables and simulated files reset on page refresh.

## Implemented in v0.1

- Script comments, line breaks and semicolons; variables, assignment and case-insensitive names; double-quoted `$variable` interpolation; single-quoted literals; numeric arithmetic and comparison expressions; a small command/argument parser.
- Persistent in-tab session (until reload); virtual `C:\` directory tree and files, with no access to the host computer's filesystem.
- Commands: `Write-Output`, `Write-Host`, `Get-Help`, `Get-Command`, `Clear-Host`, `Get-Location`, `Set-Location`, `Get-ChildItem`, `Get-Item`, `Test-Path`, `Get-Content`, `Set-Content`, `Add-Content`, `New-Item`, `Remove-Item`, `Get-Variable`, `Where-Object`, `Select-Object`, `Sort-Object`.
- Common aliases such as `pwd`, `cd`, `ls`, `dir`, `cat`, `type`, `echo`, `cls`, `select`, `sort`, `where`.
- Object pipelines are passed between supported commands without flattening into text. `Where-Object` supports basic `{ $_.Property -eq value }` comparisons, with `-ne`, `-gt`, `-ge`, `-lt`, `-le` as alternatives.
- Detailed command-not-found and virtual path errors. No JavaScript `eval()`.

## Deliberately not yet supported

This is a learning/demo simulator, not a compliant PowerShell interpreter. In particular: `if`, `foreach`, `function`, advanced script blocks, providers beyond the virtual filesystem, Windows registry, process execution, services, advanced parameter binding, redirection, `$()` interpolation, all cmdlets beyond the list above, complex PowerShell object semantics, and complete format/output behavior. Subset syntax sometimes differs from PowerShell, and advanced expressions fail explicitly. No real `.ps1` files are run from the host filesystem; paste their text into the editor.

A successful simulation should never be construed as validation that the same script would behave identically in a real PowerShell session.

## Example

```powershell
$name = "Ada"
$answer = (2 + 3) * 4
Write-Host "Hello, $name"
Write-Output "Result: $answer"
Get-ChildItem C:\Users\Demo | Where-Object { $_.Length -gt 10 } | Select-Object Name,Length
```

## Engine interchange contract

`PS_CORE.js` exposes `PowerShellJS.PowerShellSimulator` and related classes; it never imports or references the terminal. `PS_TERMINAL_ADAPTER.js` exposes `EngineRegistry` and `TerminalEngineAdapter`, which bridge **any** engine with:

```js
class AnAlternateEngine {
  getPrompt() { return 'PS C:\\>'; }
  reset() { /* clear simulated state */ }
  async execute(source) {
    return {
      success: true,
      output: ['plain text line'],   // safe literal text, no HTML
      errors: [],                    // diagnostic strings
      effects: [],                   // e.g. 'clear'
      cwd: 'C:\\',
      objects: []                    // raw last-pipeline objects (optional)
    };
  }
}
```

Register or replace engines without modifying COM_TERM:

```js
const registry = new PowerShellTerminal.EngineRegistry();
registry.register('my-engine', () => new AnAlternateEngine());
const adapter = new PowerShellTerminal.TerminalEngineAdapter(terminal,registry.create('my-engine'));
// Later: await adapter.switchEngine(registry.create('my-engine'));
```

Register a custom simulated cmdlet in the built-in engine:

```js
engine.registerCommand({
  name: 'Get-Greeting',
  aliases: ['greet'],
  description: 'Return a greeting',
  run: async ({args, input, session, fs, engine}) => ({
    values: ['Hello from a simulated cmdlet'],
    messages: [],
    effects: []
  })
});
```

### Design notes

- `COM_TERM.js` / `.css`: original, unmodified generic UI.
- `PS_TERMINAL_ADAPTER.js`: thin host adapter; queues submitted commands and applies terminal-only effects.
- `PS_CORE.js`: dependency-free parsing, session, virtual filesystem, cmdlet registry, evaluation and formatting.
- `PS_APP.css`, `index.html`: optional browser presentation.
- `PS_TESTS.js`: independent regression suite using Node's built-in assertions.

The adapter uses COM_TERM's public `.onInput()`, `.write()`, `.clear()`, and `.pushPrompt()` APIs. Because the supplied generic terminal dispatch contract returns a **synchronous Boolean**, the adapter queues promise-based execution and immediately returns `true` to that callback. The terminal API itself has not been refactored.

### Security boundary

All simulated file reads/writes occur in a JavaScript in-memory Map. Cmdlet outputs use `terminal.write()` (text nodes), not HTML injection. Unknown commands produce errors instead of executing OS commands. Do not load and execute untrusted extension scripts into the host page: extensions are JavaScript and have the browser page's permissions.
