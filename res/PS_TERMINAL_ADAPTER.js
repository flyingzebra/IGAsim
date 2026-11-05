/* Generic host adapter; COM_TERM.js is used as supplied, without PowerShell edits. */
function PowerShellTerminalContainer()
{
    'use strict';
    function escapeMarkup(value)
    {
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function EngineRegistry()
    {
        this.register = function(name, factory)
        {
            if (!name || typeof factory !== 'function') throw new TypeError('Provide engine name and factory.');
            this.factories.set(name, factory);
        };

        this.create = function(name)
        {
            const factory = this.factories.get(name);
            if (!factory) throw new Error('Unknown simulator engine: ' + name);
            const engine = factory();
            for (const method of ['execute','getPrompt','reset'])
            {
                if (typeof engine[method] !== 'function') throw new Error(`Engine ${name} must implement ${method}().`);
            }
            return engine;
        };

        this.names = function() { return [...this.factories.keys()]; };
        this.factories = new Map();
    }
    function TerminalEngineAdapter(terminal, engine, options = {})
    {
        this.syncPrompt = function()
        {
            // Safe escaped markup; avoid changing generic COM_TERM or using global DOM selectors.
            this.terminal.pushPrompt(escapeMarkup(this.engine.getPrompt()), { separator: '', replace: true });
        };

        this.submit = function(source)
        {
            this.queue = this.queue.catch(() => { }).then(() => this.run(source));
            return this.queue;
        };

        this.run = async function(source)
        {
            this.busy = true;
            this.onStatus('Running');
            try
            {
                const reply = await this.engine.execute(String(source));
                for (const effect of reply.effects || []) if (effect === 'clear') this.terminal.clear();
                for (const line of reply.output || []) this.terminal.write(String(line) + '\n', 'rx');
                for (const error of reply.errors || []) this.terminal.write(String(error) + '\n', 'meta');
                this.syncPrompt();
                this.onStatus(reply.success ? 'Ready' : 'Error');
                return reply;
            }
            catch (error)
            {
                this.terminal.write('Engine error: ' + (error?.message || String(error)) + '\n', 'meta');
                this.onStatus('Error');
                return { success: false, output: [], errors: [String(error)], effects: [] };
            }
            finally { this.busy = false; }
        };

        this.reset = async function()
        {
            await this.queue.catch(() => { });
            this.engine.reset();
            this.terminal.clear();
            this.syncPrompt();
            this.terminal.write('Virtual session reset.\n', 'meta');
            this.onStatus('Ready');
        };

        this.switchEngine = async function(engine)
        {
            await this.queue.catch(() => { });
            this.engine = engine;
            this.terminal.clear();
            this.syncPrompt();
            this.terminal.write('Simulator engine switched.\n', 'meta');
        };
        this.terminal = terminal;
        this.engine = engine;
        this.busy = false;
        this.onStatus = options.onStatus || function() { };
        this.queue = Promise.resolve();
        this.syncPrompt();
        terminal.onInput((_command, _params, line) =>
        {
            // COM_TERM expects a synchronous Boolean; execution is queued afterwards.
            this.submit(line);
            return true;
        });
    }
    this.EngineRegistry = EngineRegistry;
    this.TerminalEngineAdapter = TerminalEngineAdapter;
}

var PowerShellTerminal = new PowerShellTerminalContainer();
