# ENTRA_CORE.js v0.1 — Microsoft Entra ID / Microsoft Graph simulator

**Status:** Standalone browser-side Graph **subset** for IGAsim. This is not a Microsoft Graph client and does not contact Microsoft Entra ID. It uses only fictional in-memory data.

## Design

- A plain, top-level `function EntraDirectory(seed, options)`; instance methods and the dataset are directly on `this`.
- `this.DB = {...}` is the default inline fictional tenant. A fresh instance receives an independent deep copy.
- `this.Graph(method, endpoint, request)` simulates HTTP request handling and returns `{ status, headers, body }` **synchronously**.
- No `class`, IIFE, factory wrapper, CommonJS export, external JSON, `fetch()`, real tokens, LDAP or network dependency.
- Conventions: `docs/CODING_CONVENTIONS.md` (Allman executable blocks, short one-line helpers, compact scalar arrays).

This module is loaded by `index.html`, alongside `res/PS_GRAPH_COMMANDS.js`. The adapter registers simulated Microsoft Graph PowerShell cmdlets (such as `Connect-MgGraph`, `Get-MgUser`, `Get-MgGroup`, and `Invoke-MgGraphRequest`) in PowerShellJS while keeping `AD_CORE.js` for on-prem AD/LDAP. See [the PowerShell Graph command guide](PS_GRAPH_COMMANDS.md).

## Browser usage

```html
<script src="res/ENTRA_CORE.js"></script>
<script>
    var oEntra = new EntraDirectory();

    var response = oEntra.Graph("GET", "/v1.0/users", {
        query: {
            "$filter": "department eq 'IT'",
            "$select": "id,displayName,department"
        }
    });

    console.log(response.status);     // 200
    console.log(response.body.value); // fictional IT users
</script>
```

Open `tools/EntraDirectory-demo.html` directly using `file://` to try sample requests with a minimal HTTP method/endpoint/JSON-body interface.

## API contract

```javascript
var oEntra = new EntraDirectory(seed, options);

var response = oEntra.Graph(method, endpoint, {
    query: { "$filter": "accountEnabled eq true", "$top": 2 },
    headers: { ConsistencyLevel: "eventual" },
    body: { displayName: "Example" }
});
```

- `method`: `GET`, `POST`, `PATCH` or `DELETE`.
- `endpoint`: `/v1.0/users`, `/users` shorthand, or `https://graph.microsoft.com/v1.0/users`. `beta`, other hosts and external URLs are rejected.
- `query`: optional named OData parameters, combined with query parameters supplied in the URL.
- `headers`: used for the simplified `$count` handling; there is no HTTP transport.
- `body`: JavaScript object for write requests. Responses and newly supplied seeds are cloned so callers do not accidentally mutate the stored tenant through a response object.
- Return value: `{ status: 200|201|204|400|401|403|404|405, headers: {...}, body: {...}|null }`. `204` has a null body; errors use `{ "error": { "code": "...", "message": "..." } }`.

### Implemented resources

| Resource | GET collection/item | POST collection | PATCH item | DELETE item |
|---|---|---|---|---|
| `/users` | Yes; ID or UPN lookup | Yes | Yes | Yes |
| `/groups` | Yes | Yes | Yes | Yes |
| `/applications` | Yes | Yes | Yes | Yes |
| `/servicePrincipals` | Yes | Yes | Yes | Yes |
| `/directoryRoles` | Yes | No | No | No |
| `/devices` | Yes | No | No | No |
| `/organization` | Yes | No | No | No |

Graph relationships included:

- `GET /groups/{id}/members`
- `GET /groups/{id}/transitiveMembers` (recursive expansion)
- `POST /groups/{id}/members/$ref` with `{ "@odata.id": "https://graph.microsoft.com/v1.0/directoryObjects/{id}" }`
- `DELETE /groups/{id}/members/{memberId}/$ref`
- `GET /users/{id}/memberOf`, `GET /groups/{id}/memberOf`
- `GET /directoryRoles/{id}/members`

The model checks duplicate memberships, cycles in nested security groups, and unsupported member types for Microsoft 365 groups. Group membership is represented internally by `memberIds` but is not exposed as a Graph JSON property. Role memberships and directory roles are read-only at this stage.

### Supported OData subset

- `$filter`: `eq`, `ne`, `gt`, `ge`, `lt`, `le`, `and`, `or`, `not`, parentheses, `startswith()`, `endswith()`, `contains()` and string literals with doubled-apostrophe escaping. It is parsed explicitly, **never evaluated as JavaScript**.
- `$select`: comma-separated existing schema properties. A known but unset property returns `null`.
- `$orderby`: one property, optionally `asc` or `desc`.
- `$top`: 1–999, with default page size of 100.
- `$skiptoken`: a simple integer offset token for this simulator; next pages have an absolute `@odata.nextLink` URL.
- `$count=true`: produces `@odata.count`. Use `{ headers: { ConsistencyLevel: "eventual" } }` in this simulator. `GET /users/$count` returns a `text/plain` numeric string.
- `$search`, `$expand`, `$skip`, OData `any`/`all`, batch requests, delta queries, advanced filter rules, tokenization, and beta-specific endpoints are **not implemented**. Unsupported parameters return errors rather than fake results.

OData implementation is deliberately partial and not identical to all Microsoft Graph collection-specific rules. For example, the simulated `$skiptoken` is **not** a real Graph continuation token, and the simulated filter evaluator uses case-insensitive string comparisons.

### Write examples

```javascript
var created = oEntra.Graph("POST", "/v1.0/users", {
    body: {
        displayName: "Dana Owens",
        userPrincipalName: "dana@northwind.example",
        mailNickname: "dana",
        accountEnabled: true,
        department: "Research",
        passwordProfile: { password: "FICTIONAL-DEMO-PASSWORD" }
    }
});

// The supplied password is not stored in the in-memory directory.
var id = created.body.id;
oEntra.Graph("PATCH", "/v1.0/users/" + id, {
    body: { department: "Operations" }
});
oEntra.Graph("DELETE", "/v1.0/users/" + id);
```

### Sessions and reset

`new EntraDirectory()` allows requests without connecting, for easy offline experimentation. For a **simulated** connection requirement:

```javascript
var oEntra = new EntraDirectory(undefined, { requireAuth: true });
oEntra.Graph("GET", "/v1.0/users"); // status 401

oEntra.Connect(["User.Read.All"]); // simulation only; accepts any array
oEntra.Graph("GET", "/v1.0/users"); // status 200
oEntra.Disconnect();
oEntra.Reset(); // restore original dataset, reset IDs and clear the session
```

**Security:** `Connect()` does not validate tokens, credentials, scopes or directory roles. Scopes are metadata only; the module does **not** enforce authorization. Do not treat this as an authenticated service or a safe sandbox for untrusted code. Nothing is persisted outside the current page.

### Fixture and extensibility

The default tenant is `northwind.example` with three users (one disabled), three groups (nested security groups plus a Microsoft 365 group), one application, one service principal, one directory role and one device. All identifiers and account details are fictional. Default data may be edited directly inside the constructor, or a fully formed in-memory `seed` object can be supplied. No JSON file is loaded.

PowerShellJS integration is provided in `PS_GRAPH_COMMANDS.js`, which translates `Get-MgUser`, `Get-MgGroup`, `Invoke-MgGraphRequest` and related commands to `EntraDirectory.Graph(...)`. The core remains independent of PowerShell, as do the on-prem `AD_CORE.js` LDAP backend and its fixture. `Get-Entra*` aliases and hybrid synchronization are not implemented in this version.

## Run tests

From the repository root:

**Run the regression suites:** Open [`test/index.html`](../test/index.html) in a browser. The dashboard runs the complete suite without Node.js or a server.

The test suite covers global script loading, schema and state isolation, OData queries, pagination, CRUD, relationship operations, error envelopes, and simulated session/reset behavior. The browser regression runner and the browser runtime have no Node.js dependency.

## Microsoft documentation used as API references

- [List users](https://learn.microsoft.com/en-us/graph/api/user-list)
- [Add group members](https://learn.microsoft.com/en-us/graph/api/group-post-members)
- [Microsoft Graph error responses](https://learn.microsoft.com/en-us/graph/errors)

Only the documented subset above is implemented; this should not be used to predict the behavior of production Microsoft Graph or Microsoft Entra ID.
