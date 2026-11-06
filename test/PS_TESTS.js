/* Node used only to verify the browser-first engine. Run: node test/PS_TESTS.js */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
for (const filename of ['PS_PARSER.js','AD_CORE.js','PS_AD_COMMANDS.js','ENTRA_CORE.js','PS_GRAPH_COMMANDS.js','PS_CORE.js'])
{
    const filepath = path.join(__dirname, '..', 'res', filename);
    vm.runInThisContext(fs.readFileSync(filepath, 'utf8'), { filename: filepath });
}
const { PowerShellSimulator, parse, VirtualFS } = globalThis.PowerShellJS;
const { SimulatedDirectory, parseLDAPFilter, parseADFilter } = globalThis.PowerShellAD;
const ps = new PowerShellSimulator(); let total = 0;
async function test(name, callback)
{
    try
    {
        await callback();
        total++;
        console.log('PASS', name);
    }
    catch (e)
    {
        console.error('FAIL', name, '\n', e.stack || e);
        process.exitCode = 1;
    }
}
async function ok(script, engine = ps)
{
    const r = await engine.execute(script);
    assert.equal(r.success, true, script + ': ' + r.errors.join('; '));
    return r;
}
async function bad(script, pattern, engine = ps)
{
    const r = await engine.execute(script);
    assert.equal(r.success, false, script);
    assert.match(r.errors.join('\n'), pattern instanceof RegExp ? pattern : new RegExp(pattern));
    return r;
}
async function runTests()
{
    await test('v0.2 structural AST assignment and pipeline', () =>
    {
        const ast = parse('$a=2; echo $a | Sort-Object');
        assert.equal(ast.length, 2);
        assert.equal(ast[0].kind, 'assignment');
        assert.equal(ast[1].stages.length, 2);
    });
    await test('AST nested if / else', () =>
    {
        const ast = parse('if ($x -eq 1) { Write-Output 1; if ($true) { echo 2 } } else { echo 3 }');
        assert.equal(ast[0].kind, 'if');
        assert.equal(ast[0].then[1].kind, 'if');
        assert.equal(ast[0].else.length, 1);
    });
    await test('AST foreach and function definitions', () =>
    {
        const ast = parse('function Report($u) { Write-Output $u.Name }\nforeach ($x in $data) { Report $x }');
        assert.deepEqual(ast.map(n => n.kind), ['function','foreach']);
    });
    await test('Nested pipes do not split at quoted LDAP filter', () =>
    {
        const ast = parse('Get-ADUser -LDAPFilter "(|(cn=A*)(cn=B*))" | Select-Object Name');
        assert.equal(ast[0].stages.length, 2);
    });
    await test('Block comments and multiline input', () =>
    {
        const ast = parse('<# hi\n #>\nGet-ADUser -Filter *\n | Select-Object Name');
        assert.equal(ast.length, 1);
        assert.equal(ast[0].stages.length, 2);
    });
    await test('Parser rejects unterminated quotes', () => assert.throws(() => parse('echo "bad'), /Unterminated/));
    await test('Parser rejects unmatched block', () => assert.throws(() => parse('if ($true) { echo 3'), /Unbalanced/));
    await test('Parser rejects trailing pipeline', () => assert.throws(() => parse('Get-ADUser -Filter * |'), /pipeline stage/));
    await test('Numeric expressions and interpolation', async () =>
    {
        const r = await ok('$name="Ada"\n$n=(2+3)*4\nWrite-Output "$name $n"');
        assert.deepEqual(r.output, ['Ada 20']);
    });
    await test('Control-flow if false / else', async () =>
    {
        const r = await ok('$n=3\nif ($n -gt 5) { Write-Output big } else { Write-Output small }');
        assert.deepEqual(r.output, ['small']);
    });
    await test('Foreach over captured AD command objects', async () =>
    {
        const r = await ok('$users = Get-ADUser -Filter "Department -eq \'IT\'" -Properties Department\nforeach ($u in $users) { Write-Output $u.SamAccountName }');
        assert.deepEqual(r.output, ['ava.morgan','leo.chen','felix.gray']);
    });
    await test('Functions with arguments and restore of parameters', async () =>
    {
        const r = await ok('function Greet($person) { Write-Output "Hi $person" }\nGreet Ava');
        assert.deepEqual(r.output, ['Hi Ava']);
    });
    await test('Session variable assignment remains persistent', async () => assert.equal((await ok('$n')).objects[0], 3));
    await test('PowerShell pipeline still passes objects', async () =>
    {
        const r = await ok('Get-ADUser -Filter * -Properties Department | Where-Object { $_.Department -eq "IT" } | Select-Object Name,Department');
        assert.equal(r.objects.length, 3);
        assert.ok(r.objects.every(o => o.Department === 'IT'));
    });
    await test('Virtual filesystem remains operational', async () =>
    {
        await ok('Set-Content -Path C:\\Temp\\demo.txt -Value "testing"');
        assert.deepEqual((await ok('Get-Content C:\\Temp\\demo.txt')).output, ['testing']);
    });
    await test('Get-ADRootDSE provides simulated base DN', async () =>
    {
        const r = await ok('Get-ADRootDSE');
        assert.equal(r.objects[0].defaultNamingContext, 'DC=corp,DC=example,DC=com');
    });
    await test('Get-ADUser -Filter * excludes computer objects', async () =>
    {
        const r = await ok('Get-ADUser -Filter *');
        assert.equal(r.objects.length, 7);
        assert.ok(r.objects.every(x => !x.Name.startsWith('PC-')));
    });
    await test('Get-ADUser -Identity case-insensitive lookup', async () =>
    {
        const r = await ok('Get-ADUser -Identity AVA.MORGAN');
        assert.equal(r.objects[0].Name, 'Ava Morgan');
    });
    await test('Get-ADUser -Properties provides additional fields', async () =>
    {
        const r = await ok('Get-ADUser -Identity mia.jansen -Properties Department,Mail');
        assert.equal(r.objects[0].Department, 'Finance');
        assert.match(r.objects[0].Mail, /@corp/);
    });
    await test('AD -Filter basic boolean and wildcard', async () =>
    {
        const r = await ok("Get-ADUser -Filter 'Enabled -eq $true -and Department -like \"F*\"'");
        assert.equal(r.objects.length, 2);
    });
    await test('AD -Filter brace style', async () =>
    {
        const r = await ok("Get-ADUser -Filter { Department -eq 'HR' }");
        assert.equal(r.objects.length, 1);
    });
    await test('AD -LDAPFilter AND and presence', async () =>
    {
        const r = await ok("Get-ADUser -LDAPFilter '(&(objectCategory=person)(mail=*)(department=IT))'");
        assert.equal(r.objects.length, 3);
    });
    await test('LDAP OR and NOT', async () =>
    {
        const r = await ok("Get-ADUser -LDAPFilter '(&(|(department=IT)(department=HR))(!(cn=Felix*)))'");
        assert.equal(r.objects.length, 3);
    });
    await test('LDAP substring, case insensitive', async () =>
    {
        const r = await ok("Get-ADUser -LDAPFilter '(cn=*JANSEN)'");
        assert.deepEqual(r.objects.map(x => x.Name), ['Mia Jansen']);
    });
    await test('LDAP bitwise disabled users rule', async () =>
    {
        const r = await ok("Get-ADUser -LDAPFilter '(userAccountControl:1.2.840.113556.1.4.803:=2)'");
        assert.deepEqual(r.objects.map(x => x.SamAccountName), ['felix.gray']);
    });
    await test('LDAP transitive group membership rule', async () =>
    {
        const r = await ok("Get-ADGroup -LDAPFilter '(member:1.2.840.113556.1.4.1941:=CN=Mia Jansen,OU=Finance,OU=Users,DC=corp,DC=example,DC=com)'");
        assert.equal(r.objects.length, 3);
    });
    await test('LDAP raw search returns requested attributes', async () =>
    {
        const r = await ok("Search-LDAP -Filter '(&(objectCategory=person)(department=Finance))' -Attributes cn,mail");
        assert.equal(r.objects.length, 2);
        assert.deepEqual(Object.keys(r.objects[0]), ['cn','mail']);
    });
    await test('OneLevel search returns direct OU members only', async () =>
    {
        const r = await ok("Get-ADUser -Filter * -SearchBase 'OU=IT,OU=Users,DC=corp,DC=example,DC=com' -SearchScope OneLevel");
        assert.equal(r.objects.length, 3);
    });
    await test('Subtree search includes nested OUs', async () =>
    {
        const r = await ok("Get-ADUser -Filter * -SearchBase 'OU=Users,DC=corp,DC=example,DC=com' -SearchScope Subtree");
        assert.equal(r.objects.length, 7);
    });
    await test('LDAP group members and recursive members', async () =>
    {
        const normal = await ok('Get-ADGroupMember -Identity APP_Reporting');
        assert.equal(normal.objects.length, 2);
        const recurse = await ok('Get-ADGroupMember -Identity APP_Reporting -Recursive');
        assert.equal(recurse.objects.length, 3);
    });
    await test('Principal group membership', async () =>
    {
        const r = await ok('Get-ADPrincipalGroupMembership -Identity ava.morgan');
        assert.equal(r.objects.length, 2);
    });
    await test('Change simulated attributes with Set-ADUser', async () =>
    {
        await ok('Set-ADUser -Identity leo.chen -Department Operations');
        const r = await ok('Get-ADUser -Identity leo.chen -Properties Department');
        assert.equal(r.objects[0].Department, 'Operations');
    });
    await test('Add/remove simulated membership', async () =>
    {
        await ok('Add-ADGroupMember -Identity BR_HR_Reader -Members leo.chen');
        assert.equal((await ok('Get-ADGroupMember -Identity BR_HR_Reader')).objects.length, 2);
        await ok('Remove-ADGroupMember -Identity BR_HR_Reader -Members leo.chen');
        assert.equal((await ok('Get-ADGroupMember -Identity BR_HR_Reader')).objects.length, 1);
    });
    await test('Disable / enable simulated accounts', async () =>
    {
        await ok('Disable-ADAccount -Identity ava.morgan');
        assert.equal((await ok('Get-ADUser -Identity ava.morgan')).objects[0].Enabled, false);
        await ok('Enable-ADAccount -Identity ava.morgan');
        assert.equal((await ok('Get-ADUser -Identity ava.morgan')).objects[0].Enabled, true);
    });
    await test('Query log records LDAP/AD searches', async () =>
    {
        const r = await ok('Get-LDAPQueryLog');
        assert.ok(r.objects.some(x => x.FilterType === 'LDAP'));
        assert.ok(r.objects.some(x => x.FilterType === 'AD'));
    });
    await test('Unknown parameters explicitly fail', async () =>
    {
        await bad('Get-ADUser -Filter * -Server dc01', 'UnsupportedParameter');
    });
    await test('Conflicting filters explicitly fail', async () =>
    {
        await bad("Get-ADUser -Filter * -LDAPFilter '(cn=*)'", 'ParameterSetConflict');
    });
    await test('Invalid LDAP syntax explicitly fails', async () =>
    {
        await bad("Get-ADUser -LDAPFilter '(&(cn=A)'", 'LDAPFilterSyntax');
    });
    await test('Invalid AD filter syntax fails', async () =>
    {
        await bad("Get-ADUser -Filter 'Department -eq'", 'ADFilterSyntax');
    });
    await test('Unknown AD identity fails', async () =>
    {
        await bad('Get-ADUser -Identity nonexistent', 'ADIdentityNotFound');
    });
    await test('No actual OS or network access', async () =>
    {
        await bad('Invoke-Expression "whoami"', 'CommandNotFound');
        await bad('Invoke-RestMethod https://example.com', 'CommandNotFound');
    });
    await test('Reset restores sample directory and vars', async () =>
    {
        ps.reset();
        assert.equal(ps.session.getVariable('users'), undefined);
        assert.equal((await ok('Get-ADUser -Identity leo.chen -Properties Department')).objects[0].Department, 'IT');
    });
    await test('Interchangeable engine custom cmdlet contract', async () =>
    {
        ps.registerCommand({ name: 'Get-Demo', run: async () => ({ values: ['works'], messages: [], effects: [] }) });
        assert.deepEqual((await ok('Get-Demo')).output, ['works']);
    });
    await test('Provider can be used without a terminal', () =>
    {
        const d = new SimulatedDirectory();
        assert.ok(d.search({ kind: 'group', filter: 'Name -like "BR_*"' }).length > 0);
        assert.equal(typeof parseLDAPFilter('(cn=*)'), 'object');
        assert.equal(parseADFilter('Enabled -eq $true')({ Enabled: true }), true);
    });
    await test('Public modules use plain constructor containers without class or IIFE wrappers', () =>
    {
        for (const filename of ['PS_PARSER.js','AD_CORE.js','PS_AD_COMMANDS.js','ENTRA_CORE.js','PS_GRAPH_COMMANDS.js','PS_CORE.js','PS_TERMINAL_ADAPTER.js'])
        {
            const source = fs.readFileSync(path.join(__dirname, '..', 'res', filename), 'utf8');
            assert.doesNotMatch(source, /\bclass\s+[A-Za-z_]/);
            assert.doesNotMatch(source, /^\s*\(function\s*\(/m);
            assert.doesNotMatch(source, /module\.exports|\brequire\s*\([\s\x27\x22]/);
        }
        for (const [name, instance] of Object.entries({
            PowerShellParser: globalThis.PowerShellParser,
            PowerShellAD: globalThis.PowerShellAD,
            PowerShellADCommands: globalThis.PowerShellADCommands,
            PowerShellJS: globalThis.PowerShellJS
        }))
        {
            assert.equal(typeof instance, 'object', name);
        }
    });
    await test('Instance methods live directly on this, not prototypes', () =>
    {
        const directory = new SimulatedDirectory();
        const fsInstance = new VirtualFS();
        const engine = new PowerShellSimulator();
        assert.ok(Object.hasOwn(directory, 'search'));
        assert.ok(Object.hasOwn(directory, 'groupsOf'));
        assert.ok(Object.hasOwn(fsInstance, 'normalize'));
        assert.ok(Object.hasOwn(engine, 'execute'));
        assert.ok(Object.hasOwn(engine, 'registerCommand'));
        assert.equal(Object.getPrototypeOf(directory), SimulatedDirectory.prototype);
        assert.equal(Object.hasOwn(SimulatedDirectory.prototype, 'search'), false);
    });
    await test('Independent instance state and reset semantics survive conversion', async () =>
    {
        const first = new PowerShellSimulator();
        const second = new PowerShellSimulator();
        await first.execute('Set-ADUser -Identity leo.chen -Department TestOnly');
        assert.equal(first.session.directory.get('leo.chen').department, 'TestOnly');
        assert.equal(second.session.directory.get('leo.chen').department, 'IT');
        first.reset();
        assert.equal(first.session.directory.get('leo.chen').department, 'IT');
    });
    await test('Constructor function errors remain standard Error objects', () =>
    {
        const cases = [
            new globalThis.PowerShellParser.SyntaxErrorPS('syntax', 3, 5),
            new globalThis.PowerShellAD.DirectoryError('directory', 'ADMissing'),
            new globalThis.PowerShellJS.PSError('powershell', 'DemoError')
        ];
        for (const error of cases)
        {
            assert.ok(error instanceof Error);
            assert.match(error.stack, /Error/);
            assert.equal(typeof error.code, 'string');
        }
        assert.equal(cases[0].line, 3);
        assert.equal(cases[0].column, 5);
    });
    await test('Classic script loading works without CommonJS globals', async () =>
    {
        const browser = vm.createContext({ console, TextEncoder, TextDecoder });
        for (const filename of ['PS_PARSER.js','AD_CORE.js','PS_AD_COMMANDS.js','ENTRA_CORE.js','PS_GRAPH_COMMANDS.js','PS_CORE.js','PS_TERMINAL_ADAPTER.js'])
        {
            const filepath = path.join(__dirname, '..', 'res', filename);
            vm.runInContext(fs.readFileSync(filepath, 'utf8'), browser, { filename: filepath });
        }
        assert.equal(typeof browser.PowerShellJS.PowerShellSimulator, 'function');
        assert.equal(typeof browser.PowerShellAD.SimulatedDirectory, 'function');
        assert.equal(typeof browser.PowerShellTerminal.EngineRegistry, 'function');
        const response = await new browser.PowerShellJS.PowerShellSimulator().execute('Get-ADUser -Filter *');
        assert.equal(response.success, true);
        assert.equal(response.objects.length, 7);
    });
    await test('Terminal adapter and interchangeable engine stay functional', async () =>
    {
        const loader = fs.readFileSync(path.join(__dirname, '..', 'res', 'PS_TERMINAL_ADAPTER.js'), 'utf8');
        const browser = vm.createContext({ console, TextEncoder, TextDecoder });
        vm.runInContext(loader, browser);
        const prompts = [], outputs = [], events = [];
        const terminal = {
            pushPrompt(value) { prompts.push(value); },
            onInput(callback) { this.callback = callback; },
            clear() { outputs.push('clear'); },
            write(value) { outputs.push(value); }
        };
        const registry = new browser.PowerShellTerminal.EngineRegistry();
        registry.register('demo', () => ({
            getPrompt: () => 'PS C:\\Test> ',
            execute: async source => ({ success: true, output: [source], errors: [], effects: [] }),
            reset: () => events.push('reset')
        }));
        const engine = registry.create('demo');
        const adapter = new browser.PowerShellTerminal.TerminalEngineAdapter(terminal, engine, {
            onStatus: message => events.push(message)
        });
        const result = await adapter.submit('Get-Demo');
        assert.equal(result.success, true);
        assert.ok(outputs.some(x => x.includes('Get-Demo')));
        assert.ok(prompts.length >= 2);
        await adapter.reset();
        assert.ok(events.includes('reset'));
    });
    if (!process.exitCode) console.log(`\n${total} tests passed. PowerShellJS v0.2`);
}

runTests();
