# ActiveDirectoryJS v0.1

An offline, standalone, JavaScript **LDAP API simulator** backed by an editable JSON Active Directory–like directory. It does **not** implement LDAP network sockets or LDAP BER encoding. Designed for browser-based simulations, including a PowerShellJS adapter.

## Files

- `ActiveDirectory.js` — callable, reusable emulator. No dependencies.
- `ActiveDirectory-demo.html` — simple offline LDAP request console.
- `ActiveDirectory.sample.json` — example editable directory JSON.
- `ActiveDirectory.test.js` — Node.js self-tests (28 assertions/scenarios).

Open `ActiveDirectory-demo.html` from the same folder as `ActiveDirectory.js` in a browser. It works with `file://` and does not need a server. Use the example menu, edit the JSON request, then click **Run LDAP()**. The import control reads a local JSON file; changes remain in memory until exported.

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

## Custom directory data

Construct directly from a static JSON object:

```javascript
var ownDB = {
  domain:"example.org",baseDN:"DC=example,DC=org",
  entries:[
    {dn:"DC=example,DC=org",attributes:{objectClass:["top","domain"],dc:["example"]}}
  ]
};
var oAD = new ActiveDirectory(ownDB, {allowWrites:true, requireBind:false});
```

Or from an existing JSON file (when fetched via a web server):

```javascript
const data = await (await fetch('ActiveDirectory.sample.json')).json();
const oAD = new ActiveDirectory(data);
```

For pure offline `file://` use, use the demo's **local file import** rather than `fetch()` to avoid browser security restrictions.

## Intended PowerShellJS integration

PowerShellJS should translate its parsed AST to a request object; it should not know the internal `DB.entries` layout. E.g. `Get-ADUser -Filter *` maps to a `search` with `(objectCategory=person)` and optional PowerShell-side projection. Keep LDAP emulation and PowerShell command parsing as separate modules.

## Limits of v0.1

This is **not** a real LDAPv3 server or a security boundary. Missing features include wire protocol/BER, TLS, ACLs, safe credential storage, true AD schema enforcement, change notifications, LDAP paging/cookies, server-side sorting, referrals, controls, multi-domain forests, AD replication, LDAP DN edge cases, and many LDAP matching rules. Attributes and DNs are compared case-insensitively for demonstration; true LDAP matching rules differ by attribute schema. Demonstration password values in the in-memory JSON are plaintext and should never be reused for real authentication. A demo DB export will include them.

## Tests

With Node.js installed:

```bash
node ActiveDirectory.test.js
```

Expected: `28 tests passed.`
