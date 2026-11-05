# IGAsim — JavaScript Coding Conventions

**Scope:** Browser-side JavaScript object containers and their inline JSON-like datasets.  
**Goal:** Consistency, readability, minimal boilerplate, and standalone `file://` operation.

## 1. Object containers: plain constructor functions

Use a **top-level named constructor function**. Put public data and callable methods directly on `this`; keep internal helpers local to the constructor.

```javascript
function ActiveDirectory()
{
    // Inline, per-instance database
    this.DB = {
        "domain": "contoso.local",
        "baseDN": "DC=contoso,DC=local",
        "entries": [
            {
                "dn": "DC=contoso,DC=local",
                "attributes": {
                    "objectClass": ["top","domain","domainDNS"],
                    "dc": ["contoso"]
                }
            }
        ]
    };

    // Private helper
    function normalizeDN(dn) { return String(dn).trim().toLowerCase(); }

    // Public callable method
    this.LDAP = function(request)
    {
        // Interpret request and operate on this.DB.
        return { resultCode: 0, entries: this.DB.entries };
    };
}

var oAD = new ActiveDirectory();
var response = oAD.LDAP({ operation: "search", filter: "(objectClass=user)" });
```

This illustrates the **shape** of the API, not a complete LDAP implementation. Each instance must own its own mutable dataset.

**Do not introduce** an IIFE, UMD wrapper, factory, `class`, `prototype` forwarding, `module.exports`, `export default`, or explicit `globalThis` assignment just to define a browser-side object container. A normal `<script src="res/ActiveDirectory.js"></script>` makes the top-level function available to subsequent classic scripts.

## 2. Braces: Allman for executable blocks

Put opening and closing braces on separate lines for **multiline functions, conditions, loops, and exception handling**.

```javascript
this.LDAP = function(request)
{
    if (request.operation === "search")
    {
        for (var i = 0; i < this.DB.entries.length; i++)
        {
            // Search logic.
        }
    }
    else
    {
        return { resultCode: 2, message: "Unsupported operation" };
    }
};
```

**Data literals are the exception:** write `this.DB = {` and `"attributes": {` on one line. JSON-like objects are values, not executable control-flow blocks; forcing Allman braces onto them harms readability.

## 3. One-line functions: pragmatic exception

A function may use a **single-line declaration and body** when the *whole line* is normally **under 100 characters**, contains a simple statement, and is easier to scan inline.

```javascript
this.getHexWord    = function(v) { return hex2tab[v>>8] + hex2tab[v&0xFF]; };
this.getHexByte    = function(v) { return hex2tab[v&0xFF]; };
function clone(x) { return JSON.parse(JSON.stringify(x)); }
```

Optionally align `=` across a small group of related method declarations. Use multiline Allman formatting whenever a function grows longer, contains branching/loops, or becomes difficult to understand. Do not compress `if`, `for`, or `try` blocks merely to save lines.

The 100-character threshold is a **guideline for one-line functions**, not a rigid limit on all source-code lines.

## 4. JSON datasets: compact but readable

**Prefer compact arrays of simple values:**

```javascript
"attributes": {
    "objectClass": ["top","domain","domainDNS"],
    "objectCategory": ["person"],
    "cn": ["Alice Adams"],
    "department": ["IT"],
    "userAccountControl": [512]
}
```

**Avoid expanding short arrays across several lines:**

```javascript
"attributes": {
    "objectClass": [
        "top",
        "domain",
        "domainDNS"
    ]
}
```

Keep **substantial records and nested structures multiline**:

```javascript
"entries": [
    {
        "dn": "CN=Alice Adams,OU=Users,DC=contoso,DC=local",
        "attributes": {
            "objectClass": ["top","person","organizationalPerson","user"],
            "cn": ["Alice Adams"],
            "sAMAccountName": ["alice"],
            "department": ["IT"],
            "memberOf": ["CN=GG_IT_Admins,OU=Groups,DC=contoso,DC=local"]
        }
    },
    {
        "dn": "CN=GG_IT_Admins,OU=Groups,DC=contoso,DC=local",
        "attributes": {
            "objectClass": ["top","group"],
            "cn": ["GG_IT_Admins"],
            "member": ["CN=Alice Adams,OU=Users,DC=contoso,DC=local"]
        }
    }
]
```

Rules of thumb:

- Short arrays of scalars: **one line**, e.g. `["top","user"]`; omit unnecessary spaces after commas in compact data arrays.
- Long arrays: wrap when needed for readability, not because an automatic pretty-printer demands it.
- Arrays of complex objects: **one logical object per multiline block**.
- Small result objects: inline when obvious, e.g. `{ resultCode: 0, count: 3 }`.
- Static datasets: prefer JSON-compatible literals (double-quoted keys/strings, no trailing commas, no functions inside data). JavaScript comments may surround records, but standalone `.json` cannot contain comments.
- Avoid both extremes: a sprawling pretty-printed value per line **and** an unreadable minified dataset.

## 5. General formatting

| Topic | Convention |
|---|---|
| Indentation | **4 spaces**, never tabs |
| Multiline executable blocks | **Allman** braces |
| Simple functions | Optional one-line form, normally **under 100 characters** |
| JSON/object literal braces | Compact data layout; `{` may follow `=` or `:` |
| Constructor naming | `PascalCase`, e.g. `ActiveDirectory` |
| Public methods | `this.camelCase = function(...)`; retain established names such as `this.LDAP` |
| Public state | `this.property`; retain established names such as `this.DB` |
| Private helpers | Local named functions inside the constructor |
| Statements | Use semicolons for assignments and expressions; no semicolon after function declarations |
| Related assignments | Optional `=` alignment if it genuinely helps readability |

## 6. Browser-first architecture

Default simulation data must be **declared inline** inside the object container, rather than retrieved by `fetch()` from a `.json` file. Avoid unnecessary CORS and `file://` issues. An *optional* in-memory seed argument or a user-initiated import may be supported, but must not become a required external dependency.

```html
<script src="res/ActiveDirectory.js"></script>
<script>
    var oAD = new ActiveDirectory();
    var response = oAD.LDAP("search", { filter: "(objectClass=user)" });
    console.log(response);
</script>
```

Consumers (for example PowerShellJS) should use the **public method** `oAD.LDAP(...)`, not depend directly on the layout of `oAD.DB` unless explicitly designing the directory container itself.

## 7. Review checklist

- [ ] Named, plain constructor with public members directly on `this`.
- [ ] Inline default dataset; no required external JSON request.
- [ ] Allman braces for multiline executable blocks.
- [ ] Short, simple functions remain compact where helpful.
- [ ] Small scalar arrays compact; nested objects remain readable.
- [ ] No unnecessary wrappers, factories, prototype forwarding, or module exports.
- [ ] Public API remains compatible with existing callers.
- [ ] Changes tested with separate instances and relevant LDAP operations.
- [ ] Browser demo works when opened directly from `file://`.

**Adoption:** Apply these conventions to new and actively modified IGAsim code. Avoid formatting-only rewrites of unrelated legacy files unless explicitly requested. When an exception improves clarity or compatibility, document it briefly.
