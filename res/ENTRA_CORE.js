/* IGAsim ENTRA_CORE.js v0.1 — offline Microsoft Graph-style directory simulator.
 * Browser classic script, plain constructor, self-contained fictional tenant.
 * No network, real tokens, real permissions, or production-grade Microsoft Graph behavior.
 */

function EntraDirectory(seed, options)
{
    if (!(this instanceof EntraDirectory)) return new EntraDirectory(seed, options);

    // Canonical fictional fixture, intentionally independent of AD_CORE.js.
    // IDs and domain names are synthetic; every instance has its own data.
    this.DB = {
        "tenantId": "f0000000-0000-4000-8000-000000000001",
        "defaultDomain": "northwind.example",
        "organization": [
            {
                "id": "f0000000-0000-4000-8000-000000000001",
                "displayName": "Northwind Demo Tenant",
                "verifiedDomains": [
                    { "name": "northwind.example", "isDefault": true, "isInitial": false, "type": "Managed" }
                ]
            }
        ],
        "users": [
            {
                "id": "f0000000-0000-4000-8000-000000000101",
                "displayName": "Ada Martin",
                "givenName": "Ada",
                "surname": "Martin",
                "userPrincipalName": "ada.martin@northwind.example",
                "mail": "ada.martin@northwind.example",
                "mailNickname": "ada.martin",
                "department": "IT",
                "jobTitle": "Systems Engineer",
                "accountEnabled": true,
                "userType": "Member",
                "businessPhones": []
            },
            {
                "id": "f0000000-0000-4000-8000-000000000102",
                "displayName": "Ben Ortega",
                "givenName": "Ben",
                "surname": "Ortega",
                "userPrincipalName": "ben.ortega@northwind.example",
                "mail": "ben.ortega@northwind.example",
                "mailNickname": "ben.ortega",
                "department": "Finance",
                "jobTitle": "Accountant",
                "accountEnabled": true,
                "userType": "Member",
                "businessPhones": []
            },
            {
                "id": "f0000000-0000-4000-8000-000000000103",
                "displayName": "Chloe Rivera",
                "givenName": "Chloe",
                "surname": "Rivera",
                "userPrincipalName": "chloe.rivera@northwind.example",
                "mail": "chloe.rivera@northwind.example",
                "mailNickname": "chloe.rivera",
                "department": "IT",
                "jobTitle": "Support Specialist",
                "accountEnabled": false,
                "userType": "Member",
                "businessPhones": []
            }
        ],
        "groups": [
            {
                "id": "f0000000-0000-4000-8000-000000000201",
                "displayName": "SG-IT",
                "description": "IT security group",
                "mailEnabled": false,
                "mailNickname": "sg-it",
                "securityEnabled": true,
                "groupTypes": [],
                "memberIds": ["f0000000-0000-4000-8000-000000000101","f0000000-0000-4000-8000-000000000103"]
            },
            {
                "id": "f0000000-0000-4000-8000-000000000202",
                "displayName": "SG-All-Staff",
                "description": "Nested corporate security group",
                "mailEnabled": false,
                "mailNickname": "sg-all-staff",
                "securityEnabled": true,
                "groupTypes": [],
                "memberIds": ["f0000000-0000-4000-8000-000000000201","f0000000-0000-4000-8000-000000000102"]
            },
            {
                "id": "f0000000-0000-4000-8000-000000000203",
                "displayName": "Team-Finance",
                "description": "Microsoft 365 demo group",
                "mailEnabled": true,
                "mailNickname": "team-finance",
                "securityEnabled": false,
                "groupTypes": ["Unified"],
                "memberIds": ["f0000000-0000-4000-8000-000000000102"]
            }
        ],
        "applications": [
            {
                "id": "f0000000-0000-4000-8000-000000000301",
                "appId": "f0000000-0000-4000-8000-000000000401",
                "displayName": "Demo Reporting Portal",
                "signInAudience": "AzureADMyOrg"
            }
        ],
        "servicePrincipals": [
            {
                "id": "f0000000-0000-4000-8000-000000000501",
                "appId": "f0000000-0000-4000-8000-000000000401",
                "displayName": "Demo Reporting Portal",
                "servicePrincipalType": "Application",
                "accountEnabled": true
            }
        ],
        "directoryRoles": [
            {
                "id": "f0000000-0000-4000-8000-000000000601",
                "displayName": "Directory Readers",
                "description": "Sample active directory role",
                "memberIds": ["f0000000-0000-4000-8000-000000000101"]
            }
        ],
        "devices": [
            {
                "id": "f0000000-0000-4000-8000-000000000701",
                "displayName": "NW-LAPTOP-01",
                "deviceId": "f0000000-0000-4000-8000-000000000801",
                "accountEnabled": true,
                "operatingSystem": "Windows"
            }
        ]
    };

    var original = seed === undefined ? clone(this.DB) : clone(seed);
    validateDB(original);
    this.DB = clone(original);
    var settings = options || {};
    var nextSequence = 900;
    var self = this;

    // Authentication here only simulates a connected context. It never validates tokens.
    this.Session = { connected: false, scopes: [] };

    this.Connect = function(scopes)
    {
        this.Session.connected = true;
        this.Session.scopes = Array.isArray(scopes) ? scopes.slice() : [];
        return clone(this.Session);
    };

    this.Disconnect = function()
    {
        this.Session.connected = false;
        this.Session.scopes = [];
    };

    this.Reset = function()
    {
        this.DB = clone(original);
        nextSequence = 900;
        this.Disconnect();
    };

    // Synchronous Response-like value: { status, headers, body }.
    // No HTTP requests, promises, credentials or network access is required.
    this.Graph = function(method, endpoint, request)
    {
        try
        {
            var verb = String(method || '').toUpperCase();
            if (!['GET','POST','PATCH','DELETE'].includes(verb))
                return failure(405, 'MethodNotAllowed', 'Unsupported HTTP method.');
            if (settings.requireAuth === true && !this.Session.connected)
                return failure(401, 'InvalidAuthenticationToken', 'No simulated Graph session. Call Connect() first.');

            var target = parseEndpoint(endpoint);
            var query = mergeQuery(target.query, (request || {}).query);
            var body = (request || {}).body;
            var headers = (request || {}).headers || {};
            var parts = target.segments;
            if (!parts.length) return failure(404, 'Request_ResourceNotFound', 'Unknown Graph endpoint.');

            var collection = parts[0];
            if (!isCollection(collection))
                return failure(404, 'Request_ResourceNotFound', 'Unknown Graph resource: ' + collection);

            if (parts.length === 1)
            {
                if (verb === 'GET') return listCollection(collection, query, headers, target.path);
                if (verb === 'POST')
                {
                    checkQuery(query, []);
                    return createObject(collection, body);
                }
                return failure(405, 'MethodNotAllowed', 'Method not supported for this collection.');
            }

            if (parts.length === 2 && parts[1] === '$count')
            {
                if (verb !== 'GET') return failure(405, 'MethodNotAllowed', 'Count is read-only.');
                var countQuery = mergeQuery(query, { '$count': 'true' });
                var countResult = listCollection(collection, countQuery, headers, '/' + collection);
                if (countResult.status !== 200) return countResult;
                return success(200, String(countResult.body['@odata.count']), { 'Content-Type': 'text/plain' });
            }

            var item = locate(collection, parts[1]);
            if (!item) return failure(404, 'Request_ResourceNotFound', 'Object not found.');
            if (parts.length === 2)
            {
                if (verb === 'GET') return getObject(collection, item, query);
                if (verb === 'PATCH') return updateObject(collection, item, body);
                if (verb === 'DELETE') return deleteObject(collection, item);
                return failure(405, 'MethodNotAllowed', 'Method not supported for this resource.');
            }

            if (collection === 'groups' && parts[2] === 'members')
            {
                if (parts.length === 3 && verb === 'GET')
                    return listNavigation('groups', item, false, query, headers, target.path);
                if (parts.length === 4 && parts[3] === '$ref' && verb === 'POST')
                    return addGroupMember(item, body);
                if (parts.length === 5 && parts[4] === '$ref' && verb === 'DELETE')
                    return removeGroupMember(item, parts[3]);
            }
            if (collection === 'groups' && parts[2] === 'transitiveMembers' && parts.length === 3 && verb === 'GET')
                return listNavigation('groups', item, true, query, headers, target.path);
            if ((collection === 'users' || collection === 'groups') && parts[2] === 'memberOf' && parts.length === 3 && verb === 'GET')
                return listNavigation('memberOf', item, false, query, headers, target.path);
            if (collection === 'directoryRoles' && parts[2] === 'members' && parts.length === 3 && verb === 'GET')
                return listNavigation('directoryRoles', item, false, query, headers, target.path);

            return failure(404, 'Request_ResourceNotFound', 'Unsupported Graph path.');
        }
        catch (error)
        {
            return failure(error.status || 400, error.code || 'BadRequest', error.message || 'Invalid request.');
        }
    };

    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function same(a, b) { return String(a).toLowerCase() === String(b).toLowerCase(); }
    function owns(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
    function bad(message, code)
    {
        var error = new Error(message);
        error.status = 400;
        error.code = code || 'Request_BadRequest';
        throw error;
    }
    function failure(status, code, message)
    {
        return {
            status: status,
            headers: { 'Content-Type': 'application/json' },
            body: { error: { code: code, message: message } }
        };
    }
    function success(status, body, extraHeaders)
    {
        var headers = status === 204 ? {} : { 'Content-Type': 'application/json' };
        if (extraHeaders) Object.assign(headers, extraHeaders);
        return { status: status, headers: headers, body: body === undefined ? null : body };
    }
    function validateDB(db)
    {
        if (!db || typeof db !== 'object' || Array.isArray(db)) bad('Directory seed must be an object.');
        for (var name of ['users','groups','applications','servicePrincipals','directoryRoles','devices','organization'])
        {
            if (!Array.isArray(db[name])) bad('Directory seed missing array: ' + name);
            for (var entry of db[name])
            {
                if (!entry || typeof entry.id !== 'string') bad('Each directory object must have an ID.');
            }
        }
        if (typeof db.tenantId !== 'string') bad('Directory seed missing tenantId.');
    }
    function isCollection(name)
    {
        return ['users','groups','applications','servicePrincipals','directoryRoles','devices','organization'].includes(name);
    }
    function parseEndpoint(endpoint)
    {
        if (typeof endpoint !== 'string' || !endpoint.trim()) bad('Endpoint is required.');
        var url = endpoint.trim();
        if (/^https?:\/\//i.test(url))
        {
            if (!/^https:\/\/graph\.microsoft\.com(?=\/|\?|$)/i.test(url))
                bad('Only https://graph.microsoft.com is supported.');
            url = url.replace(/^https:\/\/graph\.microsoft\.com/i, '');
        }
        if (/^\/\//.test(url) || url.indexOf('#') >= 0) bad('Invalid Graph endpoint.');
        if (url[0] !== '/') url = '/' + url;
        var index = url.indexOf('?');
        var path = index >= 0 ? url.slice(0, index) : url;
        var rawQuery = index >= 0 ? url.slice(index + 1) : '';
        if (/^\/beta(?:\/|$)/i.test(path)) bad('The beta API is not supported.', 'NotImplemented');
        if (!/^\/v1\.0(?:\/|$)/i.test(path)) path = '/v1.0' + path;
        var segments = path.split('/').filter(Boolean).slice(1).map(function(segment)
        {
            var decoded = decodeURIComponent(segment);
            if (decoded.indexOf('/') >= 0) bad('Encoded path separators are not supported.');
            return decoded;
        });
        var q = Object.create(null);
        if (rawQuery)
        {
            for (var chunk of rawQuery.split('&'))
            {
                if (!chunk) continue;
                var eq = chunk.indexOf('=');
                var key = decodeURIComponent((eq < 0 ? chunk : chunk.slice(0, eq)).replace(/\+/g, ' '));
                var val = decodeURIComponent((eq < 0 ? '' : chunk.slice(eq + 1)).replace(/\+/g, ' '));
                if (!key || owns(q, key)) bad('Invalid or duplicate query parameter.');
                q[key] = val;
            }
        }
        return { path: path, segments: segments, query: q };
    }
    function mergeQuery(a, b)
    {
        var result = Object.create(null);
        for (var key of Object.keys(a || {})) result[key] = a[key];
        if (b !== undefined)
        {
            if (!b || typeof b !== 'object' || Array.isArray(b)) bad('Query must be an object.');
            for (var name of Object.keys(b)) result[name] = b[name];
        }
        return result;
    }
    function checkQuery(query, allowed)
    {
        for (var key of Object.keys(query))
        {
            if (!allowed.includes(key)) bad('Query option ' + key + ' is not implemented.', 'Request_UnsupportedQuery');
        }
    }
    function recordForId(id)
    {
        for (var name of ['users','groups','servicePrincipals','devices','applications','directoryRoles'])
        {
            var found = locate(name, id);
            if (found) return { collection: name, item: found };
        }
        return null;
    }
    function locate(collection, identity)
    {
        if (!Array.isArray(self.DB[collection])) return null;
        for (var item of self.DB[collection])
        {
            if (same(item.id, identity) || (collection === 'users' && same(item.userPrincipalName, identity)))
                return item;
        }
        return null;
    }
    function readableFields(collection)
    {
        var fields = {
            users: ['id','displayName','givenName','surname','userPrincipalName','mail',
                    'mailNickname','department','jobTitle','accountEnabled','userType',
                    'businessPhones','mobilePhone','officeLocation','preferredLanguage'],
            groups: ['id','displayName','description','mailEnabled','mailNickname',
                     'securityEnabled','groupTypes'],
            applications: ['id','appId','displayName','signInAudience'],
            servicePrincipals: ['id','appId','displayName','servicePrincipalType','accountEnabled'],
            directoryRoles: ['id','displayName','description'],
            devices: ['id','displayName','deviceId','accountEnabled','operatingSystem'],
            organization: ['id','displayName','verifiedDomains']
        };
        if (collection === 'directoryObjects')
        {
            var all = [];
            for (var name of ['users','groups','servicePrincipals','directoryRoles','devices'])
                all.push.apply(all, fields[name]);
            return all;
        }
        return fields[collection] || [];
    }
    function project(collection, item, select)
    {
        var keys;
        if (select)
        {
            keys = String(select).split(',').map(function(v) { return v.trim(); });
            if (!keys.length || keys.some(function(x) { return !/^[A-Za-z][\w]*$/.test(x); }))
                bad('Invalid $select.', 'Request_UnsupportedQuery');
        }
        else if (collection === 'users')
        {
            keys = ['id','displayName','givenName','surname','userPrincipalName','mail','jobTitle',
                    'businessPhones','mobilePhone','officeLocation','preferredLanguage'];
        }
        else keys = Object.keys(item).filter(function(k) { return k !== 'memberIds'; });

        var output = {};
        for (var key of keys)
        {
            var field = readableFields(collection).find(function(k) { return same(k, key); });
            if (select && !field) bad('Unsupported $select property: ' + key, 'Request_UnsupportedQuery');
            var actual = Object.keys(item).find(function(k) { return same(k, key); });
            if (actual !== undefined) output[actual] = clone(item[actual]);
            else if (select) output[field] = null;
        }
        return output;
    }
    function getObject(collection, item, query)
    {
        checkQuery(query, ['$select']);
        return success(200, project(collection, item, query.$select));
    }
    function parseFilter(expression, collection)
    {
        if (typeof expression !== 'string' || expression.length > 2000)
            bad('Invalid $filter expression.', 'Request_UnsupportedQuery');
        var tokens = [];
        var i = 0;
        while (i < expression.length)
        {
            if (/\s/.test(expression[i])) { i++; continue; }
            if (expression[i] === "'")
            {
                var value = '';
                i++;
                var closed = false;
                while (i < expression.length)
                {
                    if (expression[i] === "'")
                    {
                        if (expression[i + 1] === "'") { value += "'"; i += 2; continue; }
                        i++; closed = true; break;
                    }
                    value += expression[i++];
                }
                if (!closed) bad('Unterminated string in $filter.', 'Request_UnsupportedQuery');
                tokens.push({ type: 'value', value: value });
                continue;
            }
            if (/[(),]/.test(expression[i]))
            {
                tokens.push({ type: expression[i], value: expression[i] });
                i++;
                continue;
            }
            var match = /^(?:-?\d+(?:\.\d+)?|[A-Za-z_][\w]*)/.exec(expression.slice(i));
            if (!match) bad('Unsupported token in $filter.', 'Request_UnsupportedQuery');
            var word = match[0];
            if (/^-?\d/.test(word)) tokens.push({ type: 'value', value: Number(word) });
            else if (/^(true|false|null)$/i.test(word))
                tokens.push({ type: 'value', value: /^(null)$/i.test(word) ? null : /^true$/i.test(word) });
            else tokens.push({ type: 'word', value: word });
            i += word.length;
        }
        var pos = 0;
        function peek() { return tokens[pos]; }
        function consume(type, word)
        {
            var token = tokens[pos];
            if (!token || token.type !== type || (word && !same(token.value, word)))
                bad('Invalid $filter syntax.', 'Request_UnsupportedQuery');
            pos++;
            return token.value;
        }
        function attr(name, item)
        {
            var key = Object.keys(item).find(function(k) { return same(k, name); });
            return key === undefined ? undefined : item[key];
        }
        function compare(left, right, op)
        {
            if (op === 'eq' || op === 'ne')
            {
                var equal = typeof left === 'string' && typeof right === 'string'
                    ? same(left, right) : left === right;
                return op === 'eq' ? equal : !equal;
            }
            if (left === undefined || left === null || right === null) return false;
            if (typeof left !== typeof right) return false;
            if (typeof left === 'string') { left = left.toLowerCase(); right = right.toLowerCase(); }
            if (op === 'gt') return left > right;
            if (op === 'ge') return left >= right;
            if (op === 'lt') return left < right;
            if (op === 'le') return left <= right;
            bad('Unsupported comparison operator.', 'Request_UnsupportedQuery');
        }
        function validateProperty(name)
        {
            if (!/^[A-Za-z][\w]*$/.test(name) || same(name, 'memberIds'))
                bad('Unsupported filter property.', 'Request_UnsupportedQuery');
            if (!readableFields(collection).some(function(k) { return same(k, name); }))
                bad('Unknown $filter property: ' + name, 'Request_UnsupportedQuery');
        }
        function parsePrimary()
        {
            if (peek() && peek().type === '(')
            {
                consume('(');
                var nested = parseOr();
                consume(')');
                return nested;
            }
            var identifier = consume('word');
            if (peek() && peek().type === '(')
            {
                var fn = identifier.toLowerCase();
                if (!['startswith','endswith','contains'].includes(fn))
                    bad('Unsupported $filter function.', 'Request_UnsupportedQuery');
                consume('(');
                var property = consume('word');
                validateProperty(property);
                consume(',');
                var needle = consume('value');
                if (typeof needle !== 'string') bad('Expected a string.', 'Request_UnsupportedQuery');
                consume(')');
                return function(item)
                {
                    var value = attr(property, item);
                    if (typeof value !== 'string') return false;
                    value = value.toLowerCase();
                    var text = needle.toLowerCase();
                    if (fn === 'startswith') return value.startsWith(text);
                    if (fn === 'endswith') return value.endsWith(text);
                    return value.includes(text);
                };
            }
            validateProperty(identifier);
            var op = consume('word').toLowerCase();
            if (!['eq','ne','gt','ge','lt','le'].includes(op))
                bad('Unsupported $filter operator.', 'Request_UnsupportedQuery');
            var expected = consume('value');
            return function(item) { return compare(attr(identifier, item), expected, op); };
        }
        function parseNot()
        {
            if (peek() && peek().type === 'word' && same(peek().value, 'not'))
            {
                consume('word');
                var predicate = parseNot();
                return function(item) { return !predicate(item); };
            }
            return parsePrimary();
        }
        function conjunction(a, b) { return function(item) { return a(item) && b(item); }; }
        function disjunction(a, b) { return function(item) { return a(item) || b(item); }; }
        function parseAnd()
        {
            var left = parseNot();
            while (peek() && peek().type === 'word' && same(peek().value, 'and'))
            {
                consume('word');
                var right = parseNot();
                left = conjunction(left, right);
            }
            return left;
        }
        function parseOr()
        {
            var left = parseAnd();
            while (peek() && peek().type === 'word' && same(peek().value, 'or'))
            {
                consume('word');
                var right = parseAnd();
                left = disjunction(left, right);
            }
            return left;
        }
        var predicate = parseOr();
        if (pos !== tokens.length) bad('Unexpected $filter content.', 'Request_UnsupportedQuery');
        return predicate;
    }
    function listCollection(collection, query, headers, path)
    {
        if (collection === 'organization')
        {
            checkQuery(query, ['$select']);
            return success(200, {
                '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#organization',
                value: self.DB.organization.map(function(item) { return project(collection, item, query.$select); })
            });
        }
        return listValues(collection, self.DB[collection], query, headers, path);
    }
    function listValues(collection, records, query, headers, path)
    {
        checkQuery(query, ['$filter','$select','$orderby','$top','$count','$skiptoken']);
        if (owns(query, '$count') && !['true','false'].includes(String(query.$count).toLowerCase()))
            bad('$count must be true or false.', 'Request_UnsupportedQuery');
        var includeCount = String(query.$count).toLowerCase() === 'true';
        if (includeCount)
        {
            var consistency = Object.keys(headers).find(function(k) { return same(k, 'ConsistencyLevel'); });
            if (!consistency || !same(headers[consistency], 'eventual'))
                bad('Use ConsistencyLevel: eventual with $count.', 'Request_UnsupportedQuery');
        }
        var values = records.slice();
        if (query.$filter)
        {
            var predicate = parseFilter(query.$filter, collection);
            values = values.filter(predicate);
        }
        if (query.$orderby)
        {
            var match = /^\s*([A-Za-z][\w]*)(?:\s+(asc|desc))?\s*$/i.exec(query.$orderby);
            if (!match) bad('Unsupported $orderby syntax.', 'Request_UnsupportedQuery');
            var property = match[1];
            if (!readableFields(collection).some(function(k) { return same(k, property); }))
                bad('Unknown $orderby property: ' + property, 'Request_UnsupportedQuery');
            var direction = same(match[2] || 'asc', 'desc') ? -1 : 1;
            values.sort(function(a, b)
            {
                var aKey = Object.keys(a).find(function(k) { return same(k, property); });
                var bKey = Object.keys(b).find(function(k) { return same(k, property); });
                if (!aKey && !bKey) return 0;
                if (!aKey) return -direction;
                if (!bKey) return direction;
                return String(a[aKey]).localeCompare(String(b[bKey])) * direction;
            });
        }
        var offset = query.$skiptoken === undefined ? 0 : Number(query.$skiptoken);
        if (!Number.isSafeInteger(offset) || offset < 0) bad('Invalid $skiptoken.', 'Request_UnsupportedQuery');
        var top = query.$top === undefined ? 100 : Number(query.$top);
        if (!Number.isSafeInteger(top) || top < 1 || top > 999)
            bad('$top must be an integer from 1 to 999.', 'Request_UnsupportedQuery');
        var slice = values.slice(offset, offset + top);
        var payload = {
            '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#' + collection,
            value: slice.map(function(item) { return project(collection, item, query.$select); })
        };
        if (includeCount) payload['@odata.count'] = values.length;
        if (offset + top < values.length)
        {
            var params = mergeQuery(query, { '$skiptoken': String(offset + top) });
            var search = Object.keys(params).map(function(k)
            {
                return encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k]));
            }).join('&');
            payload['@odata.nextLink'] = 'https://graph.microsoft.com' + path + '?' + search;
        }
        return success(200, payload);
    }
    function publicMember(ref)
    {
        return project(ref.collection, ref.item, null);
    }
    function membersOfGroup(group, transitive)
    {
        var seen = new Set();
        var result = [];
        function collect(g)
        {
            for (var id of g.memberIds || [])
            {
                if (seen.has(id)) continue;
                seen.add(id);
                var reference = recordForId(id);
                if (!reference) continue;
                result.push(publicMember(reference));
                if (transitive && reference.collection === 'groups') collect(reference.item);
            }
        }
        collect(group);
        return result;
    }
    function listNavigation(type, item, transitive, query, headers, path)
    {
        var values;
        if (type === 'groups') values = membersOfGroup(item, transitive);
        else if (type === 'directoryRoles')
            values = (item.memberIds || []).map(recordForId).filter(Boolean).map(publicMember);
        else
        {
            values = self.DB.groups.concat(self.DB.directoryRoles).filter(function(group)
            {
                return (group.memberIds || []).some(function(id) { return same(id, item.id); });
            }).map(function(group) { return project('groups', group, null); });
        }
        return listValues('directoryObjects', values, query, headers, path);
    }
    function generateId()
    {
        var id;
        do
        {
            id = 'f0000000-0000-4000-8000-' + String(nextSequence++).padStart(12, '0');
        }
        while (recordForId(id));
        return id;
    }
    function allowedFields(collection)
    {
        var fields = {
            users: ['displayName','givenName','surname','userPrincipalName','mail','mailNickname',
                    'department','jobTitle','accountEnabled','userType','businessPhones',
                    'mobilePhone','officeLocation','preferredLanguage','passwordProfile'],
            groups: ['displayName','description','mailEnabled','mailNickname','securityEnabled','groupTypes'],
            applications: ['displayName','signInAudience'],
            servicePrincipals: ['displayName','appId','accountEnabled','servicePrincipalType']
        };
        return fields[collection] || [];
    }
    function checkBody(collection, body)
    {
        if (!body || typeof body !== 'object' || Array.isArray(body)) bad('Request body must be an object.');
        for (var key of Object.keys(body))
        {
            if (!allowedFields(collection).includes(key)) bad('Property is not writable: ' + key);
        }
    }
    function checkIdentityUniqueness(collection, candidate, exceptId)
    {
        var field = collection === 'users' ? 'userPrincipalName' : 'appId';
        if (!candidate[field]) return;
        if (self.DB[collection].some(function(item)
        {
            return item.id !== exceptId && item[field] && same(item[field], candidate[field]);
        })) bad(field + ' already exists.', 'Request_ResourceConflict');
    }
    function createObject(collection, body)
    {
        if (!allowedFields(collection).length)
            return failure(405, 'MethodNotAllowed', 'This collection is read-only in the simulator.');
        checkBody(collection, body);
        var item = clone(body);
        if (collection === 'users')
        {
            if (!item.displayName || !item.userPrincipalName || !item.mailNickname ||
                typeof item.accountEnabled !== 'boolean' || !item.passwordProfile ||
                !item.passwordProfile.password)
                bad('Creating a user requires displayName, userPrincipalName, mailNickname, accountEnabled and passwordProfile.password.');
            delete item.passwordProfile;
        }
        if (collection === 'groups')
        {
            if (!item.displayName || !item.mailNickname || typeof item.mailEnabled !== 'boolean' ||
                typeof item.securityEnabled !== 'boolean' || !Array.isArray(item.groupTypes))
                bad('Creating a group requires displayName, mailNickname, mailEnabled, securityEnabled and groupTypes.');
            item.memberIds = [];
        }
        if (collection === 'applications')
        {
            if (!item.displayName) bad('Application displayName is required.');
            item.appId = generateId();
        }
        if (collection === 'servicePrincipals')
        {
            if (!item.appId) bad('Service principal appId is required.');
            if (!self.DB.applications.some(function(app) { return same(app.appId, item.appId); }))
                bad('The referenced application does not exist.');
            item.displayName = item.displayName || self.DB.applications.find(function(app)
            {
                return same(app.appId, item.appId);
            }).displayName;
        }
        item.id = generateId();
        checkIdentityUniqueness(collection, item, null);
        self.DB[collection].push(item);
        return success(201, project(collection, item, null), {
            Location: 'https://graph.microsoft.com/v1.0/' + collection + '/' + item.id
        });
    }
    function updateObject(collection, item, body)
    {
        if (!allowedFields(collection).length)
            return failure(405, 'MethodNotAllowed', 'This collection is read-only in the simulator.');
        checkBody(collection, body);
        if (owns(body, 'passwordProfile')) bad('Password management is not implemented.');
        if (owns(body, 'appId')) bad('appId cannot be changed.');
        var revised = Object.assign({}, item, clone(body));
        checkIdentityUniqueness(collection, revised, item.id);
        for (var key of Object.keys(body)) item[key] = clone(body[key]);
        return success(204);
    }
    function deleteObject(collection, item)
    {
        if (!allowedFields(collection).length)
            return failure(405, 'MethodNotAllowed', 'This collection is read-only in the simulator.');
        var list = self.DB[collection];
        list.splice(list.indexOf(item), 1);
        for (var group of self.DB.groups.concat(self.DB.directoryRoles))
        {
            group.memberIds = (group.memberIds || []).filter(function(id) { return !same(id, item.id); });
        }
        return success(204);
    }
    function addGroupMember(group, body)
    {
        if (!body || typeof body['@odata.id'] !== 'string') bad('Supply @odata.id in the body.');
        var ref = parseEndpoint(body['@odata.id']);
        var seg = ref.segments;
        if (seg.length !== 2 || !['directoryObjects','users','groups','devices','servicePrincipals'].includes(seg[0]))
            bad('Invalid member reference.');
        var member = recordForId(seg[1]);
        if (!member || (seg[0] !== 'directoryObjects' && seg[0] !== member.collection))
            return failure(404, 'Request_ResourceNotFound', 'Referenced member not found.');
        if (!['users','groups','devices','servicePrincipals'].includes(member.collection))
            bad('This object type cannot be a group member.');
        if (!group.securityEnabled && !group.groupTypes.includes('Unified'))
            return failure(403, 'Authorization_RequestDenied', 'This group cannot be managed through Graph.');
        if (group.groupTypes.includes('Unified') && member.collection !== 'users')
            bad('Microsoft 365 groups can contain only users.');
        if (member.collection === 'groups' && (!group.securityEnabled || !member.item.securityEnabled))
            bad('Only security groups can be nested in security groups.');
        if ((group.memberIds || []).some(function(id) { return same(id, member.item.id); }))
            bad('This object is already a member.');
        if (member.collection === 'groups')
        {
            if (same(member.item.id, group.id) || containsMember(member.item, group.id, new Set()))
                bad('Group membership would create a cycle.');
        }
        group.memberIds.push(member.item.id);
        return success(204);
    }
    function containsMember(group, wanted, visited)
    {
        if (visited.has(group.id)) return false;
        visited.add(group.id);
        for (var id of group.memberIds || [])
        {
            if (same(id, wanted)) return true;
            var child = locate('groups', id);
            if (child && containsMember(child, wanted, visited)) return true;
        }
        return false;
    }
    function removeGroupMember(group, memberId)
    {
        var offset = (group.memberIds || []).findIndex(function(id) { return same(id, memberId); });
        if (offset < 0) return failure(404, 'Request_ResourceNotFound', 'Membership not found.');
        group.memberIds.splice(offset, 1);
        return success(204);
    }
}
