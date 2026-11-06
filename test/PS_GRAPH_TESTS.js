/* PowerShellJS Graph command regression tests. Run: node test/PS_GRAPH_TESTS.js */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'res');
const files = ['PS_PARSER.js','AD_CORE.js','PS_AD_COMMANDS.js','ENTRA_CORE.js',
    'PS_GRAPH_COMMANDS.js','PS_CORE.js'];
for (const filename of files)
{
    vm.runInThisContext(fs.readFileSync(path.join(root, filename), 'utf8'), { filename: filename });
}
const U1 = 'f0000000-0000-4000-8000-000000000101';
const U2 = 'f0000000-0000-4000-8000-000000000102';
const G1 = 'f0000000-0000-4000-8000-000000000201';
const G2 = 'f0000000-0000-4000-8000-000000000202';
let passed = 0;

async function test(name, callback)
{
    try
    {
        await callback();
        console.log('PASS ' + name);
        passed++;
    }
    catch (error)
    {
        console.error('FAIL ' + name, error);
        process.exitCode = 1;
    }
}
function newEngine() { return new PowerShellJS.PowerShellSimulator(); }
async function run(ps, command)
{
    const reply = await ps.execute(command);
    assert.equal(reply.success, true, command + ': ' + reply.errors.join('; '));
    return reply.objects;
}
async function fail(ps, command, text)
{
    const reply = await ps.execute(command);
    assert.equal(reply.success, false, command + ': expected failure');
    assert.match(reply.errors.join('\n'), text);
    return reply;
}
async function connected()
{
    const ps = newEngine();
    await run(ps, 'Connect-MgGraph -Scopes "User.Read.All,Group.Read.All"');
    return ps;
}

async function suite()
{
    await test('named browser constructor container and registration API', async function()
    {
        assert.equal(typeof PowerShellGraphCommands, 'object');
        assert.equal(typeof PowerShellGraphCommands.registerGraphCommands, 'function');
        assert.equal(typeof EntraDirectory, 'function');
        const source = fs.readFileSync(path.join(root, 'PS_GRAPH_COMMANDS.js'), 'utf8');
        assert.doesNotMatch(source, /\bclass\s+|\bmodule\.exports\b|\brequire\s*\(|\bfetch\s*\(|\beval\s*\(/);
        assert.doesNotMatch(source, /\(function\s*\(root/);
    });
    await test('Graph cmdlets registered in existing PowerShellJS engine', async function()
    {
        const commands = (await run(newEngine(), 'Get-Command -Name *Mg*')).map(x => x.Name);
        for (const name of ['Connect-MgGraph','Get-MgUser','Get-MgGroup','Get-MgGroupMember',
            'Update-MgUser','New-MgUser','Invoke-MgGraphRequest']) assert.ok(commands.includes(name));
    });
    await test('Graph queries require a simulated connection', async function()
    {
        await fail(newEngine(), 'Get-MgUser -All', /InvalidAuthenticationToken.*401/);
    });
    await test('connection never contacts Graph and does not reveal tokens', async function()
    {
        const ps = await connected();
        const context = (await run(ps, 'Get-MgContext'))[0];
        assert.equal(context.Simulated, true);
        assert.equal(context.TenantId, ps.session.entra.DB.tenantId);
        assert.equal(context.Scopes.length, 2);
        assert.equal(JSON.stringify(context).includes('accessToken'), false);
    });
    await test('fake tenant is rejected and correct tenant accepted', async function()
    {
        const ps = newEngine();
        await fail(ps, 'Connect-MgGraph -TenantId not-a-tenant', /TenantNotFound/);
        assert.equal(ps.session.entra.Session.connected, false);
        await run(ps, 'Connect-MgGraph -TenantId ' + ps.session.entra.DB.tenantId);
        assert.equal(ps.session.entra.Session.connected, true);
    });
    await test('disconnect clears context and blocks further Graph operations', async function()
    {
        const ps = await connected();
        await run(ps, 'Disconnect-MgGraph');
        assert.equal((await run(ps, 'Get-MgContext')).length, 0);
        await fail(ps, 'Get-MgGroup -All', /InvalidAuthenticationToken/);
    });
    await test('Get-MgUser reads three simulated users', async function()
    {
        const ps = await connected();
        assert.equal((await run(ps, 'Get-MgUser -All')).length, 3);
    });
    await test('OData filters work and do not use LDAP grammar', async function()
    {
        const ps = await connected();
        const users = await run(ps, 'Get-MgUser -Filter "department eq \'IT\'" -Property "id,displayName,department"');
        assert.equal(users.length, 2);
        assert.equal(users[0].department, 'IT');
        assert.deepEqual(Object.keys(users[0]), ['id','displayName','department']);
    });
    await test('Get-MgUser can select by UPN (case insensitive)', async function()
    {
        const ps = await connected();
        assert.equal((await run(ps, 'Get-MgUser -UserId ADA.MARTIN@northwind.example'))[0].id, U1);
    });
    await test('Get-MgUser by ID includes explicit selectable properties', async function()
    {
        const ps = await connected();
        const user = (await run(ps, 'Get-MgUser -UserId ' + U1 + ' -Property "id,department,accountEnabled"'))[0];
        assert.equal(user.department, 'IT');
        assert.equal(user.accountEnabled, true);
    });
    await test('one page returned when -Top given without -All', async function()
    {
        const ps = await connected();
        assert.equal((await run(ps, 'Get-MgUser -Top 1')).length, 1);
    });
    await test('-All follows multiple @odata.nextLink pages', async function()
    {
        const ps = await connected();
        assert.equal((await run(ps, 'Get-MgUser -All -Top 1')).length, 3);
    });
    await test('-All:$false does not enumerate later pages', async function()
    {
        const ps = await connected();
        assert.equal((await run(ps, 'Get-MgUser -All:$false -Top 1')).length, 1);
    });
    await test('-CountVariable includes Graph collection count', async function()
    {
        const ps = await connected();
        await run(ps, 'Get-MgUser -Top 1 -CountVariable userCount');
        assert.equal((await run(ps, '$userCount'))[0], 3);
    });
    await test('filter plus count yields filtered count', async function()
    {
        const ps = await connected();
        await run(ps, 'Get-MgUser -Filter "department eq \'IT\'" -CountVariable count');
        assert.equal((await run(ps, '$count'))[0], 2);
    });
    await test('Graph sorting uses OData $orderby', async function()
    {
        const ps = await connected();
        const users = await run(ps, 'Get-MgUser -OrderBy "displayName desc"');
        assert.equal(users[0].displayName, 'Chloe Rivera');
    });
    await test('invalid -Top value produces useful error', async function()
    {
        await fail(await connected(), 'Get-MgUser -Top 0', /InvalidParameter/);
    });
    await test('unsupported -ExpandProperty fails rather than silently ignoring it', async function()
    {
        await fail(await connected(), 'Get-MgUser -ExpandProperty manager', /UnsupportedParameter/);
    });
    await test('object ID and filter cannot be combined', async function()
    {
        await fail(await connected(), 'Get-MgUser -UserId ' + U1 + ' -Filter "department eq \'IT\'"', /ParameterSetConflict/);
    });
    await test('Graph returns transparent error for unknown user', async function()
    {
        await fail(await connected(), 'Get-MgUser -UserId nobody@northwind.example', /Request_ResourceNotFound/);
    });
    await test('other Graph resources are available', async function()
    {
        const ps = await connected();
        for (const name of ['Get-MgApplication','Get-MgServicePrincipal','Get-MgDevice','Get-MgDirectoryRole','Get-MgOrganization'])
            assert.equal((await run(ps, name)).length, 1, name);
    });
    await test('group membership and transitive membership match ENTRA_CORE', async function()
    {
        const ps = await connected();
        assert.equal((await run(ps, 'Get-MgGroupMember -GroupId ' + G2)).length, 2);
        assert.equal((await run(ps, 'Get-MgGroupTransitiveMember -GroupId ' + G2)).length, 4);
    });
    await test('Get-MgUserMemberOf shows containing security groups', async function()
    {
        const ps = await connected();
        assert.equal((await run(ps, 'Get-MgUserMemberOf -UserId ' + U1))[0].id, G1);
    });
    await test('group member cmdlet accepts pipeline group identity', async function()
    {
        const ps = await connected();
        const members = await run(ps, 'Get-MgGroup -GroupId ' + G1 + ' | Get-MgGroupMember');
        assert.equal(members.length, 2);
    });
    await test('group members support -All with paging', async function()
    {
        const ps = await connected();
        assert.equal((await run(ps, 'Get-MgGroupMember -GroupId ' + G1 + ' -All -Top 1')).length, 2);
    });
    await test('Update-MgUser changes Graph and cmdlet reads', async function()
    {
        const ps = await connected();
        await run(ps, 'Update-MgUser -UserId ' + U1 + ' -Department Security');
        assert.equal((await run(ps, 'Get-MgUser -UserId ' + U1 + ' -Property department'))[0].department, 'Security');
        assert.equal(ps.session.entra.Graph('GET', '/v1.0/users/' + U1, { query: { '$select': 'department' } }).body.department, 'Security');
    });
    await test('direct Graph PATCH immediately changes Get-MgUser results', async function()
    {
        const ps = await connected();
        assert.equal(ps.session.entra.Graph('PATCH', '/users/' + U1, { body: { jobTitle: 'Architect' } }).status, 204);
        assert.equal((await run(ps, 'Get-MgUser -UserId ' + U1))[0].jobTitle, 'Architect');
    });
    await test('Update-MgUser accepts boolean $false and -PassThru', async function()
    {
        const ps = await connected();
        assert.equal((await run(ps, 'Update-MgUser -UserId ' + U1 + ' -AccountEnabled $false -PassThru')).length, 1);
        assert.equal((await run(ps, 'Get-MgUser -UserId ' + U1 + ' -Property accountEnabled'))[0].accountEnabled, false);
    });
    await test('New-MgUser supports passwordProfile JSON without persisting password', async function()
    {
        const ps = await connected();
        const user = (await run(ps, 'New-MgUser -DisplayName "Dana Owens" -UserPrincipalName dana@northwind.example ' +
            '-MailNickname dana -AccountEnabled $true -PasswordProfile \'{"password":"SIMULATED-PASSWORD"}\''))[0];
        assert.ok(user.id);
        assert.equal((await run(ps, 'Get-MgUser -UserId ' + user.id + ' -Property accountEnabled'))[0].accountEnabled, true);
        assert.equal(JSON.stringify(ps.session.entra.DB).includes('SIMULATED-PASSWORD'), false);
    });
    await test('New-MgGroup accepts empty groupTypes and Boolean parameters', async function()
    {
        const ps = await connected();
        const group = (await run(ps, 'New-MgGroup -DisplayName "Demo Group" -MailNickname demo ' +
            '-MailEnabled $false -SecurityEnabled $true -GroupTypes ""'))[0];
        assert.ok(group.id);
        assert.equal(group.securityEnabled, true);
        assert.equal(group.groupTypes.length, 0);
    });
    await test('New-MgGroup -BodyParameter accepts compact JSON', async function()
    {
        const ps = await connected();
        const json = '{"displayName":"TestOps","mailNickname":"testops","mailEnabled":false,"securityEnabled":true,"groupTypes":[]}';
        assert.equal((await run(ps, 'New-MgGroup -BodyParameter \'' + json + '\'')).length, 1);
    });
    await test('New-MgGroupMemberByRef and Remove-MgGroupMemberByRef work', async function()
    {
        const ps = await connected();
        await run(ps, 'New-MgGroupMemberByRef -GroupId ' + G1 + ' -DirectoryObjectId ' + U2);
        assert.equal((await run(ps, 'Get-MgGroupMember -GroupId ' + G1)).length, 3);
        await run(ps, 'Remove-MgGroupMemberByRef -GroupId ' + G1 + ' -DirectoryObjectId ' + U2);
        assert.equal((await run(ps, 'Get-MgGroupMember -GroupId ' + G1)).length, 2);
    });
    await test('duplicate group membership is rejected by backend', async function()
    {
        await fail(await connected(), 'New-MgGroupMemberByRef -GroupId ' + G1 + ' -DirectoryObjectId ' + U1,
            /Request_BadRequest/);
    });
    await test('group cycle detection survives PowerShell adapter', async function()
    {
        await fail(await connected(), 'New-MgGroupMemberByRef -GroupId ' + G1 + ' -DirectoryObjectId ' + G2,
            /Request_BadRequest/);
    });
    await test('Remove-MgGroup removes object', async function()
    {
        const ps = await connected();
        await run(ps, 'Remove-MgGroup -GroupId ' + G1);
        await fail(ps, 'Get-MgGroup -GroupId ' + G1, /Request_ResourceNotFound/);
    });
    await test('Invoke-MgGraphRequest preserves raw OData response envelope', async function()
    {
        const ps = await connected();
        const body = (await run(ps, 'Invoke-MgGraphRequest -Method GET -Uri \'/v1.0/users?$top=1\''))[0];
        assert.equal(body.value.length, 1);
        assert.ok(body['@odata.nextLink']);
    });
    await test('Invoke-MgGraphRequest accepts -Query JSON', async function()
    {
        const ps = await connected();
        const body = (await run(ps, 'Invoke-MgGraphRequest -Uri /v1.0/users -Query \'{"$top":"1"}\''))[0];
        assert.equal(body.value.length, 1);
    });
    await test('Invoke-MgGraphRequest accepts JSON patch and returns no object on 204', async function()
    {
        const ps = await connected();
        const cmd = 'Invoke-MgGraphRequest -Method PATCH -Uri /v1.0/users/' + U1 +
            ' -Body \'{"department":"Operations"}\'';
        assert.equal((await run(ps, cmd)).length, 0);
        assert.equal((await run(ps, 'Get-MgUser -UserId ' + U1 + ' -Property department'))[0].department, 'Operations');
    });
    await test('Invoke-MgGraphRequest rejects invalid JSON', async function()
    {
        await fail(await connected(), 'Invoke-MgGraphRequest -Uri /users -Body not-json', /InvalidJson/);
    });
    await test('Invoke-MgGraphRequest rejects unsupported URL hosts', async function()
    {
        await fail(await connected(), 'Invoke-MgGraphRequest -Uri https://example.org/users', /Request_BadRequest/);
    });
    await test('unsupported Graph query produces an explicit error', async function()
    {
        await fail(await connected(), 'Invoke-MgGraphRequest -Uri \'/users?$expand=manager\'', /Request_UnsupportedQuery/);
    });
    await test('Get-ADUser still works alongside Entra Get-MgUser', async function()
    {
        const ps = await connected();
        assert.equal((await run(ps, 'Get-ADUser -Filter *')).length, 7);
        assert.equal((await run(ps, 'Get-MgUser -All')).length, 3);
        assert.equal(ps.session.directory.AD.DB.domain, 'corp.example.com');
        assert.equal(ps.session.entra.DB.defaultDomain, 'northwind.example');
    });
    await test('reset restores both directories and disconnects Graph', async function()
    {
        const ps = await connected();
        await run(ps, 'Update-MgUser -UserId ' + U1 + ' -Department Operations');
        await run(ps, 'Set-ADUser -Identity leo.chen -Department Operations');
        ps.reset();
        assert.equal(ps.session.entra.Session.connected, false);
        assert.equal(ps.session.entra.DB.users[0].department, 'IT');
        assert.equal(ps.session.directory.get('leo.chen').department, 'IT');
        await fail(ps, 'Get-MgUser -All', /InvalidAuthenticationToken/);
    });
    await test('independent engines do not share Entra state', async function()
    {
        const first = await connected();
        const second = newEngine();
        await run(first, 'Update-MgUser -UserId ' + U1 + ' -Department Other');
        assert.equal(second.session.entra.DB.users[0].department, 'IT');
        assert.equal(second.session.entra.Session.connected, false);
    });
    await test('custom fictional Entra seed is independent and resettable', async function()
    {
        const seed = new EntraDirectory().DB;
        seed.users[0].displayName = 'Custom Demo';
        const ps = new PowerShellJS.PowerShellSimulator({ entraSeed: seed });
        await run(ps, 'Connect-MgGraph');
        assert.equal((await run(ps, 'Get-MgUser -UserId ' + U1))[0].displayName, 'Custom Demo');
        seed.users[0].displayName = 'Outside mutation';
        assert.equal(ps.session.entra.DB.users[0].displayName, 'Custom Demo');
        ps.reset();
        assert.equal(ps.session.entra.DB.users[0].displayName, 'Custom Demo');
    });
    await test('browser-like classic script loading works without CommonJS', async function()
    {
        const browser = vm.createContext({ console, TextEncoder, TextDecoder });
        for (const filename of files)
        {
            vm.runInContext(fs.readFileSync(path.join(root, filename), 'utf8'), browser, { filename: filename });
        }
        const ps = new browser.PowerShellJS.PowerShellSimulator();
        const reply = await ps.execute('Connect-MgGraph\nGet-MgUser -All');
        assert.equal(reply.success, true, reply.errors.join('; '));
        assert.equal(reply.objects.length, 3);
    });

    await test('Get-MgDirectoryRoleMember returns directory reader assignments', async function()
    {
        const ps = await connected();
        const members = await run(ps, 'Get-MgDirectoryRoleMember -DirectoryRoleId f0000000-0000-4000-8000-000000000601');
        assert.equal(members.length, 1);
        assert.equal(members[0].id, U1);
    });
    await test('Update-MgGroup changes the directory record', async function()
    {
        const ps = await connected();
        await run(ps, 'Update-MgGroup -GroupId ' + G1 + ' -Description "New description"');
        assert.equal((await run(ps, 'Get-MgGroup -GroupId ' + G1))[0].description, 'New description');
    });
    await test('Remove-MgUser deletes the user and its group references', async function()
    {
        const ps = await connected();
        await run(ps, 'Remove-MgUser -UserId ' + U1);
        await fail(ps, 'Get-MgUser -UserId ' + U1, /Request_ResourceNotFound/);
        assert.equal((await run(ps, 'Get-MgGroupMember -GroupId ' + G1)).length, 1);
    });
    await test('New-MgApplication and New-MgServicePrincipal are linked through appId', async function()
    {
        const ps = await connected();
        const app = (await run(ps, 'New-MgApplication -DisplayName "Payroll Demo"'))[0];
        assert.ok(app.appId && app.id);
        const principal = (await run(ps, 'New-MgServicePrincipal -AppId ' + app.appId))[0];
        assert.equal(principal.appId, app.appId);
        await run(ps, 'Remove-MgServicePrincipal -ServicePrincipalId ' + principal.id);
        await run(ps, 'Remove-MgApplication -ApplicationId ' + app.id);
        await fail(ps, 'Get-MgApplication -ApplicationId ' + app.id, /Request_ResourceNotFound/);
    });
    await test('session snapshot reports Graph status without tokens', async function()
    {
        const ps = await connected();
        const status = ps.getSession().entra;
        assert.equal(status.connected, true);
        assert.equal(status.tenantId, ps.session.entra.DB.tenantId);
        assert.equal(status.users, 3);
        assert.equal(status.scopes.length, 2);
        assert.equal(JSON.stringify(status).includes('token'), false);
    });
    await test('Get-MgUser supports assigning result to a PowerShell variable', async function()
    {
        const ps = await connected();
        await run(ps, '$users = Get-MgUser -Filter "department eq \'IT\'" -Property "id,displayName,department"');
        assert.equal((await run(ps, '$users')).length, 2);
    });

    await test('index.html loads Entra core and command provider before PS_CORE', async function()
    {
        const html = fs.readFileSync(path.join(root, '..', 'index.html'), 'utf8');
        const entra = html.indexOf('src="res/ENTRA_CORE.js"');
        const cmds = html.indexOf('src="res/PS_GRAPH_COMMANDS.js"');
        const core = html.indexOf('src="res/PS_CORE.js"');
        assert.ok(entra > 0 && cmds > entra && core > cmds);
        const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
        assert.doesNotThrow(function() { new vm.Script(script, { filename: 'index.html' }); });
    });

    await test('index inline scripts execute Entra sample with a fake DOM/terminal', async function()
    {
        const html = fs.readFileSync(path.join(root, '..', 'index.html'), 'utf8');
        const byId = new Map();
        function element(id)
        {
            if (byId.has(id)) return byId.get(id);
            const node = {
                id: id, value: '', textContent: '', listeners: {}, dataset: {},
                addEventListener(type, fn) { this.listeners[type] = fn; },
                focus() {}, select() {}, setRangeText() {}
            };
            byId.set(id, node);
            return node;
        }
        const sample = element('graph-sample');
        sample.dataset.example = 'graph';
        const document = {
            getElementById: element,
            querySelectorAll(selector) { return selector === '[data-example]' ? [sample] : []; }
        };
        function TERMINAL()
        {
            this.lines = [];
            this.onInput = function(callback) { this.callback = callback; };
            this.pushPrompt = function() {};
            this.write = function(message) { this.lines.push(message); };
            this.clear = function() { this.lines = []; };
        }
        const sandbox = vm.createContext({ console, document, TERMINAL, TextEncoder, TextDecoder });
        for (const name of ['PS_PARSER.js','AD_CORE.js','PS_AD_COMMANDS.js','ENTRA_CORE.js',
            'PS_GRAPH_COMMANDS.js','PS_CORE.js','PS_TERMINAL_ADAPTER.js'])
        {
            vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), sandbox, { filename: name });
        }
        const inline = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
        vm.runInContext(inline, sandbox, { filename: 'index.html' });
        assert.ok(sandbox.PowerShellJSApp);
        sample.listeners.click();
        assert.match(element('script').value, /Connect-MgGraph/);
        await element('run').listeners.click();
        assert.equal(sandbox.PowerShellJSApp.adapter.engine.session.entra.Session.connected, true);
        assert.ok(sandbox.PowerShellJSApp.terminal.lines.some(v => v.includes('Ada Martin')));
        await element('reset').listeners.click();
        assert.equal(sandbox.PowerShellJSApp.adapter.engine.session.entra.Session.connected, false);
    });
    console.log('\n' + passed + ' Graph PowerShell tests passed.');
}
suite().catch(function(error) { console.error(error); process.exitCode = 1; });
