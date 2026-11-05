# IGAsim ActiveDirectoryJS inline-data refactor

Base revision: `46288fe657efc58a10cd8249b01351fa2501d19a`.

Changes are limited to four files in their existing repository subdirectories:

- `res/ActiveDirectory.js`: declares `this.DB = {...}` (11 fictional directory entries) and `this.LDAP = function(request,params){...}` directly inside `function ActiveDirectory()`. Retains existing calls and independent instances. No file reads, external JSON fetches, network calls, or CORS requirements.
- `res/ActiveDirectory.test.js`: extends the regression suite to 32 checks.
- `tools/ActiveDirectory-demo.html`: offline, relative script import and inline dataset inspector; no JSON file import or fetch.
- `docs/README-ActiveDirectoryJS.md`: documents the inline-only default, API, paths and offline behavior.

To apply the patch from the **root of your IGAsim checkout**:

```bash
git checkout 46288fe657efc58a10cd8249b01351fa2501d19a
# (optional) git switch -c refactor/inline-active-directory-ldap
git apply --check IGAsim-inline-ad.patch
git apply IGAsim-inline-ad.patch
node res/ActiveDirectory.test.js
# commit changes after verification
```

Or copy `res/`, `tools/`, and `docs/` from this package into your checkout, preserving the subdirectory names. The optional `tools/ActiveDirectory.sample.json` in the original repository remains a reference only; it is **not loaded** by any of the changed runtime files.

The existing PowerShellJS v0.2 implementation (`res/PS_AD.js`) remains unchanged; it currently uses a separate in-memory directory.
