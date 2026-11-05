/* ENTRA_CORE v0.1 standalone regression suite. Run: node res/ENTRA_CORE.test.js */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'ENTRA_CORE.js'), 'utf8');
const sandbox = vm.createContext({});
vm.runInContext(source, sandbox, { filename: 'ENTRA_CORE.js' });
const EntraDirectory = sandbox.EntraDirectory;
const base = 'https://graph.microsoft.com/v1.0';
const U1 = 'f0000000-0000-4000-8000-000000000101';
const U2 = 'f0000000-0000-4000-8000-000000000102';
const U3 = 'f0000000-0000-4000-8000-000000000103';
const G1 = 'f0000000-0000-4000-8000-000000000201';
const G2 = 'f0000000-0000-4000-8000-000000000202';
const G3 = 'f0000000-0000-4000-8000-000000000203';
const SP1 = 'f0000000-0000-4000-8000-000000000501';
const R1 = 'f0000000-0000-4000-8000-000000000601';
let passed = 0;

function test(name, run)
{
    try
    {
        run();
        passed++;
        console.log('PASS ' + name);
    }
    catch (error)
    {
        console.error('FAIL ' + name);
        throw error;
    }
}
function fresh() { return new EntraDirectory(); }
function call(ad, method, endpoint, options) { return ad.Graph(method, endpoint, options); }
function get(ad, endpoint, options) { return call(ad, 'GET', endpoint, options); }
function err(response, status, code)
{
    assert.equal(response.status, status, JSON.stringify(response.body));
    assert.equal(response.body.error.code, code);
    assert.equal(typeof response.body.error.message, 'string');
}
function ids(response)
{
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return Array.from(response.body.value, function(v) { return v.id; });
}

// Loading / architecture

test('classic browser script exposes constructor without module wrapper', function()
{
    assert.equal(typeof EntraDirectory, 'function');
    assert.equal(typeof fresh().Graph, 'function');
    assert.doesNotMatch(source, /module\.exports|\brequire\s*\(|\bclass\s+|\(function\s*\(root/);
});
test('plain constructor owns DB and Graph on the instance', function()
{
    const a = fresh();
    assert.ok(Object.hasOwn(a, 'DB'));
    assert.ok(Object.hasOwn(a, 'Graph'));
    assert.equal(Object.hasOwn(EntraDirectory.prototype, 'Graph'), false);
});
test('all default resources are inline with consistent tenant identity', function()
{
    const a = fresh();
    assert.equal(a.DB.defaultDomain, 'northwind.example');
    assert.equal(a.DB.tenantId, a.DB.organization[0].id);
    for (const name of ['users','groups','applications','servicePrincipals','directoryRoles','devices'])
        assert.ok(a.DB[name].length);
});
test('no network call or external JSON data is required', function()
{
    assert.doesNotMatch(source, /\bfetch\s*\(|\bXMLHttpRequest\b|\beval\s*\(/);
    assert.equal(get(fresh(), '/v1.0/users').status, 200);
});
test('separate tenants have independent mutable state', function()
{
    const a = fresh(), b = fresh();
    a.DB.users[0].displayName = 'Changed';
    assert.equal(b.DB.users[0].displayName, 'Ada Martin');
});
test('seed is cloned and reset restores original seed, not external reference', function()
{
    const sourceSeed = fresh().DB;
    const a = new EntraDirectory(sourceSeed);
    sourceSeed.users[0].displayName = 'Outside change';
    assert.equal(a.DB.users[0].displayName, 'Ada Martin');
    a.DB.users[0].displayName = 'Local change';
    a.Reset();
    assert.equal(a.DB.users[0].displayName, 'Ada Martin');
});
test('incomplete directory seed is rejected', function()
{
    assert.throws(function() { new EntraDirectory({ tenantId: 'x' }); }, /missing array/);
});

// GET / collections / OData

test('GET users has Graph collection envelope and default projection', function()
{
    const r = get(fresh(), '/v1.0/users');
    assert.equal(r.status, 200);
    assert.equal(r.headers['Content-Type'], 'application/json');
    assert.equal(r.body['@odata.context'], base + '/$metadata#users');
    assert.equal(r.body.value.length, 3);
    assert.equal(r.body.value[0].displayName, 'Ada Martin');
    assert.equal(Object.hasOwn(r.body.value[0], 'department'), false);
});
test('GET group collection hides internal memberIds', function()
{
    const r = get(fresh(), '/groups');
    assert.equal(r.status, 200);
    assert.equal(r.body.value.length, 3);
    assert.equal(Object.hasOwn(r.body.value[0], 'memberIds'), false);
});
test('GET one user by id and by userPrincipalName', function()
{
    const a = fresh();
    assert.equal(get(a, '/users/' + U1).body.id, U1);
    assert.equal(get(a, '/users/ADA.MARTIN@northwind.example').body.displayName, 'Ada Martin');
});
test('GET accepts full Microsoft Graph URL', function()
{
    assert.equal(get(fresh(), base + '/users').status, 200);
});
test('GET organization and other collections', function()
{
    const a = fresh();
    assert.equal(get(a, '/organization').body.value[0].displayName, 'Northwind Demo Tenant');
    assert.equal(get(a, '/applications').body.value.length, 1);
    assert.equal(get(a, '/servicePrincipals').body.value.length, 1);
    assert.equal(get(a, '/directoryRoles').body.value.length, 1);
    assert.equal(get(a, '/devices').body.value.length, 1);
});
test('$select returns requested fields and independent copies', function()
{
    const a = fresh();
    const r = get(a, '/users?$select=id,department,displayName');
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body.value[0]).sort(), ['department','displayName','id']);
    r.body.value[0].displayName = 'Response mutated';
    assert.equal(a.DB.users[0].displayName, 'Ada Martin');
});
test('unknown or private $select fields fail explicitly', function()
{
    err(get(fresh(), '/users?$select=missingProperty'), 400, 'Request_UnsupportedQuery');
    err(get(fresh(), '/groups?$select=memberIds'), 400, 'Request_UnsupportedQuery');
});
test('OData eq filter works on directory attributes', function()
{
    assert.equal(ids(get(fresh(), "/users?$filter=department eq 'IT'")).length, 2);
});
test('OData boolean filter works', function()
{
    assert.deepEqual(ids(get(fresh(), '/users?$filter=accountEnabled eq false')), [U3]);
});
test('OData and/or/not precedence and parentheses work', function()
{
    const a = fresh();
    const f = "(department eq 'IT' or department eq 'Finance') and not (accountEnabled eq false)";
    assert.deepEqual(ids(get(a, '/users', { query: { '$filter': f } })), [U1,U2]);
    const f2 = "department eq 'Finance' or department eq 'IT' and accountEnabled eq false";
    assert.deepEqual(ids(get(a, '/users', { query: { '$filter': f2 } })), [U2,U3]);
});
test('OData consecutive AND/OR branches do not self-recurse', function()
{
    const a = fresh();
    assert.deepEqual(ids(get(a, '/users', { query: {
        '$filter': "accountEnabled eq true and department ne 'Finance' and startswith(displayName,'Ada')"
    } })), [U1]);
    assert.equal(ids(get(a, '/users', { query: {
        '$filter': "department eq 'None' or department eq 'IT' or department eq 'Finance'"
    } })).length, 3);
});
test('OData startswith, endswith and contains', function()
{
    const a = fresh();
    assert.deepEqual(ids(get(a, "/users?$filter=startswith(displayName,'A')")), [U1]);
    assert.deepEqual(ids(get(a, "/users?$filter=endswith(mail,'northwind.example')")).length, 3);
    assert.deepEqual(ids(get(a, "/users?$filter=contains(displayName,'river')")), [U3]);
});
test('OData string with doubled apostrophe is parsed safely', function()
{
    const a = fresh();
    a.DB.users[0].displayName = "O'Neil";
    assert.deepEqual(ids(get(a, "/users?$filter=displayName eq 'O''Neil'")), [U1]);
});
test('invalid $filter does not evaluate JavaScript', function()
{
    const a = fresh();
    err(get(a, '/users', { query: { '$filter': 'constructor.constructor(1)' } }), 400, 'Request_UnsupportedQuery');
    err(get(a, '/users', { query: { '$filter': "department eq 'IT' or" } }), 400, 'Request_UnsupportedQuery');
    err(get(a, '/users', { query: { '$filter': 'missing eq true' } }), 400, 'Request_UnsupportedQuery');
});
test('$orderby orders visible values', function()
{
    const r = get(fresh(), '/users?$orderby=displayName desc');
    assert.deepEqual(Array.from(r.body.value, function(v) { return v.displayName; }),
        ['Chloe Rivera','Ben Ortega','Ada Martin']);
});
test('paging uses Graph nextLink and can be followed as absolute URI', function()
{
    const a = fresh();
    const first = get(a, '/users?$top=1&$select=id,displayName');
    assert.equal(first.status, 200);
    assert.equal(first.body.value.length, 1);
    assert.ok(first.body['@odata.nextLink'].startsWith(base + '/users?'));
    const second = get(a, first.body['@odata.nextLink']);
    assert.equal(second.status, 200);
    assert.equal(second.body.value[0].id, U2);
    const third = get(a, second.body['@odata.nextLink']);
    assert.equal(third.body.value[0].id, U3);
    assert.equal(third.body['@odata.nextLink'], undefined);
});
test('$count requires eventual consistency and reflects pre-page total', function()
{
    const a = fresh();
    err(get(a, '/users?$count=true'), 400, 'Request_UnsupportedQuery');
    const r = get(a, '/users?$count=true&$top=1', { headers: { ConsistencyLevel: 'eventual' } });
    assert.equal(r.body['@odata.count'], 3);
    assert.equal(r.body.value.length, 1);
});
test('/users/$count returns text/plain count', function()
{
    const r = get(fresh(), '/users/$count', { headers: { ConsistencyLevel: 'eventual' } });
    assert.equal(r.status, 200);
    assert.equal(r.body, '3');
    assert.equal(r.headers['Content-Type'], 'text/plain');
});
test('unsupported query options reject instead of silently ignoring', function()
{
    const a = fresh();
    err(get(a, '/users?$skip=1'), 400, 'Request_UnsupportedQuery');
    err(get(a, '/users?$expand=manager'), 400, 'Request_UnsupportedQuery');
    err(get(a, '/users?$search=ada'), 400, 'Request_UnsupportedQuery');
    err(get(a, '/users?$top=1000'), 400, 'Request_UnsupportedQuery');
    err(get(a, '/users?$skiptoken=-2'), 400, 'Request_UnsupportedQuery');
});
test('unknown resource, unsupported version/host and unknown method', function()
{
    const a = fresh();
    err(get(a, '/unknownThings'), 404, 'Request_ResourceNotFound');
    err(get(a, '/beta/users'), 400, 'NotImplemented');
    err(get(a, 'http://graph.microsoft.com/v1.0/users'), 400, 'Request_BadRequest');
    err(get(a, 'https://example.com/v1.0/users'), 400, 'Request_BadRequest');
    err(call(a, 'TRACE', '/users'), 405, 'MethodNotAllowed');
});

// CRUD

test('POST user requires required fields, returns 201 and does not retain password', function()
{
    const a = fresh();
    const body = {
        displayName: 'Dana Owens', userPrincipalName: 'dana@northwind.example',
        mailNickname: 'dana', accountEnabled: true, department: 'Research',
        passwordProfile: { password: 'FAKE-ONLY', forceChangePasswordNextSignIn: true }
    };
    const r = call(a, 'POST', '/users', { body });
    assert.equal(r.status, 201);
    assert.equal(r.body.displayName, 'Dana Owens');
    assert.equal(r.headers.Location, base + '/users/' + r.body.id);
    assert.equal(get(a, '/users', { query: { '$filter': "department eq 'Research'" } }).body.value.length, 1);
    assert.equal(Object.hasOwn(a.DB.users[3], 'passwordProfile'), false);
});
test('POST rejects incomplete user', function()
{
    err(call(fresh(), 'POST', '/users', { body: { displayName: 'Incomplete' } }), 400, 'Request_BadRequest');
});
test('POST user rejects duplicate userPrincipalName', function()
{
    const a = fresh();
    const r = call(a, 'POST', '/users', { body: {
        displayName: 'Duplicate', userPrincipalName: 'Ada.Martin@northwind.example',
        mailNickname: 'duplicate', accountEnabled: true, passwordProfile: { password: 'FAKE' }
    } });
    err(r, 400, 'Request_ResourceConflict');
    assert.equal(a.DB.users.length, 3);
});
test('PATCH user applies update with HTTP 204', function()
{
    const a = fresh();
    const r = call(a, 'PATCH', '/users/' + U1, { body: { department: 'Operations', accountEnabled: false } });
    assert.equal(r.status, 204);
    assert.equal(r.body, null);
    const updated = get(a, '/users/' + U1, { query: { '$select': 'department,accountEnabled' } });
    assert.equal(updated.body.department, 'Operations');
    assert.equal(updated.body.accountEnabled, false);
});
test('PATCH refuses id, appId and arbitrary properties', function()
{
    const a = fresh();
    err(call(a, 'PATCH', '/users/' + U1, { body: { id: 'x' } }), 400, 'Request_BadRequest');
    err(call(a, 'PATCH', '/users/' + U1, { body: { '__proto__': 'ignored', other: true } }), 400, 'Request_BadRequest');
});
test('DELETE removes a user and cleans memberships', function()
{
    const a = fresh();
    assert.equal(call(a, 'DELETE', '/users/' + U1).status, 204);
    err(get(a, '/users/' + U1), 404, 'Request_ResourceNotFound');
    assert.equal(ids(get(a, '/groups/' + G1 + '/members')).includes(U1), false);
});
test('create and update security groups', function()
{
    const a = fresh();
    const created = call(a, 'POST', '/groups', { body: {
        displayName: 'SG-Demo', mailNickname: 'sg-demo', mailEnabled: false,
        securityEnabled: true, groupTypes: []
    } });
    assert.equal(created.status, 201);
    assert.equal(created.body.displayName, 'SG-Demo');
    assert.equal(Object.hasOwn(created.body, 'memberIds'), false);
    assert.equal(call(a, 'PATCH', '/groups/' + created.body.id,
        { body: { description: 'New description' } }).status, 204);
    assert.equal(get(a, '/groups/' + created.body.id).body.description, 'New description');
});
test('create an application then associated service principal', function()
{
    const a = fresh();
    const app = call(a, 'POST', '/applications', { body: { displayName: 'Inventory Demo' } });
    assert.equal(app.status, 201);
    assert.ok(app.body.appId);
    const sp = call(a, 'POST', '/servicePrincipals', { body: { appId: app.body.appId } });
    assert.equal(sp.status, 201);
    assert.equal(sp.body.displayName, 'Inventory Demo');
    assert.equal(sp.body.appId, app.body.appId);
});
test('reject service principal without an application', function()
{
    err(call(fresh(), 'POST', '/servicePrincipals', { body: {
        appId: 'f0000000-0000-4000-8000-000000009999'
    } }), 400, 'Request_BadRequest');
});
test('directory roles and organization are read-only', function()
{
    const a = fresh();
    err(call(a, 'POST', '/directoryRoles', { body: { displayName: 'X' } }), 405, 'MethodNotAllowed');
    err(call(a, 'DELETE', '/organization/' + a.DB.tenantId), 405, 'MethodNotAllowed');
});

// Group memberships / navigation

test('list direct group members', function()
{
    assert.deepEqual(ids(get(fresh(), '/groups/' + G2 + '/members')), [G1,U2]);
});
test('list transitive group members including nested group', function()
{
    const members = ids(get(fresh(), '/groups/' + G2 + '/transitiveMembers'));
    assert.deepEqual(members, [G1,U1,U3,U2]);
});
test('list user memberOf and role membership', function()
{
    const a = fresh();
    const groups = ids(get(a, '/users/' + U1 + '/memberOf'));
    assert.ok(groups.includes(G1));
    assert.ok(groups.includes(R1));
    assert.deepEqual(ids(get(a, '/directoryRoles/' + R1 + '/members')), [U1]);
});
test('POST and DELETE group $ref update membership with HTTP 204', function()
{
    const a = fresh();
    const ref = { '@odata.id': base + '/directoryObjects/' + U2 };
    assert.equal(call(a, 'POST', '/groups/' + G1 + '/members/$ref', { body: ref }).status, 204);
    assert.ok(ids(get(a, '/groups/' + G1 + '/members')).includes(U2));
    assert.equal(call(a, 'DELETE', '/groups/' + G1 + '/members/' + U2 + '/$ref').status, 204);
    assert.ok(!ids(get(a, '/groups/' + G1 + '/members')).includes(U2));
});
test('duplicate membership fails without adding a second copy', function()
{
    const a = fresh();
    err(call(a, 'POST', '/groups/' + G1 + '/members/$ref', { body: {
        '@odata.id': base + '/directoryObjects/' + U1
    } }), 400, 'Request_BadRequest');
    assert.equal(ids(get(a, '/groups/' + G1 + '/members')).filter(function(id) { return id === U1; }).length, 1);
});
test('group nesting cannot create a cycle', function()
{
    const a = fresh();
    err(call(a, 'POST', '/groups/' + G1 + '/members/$ref', { body: {
        '@odata.id': base + '/groups/' + G2
    } }), 400, 'Request_BadRequest');
});
test('Microsoft 365 group refuses nested groups and service principals', function()
{
    const a = fresh();
    for (const id of [G1,SP1])
    {
        err(call(a, 'POST', '/groups/' + G3 + '/members/$ref', { body: {
            '@odata.id': base + '/directoryObjects/' + id
        } }), 400, 'Request_BadRequest');
    }
});
test('application and directory role cannot become security group members', function()
{
    const a = fresh();
    for (const id of [a.DB.applications[0].id, R1])
    {
        err(call(a, 'POST', '/groups/' + G1 + '/members/$ref', { body: {
            '@odata.id': base + '/directoryObjects/' + id
        } }), 400, 'Request_BadRequest');
    }
});
test('POST rejects read-only collection query options', function()
{
    err(call(fresh(), 'POST', '/groups?$filter=displayName eq \'X\'', {
        body: { displayName: 'X' }
    }), 400, 'Request_UnsupportedQuery');
});
test('group reference to nonexistent object returns 404', function()
{
    const a = fresh();
    err(call(a, 'POST', '/groups/' + G1 + '/members/$ref', { body: {
        '@odata.id': base + '/directoryObjects/unknown'
    } }), 404, 'Request_ResourceNotFound');
});
test('no silent fallback for unknown navigation paths', function()
{
    err(get(fresh(), '/groups/' + G1 + '/owners'), 404, 'Request_ResourceNotFound');
});

// Session / reset

test('requireAuth blocks until simulated Connect', function()
{
    const a = new EntraDirectory(undefined, { requireAuth: true });
    err(get(a, '/users'), 401, 'InvalidAuthenticationToken');
    const session = a.Connect(['User.Read.All']);
    assert.equal(session.connected, true);
    assert.equal(get(a, '/users').status, 200);
    a.Disconnect();
    err(get(a, '/users'), 401, 'InvalidAuthenticationToken');
});
test('Connect does not authenticate real credentials or enforce scopes', function()
{
    const a = new EntraDirectory(undefined, { requireAuth: true });
    a.Connect([]);
    assert.equal(get(a, '/users').status, 200);
});
test('Reset undoes mutations and disconnects', function()
{
    const a = fresh();
    a.Connect(['Group.Read.All']);
    call(a, 'PATCH', '/users/' + U1, { body: { department: 'Changed' } });
    a.Reset();
    assert.equal(a.DB.users[0].department, 'IT');
    assert.equal(a.Session.connected, false);
});


// Offline HTML demo wiring (script-level smoke test, not graphical rendering)

test('demo loads ENTRA_CORE.js through a relative classic script', function()
{
    const html = fs.readFileSync(path.join(__dirname, '../tools/EntraDirectory-demo.html'), 'utf8');
    assert.match(html, /<script src="\.\.\/res\/ENTRA_CORE\.js"><\/script>/);
});
test('demo can send a query, mutate a user and reset via its controls', function()
{
    const html = fs.readFileSync(path.join(__dirname, '../tools/EntraDirectory-demo.html'), 'utf8');
    const match = /<script>\s*([\s\S]*?)<\/script>/.exec(html);
    assert.ok(match);
    const elements = new Map();
    for (const key of ['examples','method','endpoint','body','output','status','send','reset'])
    {
        elements.set(key, {
            value: '', textContent: '', style: {}, children: [], handlers: {},
            appendChild(child) { this.children.push(child); },
            addEventListener(kind, handler) { this.handlers[kind] = handler; }
        });
    }
    const document = {
        getElementById(id) { return elements.get(id); },
        createElement() { return { value: '', textContent: '' }; }
    };
    const context = vm.createContext({ document });
    vm.runInContext(source + '\n' + match[1], context, { filename: 'EntraDirectory-demo.inline.js' });
    elements.get('send').handlers.click();
    assert.equal(JSON.parse(elements.get('output').textContent).status, 200);
    elements.get('examples').value = '7';
    elements.get('examples').handlers.change();
    elements.get('send').handlers.click();
    assert.equal(JSON.parse(elements.get('output').textContent).status, 204);
    assert.equal(context.oEntra.DB.users[0].accountEnabled, false);
    elements.get('reset').handlers.click();
    assert.equal(context.oEntra.DB.users[0].accountEnabled, true);
});

console.log('\n' + passed + ' ENTRA_CORE tests passed.');
