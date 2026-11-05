/* ActiveDirectoryJS v0.1.2 — plain browser constructor, no module wrapper.
 * All directory data is inline inside this.DB. Load with a classic script tag.
 * Standalone LDAP API simulation only; not an LDAP network server or secure authentication.
 */

function ActiveDirectory(seed, options)
{
    if (!(this instanceof ActiveDirectory)) return new ActiveDirectory(seed, options);

    // Canonical default directory data: edit it HERE, not in an external .json file.
    // A fresh literal is constructed for every instance; file:// works without fetch/CORS.
    this.DB = {
        "domain": "contoso.local",
        "baseDN": "DC=contoso,DC=local",
        "entries": [
            {
                "dn": "DC=contoso,DC=local",
                "attributes": {
                    "objectClass": ["top","domain","domainDNS"],
                    "dc": ["contoso"],
                    "name": ["contoso"]
                }
            },
            {
                "dn": "OU=Users,DC=contoso,DC=local",
                "attributes": {
                    "objectClass": ["top","organizationalUnit"],
                    "ou": ["Users"],
                    "name": ["Users"]
                }
            },
            {
                "dn": "OU=Groups,DC=contoso,DC=local",
                "attributes": {
                    "objectClass": ["top","organizationalUnit"],
                    "ou": ["Groups"],
                    "name": ["Groups"]
                }
            },
            {
                "dn": "OU=Computers,DC=contoso,DC=local",
                "attributes": {
                    "objectClass": ["top","organizationalUnit"],
                    "ou": ["Computers"]
                }
            },
            {
                "dn": "CN=Alice Adams,OU=Users,DC=contoso,DC=local",
                "attributes": {
                    "objectClass": ["top","person","organizationalPerson","user"],
                    "objectCategory": ["person"],
                    "cn": ["Alice Adams"],
                    "givenName": ["Alice"],
                    "sn": ["Adams"],
                    "displayName": ["Alice Adams"],
                    "sAMAccountName": ["alice"],
                    "userPrincipalName": ["alice@contoso.local"],
                    "mail": ["alice@contoso.local"],
                    "department": ["IT"],
                    "userAccountControl": [512]
                },
                "_password": "Password123!"
            },
            {
                "dn": "CN=Bob Baker,OU=Users,DC=contoso,DC=local",
                "attributes": {
                    "objectClass": ["top","person","organizationalPerson","user"],
                    "objectCategory": ["person"],
                    "cn": ["Bob Baker"],
                    "givenName": ["Bob"],
                    "sn": ["Baker"],
                    "displayName": ["Bob Baker"],
                    "sAMAccountName": ["bob"],
                    "userPrincipalName": ["bob@contoso.local"],
                    "mail": ["bob@contoso.local"],
                    "department": ["Finance"],
                    "userAccountControl": [512]
                },
                "_password": "Password123!"
            },
            {
                "dn": "CN=Carol Chen,OU=Users,DC=contoso,DC=local",
                "attributes": {
                    "objectClass": ["top","person","organizationalPerson","user"],
                    "objectCategory": ["person"],
                    "cn": ["Carol Chen"],
                    "givenName": ["Carol"],
                    "sn": ["Chen"],
                    "displayName": ["Carol Chen"],
                    "sAMAccountName": ["carol"],
                    "userPrincipalName": ["carol@contoso.local"],
                    "mail": ["carol@contoso.local"],
                    "department": ["IT"],
                    "userAccountControl": [514]
                },
                "_password": "Password123!"
            },
            {
                "dn": "CN=GG_IT_Admins,OU=Groups,DC=contoso,DC=local",
                "attributes": {
                    "objectClass": ["top","group"],
                    "objectCategory": ["group"],
                    "cn": ["GG_IT_Admins"],
                    "sAMAccountName": ["GG_IT_Admins"],
                    "groupType": [-2147483646],
                    "member": ["CN=Alice Adams,OU=Users,DC=contoso,DC=local"]
                }
            },
            {
                "dn": "CN=GG_Finance,OU=Groups,DC=contoso,DC=local",
                "attributes": {
                    "objectClass": ["top","group"],
                    "objectCategory": ["group"],
                    "cn": ["GG_Finance"],
                    "sAMAccountName": ["GG_Finance"],
                    "groupType": [-2147483646],
                    "member": ["CN=Bob Baker,OU=Users,DC=contoso,DC=local"]
                }
            },
            {
                "dn": "CN=GG_All_Staff,OU=Groups,DC=contoso,DC=local",
                "attributes": {
                    "objectClass": ["top","group"],
                    "objectCategory": ["group"],
                    "cn": ["GG_All_Staff"],
                    "sAMAccountName": ["GG_All_Staff"],
                    "groupType": [-2147483646],
                    "member": ["CN=GG_IT_Admins,OU=Groups,DC=contoso,DC=local","CN=Bob Baker,OU=Users,DC=contoso,DC=local"]
                }
            },
            {
                "dn": "CN=PC-001,OU=Computers,DC=contoso,DC=local",
                "attributes": {
                    "objectClass": ["top","person","organizationalPerson","user","computer"],
                    "objectCategory": ["computer"],
                    "cn": ["PC-001"],
                    "name": ["PC-001"],
                    "sAMAccountName": ["PC-001$"],
                    "dNSHostName": ["pc-001.contoso.local"],
                    "userAccountControl": [4096]
                }
            }
        ]
    };

    // Optional in-memory fixture for testing and custom simulations (no network request).
    if (seed != null) this.DB = clone(seed);
    if (!Array.isArray(this.DB.entries)) throw new Error('DB.entries must be an array');
    this.options = Object.assign({ requireBind: false, allowWrites: true }, options || {});
    this.boundDN = null;

    // Public LDAP protocol emulator: an instance-owned function, not a prototype proxy.
    this.LDAP = function(request, params)
    {
        var req = typeof request === 'string' ? Object.assign({ operation: request }, params || {}) : request;
        if (!req || typeof req !== 'object') return result(CODES.protocolError, null, 'A request object is required');
        var op = String(req.operation || req.op || '').toLowerCase();
        var entries = this.DB.entries, self = this;
        function find(dn)
        {
            return entries.find(function(e)
            {
                return normalizeDN(e.dn) === normalizeDN(dn);
            });
        }
        function mustBeBound()
        {
            return self.options.requireBind && !self.boundDN
                ? result(CODES.insufficientAccessRights, null, 'Bind required') : null;
        }
        function missingDN(dn)
        {
            return result(CODES.noSuchObject, { matchedDN: '' }, 'No such entry: ' + dn);
        }

        try
        {
            if (op === 'bind')
            {
                var login = String(req.bindDN || req.dn || req.username || '');
                var password = String(req.password == null ? '' : req.password);
                if (!login && !password) { this.boundDN = null; return result(0, { boundDN: '' }); }
                var user = entries.find(function(e)
                {
                    return normalizeDN(e.dn) === normalizeDN(login) ||
                        getRaw(e, 'sAMAccountName').some(function(v) { return eq(v, login); }) ||
                        getRaw(e, 'userPrincipalName').some(function(v) { return eq(v, login); });
                });
                if (!user || !getRaw(user, 'objectClass').some(function(x) { return eq(x, 'user'); }) ||
                    user._password !== password || !password ||
                    getRaw(user, 'userAccountControl').some(function(v)
                    {
                        return (Number(v) & 2) !== 0;
                    }))
                    {
                    this.boundDN = null;
                    return result(CODES.invalidCredentials, null, 'Invalid credentials or disabled account');
                }
                this.boundDN = user.dn;
                return result(0, { boundDN: user.dn });
            }
            if (op === 'unbind') { this.boundDN = null; return result(0); }
            var denied = mustBeBound(); if (denied) return denied;

            if (op === 'search')
            {
                var base = req.baseDN == null ? this.DB.baseDN : req.baseDN;
                var normalized = normalizeDN(base);
                var scope = (req.scope || 'sub').toLowerCase();
                if (normalized === null || !['base','one','sub'].includes(scope))
                    return result(CODES.protocolError, null, 'Invalid baseDN or scope');
                if (normalized !== '' && !find(base)) return missingDN(base);
                var ast = filterParser(req.filter || '(objectClass=*)');
                var pool = normalized === '' && scope === 'base'
                    ? [{
                        dn: '', attributes: {
                            objectClass: ['top'],
                            defaultNamingContext: [this.DB.baseDN], rootDomainNamingContext: [this.DB.baseDN],
                            namingContexts: [this.DB.baseDN], supportedLDAPVersion: ['3'],
                            dnsHostName: ['dc01.' + this.DB.domain]
                        }
                    }]
                    : entries;
                var matchesList = pool.filter(function(e)
                {
                    return isUnder(normalizeDN(e.dn), normalized, scope) && matches(e, ast, entries);
                });
                var limit = req.sizeLimit == null ? Infinity : Number(req.sizeLimit);
                if (!Number.isInteger(limit) && limit !== Infinity || limit < 0)
                    return result(CODES.protocolError, null, 'Invalid sizeLimit');
                var sliced = matchesList.slice(0, limit);
                var selected = sliced.map(function(e)
                {
                    return { dn: e.dn, attributes: attrsOf(e, entries, req.attributes) };
                });
                var truncated = sliced.length < matchesList.length;
                return result(truncated ? CODES.sizeLimitExceeded : 0,
                    { entries: selected, count: selected.length, truncated: truncated });
            }
            if (op === 'compare')
            {
                var comparable = find(req.dn);
                if (!comparable) return missingDN(req.dn);
                if (!req.attribute) return result(CODES.protocolError, null, 'attribute required');
                var values = getRaw({ attributes: printableAttrs(comparable, entries) }, req.attribute);
                return result(values.some(function(v) { return eq(v, req.value); }) ? 6 : 5);
            }
            if (['add','modify','delete'].includes(op))
            {
                if (!this.options.allowWrites) return result(CODES.insufficientAccessRights, null, 'Writes disabled');
                if (typeof req.dn !== 'string' || !req.dn || normalizeDN(req.dn) === null)
                    return result(CODES.invalidDNSyntax, null, 'Valid dn required');
                var existing = find(req.dn);
                if (op === 'add')
                {
                    if (existing) return result(CODES.entryAlreadyExists);
                    var parent = parentDN(normalizeDN(req.dn));
                    if (parent && !find(parent)) return missingDN(parent);
                    if (!req.attributes || typeof req.attributes !== 'object' || Array.isArray(req.attributes))
                        return result(CODES.protocolError, null, 'attributes object required');
                    var attrs = {};
                    Object.entries(req.attributes).forEach(function(kv)
                    {
                        if (kv[0] === '_password') throw new Error('Set passwords via password, not attributes');
                        attrs[kv[0]] = list(kv[1]);
                    });
                    var added = { dn: req.dn, attributes: attrs };
                    if (req.password != null) added._password = String(req.password);
                    entries.push(added);
                    return result(0, { dn: req.dn });
                }
                if (!existing) return missingDN(req.dn);
                if (op === 'delete')
                {
                    var key = normalizeDN(req.dn);
                    if (entries.some(function(e) { return parentDN(normalizeDN(e.dn)) === key; }))
                        return result(CODES.notAllowedOnNonLeaf, null, 'Delete child entries first');
                    entries.splice(entries.indexOf(existing), 1);
                    entries.forEach(function(e)
                    {
                        var keyMember = getKey(e.attributes, 'member');
                        if (keyMember) e.attributes[keyMember] = list(e.attributes[keyMember])
                            .filter(function(x) { return normalizeDN(x) !== key; });
                    });
                    return result(0);
                }
                if (!Array.isArray(req.changes) || !req.changes.length)
                    return result(CODES.protocolError, null, 'changes array required');
                // Apply all changes to a copy; commit only if every change is valid.
                var copy = clone(existing);
                for (var change of req.changes)
                {
                    var how = String(change.operation || '').toLowerCase();
                    var attr = change.attribute;
                    if (!attr || !['add','replace','delete'].includes(how))
                        return result(CODES.protocolError, null, 'Invalid modification');
                    if (['_password','distinguishedname'].includes(String(attr).toLowerCase()))
                        return result(CODES.unwillingToPerform, null, 'Protected attribute');
                    var prev = getRaw(copy, attr), values = list(change.values);
                    if (how === 'replace') setRaw(copy, attr, values);
                    if (how === 'add')
                    {
                        if (values.some(function(v)
                        {
                            return prev.some(function(p)
                            {
                                return eq(p, v);
                            });
                        }))
                            return result(CODES.attributeOrValueExists, null, 'Attribute value already exists');
                        setRaw(copy, attr, prev.concat(values));
                    }
                    if (how === 'delete')
                    {
                        if (!getKey(copy.attributes, attr)) return result(CODES.noSuchAttribute);
                        if (!values.length) delete copy.attributes[getKey(copy.attributes, attr)];
                        else setRaw(copy, attr, prev.filter(function(p)
                        {
                            return !values.some(function(v) { return eq(v, p); });
                        }));
                    }
                }
                entries[entries.indexOf(existing)] = copy;
                return result(0, { dn: req.dn });
            }
            return result(CODES.protocolError, null, 'Unknown LDAP operation: ' + op);
        }
        catch (err)
        {
            return result(CODES.protocolError, null, err.message);
        }
    };

    // Private LDAP helpers remain local to this ActiveDirectory instance.
    var CODES = ActiveDirectory.RESULT_CODES;
    var NAMES = Object.fromEntries(Object.entries(CODES).map(function(pair)
    {
        return [pair[1], pair[0]];
    }));
    var encoder = new TextEncoder();
    var decoder = new TextDecoder('utf-8');

    function clone(x) { return JSON.parse(JSON.stringify(x)); }
    function list(x) { return x == null ? [] : Array.isArray(x) ? x.slice() : [x]; }
    function eq(a, b) { return String(a).toLowerCase() === String(b).toLowerCase(); }
    function normalizeDN(dn)
    {
        if (typeof dn !== 'string') return null;
        if (dn === '') return ''; // LDAP RootDSE
        var pieces = dn.split(/(?<!\\),/);
        if (!pieces.length || pieces.some(function(p)
        {
            return !/^\s*[^=,]+\s*=\s*[^,]+\s*$/.test(p);
        })) return null;
        return pieces.map(function(rdn)
        {
            var pos = rdn.indexOf('=');
            if (pos < 1) return null;
            return rdn.slice(0, pos).trim().toLowerCase() + '=' +
                rdn.slice(pos + 1).trim().toLowerCase();
        }).join(',');
    }
    function parentDN(dn) { var i = dn.indexOf(','); return i < 0 ? '' : dn.slice(i + 1); }
    function isUnder(dn, base, scope)
    {
        if (scope === 'base') return dn === base;
        if (scope === 'one') return parentDN(dn) === base;
        return dn === base || (base === '' ? true : dn.endsWith(',' + base));
    }
    function result(code, fields, message)
    {
        return Object.assign({
            resultCode: code, code: NAMES[code] || 'other',
            success: code === 0 || code === 5 || code === 6,
            message: message || ''
        }, fields || {});
    }
    function getKey(obj, attr)
    {
        return Object.keys(obj).find(function(key) { return eq(key, attr); });
    }
    function getRaw(entry, attr)
    {
        var key = getKey(entry.attributes, attr);
        return key ? list(entry.attributes[key]) : [];
    }
    function setRaw(entry, attr, values)
    {
        var key = getKey(entry.attributes, attr) || attr;
        entry.attributes[key] = list(values);
    }
    function printableAttrs(entry, entries)
    {
        var a = clone(entry.attributes);
        delete a._password;
        a.distinguishedName = [entry.dn];
        // AD memberOf is a computed backlink. Group.member is authoritative, including after edits.
        var groups = entries.filter(function(g)
        {
            return getRaw(g, 'member').some(function(m)
            {
                return normalizeDN(m) === normalizeDN(entry.dn);
            });
        });
        if (groups.length) a.memberOf = groups.map(function(g) { return g.dn; });
        else delete a.memberOf;
        return a;
    }
    function attrsOf(entry, entries, requested)
    {
        var all = printableAttrs(entry, entries);
        var names = requested == null ? ['*'] : list(requested);
        if (names.indexOf('1.1') >= 0 && names.length === 1) return {};
        if (names.indexOf('*') >= 0) return all;
        var selected = {};
        names.forEach(function(name)
        {
            var key = getKey(all, name);
            if (key) selected[key] = clone(all[key]);
        });
        return selected;
    }

    // RFC 4515 escapes: backslash + 2 hex digits encodes one UTF-8 byte.
    // Literal * is handled as a wildcard, while \2a matches an actual asterisk.
    function decodedValue(raw)
    {
        var bytes = [];
        for (var i = 0; i < raw.length;)
        {
            if (raw[i] === '\\')
            {
                if (!/^[0-9a-fA-F]{2}$/.test(raw.slice(i + 1, i + 3)))
                    throw new Error('Malformed filter escape at position ' + i);
                bytes.push(parseInt(raw.slice(i + 1, i + 3), 16)); i += 3;
            }
            else
            {
                var cp = raw.codePointAt(i);
                var sequence = encoder.encode(String.fromCodePoint(cp));
                sequence.forEach(function(b) { bytes.push(b); });
                i += cp > 65535 ? 2 : 1;
            }
        }
        return decoder.decode(Uint8Array.from(bytes));
    }
    function wildcardParts(raw)
    {
        var parts = [], start = 0;
        for (var i = 0; i < raw.length; i++)
        {
            if (raw[i] === '\\') { i += 2; continue; }
            if (raw[i] === '*') { parts.push(decodedValue(raw.slice(start, i))); start = i + 1; }
        }
        parts.push(decodedValue(raw.slice(start)));
        return parts;
    }
    function escapeRE(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function filterParser(input)
    {
        if (typeof input !== 'string') throw new Error('Filter must be a string');
        var pos = 0;
        function parse()
        {
            if (input[pos++] !== '(') throw new Error('Expected "(" at ' + (pos - 1));
            var kind = input[pos];
            if (kind === '&' || kind === '|')
            {
                pos++;
                var children = [];
                while (input[pos] === '(') children.push(parse());
                if (!children.length) throw new Error('Boolean filter requires a child');
                if (input[pos++] !== ')') throw new Error('Unclosed boolean filter');
                return { kind: kind, children: children };
            }
            if (kind === '!')
            {
                pos++; var child = parse();
                if (input[pos++] !== ')') throw new Error('Unclosed NOT filter');
                return { kind: '!', child: child };
            }
            var start = pos;
            while (pos < input.length)
            {
                if (input[pos] === '\\')
                {
                    if (!/^[0-9a-fA-F]{2}$/.test(input.slice(pos + 1, pos + 3)))
                        throw new Error('Malformed filter escape at ' + pos);
                    pos += 3; continue;
                }
                if (input[pos] === ')') break;
                if (input[pos] === '(') throw new Error('Unescaped "(" in filter');
                pos++;
            }
            if (input[pos++] !== ')') throw new Error('Unclosed attribute filter');
            var item = input.slice(start, pos - 1);
            var m = /^([^=<>~]+?)(:=|~=|>=|<=|=)(.*)$/.exec(item);
            if (!m) throw new Error('Invalid attribute filter: ' + item);
            var attr = m[1], op = m[2], raw = m[3];
            var segments = attr.split(':');
            if (segments.length > 1 && op !== ':=') throw new Error('Invalid extensible match');
            if (op === ':=' && !/^\d+(\.\d+)+$/.test(segments[segments.length - 1]))
                throw new Error('Unsupported matching rule: ' + attr);
            if (!segments[0] || !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(segments[0]))
                throw new Error('Invalid attribute name: ' + attr);
            return {
                kind: 'item', attr: segments[0], rule: op === ':=' ? segments[segments.length - 1] : null,
                op: op, raw: raw, value: decodedValue(raw), parts: op === '=' ? wildcardParts(raw) : null
            };
        }
        var ast = parse();
        if (pos !== input.length) throw new Error('Trailing filter input at ' + pos);
        return ast;
    }
    function walkRecursiveDN(startDN, attr, targetDN, entries, visited)
    {
        var key = normalizeDN(startDN);
        if (!key || visited.has(key)) return false;
        visited.add(key);
        var entry = entries.find(function(e) { return normalizeDN(e.dn) === key; });
        if (!entry) return false;
        var linked = attr === 'memberOf'
            ? printableAttrs(entry, entries).memberOf || []
            : getRaw(entry, 'member');
        return linked.some(function(dn)
        {
            return normalizeDN(dn) === normalizeDN(targetDN) ||
                walkRecursiveDN(dn, attr, targetDN, entries, visited);
        });
    }
    function matches(entry, ast, entries)
    {
        if (ast.kind === '&') return ast.children.every(function(x)
        {
            return matches(entry, x, entries);
        });
        if (ast.kind === '|') return ast.children.some(function(x)
        {
            return matches(entry, x, entries);
        });
        if (ast.kind === '!') return !matches(entry, ast.child, entries);
        var values = getRaw({ attributes: printableAttrs(entry, entries) }, ast.attr);
        if (ast.op === ':=')
        {
            if (ast.rule === '1.2.840.113556.1.4.1941')
            {
                if (ast.attr.toLowerCase() !== 'memberof' && ast.attr.toLowerCase() !== 'member')
                    throw new Error('Transitive matching is supported for member/memberOf only');
                return walkRecursiveDN(entry.dn, ast.attr.toLowerCase() === 'memberof' ? 'memberOf' : 'member', ast.value, entries, new Set());
            }
            if (ast.rule === '1.2.840.113556.1.4.803')
            {
                var mask = Number(ast.value);
                if (!Number.isSafeInteger(mask) || mask < 0) return false;
                return values.some(function(v) { return (Number(v) & mask) === mask; });
            }
            if (ast.rule === '1.2.840.113556.1.4.804')
            {
                var bits = Number(ast.value);
                if (!Number.isSafeInteger(bits) || bits < 0) return false;
                return values.some(function(v) { return (Number(v) & bits) !== 0; });
            }
            throw new Error('Unsupported matching rule: ' + ast.rule);
        }
        if (ast.op === '=' && ast.raw === '*') return values.length > 0;
        if (ast.op === '=' && ast.parts.length > 1)
        {
            var re = new RegExp('^' + ast.parts.map(escapeRE).join('.*') + '$', 'iu');
            return values.some(function(v) { return re.test(String(v)); });
        }
        return values.some(function(v)
        {
            if (ast.op === '=' || ast.op === '~=') return eq(v, ast.value);
            var a = String(v), b = ast.value;
            if (!Number.isNaN(Number(a)) && !Number.isNaN(Number(b)) && a !== '' && b !== '')
            {
                return ast.op === '>=' ? Number(a) >= Number(b) : Number(a) <= Number(b);
            }
            var c = a.toLowerCase().localeCompare(b.toLowerCase());
            return ast.op === '>=' ? c >= 0 : c <= 0;
        });
    }
}

ActiveDirectory.RESULT_CODES = Object.freeze({
    success: 0, operationsError: 1, protocolError: 2, sizeLimitExceeded: 4,
    compareFalse: 5,
    compareTrue: 6, authMethodNotSupported: 7, strongAuthRequired: 8,
    noSuchAttribute: 16, attributeOrValueExists: 20, invalidAttributeSyntax: 21,
    invalidCredentials: 49, insufficientAccessRights: 50,
    noSuchObject: 32, invalidDNSyntax: 34,
    entryAlreadyExists: 68, notAllowedOnNonLeaf: 66,
    unwillingToPerform: 53, other: 80
});

// Optional compatibility utility: snapshots are generated from the inline constructor data.
ActiveDirectory.sampleDB = function()
{
    return new ActiveDirectory().DB;
};


// PowerShell compatibility layer, backed exclusively by ActiveDirectory.LDAP().
/* PowerShellJS v0.2 — simulated AD directory + filter interpreters.
 * In-memory only. No LDAP sockets, network or system authentication. */
function PowerShellADContainer()
{
    'use strict';
    function DirectoryError(message, code = 'ADSimulationError')
    {
        const error = new Error(message);
        error.name = 'DirectoryError';
        error.code = code;
        return error;
    }
    const lc = v => String(v ?? '').toLowerCase(), list = v => Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
    function attr(obj, key)
    {
        if (!obj) return undefined;
        const found = Object.keys(obj).find(k => lc(k) === lc(key));
        return found === undefined ? undefined : obj[found];
    }
    function text(v) { return v === true ? 'True' : v === false ? 'False' : String(v ?? ''); }
    function regexForWildcard(value)
    {
        let s = '^';
        for (let i = 0; i < value.length; i++)
        {
            let c = value[i];
            if (c === '*') s += '.*'; else s += c.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
        }
        return new RegExp(s + '$', 'i');
    }
    function decodeLDAP(raw)
    {
        return raw.replace(/\\([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    }
    function escapedWildcardPattern(raw)
    {
        let s = '^'; for (let i = 0; i < raw.length; i++)
        {
            if (raw[i] === '\\' && /^[0-9a-f]{2}$/i.test(raw.slice(i + 1, i + 3)))
            {
                s += String.fromCharCode(parseInt(raw.slice(i + 1, i + 3), 16)).replace(/[|\\{}()[\]^$+?.*]/g, '\\$&');
                i += 2;
                continue;
            }
            s += raw[i] === '*' ? '.*' : raw[i].replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
        }
        return new RegExp(s + '$', 'i');
    }
    function parseLDAPFilter(source)
    {
        const s = String(source ?? '').trim(); let i = 0, nodes = 0;
        if (s.length > 12000) throw new DirectoryError('LDAP filter too long.', 'ResourceLimit');
        function parse(depth = 0)
        {
            if (++nodes > 250 || depth > 24) throw new DirectoryError('LDAP filter too complex.', 'ResourceLimit');
            if (s[i++] !== '(') throw new DirectoryError('Expected ( at position ' + i + '.', 'LDAPFilterSyntax');
            const op = s[i]; if (op === '&' || op === '|' || op === '!')
            {
                i++; const children = []; while (s[i] === '(') children.push(parse(depth + 1));
                if (!children.length || (op === '!' && children.length !== 1)) throw new DirectoryError('Invalid LDAP boolean filter.', 'LDAPFilterSyntax');
                if (s[i++] !== ')') throw new DirectoryError('Expected ) in LDAP filter.', 'LDAPFilterSyntax');
                return { kind: op, children };
            }
            const start = i; while (i < s.length && s[i] !== ')')
            {
                if (s[i] === '\\') { i += 3; continue; } i++;
            }
            if (s[i] !== ')') throw new DirectoryError('Unterminated LDAP attribute filter.', 'LDAPFilterSyntax');
            const item = s.slice(start, i++), m = /^([A-Za-z][\w.-]*)(?::(1\.2\.840\.113556\.1\.4\.(?:803|804|1941)):)?(>=|<=|~=|=)([\s\S]*)$/.exec(item);
            if (!m) throw new DirectoryError('Unsupported LDAP assertion: ' + item, 'LDAPFilterSyntax');
            return { kind: 'test', attribute: m[1], rule: m[2] || null, operator: m[3], raw: m[4] };
        }
        const tree = parse(); if (i !== s.length) throw new DirectoryError('Unexpected content after LDAP filter.', 'LDAPFilterSyntax'); return tree;
    }
    function matchingLDAP(node, entry, dir)
    {
        if (node.kind === '&') return node.children.every(x => matchingLDAP(x, entry, dir));
        if (node.kind === '|') return node.children.some(x => matchingLDAP(x, entry, dir));
        if (node.kind === '!') return !matchingLDAP(node.children[0], entry, dir);
        const actual = list(attr(entry, node.attribute)), raw = node.raw, expected = decodeLDAP(raw);
        if (node.rule)
        {
            if (node.rule.endsWith('1941'))
            {
                const target = lc(expected);
                if (lc(node.attribute) === 'memberof') return dir.transitiveGroups(entry.distinguishedName).some(g => lc(g.distinguishedName) === target);
                if (lc(node.attribute) === 'member') return dir.transitiveMembers(entry.distinguishedName).some(o => lc(o.distinguishedName) === target);
                throw new DirectoryError('In-chain rule supports member/memberOf only.', 'NotSupported');
            }
            const mask = Number(expected); if (!Number.isSafeInteger(mask)) return false;
            if (node.rule.endsWith('803')) return actual.some(v => ((Number(v) >>> 0) & (mask >>> 0)) === (mask >>> 0));
            return actual.some(v => ((Number(v) >>> 0) & (mask >>> 0)) !== 0);
        }
        if (node.operator === '=' && raw === '*') return actual.length > 0 && actual.some(v => v !== '' && v !== null);
        return actual.some(v =>
        {
            if (node.operator === '=') return escapedWildcardPattern(raw).test(text(v));
            if (node.operator === '~=') return lc(text(v)).replace(/\s+/g, '') === lc(expected).replace(/\s+/g, '');
            if (typeof v === 'number' && /^[-+]?\d+$/.test(expected)) return node.operator === '>=' ? v >= Number(expected) : v <= Number(expected);
            return node.operator === '>=' ? lc(v) >= lc(expected) : lc(v) <= lc(expected);
        });
    }
    function parseADFilter(source, variables = {})
    {
        let s = String(source ?? '').trim(); if (/^\{[\s\S]*\}$/.test(s)) s = s.slice(1, -1).trim();
        if (s === '*') return () => true;
        if (s.length > 12000) throw new DirectoryError('AD filter too long.', 'ResourceLimit');
        const tok = []; const re = /\s+|\(|\)|'(?:''|[^'])*'|"(?:`.|[^"`])*"|\$[\w]+|-notlike\b|-like\b|-not\b|-and\b|-or\b|-eq\b|-ne\b|-ge\b|-gt\b|-le\b|-lt\b|[A-Za-z_][\w.-]*|\d+|\*/giy;
        let pos = 0; while (pos < s.length)
        {
            re.lastIndex = pos;
            let m = re.exec(s);
            if (!m || m.index !== pos) throw new DirectoryError('Unsupported AD filter token near: ' + s.slice(pos, Math.min(pos + 20, s.length)), 'ADFilterSyntax');
            pos = re.lastIndex;
            if (!/^\s+$/.test(m[0])) tok.push(m[0]);
        }
        let idx = 0, count = 0; function peek() { return lc(tok[idx]); } function take()
        {
            return tok[idx++];
        }
        function value()
        {
            const raw = take(); if (raw === undefined) throw new DirectoryError('Incomplete AD filter.', 'ADFilterSyntax');
            if (raw[0] === "'") return raw.slice(1, -1).replace(/''/g, "'");
            if (raw[0] === '"') return raw.slice(1, -1);
            if (raw[0] === '$')
            {
                const v = lc(raw);
                if (v === '$true') return true;
                if (v === '$false') return false;
                if (v === '$null') return null;
                return attr(variables, raw.slice(1));
            }
            if (/^\d+$/.test(raw)) return Number(raw); return raw;
        }
        function primary()
        {
            if (++count > 250) throw new DirectoryError('AD filter too complex.', 'ResourceLimit');
            if (peek() === '-not')
            {
                take();
                const node = primary();
                return e => !node(e);
            }
            if (peek() === '(')
            {
                take();
                const node = or();
                if (take() !== ')') throw new DirectoryError('Missing ) in AD filter.', 'ADFilterSyntax');
                return node;
            }
            const prop = take(), op = peek(); if (!/^[A-Za-z_]\w*$/.test(prop || '') || !['-eq','-ne','-like','-notlike','-gt','-ge','-lt','-le'].includes(op)) throw new DirectoryError('Expected property comparison in AD filter.', 'ADFilterSyntax');
            take(); const rhs = value(); return entry =>
            {
                const values = list(attr(entry, prop)); let hit = values.some(v =>
                {
                    if (op === '-like' || op === '-notlike') return regexForWildcard(text(rhs)).test(text(v));
                    if (op === '-eq' || op === '-ne') return lc(v) === lc(rhs);
                    if (typeof v === 'number' && typeof rhs === 'number') return op === '-gt' ? v > rhs : op === '-ge' ? v >= rhs : op === '-lt' ? v < rhs : v <= rhs;
                    return op === '-gt' ? lc(v) > lc(rhs) : op === '-ge' ? lc(v) >= lc(rhs) : op === '-lt' ? lc(v) < lc(rhs) : lc(v) <= lc(rhs);
                }); return op === '-ne' || op === '-notlike' ? !hit : hit;
            };
        }
        function and()
        {
            let left = primary();
            while (peek() === '-and')
            {
                take();
                const a = left, b = primary();
                left = e => a(e) && b(e);
            }
            return left;
        }
        function or()
        {
            let left = and();
            while (peek() === '-or')
            {
                take();
                const a = left, b = and();
                left = e => a(e) || b(e);
            }
            return left;
        }
        const pred = or(); if (idx !== tok.length) throw new DirectoryError('Unexpected token in AD filter: ' + tok[idx], 'ADFilterSyntax'); return pred;
    }
    const ROOT = 'DC=corp,DC=example,DC=com';
    function dn(name, parent) { return name + ',' + parent; }
    // PowerShell compatibility facade: there is ONE mutable directory, this.AD.DB.
    // Every command-level search and modification uses the public LDAP() engine.
    function SimulatedDirectory(data)
    {
        const owner = this;

        function makeDB(records)
        {
            const entries = (records || seed()).map(function(entry)
            {
                const attributes = {};
                for (const [key, value] of Object.entries(entry))
                {
                    if (lc(key) === 'distinguishedname') continue;
                    if (Object.keys(attributes).some(existing => lc(existing) === lc(key))) continue;
                    attributes[key] = Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : [value];
                }
                return { dn: entry.distinguishedName, attributes: attributes };
            });
            const rootEntry = entries.find(x => (x.attributes.objectClass || []).some(c => /^(domain|domainDNS)$/i.test(c)));
            const baseDN = rootEntry ? rootEntry.dn : ROOT;
            const domain = baseDN.split(',').filter(x => /^DC=/i.test(x)).map(x => x.slice(3)).join('.');
            return { domain: domain || 'corp.example.com', baseDN: baseDN, entries: entries };
        }

        function raw(dn)
        {
            return owner.AD.DB.entries.find(e => lc(e.dn) === lc(dn));
        }

        function keyOf(attributes, key)
        {
            return Object.keys(attributes).find(k => lc(k) === lc(key));
        }

        function values(dn, key)
        {
            const entry = raw(dn);
            if (!entry) return undefined;
            if (lc(key) === 'distinguishedname') return entry.dn;
            if (lc(key) === 'memberof') return owner.groupsOf(dn).map(g => g.distinguishedName);
            const field = keyOf(entry.attributes, key);
            if (!field) return undefined;
            const all = entry.attributes[field];
            if (lc(field) === 'objectclass' || lc(field) === 'member') return all;
            return all.length === 1 ? all[0] : all;
        }

        function view(dn)
        {
            const entry = raw(dn);
            if (!entry) return undefined;
            const normalized = lc(entry.dn);
            if (owner.views.has(normalized)) return owner.views.get(normalized);
            const proxy = new Proxy({}, {
                get: function(target, field)
                {
                    if (typeof field === 'symbol') return undefined;
                    return values(dn, field);
                },
                set: function(target, field, value)
                {
                    if (lc(field) === 'distinguishedname') throw new DirectoryError('DN is immutable.', 'InvalidOperation');
                    const result = owner.LDAP('modify', {
                        dn: dn, changes: [{ operation: 'replace', attribute: field, values: list(value) }]
                    });
                    if (result.resultCode !== 0) throw new DirectoryError(result.message || result.code, 'LDAPModifyError');
                    return true;
                },
                ownKeys: function()
                {
                    const record = raw(dn);
                    return record ? ['distinguishedName', ...Object.keys(record.attributes)] : [];
                },
                getOwnPropertyDescriptor: function(target, field)
                {
                    return (field === 'distinguishedName' || raw(dn) && keyOf(raw(dn).attributes, field))
                        ? { configurable: true, enumerable: true, writable: true, value: values(dn, field) }
                        : undefined;
                },
                has: function(target, field) { return values(dn, field) !== undefined; }
            });
            owner.views.set(normalized, proxy);
            return proxy;
        }

        this.reset = function(data)
        {
            this.AD = new ActiveDirectory(makeDB(data));
            this.root = this.AD.DB.baseDN;
            this.queryLog = [];
            this.views = new Map();
            // Backwards-compatible entry index; it points to views, never to a second DB.
            this.entries = new Map(this.AD.DB.entries.map(e => [lc(e.dn), view(e.dn)]));
        };

        this.LDAP = function(request, params) { return this.AD.LDAP(request, params); };

        this.all = function()
        {
            const response = this.LDAP('search', { baseDN: this.root, scope: 'sub', filter: '(objectClass=*)', attributes: ['1.1'] });
            if (response.resultCode !== 0) throw new DirectoryError(response.message, 'LDAPSearchError');
            return response.entries.map(e => view(e.dn));
        };

        this.byDN = function(dn) { return view(dn); };

        this.get = function(identity, kind)
        {
            const s = lc(identity);
            const matches = this.all().filter(e => (!kind || this.isKind(e, kind)) &&
                [e.distinguishedName, e.sAMAccountName, e.name, e.cn, e.objectGUID].some(v => v !== undefined && lc(v) === s));
            if (!matches.length) throw new DirectoryError(`Cannot find directory ${kind || 'object'}: ${identity}`, 'ADIdentityNotFound');
            if (matches.length > 1) throw new DirectoryError(`Ambiguous directory identity: ${identity}`, 'ADIdentityAmbiguous');
            return matches[0];
        };

        this.add = function(entry)
        {
            if (!entry.distinguishedName) throw new DirectoryError('distinguishedName is required.', 'InvalidDirectoryEntry');
            const attributes = {};
            for (const [key, value] of Object.entries(entry))
                if (lc(key) !== 'distinguishedname') attributes[key] = list(value);
            if (!attributes.objectClass) attributes.objectClass = ['top'];
            if (!attributes.name) attributes.name = [entry.cn || entry.ou || entry.sAMAccountName || ''];
            const response = this.LDAP('add', { dn: entry.distinguishedName, attributes });
            if (response.resultCode !== 0)
                throw new DirectoryError(response.message || response.code, response.resultCode === 68 ? 'ItemExists' : 'LDAPAddError');
            const proxy = view(entry.distinguishedName);
            this.entries.set(lc(entry.distinguishedName), proxy);
            return proxy;
        };

        this.isKind = function(e, kind)
        {
            if (kind === 'object') return true;
            if (kind === 'user') return lc(e.objectCategory) === 'person' && list(e.objectClass).some(x => lc(x) === 'user') && !list(e.objectClass).some(x => lc(x) === 'computer');
            if (kind === 'group') return lc(e.objectCategory) === 'group';
            if (kind === 'computer') return lc(e.objectCategory) === 'computer';
            if (kind === 'organizationalunit') return list(e.objectClass).some(x => lc(x) === 'organizationalunit');
            return false;
        };

        this.parentDN = function(dn)
        {
            const comma = String(dn).search(/(?<!\\),/);
            return comma < 0 ? '' : String(dn).slice(comma + 1);
        };

        this.inScope = function(e, base, scope)
        {
            const target = lc(e.distinguishedName), b = lc(base), mode = lc(scope);
            if (mode === 'base' || mode === '0') return target === b;
            if (mode === 'onelevel' || mode === '1') return lc(this.parentDN(e.distinguishedName)) === b;
            return target === b || target.endsWith(',' + b);
        };

        this.search = function({ kind = 'object', identity, ldapFilter, filter, searchBase, searchScope = 'Subtree', variables = {} } = {})
        {
            if (identity !== undefined && identity !== null) return [this.get(identity, kind)];
            if (ldapFilter !== undefined && filter !== undefined)
                throw new DirectoryError('Use either -Filter or -LDAPFilter, not both.', 'ParameterSetConflict');
            const scopeMap = { base: 'base', '0': 'base', onelevel: 'one', '1': 'one', subtree: 'sub', '2': 'sub' };
            const scope = scopeMap[lc(searchScope)];
            if (!scope) throw new DirectoryError('SearchScope must be Base, OneLevel or Subtree.', 'InvalidParameter');
            const base = this.get(searchBase === undefined ? this.root : searchBase, 'object').distinguishedName;
            const check = filter !== undefined ? parseADFilter(filter, variables) : null;
            const response = this.LDAP('search', {
                baseDN: base, scope: scope,
                filter: ldapFilter === undefined ? '(objectClass=*)' : String(ldapFilter), attributes: ['1.1']
            });
            if (response.resultCode !== 0)
                throw new DirectoryError(response.message || response.code,
                    response.resultCode === 2 ? 'LDAPFilterSyntax' : 'LDAPSearchError');
            const results = response.entries.map(e => view(e.dn)).filter(e => this.isKind(e, kind) && (!check || check(e)));
            this.queryLog.push({
                BaseDN: base, Scope: searchScope, Kind: kind,
                FilterType: ldapFilter !== undefined ? 'LDAP' : filter !== undefined ? 'AD' : 'All',
                Filter: ldapFilter ?? filter ?? '*', ResultCount: results.length
            });
            if (this.queryLog.length > 100) this.queryLog.shift();
            return results;
        };

        this.members = function(group, recursive = false, seen = new Set())
        {
            const g = typeof group === 'string' ? this.get(group, 'group') : group;
            if (seen.has(lc(g.distinguishedName))) return [];
            seen.add(lc(g.distinguishedName)); let out = [];
            for (const d of list(g.member))
            {
                const member = this.byDN(d); if (!member) continue;
                if (recursive && this.isKind(member, 'group')) out.push(...this.members(member, true, seen));
                else out.push(member);
            }
            return [...new Map(out.map(e => [lc(e.distinguishedName), e])).values()];
        };

        this.transitiveMembers = function(groupDN)
        {
            const group = this.byDN(groupDN);
            return group && this.isKind(group, 'group') ? this.members(group, true) : [];
        };

        this.groupsOf = function(identity, recursive = false)
        {
            const principal = typeof identity === 'string' ? this.get(identity) : identity;
            const direct = this.all().filter(g => this.isKind(g, 'group') && list(g.member).some(m => lc(m) === lc(principal.distinguishedName)));
            if (!recursive) return direct;
            const result = new Map(direct.map(g => [lc(g.distinguishedName), g]));
            const queue = [...direct];
            while (queue.length)
            {
                const current = queue.shift();
                for (const parent of this.groupsOf(current, false))
                {
                    if (!result.has(lc(parent.distinguishedName)))
                    {
                        result.set(lc(parent.distinguishedName), parent);
                        queue.push(parent);
                    }
                }
            }
            return [...result.values()];
        };

        this.transitiveGroups = function(dn)
        {
            const entry = this.byDN(dn);
            return entry ? this.groupsOf(entry, true) : [];
        };

        this.snapshot = function()
        {
            return this.all().map(e => JSON.parse(JSON.stringify(e)));
        };

        this.reset(data);
    }
    function seed()
    {
        const arr = [], O = 'OU=', D = ROOT;
        const ou = (name, parent = D) =>
        {
            const distinguishedName = dn('OU=' + name, parent);
            arr.push({ distinguishedName, ou: name, name, objectCategory: 'organizationalUnit', objectClass: ['top','organizationalUnit'] });
            return distinguishedName;
        };
        arr.push({ distinguishedName: D, dc: 'corp', name: 'corp.example.com', objectCategory: 'domain', objectClass: ['top','domainDNS'] });
        const users = ou('Users'), groups = ou('Groups'), computers = ou('Computers'), it = ou('IT', users), finance = ou('Finance', users), hr = ou('HR', users), operations = ou('Operations', users);
        function user(sam, name, department, title, mail, container, enabled = true)
        {
            const distinguishedName = dn('CN=' + name, container);
            arr.push({ distinguishedName, cn: name, name, displayName: name, givenName: name.split(' ')[0], sn: name.split(' ').slice(-1)[0], sAMAccountName: sam, userPrincipalName: sam + '@corp.example.com', mail, department, title, Enabled: enabled, enabled, userAccountControl: enabled ? 512 : 514, objectCategory: 'person', objectClass: ['top','person','organizationalPerson','user'], memberOf: [] });
            return distinguishedName;
        }
        const ava = user('ava.morgan', 'Ava Morgan', 'IT', 'Systems Engineer', 'ava.morgan@corp.example.com', it);
        const leo = user('leo.chen', 'Leo Chen', 'IT', 'Support Engineer', 'leo.chen@corp.example.com', it);
        const mia = user('mia.jansen', 'Mia Jansen', 'Finance', 'Financial Analyst', 'mia.jansen@corp.example.com', finance);
        const noah = user('noah.patel', 'Noah Patel', 'Finance', 'Accountant', 'noah.patel@corp.example.com', finance);
        const emma = user('emma.smith', 'Emma Smith', 'HR', 'HR Specialist', 'emma.smith@corp.example.com', hr);
        const oliver = user('oliver.dubois', 'Oliver Dubois', 'Operations', 'Operations Lead', 'oliver.dubois@corp.example.com', operations);
        const felix = user('felix.gray', 'Felix Gray', 'IT', 'Former Contractor', 'felix.gray@corp.example.com', it, false);
        const groupsDN = {};
        function group(sam, description, members = [])
        {
            const distinguishedName = dn('CN=' + sam, groups);
            groupsDN[sam] = distinguishedName;
            arr.push({ distinguishedName, cn: sam, name: sam, sAMAccountName: sam, description, groupCategory: 'Security', groupScope: 'Global', groupType: -2147483646, objectCategory: 'group', objectClass: ['top','group'], member: members });
            return distinguishedName;
        }
        group('BR_IT_Admin', 'IT administrator business role', [ava]); group('BR_IT_Support', 'IT support business role', [ava, leo]); group('BR_Finance_Analyst', 'Finance analysis business role', [mia, noah]); group('BR_HR_Reader', 'HR read-only business role', [emma]);
        group('BR_Operations', 'Operations business role', [oliver]); group('APP_Reporting', 'Application reporting access', [groupsDN.BR_Finance_Analyst, groupsDN.BR_HR_Reader]);
        group('All_Employees', 'Staff access', [groupsDN.BR_IT_Support, groupsDN.BR_Finance_Analyst, groupsDN.BR_HR_Reader, oliver]);
        function computer(name, os)
        {
            arr.push({ distinguishedName: dn('CN=' + name, computers), cn: name, name, sAMAccountName: name + '$', operatingSystem: os, Enabled: true, enabled: true, objectCategory: 'computer', objectClass: ['top','person','organizationalPerson','user','computer'] });
        }
        computer('PC-IT-01', 'Windows 11 Enterprise'); computer('SRV-DC-01', 'Windows Server 2025'); computer('PC-FIN-01', 'Windows 11 Enterprise');
        // Derived memberOf references for sample data.
        for (const e of arr.filter(x => Array.isArray(x.member))) for (const m of e.member)
        {
            const target = arr.find(x => lc(x.distinguishedName) === lc(m));
            if (target)
            {
                target.memberOf = target.memberOf || [];
                target.memberOf.push(e.distinguishedName);
            }
        }
        return arr;
    }

    this.SimulatedDirectory = SimulatedDirectory;
    this.DirectoryError = DirectoryError;
    this.parseLDAPFilter = parseLDAPFilter;
    this.matchingLDAP = matchingLDAP;
    this.parseADFilter = parseADFilter;
    this.ROOT = ROOT;
    this.seed = seed;
    this.attr = attr;
    this.VERSION = '0.2.0';
}

var PowerShellAD = new PowerShellADContainer();
