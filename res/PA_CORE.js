/* PowerAutomateJS — NoCode JS-compatible workflow runtime for fictional IGAsim data.
 * Browser classic-script constructor: no IIFE, prototype forwarding, module or network.
 * All mutable execution state belongs to an individual WorkflowEngine instance.
 */
function PowerAutomateCore()
{
    'use strict';

    const SUPPORTED = ['trigger','powershell','graph','setVariable','log','condition'];
    const MAX_STEPS = 120;
    const MAX_DEPTH = 8;
    const MAX_SOURCE = 20000;
    const BAD_KEYS = new Set(['__proto__','prototype','constructor']);

    function plain(value)
    {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function step(id, type, name, properties)
    {
        return { id, componentType: 'task', type, name, properties: properties || {} };
    }

    function sampleDefinition()
    {
        return {
            properties: { name: 'Hybrid identity inventory' },
            sequence: [
                step('pa-trigger-1', 'trigger', 'Manual trigger', { event: 'manual' }),
                step('pa-connect-1', 'powershell', 'Connect simulated Graph', {
                    script: 'Connect-MgGraph -Scopes "User.Read.All"'
                }),
                step('pa-graph-1', 'graph', 'Query Entra users (Graph)', {
                    method: 'GET', uri: '/v1.0/users?$top=1', body: ''
                }),
                {
                    id: 'pa-condition-1',
                    componentType: 'switch',
                    type: 'condition',
                    name: 'Did Graph succeed?',
                    properties: { path: 'lastStatus', operator: 'eq', value: '200' },
                    branches: {
                        true: [step('pa-yes-1', 'log', 'Graph responded', {
                            message: 'Graph status: ${lastStatus}'
                        })],
                        false: [step('pa-no-1', 'log', 'Graph failed', {
                            message: 'Graph status: ${lastStatus}'
                        })]
                    }
                },
                step('pa-ps-1', 'powershell', 'Query AD users', {
                    script: 'Get-ADUser -Filter * | Select-Object Name,SamAccountName'
                }),
                step('pa-log-1', 'log', 'Completed', {
                    message: 'Hybrid inventory finished (simulated only).'
                })
            ]
        };
    }

    function assertValid(definition)
    {
        if (!plain(definition) || !Array.isArray(definition.sequence) || !plain(definition.properties))
        {
            throw new Error('Workflow requires properties object and sequence array.');
        }

        let count = 0;
        const ids = new Set();

        function scan(sequence, depth, rootSequence)
        {
            if (depth > MAX_DEPTH)
            {
                throw new Error('Workflow nested too deeply.');
            }

            for (let i = 0; i < sequence.length; i++)
            {
                const current = sequence[i];
                if (!plain(current) || !SUPPORTED.includes(current.type) || !plain(current.properties) ||
                    typeof current.id !== 'string' || !current.id || ids.has(current.id))
                {
                    throw new Error('Unknown step, malformed properties or duplicate step ID.');
                }

                ids.add(current.id);
                if (++count > MAX_STEPS)
                {
                    throw new Error('Workflow exceeds 120 steps.');
                }
                if (current.componentType !== (current.type === 'condition' ? 'switch' : 'task'))
                {
                    throw new Error('Invalid componentType for ' + current.type);
                }
                if (current.type === 'trigger' && !(rootSequence && i === 0))
                {
                    throw new Error('Trigger must be the first step in the root sequence.');
                }
                if (current.type === 'condition')
                {
                    if (!plain(current.branches) || !Array.isArray(current.branches.true) ||
                        !Array.isArray(current.branches.false) ||
                        Object.keys(current.branches).some(key => key !== 'true' && key !== 'false'))
                    {
                        throw new Error('Condition requires true and false branch arrays.');
                    }
                    scan(current.branches.true, depth + 1, false);
                    scan(current.branches.false, depth + 1, false);
                }
            }
        }

        if (!definition.sequence.length || definition.sequence[0].type !== 'trigger')
        {
            throw new Error('Workflow must begin with a trigger.');
        }
        scan(definition.sequence, 0, true);
        return true;
    }

    function getPath(context, path)
    {
        if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\.[0-9]+)*$/.test(String(path || '')))
        {
            throw new Error('Invalid path: ' + path);
        }
        return String(path).split('.').reduce((current, key) =>
        {
            if (BAD_KEYS.has(key))
            {
                throw new Error('Forbidden state path.');
            }
            return current == null ? undefined :
                Object.prototype.hasOwnProperty.call(Object(current), key) ? current[key] : undefined;
        }, context);
    }

    function compare(left, operator, right)
    {
        switch (operator)
        {
            case 'exists': return left !== undefined && left !== null;
            case 'notExists': return left === undefined || left === null;
            case 'eq': return String(left) === String(right);
            case 'ne': return String(left) !== String(right);
            case 'gt': return Number(left) > Number(right);
            case 'gte': return Number(left) >= Number(right);
            case 'lt': return Number(left) < Number(right);
            case 'lte': return Number(left) <= Number(right);
            case 'includes':
                return Array.isArray(left) ? left.some(value => String(value) === String(right)) :
                    String(left ?? '').includes(String(right));
            default:
                throw new Error('Unsupported comparison operator: ' + operator);
        }
    }

    function stringify(value)
    {
        if (value === undefined)
        {
            return '(undefined)';
        }
        return typeof value === 'string' ? value : JSON.stringify(value);
    }

    function interpolate(template, state)
    {
        return String(template || '').replace(/\$\{([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\.[0-9]+)*)\}/g,
            (_, path) => stringify(getPath(state, path)));
    }

    this.version = '0.1';
    this.assertValid = assertValid;
    this.sampleDefinition = sampleDefinition;
    this.interpolate = interpolate;

    // Each engine owns its run lock and shares the caller's simulated identity backend.
    this.WorkflowEngine = function WorkflowEngine(options)
    {
        options = options || {};
        if (!options.powershell || typeof options.powershell.execute !== 'function')
        {
            throw new Error('WorkflowEngine requires a shared PowerShellJS simulator instance.');
        }

        this.powershell = options.powershell;
        this.running = false;

        this.run = async function(definition, options)
        {
            if (this.running)
            {
                throw new Error('A workflow is already running.');
            }
            // Validate the complete workflow before executing any simulated write.
            assertValid(definition);
            options = options || {};
            const event = options.event || 'manual';
            const trigger = definition.sequence[0];
            if ((trigger.properties.event || 'manual') !== event)
            {
                throw new Error('Trigger event does not match: ' + event);
            }

            const state = {
                event,
                variables: Object.create(null),
                last: null,
                lastStatus: null,
                lastPowerShell: null
            };
            const trace = [];
            let stepsExecuted = 0;
            const engine = this;
            this.running = true;

            async function visit(sequence)
            {
                for (const current of sequence)
                {
                    if (++stepsExecuted > MAX_STEPS)
                    {
                        throw new Error('Execution limit exceeded.');
                    }
                    const entry = {
                        id: current.id,
                        type: current.type,
                        name: current.name,
                        status: 'running',
                        detail: ''
                    };
                    trace.push(entry);
                    if (typeof options.onStep === 'function')
                    {
                        options.onStep(entry, state);
                    }

                    try
                    {
                        const properties = current.properties;
                        if (current.type === 'trigger')
                        {
                            entry.detail = 'Trigger: ' + event;
                        }
                        else if (current.type === 'powershell')
                        {
                            const source = String(properties.script || '');
                            if (!source.trim() || source.length > MAX_SOURCE)
                            {
                                throw new Error('PowerShell script is empty or too long.');
                            }
                            const reply = await engine.powershell.execute(source);
                            state.lastPowerShell = reply;
                            state.last = reply.objects;
                            state.lastStatus = reply.success ? 200 : 400;
                            if (!reply.success)
                            {
                                throw new Error((reply.errors || []).join('; ') || 'PowerShell execution failed.');
                            }
                            entry.detail = 'PowerShell: ' + (reply.output || []).length + ' output line(s)';
                        }
                        else if (current.type === 'graph')
                        {
                            const method = String(properties.method || 'GET').toUpperCase();
                            const uri = String(properties.uri || '');
                            if (!['GET','POST','PATCH','DELETE'].includes(method) || !uri.startsWith('/v1.0/'))
                            {
                                throw new Error('Graph action requires a supported method and local /v1.0/ URI.');
                            }
                            const bodyText = String(properties.body || '').trim();
                            const body = bodyText ? JSON.parse(interpolate(bodyText, state)) : undefined;
                            // Use only the in-memory Graph emulator, never remote network access or Microsoft Graph.
                            const response = engine.powershell.session.entra.Graph(method, uri, { body });
                            state.lastStatus = response.status;
                            state.last = response.body;
                            if (response.status < 200 || response.status >= 300)
                            {
                                throw new Error('Graph HTTP ' + response.status + ': ' + stringify(response.body));
                            }
                            entry.detail = method + ' ' + uri + ' → ' + response.status;
                        }
                        else if (current.type === 'setVariable')
                        {
                            const key = String(properties.name || '');
                            if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(key) || BAD_KEYS.has(key))
                            {
                                throw new Error('Unsafe or missing variable name.');
                            }
                            let value;
                            if (properties.source === 'path')
                            {
                                value = getPath(state, String(properties.value || ''));
                            }
                            else
                            {
                                const raw = interpolate(properties.value == null ? '' : properties.value, state);
                                try
                                {
                                    value = JSON.parse(raw);
                                }
                                catch (_)
                                {
                                    value = raw;
                                }
                            }
                            state.variables[key] = value;
                            entry.detail = key + ' = ' + stringify(value);
                        }
                        else if (current.type === 'log')
                        {
                            entry.detail = interpolate(properties.message, state);
                        }
                        else if (current.type === 'condition')
                        {
                            const value = getPath(state, properties.path);
                            const truthy = compare(value, properties.operator || 'eq',
                                properties.value == null ? '' : properties.value);
                            entry.detail = truthy ? 'true' : 'false';
                            entry.status = 'success';
                            if (typeof options.onStep === 'function')
                    {
                        options.onStep(entry, state);
                    }
                            await visit(current.branches[String(truthy)]);
                            continue;
                        }
                        entry.status = 'success';
                        if (typeof options.onStep === 'function')
                    {
                        options.onStep(entry, state);
                    }
                    }
                    catch (error)
                    {
                        entry.status = 'failed';
                        entry.detail = String(error && error.message || error);
                        if (typeof options.onStep === 'function')
                    {
                        options.onStep(entry, state);
                    }
                        throw error;
                    }
                }
            }

            try
            {
                await visit(definition.sequence);
                return { status: 'success', trace, state };
            }
            catch (error)
            {
                return { status: 'failed', trace, state,
                    error: String(error && error.message || error) };
            }
            finally
            {
                this.running = false;
            }
        };
    };

    Object.freeze(this);
}

// Classic script exposes this name to PA_APP.js, PA_LIBRARY.js and the Studio.
var PowerAutomateJS = new PowerAutomateCore();
