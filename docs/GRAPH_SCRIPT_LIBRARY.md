# Microsoft Graph PowerShell example library

The Graph examples are built into `index.html` so they work without a web server or fetching `.ps1` files. Choose **More Entra ID / Graph scripts** in the script editor, select an example, and click **Run script**. The examples below are also available as standalone `.ps1` files under `examples/graph/` for reading and editing. The HTML editor always uses its inline versions; those `.ps1` files are not fetched at runtime.

These scripts run against the fictional `northwind.example` tenant in `ENTRA_CORE.js`. `Connect-MgGraph` is simulated; no network traffic or real authentication occurs and the requested scopes are not enforced. Identifiers and credentials are fictional.

## Read-only examples

- **Tenant overview** (`examples/graph/read/graphTenant.ps1`) — Simulated Microsoft Entra tenant and session
- **IT and enabled users** (`examples/graph/read/graphITUsers.ps1`) — OData filtering is different from AD LDAP filtering
- **Paging and counts** (`examples/graph/read/graphPaging.ps1`) — -Top limits a page; -All follows @odata.nextLink
- **Direct/nested groups** (`examples/graph/read/graphMembership.ps1`) — Compare direct with transitive membership in a nested group
- **Directory role members** (`examples/graph/read/graphRoles.ps1`) — Inspect fictional directory role assignments
- **Apps, principals, devices** (`examples/graph/read/graphApplications.ps1`) — Inventory the tenant's applications, service principals and devices
- **Raw Graph API requests** (`examples/graph/read/graphRequest.ps1`) — REST-style Graph responses (including @odata.nextLink)
- **Compare AD and Entra** (`examples/graph/read/graphHybrid.ps1`) — Separate fictional directories: no synchronization is implied

## Examples that change tenant data

- **Enable cloud account** (`examples/graph/write/graphEnable.ps1`) — Changes are only in memory: Reset sandbox restores the original state
- **Create cloud user** (`examples/graph/write/graphNewUser.ps1`) — Create a fictional user; password is not persisted by the simulator
- **Create security group** (`examples/graph/write/graphNewGroup.ps1`) — Create a cloud security group and inspect it
- **Add/remove group member** (`examples/graph/write/graphMembershipEdit.ps1`) — Add a new direct group member, inspect, then undo
- **Graph PATCH update** (`examples/graph/write/graphPatch.ps1`) — Update an attribute using Graph's REST-style endpoint
- **Register application** (`examples/graph/write/graphAppRegistration.ps1`) — Create a simulated app registration and linked service principal

**Reset sandbox** restores the original Entra directory and disconnects the simulated Graph session. Read-only scripts can be run repeatedly without changes. Some creation/mutation scripts are meant to be run once per reset; re-running them can produce duplicate-object or already-a-member errors. The add/remove membership example is self-reversing.

## Supported features and limits

- `Get-MgUser`, `Get-MgGroup`, `Get-MgApplication`, `Get-MgServicePrincipal`, `Get-MgDevice`, `Get-MgDirectoryRole`, relationship queries, and `Invoke-MgGraphRequest` use the existing simulated Microsoft Graph API.
- Filters use **OData**, not LDAP. `$filter`, `$select`, `$top`, `@odata.nextLink` and limited `$orderby` are emulated.
- The PowerShell parser implements only a subset of PowerShell. Examples avoid unsupported constructs such as advanced `param`, splatting, `try/catch`, `ConvertTo-Json` and `ForEach-Object`.
- The AD and Entra datasets are **independent**; the comparison sample does not imply synchronization.

Run `node res/PS_GRAPH_SAMPLES.test.js` to check every example as actually embedded in `index.html`, including a simulated editor-click/Run interaction.
