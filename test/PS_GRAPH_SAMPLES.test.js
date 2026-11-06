/* Browser-only Graph example regression tests, exercising the real PS_APP.js. */
'use strict';

// The real application bootstrap and browser DOM fixture are loaded by suite.html.
const browser = window;
const examples = browser.PowerShellJSApp.examples;
const sampleKeys = [...document.querySelectorAll('[data-example]')].map(x => x.dataset.example);
function element(id)
{
    return id.startsWith('button-') ? BrowserTest.appButton(id.slice(7)) : document.getElementById(id);
}
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
        // BrowserTest records each failed assertion through console.error.
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
            assert.doesNotThrow(() => browser.PowerShellJS.parse(examples[key]));
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
        assert.equal(typeof button.onclick === 'function' || button instanceof HTMLElement, true);
        button.click();
        assert.equal(element('script').value, examples[key]);
        element('run').click();
        await browser.PowerShellJSApp.adapter.queue;
        assert.equal(browser.PowerShellJSApp.adapter.engine.session.entra.Session.connected, true);
        assert.ok(browser.PowerShellJSApp.terminal.lines.length > 0);
        element('reset').click();
        await browser.PowerShellJSApp.adapter.reset();
        assert.equal(browser.PowerShellJSApp.adapter.engine.session.entra.Session.connected, false);
    });
    await test('Original AD and Graph quick examples are still accessible', async function()
    {
        assert.ok(sampleKeys.includes('adUsers'));
        assert.ok(sampleKeys.includes('graph'));
        element('button-graph').click();
        assert.match(element('script').value, /Connect-MgGraph/);
        element('button-adUsers').click();
        assert.match(element('script').value, /Get-ADUser/);
    });
    console.log('\n' + passed + ' Graph example tests passed.');
}
suite().then(() => BrowserTest.done()).catch(error => BrowserTest.crash(error));
