/* ActiveDirectory-style cmdlets operating on the in-memory directory provider. */
(function(root,factory){const api=factory(root&&root.PowerShellAD||(typeof require==='function'?require('./PS_AD.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PowerShellADCommands=api;})(typeof globalThis!=='undefined'?globalThis:this,function(AD){
'use strict';
if(!AD)throw new Error('Load PS_AD.js before PS_AD_COMMANDS.js.');
const {DirectoryError,attr}=AD;
const str=v=>String(v??''),lc=v=>str(v).toLowerCase();
const list=v=>Array.isArray(v)?v:str(v??'').split(',').map(s=>s.trim()).filter(Boolean);
const found=(o,k)=>Object.keys(o).find(x=>lc(x)===lc(k));
const DEFAULT={user:['Name','SamAccountName','DistinguishedName','Enabled'],group:['Name','SamAccountName','DistinguishedName','GroupCategory','GroupScope'],computer:['Name','SamAccountName','DistinguishedName','Enabled'],organizationalunit:['Name','DistinguishedName'],object:['Name','ObjectClass','DistinguishedName']};
function project(e,kind,properties,dir){
 const names=[...(DEFAULT[kind]||DEFAULT.object)];
 if(properties!==undefined){let props=list(properties);if(props.includes('*'))return {...e};for(let p of props)if(!names.some(n=>lc(n)===lc(p)))names.push(p);}
 const out={};for(let name of names){let value=attr(e,name);if(lc(name)==='objectclass')value=Array.isArray(e.objectClass)?e.objectClass[e.objectClass.length-1]:e.objectClass;
 if(lc(name)==='memberof'&&value===undefined)value=dir.groupsOf(e).map(x=>x.distinguishedName);
 out[name]=value===undefined?null:value;}return out;
}
function parseParams(args,allowed){const extras=[...args.parameters.keys()].filter(k=>!allowed.includes(k));if(extras.length)throw new DirectoryError('Unsupported parameter(s) for this simulated cmdlet: '+extras.map(x=>'-'+x).join(', '),'UnsupportedParameter');}
const readerParams=['identity','filter','ldapfilter','searchbase','searchscope','properties','resultsetsize'];
function identityOf(args,input){if(args.has('identity'))return args.get('identity');if(args.positionals.length)return args.positionals[0];if(input.length===1&&input[0]&&typeof input[0]==='object')return attr(input[0],'distinguishedName')||attr(input[0],'SamAccountName');return undefined;}
function filterArgs(args,session){
 const option={};if(args.has('filter'))option.filter=args.get('filter');if(args.has('ldapfilter'))option.ldapFilter=args.get('ldapfilter');
 if(args.has('searchbase'))option.searchBase=args.get('searchbase');if(args.has('searchscope'))option.searchScope=args.get('searchscope');
 option.variables=Object.fromEntries(session.variables);return option;
}
function registerADCommands(engine){
 const register=(name,description,run)=>engine.registerCommand({name,description,aliases:[],run});
 function makeReader(name,kind){register(name,'Query simulated Active Directory '+kind+' objects. Supports -Identity, -Filter, -LDAPFilter, -SearchBase, -SearchScope, -Properties.',async({args,input,session})=>{
  parseParams(args,readerParams);
  const identity=identityOf(args,input);
  if(identity!==undefined&&(args.has('filter')||args.has('ldapfilter')))throw new DirectoryError('Identity cannot be combined with -Filter / -LDAPFilter.','ParameterSetConflict');
  const options=filterArgs(args,session);if(identity!==undefined)options.identity=identity;
  else if(options.filter===undefined&&options.ldapFilter===undefined)throw new DirectoryError('Specify -Identity, -Filter or -LDAPFilter (for example -Filter *).','MissingParameter');
  const matches=session.directory.search({kind,...options});
  const limit=args.has('resultsetsize')?Number(args.get('resultsetsize')):matches.length;
  if(!Number.isSafeInteger(limit)||limit<0)throw new DirectoryError('ResultSetSize must be a non-negative integer.','InvalidParameter');
  return {values:matches.slice(0,limit).map(x=>project(x,kind,args.get('properties'),session.directory)),messages:[],effects:[]};
 });}
 makeReader('Get-ADUser','user');makeReader('Get-ADGroup','group');makeReader('Get-ADComputer','computer');
 makeReader('Get-ADOrganizationalUnit','organizationalunit');makeReader('Get-ADObject','object');
 register('Search-LDAP','Query simulated directory using LDAP RFC4515-style filter syntax; alias Invoke-LDAPSearch.',async({args,session})=>{
  parseParams(args,['basedn','filter','scope','attributes','sizelimit']);
  if(!args.has('filter'))throw new DirectoryError('Search-LDAP requires -Filter with an LDAP assertion.','MissingParameter');
  const results=session.directory.search({kind:'object',ldapFilter:args.get('filter'),searchBase:args.get('basedn',session.directory.root),searchScope:args.get('scope','Subtree')});
  const limit=args.has('sizelimit')?Number(args.get('sizelimit')):results.length;
  if(!Number.isSafeInteger(limit)||limit<0)throw new DirectoryError('SizeLimit must be a non-negative integer.','InvalidParameter');
  const attrs=args.has('attributes')?list(args.get('attributes')):['distinguishedName','name','objectCategory'];
  return {values:results.slice(0,limit).map(e=>Object.fromEntries(attrs.map(a=>[a,attr(e,a)??null]))),messages:[],effects:[]};
 });
 engine.aliases.set('invoke-ldapsearch','search-ldap');
 register('Get-LDAPQueryLog','Show directory queries executed in this simulator session.',async({args,session})=>{
  parseParams(args,[]);return {values:session.directory.queryLog.map(e=>({...e})),messages:[],effects:[]};
 });
 register('Get-ADRootDSE','Show simulated naming context information.',async({args,session})=>{
  parseParams(args,[]);return {values:[{defaultNamingContext:session.directory.root,rootDomainNamingContext:session.directory.root,dnsHostName:'srv-dc-01.corp.example.com',supportedLDAPVersion:[3],simulated:true}],messages:[],effects:[]};
 });
 register('Get-ADGroupMember','Enumerate simulated group members; -Recursive expands nested groups.',async({args,input,session})=>{
  parseParams(args,['identity','recursive']);const identity=identityOf(args,input);if(!identity)throw new DirectoryError('Get-ADGroupMember requires -Identity.','MissingParameter');
  const members=session.directory.members(str(identity),args.has('recursive')&&args.get('recursive')!==false);
  return {values:members.map(x=>({Name:x.name,SamAccountName:x.sAMAccountName||'',objectClass:Array.isArray(x.objectClass)?x.objectClass[x.objectClass.length-1]:x.objectClass,distinguishedName:x.distinguishedName})),messages:[],effects:[]};
 });
 register('Get-ADPrincipalGroupMembership','Get direct group membership for a user or another directory principal.',async({args,input,session})=>{
  parseParams(args,['identity']);const id=identityOf(args,input);if(!id)throw new DirectoryError('Get-ADPrincipalGroupMembership requires -Identity.','MissingParameter');
  return {values:session.directory.groupsOf(id).map(x=>project(x,'group',undefined,session.directory)),messages:[],effects:[]};
 });
 register('Set-ADUser','Modify an in-memory user (supported: -Department, -Title, -EmailAddress).',async({args,session})=>{
  parseParams(args,['identity','department','title','emailaddress','passthru']);const id=identityOf(args,[]);if(!id)throw new DirectoryError('Set-ADUser requires -Identity.','MissingParameter');
  const entry=session.directory.get(id,'user');let changes=0;
  for(const [key,field] of [['department','department'],['title','title'],['emailaddress','mail']])if(args.has(key)){entry[field]=str(args.get(key));changes++;}
  if(!changes)throw new DirectoryError('Set-ADUser requires a supported modification.','MissingParameter');
  return {values:args.has('passthru')?[project(entry,'user','Department,Title,Mail',session.directory)]:[],messages:[],effects:[]};
 });
 for(const [cmd,enabled] of [['Enable-ADAccount',true],['Disable-ADAccount',false]])register(cmd,'Change a simulated account enabled state.',async({args,input,session})=>{
  parseParams(args,['identity','passthru']);const id=identityOf(args,input);if(!id)throw new DirectoryError(cmd+' requires -Identity.','MissingParameter');
  const entry=session.directory.get(id,'user');entry.Enabled=entry.enabled=enabled;entry.userAccountControl=enabled?512:514;
  return {values:args.has('passthru')?[project(entry,'user',undefined,session.directory)]:[],messages:[],effects:[]};
 });
 for(const [cmd,add] of [['Add-ADGroupMember',true],['Remove-ADGroupMember',false]])register(cmd,'Modify in-memory group membership; -Members accepts a comma-separated identity list.',async({args,session})=>{
  parseParams(args,['identity','members','passthru']);const group=session.directory.get(identityOf(args,[]),'group');
  if(!args.has('members'))throw new DirectoryError(cmd+' requires -Members.','MissingParameter');
  const members=list(args.get('members')).map(m=>session.directory.get(m));
  group.member=group.member||[];
  for(const member of members){const dn=member.distinguishedName;
   if(add){if(!group.member.some(m=>lc(m)===lc(dn)))group.member.push(dn);member.memberOf=member.memberOf||[];if(!member.memberOf.some(m=>lc(m)===lc(group.distinguishedName)))member.memberOf.push(group.distinguishedName);}
   else{group.member=group.member.filter(m=>lc(m)!==lc(dn));member.memberOf=(member.memberOf||[]).filter(m=>lc(m)!==lc(group.distinguishedName));}
  }
  return {values:args.has('passthru')?[project(group,'group','member',session.directory)]:[],messages:[],effects:[]};
 });
}
return {registerADCommands,VERSION:'0.2.0'};
});
