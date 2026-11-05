/* ActiveDirectoryJS v0.1.1 - standalone, in-memory LDAP/Active Directory emulator.
 * Load with <script src="ActiveDirectory.js"></script> or require() in Node.
 * No network service, real LDAP BER framing, ACLs, or cryptographic authentication.
 */
(function (root, factory) {
  var ActiveDirectory = factory();
  if (typeof module === 'object' && module.exports) module.exports = ActiveDirectory;
  if (root) root.ActiveDirectory = ActiveDirectory;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CODES = Object.freeze({
    success: 0, operationsError: 1, protocolError: 2, sizeLimitExceeded: 4,
    compareFalse: 5,
    compareTrue: 6, authMethodNotSupported: 7, strongAuthRequired: 8,
    noSuchAttribute: 16, attributeOrValueExists: 20, invalidAttributeSyntax: 21,
    invalidCredentials: 49, insufficientAccessRights: 50,
    noSuchObject: 32, invalidDNSyntax: 34,
    entryAlreadyExists: 68, notAllowedOnNonLeaf: 66,
    unwillingToPerform: 53, other: 80
  });
  var NAMES = Object.fromEntries(Object.entries(CODES).map(function (pair) { return [pair[1], pair[0]]; }));
  var encoder = new TextEncoder();
  var decoder = new TextDecoder('utf-8');

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function list(x) { return x == null ? [] : Array.isArray(x) ? x.slice() : [x]; }
  function eq(a, b) { return String(a).toLowerCase() === String(b).toLowerCase(); }
  function normalizeDN(dn) {
    if (typeof dn !== 'string') return null;
    if (dn === '') return ''; // LDAP RootDSE
    var pieces = dn.split(/(?<!\\),/);
    if (!pieces.length || pieces.some(function (p) { return !/^\s*[^=,]+\s*=\s*[^,]+\s*$/.test(p); })) return null;
    return pieces.map(function (rdn) {
      var pos = rdn.indexOf('=');
      if (pos < 1) return null;
      return rdn.slice(0, pos).trim().toLowerCase() + '=' +
        rdn.slice(pos + 1).trim().toLowerCase();
    }).join(',');
  }
  function parentDN(dn) { var i = dn.indexOf(','); return i < 0 ? '' : dn.slice(i + 1); }
  function isUnder(dn, base, scope) {
    if (scope === 'base') return dn === base;
    if (scope === 'one') return parentDN(dn) === base;
    return dn === base || (base === '' ? true : dn.endsWith(',' + base));
  }
  function result(code, fields, message) {
    return Object.assign({ resultCode: code, code: NAMES[code] || 'other',
      success: code === 0 || code === 5 || code === 6,
      message: message || '' }, fields || {});
  }
  function getKey(obj, attr) { return Object.keys(obj).find(function (key) { return eq(key, attr); }); }
  function getRaw(entry, attr) {
    var key = getKey(entry.attributes, attr);
    return key ? list(entry.attributes[key]) : [];
  }
  function setRaw(entry, attr, values) {
    var key = getKey(entry.attributes, attr) || attr;
    entry.attributes[key] = list(values);
  }
  function printableAttrs(entry, entries) {
    var a = clone(entry.attributes);
    delete a._password;
    a.distinguishedName = [entry.dn];
    if (getRaw(entry, 'memberOf').length === 0) {
      var groups = entries.filter(function (g) {
        return getRaw(g, 'member').some(function (m) { return normalizeDN(m) === normalizeDN(entry.dn); });
      });
      if (groups.length) a.memberOf = groups.map(function (g) { return g.dn; });
    }
    return a;
  }
  function attrsOf(entry, entries, requested) {
    var all = printableAttrs(entry, entries);
    var names = requested == null ? ['*'] : list(requested);
    if (names.indexOf('1.1') >= 0 && names.length === 1) return {};
    if (names.indexOf('*') >= 0) return all;
    var selected = {};
    names.forEach(function (name) {
      var key = getKey(all, name);
      if (key) selected[key] = clone(all[key]);
    });
    return selected;
  }

  // RFC 4515 escapes: backslash + 2 hex digits encodes one UTF-8 byte.
  // Literal * is handled as a wildcard, while \2a matches an actual asterisk.
  function decodedValue(raw) {
    var bytes = [];
    for (var i = 0; i < raw.length;) {
      if (raw[i] === '\\') {
        if (!/^[0-9a-fA-F]{2}$/.test(raw.slice(i + 1, i + 3)))
          throw new Error('Malformed filter escape at position ' + i);
        bytes.push(parseInt(raw.slice(i + 1, i + 3), 16)); i += 3;
      } else {
        var cp = raw.codePointAt(i);
        var sequence = encoder.encode(String.fromCodePoint(cp));
        sequence.forEach(function (b) { bytes.push(b); });
        i += cp > 65535 ? 2 : 1;
      }
    }
    return decoder.decode(Uint8Array.from(bytes));
  }
  function wildcardParts(raw) {
    var parts = [], start = 0;
    for (var i = 0; i < raw.length; i++) {
      if (raw[i] === '\\') { i += 2; continue; }
      if (raw[i] === '*') { parts.push(decodedValue(raw.slice(start, i))); start = i + 1; }
    }
    parts.push(decodedValue(raw.slice(start)));
    return parts;
  }
  function escapeRE(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function filterParser(input) {
    if (typeof input !== 'string') throw new Error('Filter must be a string');
    var pos = 0;
    function parse() {
      if (input[pos++] !== '(') throw new Error('Expected "(" at ' + (pos - 1));
      var kind = input[pos];
      if (kind === '&' || kind === '|') {
        pos++;
        var children = [];
        while (input[pos] === '(') children.push(parse());
        if (!children.length) throw new Error('Boolean filter requires a child');
        if (input[pos++] !== ')') throw new Error('Unclosed boolean filter');
        return { kind: kind, children: children };
      }
      if (kind === '!') {
        pos++; var child = parse();
        if (input[pos++] !== ')') throw new Error('Unclosed NOT filter');
        return { kind: '!', child: child };
      }
      var start = pos;
      while (pos < input.length) {
        if (input[pos] === '\\') {
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
      return { kind: 'item', attr: segments[0], rule: op === ':=' ? segments[segments.length - 1] : null,
        op: op, raw: raw, value: decodedValue(raw), parts: op === '=' ? wildcardParts(raw) : null };
    }
    var ast = parse();
    if (pos !== input.length) throw new Error('Trailing filter input at ' + pos);
    return ast;
  }
  function walkRecursiveDN(startDN, attr, targetDN, entries, visited) {
    var key = normalizeDN(startDN);
    if (!key || visited.has(key)) return false;
    visited.add(key);
    var entry = entries.find(function (e) { return normalizeDN(e.dn) === key; });
    if (!entry) return false;
    var linked = attr === 'memberOf'
      ? printableAttrs(entry, entries).memberOf || []
      : getRaw(entry, 'member');
    return linked.some(function (dn) {
      return normalizeDN(dn) === normalizeDN(targetDN) ||
        walkRecursiveDN(dn, attr, targetDN, entries, visited);
    });
  }
  function matches(entry, ast, entries) {
    if (ast.kind === '&') return ast.children.every(function (x) { return matches(entry, x, entries); });
    if (ast.kind === '|') return ast.children.some(function (x) { return matches(entry, x, entries); });
    if (ast.kind === '!') return !matches(entry, ast.child, entries);
    var values = getRaw({ attributes: printableAttrs(entry, entries) }, ast.attr);
    if (ast.op === ':=') {
      if (ast.rule === '1.2.840.113556.1.4.1941') {
        if (ast.attr.toLowerCase() !== 'memberof' && ast.attr.toLowerCase() !== 'member')
          throw new Error('Transitive matching is supported for member/memberOf only');
        return walkRecursiveDN(entry.dn, ast.attr.toLowerCase() === 'memberof' ? 'memberOf' : 'member', ast.value, entries, new Set());
      }
      if (ast.rule === '1.2.840.113556.1.4.803') {
        var mask = Number(ast.value);
        if (!Number.isSafeInteger(mask) || mask < 0) return false;
        return values.some(function (v) { return (Number(v) & mask) === mask; });
      }
      if (ast.rule === '1.2.840.113556.1.4.804') {
        var bits = Number(ast.value);
        if (!Number.isSafeInteger(bits) || bits < 0) return false;
        return values.some(function (v) { return (Number(v) & bits) !== 0; });
      }
      throw new Error('Unsupported matching rule: ' + ast.rule);
    }
    if (ast.op === '=' && ast.raw === '*') return values.length > 0;
    if (ast.op === '=' && ast.parts.length > 1) {
      var re = new RegExp('^' + ast.parts.map(escapeRE).join('.*') + '$', 'iu');
      return values.some(function (v) { return re.test(String(v)); });
    }
    return values.some(function (v) {
      if (ast.op === '=' || ast.op === '~=') return eq(v, ast.value);
      var a = String(v), b = ast.value;
      if (!Number.isNaN(Number(a)) && !Number.isNaN(Number(b)) && a !== '' && b !== '') {
        return ast.op === '>=' ? Number(a) >= Number(b) : Number(a) <= Number(b);
      }
      var c = a.toLowerCase().localeCompare(b.toLowerCase());
      return ast.op === '>=' ? c >= 0 : c <= 0;
    });
  }

  function ActiveDirectory(seed, options) {
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
            "objectClass": [
              "top",
              "domain",
              "domainDNS"
            ],
            "dc": [
              "contoso"
            ],
            "name": [
              "contoso"
            ]
          }
        },
        {
          "dn": "OU=Users,DC=contoso,DC=local",
          "attributes": {
            "objectClass": [
              "top",
              "organizationalUnit"
            ],
            "ou": [
              "Users"
            ],
            "name": [
              "Users"
            ]
          }
        },
        {
          "dn": "OU=Groups,DC=contoso,DC=local",
          "attributes": {
            "objectClass": [
              "top",
              "organizationalUnit"
            ],
            "ou": [
              "Groups"
            ],
            "name": [
              "Groups"
            ]
          }
        },
        {
          "dn": "OU=Computers,DC=contoso,DC=local",
          "attributes": {
            "objectClass": [
              "top",
              "organizationalUnit"
            ],
            "ou": [
              "Computers"
            ]
          }
        },
        {
          "dn": "CN=Alice Adams,OU=Users,DC=contoso,DC=local",
          "attributes": {
            "objectClass": [
              "top",
              "person",
              "organizationalPerson",
              "user"
            ],
            "objectCategory": [
              "person"
            ],
            "cn": [
              "Alice Adams"
            ],
            "givenName": [
              "Alice"
            ],
            "sn": [
              "Adams"
            ],
            "displayName": [
              "Alice Adams"
            ],
            "sAMAccountName": [
              "alice"
            ],
            "userPrincipalName": [
              "alice@contoso.local"
            ],
            "mail": [
              "alice@contoso.local"
            ],
            "department": [
              "IT"
            ],
            "userAccountControl": [
              512
            ]
          },
          "_password": "Password123!"
        },
        {
          "dn": "CN=Bob Baker,OU=Users,DC=contoso,DC=local",
          "attributes": {
            "objectClass": [
              "top",
              "person",
              "organizationalPerson",
              "user"
            ],
            "objectCategory": [
              "person"
            ],
            "cn": [
              "Bob Baker"
            ],
            "givenName": [
              "Bob"
            ],
            "sn": [
              "Baker"
            ],
            "displayName": [
              "Bob Baker"
            ],
            "sAMAccountName": [
              "bob"
            ],
            "userPrincipalName": [
              "bob@contoso.local"
            ],
            "mail": [
              "bob@contoso.local"
            ],
            "department": [
              "Finance"
            ],
            "userAccountControl": [
              512
            ]
          },
          "_password": "Password123!"
        },
        {
          "dn": "CN=Carol Chen,OU=Users,DC=contoso,DC=local",
          "attributes": {
            "objectClass": [
              "top",
              "person",
              "organizationalPerson",
              "user"
            ],
            "objectCategory": [
              "person"
            ],
            "cn": [
              "Carol Chen"
            ],
            "givenName": [
              "Carol"
            ],
            "sn": [
              "Chen"
            ],
            "displayName": [
              "Carol Chen"
            ],
            "sAMAccountName": [
              "carol"
            ],
            "userPrincipalName": [
              "carol@contoso.local"
            ],
            "mail": [
              "carol@contoso.local"
            ],
            "department": [
              "IT"
            ],
            "userAccountControl": [
              514
            ]
          },
          "_password": "Password123!"
        },
        {
          "dn": "CN=GG_IT_Admins,OU=Groups,DC=contoso,DC=local",
          "attributes": {
            "objectClass": [
              "top",
              "group"
            ],
            "objectCategory": [
              "group"
            ],
            "cn": [
              "GG_IT_Admins"
            ],
            "sAMAccountName": [
              "GG_IT_Admins"
            ],
            "groupType": [
              -2147483646
            ],
            "member": [
              "CN=Alice Adams,OU=Users,DC=contoso,DC=local"
            ]
          }
        },
        {
          "dn": "CN=GG_Finance,OU=Groups,DC=contoso,DC=local",
          "attributes": {
            "objectClass": [
              "top",
              "group"
            ],
            "objectCategory": [
              "group"
            ],
            "cn": [
              "GG_Finance"
            ],
            "sAMAccountName": [
              "GG_Finance"
            ],
            "groupType": [
              -2147483646
            ],
            "member": [
              "CN=Bob Baker,OU=Users,DC=contoso,DC=local"
            ]
          }
        },
        {
          "dn": "CN=GG_All_Staff,OU=Groups,DC=contoso,DC=local",
          "attributes": {
            "objectClass": [
              "top",
              "group"
            ],
            "objectCategory": [
              "group"
            ],
            "cn": [
              "GG_All_Staff"
            ],
            "sAMAccountName": [
              "GG_All_Staff"
            ],
            "groupType": [
              -2147483646
            ],
            "member": [
              "CN=GG_IT_Admins,OU=Groups,DC=contoso,DC=local",
              "CN=Bob Baker,OU=Users,DC=contoso,DC=local"
            ]
          }
        },
        {
          "dn": "CN=PC-001,OU=Computers,DC=contoso,DC=local",
          "attributes": {
            "objectClass": [
              "top",
              "person",
              "organizationalPerson",
              "user",
              "computer"
            ],
            "objectCategory": [
              "computer"
            ],
            "cn": [
              "PC-001"
            ],
            "name": [
              "PC-001"
            ],
            "sAMAccountName": [
              "PC-001$"
            ],
            "dNSHostName": [
              "pc-001.contoso.local"
            ],
            "userAccountControl": [
              4096
            ]
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
    this.LDAP = function (request, params) {
    var req = typeof request === 'string' ? Object.assign({ operation: request }, params || {}) : request;
    if (!req || typeof req !== 'object') return result(CODES.protocolError, null, 'A request object is required');
    var op = String(req.operation || req.op || '').toLowerCase();
    var entries = this.DB.entries, self = this;
    function find(dn) { return entries.find(function (e) { return normalizeDN(e.dn) === normalizeDN(dn); }); }
    function mustBeBound() {
      return self.options.requireBind && !self.boundDN
        ? result(CODES.insufficientAccessRights, null, 'Bind required') : null;
    }
    function missingDN(dn) { return result(CODES.noSuchObject, { matchedDN: '' }, 'No such entry: ' + dn); }

    try {
      if (op === 'bind') {
        var login = String(req.bindDN || req.dn || req.username || '');
        var password = String(req.password == null ? '' : req.password);
        if (!login && !password) { this.boundDN = null; return result(0, { boundDN: '' }); }
        var user = entries.find(function (e) {
          return normalizeDN(e.dn) === normalizeDN(login) ||
            getRaw(e, 'sAMAccountName').some(function (v) { return eq(v, login); }) ||
            getRaw(e, 'userPrincipalName').some(function (v) { return eq(v, login); });
        });
        if (!user || !getRaw(user, 'objectClass').some(function (x) { return eq(x, 'user'); }) ||
            user._password !== password || !password ||
            getRaw(user, 'userAccountControl').some(function (v) { return (Number(v) & 2) !== 0; })) {
          this.boundDN = null;
          return result(CODES.invalidCredentials, null, 'Invalid credentials or disabled account');
        }
        this.boundDN = user.dn;
        return result(0, { boundDN: user.dn });
      }
      if (op === 'unbind') { this.boundDN = null; return result(0); }
      var denied = mustBeBound(); if (denied) return denied;

      if (op === 'search') {
        var base = req.baseDN == null ? this.DB.baseDN : req.baseDN;
        var normalized = normalizeDN(base);
        var scope = (req.scope || 'sub').toLowerCase();
        if (normalized === null || !['base', 'one', 'sub'].includes(scope))
          return result(CODES.protocolError, null, 'Invalid baseDN or scope');
        if (normalized !== '' && !find(base)) return missingDN(base);
        var ast = filterParser(req.filter || '(objectClass=*)');
        var pool = normalized === '' && scope === 'base'
          ? [{ dn: '', attributes: { objectClass: ['top'],
                defaultNamingContext: [this.DB.baseDN], rootDomainNamingContext: [this.DB.baseDN],
                namingContexts: [this.DB.baseDN], supportedLDAPVersion: ['3'],
                dnsHostName: ['dc01.' + this.DB.domain] } }]
          : entries;
        var matchesList = pool.filter(function (e) {
          return isUnder(normalizeDN(e.dn), normalized, scope) && matches(e, ast, entries);
        });
        var limit = req.sizeLimit == null ? Infinity : Number(req.sizeLimit);
        if (!Number.isInteger(limit) && limit !== Infinity || limit < 0)
          return result(CODES.protocolError, null, 'Invalid sizeLimit');
        var sliced = matchesList.slice(0, limit);
        var selected = sliced.map(function (e) {
          return { dn: e.dn, attributes: attrsOf(e, entries, req.attributes) };
        });
        var truncated = sliced.length < matchesList.length;
        return result(truncated ? CODES.sizeLimitExceeded : 0,
          { entries: selected, count: selected.length, truncated: truncated });
      }
      if (op === 'compare') {
        var comparable = find(req.dn);
        if (!comparable) return missingDN(req.dn);
        if (!req.attribute) return result(CODES.protocolError, null, 'attribute required');
        var values = getRaw({ attributes: printableAttrs(comparable, entries) }, req.attribute);
        return result(values.some(function (v) { return eq(v, req.value); }) ? 6 : 5);
      }
      if (['add', 'modify', 'delete'].includes(op)) {
        if (!this.options.allowWrites) return result(CODES.insufficientAccessRights, null, 'Writes disabled');
        if (typeof req.dn !== 'string' || !req.dn || normalizeDN(req.dn) === null)
          return result(CODES.invalidDNSyntax, null, 'Valid dn required');
        var existing = find(req.dn);
        if (op === 'add') {
          if (existing) return result(CODES.entryAlreadyExists);
          var parent = parentDN(normalizeDN(req.dn));
          if (parent && !find(parent)) return missingDN(parent);
          if (!req.attributes || typeof req.attributes !== 'object' || Array.isArray(req.attributes))
            return result(CODES.protocolError, null, 'attributes object required');
          var attrs = {};
          Object.entries(req.attributes).forEach(function (kv) {
            if (kv[0] === '_password') throw new Error('Set passwords via password, not attributes');
            attrs[kv[0]] = list(kv[1]);
          });
          var added = { dn: req.dn, attributes: attrs };
          if (req.password != null) added._password = String(req.password);
          entries.push(added);
          return result(0, { dn: req.dn });
        }
        if (!existing) return missingDN(req.dn);
        if (op === 'delete') {
          var key = normalizeDN(req.dn);
          if (entries.some(function (e) { return parentDN(normalizeDN(e.dn)) === key; }))
            return result(CODES.notAllowedOnNonLeaf, null, 'Delete child entries first');
          entries.splice(entries.indexOf(existing), 1);
          entries.forEach(function (e) {
            var keyMember = getKey(e.attributes, 'member');
            if (keyMember) e.attributes[keyMember] = list(e.attributes[keyMember])
              .filter(function (x) { return normalizeDN(x) !== key; });
          });
          return result(0);
        }
        if (!Array.isArray(req.changes) || !req.changes.length)
          return result(CODES.protocolError, null, 'changes array required');
        // Apply all changes to a copy; commit only if every change is valid.
        var copy = clone(existing);
        for (var change of req.changes) {
          var how = String(change.operation || '').toLowerCase();
          var attr = change.attribute;
          if (!attr || !['add', 'replace', 'delete'].includes(how))
            return result(CODES.protocolError, null, 'Invalid modification');
          if (['_password', 'distinguishedname'].includes(String(attr).toLowerCase()))
            return result(CODES.unwillingToPerform, null, 'Protected attribute');
          var prev = getRaw(copy, attr), values = list(change.values);
          if (how === 'replace') setRaw(copy, attr, values);
          if (how === 'add') {
            if (values.some(function (v) { return prev.some(function (p) { return eq(p, v); }); }))
              return result(CODES.attributeOrValueExists, null, 'Attribute value already exists');
            setRaw(copy, attr, prev.concat(values));
          }
          if (how === 'delete') {
            if (!getKey(copy.attributes, attr)) return result(CODES.noSuchAttribute);
            if (!values.length) delete copy.attributes[getKey(copy.attributes, attr)];
            else setRaw(copy, attr, prev.filter(function (p) {
              return !values.some(function (v) { return eq(v, p); });
            }));
          }
        }
        entries[entries.indexOf(existing)] = copy;
        return result(0, { dn: req.dn });
      }
      return result(CODES.protocolError, null, 'Unknown LDAP operation: ' + op);
    } catch (err) {
      return result(CODES.protocolError, null, err.message);
    }
    };
  }

  // Backwards-compatible utility: returns an independent snapshot of the inline seed.
  ActiveDirectory.sampleDB = function () { return new ActiveDirectory().DB; };
  ActiveDirectory.RESULT_CODES = CODES;
  return ActiveDirectory;
});
