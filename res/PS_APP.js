/* IGAsim browser application bootstrap: classic script, no server or Node.js. */
(function(){
 'use strict';
 const registry=new PowerShellTerminal.EngineRegistry();
 registry.register('powershelljs-0.2',()=>new PowerShellJS.PowerShellSimulator());
 const terminal=new TERMINAL({container:'terminal',storageKey:'PowerShellJS_v02_history',welcome:'PowerShellJS — fictional AD + Entra ID sandbox.\nTry Get-ADUser -Filter * or Connect-MgGraph followed by Get-MgUser -All.\n',prompt:'PS C:\\Users\\Demo',separator:'&gt; ',preserveWhitespace:true});
 const status=document.getElementById('status'),editor=document.getElementById('script'),entryCount=document.getElementById('entry-count');
 const adapter=new PowerShellTerminal.TerminalEngineAdapter(terminal,registry.create('powershelljs-0.2'),{onStatus:value=>{status.textContent=value;}});
 const samples={
  adUsers:'# PowerShell AD cmdlet filter + object pipeline\nGet-ADUser -Filter { Enabled -eq $true } -Properties Department,Mail |\n  Where-Object { $_.Department -eq "Finance" } |\n  Select-Object Name,SamAccountName,Department,Mail',
  ldap:'# RFC 4515-style LDAP assertions interpreted in memory\nSearch-LDAP -BaseDN "OU=Users,DC=corp,DC=example,DC=com" -Scope Subtree -Filter "(&(objectCategory=person)(department=IT)(mail=*))" -Attributes cn,mail,department\nGet-LDAPQueryLog | Select-Object Filter,ResultCount',
  groups:'# Group nesting and AD transitive membership\nGet-ADGroup -Filter "Name -like \'BR_*\'" | Select-Object Name\nGet-ADGroupMember -Identity APP_Reporting -Recursive | Select-Object Name,SamAccountName\nGet-ADPrincipalGroupMembership -Identity mia.jansen | Select-Object Name',
  modify:'# Modify the fictional directory (reset restores original data)\nSet-ADUser -Identity leo.chen -Department Operations\nAdd-ADGroupMember -Identity BR_Operations -Members leo.chen\nGet-ADUser -Identity leo.chen -Properties Department\nGet-ADGroupMember -Identity BR_Operations',
  logic:'# Capture command objects; control flow and functions\n$users = Get-ADUser -Filter "Department -eq \'IT\'" -Properties Department\nfunction ShowUser($u) { Write-Output $u.SamAccountName }\nforeach ($u in $users) {\n  if ($u.Enabled -eq $true) { ShowUser $u }\n}',
  files:'# Original virtual Windows file system still works\nGet-Location\nGet-ChildItem C:\\Temp\nSet-Content C:\\Temp\\hello.txt -Value "Saved in memory"\nGet-Content C:\\Temp\\hello.txt',
  graph:'# Connect to a simulated Entra tenant (no real Microsoft login)\nConnect-MgGraph -Scopes "User.Read.All,Group.Read.All"\nGet-MgUser -Filter "department eq \'IT\'" -Property "id,displayName,department"\nGet-MgGroup -All'
 };
 Object.assign(samples, {
  graphTenant: [
    "# Simulated Microsoft Entra tenant and session",
    "Connect-MgGraph -Scopes \"User.Read.All,Group.Read.All\"",
    "Get-MgContext",
    "Get-MgOrganization",
    "Get-MgUser -All | Select-Object displayName,userPrincipalName",
    "Get-MgGroup -All | Select-Object displayName,description"
  ].join("\n"),
  graphITUsers: [
    "# OData filtering is different from AD LDAP filtering",
    "Connect-MgGraph -Scopes \"User.Read.All\"",
    "Get-MgUser -Filter \"department eq 'IT'\" -Property \"id,displayName,department,accountEnabled\" |",
    "  Select-Object displayName,department,accountEnabled",
    "Get-MgUser -Filter \"accountEnabled eq false\" -Property \"displayName,userPrincipalName,accountEnabled\""
  ].join("\n"),
  graphPaging: [
    "# -Top limits a page; -All follows @odata.nextLink",
    "Connect-MgGraph -Scopes \"User.Read.All\"",
    "Get-MgUser -Top 1 -CountVariable userCount",
    "$userCount",
    "Get-MgUser -All -Top 1 -Property \"id,displayName,department\" |",
    "  Select-Object displayName,department"
  ].join("\n"),
  graphMembership: [
    "# Compare direct with transitive membership in a nested group",
    "Connect-MgGraph -Scopes \"Group.Read.All\"",
    "Get-MgGroup -All | Select-Object displayName,id",
    "Get-MgGroupMember -GroupId f0000000-0000-4000-8000-000000000202 |",
    "  Select-Object displayName,id",
    "Get-MgGroupTransitiveMember -GroupId f0000000-0000-4000-8000-000000000202 |",
    "  Select-Object displayName,id"
  ].join("\n"),
  graphRoles: [
    "# Inspect fictional directory role assignments",
    "Connect-MgGraph -Scopes \"RoleManagement.Read.Directory\"",
    "Get-MgDirectoryRole -All | Select-Object displayName,id",
    "Get-MgDirectoryRoleMember -DirectoryRoleId f0000000-0000-4000-8000-000000000601 |",
    "  Select-Object displayName,userPrincipalName"
  ].join("\n"),
  graphApplications: [
    "# Inventory the tenant's applications, service principals and devices",
    "Connect-MgGraph -Scopes \"Application.Read.All,Device.Read.All\"",
    "Get-MgApplication -All | Select-Object displayName,appId",
    "Get-MgServicePrincipal -All | Select-Object displayName,appId,accountEnabled",
    "Get-MgDevice -All | Select-Object displayName,operatingSystem,accountEnabled"
  ].join("\n"),
  graphRequest: [
    "# REST-style Graph responses (including @odata.nextLink)",
    "Connect-MgGraph -Scopes \"User.Read.All,Group.Read.All\"",
    "Invoke-MgGraphRequest -Method GET -Uri '/v1.0/users?$top=1'",
    "Invoke-MgGraphRequest -Method GET -Uri '/v1.0/groups?$select=id,displayName'"
  ].join("\n"),
  graphHybrid: [
    "# Separate fictional directories: no synchronization is implied",
    "Get-ADUser -Filter * | Select-Object Name,SamAccountName,Department",
    "Connect-MgGraph -Scopes \"User.Read.All\"",
    "Get-MgUser -All | Select-Object displayName,userPrincipalName,department"
  ].join("\n"),
  graphEnable: [
    "# Changes are only in memory: Reset sandbox restores the original state",
    "Connect-MgGraph -Scopes \"User.ReadWrite.All\"",
    "Get-MgUser -UserId chloe.rivera@northwind.example -Property \"displayName,accountEnabled\"",
    "Update-MgUser -UserId chloe.rivera@northwind.example -AccountEnabled $true -PassThru",
    "Get-MgUser -UserId chloe.rivera@northwind.example -Property \"displayName,accountEnabled\""
  ].join("\n"),
  graphNewUser: [
    "# Create a fictional user; password is not persisted by the simulator",
    "Connect-MgGraph -Scopes \"User.ReadWrite.All\"",
    "New-MgUser -DisplayName \"Dana Owens\" -UserPrincipalName dana@northwind.example -MailNickname dana -AccountEnabled $true -PasswordProfile '{\"password\":\"SIMULATED-PASSWORD\"}'",
    "Get-MgUser -UserId dana@northwind.example -Property \"id,displayName,userPrincipalName,accountEnabled\""
  ].join("\n"),
  graphNewGroup: [
    "# Create a cloud security group and inspect it",
    "Connect-MgGraph -Scopes \"Group.ReadWrite.All\"",
    "New-MgGroup -DisplayName \"Project Sunset\" -MailNickname project-sunset -MailEnabled $false -SecurityEnabled $true -GroupTypes \"\"",
    "Get-MgGroup -Filter \"displayName eq 'Project Sunset'\""
  ].join("\n"),
  graphMembershipEdit: [
    "# Add a new direct group member, inspect, then undo",
    "Connect-MgGraph -Scopes \"GroupMember.ReadWrite.All\"",
    "New-MgGroupMemberByRef -GroupId f0000000-0000-4000-8000-000000000201 -DirectoryObjectId f0000000-0000-4000-8000-000000000102",
    "Get-MgGroupMember -GroupId f0000000-0000-4000-8000-000000000201 | Select-Object displayName,id",
    "Remove-MgGroupMemberByRef -GroupId f0000000-0000-4000-8000-000000000201 -DirectoryObjectId f0000000-0000-4000-8000-000000000102",
    "Get-MgGroupMember -GroupId f0000000-0000-4000-8000-000000000201 | Select-Object displayName,id"
  ].join("\n"),
  graphPatch: [
    "# Update an attribute using Graph's REST-style endpoint",
    "Connect-MgGraph -Scopes \"User.ReadWrite.All\"",
    "Invoke-MgGraphRequest -Method PATCH -Uri '/v1.0/users/f0000000-0000-4000-8000-000000000101' -Body '{\"jobTitle\":\"Platform Lead\"}'",
    "Get-MgUser -UserId ada.martin@northwind.example -Property \"displayName,jobTitle\""
  ].join("\n"),
  graphAppRegistration: [
    "# Create a simulated app registration and linked service principal",
    "Connect-MgGraph -Scopes \"Application.ReadWrite.All\"",
    "New-MgApplication -DisplayName \"Inventory Demo API\" -SignInAudience AzureADMyOrg",
    "Get-MgApplication -Filter \"displayName eq 'Inventory Demo API'\"",
    "Get-MgServicePrincipal -All | Select-Object displayName,appId"
  ].join("\n")
 });
 Object.assign(samples, {
  govCatalogRead: [
    "# List catalogs and inspect a specific catalog",
    "Connect-MgGraph -Scopes \"EntitlementManagement.Read.All\"",
    "Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/catalogs?$select=id,displayName,state,catalogType'",
    "Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/catalogs/f0000000-0000-4000-8000-000000001002?$expand=accessPackages'",
  ].join("\n"),
  govPackageRead: [
    "# Find the access packages in a catalog and expand their parent catalogs",
    "Connect-MgGraph -Scopes \"EntitlementManagement.Read.All\"",
    "Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages?%24filter=catalogId%20eq%20%27f0000000-0000-4000-8000-000000001002%27'",
    "Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages/f0000000-0000-4000-8000-000000001101?$expand=catalog'",
  ].join("\n"),
  govCatalogCreate: [
    "# POST a fictional user-managed catalog; save the new ID",
    "Connect-MgGraph -Scopes \"EntitlementManagement.ReadWrite.All\"",
    "$catalog = Invoke-MgGraphRequest -Method POST -Uri '/v1.0/identityGovernance/entitlementManagement/catalogs' -Body '{\"displayName\":\"HR Lifecycle\",\"description\":\"Fictional HR entitlements\",\"state\":\"published\",\"isExternallyVisible\":false}'",
    "$catalog",
    "Invoke-MgGraphRequest -Method GET -Uri \"/v1.0/identityGovernance/entitlementManagement/catalogs/$catalog.id\"",
  ].join("\n"),
  govCatalogUpdate: [
    "# PATCH the fictional Engineering catalog (Reset sandbox restores it)",
    "Connect-MgGraph -Scopes \"EntitlementManagement.ReadWrite.All\"",
    "Invoke-MgGraphRequest -Method PATCH -Uri '/v1.0/identityGovernance/entitlementManagement/catalogs/f0000000-0000-4000-8000-000000001002' -Body '{\"description\":\"Engineering access curated by IGA\",\"isExternallyVisible\":true}'",
    "Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/catalogs/f0000000-0000-4000-8000-000000001002'",
  ].join("\n"),
  govCatalogDelete: [
    "# Create a temporary catalog, then DELETE the returned ID",
    "Connect-MgGraph -Scopes \"EntitlementManagement.ReadWrite.All\"",
    "$catalog = Invoke-MgGraphRequest -Method POST -Uri '/v1.0/identityGovernance/entitlementManagement/catalogs' -Body '{\"displayName\":\"Temporary Catalog\",\"description\":\"Delete-me demo\"}'",
    "$catalog",
    "Invoke-MgGraphRequest -Method DELETE -Uri \"/v1.0/identityGovernance/entitlementManagement/catalogs/$catalog.id\"",
    "Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/catalogs?$select=id,displayName'",
  ].join("\n"),
  govPackageCreate: [
    "# POST a package linked to the built-in General catalog",
    "Connect-MgGraph -Scopes \"EntitlementManagement.ReadWrite.All\"",
    "$package = Invoke-MgGraphRequest -Method POST -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages' -Body '{\"displayName\":\"HR Basic Access\",\"description\":\"Demo access bundle\",\"isHidden\":false,\"catalog\":{\"id\":\"f0000000-0000-4000-8000-000000001001\"}}'",
    "$package",
    "Invoke-MgGraphRequest -Method GET -Uri \"/v1.0/identityGovernance/entitlementManagement/accessPackages/$package.id?%24expand=catalog\"",
  ].join("\n"),
  govPackageUpdate: [
    "# PATCH an existing package; catalog linkage is immutable",
    "Connect-MgGraph -Scopes \"EntitlementManagement.ReadWrite.All\"",
    "Invoke-MgGraphRequest -Method PATCH -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages/f0000000-0000-4000-8000-000000001101' -Body '{\"description\":\"Revised engineering starter access\",\"isHidden\":true}'",
    "Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages/f0000000-0000-4000-8000-000000001101?$select=id,displayName,isHidden,description'",
  ].join("\n"),
  govPackageDelete: [
    "# Create then remove a transient package using its returned ID",
    "Connect-MgGraph -Scopes \"EntitlementManagement.ReadWrite.All\"",
    "$package = Invoke-MgGraphRequest -Method POST -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages' -Body '{\"displayName\":\"Temporary Package\",\"catalog\":{\"id\":\"f0000000-0000-4000-8000-000000001002\"}}'",
    "$package",
    "Invoke-MgGraphRequest -Method DELETE -Uri \"/v1.0/identityGovernance/entitlementManagement/accessPackages/$package.id\"",
    "Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages?%24filter=catalogId%20eq%20%27f0000000-0000-4000-8000-000000001002%27'",
  ].join("\n"),
  govLifecycle: [
    "# Full package lifecycle: POST -> GET -> PATCH -> GET -> DELETE",
    "Connect-MgGraph -Scopes \"EntitlementManagement.ReadWrite.All\"",
    "$package = Invoke-MgGraphRequest -Method POST -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages' -Body '{\"displayName\":\"Lifecycle Example\",\"catalog\":{\"id\":\"f0000000-0000-4000-8000-000000001002\"}}'",
    "Invoke-MgGraphRequest -Method GET -Uri \"/v1.0/identityGovernance/entitlementManagement/accessPackages/$package.id\"",
    "Invoke-MgGraphRequest -Method PATCH -Uri \"/v1.0/identityGovernance/entitlementManagement/accessPackages/$package.id\" -Body '{\"description\":\"Reviewed by the IGA team\",\"isHidden\":true}'",
    "Invoke-MgGraphRequest -Method GET -Uri \"/v1.0/identityGovernance/entitlementManagement/accessPackages/$package.id\"",
    "Invoke-MgGraphRequest -Method DELETE -Uri \"/v1.0/identityGovernance/entitlementManagement/accessPackages/$package.id\"",
    "Invoke-MgGraphRequest -Method GET -Uri '/v1.0/identityGovernance/entitlementManagement/accessPackages?%24filter=displayName%20eq%20%27Lifecycle%20Example%27'",
  ].join("\n")
 });
 function refreshStats(){entryCount.textContent=adapter.engine.session.directory.all().length+' objects';}
 document.getElementById('run').addEventListener('click',async()=>{await adapter.submit(editor.value);refreshStats();});
 document.getElementById('reset').addEventListener('click',async()=>{await adapter.reset();refreshStats();});
 document.getElementById('inspect').addEventListener('click',()=>{
  const target=document.getElementById('ast-output'),details=document.getElementById('ast-details');
  try{target.textContent=JSON.stringify(adapter.engine.parse(editor.value),null,2);status.textContent='AST parsed';}
  catch(error){target.textContent=`${error.code||'ParserError'}: ${error.message}`;status.textContent='Parse error';}
  details.open=true;
 });
 document.getElementById('copy').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(editor.value);status.textContent='Copied';}
  catch(_){editor.focus();editor.select();status.textContent='Select script to copy';}
 });
 document.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',()=>{editor.value=samples[button.dataset.example];editor.focus();}));
 editor.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();adapter.submit(editor.value).then(refreshStats);}
  if(event.key==='Tab'&&!event.shiftKey){event.preventDefault();editor.setRangeText('  ',editor.selectionStart,editor.selectionEnd,'end');}
 });
 refreshStats();
 // Minimal inspection surface for automated browser smoke tests.
 globalThis.PowerShellJSApp={registry,terminal,adapter,editor,examples:samples};
})();
