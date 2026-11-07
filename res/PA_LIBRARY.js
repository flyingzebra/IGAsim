/* IGAsim NoCode JS Studio v0.2 — prebuilt, fictional workflow definitions.
 * Browser classic-script API; no network, storage, imports, Node or bundler.
 */
(function (root) {
  'use strict';
  const action = (id, type, name, properties) => ({id, componentType:'task', type, name, properties:properties || {}});
  const trigger = () => action('trigger-manual','trigger','Manual trigger',{event:'manual'});
  const ps = (id, name, script) => action(id,'powershell',name,{script});
  const graph = (id,name,method,uri,body='') => action(id,'graph',name,{method,uri,body});
  const log = (id,name,message) => action(id,'log',name,{message});
  const variable = (id,name,key,value,source='literal') => action(id,'setVariable',name,{name:key,value,source});
  const condition = (id,name,path,operator,value,yes,no) => ({
    id, componentType:'switch',type:'condition',name,
    properties:{path,operator,value},branches:{true:yes,false:no}
  });
  const definition = (name,sequence) => ({properties:{name},sequence:[trigger(),...sequence]});
  const catalogEndpoint = '/v1.0/identityGovernance/entitlementManagement/catalogs';
  const packageEndpoint = '/v1.0/identityGovernance/entitlementManagement/accessPackages';
  const examples = Object.freeze([
    {id:'inventory',label:'Hybrid identity inventory',category:'Read-only',description:'Query simulated Entra users and Active Directory users in one workflow.'},
    {id:'joiner',label:'Joiner: AD provisioning',category:'Directory writes',description:'Move a fictional employee into Operations and update group membership.'},
    {id:'catalog',label:'Governance: create catalog',category:'Graph CRUD',description:'Connect to Graph, create a fictional access catalog, then check the response.'},
    {id:'package',label:'Governance: create access package',category:'Graph CRUD',description:'Create a new package in the built-in General catalog.'},
    {id:'branch',label:'Condition and variables',category:'Logic',description:'Show a true/false decision using only internal workflow state.'}
  ]);
  const templates = {
    inventory() {
      return root.PowerAutomateJS.sampleDefinition();
    },
    joiner() {
      return definition('Joiner — fictional AD user',[
        ps('joiner-department','Set department','Set-ADUser -Identity leo.chen -Department Operations'),
        ps('joiner-group','Assign Operations group','Add-ADGroupMember -Identity BR_Operations -Members leo.chen'),
        ps('joiner-verify','Verify AD changes','Get-ADUser -Identity leo.chen -Properties Department\nGet-ADGroupMember -Identity BR_Operations'),
        log('joiner-complete','Finish','AD changes exist in the current in-memory sandbox only.')
      ]);
    },
    catalog() {
      return definition('Create an access catalog',[
        ps('catalog-connect','Connect simulated Graph','Connect-MgGraph -Scopes "EntitlementManagement.ReadWrite.All"'),
        graph('catalog-create','Create catalog','POST',catalogEndpoint,'{"displayName":"Studio Demo Catalog","description":"NoCode JS simulation"}'),
        condition('catalog-status','Created?', 'lastStatus','eq','201',
          [log('catalog-success','Catalog created','New fictional catalog ID: ${last.id}')],
          [log('catalog-rejected','Unexpected response','Graph returned ${lastStatus}')]),
        graph('catalog-read','List catalogs','GET',catalogEndpoint),
        log('catalog-done','Complete','Catalogs listed successfully (HTTP ${lastStatus}).')
      ]);
    },
    package() {
      return definition('Create an access package',[
        ps('package-connect','Connect simulated Graph','Connect-MgGraph -Scopes "EntitlementManagement.ReadWrite.All"'),
        graph('package-create','Create access package','POST',packageEndpoint,
          '{"displayName":"Studio Demo Package","description":"Simulated access bundle","catalog":{"id":"f0000000-0000-4000-8000-000000001001"}}'),
        variable('package-id','Remember created ID','createdPackageId','last.id','path'),
        graph('package-get','List access packages','GET',packageEndpoint),
        log('package-done','Complete','Created package ${variables.createdPackageId}; HTTP ${lastStatus}.')
      ]);
    },
    branch() {
      return definition('Evaluate workflow variables',[
        variable('logic-set','Set onboarding stage','stage','approved'),
        condition('logic-if','Manager approved?', 'variables.stage','eq','approved',
          [log('logic-yes','Approved path','Manager approved: continue provisioning.')],
          [log('logic-no','Rejected path','Approval missing: do not provision.')]),
        log('logic-done','Complete','Decision recorded in the execution trace.')
      ]);
    }
  };
  function get(id) {
    if (!Object.prototype.hasOwnProperty.call(templates,id)) throw new Error('Unknown studio example: '+id);
    const doc = templates[id]();
    root.PowerAutomateJS.assertValid(doc);
    return JSON.parse(JSON.stringify(doc));
  }
  function list() {return examples.map(item => Object.assign({},item));}
  root.NoCodeWorkflowLibrary = Object.freeze({version:'0.2',list,get});
})(globalThis);
