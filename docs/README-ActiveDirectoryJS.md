# ActiveDirectoryJS v0.1.2.2

An offline, standalone, JavaScript **LDAP API simulator** backed by an inline JavaScript object literal that represents a fictional Active Directory. It does **not** implement LDAP network sockets or LDAP BER encoding. Designed for browser-based simulations, including a PowerShellJS adapter.

## Files (repository paths)

- `res/AD_CORE.js` — public `function ActiveDirectory()`; both `this.DB = {...}` and `this.LDAP = function(...) {...}` are declared inside the constructor.
- `tools/ActiveDirectory-demo.html` — offline browser console (loads only `../res/AD_CORE.js` through a standard `<script>` tag).
- `test/ActiveDirectory.test.js` — Node.js regression checks.
- `tools/ActiveDirectory.sample.json` — optional reference snapshot only; not fetched, imported or used at runtime.

Open **`tools/ActiveDirectory-demo.html`** directly in a browser, even from `file://`. There is no asynchronous JSON loading, XHR or `fetch()`, so no CORS issue. The optional **Inspect inline DB** button reveals the active dataset; **Export** downloads a snapshot of in-memory changes. Reset constructs a new object with a clean copy of the literal.

## Public API

```javascript
var oAD = new ActiveDirectory();

// Default scope is "sub", default baseDN is oAD.DB.baseDN.
var response = oAD.LDAP({
  operation: "search",
  baseDN: "DC=contoso,DC=local",
  scope: "sub",                 // "base", "one", "sub"
  filter: "(&(objectCategory=person)(department=IT))",
  attributes: ["cn", "sAMAccountName", "memberOf"]
});
console.log(response.resultCode, response.entries);

// Alternate call style:
response = oAD.LDAP("search", { filter: "(objectClass=group)" });
```

Response schema:

```json
{
  "resultCode": 0,
  "code": "success",
  "success": true,
  "message": "",
  "entries": [
    {"dn":"...","attributes":{"cn":["Alice Adams"]}}
  ],
  "count": 1,
  "truncated": false
}
```

All attribute values are returned as arrays. Requested attribute projection is supported; `attributes:["1.1"]` selects none. `resultCode` uses LDAP-style codes (0 success, 4 sizeLimitExceeded, 5 compareFalse, 6 compareTrue, 32 noSuchObject, 49 invalidCredentials, etc.).

### Bind / unbind

```javascript
var oAD = new ActiveDirectory(undefined, {requireBind:true});
oAD.LDAP({operation:"bind", username:"alice", password:"Password123!"});
oAD.LDAP({operation:"unbind"});
```

Anonymous searches are allowed by default to simplify development. Set `requireBind:true` to require a successful bind before non-bind operations. **This is a toy login check, not secure authentication or an authorization model**. Disabling a user account with userAccountControl bit `2` disallows its bind. All sample credentials are intentionally fictitious.

### Add / modify / delete / compare

```javascript
oAD.LDAP({
  operation:"add",
  dn:"CN=GG_Developers,OU=Groups,DC=contoso,DC=local",
  attributes:{objectClass:["top","group"],objectCategory:["group"],cn:["GG_Developers"],member:[]}
});

oAD.LDAP({
  operation:"modify",
  dn:"CN=GG_Developers,OU=Groups,DC=contoso,DC=local",
  changes:[{operation:"add",attribute:"member",values:["CN=Alice Adams,OU=Users,DC=contoso,DC=local"]}]
});

oAD.LDAP({
  operation:"compare",
  dn:"CN=Alice Adams,OU=Users,DC=contoso,DC=local",
  attribute:"department",value:"IT"
});

oAD.LDAP({operation:"delete",dn:"CN=GG_Developers,OU=Groups,DC=contoso,DC=local"});
```

Modify changes support `add`, `replace`, and `delete`. Modifications are atomic within one call. Deleting an entry with children returns 66. Group members are represented by DN-valued `member` attributes; `memberOf` is derived automatically from them.

## Filter expressions

Supported LDAP filter features (subset of RFC 4515):

- Exact equality, presence, wildcards, `>=`, `<=`, `~=` (simple approximate equality)
- Compound `&`, `|`, `!`
- Hexadecimal escaped values like `\2a` for a literal asterisk, including UTF-8 bytes
- Active Directory nested group match: `memberOf:1.2.840.113556.1.4.1941:=<groupDN>` and the reverse `member` form
- AD bitwise AND and OR matching rules: `1.2.840.113556.1.4.803` and `.804`

Example (nested group membership):

```text
(memberOf:1.2.840.113556.1.4.1941:=CN=GG_All_Staff,OU=Groups,DC=contoso,DC=local)
```

The sample dataset includes the group `GG_All_Staff` with nested `GG_IT_Admins`, illustrating direct and inherited membership.

## Inline directory dataset — single source of truth

The default directory is **literal data inside the constructor**, not a runtime resource. There is **no IIFE, factory, CommonJS export, or module wrapper**. The browser loads a classic script and receives a global `ActiveDirectory` function:

```javascript
// res/AD_CORE.js (shortened illustration)
function ActiveDirectory(seed, options) {
  this.DB = {
    domain: 'contoso.local',
    baseDN: 'DC=contoso,DC=local',
    entries: [ /* inline users, groups, OUs, computers */ ]
  };
  // Optional in-memory seed override, options and binding state.
  this.LDAP = function (request, params) {
    // LDAP request processing, operating on this.DB
  };
  // Private helper functions and local constants are declared inside this function.
}

var oAD = new ActiveDirectory();
var response = oAD.LDAP('search', {filter:'(objectClass=group)'});
console.log(response.entries, oAD.DB);
```

Edit `this.DB` in `res/AD_CORE.js` to change the shipped fixture. Each `new ActiveDirectory()` gets an independent default directory. You may still supply **an already available JavaScript object** as the first argument for tests or custom simulations; this does not load a file:

```javascript
var ownDB = {
  domain:'example.org', baseDN:'DC=example,DC=org',
  entries:[{dn:'DC=example,DC=org',attributes:{objectClass:['top','domain'],dc:['example']}}]
};
var oAD = new ActiveDirectory(ownDB, {allowWrites:true, requireBind:false});
```

`ActiveDirectory.sampleDB()` is maintained for existing tests and consumers and returns an independent copy of the inline default. It does not read `tools/ActiveDirectory.sample.json`. The emulator never fetches any JSON. The exported JSON file is optional, manual and not automatically re-imported.

## Intended PowerShellJS integration

The PowerShellJS v0.2 simulator now loads `res/AD_CORE.js` as its only directory engine. The `PowerShellAD` compatibility API exposed by the same file translates PowerShell-specific `-Filter` syntax, cmdlet object projections and membership operations onto an instance of `ActiveDirectory` and its public `LDAP()` method. The original `res/PS_AD.js` is retired. Both applications use the same engine but construct **separate in-memory directory instances**, preserving their respective `corp.example.com` and `contoso.local` fixtures. See `docs/AD_CORE_INTEGRATION.md` for architecture details.

## Limits of v0.1

This is **not** a real LDAPv3 server or a security boundary. Missing features include wire protocol/BER, TLS, ACLs, safe credential storage, true AD schema enforcement, change notifications, LDAP paging/cookies, server-side sorting, referrals, controls, multi-domain forests, AD replication, LDAP DN edge cases, and many LDAP matching rules. Attributes and DNs are compared case-insensitively for demonstration; true LDAP matching rules differ by attribute schema. Demonstration password values in the in-memory JSON are plaintext and should never be reused for real authentication. A demo DB export will include them.

## Tests

With Node.js installed:

```bash
node test/ActiveDirectory.test.js
```

Expected: `33 tests passed.`

### Node test runner without CommonJS in the emulator

`test/ActiveDirectory.test.js` uses Node's `vm.runInThisContext()` to load the browser script into a test context. `res/AD_CORE.js` itself contains **no** `require()`, `module.exports`, `export`, or wrapper. Browser code uses the global `ActiveDirectory` directly with a classic script tag.
