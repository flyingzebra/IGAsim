/* PowerShellJS v0.2 — browser-first, dependency-free, deliberately limited PowerShell simulator.
 * No eval(), OS shell, host filesystem, remote requests or PowerShell subprocess.
 * Browser-first plain constructor containers; no CommonJS export.
 */
function PowerShellJSContainer()
{
    'use strict';
    const VERSION = '0.2.0';
    // Core is deliberately UI-independent. Browser globals are assigned by script tags;
    // Node regression tests load these browser scripts through vm.
    const ParserV2 = typeof PowerShellParser !== 'undefined' ? PowerShellParser : null;
    const AD = typeof PowerShellAD !== 'undefined' ? PowerShellAD : null;
    const ADCmds = typeof PowerShellADCommands !== 'undefined' ? PowerShellADCommands : null;
    const GraphCmds = typeof PowerShellGraphCommands !== 'undefined' ? PowerShellGraphCommands : null;
    if (typeof EntraDirectory === 'undefined' || !GraphCmds)
        throw new Error('Load ENTRA_CORE.js and PS_GRAPH_COMMANDS.js before PS_CORE.js.');
    if (!ParserV2 || !AD || !ADCmds) throw new Error('Load PS_PARSER.js, AD_CORE.js and PS_AD_COMMANDS.js before PS_CORE.js.');

    const MAX_SOURCE_LENGTH = 100000;
    const MAX_STATEMENTS = 500;
    const MAX_PIPELINE_ITEMS = 10000;
    const MAX_OUTPUT_CHARS = 500000;
    const lower = value => String(value).toLowerCase();

    function PSError(message, code = 'PSSimulationError')
    {
        const error = new Error(message);
        error.name = 'PSError';
        error.code = code;
        return error;
    }

    function isEscaped(src, pos)
    {
        let n = 0;
        while (pos - n - 1 >= 0 && src[pos - n - 1] === '`') n++;
        return n % 2 === 1;
    }

    function tokenizeArgs(src)
    {
        const tokens = [];
        let i = 0;
        while (i < src.length)
        {
            if (/\s/.test(src[i])) { i++; continue; }
            const start = i;
            if (src[i] === '"' || src[i] === "'")
            {
                const quote = src[i++];
                let val = '';
                let closed = false;
                while (i < src.length)
                {
                    const c = src[i++];
                    if (c === quote)
                    {
                        if (quote === "'" && src[i] === "'")
                        {
                            val += "'";
                            i++;
                            continue;
                        }
                        closed = true; break;
                    }
                    if (c === '`' && quote === '"' && i < src.length)
                    {
                        const next = src[i++];
                        val += ({ n: '\n', r: '\r', t: '\t', '`': '`', '"': '"', '$': '\u0000$' })[next] ?? next;
                    }
                    else val += c;
                }
                if (!closed) throw new PSError('Unterminated quoted argument.', 'ParserError');
                tokens.push({ type: 'string', value: val, quote, raw: src.slice(start, i) });
            }
            else
            {
                while (i < src.length && !/\s/.test(src[i]))
                {
                    // Script blocks can contain whitespace and are handled as a single parameter token.
                    if (src[i] === '{')
                    {
                        let depth = 0, q = null;
                        do
                        {
                            const c = src[i];
                            if (q) { if (c === q && !isEscaped(src, i)) q = null; }
                            else if (c === "'" || c === '"') q = c;
                            else if (c === '{') depth++;
                            else if (c === '}') depth--;
                            i++;
                        }
                        while (i < src.length && depth > 0);
                        if (depth) throw new PSError('Unterminated script block.', 'ParserError');
                    }
                    else i++;
                }
                tokens.push({ type: 'word', value: src.slice(start, i), raw: src.slice(start, i) });
            }
        }
        return tokens;
    }

    function resolveProp(value, path)
    {
        for (const name of path)
        {
            if (value === null || value === undefined) return undefined;
            const keys = Object.keys(Object(value));
            const match = keys.find(k => lower(k) === lower(name));
            value = match === undefined ? undefined : value[match];
        }
        return value;
    }

    function stringValue(value)
    {
        if (value === null || value === undefined) return '';
        if (typeof value === 'boolean') return value ? 'True' : 'False';
        if (typeof value === 'object') return Array.isArray(value) ? value.map(stringValue).join(' ') : '[PSCustomObject]';
        return String(value);
    }

    function interpolate(text, session)
    {
        return text.replace(/\$([A-Za-z_][\w]*)(?:\.([A-Za-z_][\w]*))?/g, (_all, name, prop) =>
        {
            const value = session.getVariable(name);
            return stringValue(prop ? resolveProp(value, [prop]) : value);
        }).replace(/\u0000\$/g, '$');
    }

    function evaluateAtom(token, session)
    {
        if (token.type === 'string') return token.quote === '"' ? interpolate(token.value, session) : token.value;
        const word = token.value;
        if (/^\$([\w]+)(\.[\w]+)*$/i.test(word))
        {
            const parts = word.slice(1).split('.');
            return resolveProp(session.getVariable(parts.shift()), parts);
        }
        if (/^-?\d+(?:\.\d+)?$/.test(word)) return Number(word);
        if (/^\$(true|false|null)$/i.test(word)) return ({ '$true': true, '$false': false, '$null': null })[lower(word)];
        return word;
    }

    /** Small expression parser: values, arithmetic and comparisons; no JS evaluation. */
    function evalExpression(source, session)
    {
        const src = source.trim();
        const tokens = [];
        let i = 0;
        const lex = /\s+|"(?:`.|[^"`])*"|'(?:''|[^'])*'|\$[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*|\d+(?:\.\d+)?|-eq\b|-ne\b|-gt\b|-ge\b|-lt\b|-le\b|-and\b|-or\b|-notlike\b|-like\b|-not\b|[()+*\/,\-]|[^\s()+*\/,\-]+/iy;
        while (i < src.length)
        {
            lex.lastIndex = i;
            const match = lex.exec(src);
            if (!match) throw new PSError('Invalid expression near: ' + src.slice(i), 'ParserError');
            i = lex.lastIndex;
            if (!/^\s+$/.test(match[0])) tokens.push(match[0]);
        }
        let cursor = 0;
        const precedence = { '-or': 1, '-and': 2, '-eq': 3, '-ne': 3, '-gt': 3, '-ge': 3, '-lt': 3, '-le': 3, '-like': 3, '-notlike': 3, '+': 4, '-': 4, '*': 5, '/': 5 };
        const peek = () => tokens[cursor];
        const next = () => tokens[cursor++];
        function primary()
        {
            const word = next();
            if (word === undefined) throw new PSError('Incomplete expression.', 'ParserError');
            if (word === '-') return -Number(parseExpr(6));
            if (lower(word) === '-not') return !parseExpr(6);
            if (word === '(')
            {
                const value = parseExpr(0);
                if (next() !== ')') throw new PSError('Expected closing parenthesis.', 'ParserError');
                return value;
            }
            if (word.startsWith('"') || word.startsWith("'"))
            {
                const token = tokenizeArgs(word)[0];
                return evaluateAtom(token, session);
            }
            if (/^\$[\w]+(?:\.[\w]+)*$/i.test(word)) return evaluateAtom({ type: 'word', value: word }, session);
            if (/^\d+(?:\.\d+)?$/.test(word)) return Number(word);
            throw new PSError('Unsupported expression token: ' + word, 'NotSupported');
        }
        function parseExpr(min)
        {
            let lhs = primary();
            while (peek() !== undefined && precedence[lower(peek())] >= min)
            {
                const op = lower(next()), rhs = parseExpr(precedence[op] + 1);
                switch (op)
                {
                    case '+': lhs = typeof lhs === 'string' || typeof rhs === 'string' ? stringValue(lhs) + stringValue(rhs) : Number(lhs) + Number(rhs); break;
                    case '-': lhs = Number(lhs) - Number(rhs); break;
                    case '*': lhs = Number(lhs) * Number(rhs); break;
                    case '/': if (Number(rhs) === 0) throw new PSError('Division by zero.', 'DivideByZero'); lhs = Number(lhs) / Number(rhs); break;
                    case '-eq': lhs = compare(lhs, rhs) === 0; break;
                    case '-ne': lhs = compare(lhs, rhs) !== 0; break;
                    case '-gt': lhs = compare(lhs, rhs) > 0; break;
                    case '-ge': lhs = compare(lhs, rhs) >= 0; break;
                    case '-lt': lhs = compare(lhs, rhs) < 0; break;
                    case '-le': lhs = compare(lhs, rhs) <= 0; break;
                    case '-like': lhs = wildcardMatch(stringValue(lhs), stringValue(rhs)); break;
                    case '-notlike': lhs = !wildcardMatch(stringValue(lhs), stringValue(rhs)); break;
                    case '-and': lhs = !!lhs && !!rhs; break;
                    case '-or': lhs = !!lhs || !!rhs; break;
                }
            }
            return lhs;
        }
        if (!tokens.length) return null;
        const value = parseExpr(0);
        if (cursor !== tokens.length) throw new PSError('Unexpected token in expression: ' + peek(), 'ParserError');
        return value;
    }

    function wildcardMatch(text, pattern)
    {
        const escaped = pattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
        return new RegExp('^' + escaped + '$', 'i').test(text);
    }

    function compare(a, b)
    {
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        return stringValue(a).localeCompare(stringValue(b), undefined, { sensitivity: 'accent' });
    }

    function parse(source) { return ParserV2.parse(source); }

    function VirtualFS()
    {
        this.reset = function()
        {
            this.items = new Map();
            this.cwd = 'C:\\Users\\Demo';
            ['C:\\','C:\\Users','C:\\Users\\Demo','C:\\Temp','C:\\Windows','C:\\Windows\\System32'].forEach(path => this.putDir(path));
            this.write('C:\\Users\\Demo\\README.txt', 'PowerShellJS v0.2\nThis is a simulated filesystem.\n');
            this.write('C:\\Temp\\example.txt', 'Hello from your browser-only PowerShell!\n');
            this.write('C:\\Windows\\version.txt', 'Simulated Windows Environment v0.1\n');
        };

        this.normalize = function(path)
        {
            if (path === undefined || path === null || String(path).trim() === '') return this.cwd;
            const raw = String(path).replace(/\//g, '\\');
            const full = /^[A-Za-z]:\\/.test(raw) ? raw : raw.startsWith('\\') ? 'C:' + raw : this.cwd + '\\' + raw;
            const drive = full.slice(0, 2).toUpperCase();
            if (drive !== 'C:') throw new PSError('Drive does not exist: ' + drive, 'DriveNotFound');
            const parts = [];
            for (const part of full.slice(2).split('\\'))
            {
                if (!part || part === '.') continue;
                if (part === '..') { parts.pop(); continue; }
                parts.push(part);
            }
            return drive + '\\' + parts.join('\\');
        };

        this.key = function(path) { return lower(this.normalize(path)); };

        this.parent = function(path)
        {
            const normalized = this.normalize(path);
            if (normalized === 'C:\\') return null;
            const pos = normalized.lastIndexOf('\\');
            return pos === 2 ? 'C:\\' : normalized.slice(0, pos);
        };

        this.get = function(path) { return this.items.get(this.key(path)); };

        this.require = function(path)
        {
            const item = this.get(path);
            if (!item) throw new PSError('Cannot find path: ' + this.normalize(path), 'PathNotFound');
            return item;
        };

        this.putDir = function(path)
        {
            const full = this.normalize(path);
            const parent = this.parent(full);
            if (parent && (!this.get(parent) || !this.get(parent).isDirectory)) throw new PSError('Parent directory does not exist: ' + parent, 'PathNotFound');
            if (this.get(full)) throw new PSError('Item already exists: ' + full, 'ItemExists');
            this.items.set(lower(full), { path: full, isDirectory: true, content: null });
        };

        this.write = function(path, content, append = false)
        {
            const full = this.normalize(path);
            const parent = this.parent(full);
            if (!parent || !this.get(parent) || !this.get(parent).isDirectory) throw new PSError('Parent directory does not exist: ' + parent, 'PathNotFound');
            const existing = this.get(full);
            if (existing && existing.isDirectory) throw new PSError('Cannot write to directory: ' + full, 'InvalidOperation');
            this.items.set(lower(full), { path: existing ? existing.path : full, isDirectory: false, content: (append && existing ? existing.content : '') + String(content) });
        };

        this.remove = function(path)
        {
            const full = this.normalize(path);
            if (full === 'C:\\') throw new PSError('Cannot remove drive root.', 'InvalidOperation');
            const item = this.require(full);
            if (item.isDirectory && this.children(full).length) throw new PSError('Directory is not empty: ' + full, 'DirectoryNotEmpty');
            this.items.delete(lower(full));
        };

        this.children = function(path)
        {
            const dir = this.require(path);
            if (!dir.isDirectory) throw new PSError('Not a directory: ' + dir.path, 'NotDirectory');
            return [...this.items.values()].filter(item => lower(this.parent(item.path) || '') === lower(dir.path))
                .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.path.localeCompare(b.path));
        };

        this.toObject = function(item)
        {
            return { Mode: item.isDirectory ? 'd----' : '-a---', Name: item.path.split('\\').pop() || 'C:\\', Length: item.isDirectory ? null : item.content.length, FullName: item.path, PSIsContainer: item.isDirectory };
        };

        this.setLocation = function(path)
        {
            const item = this.require(path);
            if (!item.isDirectory) throw new PSError('Location is not a directory: ' + item.path, 'NotDirectory');
            this.cwd = item.path;
        };

        this.snapshot = function()
        {
            return { cwd: this.cwd, items: [...this.items.values()].map(x => ({ ...x })) };
        };
        this.reset();
    }

    function Session(options = {})
    {
        this.getVariable = function(name)
        {
            const key = lower(name);
            if (key === 'pwd') return this.fs.cwd;
            if (key === 'home') return 'C:\\Users\\Demo';
            if (key === 'true') return true;
            if (key === 'false') return false;
            if (key === 'null') return null;
            if (key === 'error') return undefined;
            return this.variables.get(key);
        };

        this.setVariable = function(name, value)
        {
            const key = lower(name);
            if (['pwd','home','true','false','null'].includes(key)) throw new PSError('Variable is read-only: $' + name, 'VariableIsReadOnly');
            this.variables.set(key, value);
        };

        this.reset = function()
        {
            this.fs.reset();
            this.directory.reset(this.directorySeed);
            this.entra.Reset();
            this.variables.clear();
        };

        this.snapshot = function()
        {
            return {
                cwd: this.fs.cwd,
                variables: Object.fromEntries(this.variables),
                filesystem: this.fs.snapshot(),
                directory: { base: this.directory.root, count: this.directory.all().length, entries: this.directory.snapshot() },
                entra: {
                    tenantId: this.entra.DB.tenantId,
                    connected: this.entra.Session.connected,
                    scopes: this.entra.Session.scopes.slice(),
                    users: this.entra.DB.users.length,
                    groups: this.entra.DB.groups.length
                }
            };
        };
        this.fs = new VirtualFS();
        this.directorySeed = options.directoryEntries || null;
        this.directory = new AD.SimulatedDirectory(this.directorySeed);
        this.entra = new EntraDirectory(options.entraSeed, { requireAuth: true });
        this.variables = new Map();
    }

    function parseInvocation(source, session)
    {
        const tokens = tokenizeArgs(source);
        if (!tokens.length) throw new PSError('Missing command.', 'ParserError');
        const command = lower(tokens.shift().value);
        const positionals = [];
        const parameters = new Map();
        const knownSwitches = new Set(['force','recurse','passthru','noenumerate','descending']);
        for (let i = 0; i < tokens.length; i++)
        {
            const t = tokens[i];
            if (t.type === 'word' && /^-[A-Za-z][\w-]*(?::.*)?$/.test(t.value))
            {
                const m = /^-([A-Za-z][\w-]*)(?::(.*))?$/.exec(t.value);
                const key = lower(m[1]);
                let val = m[2] !== undefined ? m[2] : true;
                if (m[2] === undefined && !knownSwitches.has(key) && tokens[i + 1] && !(/^-[A-Za-z]/.test(tokens[i + 1].value) && tokens[i + 1].type === 'word'))
                {
                    val = evaluateAtom(tokens[++i], session);
                }
                parameters.set(key, val);
            }
            else positionals.push(evaluateAtom(t, session));
        }
        return { command, positionals, parameters, has: key => parameters.has(lower(key)), get: (key, fallback) => parameters.has(lower(key)) ? parameters.get(lower(key)) : fallback };
    }

    function getArg(args, key, index = 0, fallback)
    {
        return args.has(key) ? args.get(key) : (args.positionals[index] !== undefined ? args.positionals[index] : fallback);
    }
    function strList(value)
    {
        return Array.isArray(value) ? value : String(value ?? '').split(',').map(s => s.trim()).filter(Boolean);
    }
    function result(values = [], messages = [], effects = [])
    {
        return { values, messages, effects };
    }
    function itemText(value)
    {
        return value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value, null, 2) : stringValue(value);
    }

    function PowerShellSimulator(options = {})
    {
        this.registerCommand = function(command)
        {
            if (!command || typeof command.name !== 'string' || typeof command.run !== 'function') throw new TypeError('Command requires {name,run}.');
            const name = lower(command.name);
            this.commands.set(name, { ...command, name: command.name });
            for (const alias of (command.aliases || [])) this.aliases.set(lower(alias), name);
        };

        this.listCommands = function()
        {
            return [...this.commands.values()].map(({ name, aliases = [], description = '' }) => ({ Name: name, Aliases: aliases.join(', '), Description: description })).sort((a, b) => a.Name.localeCompare(b.Name));
        };

        this.reset = function() { this.session.reset(); this.functions.clear(); };

        this.getPrompt = function() { return 'PS ' + this.session.fs.cwd + '> '; };

        this.parse = function(source) { return parse(source); };

        this.getSession = function() { return this.session.snapshot(); };

        this.execute = async function(source)
        {
            const output = [], errors = [], effects = [];
            let printed = 0, operations = 0, lastObjects = [];
            const pushOutput = line =>
            {
                const str = String(line); printed += str.length;
                if (printed > MAX_OUTPUT_CHARS) throw new PSError('Output limit exceeded.', 'ResourceLimit');
                output.push(str);
            };
            let ast;
            try { ast = this.parse(source); } catch (err)
            {
                return { success: false, output, errors: [`${err.code || 'ParserError'}: ${err.message}${err.line ? ', line ' + err.line : ''}`], effects, cwd: this.session.fs.cwd, objects: [] };
            }
            const runNodes = async (nodes, emit = true, depth = 0) =>
            {
                if (depth > 16) throw new PSError('Maximum execution depth exceeded.', 'ResourceLimit');
                let last = [];
                for (const node of nodes)
                {
                    if (++operations > 3000) throw new PSError('Execution operation limit exceeded.', 'ResourceLimit');
                    try
                    {
                        if (node.kind === 'assignment')
                        {
                            const expr = node.expression.trim(); let value;
                            // In PowerShell, assigning a command's pipeline output captures objects.
                            const isCommand = /^[A-Za-z][\w-]*(?:\s|$)/.test(expr) && !/^(true|false|null)$/i.test(expr);
                            if (isCommand)
                            {
                                const pieces = ParserV2.partition(expr, ['|']);
                                value = await runPipeline(pieces.map(x => ({ source: x.text })), depth);
                                value = value.length === 1 ? value[0] : value;
                            }
                            else value = evalExpression(expr, this.session);
                            this.session.setVariable(node.name, value); last = [];
                        }
                        else if (node.kind === 'function')
                        {
                            this.functions.set(lower(node.name), node); last = [];
                        }
                        else if (node.kind === 'if')
                        {
                            const flag = evalExpression(node.condition, this.session);
                            last = await runNodes(flag ? node.then : node.else, emit, depth + 1);
                        }
                        else if (node.kind === 'foreach')
                        {
                            let collection;
                            const expr = node.collection.trim();
                            if (/^[A-Za-z][\w-]*\s/.test(expr)) collection = await runPipeline(ParserV2.partition(expr, ['|']).map(x => ({ source: x.text })), depth);
                            else collection = evalExpression(expr, this.session);
                            if (collection == null) collection = [];
                            if (!Array.isArray(collection)) collection = [collection];
                            if (collection.length > 500) throw new PSError('Foreach iteration limit exceeded.', 'ResourceLimit');
                            last = [];
                            for (const item of collection)
                            {
                                this.session.setVariable(node.name, item);
                                last = await runNodes(node.body, emit, depth + 1);
                            }
                        }
                        else if (node.kind === 'pipeline')
                        {
                            last = await runPipeline(node.stages, depth);
                            if (emit) for (const line of formatObjects(last)) pushOutput(line);
                        }
                        else throw new PSError('Unsupported AST node: ' + node.kind, 'EngineContractError');
                    }
                    catch (error) { error.psLine = error.psLine || node.line; throw error; }
                }
                return last;
            };
            const runPipeline = async (stages, depth = 0) =>
            {
                let stream = [];
                for (const stage of stages)
                {
                    const trimmed = stage.source.trim();
                    if (/^\$[A-Za-z_][\w]*(?:\.[\w]+)*$/.test(trimmed) || /^(?:-?\d+(?:\.\d+)?|\(.+\)|\$true|\$false)$/i.test(trimmed))
                    {
                        const value = evalExpression(trimmed, this.session); stream = Array.isArray(value) ? value : [value]; continue;
                    }
                    const args = parseInvocation(trimmed, this.session);
                    const commandName = this.aliases.get(args.command) || args.command;
                    if (this.functions.has(commandName))
                    {
                        const fn = this.functions.get(commandName), saved = [];
                        for (let i = 0; i < fn.params.length; i++)
                        {
                            const key = lower(fn.params[i]); saved.push({ key, has: this.session.variables.has(key), value: this.session.variables.get(key) });
                            this.session.variables.set(key, args.positionals[i] ?? null);
                        }
                        try { stream = await runNodes(fn.body, false, depth + 1); }
                        finally
                        {
                            for (const v of saved)
                            {
                                if (v.has) this.session.variables.set(v.key, v.value); else this.session.variables.delete(v.key);
                            }
                        }
                        continue;
                    }
                    const command = this.commands.get(commandName);
                    if (!command) throw new PSError(`The term '${args.command}' is not recognized as a simulated cmdlet. Try Get-Command.`, 'CommandNotFound');
                    const step = await command.run({ args, input: stream, session: this.session, fs: this.session.fs, engine: this });
                    if (!step || !Array.isArray(step.values)) throw new PSError(`Invalid result from '${command.name}'.`, 'EngineContractError');
                    stream = step.values;
                    if (stream.length > MAX_PIPELINE_ITEMS) throw new PSError('Pipeline item limit exceeded.', 'ResourceLimit');
                    for (const message of step.messages || []) pushOutput(itemText(message));
                    effects.push(...(step.effects || []));
                }
                return stream;
            };
            try { lastObjects = await runNodes(ast); }
            catch (err)
            {
                errors.push(`Line ${err.psLine || 1} [${err.code || 'RuntimeError'}]: ${err.message}`);
                lastObjects = [];
            }
            return { success: errors.length === 0, output, errors, effects, cwd: this.session.fs.cwd, objects: lastObjects };
        };

        this._registerBuiltins = function()
        {
            const reg = (name, aliases, description, run) => this.registerCommand({ name, aliases, description, run });
            reg('Write-Output', ['echo','write'], 'Send objects to the output pipeline.', async ({ args, input }) =>
            {
                return result(args.positionals.length ? args.positionals.flat() : input);
            });
            reg('Write-Host', [], 'Write formatted text to the host, not the pipeline.', async ({ args, input }) => result([], [args.positionals.length ? args.positionals.map(stringValue).join(' ') : input.map(stringValue).join(' ')]));
            reg('Get-Location', ['pwd','gl'], 'Display the virtual working directory.', async ({ fs }) => result([{ Path: fs.cwd }]));
            reg('Set-Location', ['cd','sl','chdir'], 'Change the virtual working directory.', async ({ args, fs }) =>
            {
                fs.setLocation(getArg(args, 'path', 0, 'C:\\Users\\Demo'));
                return result();
            });
            reg('Get-ChildItem', ['ls','dir','gci'], 'List items in the virtual filesystem.', async ({ args, fs }) =>
            {
                const path = getArg(args, 'path', 0, fs.cwd);
                const item = fs.require(path);
                const items = item.isDirectory ? fs.children(item.path) : [item];
                return result(items.map(x => args.has('name') ? x.path.split('\\').pop() : fs.toObject(x)));
            });
            reg('Get-Item', ['gi'], 'Read a virtual filesystem item.', async ({ args, fs }) => result([fs.toObject(fs.require(getArg(args, 'path', 0, fs.cwd)))]));
            reg('Test-Path', [], 'Check whether a virtual path exists.', async ({ args, fs }) => result([!!fs.get(getArg(args, 'path', 0, ''))]));
            reg('Get-Content', ['cat','type','gc'], 'Read lines from a virtual file.', async ({ args, fs }) =>
            {
                const file = fs.require(getArg(args, 'path', 0, ''));
                if (file.isDirectory) throw new PSError('Cannot read directory as a file.', 'InvalidOperation');
                return result(file.content.replace(/\r\n/g, '\n').split('\n').filter((v, i, all) => i !== all.length - 1 || v !== ''));
            });
            reg('Set-Content', ['sc'], 'Write text to a virtual file.', async ({ args, input, fs }) =>
            {
                const path = getArg(args, 'path', 0, undefined);
                if (path === undefined) throw new PSError('Set-Content requires -Path.', 'MissingParameter');
                const content = args.has('value') ? args.get('value') : args.positionals.length > 1 ? args.positionals.slice(1).map(stringValue).join(' ') : input.map(stringValue).join('\n');
                fs.write(path, stringValue(content));
                return result();
            });
            reg('Add-Content', ['ac'], 'Append text to a virtual file.', async ({ args, input, fs }) =>
            {
                const path = getArg(args, 'path', 0, undefined);
                if (path === undefined) throw new PSError('Add-Content requires -Path.', 'MissingParameter');
                const content = args.has('value') ? args.get('value') : args.positionals.length > 1 ? args.positionals.slice(1).map(stringValue).join(' ') : input.map(stringValue).join('\n');
                fs.write(path, stringValue(content), true);
                return result();
            });
            reg('New-Item', ['ni'], 'Create a file or directory in virtual storage.', async ({ args, fs }) =>
            {
                const path = getArg(args, 'path', 0, undefined);
                if (path === undefined) throw new PSError('New-Item requires -Path.', 'MissingParameter');
                const kind = lower(args.get('itemtype', 'File'));
                if (kind === 'directory' || kind === 'dir') fs.putDir(path);
                else if (kind === 'file')
                {
                    if (fs.get(path)) throw new PSError('Item already exists: ' + path, 'ItemExists');
                    fs.write(path, '');
                }
                else throw new PSError('Supported ItemType: File, Directory.', 'NotSupported');
                return result([fs.toObject(fs.require(path))]);
            });
            reg('Remove-Item', ['rm','del','ri'], 'Delete an empty virtual directory or a file.', async ({ args, fs }) =>
            {
                fs.remove(getArg(args, 'path', 0, ''));
                return result();
            });
            reg('Where-Object', ['where','?'], 'Filter incoming objects using a simple comparison script block.', async ({ args, input, session }) =>
            {
                const script = String(args.positionals[0] ?? args.get('filterscript', '')).trim();
                const match = /^\{([\s\S]*)\}$/.exec(script);
                if (!match) throw new PSError('Where-Object v0.1 expects { $_.Property -eq value } (or -ne/-gt/-ge/-lt/-le).', 'NotSupported');
                const body = match[1].trim();
                if (!/^\$_\.[\w]+\s+-(eq|ne|gt|ge|lt|le)\s+/i.test(body)) throw new PSError('Unsupported Where-Object script block.', 'NotSupported');
                const key = '_', wasSet = session.variables.has(key), old = session.variables.get(key);
                try
                {
                    return result(input.filter(item =>
                    {
                        session.variables.set(key, item);
                        return !!evalExpression(body, session);
                    }));
                }
                finally
                {
                    if (wasSet) session.variables.set(key, old); else session.variables.delete(key);
                }
            });
            reg('Select-Object', ['select'], 'Choose properties from incoming pipeline objects.', async ({ args, input }) =>
            {
                const selected = strList(args.get('property', args.positionals.join(' ')));
                if (!selected.length) throw new PSError('Select-Object requires property names.', 'MissingParameter');
                return result(input.map(item =>
                {
                    const out = {};
                    for (const field of selected) out[field] = resolveProp(item, [field]);
                    return out;
                }));
            });
            reg('Sort-Object', ['sort'], 'Sort incoming objects by one property.', async ({ args, input }) =>
            {
                const key = getArg(args, 'property', 0, 'Name');
                const multiplier = args.has('descending') ? -1 : 1;
                return result([...input].sort((a, b) => multiplier * compare(resolveProp(a, [key]), resolveProp(b, [key]))));
            });
            reg('Get-Variable', ['gv'], 'List session variables.', async ({ args, session }) =>
            {
                const entries = [...session.variables.entries()].map(([Name, Value]) => ({ Name, Value }));
                const name = getArg(args, 'name', 0, undefined);
                return result(name === undefined ? entries : entries.filter(v => lower(v.Name) === lower(name)));
            });
            reg('Get-Command', ['gcm'], 'List simulated commands (not system commands).', async ({ args, engine }) =>
            {
                const pattern = getArg(args, 'name', 0, '*');
                const regexp = new RegExp('^' + String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$', 'i');
                return result(engine.listCommands().filter(command => regexp.test(command.Name)));
            });
            reg('Get-Help', ['help','man'], 'Display help for a simulated command.', async ({ args, engine }) =>
            {
                const name = getArg(args, 'name', 0, undefined);
                if (!name) return result(['PowerShellJS v0.2: Get-Command lists implemented cmdlets. Use Get-Help <cmdlet>.']);
                const lookup = engine.aliases.get(lower(name)) || lower(name);
                const cmd = engine.commands.get(lookup);
                if (!cmd) throw new PSError('No simulated help exists for: ' + name, 'CommandNotFound');
                return result([`${cmd.name} — ${cmd.description}${cmd.aliases.length ? '\nAliases: ' + cmd.aliases.join(', ') : ''}`]);
            });
            reg('Clear-Host', ['cls','clear'], 'Clear the terminal output via the host adapter.', async () => result([], [], ['clear']));
        };
        this.version = VERSION;
        this.session = new Session(options);
        this.commands = new Map();
        this.aliases = new Map();
        this.functions = new Map();
        this._registerBuiltins();
        ADCmds.registerADCommands(this);
        GraphCmds.registerGraphCommands(this);
        if (Array.isArray(options.commands)) options.commands.forEach(command => this.registerCommand(command));
    }

    function formatObjects(values)
    {
        const clean = values.filter(value => value !== null && value !== undefined);
        if (!clean.length) return [];
        if (clean.every(v => v === null || typeof v !== 'object')) return clean.map(itemText);
        if (clean.length === 1 && typeof clean[0] === 'object' && Object.keys(clean[0]).length === 1) return [itemText(Object.values(clean[0])[0])];
        const objects = clean.filter(v => typeof v === 'object');
        if (objects.length !== clean.length) return clean.map(itemText);
        const fields = Object.keys(objects[0]).filter(k => !['FullName','PSIsContainer'].includes(k));
        if (!fields.length) return clean.map(itemText);
        const maxWidths = fields.map(field => Math.min(35, Math.max(field.length, ...objects.map(x => stringValue(resolveProp(x, [field])).length))));
        const fmt = obj => fields.map((field, i) => stringValue(obj[field]).slice(0, maxWidths[i]).padEnd(maxWidths[i])).join('  ').trimEnd();
        const header = fields.map((field, i) => field.padEnd(maxWidths[i])).join('  ').trimEnd();
        const rule = fields.map((field, i) => '-'.repeat(maxWidths[i])).join('  ').trimEnd();
        return [header, rule, ...objects.map(fmt)];
    }


    this.PowerShellSimulator = PowerShellSimulator;
    this.VirtualFS = VirtualFS;
    this.Session = Session;
    this.PSError = PSError;
    this.parse = parse;
    this.VERSION = VERSION;
}

var PowerShellJS = new PowerShellJSContainer();
