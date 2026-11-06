# IGAsim — Enterprise IGA Capability & Test-Readiness Checklist

> **Baseline:** `flyingzebra/IGAsim` commit `a519417fc448a00eed9bc03ad18cc0ecd1e958d0` (`Access catalog + Access package CRUD`).
> **Source taxonomy:** [`docs/CAPABILITIES.md`](CAPABILITIES.md) — all eight capability domains and all 118 original IDs, preserving their labels.
> **Assessment date:** 2026-11-05 (capability assessment); file-location migration: 2026-11-06. **Runtime:** offline browser simulation of fictional AD and Entra tenants, **not** a deployed enterprise IGA product.

## How to use this checklist

- **`[x] Ready`** — capability has a scoped, executable simulator-level behavior plus a documented test scenario. This is **not** an enterprise acceptance sign-off.
- **`[x] Partial`** — a relevant lower-level primitive is runnable/testable, but the full capability described in `CAPABILITIES.md` is **not** implemented.
- **`[ ] Not ready`** — there is no meaningful end-to-end test for this capability yet; the last column describes the missing design/work.
- A checked box means **a test can be attempted now**, not that a user has executed or approved acceptance testing. Existing automated test results are reported separately below.
- Scope is **in-memory and fictional**. There is no live Microsoft Graph, LDAP server, SAP, SharePoint, Power BI, Power Automate, secure tenant authentication, or enforcement of Microsoft Graph scopes. A simulated `Connect-MgGraph` is not an actual sign-in.
- The `RBM-01/02` business-role/IT-role interpretation is an **IGAsim governance mapping**, not a claim that Entra catalogs are independently assignable business roles.

## Readiness summary

| Classification | Capabilities | Meaning |
|---|---:|---|
| ✅ Ready for **scoped simulator testing** | **4** | Feature-level functionality implemented in a simulated backend |
| 🟡 Partial — **primitive can be tested** | **23** | Some working operations, full capability still missing |
| ⬜ Not ready | **91** | Requires functional implementation before meaningful testing |
| **Total** | **118** | Matches `docs/CAPABILITIES.md` |

### Domain coverage (all original capability IDs)

| Capability domain | Ready | Partial | Not ready | Total |
|---|---:|---:|---:|---:|
| 4.1 Identity lifecycle management | 0 | 7 | 9 | 16 |
| 4.2 Entitlement and permission management | 0 | 7 | 10 | 17 |
| 4.3 Business role and IT role management | 3 | 2 | 11 | 16 |
| 4.4 Access request and approval management | 0 | 0 | 12 | 12 |
| 4.5 Access certification and compliance | 0 | 0 | 14 | 14 |
| 4.6 Risk management and segregation of duties | 0 | 0 | 15 | 15 |
| 4.7 Provisioning and reconciliation | 1 | 5 | 8 | 14 |
| 4.8 Governance, audit and reporting | 0 | 2 | 12 | 14 |

**Immediately testable at some level:** 27 / 118 capabilities (4 ready; 23 partial). All other 91 are backlog items, not passed tests.

## 1. Execute the browser regression suites

Open **[`test/index.html`](../test/index.html)** directly from your local IGAsim checkout. The dashboard runs all eight suites, and you can select **Run all suites** again to repeat them. **No Node.js, npm or web server is required.** The browser tests use the same classic JavaScript runtime modules in `res/`.

The eight test files are `test/PS_TESTS.js`, `test/PS_TESTS_v01.js`, `test/ENTRA_CORE.test.js`, `test/PS_GRAPH_TESTS.js`, `test/PS_GRAPH_SAMPLES.test.js`, `test/ENTITLEMENT_TESTS.js`, `test/ActiveDirectory.test.js`, and `test/AD_INTEGRATION_SMOKE.js`. They are launched through the dashboard rather than executed as standalone command-line scripts.

**Verified in a browser-script execution harness on the matching code snapshot:** 50 + 18 + 53 + 54 + 17 + 32 + 33 + 14 = **271 checks passed**. The harness used inlined script sources because the verification environment blocks local-file navigation; the actual `file://` dashboard still needs a local interactive check. This is simulator regression evidence, not acceptance of all 118 IGA capabilities.

## 2. Test scenarios and evidence map

| ID | Scenario | Availability | Procedure | Expected result | Automated evidence | Related capabilities |
|---|---|---|---|---|---|---|
| **T01** | On-prem AD discovery | Ready (read-only) | Open `index.html` → AD users example, or run `Get-ADUser -Filter *` and `Get-ADGroup -Filter *`. | Results contain fictional AD users and groups. | `test/PS_TESTS.js`, `test/AD_INTEGRATION_SMOKE.js` | IDM-01 |
| **T02** | AD LDAP filters / transitive group queries | Ready (read-only) | Run `Get-ADGroupMember -Identity APP_Reporting -Recursive`, `Search-LDAP ...` and inspect `Get-LDAPQueryLog`. | Nested membership and LDAP/AD filters return matching fictional entries. | `test/PS_TESTS.js`, `test/AD_INTEGRATION_SMOKE.js` | ENT-01, ENT-02, ENT-12, ENT-13, ENT-15, ENT-16 |
| **T03** | AD account mutation and fixture reset | Ready (mutating) | Run **Modify AD** example (`Set-ADUser`, `Add-ADGroupMember`); inspect; select **Reset sandbox**. | Changes are visible immediately and original seed is restored after reset. | `test/PS_TESTS.js`, `test/AD_INTEGRATION_SMOKE.js` | IDM-06, IDM-08, ENT-17, PRO-02, PRO-03, PRO-06, PRO-08 |
| **T04** | Entra discovery / OData / paging | Ready (read-only) | Run **Tenant overview**, **IT and enabled users**, and **Paging and counts**, using `Connect-MgGraph` and `Get-MgUser`. | Users/groups filter and paginate; `$select` and counts follow the simulator subset. | `test/ENTRA_CORE.test.js`, `test/PS_GRAPH_TESTS.js`, `test/PS_GRAPH_SAMPLES.test.js` | IDM-01 |
| **T05** | Entra user CRUD and enabled state | Ready (mutating) | Run **Create cloud user**, **Enable cloud account**, **Graph PATCH update**; read modified users; reset. | Create/update/enable changes observable through `Get-MgUser` and raw Graph; reset undoes fixture changes. | `test/PS_GRAPH_TESTS.js`, `test/PS_GRAPH_SAMPLES.test.js` | IDM-04, IDM-05, IDM-06, IDM-08, PRO-01, PRO-02, PRO-03, PRO-08 |
| **T06** | Group CRUD / direct versus nested membership | Ready (mutating) | Run **Direct/nested groups**, **Create security group**, **Add/remove group member**. | Direct member changes work; transitive member reads expand nested groups; independent sessions do not leak state. | `test/PS_GRAPH_TESTS.js`, `test/ENTRA_CORE.test.js` | ENT-01, ENT-02, ENT-12, ENT-13, ENT-15, ENT-16, PRO-04, PRO-06 |
| **T07** | Cloud applications and service principals | Ready (read/write) | Run **Apps, principals, devices** and **Register application** examples. | Inventory and application/service-principal CRUD work within fictional tenant. | `test/ENTRA_CORE.test.js`, `test/PS_GRAPH_TESTS.js` | IDM-09, IDM-10 |
| **T08** | Access catalog list/CRUD | Ready (read/write) | Run **Catalog read/create/update/delete** scripts under Governance examples. | CRUD works; cannot mutate/delete protected General catalog; deletion of populated catalog rejected. | `test/ENTITLEMENT_TESTS.js`; `examples/graph/entitlement/{read,write}/govCatalog*.ps1` | RBM-01, RBM-11, GOV-02 |
| **T09** | Access package list/CRUD | Ready (read/write) | Run **Package read/create/update/delete**, and **Lifecycle** examples. | Package CRUD works, returned IDs are usable, and reset restores seed. | `test/ENTITLEMENT_TESTS.js`; `examples/graph/entitlement/{read,write}/govPackage*.ps1` | RBM-02, RBM-11, GOV-03 |
| **T10** | Catalog-to-package mapping and integrity | Ready (read-only / negative) | Read catalogs with `$expand=accessPackages`, packages with `$expand=catalog`, and try invalid catalog IDs. | A package references exactly one catalog; invalid refs and moving packages are rejected. | `test/ENTITLEMENT_TESTS.js`; `govCatalogRead.ps1`, `govPackageRead.ps1` | RBM-03, RBM-05 |
| **T11** | Negative behavior and reset isolation | Ready (negative) | Attempt unsupported Graph paths/fields, delete nonempty catalog, and instantiate separate tenants. | Structured error codes, no cross-instance writes and reset restoring fictional seeds. | `test/ENTITLEMENT_TESTS.js`, `test/ENTRA_CORE.test.js`, `test/PS_GRAPH_TESTS.js` | Session reset (not PRO-14) |
| **T12** | Browser script selection | Ready (browser DOM) | Click examples in `index.html`; run; verify terminal result and category/buttons. | Browser application bootstrap loads; sample button fills editor and Run dispatches to simulator. | `test/PS_GRAPH_SAMPLES.test.js`, `test/ENTITLEMENT_TESTS.js` | UI delivery for all ready examples |

### Manual execution checklist (intentionally unchecked)

- [ ] **T01** — On-prem AD discovery: executed, recorded result and attached evidence.
- [ ] **T02** — AD LDAP filters / transitive group queries: executed, recorded result and attached evidence.
- [ ] **T03** — AD account mutation and fixture reset: executed, recorded result and attached evidence.
- [ ] **T04** — Entra discovery / OData / paging: executed, recorded result and attached evidence.
- [ ] **T05** — Entra user CRUD and enabled state: executed, recorded result and attached evidence.
- [ ] **T06** — Group CRUD / direct versus nested membership: executed, recorded result and attached evidence.
- [ ] **T07** — Cloud applications and service principals: executed, recorded result and attached evidence.
- [ ] **T08** — Access catalog list/CRUD: executed, recorded result and attached evidence.
- [ ] **T09** — Access package list/CRUD: executed, recorded result and attached evidence.
- [ ] **T10** — Catalog-to-package mapping and integrity: executed, recorded result and attached evidence.
- [ ] **T11** — Negative behavior and reset isolation: executed, recorded result and attached evidence.
- [ ] **T12** — Browser script selection: executed, recorded result and attached evidence.

**Manual test evidence to capture:** commit hash, test ID, test date, tester, starting/reset state, command/script or input payload, expected outcome, actual response, Pass/Fail/Blocked, defect link, and any screenshot or sanitized output reference.

**Execution discipline:** reset before each destructive example; inspect the status and JSON response after each operation; explicitly check that errors do not mutate state. `Reset sandbox` is a **simulator fixture reset**, not an auditable transaction rollback.

## 3. Complete capability-by-capability checklist

Each row is mapped to a capability ID in `docs/CAPABILITIES.md`. **Evidence/next gate** names a runnable test ID when checked, or a specific missing feature when unchecked.

### 4.1 Identity lifecycle management

| Testable | Capability | Status | Evidence or next implementation gate |
|---|---|---|---|
| `[x]` | **IDM-01** — Identity inventory and discovery | **Partial** | **T01 T04** — Inventory AD and Entra fixtures; no SAP or enterprise-wide master inventory. |
| `[ ]` | **IDM-02** — Cross-platform identity correlation | **Not ready** | **Build:** Canonical person ID and AD↔Entra↔SAP matching rules. |
| `[ ]` | **IDM-03** — Identity uniqueness and duplicate detection | **Not ready** | **Build:** Cross-source duplicate and collision detection. |
| `[x]` | **IDM-04** — Joiner management | **Partial** | **T05** — Create a cloud user; no hiring trigger, approvals, onboarding process. |
| `[x]` | **IDM-05** — Mover management | **Partial** | **T05** — Update user attributes; no mover rule or downstream re-provisioning. |
| `[x]` | **IDM-06** — Leaver management | **Partial** | **T03 T05** — Disable/remove accounts; no leaver process, grace period or review. |
| `[ ]` | **IDM-07** — Identity lifecycle classification | **Not ready** | **Build:** Lifecycle-state schema plus transitions and classification rules. |
| `[x]` | **IDM-08** — Account validity and expiration | **Partial** | **T03 T05** — Enabled/disabled state only; no expiry dates/scheduler. |
| `[x]` | **IDM-09** — Service account management | **Partial** | **T07** — Service-principal inventory and basic CRUD; no service-account ownership/rotation. |
| `[x]` | **IDM-10** — Technical identity management | **Partial** | **T07** — App registrations and service principals; no technical-identity governance. |
| `[ ]` | **IDM-11** — External identity management | **Not ready** | **Build:** Guest/external identity representation with B2B lifecycle and governance. |
| `[ ]` | **IDM-12** — Orphan account detection | **Not ready** | **Build:** Person/account correlation and orphan detection. |
| `[ ]` | **IDM-13** — Dormant account detection | **Not ready** | **Build:** Last sign-in/usage data, dormancy thresholds and jobs. |
| `[ ]` | **IDM-14** — Identity ownership and accountability | **Not ready** | **Build:** Business and technical owner records and accountability rules. |
| `[ ]` | **IDM-15** — Identity-to-account reconciliation | **Not ready** | **Build:** Expected accounts per identity and reconciliation job. |
| `[ ]` | **IDM-16** — Account-to-person relationship management | **Not ready** | **Build:** Durable person-to-account links, approvals and ownership. |

### 4.2 Entitlement and permission management

| Testable | Capability | Status | Evidence or next implementation gate |
|---|---|---|---|
| `[x]` | **ENT-01** — Enterprise entitlement inventory | **Partial** | **T02 T06 T07** — AD/Entra groups, roles and members; not enterprise or SAP entitlement inventory. |
| `[x]` | **ENT-02** — Permission extraction | **Partial** | **T02 T06** — Can enumerate group/role memberships; no native application permission extraction. |
| `[ ]` | **ENT-03** — Entitlement normalisation | **Not ready** | **Build:** Canonical entitlement schema and type mappings for every connector. |
| `[ ]` | **ENT-04** — Permission fingerprinting | **Not ready** | **Build:** Stable normalized permission-set fingerprints. |
| `[ ]` | **ENT-05** — Permission similarity analysis | **Not ready** | **Build:** Comparison/similarity algorithm for permissions. |
| `[ ]` | **ENT-06** — Entitlement classification | **Not ready** | **Build:** Entitlement categories and management workflow. |
| `[ ]` | **ENT-07** — Security sensitivity classification | **Not ready** | **Build:** Sensitivity/classification data and policy. |
| `[ ]` | **ENT-08** — Entitlement ownership | **Not ready** | **Build:** Entitlement owner records and approval responsibility. |
| `[ ]` | **ENT-09** — Entitlement usage analysis | **Not ready** | **Build:** Usage/events ingestion and activity metrics. |
| `[ ]` | **ENT-10** — Excessive permission detection | **Not ready** | **Build:** Excess-access rules versus baseline/approved access. |
| `[ ]` | **ENT-11** — Unused entitlement detection | **Not ready** | **Build:** Usage history and unused-access thresholds. |
| `[x]` | **ENT-12** — Nested group and composite role analysis | **Partial** | **T02 T06** — Nested/transitive group expansion only; no SAP composite role analytics. |
| `[x]` | **ENT-13** — Effective access calculation | **Partial** | **T02 T06** — Transitive group reachability only, not resulting effective application permissions. |
| `[ ]` | **ENT-14** — Cross-application entitlement correlation | **Not ready** | **Build:** Canonical entitlement identity across AD, Entra and applications. |
| `[x]` | **ENT-15** — Direct assignment detection | **Partial** | **T02 T06** — Direct vs transitive membership observable; no enterprise direct-assignment detector. |
| `[x]` | **ENT-16** — Inherited permission detection | **Partial** | **T02 T06** — Nested group inheritance observable; no permission inheritance model. |
| `[x]` | **ENT-17** — Entitlement lifecycle management | **Partial** | **T03 T06** — Individual group membership CRUD; no entitlement lifecycle policy. |

### 4.3 Business role and IT role management

| Testable | Capability | Status | Evidence or next implementation gate |
|---|---|---|---|
| `[x]` | **RBM-01** — Business role catalogue | **Ready** | **T08** — Catalog metadata CRUD, list/filter/expand; fictional General is protected. |
| `[x]` | **RBM-02** — IT role catalogue | **Ready** | **T09** — Access-package metadata CRUD and list/filter; no entitlements assigned. |
| `[x]` | **RBM-03** — Business-to-IT role mapping | **Ready** | **T10** — Each package links to one catalog; inspect relationship both directions. |
| `[ ]` | **RBM-04** — Access Package composition | **Not ready** | **Build:** Catalog resources, resource roles/scopes and package role assignments. |
| `[x]` | **RBM-05** — Business role composition | **Partial** | **T10** — One catalog groups packages; no nested business-role compositions. |
| `[ ]` | **RBM-06** — Role mining | **Not ready** | **Build:** Role-mining input matrix and candidate extraction algorithm. |
| `[ ]` | **RBM-07** — Role similarity and clustering | **Not ready** | **Build:** Role similarity metrics and clustering. |
| `[ ]` | **RBM-08** — Role redundancy detection | **Not ready** | **Build:** Overlap/redundancy analysis of role composition. |
| `[ ]` | **RBM-09** — Business role ownership | **Not ready** | **Build:** Catalog ownership assignments and governance rules. |
| `[ ]` | **RBM-10** — IT role ownership | **Not ready** | **Build:** Package ownership assignments and governance rules. |
| `[x]` | **RBM-11** — Role lifecycle management | **Partial** | **T08 T09** — Catalog/package metadata CRUD; no versions, approvals or lifecycle transitions. |
| `[ ]` | **RBM-12** — Role certification | **Not ready** | **Build:** Review/certification workflow for roles. |
| `[ ]` | **RBM-13** — Role sensitivity classification | **Not ready** | **Build:** Role sensitivity metadata and scoring. |
| `[ ]` | **RBM-14** — Role deviation analysis | **Not ready** | **Build:** Baseline role definitions and deviation reports. |
| `[ ]` | **RBM-15** — Role assignment reconciliation | **Not ready** | **Build:** Expected/actual package assignment data and reconciliation. |
| `[ ]` | **RBM-16** — Role composition change detection | **Not ready** | **Build:** Persistent before/after composition history. |

### 4.4 Access request and approval management

| Testable | Capability | Status | Evidence or next implementation gate |
|---|---|---|---|
| `[ ]` | **ARM-01** — Access request registration | **Not ready** | **Build:** Access-package assignment requests and request data model. |
| `[ ]` | **ARM-02** — Access request validation | **Not ready** | **Build:** Eligibility, request validation and policy checks. |
| `[ ]` | **ARM-03** — Manager approval | **Not ready** | **Build:** Manager-approver routing and decisions. |
| `[ ]` | **ARM-04** — Resource owner approval | **Not ready** | **Build:** Resource-owner approval routing. |
| `[ ]` | **ARM-05** — Multi-level approval | **Not ready** | **Build:** Multi-stage approver state machine. |
| `[ ]` | **ARM-06** — Conditional approval rules | **Not ready** | **Build:** Policy-driven conditional approval engine. |
| `[ ]` | **ARM-07** — Temporary access requests | **Not ready** | **Build:** Start/end time and temporary assignment lifecycle. |
| `[ ]` | **ARM-08** — Emergency access requests | **Not ready** | **Build:** Emergency access workflow and auditing. |
| `[ ]` | **ARM-09** — Request tracking | **Not ready** | **Build:** Request status, timeline and query API. |
| `[ ]` | **ARM-10** — Approval escalation | **Not ready** | **Build:** Escalation deadlines and notifications. |
| `[ ]` | **ARM-11** — Request rejection and justification | **Not ready** | **Build:** Reject decision, reason codes and evidence. |
| `[ ]` | **ARM-12** — Request-to-provision reconciliation | **Not ready** | **Build:** Request/decision versus executed grants reconciliation. |

### 4.5 Access certification and compliance

| Testable | Capability | Status | Evidence or next implementation gate |
|---|---|---|---|
| `[ ]` | **ACC-01** — Periodic access certification | **Not ready** | **Build:** Periodic campaign scheduling and access reviews. |
| `[ ]` | **ACC-02** — Manager access reviews | **Not ready** | **Build:** Manager reviewer assignment and review decisions. |
| `[ ]` | **ACC-03** — Application owner reviews | **Not ready** | **Build:** Application owner assignment and review decisions. |
| `[ ]` | **ACC-04** — Business role certification | **Not ready** | **Build:** Catalog/business-role certification. |
| `[ ]` | **ACC-05** — IT role certification | **Not ready** | **Build:** Package/IT-role certification. |
| `[ ]` | **ACC-06** — Privileged access certification | **Not ready** | **Build:** Privileged access inventory and certification. |
| `[ ]` | **ACC-07** — Certification campaign management | **Not ready** | **Build:** Campaign definition, scope and progress states. |
| `[ ]` | **ACC-08** — Certification reminders | **Not ready** | **Build:** Review reminders and delivery records. |
| `[ ]` | **ACC-09** — Certification escalation | **Not ready** | **Build:** Overdue reviews and escalation rules. |
| `[ ]` | **ACC-10** — Revocation of rejected access | **Not ready** | **Build:** Revoke entitlements based on certification decisions. |
| `[ ]` | **ACC-11** — Certification evidence retention | **Not ready** | **Build:** Durable protected review evidence. |
| `[ ]` | **ACC-12** — Certification completion reporting | **Not ready** | **Build:** Review results and completion metrics. |
| `[ ]` | **ACC-13** — Certification exception management | **Not ready** | **Build:** Certification exceptions and expiry. |
| `[ ]` | **ACC-14** — Certification effectiveness monitoring | **Not ready** | **Build:** Effectiveness measures and remediation follow-through. |

### 4.6 Risk management and segregation of duties

| Testable | Capability | Status | Evidence or next implementation gate |
|---|---|---|---|
| `[ ]` | **RSK-01** — Entitlement risk classification | **Not ready** | **Build:** Sensitivity/risk classification for entitlements. |
| `[ ]` | **RSK-02** — Security sensitivity scoring | **Not ready** | **Build:** Scoring weights and calculation. |
| `[ ]` | **RSK-03** — SoD rule catalogue | **Not ready** | **Build:** SoD rule definitions and administration. |
| `[ ]` | **RSK-04** — SoD conflict detection | **Not ready** | **Build:** SoD engine on effective entitlements. |
| `[ ]` | **RSK-05** — Cross-application SoD analysis | **Not ready** | **Build:** Cross-platform normalized permissions and SoD evaluation. |
| `[ ]` | **RSK-06** — Toxic combination detection | **Not ready** | **Build:** Toxic-combination catalog and detection. |
| `[ ]` | **RSK-07** — Risk aggregation per identity | **Not ready** | **Build:** Risk aggregation by identity. |
| `[ ]` | **RSK-08** — Risk aggregation per business role | **Not ready** | **Build:** Risk aggregation by business role. |
| `[ ]` | **RSK-09** — Risk aggregation per IT role | **Not ready** | **Build:** Risk aggregation by IT role. |
| `[ ]` | **RSK-10** — Risk exception management | **Not ready** | **Build:** Risk exceptions, owner approval and expiration. |
| `[ ]` | **RSK-11** — Compensating control management | **Not ready** | **Build:** Compensating controls and attestations. |
| `[ ]` | **RSK-12** — Risk trend analysis | **Not ready** | **Build:** Persistent history and trend reporting. |
| `[ ]` | **RSK-13** — Risk remediation tracking | **Not ready** | **Build:** Risk remediation workflow and tracking. |
| `[ ]` | **RSK-14** — Privileged entitlement detection | **Not ready** | **Build:** Privilege classification of real application permissions. |
| `[ ]` | **RSK-15** — High-risk assignment alerts | **Not ready** | **Build:** Risk rules, alerts and notification delivery. |

### 4.7 Provisioning and reconciliation

| Testable | Capability | Status | Evidence or next implementation gate |
|---|---|---|---|
| `[x]` | **PRO-01** — Account creation | **Partial** | **T05** — Entra user creation in one simulator; no cross-application provisioning engine. |
| `[x]` | **PRO-02** — Account modification | **Partial** | **T03 T05** — AD and Entra attribute updates; no governed change orchestration. |
| `[x]` | **PRO-03** — Account disabling | **Partial** | **T03 T05** — AD/Entra enable/disable; no governed offboarding. |
| `[x]` | **PRO-04** — Group membership management | **Ready** | **T06** — Direct AD/Entra group membership add/remove and nested membership reads. |
| `[ ]` | **PRO-05** — SAP role assignment | **Not ready** | **Build:** SAP connector and supported role-assignment operations. |
| `[x]` | **PRO-06** — Entitlement revocation | **Partial** | **T03 T06** — Remove group membership; no package-assignment or native SAP revocation. |
| `[ ]` | **PRO-07** — Temporary access expiration | **Not ready** | **Build:** Temporary assignment expiration, scheduling and revocation. |
| `[x]` | **PRO-08** — Provisioning validation | **Partial** | **T03 T05 T06** — Read-after-write can be tested manually; no automated independent validator. |
| `[ ]` | **PRO-09** — Desired-versus-actual reconciliation | **Not ready** | **Build:** Desired-state and observed-state reconciliation model. |
| `[ ]` | **PRO-10** — Provisioning failure management | **Not ready** | **Build:** Persistent failure states, queues and retry behavior. |
| `[ ]` | **PRO-11** — Automated remediation | **Not ready** | **Build:** Policy-based remediation executor. |
| `[ ]` | **PRO-12** — Provisioning evidence and audit | **Not ready** | **Build:** Append-only execution evidence and audit store. |
| `[ ]` | **PRO-13** — Assignment drift detection | **Not ready** | **Build:** Baseline assignment snapshots and drift detection. |
| `[ ]` | **PRO-14** — Controlled rollback | **Not ready** | **Build:** Controlled compensating transaction and audited rollback; seed reset is insufficient. |

### 4.8 Governance, audit and reporting

| Testable | Capability | Status | Evidence or next implementation gate |
|---|---|---|---|
| `[ ]` | **GOV-01** — Identity governance policies | **Not ready** | **Build:** Policy objects, versioning and enforcement. |
| `[x]` | **GOV-02** — Business role governance | **Partial** | **T08 T10** — Catalogs represent business-role domains; governance decisions not modeled. |
| `[x]` | **GOV-03** — IT role governance | **Partial** | **T09 T10** — Packages represent IT roles; ownership, approvals and assignments missing. |
| `[ ]` | **GOV-04** — Entitlement governance | **Not ready** | **Build:** Entitlement lifecycle, classification and stewardship. |
| `[ ]` | **GOV-05** — Business and technical ownership | **Not ready** | **Build:** Catalog/package and entitlement ownership workflows. |
| `[ ]` | **GOV-06** — Governance decision history | **Not ready** | **Build:** Durable approvals/decisions and state transitions. |
| `[ ]` | **GOV-07** — Protected audit evidence | **Not ready** | **Build:** Tamper-evident protected audit store. |
| `[ ]` | **GOV-08** — Governance exception register | **Not ready** | **Build:** Exception registry with owners and expirations. |
| `[ ]` | **GOV-09** — Governance KPI monitoring | **Not ready** | **Build:** KPI extraction and reporting layer. |
| `[ ]` | **GOV-10** — Access risk dashboards | **Not ready** | **Build:** Access-risk scoring and dashboard. |
| `[ ]` | **GOV-11** — Compliance reporting | **Not ready** | **Build:** Compliance metrics/report generation. |
| `[ ]` | **GOV-12** — Audit evidence production | **Not ready** | **Build:** Decision/provisioning evidence export. |
| `[ ]` | **GOV-13** — Governance maturity reporting | **Not ready** | **Build:** Governance maturity framework and reporting. |
| `[ ]` | **GOV-14** — Governance policy compliance monitoring | **Not ready** | **Build:** Policy rules, automated compliance tests and reports. |

## 4. Cross-cutting architectural acceptance gates (separate from the 118 capabilities)

| Done? | Gate | Current assessment / acceptance requirement |
|---|---|---|
| `[x]` | Offline PowerShell/LDAP/Graph modules | Separate browser-first AD and Graph backends; runtime simulated; tested by current browser suites. |
| `[x]` | Fixture isolation and reset | Independent instances, read/write behavior and reset covered by tests. |
| `[x]` | Catalog/package metadata and relationships | Catalog/package CRUD, guarded deletes and catalog parent mapping. |
| `[ ]` | Package resource role composition | No catalog resource and access-package role/scope assignments. |
| `[ ]` | Request, assignment and access-grant state machine | No policies, user assignment requests, actual grants or expiry lifecycle. |
| `[ ]` | Entra authentication/authorization | Simulated `Connect-MgGraph`; no OAuth, permissions or token enforcement. |
| `[ ]` | Source connectors outside fictional directory fixtures | No production AD/Entra or SAP connectors. |
| `[ ]` | Canonical person, account and entitlement model | Needed for correlation, role mining and reconciliation. |
| `[ ]` | Governance system of record | No SharePoint/SQL integration, immutable decision/audit history. |
| `[ ]` | Decision-to-provision controls | No approved-request gate, independent validation or auditable rollback. |
| `[ ]` | Security and operational controls | No secret management, delegated service identity, hardening, retry/queue and monitoring. |
| `[ ]` | Graphical browser acceptance | Automated page-script/DOM harness exists; full end-user Chromium/manual acceptance not documented as passed. |
| `[ ]` | Licenses and real-world service constraints | Documented target assumptions require separate tenant-specific verification; simulator does not test licensing. |

## 5. Recommended next test-driven increments

1. **RBM-04 — Access Package composition:** catalog resource registration, role/scope lookup, role assignment CRUD; test package composition without granting actual user access.
2. **ARM-01 / ARM-02 and RBM-15 — Requests and assignments:** basic assignment policies, requests, status lifecycle, assignment inventory; distinguish request from execution.
3. **IDM-02/03 and ENT-03 — Normalized inventory:** canonical identities/accounts/entitlements across AD and Entra, deterministic correlation, duplicate fixtures and negative cases.
4. **ENT-13 and PRO-09/13 — Effective access and reconciliation:** compute desired versus observed membership, detect drift and ensure resets are not treated as rollbacks.
5. **RSK-03/04 and ACC-01/07 — SoD and certification:** conflict rules, reviewer assignment and campaign state, with durable evidence once governance storage exists.

## 6. Acceptance test record template

```markdown
### Test ID: T__ / Capability ID: ______
- [ ] Prepared a fresh fictional tenant / reset baseline
- [ ] Executed documented positive scenario
- [ ] Verified returned properties and resulting state
- [ ] Executed documented negative/permission scenario (where applicable)
- [ ] Verified state did not change after rejected operation
- [ ] Verified isolation and reset behavior
- [ ] Captured sanitized command, output and date
- [ ] Recorded outcome: PASS / FAIL / BLOCKED / NOT RUN
Notes / defect ID: ______
```

## Source references

- [`docs/CAPABILITIES.md`](CAPABILITIES.md) — authoritative capability IDs and architecture target.
- [`docs/ENTITLEMENT_MANAGEMENT.md`](ENTITLEMENT_MANAGEMENT.md) — package/catalog metadata-only scope and safeguards.
- [`docs/PS_GRAPH_COMMANDS.md`](PS_GRAPH_COMMANDS.md) — supported simulated PowerShell Graph cmdlets.
- [`test/ENTITLEMENT_TESTS.js`](../test/ENTITLEMENT_TESTS.js) — catalog/package API and HTML example tests.
- [`index.html`](../index.html) — interactive in-browser editor and example buttons.

---
**Last assessed:** 2026-11-05; test-directory migration: 2026-11-06; baseline commit `a519417`. Reassess statuses and rerun tests after every structural change. Do not equate feature-level simulation with full IGA production readiness.
