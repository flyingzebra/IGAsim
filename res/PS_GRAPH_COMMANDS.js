/* PowerShellJS Microsoft Graph cmdlets — offline adapter to ENTRA_CORE.js.
 * Classic script, plain constructor; no HTTP, credentials, module wrapper or eval.
 */
function PowerShellGraphCommandsContainer()
{
    'use strict';

    if (typeof EntraDirectory === 'undefined')
        throw new Error('Load ENTRA_CORE.js before PS_GRAPH_COMMANDS.js.');

    function list(value)
    {
        if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
        return String(value ?? '').split(',').map(v => v.trim()).filter(Boolean);
    }
    function required(args, field, positional)
    {
        var value = args.has(field) ? args.get(field) : args.positionals[positional || 0];
        if (value === undefined || value === null || value === true || String(value).trim() === '')
            throw problem('MissingParameter', '-' + field + ' is required.');
        return value;
    }
    function problem(code, message)
    {
        var error = new Error(message);
        error.code = code;
        return error;
    }
    function check(args, allowed)
    {
        var unexpected = [...args.parameters.keys()].filter(k => !allowed.includes(k));
        if (unexpected.length)
            throw problem('UnsupportedParameter', 'Unsupported Graph parameter(s): ' + unexpected.map(k => '-' + k).join(', '));
    }
    function enabled(value)
    {
        var word = String(value).toLowerCase().replace(/^\$/, '');
        if (value === true || value === 1 || word === 'true') return true;
        if (value === false || value === 0 || word === 'false') return false;
        throw problem('InvalidParameter', 'Expected $true or $false.');
    }
    function positive(value, name)
    {
        var n = Number(value);
        if (!Number.isSafeInteger(n) || n < 1 || n > 999)
            throw problem('InvalidParameter', name + ' must be an integer from 1 to 999.');
        return n;
    }
    function decodeBody(value, label)
    {
        if (typeof value === 'string')
        {
            try { value = JSON.parse(value); }
            catch (error) { throw problem('InvalidJson', label + ' must contain valid JSON.'); }
        }
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw problem('InvalidParameter', label + ' must contain a JSON object.');
        return JSON.parse(JSON.stringify(value));
    }
    function graphResponse(session, method, endpoint, request)
    {
        var response = session.entra.Graph(method, endpoint, request || {});
        if (response.status < 200 || response.status >= 300)
        {
            var detail = response.body && response.body.error || {};
            throw problem(detail.code || 'GraphRequestError', 'Graph HTTP ' + response.status + ': ' +
                (detail.message || 'Graph request failed.'));
        }
        return response;
    }
    function pack(values) { return { values: values, messages: [], effects: [] }; }
    function empty() { return pack([]); }
    function keyOf(args, input, name)
    {
        if (args.has(name)) return required(args, name);
        if (args.positionals.length) return required(args, name);
        if (input.length === 1 && input[0] && typeof input[0] === 'object')
            return input[0].id || input[0].Id || input[0].userPrincipalName || input[0].UserPrincipalName;
        return undefined;
    }
    function queryFor(args)
    {
        var query = {};
        if (args.has('filter')) query.$filter = String(required(args, 'filter'));
        if (args.has('property') || args.has('select'))
            query.$select = list(args.get('property', args.get('select'))).join(',');
        if (args.has('orderby')) query.$orderby = String(required(args, 'orderby'));
        if (args.has('top')) query.$top = String(positive(args.get('top'), '-Top'));
        if (args.has('countvariable')) query.$count = 'true';
        return query;
    }
    function headerFor(args)
    {
        return args.has('countvariable') ? { 'ConsistencyLevel': 'eventual' } : {};
    }
    function getValues(session, path, query, headers, all, countVariable)
    {
        var output = [];
        var next = path;
        var visited = new Set();
        var pages = 0;
        while (next)
        {
            if (visited.has(next) || ++pages > 100)
                throw problem('ResourceLimit', 'Graph pagination limit or repeated nextLink reached.');
            visited.add(next);
            var response = graphResponse(session, 'GET', next, {
                query: pages === 1 ? query : undefined,
                headers: headers
            });
            var body = response.body;
            if (!body || !Array.isArray(body.value))
                throw problem('EngineContractError', 'Graph collection returned no value array.');
            output.push(...body.value);
            if (output.length > 5000)
                throw problem('ResourceLimit', 'Graph collection exceeds 5000 simulated objects.');
            if (countVariable && pages === 1)
                session.setVariable(String(countVariable).replace(/^\$/, ''), body['@odata.count']);
            next = all ? body['@odata.nextLink'] : null;
        }
        return output;
    }
    function bodyFor(args, allowedFields, booleanFields, arrayFields)
    {
        var body = args.has('bodyparameter') ? decodeBody(args.get('bodyparameter'), '-BodyParameter') : {};
        for (var field of allowedFields)
        {
            var key = field.toLowerCase();
            if (!args.has(key)) continue;
            var value = (booleanFields || []).includes(field) || (arrayFields || []).includes(field)
                ? args.get(key) : required(args, key);
            if ((booleanFields || []).includes(field)) value = enabled(value);
            else if ((arrayFields || []).includes(field)) value = list(value);
            else if (field === 'passwordProfile') value = decodeBody(value, '-PasswordProfile');
            body[field] = value;
        }
        return body;
    }
    function assertNoIdentityFilter(args, id)
    {
        if (id !== undefined && (args.has('filter') || args.has('orderby') || args.has('top') ||
            args.has('all') || args.has('countvariable')))
            throw problem('ParameterSetConflict', 'An object ID cannot be combined with list query parameters.');
    }
    function truthySwitch(args, name)
    {
        return args.has(name) && enabled(args.get(name));
    }
    function registerGraphCommands(engine)
    {
        function register(name, description, run)
        {
            engine.registerCommand({ name: name, aliases: [], description: description, run: run });
        }

        register('Connect-MgGraph', 'Open a simulated Graph session. No Microsoft sign-in occurs.',
            async function({ args, session })
            {
                check(args, ['scopes','tenantid','nowelcome']);
                if (args.has('tenantid') && String(args.get('tenantid')) !== session.entra.DB.tenantId)
                    throw problem('TenantNotFound', 'Only fictional tenant ' + session.entra.DB.tenantId + ' exists.');
                var scopes = args.has('scopes') ? list(args.get('scopes')) : [];
                session.entra.Connect(scopes);
                return empty();
            });
        register('Disconnect-MgGraph', 'Close the simulated Graph session.',
            async function({ args, session })
            {
                check(args, []);
                session.entra.Disconnect();
                return empty();
            });
        register('Get-MgContext', 'Show simulated tenant and connection context (never real tokens).',
            async function({ args, session })
            {
                check(args, []);
                if (!session.entra.Session.connected) return empty();
                return pack([{
                    TenantId: session.entra.DB.tenantId,
                    Scopes: session.entra.Session.scopes.slice(),
                    AuthType: 'Simulated',
                    Environment: 'Global',
                    Simulated: true
                }]);
            });

        function reader(name, collection, idKey)
        {
            register(name, 'Read simulated Microsoft Graph ' + collection + ' via ENTRA_CORE.js.',
                async function({ args, input, session })
                {
                    check(args, [idKey,'filter','property','select','orderby','top','all','countvariable']);
                    var id = keyOf(args, input, idKey);
                    assertNoIdentityFilter(args, id);
                    var query = queryFor(args);
                    if (id !== undefined)
                    {
                        delete query.$top;
                        return pack([graphResponse(session, 'GET', '/v1.0/' + collection + '/' +
                            encodeURIComponent(String(id)), { query: query }).body]);
                    }
                    return pack(getValues(session, '/v1.0/' + collection, query,
                        headerFor(args), truthySwitch(args, 'all'), args.get('countvariable')));
                });
        }
        reader('Get-MgUser', 'users', 'userid');
        reader('Get-MgGroup', 'groups', 'groupid');
        reader('Get-MgApplication', 'applications', 'applicationid');
        reader('Get-MgServicePrincipal', 'servicePrincipals', 'serviceprincipalid');
        reader('Get-MgDevice', 'devices', 'deviceid');
        reader('Get-MgDirectoryRole', 'directoryRoles', 'directoryroleid');

        register('Get-MgOrganization', 'Read the simulated Microsoft Entra tenant organization.',
            async function({ args, session })
            {
                check(args, ['property','select']);
                return pack(getValues(session, '/v1.0/organization', queryFor(args), {}, false));
            });

        function memberReader(name, kind, suffix)
        {
            register(name, 'Enumerate simulated Graph ' + suffix + ' relationships.',
                async function({ args, input, session })
                {
                    var idKey = kind === 'users' ? 'userid' : kind === 'groups' ? 'groupid' : 'directoryroleid';
                    check(args, [idKey,'property','select','top','all','countvariable']);
                    var id = keyOf(args, input, idKey);
                    if (id === undefined) throw problem('MissingParameter', '-' + idKey + ' is required.');
                    return pack(getValues(session, '/v1.0/' + kind + '/' + encodeURIComponent(String(id)) +
                        '/' + suffix, queryFor(args), headerFor(args), truthySwitch(args, 'all'), args.get('countvariable')));
                });
        }
        memberReader('Get-MgGroupMember', 'groups', 'members');
        memberReader('Get-MgGroupTransitiveMember', 'groups', 'transitiveMembers');
        memberReader('Get-MgUserMemberOf', 'users', 'memberOf');
        memberReader('Get-MgGroupMemberOf', 'groups', 'memberOf');
        memberReader('Get-MgDirectoryRoleMember', 'directoryRoles', 'members');

        function create(name, collection, fields, booleans, arrays)
        {
            register(name, 'Create a fictional ' + collection + ' object in Microsoft Graph.',
                async function({ args, session })
                {
                    check(args, ['bodyparameter'].concat(fields.map(f => f.toLowerCase())));
                    var body = bodyFor(args, fields, booleans, arrays);
                    return pack([graphResponse(session, 'POST', '/v1.0/' + collection, { body: body }).body]);
                });
        }
        create('New-MgUser', 'users',
            ['displayName','givenName','surname','userPrincipalName','mail','mailNickname',
             'department','jobTitle','accountEnabled','userType','passwordProfile'],
            ['accountEnabled']);
        create('New-MgGroup', 'groups',
            ['displayName','description','mailEnabled','mailNickname','securityEnabled','groupTypes'],
            ['mailEnabled','securityEnabled'], ['groupTypes']);
        create('New-MgApplication', 'applications', ['displayName','signInAudience']);
        create('New-MgServicePrincipal', 'servicePrincipals',
            ['appId','displayName','accountEnabled','servicePrincipalType'], ['accountEnabled']);

        function update(name, collection, idKey, fields, booleans, arrays)
        {
            register(name, 'Update a fictional ' + collection + ' object via Graph PATCH.',
                async function({ args, session })
                {
                    check(args, [idKey,'bodyparameter','passthru'].concat(fields.map(f => f.toLowerCase())));
                    var id = required(args, idKey);
                    var body = bodyFor(args, fields, booleans, arrays);
                    if (!Object.keys(body).length)
                        throw problem('MissingParameter', 'Specify -BodyParameter or a supported property.');
                    var path = '/v1.0/' + collection + '/' + encodeURIComponent(String(id));
                    graphResponse(session, 'PATCH', path, { body: body });
                    return truthySwitch(args, 'passthru') ? pack([graphResponse(session, 'GET', path).body]) : empty();
                });
        }
        update('Update-MgUser', 'users', 'userid',
            ['displayName','givenName','surname','userPrincipalName','mail','mailNickname',
             'department','jobTitle','accountEnabled','userType','businessPhones',
             'mobilePhone','officeLocation','preferredLanguage'],
            ['accountEnabled'], ['businessPhones']);
        update('Update-MgGroup', 'groups', 'groupid',
            ['displayName','description','mailEnabled','mailNickname','securityEnabled','groupTypes'],
            ['mailEnabled','securityEnabled'], ['groupTypes']);
        update('Update-MgApplication', 'applications', 'applicationid',
            ['displayName','signInAudience']);
        update('Update-MgServicePrincipal', 'servicePrincipals', 'serviceprincipalid',
            ['displayName','accountEnabled','servicePrincipalType'], ['accountEnabled']);

        function remove(name, collection, idKey)
        {
            register(name, 'Delete a fictional ' + collection + ' object.',
                async function({ args, session })
                {
                    check(args, [idKey]);
                    graphResponse(session, 'DELETE', '/v1.0/' + collection + '/' +
                        encodeURIComponent(String(required(args, idKey))));
                    return empty();
                });
        }
        remove('Remove-MgUser', 'users', 'userid');
        remove('Remove-MgGroup', 'groups', 'groupid');
        remove('Remove-MgApplication', 'applications', 'applicationid');
        remove('Remove-MgServicePrincipal', 'servicePrincipals', 'serviceprincipalid');

        register('New-MgGroupMemberByRef', 'Add a user/group/device reference to a simulated Entra group.',
            async function({ args, session })
            {
                check(args, ['groupid','directoryobjectid','bodyparameter']);
                var id = required(args, 'groupid');
                var body = args.has('bodyparameter') ? decodeBody(args.get('bodyparameter'), '-BodyParameter') : null;
                if (!body && args.has('directoryobjectid'))
                    body = { '@odata.id': 'https://graph.microsoft.com/v1.0/directoryObjects/' +
                        encodeURIComponent(String(required(args, 'directoryobjectid'))) };
                if (!body) throw problem('MissingParameter', 'Specify -DirectoryObjectId or -BodyParameter.');
                graphResponse(session, 'POST', '/v1.0/groups/' + encodeURIComponent(String(id)) + '/members/$ref',
                    { body: body });
                return empty();
            });
        register('Remove-MgGroupMemberByRef', 'Remove a direct group member reference.',
            async function({ args, session })
            {
                check(args, ['groupid','directoryobjectid']);
                var group = required(args, 'groupid');
                var member = required(args, 'directoryobjectid');
                graphResponse(session, 'DELETE', '/v1.0/groups/' + encodeURIComponent(String(group)) +
                    '/members/' + encodeURIComponent(String(member)) + '/$ref');
                return empty();
            });

        register('Invoke-MgGraphRequest', 'Send a simulated GET/POST/PATCH/DELETE Graph request.',
            async function({ args, session })
            {
                check(args, ['method','uri','body','bodyparameter','headers','query','outputtype']);
                var method = String(args.get('method', 'GET')).toUpperCase();
                var uri = required(args, 'uri');
                var request = {};
                if (args.has('body') || args.has('bodyparameter'))
                    request.body = decodeBody(args.get('body', args.get('bodyparameter')), '-Body');
                if (args.has('headers')) request.headers = decodeBody(args.get('headers'), '-Headers');
                if (args.has('query')) request.query = decodeBody(args.get('query'), '-Query');
                if (args.has('outputtype') && !['psobject','hashtable'].includes(String(args.get('outputtype')).toLowerCase()))
                    throw problem('UnsupportedParameter', 'Supported -OutputType: PSObject, Hashtable.');
                var response = graphResponse(session, method, String(uri), request);
                return response.body === null || response.body === undefined ? empty() : pack([response.body]);
            });
    }

    this.registerGraphCommands = registerGraphCommands;
    this.VERSION = '0.1.0';
}

var PowerShellGraphCommands = new PowerShellGraphCommandsContainer();
