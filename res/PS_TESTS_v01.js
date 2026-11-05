/* Run with: node PS_TESTS.js — no packages, no server, no network. */
'use strict';
const assert = require('node:assert/strict');
const { PowerShellSimulator, parse, VirtualFS } = require('./PS_CORE.js');
let passes = 0;
async function test(label, fn)
{
    try
    {
        await fn();
        passes++;
        console.log('PASS', label);
    }
    catch (error) { console.error('FAIL', label, '\n', error); process.exitCode = 1; }
}
const ps = new PowerShellSimulator();
async function run(source)
{
    const response = await ps.execute(source);
    if (!response.success) throw new Error(response.errors.join('\n'));
    return response;
}
(async () =>
{
    await test('Parser recognizes assignment, pipelines and comments', () =>
    {
        const ast = parse('# intro\n$x=3; Write-Output "$x" | Write-Output');
        assert.equal(ast.length, 2); assert.equal(ast[0].kind, 'assignment'); assert.equal(ast[1].stages.length, 2);
    });
    await test('Arithmetic, variables, double-quote interpolation', async () =>
    {
        const r = await run('$name = "Ada"\n$z = (2 + 3) * 4\nWrite-Output "Hello $name"\n$z');
        assert.deepEqual(r.output, ['Hello Ada','20']);
    });
    await test('Variables are case-insensitive and persistent', async () =>
    { assert.deepEqual((await run('$NAME')).output, ['Ada']); });
    await test('Single quotes prevent interpolation', async () =>
    { assert.deepEqual((await run("Write-Output '$name'")).output, ['$name']); });
    await test('Get-Location and virtual current directory', async () =>
    {
        const before = await run('Get-Location'); assert.equal(before.output[0], 'C:\\Users\\Demo');
        await run('Set-Location C:\\Temp');
        assert.deepEqual((await run('pwd')).output, ['C:\\Temp']);
    });
    await test('Create, write, append, read virtual file', async () =>
    {
        await run('New-Item -Path notes.txt -ItemType File');
        await run('Set-Content -Path notes.txt -Value "abc"');
        await run('Add-Content -Path notes.txt -Value "def"');
        assert.deepEqual((await run('Get-Content notes.txt')).output, ['abcdef']);
        assert.deepEqual((await run('Test-Path notes.txt')).output, ['True']);
    });
    await test('No changes to actual host filesystem', () =>
    {
        const fs = require('node:fs');
        assert.equal(fs.existsSync(require('node:path').join(__dirname, 'notes.txt')), false);
    });
    await test('Folder listing produces objects', async () =>
    {
        const r = await run('Get-ChildItem');
        assert.ok(r.objects.some(o => o.Name === 'notes.txt'));
    });
    await test('Object pipeline Where / Select works', async () =>
    {
        const r = await run('Get-ChildItem | Where-Object { $_.Length -gt 2 } | Select-Object Name,Length');
        assert.equal(r.objects.length, 2);
        assert.ok(r.objects.some(o => o.Name === 'notes.txt'));
        assert.equal(Object.keys(r.objects[0]).join(','), 'Name,Length');
    });
    await test('Get-Command supports wildcard and matches builtins', async () =>
    {
        const r = await run('Get-Command -Name Get-*');
        assert.ok(r.objects.some(o => o.Name === 'Get-Help'));
        assert.ok(!r.objects.some(o => o.Name === 'Set-Content'));
    });
    await test('Get-Help -Name works', async () =>
    {
        const r = await run('Get-Help -Name Get-Content');
        assert.match(r.output.join(''), /Get-Content/);
    });
    await test('Clear emits effect instead of touching UI', async () =>
    { assert.ok((await run('cls')).effects.includes('clear')); });
    await test('An unknown command fails explicitly', async () =>
    {
        const r = await ps.execute('Invoke-WebRequest https://example.com');
        assert.equal(r.success, false); assert.match(r.errors.join(''), /CommandNotFound/);
    });
    await test('Broken quoting produces error instead of silently guessing', async () =>
    {
        const r = await ps.execute('Write-Host "oops');
        assert.equal(r.success, false); assert.match(r.errors.join(''), /Unterminated/);
    });
    await test('Unknown drive rejected and virtual session survives', async () =>
    {
        const r = await ps.execute('cd D:\\');
        assert.equal(r.success, false); assert.deepEqual((await run('pwd')).output, ['C:\\Temp']);
    });
    await test('VirtualFS normalize dot and dot-dot paths', () =>
    {
        const fs = new VirtualFS();
        assert.equal(fs.normalize('..\\..\\Temp\\.\\x.txt'), 'C:\\Temp\\x.txt');
    });
    await test('Reset clears variables and restores sample files', async () =>
    {
        ps.reset();
        assert.equal(ps.session.getVariable('name'), undefined);
        assert.equal(ps.session.fs.cwd, 'C:\\Users\\Demo');
        assert.equal(ps.session.fs.get('C:\\Temp\\notes.txt'), undefined);
    });
    await test('Extensible command registry and stable execution contract', async () =>
    {
        ps.registerCommand({ name: 'Hello-Test', aliases: ['ht'], description: 'Example extension', run: async () => ({ values: ['works'], messages: [], effects: [] }) });
        assert.deepEqual((await run('ht')).output, ['works']);
    });
    if (!process.exitCode) console.log(`\n${passes} tests passed. PowerShellJS v0.1`);
})();
