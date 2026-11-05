# Lightweight Enterprise Identity Governance and Administration (IGA)
## Capability Model, Technology Mapping and Licensing Strategy

**Version:** 1.0  
**Date:** 5 November 2026  
**Architecture principle:** Maximum governance capability with minimum incremental licensing cost.

---

# 1. Objectives and architectural principles

The objective is to establish an enterprise-wide Identity Governance and Administration (IGA) capability covering:

- Microsoft Active Directory
- Microsoft Entra ID
- SAP ECC and SAP S/4HANA
- Other enterprise applications
- Human, external, service and technical identities

The solution will use existing Microsoft 365 E5 capabilities wherever possible and introduce minimal additional infrastructure or licensing.

### Architectural principles

1. PowerShell is the primary identity intelligence, integration and execution engine.
2. Microsoft Entra Access Catalogs represent business-role domains.
3. Microsoft Entra Access Packages represent assignable IT roles.
4. SharePoint provides the initial governance repository.
5. Power BI provides governance analytics and reporting.
6. Power Automate provides human-oriented workflows where useful.
7. All application integrations use independent, reusable connectors.
8. Governance decisions are separated from technical provisioning.
9. Actual permissions must be reconciled against approved access.
10. The solution must not depend on premium Power Platform connectors.

# 2. Target architecture

```text
                    GOVERNANCE CONSUMERS
                  Managers / Owners / Auditors
                            |
             +--------------+--------------+
             |                             |
         Power BI                    Power Automate
      Analytics & Risk             Approvals & Reviews
             |                             |
             +--------------+--------------+
                            |
                 GOVERNANCE REPOSITORY
                 SharePoint Lists
                 (SQL Server optional)
                            |
                   POWERSHELL IGA ENGINE
             +--------------+--------------+
             |              |              |
         Extraction    Intelligence    Execution
             |              |              |
         Normalisation  Fingerprinting  Provisioning
         Correlation    Role Mining     Revocation
         Reconciliation SoD Analysis    Validation
             |              |              |
             +--------------+--------------+
                            |
                    CONNECTOR FRAMEWORK
             +--------------+--------------+
             |              |              |
             AD           Entra ID         SAP
             |              |              |
          LDAP/AD        Graph API      RFC/OData
             |
       Other applications
       REST / SOAP / SQL
```

## 2.1 Component responsibilities

| Component | Primary responsibility |
|---|---|
| PowerShell 7 | Identity extraction, normalisation, correlation, analytics, risk calculation, provisioning and reconciliation |
| Microsoft Graph SDK | Entra ID and Entitlement Management integration |
| ActiveDirectory module | On-premises AD integration |
| SAP interfaces | SAP identity and authorisation integration |
| SharePoint Lists | Governance catalogue, ownership, decisions, exceptions and campaign records |
| Excel | Data preparation, bulk administration and exports |
| Power BI Pro | Dashboards, risk analytics, role mining and compliance reporting |
| Power Automate | Approvals, notifications, escalations and human review processes |
| Windows Task Scheduler | Scheduled execution of PowerShell jobs |
| SQL Server (optional) | More scalable relational governance repository |

# 3. Role and entitlement model

A central design decision is to use Microsoft Entra Entitlement Management as the principal role-management structure.

| IGA concept | Representation | Purpose |
|---|---|---|
| Business role | Access Catalog | Represents a business function or responsibility |
| IT role | Access Package | Represents a technical collection of access rights |
| Entitlement | Resource role | Actual assignable access right |
| Permission | Native application permission | Underlying technical authorisation |
| Assignment | Access Package assignment | Associates an identity with an IT role |
| Business ownership | Catalog owner | Business accountability |
| Technical ownership | Access Package owner | Technical accountability |

**Important modelling distinction:** In native Entra terminology, an Access Catalog is a container for resources and Access Packages, not an independently assignable role. Our architecture deliberately uses the catalog as the representation of a business-role domain.

The relationship is not necessarily one-to-one:

```text
Business Role: Finance
       |
       +--- Access Catalog: Finance
                  |
                  +--- Access Package: SAP Accountant
                  |        +--- SAP technical roles
                  |
                  +--- Access Package: Finance Analyst
                  |        +--- Entra security groups
                  |
                  +--- Access Package: Payment Approver
                           +--- SAP authorisations
```

One business role can encompass several IT roles. An IT role can also support multiple business-role contexts.

Direct, exceptional and technical access must also be represented, even when it is not part of a business-role assignment.

# 4. Complete IGA capability catalogue

The following catalogue defines the required capabilities and their preferred implementation technologies.

Technology abbreviations:

- **PS:** PowerShell 7
- **Graph:** Microsoft Graph API / SDK
- **AD:** ActiveDirectory PowerShell module
- **SAP:** SAP-supported RFC, BAPI, OData or other APIs
- **SP:** SharePoint Lists
- **PA:** Power Automate
- **PBI:** Power BI
- **XL:** Excel

## 4.1 Identity lifecycle management

| ID | Capability | Best-fit implementation |
|---|---|---|
| IDM-01 | Identity inventory and discovery | PS + AD + Graph |
| IDM-02 | Cross-platform identity correlation | PS |
| IDM-03 | Identity uniqueness and duplicate detection | PS |
| IDM-04 | Joiner management | PS + SP |
| IDM-05 | Mover management | PS + SP |
| IDM-06 | Leaver management | PS |
| IDM-07 | Identity lifecycle classification | PS + SP |
| IDM-08 | Account validity and expiration | PS |
| IDM-09 | Service account management | PS + SP |
| IDM-10 | Technical identity management | PS + SP |
| IDM-11 | External identity management | Graph + PS |
| IDM-12 | Orphan account detection | PS + PBI |
| IDM-13 | Dormant account detection | PS + PBI |
| IDM-14 | Identity ownership and accountability | SP |
| IDM-15 | Identity-to-account reconciliation | PS |
| IDM-16 | Account-to-person relationship management | PS + SP |

The lifecycle status of an identity must be kept separate from the enabled/disabled status of an account. An account can be disabled without the underlying object being obsolete.

## 4.2 Entitlement and permission management

| ID | Capability | Best-fit implementation |
|---|---|---|
| ENT-01 | Enterprise entitlement inventory | PS connectors |
| ENT-02 | Permission extraction | PS connectors |
| ENT-03 | Entitlement normalisation | PS |
| ENT-04 | Permission fingerprinting | PS |
| ENT-05 | Permission similarity analysis | PS |
| ENT-06 | Entitlement classification | SP |
| ENT-07 | Security sensitivity classification | SP + PS |
| ENT-08 | Entitlement ownership | SP |
| ENT-09 | Entitlement usage analysis | PS + PBI |
| ENT-10 | Excessive permission detection | PS |
| ENT-11 | Unused entitlement detection | PS |
| ENT-12 | Nested group and composite role analysis | PS |
| ENT-13 | Effective access calculation | PS |
| ENT-14 | Cross-application entitlement correlation | PS |
| ENT-15 | Direct assignment detection | PS |
| ENT-16 | Inherited permission detection | PS |
| ENT-17 | Entitlement lifecycle management | PS + SP |

Effective access analysis must account for nested groups, composite roles, direct assignments, inherited access and application-specific permission semantics.

## 4.3 Business role and IT role management

| ID | Capability | Best-fit implementation |
|---|---|---|
| RBM-01 | Business role catalogue | Entra Access Catalogs |
| RBM-02 | IT role catalogue | Entra Access Packages |
| RBM-03 | Business-to-IT role mapping | Graph + PS |
| RBM-04 | Access Package composition | Graph + PS |
| RBM-05 | Business role composition | Graph + PS |
| RBM-06 | Role mining | PS |
| RBM-07 | Role similarity and clustering | PS |
| RBM-08 | Role redundancy detection | PS |
| RBM-09 | Business role ownership | Entra Catalog ownership |
| RBM-10 | IT role ownership | Entra Access Package ownership |
| RBM-11 | Role lifecycle management | Graph + PS |
| RBM-12 | Role certification | PA + SP |
| RBM-13 | Role sensitivity classification | SP |
| RBM-14 | Role deviation analysis | PS + PBI |
| RBM-15 | Role assignment reconciliation | PS + Graph |
| RBM-16 | Role composition change detection | PS + PBI |

Business role mining should identify meaningful business groupings from actual entitlement assignments rather than simply reproduce existing technical group structures.

## 4.4 Access request and approval management

| ID | Capability | Best-fit implementation |
|---|---|---|
| ARM-01 | Access request registration | Entra Access Packages |
| ARM-02 | Access request validation | PS |
| ARM-03 | Manager approval | Entra / PA |
| ARM-04 | Resource owner approval | Entra / PA |
| ARM-05 | Multi-level approval | Entra / PA |
| ARM-06 | Conditional approval rules | PS |
| ARM-07 | Temporary access requests | Entra + SP |
| ARM-08 | Emergency access requests | PS + PA |
| ARM-09 | Request tracking | Entra + SP + PBI |
| ARM-10 | Approval escalation | PA |
| ARM-11 | Request rejection and justification | Entra + SP |
| ARM-12 | Request-to-provision reconciliation | PS |

Where native Entra Access Package functionality is covered by the available E5/P2 entitlement, it should be preferred over recreating the same functionality.

## 4.5 Access certification and compliance

| ID | Capability | Best-fit implementation |
|---|---|---|
| ACC-01 | Periodic access certification | PS + PA |
| ACC-02 | Manager access reviews | Entra P2 / PA |
| ACC-03 | Application owner reviews | PA |
| ACC-04 | Business role certification | PA + SP |
| ACC-05 | IT role certification | PA + SP |
| ACC-06 | Privileged access certification | Entra PIM + PA |
| ACC-07 | Certification campaign management | PS + SP |
| ACC-08 | Certification reminders | PA |
| ACC-09 | Certification escalation | PA |
| ACC-10 | Revocation of rejected access | PS |
| ACC-11 | Certification evidence retention | SP |
| ACC-12 | Certification completion reporting | PBI |
| ACC-13 | Certification exception management | SP + PA |
| ACC-14 | Certification effectiveness monitoring | PS + PBI |

The custom certification engine should support application-specific reviews, including SAP authorisations that are not represented as native Entra resources.

## 4.6 Risk management and segregation of duties

| ID | Capability | Best-fit implementation |
|---|---|---|
| RSK-01 | Entitlement risk classification | SP |
| RSK-02 | Security sensitivity scoring | PS |
| RSK-03 | SoD rule catalogue | SP |
| RSK-04 | SoD conflict detection | PS |
| RSK-05 | Cross-application SoD analysis | PS |
| RSK-06 | Toxic combination detection | PS |
| RSK-07 | Risk aggregation per identity | PS |
| RSK-08 | Risk aggregation per business role | PS |
| RSK-09 | Risk aggregation per IT role | PS |
| RSK-10 | Risk exception management | SP + PA |
| RSK-11 | Compensating control management | SP |
| RSK-12 | Risk trend analysis | PBI |
| RSK-13 | Risk remediation tracking | PA + SP |
| RSK-14 | Privileged entitlement detection | PS |
| RSK-15 | High-risk assignment alerts | PS + PA |

Risk analysis must work at multiple levels:

- Individual permission.
- Technical entitlement.
- IT role.
- Business role.
- Individual identity.
- Cross-application identity footprint.

Two permissions that are individually acceptable may create an unacceptable risk when combined.

## 4.7 Provisioning and reconciliation

| ID | Capability | Best-fit implementation |
|---|---|---|
| PRO-01 | Account creation | PS connectors |
| PRO-02 | Account modification | PS connectors |
| PRO-03 | Account disabling | PS connectors |
| PRO-04 | Group membership management | PS + Graph |
| PRO-05 | SAP role assignment | SAP connector |
| PRO-06 | Entitlement revocation | PS connectors |
| PRO-07 | Temporary access expiration | PS |
| PRO-08 | Provisioning validation | PS |
| PRO-09 | Desired-versus-actual reconciliation | PS |
| PRO-10 | Provisioning failure management | PS |
| PRO-11 | Automated remediation | PS |
| PRO-12 | Provisioning evidence and audit | PS + SP |
| PRO-13 | Assignment drift detection | PS |
| PRO-14 | Controlled rollback | PS |

All provisioning must be based on an approved governance decision.

PowerShell should execute the technical action, verify the result and record the outcome. Power Automate should not execute unrestricted provisioning commands.

## 4.8 Governance, audit and reporting

| ID | Capability | Best-fit implementation |
|---|---|---|
| GOV-01 | Identity governance policies | SP |
| GOV-02 | Business role governance | Entra + SP |
| GOV-03 | IT role governance | Entra + SP |
| GOV-04 | Entitlement governance | SP |
| GOV-05 | Business and technical ownership | SP |
| GOV-06 | Governance decision history | SP / SQL |
| GOV-07 | Protected audit evidence | Protected storage / audit platform |
| GOV-08 | Governance exception register | SP |
| GOV-09 | Governance KPI monitoring | PBI |
| GOV-10 | Access risk dashboards | PBI |
| GOV-11 | Compliance reporting | PBI |
| GOV-12 | Audit evidence production | PS + PBI |
| GOV-13 | Governance maturity reporting | PBI |
| GOV-14 | Governance policy compliance monitoring | PS + PBI |

# 5. Application connector framework

All applications must be integrated through reusable, application-specific PowerShell adapters.

Each adapter should expose a common logical interface.

```powershell
Get-Identities
Get-Accounts
Get-Entitlements
Get-Assignments
Get-Roles
Get-Permissions
Get-AccountStatus

Request-Access
Assign-Entitlement
Revoke-Entitlement
Validate-Assignment
```

Not every application supports every operation. Each connector must explicitly declare its supported operations.

## 5.1 Connector implementation

| Application | Extraction technology | Provisioning technology |
|---|---|---|
| Active Directory | AD module / LDAP | PowerShell |
| Microsoft Entra ID | Microsoft Graph | Microsoft Graph |
| SAP ECC | RFC / BAPI / approved APIs | SAP-supported interfaces |
| SAP S/4HANA | RFC / OData / approved APIs | SAP-supported interfaces |
| Other enterprise applications | REST / SOAP / SQL | Application-specific APIs |

### SAP-specific extraction

For SAP ABAP systems, relevant technical data sources include:

| SAP table | Governance information |
|---|---|
| USR02 | User accounts and logon status |
| USR04 | User profiles |
| AGR_USERS | User-to-role assignments |
| AGR_DEFINE | Role definitions |
| AGR_AGRS | Composite role relationships |
| AGR_1251 | Authorisation objects and values |
| AGR_1252 | Organisational authorisation values |
| AGR_TCODES | Transaction assignments |

Extraction must consider direct assignments, profiles, composite roles and generated authorisations.

Direct database writes to SAP authorisation tables are not an acceptable provisioning approach. Use supported SAP application interfaces.

## 5.2 Connector design principles

Each connector should provide:

- Read-only extraction capability.
- Normalised identity and entitlement structures.
- Delta extraction where possible.
- Full reconciliation capability.
- Explicit capability declaration.
- Secure authentication.
- Error handling and retries.
- Provisioning validation.
- Before/after evidence.
- Version-controlled source code.

PowerShell modules should be developed and maintained independently of the governance engine.

# 6. Governance data model

The initial governance repository should contain the following logical entities.

| Entity | Purpose |
|---|---|
| Identity | Enterprise identity record |
| Application | Governed application |
| Account | Application-specific account |
| BusinessRoleCatalog | Business role representation |
| AccessPackage | Assignable IT role |
| Entitlement | Application-level access right |
| Permission | Underlying technical permission |
| Assignment | Identity-to-entitlement relationship |
| RoleComposition | Relationship between business and IT roles |
| Ownership | Business and technical accountability |
| RiskClassification | Sensitivity and criticality |
| SoDRule | Conflicting permissions |
| Certification | Review campaign and decisions |
| GovernanceDecision | Approved or rejected decision |
| Exception | Risk exception and compensating control |
| ProvisioningLog | Technical execution history |
| ReconciliationResult | Desired-versus-actual comparison |

Three data categories must remain distinguishable:

1. **Source data:** What actually exists in the applications.
2. **Governance data:** What should exist, including approved business roles and IT roles.
3. **Decision data:** What has been approved, rejected, excepted or revoked.

This separation is essential for reconciliation and auditability.

# 7. Technology and licensing strategy

## 7.1 Microsoft 365 E5 baseline

Assumption: The company has Microsoft 365 E5 licences assigned to the relevant users.

| Component | Existing entitlement | Additional licensing |
|---|---|---|
| PowerShell 7 | Free | None |
| ActiveDirectory module | Existing Windows Server / RSAT | None if infrastructure exists |
| Microsoft Graph SDK | Free SDK | None for standard API access |
| Microsoft Entra ID P2 | Included in M365 E5 | None |
| SharePoint Online | Included | None |
| Excel | Included | None |
| Power BI Pro | Included in M365 E5 | None for licensed users |
| Power Automate | Seeded Microsoft 365 rights | None for standard connectors within permitted use |
| Windows Task Scheduler | Existing Windows infrastructure | None if available |
| SQL Server | Depends on existing infrastructure | Potentially additional |
| Azure Automation | Separate Azure service | Consumption-based |
| Azure Functions | Separate Azure service | Consumption-based |
| Dataverse | Not assumed included for this architecture | Potentially additional |
| Power Platform custom connectors | Not included in seeded Microsoft 365 rights | Premium licensing required |
| Azure API Management | Separate Azure service | Additional cost |

Microsoft 365 E5 includes Entra ID P2 and Power BI Pro. Power Automate seeded rights include standard connectors and limited cloud-flow execution, but not general custom connectors, premium connectors or on-premises gateway use.

## 7.2 Entra ID Governance licensing boundary

An important distinction is that Microsoft 365 E5 includes Entra ID P2, not the full Entra ID Governance add-on.

The existing P2 entitlement supports a number of generally available Entitlement Management, Access Review and PIM capabilities.

However, newer governance capabilities, including certain catalog review features, advanced extensions and lifecycle workflow functionality, require Entra ID Governance or another qualifying subscription.

The architecture should therefore:

1. Use existing native Entra P2 capabilities where available.
2. Implement additional certification and governance processes with PowerShell and SharePoint.
3. Avoid purchasing Entra ID Governance unless a specific native capability provides sufficient business value.
4. Validate licensing requirements for all identities covered by native Entitlement Management and Access Reviews.

Official reference:

https://learn.microsoft.com/en-us/entra/id-governance/licensing-fundamentals

## 7.3 Power Automate licensing restrictions

Power Automate should primarily use standard connectors such as SharePoint and Outlook.

The Microsoft 365 seeded entitlement currently has a daily action allowance of 6,000 actions per user context.

The following are not assumed available without additional licensing:

- Premium connectors.
- General custom connectors.
- Unrestricted on-premises gateway scenarios.
- Unattended robotic process automation.

Consequently, SAP and other application integrations should not depend on Power Automate custom connectors.

PowerShell should communicate directly with application interfaces.

Official reference:

https://learn.microsoft.com/en-us/power-platform/admin/power-automate-licensing/faqs

## 7.4 Cost-minimisation decisions

| Decision | Rationale |
|---|---|
| PowerShell instead of custom connectors | Avoid premium connector licensing |
| SharePoint instead of Dataverse | Use existing E5 entitlement |
| Windows Task Scheduler instead of Azure Automation | Avoid additional cloud execution cost |
| Existing SQL Server where available | Avoid new database infrastructure |
| Power BI Pro | Already included in E5 |
| Native Entra P2 features | Reuse existing identity licensing |
| Custom PowerShell certification engine | Avoid additional Entra Governance licensing where appropriate |
| Standard Power Automate connectors | Avoid Power Automate Premium |

The objective is to keep incremental Microsoft licensing cost close to zero, assuming existing infrastructure and appropriate application integration rights.

# 8. Security, audit and operational controls

The solution must be designed with enterprise-grade controls.

| Control | Implementation |
|---|---|
| Least privilege | Dedicated execution identities |
| Authentication | Certificates, managed identities or gMSA where appropriate |
| Secrets management | Approved enterprise vault |
| Separation of duties | Separate approval and execution responsibilities |
| Execution authorisation | Only validated governance decisions can trigger changes |
| Audit logging | Append-only decision and execution records |
| Reconciliation | Scheduled desired-versus-actual comparisons |
| Error handling | Retries, exception queues and alerts |
| Change management | Version-controlled PowerShell modules |
| Testing | Development, test and production environments |
| Monitoring | Execution logs and Power BI dashboards |
| Data protection | Appropriate access controls and retention policies |

A SharePoint list alone should not be considered an immutable audit repository. Audit evidence must be protected against unauthorised modification and deletion.

# 9. Implementation roadmap

## Phase 1 – Identity and entitlement intelligence

**Priority: Highest**

- Build AD extraction.
- Build Entra ID extraction.
- Establish SAP extraction.
- Normalise identity and entitlement data.
- Establish identity correlation.
- Build the governance repository.
- Implement permission fingerprinting.
- Establish initial Power BI dashboards.

Deliverable: Enterprise identity and entitlement inventory.

## Phase 2 – Role mining and risk analysis

- Establish business-role Access Catalogs.
- Establish IT-role Access Packages.
- Map technical entitlements to Access Packages.
- Map Access Packages to business-role catalogs.
- Implement role similarity and clustering.
- Introduce security sensitivity classifications.
- Implement SoD rules.
- Identify orphaned and excessive access.

Deliverable: Enterprise entitlement intelligence and role governance.

## Phase 3 – Governance and certification

- Define business and technical ownership.
- Establish certification campaigns.
- Implement manager and resource-owner reviews.
- Introduce exception management.
- Implement approval workflows.
- Establish evidence retention.

Deliverable: Operational identity governance.

## Phase 4 – Provisioning and reconciliation

- Implement controlled provisioning.
- Implement access revocation.
- Automate temporary access expiration.
- Implement desired-versus-actual reconciliation.
- Introduce remediation workflows.
- Establish operational monitoring.

Deliverable: Closed-loop identity governance.

# 10. Recommended initial technology stack

| Technology | Architectural decision |
|---|---|
| PowerShell 7 | Core IGA engine |
| Microsoft Graph | Entra ID integration |
| ActiveDirectory module | AD integration |
| SAP RFC / BAPI / OData | SAP integration |
| SharePoint Lists | Initial governance repository |
| SQL Server | Optional scalable repository |
| Power BI Pro | Governance analytics |
| Power Automate | Optional human workflows |
| Excel | Data preparation and administration |
| Windows Task Scheduler | Scheduled execution |
| Azure Functions / Automation | Optional future infrastructure |

# 11. Architecture acceptance criteria

The solution should be considered successful when:

1. All relevant identities and accounts can be inventoried across AD, Entra ID and SAP.
2. Identities can be correlated across applications.
3. Effective permissions can be calculated and fingerprinted.
4. Business roles are represented by Access Catalogs.
5. IT roles are represented by Access Packages.
6. Technical entitlements can be mapped to business and IT roles.
7. Role proximity and security sensitivity can be analysed independently.
8. SoD conflicts can be detected across applications.
9. Access can be certified by the appropriate owners.
10. Governance decisions can be translated into controlled provisioning actions.
11. Actual access can be reconciled against approved access.
12. Audit evidence can be produced for all relevant governance decisions.
13. The solution operates without requiring Power Platform Premium connectors.
14. Additional licensing is introduced only where a demonstrable business requirement justifies it.

# 12. Official Microsoft references

- [Microsoft Entra licensing](https://learn.microsoft.com/en-us/entra/fundamentals/licensing)
- [Microsoft Entra ID Governance licensing fundamentals](https://learn.microsoft.com/en-us/entra/id-governance/licensing-fundamentals)
- [What is Entitlement Management?](https://learn.microsoft.com/en-us/entra/id-governance/entitlement-management-overview)
- [Create an Access Package](https://learn.microsoft.com/en-us/entra/id-governance/entitlement-management-access-package-create)
- [Microsoft Graph Entitlement Management API](https://learn.microsoft.com/en-us/graph/api/resources/entitlementmanagement?view=graph-rest-1.0)
- [Power Automate licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/power-automate-licensing/faqs)
- [Power BI licensing](https://learn.microsoft.com/en-us/power-bi/enterprise/service-admin-purchasing-power-bi-pro)

---

**Final architectural position**

This solution should be developed as a lightweight, application-independent IGA platform, with PowerShell as its intelligence and execution engine, Microsoft Entra Access Catalogs and Access Packages as its role-management constructs, SharePoint as its initial governance repository, and Power BI as its analytical layer.

Power Automate complements the architecture through human-oriented workflows but is not a dependency for core IGA functionality.

The resulting platform should maximise the value of the existing Microsoft 365 E5 investment while retaining the flexibility to integrate additional applications and, if necessary, coexist with a commercial IGA platform.