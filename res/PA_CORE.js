/* IGAsim PowerAutomateJS v0.1: NoCode JS-compatible JSON workflow runner.
 * Classic browser script; no Node.js, npm, eval, network, or real identity connector.
 * The visual designer is an OPTIONAL NoCode JS integration in PA_APP.js.
 */
(function (root) {
  'use strict';
  const SUPPORTED = ['trigger', 'powershell', 'graph', 'setVariable', 'log', 'condition'];
  const MAX_STEPS = 120;
  const MAX_DEPTH = 8;
  const MAX_SOURCE = 20000;
  const BAD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

  function plain(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function step(id, type, name, properties) {
    return { id, componentType: 'task', type, name, properties: properties || {} };
  }
  function sampleDefinition() {
    return {
      properties: { name: 'Hybrid identity inventory' },
      sequence: [
        step('pa-trigger-1', 'trigger', 'Manual trigger', { event: 'manual' }),
        step('pa-connect-1', 'powershell', 'Connect simulated Graph', { script: 'Connect-MgGraph -Scopes "User.Read.All"' }),
        step('pa-graph-1', 'graph', 'Query Entra users (Graph)', {
          method: 'GET', uri: '/v1.0/users?$top=1', body: ''
        }),
        {
          id: 'pa-condition-1', componentType: 'switch', type: 'condition',
          name: 'Did Graph succeed?', properties: { path: 'lastStatus', operator: 'eq', value: '200' },
          branches: {
            true: [step('pa-yes-1', 'log', 'Graph responded', { message: 'Graph status: ${lastStatus}' })],
            false: [step('pa-no-1', 'log', 'Graph failed', { message: 'Graph status: ${lastStatus}' })]
          }
        },
        step('pa-ps-1', 'powershell', 'Query AD users', {
          script: 'Get-ADUser -Filter * | Select-Object Name,SamAccountName'
        }),
        step('pa-log-1', 'log', 'Completed', { message: 'Hybrid inventory finished (simulated only).' })
      ]
    };
  }
  function assertValid(definition) {
    if (!plain(definition) || !Array.isArray(definition.sequence) || !plain(definition.properties)) {
      throw new Error('Workflow requires properties object and sequence array.');
    }
    let count = 0;
    const ids = new Set();
    function scan(sequence, depth, rootSequence) {
      if (depth > MAX_DEPTH) throw new Error('Workflow nested too deeply.');
      for (let i = 0; i < sequence.length; i++) {
        const s = sequence[i];
        if (!plain(s) || !SUPPORTED.includes(s.type) || !plain(s.properties) ||
            typeof s.id !== 'string' || !s.id || ids.has(s.id)) {
          throw new Error('Unknown step, malformed properties or duplicate step ID.');
        }
        ids.add(s.id);
        if (++count > MAX_STEPS) throw new Error('Workflow exceeds 120 steps.');
        if (s.componentType !== (s.type === 'condition' ? 'switch' : 'task')) {
          throw new Error('Invalid componentType for ' + s.type);
        }
        if (s.type === 'trigger' && !(rootSequence && i === 0)) {
          throw new Error('Trigger must be the first step in the root sequence.');
        }
        if (s.type === 'condition') {
          if (!plain(s.branches) || !Array.isArray(s.branches.true) || !Array.isArray(s.branches.false) ||
              Object.keys(s.branches).some(k => k !== 'true' && k !== 'false')) {
            throw new Error('Condition requires true and false branch arrays.');
          }
          scan(s.branches.true, depth + 1, false);
          scan(s.branches.false, depth + 1, false);
        }
      }
    }
    if (!definition.sequence.length || definition.sequence[0].type !== 'trigger') {
      throw new Error('Workflow must begin with a trigger.');
    }
    scan(definition.sequence, 0, true);
    return true;
  }
  function getPath(context, path) {
    if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\.[0-9]+)*$/.test(String(path || ''))) {
      throw new Error('Invalid path: ' + path);
    }
    return String(path).split('.').reduce((current, key) => {
      if (BAD_KEYS.has(key)) throw new Error('Forbidden state path.');
      return current == null ? undefined : Object.prototype.hasOwnProperty.call(Object(current), key) ? current[key] : undefined;
    }, context);
  }
  function compare(left, operator, right) {
    if (operator === 'exists') return left !== undefined && left !== null;
    if (operator === 'notExists') return left === undefined || left === null;
    if (operator === 'eq') return String(left) === String(right);
    if (operator === 'ne') return String(left) !== String(right);
    if (operator === 'gt') return Number(left) > Number(right);
    if (operator === 'gte') return Number(left) >= Number(right);
    if (operator === 'lt') return Number(left) < Number(right);
    if (operator === 'lte') return Number(left) <= Number(right);
    if (operator === 'includes') return Array.isArray(left) ? left.some(x => String(x) === String(right)) : String(left ?? '').includes(String(right));
    throw new Error('Unsupported comparison operator: ' + operator);
  }
  function stringify(value) {
    if (value === undefined) return '(undefined)';
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  function interpolate(template, state) {
    return String(template || '').replace(/\$\{([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\.[0-9]+)*)\}/g,
      (_, path) => stringify(getPath(state, path)));
  }
  function WorkflowEngine(options) {
    options = options || {};
    if (!options.powershell || typeof options.powershell.execute !== 'function') {
      throw new Error('WorkflowEngine requires a shared PowerShellJS simulator instance.');
    }
    this.powershell = options.powershell;
    this.running = false;
  }
  WorkflowEngine.prototype.run = async function (definition, options) {
    if (this.running) throw new Error('A workflow is already running.');
    // Validate the entire definition BEFORE any simulated writes.
    assertValid(definition);
    options = options || {};
    const event = options.event || 'manual';
    const trigger = definition.sequence[0];
    if ((trigger.properties.event || 'manual') !== event) {
      throw new Error('Trigger event does not match: ' + event);
    }
    const state = { event, variables: Object.create(null), last: null, lastStatus: null, lastPowerShell: null };
    const trace = [];
    let stepsExecuted = 0;
    this.running = true;
    const self = this;
    async function visit(sequence) {
      for (const s of sequence) {
        if (++stepsExecuted > MAX_STEPS) throw new Error('Execution limit exceeded.');
        const entry = { id: s.id, type: s.type, name: s.name, status: 'running', detail: '' };
        trace.push(entry);
        if (typeof options.onStep === 'function') options.onStep(entry, state);
        try {
          const p = s.properties;
          if (s.type === 'trigger') {
            entry.detail = 'Trigger: ' + event;
          } else if (s.type === 'powershell') {
            const source = String(p.script || '');
            if (!source.trim() || source.length > MAX_SOURCE) throw new Error('PowerShell script is empty or too long.');
            const reply = await self.powershell.execute(source);
            state.lastPowerShell = reply;
            state.last = reply.objects;
            state.lastStatus = reply.success ? 200 : 400;
            if (!reply.success) throw new Error((reply.errors || []).join('; ') || 'PowerShell execution failed.');
            entry.detail = 'PowerShell: ' + (reply.output || []).length + ' output line(s)';
          } else if (s.type === 'graph') {
            const method = String(p.method || 'GET').toUpperCase();
            const uri = String(p.uri || '');
            if (!['GET','POST','PATCH','DELETE'].includes(method) || !uri.startsWith('/v1.0/')) {
              throw new Error('Graph action requires a supported method and local /v1.0/ URI.');
            }
            const bodyText = String(p.body || '').trim();
            const body = bodyText ? JSON.parse(interpolate(bodyText, state)) : undefined;
            // This is the IN-MEMORY Graph emulator, never fetch() or remote Microsoft Graph.
            const response = self.powershell.session.entra.Graph(method, uri, { body });
            state.lastStatus = response.status;
            state.last = response.body;
            if (response.status < 200 || response.status >= 300) {
              throw new Error('Graph HTTP ' + response.status + ': ' + stringify(response.body));
            }
            entry.detail = method + ' ' + uri + ' → ' + response.status;
          } else if (s.type === 'setVariable') {
            const key = String(p.name || '');
            if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(key) || BAD_KEYS.has(key)) {
              throw new Error('Unsafe or missing variable name.');
            }
            let value;
            if (p.source === 'path') value = getPath(state, String(p.value || ''));
            else {
              const raw = interpolate(p.value == null ? '' : p.value, state);
              try { value = JSON.parse(raw); } catch (_) { value = raw; }
            }
            state.variables[key] = value;
            entry.detail = key + ' = ' + stringify(value);
          } else if (s.type === 'log') {
            entry.detail = interpolate(p.message, state);
          } else if (s.type === 'condition') {
            const value = getPath(state, p.path);
            const truthy = compare(value, p.operator || 'eq', p.value == null ? '' : p.value);
            entry.detail = truthy ? 'true' : 'false';
            entry.status = 'success';
            if (typeof options.onStep === 'function') options.onStep(entry, state);
            await visit(s.branches[String(truthy)]);
            continue;
          }
          entry.status = 'success';
          if (typeof options.onStep === 'function') options.onStep(entry, state);
        } catch (error) {
          entry.status = 'failed';
          entry.detail = String(error && error.message || error);
          if (typeof options.onStep === 'function') options.onStep(entry, state);
          throw error;
        }
      }
    }
    try {
      await visit(definition.sequence);
      return { status: 'success', trace, state };
    } catch (error) {
      return { status: 'failed', trace, state, error: String(error && error.message || error) };
    } finally {
      this.running = false;
    }
  };
  root.PowerAutomateJS = Object.freeze({ version: '0.1', WorkflowEngine, assertValid, sampleDefinition, interpolate });
})(typeof globalThis !== 'undefined' ? globalThis : this);
