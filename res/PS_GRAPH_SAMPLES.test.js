/* Tests the actual scripts selectable in index.html, not rewritten approximations.
 * Run: node res/PS_GRAPH_SAMPLES.test.js
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;
const html = fs.readFileSync(path.join(root, '..', 'index.html'), 'utf8');
const jsFiles = ['PS_PARSER.js','AD_CORE.js','PS_AD_COMMANDS.js',
    'ENTRA_CORE.js','PS_GRAPH_COMMANDS.js','PS_CORE.js','PS_TERMINAL_ADAPTER.js'];

const elements = new Map();
function element(id)
{
    if (elements.has(id)) return elements.get(id);
    const value = {
        id: id, value: '', textContent: '', dataset: {}, listeners: {},
        addEventListener(name, listener) { this.listeners[name] = listener; },
        focus() {}, select() {}, setRangeText() {}
    };
    elements.set(id, value);
    return value;
}
const sampleKeys = [...html.matchAll(/<button\b[^>]*\bdata-example="([^"]+)"/g)].map(m => m[1]);
const buttons = sampleKeys.map(function(key)
{
    const button = element('button-' + key);
    button.dataset.example = key;
    return button;
});
const document = {
    getElementById: element,
    querySelectorAll(selector) { return selector === '[data-example]' ? buttons : []; }
};
function TERMINAL()
{
    this.lines = [];
    this.onInput = function(callback) { this.callback = callback; };
    this.pushPrompt = function() {};
    this.write = function(message) { this.lines.push(message); };
    this.clear = function() { this.lines = []; };
}
const browser = vm.createContext({ console, document, TERMINAL, TextEncoder, TextDecoder });
for (const file of jsFiles)
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), browser, { filename: file });
const inlineMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/i);
assert.ok(inlineMatch, 'index.html must have a classic inline initialization script');
new vm.Script(inlineMatch[1], { filename: 'index.html' });
vm.runInContext(inlineMatch[1], browser, { filename: 'index.html' });

const examples = browser.PowerShellJSApp.examples;
const readOnly = [
    'graphTenant','graphITUsers','graphPaging','graphMembership','graphRoles',
    'graphApplications','graphRequest','graphHybrid'
];
const mutating = [
    'graphEnable','graphNewUser','graphNewGroup','graphMembershipEdit',
    'graphPatch','graphAppRegistration'
];
const all = readOnly.concat(mutating);
let passed = 0;
async function test(name, fn)
{
    try
    {
        await fn();
        console.log('PASS ' + name);
        passed++;
    }
    catch (error)
    {
        console.error('FAIL ' + name + ': ' + (error.stack || error));
        process.exitCode = 1;
    }
}
async function suite()
{
    await test('UI defines one button and a PowerShell script for each Graph scenario', async function()
    {
        assert.equal(all.length, 14);
        for (const key of all)
        {
            assert.ok(sampleKeys.includes(key), key + ' has no button');
            assert.equal(typeof examples[key], 'string');
            assert.match(examples[key], /Connect-MgGraph/);
            const file = path.join(root, '..', 'examples', 'graph', readOnly.includes(key) ? 'read' : 'write', key + '.ps1');
            assert.equal(fs.readFileSync(file, 'utf8').trimEnd(), examples[key].trimEnd(), key + ' file mismatch');
        }
    });
    for (const key of all)
    {
        await test('Example runs cleanly: ' + key, async function()
        {
            const engine = new browser.PowerShellJS.PowerShellSimulator();
            const originalEntra = JSON.stringify(engine.session.entra.DB);
            const reply = await engine.execute(examples[key]);
            assert.equal(reply.success, true, key + ': ' + reply.errors.join('; '));
            assert.equal(reply.errors.length, 0);
            assert.equal(engine.session.entra.Session.connected, true);
            assert.ok(reply.output.length, 'Expected observable output from ' + key);
            if (readOnly.includes(key))
            {
                assert.equal(JSON.stringify(engine.session.entra.DB), originalEntra,
                    'Read-only example mutated the Entra directory');
            }
            if (key === 'graphEnable')
                assert.equal(engine.session.entra.DB.users[2].accountEnabled, true);
            if (key === 'graphNewUser')
                assert.ok(engine.session.entra.DB.users.some(x => x.userPrincipalName === 'dana@northwind.example'));
            if (key === 'graphNewGroup')
                assert.ok(engine.session.entra.DB.groups.some(x => x.displayName === 'Project Sunset'));
            if (key === 'graphMembershipEdit')
                assert.equal(engine.session.entra.DB.groups[0].memberIds.length, 2);
            if (key === 'graphPatch')
                assert.equal(engine.session.entra.DB.users[0].jobTitle, 'Platform Lead');
            if (key === 'graphAppRegistration')
                assert.ok(engine.session.entra.DB.applications.some(x => x.displayName === 'Inventory Demo API'));
            engine.reset();
            assert.equal(engine.session.entra.Session.connected, false);
        });
    }
    await test('Graph library button populates the editor and Run executes the selected script', async function()
    {
        const key = 'graphMembership';
        const button = element('button-' + key);
        assert.equal(typeof button.listeners.click, 'function');
        button.listeners.click();
        assert.equal(element('script').value, examples[key]);
        await element('run').listeners.click();
        assert.equal(browser.PowerShellJSApp.adapter.engine.session.entra.Session.connected, true);
        assert.ok(browser.PowerShellJSApp.terminal.lines.length > 0);
        await element('reset').listeners.click();
        assert.equal(browser.PowerShellJSApp.adapter.engine.session.entra.Session.connected, false);
    });
    await test('Original AD and Graph quick examples are still accessible', async function()
    {
        assert.ok(sampleKeys.includes('adUsers'));
        assert.ok(sampleKeys.includes('graph'));
        element('button-graph').listeners.click();
        assert.match(element('script').value, /Connect-MgGraph/);
        element('button-adUsers').listeners.click();
        assert.match(element('script').value, /Get-ADUser/);
    });
    console.log('\n' + passed + ' Graph example tests passed.');
}
suite().catch(error => { console.error(error); process.exitCode = 1; });
