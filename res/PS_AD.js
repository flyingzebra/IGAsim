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
    function SimulatedDirectory(data)
    {
        this.reset = function(data)
        {
            this.entries = new Map();
            this.queryLog = [];
            this.root = ROOT;
            for (const entry of (data || seed())) this.add(JSON.parse(JSON.stringify(entry)));
        };

        this.add = function(entry)
        {
            const e = { ...entry }; if (!e.distinguishedName) throw new DirectoryError('distinguishedName is required.', 'InvalidDirectoryEntry');
            const k = lc(e.distinguishedName); if (this.entries.has(k)) throw new DirectoryError('Directory entry already exists: ' + e.distinguishedName, 'ItemExists');
            if (!e.objectClass) e.objectClass = ['top']; if (!e.name) e.name = e.cn || e.ou || e.sAMAccountName || '';
            this.entries.set(k, e); return e;
        };

        this.all = function() { return [...this.entries.values()]; };

        this.byDN = function(dn) { return this.entries.get(lc(dn)); };

        this.get = function(identity, kind)
        {
            const s = lc(identity); const list = this.all().filter(e => !kind || this.isKind(e, kind));
            const hit = list.filter(e => [e.distinguishedName, e.sAMAccountName, e.name, e.cn, e.objectGUID].some(x => x !== undefined && lc(x) === s));
            if (!hit.length) throw new DirectoryError(`Cannot find directory ${kind || 'object'}: ${identity}`, 'ADIdentityNotFound');
            if (hit.length > 1) throw new DirectoryError(`Ambiguous directory identity: ${identity}`, 'ADIdentityAmbiguous'); return hit[0];
        };

        this.isKind = function(e, k)
        {
            if (k === 'object') return true;
            if (k === 'user') return lc(e.objectCategory) === 'person' && list(e.objectClass).some(x => lc(x) === 'user') && !list(e.objectClass).some(x => lc(x) === 'computer');
            if (k === 'group') return lc(e.objectCategory) === 'group';
            if (k === 'computer') return lc(e.objectCategory) === 'computer';
            if (k === 'organizationalunit') return list(e.objectClass).some(x => lc(x) === 'organizationalunit');
            return false;
        };

        this.parentDN = function(x)
        {
            const str = String(x), comma = str.search(/(?<!\\),/);
            return comma < 0 ? '' : str.slice(comma + 1);
        };

        this.inScope = function(e, base, scope)
        {
            const target = lc(e.distinguishedName), b = lc(base); const mode = lc(scope);
            if (mode === 'base' || mode === '0') return target === b;
            if (mode === 'onelevel' || mode === '1') return lc(this.parentDN(e.distinguishedName)) === b;
            return target === b || target.endsWith(',' + b);
        };

        this.search = function({ kind = 'object', identity, ldapFilter, filter, searchBase = ROOT, searchScope = 'Subtree', variables = {} } = {})
        {
            if (identity !== undefined && identity !== null) return [this.get(identity, kind)];
            if (ldapFilter !== undefined && filter !== undefined) throw new DirectoryError('Use either -Filter or -LDAPFilter, not both.', 'ParameterSetConflict');
            const base = this.get(searchBase, 'object').distinguishedName;
            if (!['base','onelevel','subtree','0','1','2'].includes(lc(searchScope))) throw new DirectoryError('SearchScope must be Base, OneLevel or Subtree.', 'InvalidParameter');
            const check = ldapFilter !== undefined ? (() =>
            {
                const ast = parseLDAPFilter(ldapFilter);
                return e => matchingLDAP(ast, e, this);
            })() :
                filter !== undefined ? parseADFilter(filter, variables) : () => true;
            const results = this.all().filter(e => this.isKind(e, kind) && this.inScope(e, base, searchScope) && check(e));
            this.queryLog.push({ BaseDN: base, Scope: searchScope, Kind: kind, FilterType: ldapFilter !== undefined ? 'LDAP' : filter !== undefined ? 'AD' : 'All', Filter: ldapFilter ?? filter ?? '*', ResultCount: results.length });
            if (this.queryLog.length > 100) this.queryLog.shift(); return results;
        };

        this.members = function(group, recursive = false, seen = new Set())
        {
            const g = typeof group === 'string' ? this.get(group, 'group') : group;
            if (seen.has(lc(g.distinguishedName))) return [];
            seen.add(lc(g.distinguishedName)); let out = [];
            for (const d of list(g.member))
            {
                const member = this.byDN(d); if (!member) continue;
                if (recursive && this.isKind(member, 'group')) out.push(...this.members(member, true, seen)); else out.push(member);
            }
            return [...new Map(out.map(x => [lc(x.distinguishedName), x])).values()];
        };

        this.transitiveMembers = function(groupDN)
        {
            const g = this.byDN(groupDN);
            return g && this.isKind(g, 'group') ? this.members(g, true) : [];
        };

        this.groupsOf = function(identity, recursive = false)
        {
            const e = typeof identity === 'string' ? this.get(identity) : identity; let direct = this.all().filter(g => this.isKind(g, 'group') && list(g.member).some(m => lc(m) === lc(e.distinguishedName)));
            if (!recursive) return direct;
            const all = new Map(direct.map(g => [lc(g.distinguishedName), g])); let queue = [...direct];
            while (queue.length)
            {
                const curr = queue.shift();
                for (const parent of this.groupsOf(curr, false)) if (!all.has(lc(parent.distinguishedName)))
                {
                    all.set(lc(parent.distinguishedName), parent);
                    queue.push(parent);
                }
            }
            return [...all.values()];
        };

        this.transitiveGroups = function(dn)
        { const e = this.byDN(dn); return e ? this.groupsOf(e, true) : [];
        };

        this.snapshot = function() { return this.all().map(e => JSON.parse(JSON.stringify(e))); };
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
