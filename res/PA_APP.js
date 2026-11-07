/* PowerAutomateJS — optional NoCode JS workflow designer and JSON editor.
 * Browser-first constructor, with UI state and handlers owned by this instance.
 * NoCode JS's upstream UMD library is loaded on demand; this adapter uses no wrapper.
 */
function PowerAutomateApp(powerShellApp)
{
    'use strict';

    const api = PowerAutomateJS;
    const CDN = 'https://cdn.jsdelivr.net/npm/sequential-workflow-designer@0.40.4';
    const json = document.getElementById('pa-json');
    const status = document.getElementById('pa-status');
    const output = document.getElementById('pa-output');
    const visual = document.getElementById('pa-visual');
    const container = document.getElementById('pa-designer');
    const runButton = document.getElementById('pa-run');
    let definition = api.sampleDefinition();
    let designer = null;
    let loading = false;
    let executing = false;

    this.engine = new api.WorkflowEngine({ powershell: powerShellApp.adapter.engine });
    const engine = this.engine;

    function element(id) { return document.getElementById(id); }
    function message(value) { status.textContent = value; }
    function renderJSON() { json.value = JSON.stringify(definition, null, 2); }

    function setDefinition(candidate)
    {
        api.assertValid(candidate);
        // The designer mutates its model; keep an independent JSON copy.
        definition = JSON.parse(JSON.stringify(candidate));
        renderJSON();
        if (designer)
        {
            createDesigner();
        }
        message('Definition validated.');
    }

    function step(id, type, name, properties)
    {
        return { id, componentType: 'task', type, name, properties: properties || {} };
    }

    function toolboxGroups()
    {
        return [
            {
                name: 'Identity actions',
                steps: [
                    step(null, 'powershell', 'Run PowerShell', {
                        script: 'Get-ADUser -Filter *'
                    }),
                    step(null, 'graph', 'Graph GET', {
                        method: 'GET', uri: '/v1.0/users', body: ''
                    }),
                    step(null, 'graph', 'Graph POST', {
                        method: 'POST',
                        uri: '/v1.0/identityGovernance/entitlementManagement/catalogs',
                        body: '{"displayName":"New catalog"}'
                    })
                ]
            },
            {
                name: 'Flow control',
                steps: [
                    step(null, 'setVariable', 'Set variable', {
                        name: 'result', source: 'literal', value: 'example'
                    }),
                    step(null, 'log', 'Log', { message: 'Workflow step complete' }),
                    {
                        id: null,
                        componentType: 'switch',
                        type: 'condition',
                        name: 'Condition',
                        properties: { path: 'lastStatus', operator: 'eq', value: '200' },
                        branches: { true: [], false: [] }
                    }
                ]
            }
        ];
    }

    function editorInput(box, label, value, multiline, onChange, readonly)
    {
        const heading = document.createElement('label');
        heading.textContent = label;
        const input = document.createElement(multiline ? 'textarea' : 'input');
        if (!multiline)
        {
            input.type = 'text';
        }
        input.value = value == null ? '' : String(value);
        input.disabled = Boolean(readonly);
        input.addEventListener('input', () => onChange(input.value));
        box.append(heading, input);
    }

    function editorSelect(box, label, value, choices, onChange, readonly)
    {
        const heading = document.createElement('label');
        heading.textContent = label;
        const select = document.createElement('select');
        choices.forEach(key =>
        {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key;
            select.appendChild(option);
        });
        select.value = value || choices[0];
        select.disabled = Boolean(readonly);
        select.addEventListener('change', () => onChange(select.value));
        box.append(heading, select);
    }

    function editStep(current, context, unusedDefinition, readonly)
    {
        const box = document.createElement('div');
        function update(key, value)
        {
            current.properties[key] = value;
            context.notifyPropertiesChanged();
        }

        editorInput(box, 'Step name', current.name, false, value =>
        {
            current.name = value;
            context.notifyNameChanged();
        }, readonly);

        if (current.type === 'trigger')
        {
            const note = document.createElement('p');
            note.textContent = 'Manual trigger (fixed in v0.1).';
            box.appendChild(note);
        }
        else if (current.type === 'powershell')
        {
            editorInput(box, 'PowerShell script (simulated)', current.properties.script, true,
                value => update('script', value), readonly);
        }
        else if (current.type === 'graph')
        {
            editorSelect(box, 'Method', current.properties.method,
                ['GET','POST','PATCH','DELETE'], value => update('method', value), readonly);
            editorInput(box, 'Graph URI (local /v1.0/...)', current.properties.uri, false,
                value => update('uri', value), readonly);
            editorInput(box, 'JSON body (POST/PATCH)', current.properties.body, true,
                value => update('body', value), readonly);
        }
        else if (current.type === 'setVariable')
        {
            editorInput(box, 'Variable name', current.properties.name, false,
                value => update('name', value), readonly);
            editorSelect(box, 'Value source', current.properties.source || 'literal',
                ['literal','path'], value => update('source', value), readonly);
            editorInput(box, 'Value or state path', current.properties.value, true,
                value => update('value', value), readonly);
        }
        else if (current.type === 'condition')
        {
            editorInput(box, 'State path (e.g. lastStatus)', current.properties.path, false,
                value => update('path', value), readonly);
            editorSelect(box, 'Operator', current.properties.operator,
                ['eq','ne','gt','gte','lt','lte','exists','notExists','includes'],
                value => update('operator', value), readonly);
            editorInput(box, 'Compare to', current.properties.value, false,
                value => update('value', value), readonly);
        }
        else if (current.type === 'log')
        {
            editorInput(box, 'Message (${variables.x}, ${lastStatus})', current.properties.message,
                true, value => update('message', value), readonly);
        }
        return box;
    }

    function createDesigner()
    {
        if (typeof sequentialWorkflowDesigner === 'undefined')
        {
            return;
        }

        // Replace the previous designer canvas only after importing a different definition.
        container.replaceChildren();
        designer = sequentialWorkflowDesigner.Designer.create(container,
            JSON.parse(JSON.stringify(definition)), {
                theme: 'light',
                undoStackSize: 20,
                toolbox: { groups: toolboxGroups() },
                steps: {
                    isDeletable: item => item.type !== 'trigger',
                    isDraggable: item => item.type !== 'trigger',
                    isDuplicable: item => item.type !== 'trigger',
                    iconUrlProvider: () =>
                        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Ccircle cx="12" cy="12" r="9" fill="%232a678b"/%3E%3Cpath d="M8 12h8M12 8v8" stroke="white" stroke-width="2"/%3E%3C/svg%3E'
                },
                validator: {
                    root: document =>
                    {
                        try
                        {
                            api.assertValid(document);
                            return true;
                        }
                        catch (_)
                        {
                            return false;
                        }
                    }
                },
                editors: {
                    rootEditorProvider: () =>
                    {
                        const text = document.createElement('p');
                        text.textContent = 'Select a workflow step to configure it.';
                        return text;
                    },
                    stepEditorProvider: editStep
                },
                controlBar: true,
                contextMenu: true
            });
        designer.onDefinitionChanged.subscribe(() =>
        {
            definition = designer.getDefinition();
            renderJSON();
            try
            {
                api.assertValid(definition);
                message('Visual definition valid.');
            }
            catch (error)
            {
                message('Fix workflow: ' + error.message);
            }
        });
    }

    function loadRemoteScript(url)
    {
        return new Promise((resolve, reject) =>
        {
            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error('NoCode JS CDN unavailable; use the offline JSON editor.'));
            document.head.appendChild(script);
        });
    }

    function addStylesheet(url)
    {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        document.head.appendChild(link);
    }

    async function enableVisual()
    {
        if (loading)
        {
            return;
        }
        try
        {
            api.assertValid(JSON.parse(json.value));
            definition = JSON.parse(json.value);
        }
        catch (error)
        {
            message('Apply valid JSON before opening visual designer: ' + error.message);
            return;
        }
        if (designer)
        {
            visual.classList.toggle('active');
            return;
        }
        loading = true;
        message('Loading optional NoCode JS visual designer (internet needed)...');
        try
        {
            if (typeof sequentialWorkflowDesigner === 'undefined')
            {
                addStylesheet(CDN + '/css/designer.css');
                addStylesheet(CDN + '/css/designer-light.css');
                await loadRemoteScript(CDN + '/dist/index.umd.js');
            }
            if (typeof sequentialWorkflowDesigner === 'undefined' ||
                !sequentialWorkflowDesigner.Designer)
            {
                throw new Error('NoCode JS visual designer was not initialized.');
            }
            createDesigner();
            visual.classList.add('active');
            message('NoCode JS visual editor ready.');
        }
        catch (error)
        {
            message(error.message);
        }
        finally
        {
            loading = false;
        }
    }

    function resultLine(entry)
    {
        return '[' + entry.status + '] ' + entry.name + ' — ' + entry.detail;
    }

    async function execute()
    {
        if (executing)
        {
            return;
        }
        executing = true;
        runButton.disabled = true;
        output.textContent = '';
        try
        {
            const document = JSON.parse(json.value);
            api.assertValid(document);
            definition = document;
            message('Running workflow...');
            const result = await engine.run(document, {
                event: 'manual',
                onStep: function(entry)
                {
                    output.textContent = resultLine(entry) + '\n' + output.textContent;
                }
            });
            output.textContent += '\nResult: ' + result.status +
                (result.error ? ' — ' + result.error : '');
            message('Workflow ' + result.status + '.');
        }
        catch (error)
        {
            message('Workflow error.');
            output.textContent += '\nError: ' + error.message;
        }
        finally
        {
            executing = false;
            runButton.disabled = false;
        }
    }

    function downloadJSON()
    {
        try
        {
            const document = JSON.parse(json.value);
            api.assertValid(document);
            const blob = new Blob([JSON.stringify(document, null, 2)], {
                type: 'application/json'
            });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'IGAsim-workflow.json';
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            message('Workflow exported.');
        }
        catch (error)
        {
            message('Export failed: ' + error.message);
        }
    }

    element('pa-visual-toggle').addEventListener('click', enableVisual);
    element('pa-example').addEventListener('click', () => setDefinition(api.sampleDefinition()));
    element('pa-apply').addEventListener('click', () =>
    {
        try
        {
            setDefinition(JSON.parse(json.value));
        }
        catch (error)
        {
            message('Invalid JSON/workflow: ' + error.message);
        }
    });
    element('pa-run').addEventListener('click', execute);
    element('pa-export').addEventListener('click', downloadJSON);
    element('pa-import').addEventListener('change', async event =>
    {
        const file = event.target.files && event.target.files[0];
        if (!file)
        {
            return;
        }
        try
        {
            if (file.size > 200000)
            {
                throw new Error('File exceeds 200 KB import limit.');
            }
            setDefinition(JSON.parse(await file.text()));
        }
        catch (error)
        {
            message('Import failed: ' + error.message);
        }
        event.target.value = '';
    });

    renderJSON();
    this.getDefinition = function()
    {
        return JSON.parse(json.value);
    };
    this.setDefinition = setDefinition;
}

// A classic script provides the global application handle without an IIFE or globalThis assignment.
var PowerAutomateJSApp;
if (typeof document !== 'undefined' && document.getElementById('pa-workflows') &&
    typeof PowerAutomateJS !== 'undefined' && typeof PowerShellJSApp !== 'undefined')
{
    PowerAutomateJSApp = new PowerAutomateApp(PowerShellJSApp);
}
