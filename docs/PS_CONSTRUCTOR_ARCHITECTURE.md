# PowerShellJS — Constructor-container architecture

**Baseline:** IGAsim `62478c3b1e030c203aaf0f559a0f9e77dce5ae77`
**Convention:** [`docs/CODING_CONVENTIONS.md`](CODING_CONVENTIONS.md)
**Scope:** `res/PS_*.js` browser modules and the Node-only regression tests.

## Design

The PowerShell engine uses classic browser scripts and **named constructor functions** instead of `class`, IIFEs, UMD/factory wrappers, prototype methods or CommonJS exports. Each module publishes exactly one namespace object through a top-level `var`, so the existing public interface remains stable.

```javascript
function PowerShellJSContainer()
{
    function PowerShellSimulator(options = {})
    {
        this.execute = async function(source)
        {
            // Existing execution logic.
        };

        this.reset = function() { this.session.reset(); this.functions.clear(); };

        // Constructor initialization happens AFTER the instance methods are assigned.
        this.session = new Session(options);
    }

    this.PowerShellSimulator = PowerShellSimulator;
}

var PowerShellJS = new PowerShellJSContainer();

var ps = new PowerShellJS.PowerShellSimulator();
ps.execute('Get-ADUser -Filter *').then(console.log);
```

This is a **structural illustration**, not a replacement for the full simulator constructor. In the implementation, `this._registerBuiltins` is similarly assigned before it is called.

## Module mapping

| File | Top-level container | Public interface kept |
|---|---|---|
| `PS_PARSER.js` | `PowerShellParserContainer()` | `PowerShellParser.parse()`, `.partition()`, `.preprocess()`, `.SyntaxErrorPS` |
| `PS_AD.js` | `PowerShellADContainer()` | `PowerShellAD.SimulatedDirectory`, `.DirectoryError`, `.seed()`, filters |
| `PS_AD_COMMANDS.js` | `PowerShellADCommandsContainer()` | `PowerShellADCommands.registerADCommands()` |
| `PS_CORE.js` | `PowerShellJSContainer()` | `PowerShellJS.PowerShellSimulator`, `.VirtualFS`, `.Session`, `.PSError`, `.parse()` |
| `PS_TERMINAL_ADAPTER.js` | `PowerShellTerminalContainer()` | `PowerShellTerminal.EngineRegistry`, `.TerminalEngineAdapter` |

Within containers, private helper functions remain local. Public methods are assigned directly to each instance as `this.method = function(...)`, including asynchronous methods with `async function(...)`. There are no prototype-method assignments.

## Classic HTML loading

The **existing script order is unchanged**:

```html
<script src="res/COM_TERM.js"></script>
<script src="res/PS_PARSER.js"></script>
<script src="res/PS_AD.js"></script>
<script src="res/PS_AD_COMMANDS.js"></script>
<script src="res/PS_CORE.js"></script>
<script src="res/PS_TERMINAL_ADAPTER.js"></script>
```

`PS_AD_COMMANDS.js` uses the already loaded `PowerShellAD` namespace. `PS_CORE.js` similarly uses `PowerShellParser`, `PowerShellAD` and `PowerShellADCommands` directly. No JSON fetch, bundler, server, Node module or external resource has been added.

## Error constructor compatibility

`PSError`, `DirectoryError` and `SyntaxErrorPS` are now plain functions that **return a native `Error` instance** carrying the original `.name`, `.message`, `.stack`, `.code` and, when relevant, `.line`/`.column` properties. This retains ordinary `instanceof Error` behavior without `extends Error` or prototype chains. One distinction: `error instanceof PSError` is no longer true (likewise for the other two custom error constructors). The current engine uses error properties rather than that test.

## Node-only regression tests

The engine is browser-first and does not have `module.exports`. The Node regression tests now load the same classic scripts using `node:vm`; they do not require the engine files as CommonJS modules.

```bash
node res/PS_TESTS.js
node res/PS_TESTS_v01.js
```

Expected: **50** v0.2 tests and **18** v0.1 tests. The additional v0.2 tests exercise the constructor layout, module loading in a browser-like context, independent instances, native error behavior, and the terminal adapter.

The legacy `PS_AD.js` simulated directory remains separate from `res/ActiveDirectory.js` and its `LDAP()` method. Consolidating those directories is a future integration task, **not part of this syntax-and-container refactor**.

## Trade-off

A direct `this.method = function(...)` declaration allocates a method for each instance rather than sharing it through the prototype. This is intentional, matching the IGAsim coding convention. The simulator uses small, in-memory objects; if scale becomes material, benchmark before changing the convention.
