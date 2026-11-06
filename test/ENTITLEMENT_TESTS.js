/* IGAsim entitlement-management regression: Graph API, PowerShell examples and HTML.
 * Run: node test/ENTITLEMENT_TESTS.js
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', 'res');
const html = fs.readFileSync(path.join(root, '..', 'index.html'), 'utf8');
const scripts = ['PS_PARSER.js','AD_CORE.js','PS_AD_COMMANDS.js','ENTRA_CORE.js',
    'PS_GRAPH_COMMANDS.js','PS_CORE.js','PS_TERMINAL_ADAPTER.js'];
const elements = new Map();
function element(id)
{
    if (!elements.has(id))
        elements.set(id, {id, value:'',textContent:'',dataset:{},listeners:{},
            addEventListener(type, callback) { this.listeners[type] = callback; },
            focus() {}, select() {}, setRangeText() {}});
    return elements.get(id);
}
const keys = [...html.matchAll(/<button\b[^>]*data-example="([^"]+)"/g)].map(x => x[1]);
const buttons = keys.map(function(key)
{
    var button = element('button-' + key);
    button.dataset.example = key;
    return button;
});
const document = {getElementById: element,
    querySelectorAll(name) { return name === '[data-example]' ? buttons : []; }};
function TERMINAL()
{
    this.lines=[];
    this.onInput = function(callback) { this.callback=callback; };
    this.pushPrompt = function() {};
    this.write = function(line) { this.lines.push(line); };
    this.clear = function() { this.lines=[]; };
}
const browser = vm.createContext({console,document,TERMINAL,TextEncoder,TextDecoder});
for (const file of scripts)
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),browser,{filename:file});
const inline = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/i);
assert.ok(inline);
new vm.Script(inline[1],{filename:'index.html'});
vm.runInContext(inline[1],browser,{filename:'index.html'});
const examples=browser.PowerShellJSApp.examples;
const base='/v1.0/identityGovernance/entitlementManagement';
const G='f0000000-0000-4000-8000-000000001001';
const E='f0000000-0000-4000-8000-000000001002';
const P='f0000000-0000-4000-8000-000000001101';
const read=['govCatalogRead','govPackageRead'];
const write=['govCatalogCreate','govCatalogUpdate','govCatalogDelete',
    'govPackageCreate','govPackageUpdate','govPackageDelete','govLifecycle'];
let passes=0;
async function test(name,callback)
{
    try { await callback(); console.log('PASS '+name); passes++; }
    catch (error) { console.error('FAIL '+name+': '+(error.stack||error)); process.exitCode=1; }
}
function fresh() { return new browser.EntraDirectory(); }
function req(tenant,method,url,body,query)
{
    return tenant.Graph(method,base+url,{body,query});
}
function ok(response,status)
{
    assert.equal(response.status,status,JSON.stringify(response.body));
    return response.body;
}
function failure(response,status,code)
{
    assert.equal(response.status,status,JSON.stringify(response.body));
    assert.equal(response.body.error.code,code);
}
async function run()
{
    await test('Built-in General and Engineering catalogs are seeded',function()
    {
        const t=fresh();
        const body=ok(req(t,'GET','/catalogs'),200);
        assert.equal(body.value.length,2);
        assert.equal(body.value[0].displayName,'General');
        assert.equal(body.value[0].catalogType,'serviceDefault');
        assert.equal(body.value[1].id,E);
    });
    await test('Default packages link to one existing catalog',function()
    {
        const t=fresh();
        const packages=ok(req(t,'GET','/accessPackages'),200).value;
        assert.equal(packages.length,2);
        assert.equal(packages.find(p=>p.id===P).catalogId,E);
    });
    await test('Filter, select, order, page and nextLink work for catalog collections',function()
    {
        const t=fresh();
        let response=ok(req(t,'GET',"/catalogs?$top=1&$orderby=displayName%20asc&$select=id,displayName"),200);
        assert.equal(response.value.length,1);
        assert.ok(response['@odata.nextLink']);
        assert.deepEqual(Object.keys(response.value[0]).sort(),['displayName','id']);
        const second=ok(t.Graph('GET',response['@odata.nextLink']),200);
        assert.equal(second.value.length,1);
        const query=ok(req(t,'GET',"/catalogs?$filter=state%20eq%20'published'"),200);
        assert.equal(query.value.length,2);
    });
    await test('List packages filtered by catalogId',function()
    {
        const t=fresh();
        const payload=ok(req(t,'GET','/accessPackages',{},{'$filter':"catalogId eq '"+E+"'"}),200);
        assert.equal(payload.value.length,1);
        assert.equal(payload.value[0].id,P);
    });
    await test('Read relationships through $expand and navigation',function()
    {
        const t=fresh();
        const cat=ok(req(t,'GET','/catalogs/'+E,undefined,{'$expand':'accessPackages'}),200);
        assert.equal(cat.accessPackages.length,1);
        const p=ok(req(t,'GET','/accessPackages/'+P,undefined,{'$expand':'catalog'}),200);
        assert.equal(p.catalog.id,E);
        const n=ok(req(t,'GET','/catalogs/'+E+'/accessPackages'),200);
        assert.equal(n.value.length,1);
        const c=ok(req(t,'GET','/accessPackages/'+P+'/catalog'),200);
        assert.equal(c.id,E);
    });
    await test('Catalog create/get/update/delete lifecycle',function()
    {
        const t=fresh();
        const a=ok(req(t,'POST','/catalogs',{displayName:'HR',description:'Human resources',state:'published',isExternallyVisible:true}),201);
        assert.equal(a.catalogType,'userManaged');
        assert.equal(a.isExternallyVisible,true);
        assert.equal(ok(req(t,'GET','/catalogs/'+a.id),200).displayName,'HR');
        ok(req(t,'PATCH','/catalogs/'+a.id,{displayName:'HR Governance',isExternallyVisible:false}),204);
        assert.equal(ok(req(t,'GET','/catalogs/'+a.id),200).displayName,'HR Governance');
        ok(req(t,'DELETE','/catalogs/'+a.id),204);
        failure(req(t,'GET','/catalogs/'+a.id),404,'Request_ResourceNotFound');
    });
    await test('Package create via official nested catalog reference',function()
    {
        const t=fresh();
        const created=ok(req(t,'POST','/accessPackages',{
            displayName:'HR Basic',description:'Test',catalog:{id:E},isHidden:true}),201);
        assert.equal(created.catalogId,E);
        assert.equal(created.isHidden,true);
    });
    await test('Package CRUD complete lifecycle including reset',function()
    {
        const t=fresh();
        const created=ok(req(t,'POST','/accessPackages',{
            displayName:'Temporary',catalog:{id:G}}),201);
        assert.equal(created.isHidden,false);
        assert.ok(ok(req(t,'GET','/accessPackages/'+created.id),200));
        ok(req(t,'PATCH','/accessPackages/'+created.id,{description:'Revised',isHidden:true}),204);
        assert.equal(ok(req(t,'GET','/accessPackages/'+created.id),200).isHidden,true);
        ok(req(t,'DELETE','/accessPackages/'+created.id),204);
        failure(req(t,'GET','/accessPackages/'+created.id),404,'Request_ResourceNotFound');
        t.Reset();
        assert.equal(ok(req(t,'GET','/accessPackages'),200).value.length,2);
    });
    await test('Package creation accepts tutorial catalogId shorthand',function()
    {
        const t=fresh();
        const p=ok(req(t,'POST','/accessPackages',{displayName:'Short',catalogId:G}),201);
        assert.equal(p.catalogId,G);
    });
    await test('Cannot create a package without a catalog',function()
    {
        failure(req(fresh(),'POST','/accessPackages',{displayName:'Missing'}),400,'Request_BadRequest');
    });
    await test('Invalid package catalog reference returns 404 without mutation',function()
    {
        const t=fresh();
        failure(req(t,'POST','/accessPackages',{displayName:'Missing',catalog:{id:'bogus'}}),404,'Request_ResourceNotFound');
        assert.equal(t.DB.accessPackages.length,2);
    });
    await test('A nonpublished catalog refuses package creation',function()
    {
        const t=fresh();
        const c=ok(req(t,'POST','/catalogs',{displayName:'Draft',state:'unpublished'}),201);
        failure(req(t,'POST','/accessPackages',{displayName:'Denied',catalog:{id:c.id}}),409,'Request_ResourceConflict');
    });
    await test('Catalog with packages cannot be deleted',function()
    {
        const t=fresh();
        failure(req(t,'DELETE','/catalogs/'+E),409,'Request_ResourceConflict');
    });
    await test('Deleting last package permits catalog deletion',function()
    {
        const t=fresh();
        const c=ok(req(t,'POST','/catalogs',{displayName:'Disposable'}),201);
        const p=ok(req(t,'POST','/accessPackages',{displayName:'Package',catalog:{id:c.id}}),201);
        failure(req(t,'DELETE','/catalogs/'+c.id),409,'Request_ResourceConflict');
        ok(req(t,'DELETE','/accessPackages/'+p.id),204);
        ok(req(t,'DELETE','/catalogs/'+c.id),204);
    });
    await test('Built-in General catalog cannot be modified or deleted',function()
    {
        const t=fresh();
        failure(req(t,'PATCH','/catalogs/'+G,{displayName:'Renamed'}),403,'Authorization_RequestDenied');
        failure(req(t,'DELETE','/catalogs/'+G),403,'Authorization_RequestDenied');
    });
    await test('A package cannot be moved to a different catalog',function()
    {
        const t=fresh();
        failure(req(t,'PATCH','/accessPackages/'+P,{catalogId:G}),400,'Request_BadRequest');
        assert.equal(t.DB.accessPackages[0].catalogId,E);
    });
    await test('Readonly governance fields are rejected',function()
    {
        const t=fresh();
        for (const [kind,id] of [['catalogs',E],['accessPackages',P]])
        {
            failure(req(t,'PATCH','/'+kind+'/'+id,{id:'123'}),400,'Request_BadRequest');
            failure(req(t,'PATCH','/'+kind+'/'+id,{createdDateTime:'2020-01-01'}),400,'Request_BadRequest');
        }
    });
    await test('Invalid filter, select, expand and path fail explicitly',function()
    {
        const t=fresh();
        failure(req(t,'GET','/catalogs',undefined,{'$filter':'unknown eq 1'}),400,'Request_UnsupportedQuery');
        failure(req(t,'GET','/accessPackages',undefined,{'$select':'password'}),400,'Request_UnsupportedQuery');
        failure(req(t,'GET','/catalogs/'+E,undefined,{'$expand':'resources'}),400,'Request_UnsupportedQuery');
        failure(req(t,'GET','/assignmentPolicies'),404,'Request_ResourceNotFound');
    });
    await test('The core and PowerShell engine see identical changes',async function()
    {
        const ps=new browser.PowerShellJS.PowerShellSimulator();
        const r=await ps.execute('Connect-MgGraph\nInvoke-MgGraphRequest -Method PATCH -Uri "'+base+'/accessPackages/'+P+'" -Body \'{"isHidden":true}\'');
        assert.equal(r.success,true,r.errors.join('; '));
        assert.equal(ps.session.entra.DB.accessPackages[0].isHidden,true);
        assert.equal(ok(ps.session.entra.Graph('GET',base+'/accessPackages/'+P),200).isHidden,true);
        ps.reset();
        assert.equal(ps.session.entra.DB.accessPackages[0].isHidden,false);
    });
    await test('Each tenant instance owns independent mutable catalogs and packages',function()
    {
        const a=fresh(),b=fresh();
        ok(req(a,'POST','/catalogs',{displayName:'A only'}),201);
        assert.equal(a.DB.accessPackageCatalogs.length,3);
        assert.equal(b.DB.accessPackageCatalogs.length,2);
    });
    await test('Legacy custom tenant seeds without governance arrays remain valid',function()
    {
        const t=fresh(),seed=JSON.parse(JSON.stringify(t.DB));
        delete seed.accessPackageCatalogs;delete seed.accessPackages;
        const legacy=new browser.EntraDirectory(seed);
        assert.deepEqual(JSON.parse(JSON.stringify(legacy.DB.accessPackages)),[]);
        assert.deepEqual(JSON.parse(JSON.stringify(legacy.DB.accessPackageCatalogs)),[]);
    });
    await test('All catalog and package example buttons have standalone ps1 counterparts',function()
    {
        assert.equal(read.length+write.length,9);
        for (const k of read.concat(write))
        {
            assert.ok(keys.includes(k),k+' is missing from index.html');
            const file=path.join(root,'..','examples','graph','entitlement',read.includes(k)?'read':'write',k+'.ps1');
            assert.equal(examples[k].trimEnd(),fs.readFileSync(file,'utf8').trimEnd(),k+' script mismatch');
        }
    });
    for (const k of read.concat(write))
    {
        await test('PowerShell sample executes: '+k,async function()
        {
            const engine=new browser.PowerShellJS.PowerShellSimulator();
            const original=JSON.stringify(engine.session.entra.DB);
            const result=await engine.execute(examples[k]);
            assert.equal(result.success,true,k+': '+result.errors.join('; '));
            assert.ok(result.output.length,k+' has no visible output');
            if (read.includes(k)) assert.equal(JSON.stringify(engine.session.entra.DB),original);
            if (k==='govCatalogCreate') assert.ok(engine.session.entra.DB.accessPackageCatalogs.some(x=>x.displayName==='HR Lifecycle'));
            if (k==='govPackageCreate') assert.ok(engine.session.entra.DB.accessPackages.some(x=>x.displayName==='HR Basic Access'));
            if (k==='govCatalogDelete') assert.equal(engine.session.entra.DB.accessPackageCatalogs.length,2);
            if (k==='govPackageDelete'||k==='govLifecycle') assert.equal(engine.session.entra.DB.accessPackages.length,2);
        });
    }
    await test('HTML button loads and executes entitlement example',async function()
    {
        element('button-govCatalogRead').listeners.click();
        assert.equal(element('script').value,examples.govCatalogRead);
        await element('run').listeners.click();
        assert.equal(browser.PowerShellJSApp.adapter.engine.session.entra.Session.connected,true);
        assert.ok(browser.PowerShellJSApp.terminal.lines.length);
        await element('reset').listeners.click();
        assert.equal(browser.PowerShellJSApp.adapter.engine.session.entra.Session.connected,false);
    });
    console.log('\n'+passes+' Entitlement Management tests passed.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
