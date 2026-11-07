/* IGAsim PowerAutomateJS v0.1: optional NoCode JS Sequential Workflow Designer UI.
 * NoCode JS 0.40.4 UMD loads only when the user clicks "Visual designer".
 * When offline, the JSON editor and offline PA_CORE runner remain fully usable.
 */
(function () {
  'use strict';
  const psApp = globalThis.PowerShellJSApp;
  const api = globalThis.PowerAutomateJS;
  if (!psApp || !api || !document.getElementById('pa-workflows')) return;

  const $ = id => document.getElementById(id);
  const json = $('pa-json'), status = $('pa-status'), output = $('pa-output');
  const visual = $('pa-visual'), container = $('pa-designer'), runButton = $('pa-run');
  const engine = new api.WorkflowEngine({ powershell: psApp.adapter.engine });
  const CDN = 'https://cdn.jsdelivr.net/npm/sequential-workflow-designer@0.40.4';
  let definition = api.sampleDefinition();
  let designer = null;
  let loading = false;
  let executing = false;

  function message(text) { status.textContent = text; }
  function renderJSON() { json.value = JSON.stringify(definition, null, 2); }
  function setDefinition(candidate) {
    api.assertValid(candidate);
    // Clone user input; NoCode JS may mutate its own model when editing.
    definition = JSON.parse(JSON.stringify(candidate));
    renderJSON();
    if (designer) createDesigner();
    message('Definition validated.');
  }
  function step(id, type, name, properties) {
    return { id, componentType: 'task', type, name, properties: properties || {} };
  }
  function toolboxGroups() {
    return [
      { name: 'Identity actions', steps: [
        step(null, 'powershell', 'Run PowerShell', { script: 'Get-ADUser -Filter *' }),
        step(null, 'graph', 'Graph GET', { method: 'GET', uri: '/v1.0/users', body: '' }),
        step(null, 'graph', 'Graph POST', { method: 'POST', uri: '/v1.0/identityGovernance/entitlementManagement/catalogs', body: '{"displayName":"New catalog"}' })
      ] },
      { name: 'Flow control', steps: [
        step(null, 'setVariable', 'Set variable', { name: 'result', source: 'literal', value: 'example' }),
        step(null, 'log', 'Log', { message: 'Workflow step complete' }),
        { id: null, componentType: 'switch', type: 'condition', name: 'Condition',
          properties: { path: 'lastStatus', operator: 'eq', value: '200' },
          branches: { true: [], false: [] } }
      ] }
    ];
  }
  function editorInput(box, label, value, multiline, onChange, readonly) {
    const lbl = document.createElement('label');
    lbl.textContent = label;
    const input = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = 'text';
    input.value = value == null ? '' : String(value);
    input.disabled = Boolean(readonly);
    input.addEventListener('input', () => onChange(input.value));
    box.append(lbl, input);
  }
  function editorSelect(box, label, value, choices, onChange, readonly) {
    const lbl = document.createElement('label'); lbl.textContent = label;
    const select = document.createElement('select');
    choices.forEach(key => {
      const opt = document.createElement('option'); opt.value = key; opt.textContent = key;
      select.appendChild(opt);
    });
    select.value = value || choices[0]; select.disabled = Boolean(readonly);
    select.addEventListener('change', () => onChange(select.value));
    box.append(lbl, select);
  }
  function editStep(s, context, _definition, readonly) {
    const box = document.createElement('div');
    const update = (key, value) => { s.properties[key] = value; context.notifyPropertiesChanged(); };
    editorInput(box, 'Step name', s.name, false,
      value => { s.name = value; context.notifyNameChanged(); }, readonly);
    if (s.type === 'trigger') {
      const note = document.createElement('p'); note.textContent = 'Manual trigger (fixed in v0.1).'; box.appendChild(note);
    } else if (s.type === 'powershell') {
      editorInput(box, 'PowerShell script (simulated)', s.properties.script, true, value => update('script', value), readonly);
    } else if (s.type === 'graph') {
      editorSelect(box, 'Method', s.properties.method, ['GET','POST','PATCH','DELETE'], value => update('method',value), readonly);
      editorInput(box, 'Graph URI (local /v1.0/...)', s.properties.uri, false, value => update('uri', value), readonly);
      editorInput(box, 'JSON body (POST/PATCH)', s.properties.body, true, value => update('body',value), readonly);
    } else if (s.type === 'setVariable') {
      editorInput(box, 'Variable name', s.properties.name, false, value => update('name',value), readonly);
      editorSelect(box, 'Value source', s.properties.source || 'literal', ['literal','path'], value => update('source',value), readonly);
      editorInput(box, 'Value or state path', s.properties.value, true, value => update('value',value), readonly);
    } else if (s.type === 'condition') {
      editorInput(box, 'State path (e.g. lastStatus)', s.properties.path, false, value => update('path',value), readonly);
      editorSelect(box, 'Operator', s.properties.operator, ['eq','ne','gt','gte','lt','lte','exists','notExists','includes'], value => update('operator',value), readonly);
      editorInput(box, 'Compare to', s.properties.value, false, value => update('value',value), readonly);
    } else if (s.type === 'log') {
      editorInput(box, 'Message (${variables.x}, ${lastStatus})', s.properties.message, true, value => update('message',value), readonly);
    }
    return box;
  }
  function createDesigner() {
    if (!globalThis.sequentialWorkflowDesigner) return;
    // Drop the old canvas and attach a new one only when importing a different JSON definition.
    container.replaceChildren();
    const Designer = globalThis.sequentialWorkflowDesigner.Designer;
    designer = Designer.create(container, JSON.parse(JSON.stringify(definition)), {
      theme: 'light', undoStackSize: 20,
      toolbox: { groups: toolboxGroups() },
      steps: {
        // The trigger is fixed in the sample; adding another must be prevented at validation time.
        isDeletable: s => s.type !== 'trigger',
        isDraggable: s => s.type !== 'trigger',
        isDuplicable: s => s.type !== 'trigger',
        iconUrlProvider: () => 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Ccircle cx="12" cy="12" r="9" fill="%232a678b"/%3E%3Cpath d="M8 12h8M12 8v8" stroke="white" stroke-width="2"/%3E%3C/svg%3E'
      },
      validator: {
        root: d => { try { api.assertValid(d); return true; } catch (_) { return false; } }
      },
      editors: {
        rootEditorProvider: () => { const el = document.createElement('p'); el.textContent = 'Select a workflow step to configure it.'; return el; },
        stepEditorProvider: editStep
      },
      controlBar: true, contextMenu: true
    });
    designer.onDefinitionChanged.subscribe(() => {
      definition = designer.getDefinition();
      renderJSON();
      try { api.assertValid(definition); message('Visual definition valid.'); }
      catch (error) { message('Fix workflow: ' + error.message); }
    });
  }
  function loadRemoteScript(url) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = url; el.async = true;
      el.onload = resolve;
      el.onerror = () => reject(new Error('NoCode JS CDN unavailable; use the offline JSON editor.'));
      document.head.appendChild(el);
    });
  }
  function addStylesheet(url) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = url; document.head.appendChild(link);
  }
  async function enableVisual() {
    if (loading) return;
    try { api.assertValid(JSON.parse(json.value)); definition = JSON.parse(json.value); }
    catch (error) { message('Apply valid JSON before opening visual designer: ' + error.message); return; }
    if (designer) { visual.classList.toggle('active'); return; }
    loading = true;
    message('Loading optional NoCode JS visual designer (internet needed)...');
    try {
      if (!globalThis.sequentialWorkflowDesigner) {
        addStylesheet(CDN + '/css/designer.css');
        addStylesheet(CDN + '/css/designer-light.css');
        await loadRemoteScript(CDN + '/dist/index.umd.js');
      }
      if (!globalThis.sequentialWorkflowDesigner || !globalThis.sequentialWorkflowDesigner.Designer) {
        throw new Error('NoCode JS visual designer was not initialized.');
      }
      createDesigner();
      visual.classList.add('active');
      message('NoCode JS visual editor ready.');
    } catch (error) {
      message(error.message);
    } finally { loading = false; }
  }
  async function execute() {
    if (executing) return;
    executing = true;
    runButton.disabled = true;
    output.textContent = '';
    try {
      // JSON and canvas are kept synchronized on edit. Always validate before execution.
      const doc = JSON.parse(json.value);
      api.assertValid(doc);
      definition = doc;
      message('Running workflow...');
      const result = await engine.run(doc, { event: 'manual', onStep(entry) {
        output.textContent = resultLine(entry) + '\n' + output.textContent;
      }});
      output.textContent += '\nResult: ' + result.status + (result.error ? ' — ' + result.error : '');
      message('Workflow ' + result.status + '.');
    } catch (error) {
      message('Workflow error.');
      output.textContent += '\nError: ' + error.message;
    } finally {
      executing = false;
      runButton.disabled = false;
    }
  }
  function resultLine(entry) {
    return '[' + entry.status + '] ' + entry.name + ' — ' + entry.detail;
  }
  function downloadJSON() {
    try {
      const doc = JSON.parse(json.value); api.assertValid(doc);
      const blob = new Blob([JSON.stringify(doc,null,2)], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'IGAsim-workflow.json'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message('Workflow exported.');
    } catch(error) { message('Export failed: ' + error.message); }
  }
  $('pa-visual-toggle').addEventListener('click', enableVisual);
  $('pa-example').addEventListener('click', () => setDefinition(api.sampleDefinition()));
  $('pa-apply').addEventListener('click', () => {
    try { setDefinition(JSON.parse(json.value)); }
    catch(error) { message('Invalid JSON/workflow: ' + error.message); }
  });
  $('pa-run').addEventListener('click', execute);
  $('pa-export').addEventListener('click', downloadJSON);
  $('pa-import').addEventListener('change', async event => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 200000) throw new Error('File exceeds 200 KB import limit.');
      setDefinition(JSON.parse(await file.text()));
    } catch(error) { message('Import failed: ' + error.message); }
    event.target.value = '';
  });
  renderJSON();
  globalThis.PowerAutomateJSApp = { engine, getDefinition: () => JSON.parse(json.value), setDefinition };
})();
