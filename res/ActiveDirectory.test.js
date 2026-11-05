/* Run: node ActiveDirectory.test.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const adFile = path.join(__dirname, 'AD_CORE.js');
// A classic browser script: no CommonJS wrapper or exports in the emulator.
const ActiveDirectory = vm.runInThisContext(fs.readFileSync(adFile, 'utf8') + '\nActiveDirectory;', { filename: adFile });
const ROOT = 'DC=contoso,DC=local';
let tests = 0;
function test(name, fn) { try { fn(); tests++; console.log('PASS ' + name); } catch (e) { console.error('FAIL ' + name); throw e; } }
const fresh = () => new ActiveDirectory();
const search = (ad, filter, extra={}) => ad.LDAP({operation:'search',filter, ...extra});

test('constructor and instance LDAP method', () => {let ad=fresh();assert.equal(typeof ad.LDAP,'function');assert.equal(ad.DB.domain,'contoso.local');});
test('objectClass and objectCategory searches', () => {let r=search(fresh(),'(&(objectClass=user)(objectCategory=person))');assert.equal(r.resultCode,0);assert.equal(r.count,3);});
test('AND, OR, and NOT filters', () => {let r=search(fresh(),'(&(|(department=IT)(department=Finance))(!(cn=Bob Baker)))');assert.equal(r.count,2);});
test('substring and case insensitive', () => {let r=search(fresh(),'(sAMAccountName=A*E)');assert.equal(r.count,1);});
test('presence', () => {let r=search(fresh(),'(mail=*)');assert.equal(r.count,3);});
test('nested memberOf in-chain', () => {let r=search(fresh(),'(memberOf:1.2.840.113556.1.4.1941:=CN=GG_All_Staff,OU=Groups,'+ROOT+')');assert.equal(r.count,3);});
test('nested member forward in-chain', () => {let r=search(fresh(),'(member:1.2.840.113556.1.4.1941:=CN=Alice Adams,OU=Users,'+ROOT+')');assert.equal(r.count,2);});
test('bitwise AND disabled users', () => {let r=search(fresh(),'(userAccountControl:1.2.840.113556.1.4.803:=2)');assert.equal(r.entries[0].attributes.cn[0],'Carol Chen');});
test('rootDSE', () => {let r=search(fresh(),'(objectClass=*)',{baseDN:'',scope:'base'});assert.equal(r.count,1);assert.deepEqual(r.entries[0].attributes.defaultNamingContext,[ROOT]);});
test('base scope', () => {let r=search(fresh(),'(objectClass=organizationalUnit)',{baseDN:'OU=Users,'+ROOT,scope:'base'});assert.equal(r.count,1);});
test('one scope', () => {let r=search(fresh(),'(objectClass=*)',{baseDN:'OU=Users,'+ROOT,scope:'one'});assert.equal(r.count,3);});
test('missing baseDN', () => {let r=search(fresh(),'(objectClass=*)',{baseDN:'OU=Missing,'+ROOT});assert.equal(r.resultCode,32);});
test('requested attributes and dn', () => {let r=search(fresh(),'(sAMAccountName=alice)',{attributes:['mail']});assert.deepEqual(Object.keys(r.entries[0].attributes),['mail']);assert.ok(r.entries[0].dn);});
test('credentials not leaked via LDAP search', () => {let r=search(fresh(),'(sAMAccountName=alice)');assert.ok(!JSON.stringify(r).includes('Password123!'));});
test('bind success', () => {let a=fresh(),r=a.LDAP('bind',{username:'alice',password:'Password123!'});assert.equal(r.resultCode,0);assert.match(a.boundDN,/Alice/);});
test('bind rejection and disabled account', () => {let a=fresh();assert.equal(a.LDAP('bind',{username:'alice',password:'wrong'}).resultCode,49);assert.equal(a.LDAP('bind',{username:'carol',password:'Password123!'}).resultCode,49);});
test('bind required', () => {let a=new ActiveDirectory(undefined,{requireBind:true});assert.equal(search(a,'(cn=*)').resultCode,50);a.LDAP('bind',{username:'bob',password:'Password123!'});assert.equal(search(a,'(cn=*)').resultCode,0);a.LDAP('unbind');assert.equal(search(a,'(cn=*)').resultCode,50);});
test('compare true false', () => {let a=fresh(),req={operation:'compare',dn:'CN=Alice Adams,OU=Users,'+ROOT,attribute:'department'};assert.equal(a.LDAP({...req,value:'IT'}).resultCode,6);assert.equal(a.LDAP({...req,value:'HR'}).resultCode,5);});
test('add and duplicate entry', () => {let a=fresh(), req={operation:'add',dn:'CN=New,OU=Groups,'+ROOT,attributes:{cn:['New'],objectClass:['group']}};assert.equal(a.LDAP(req).resultCode,0);assert.equal(a.LDAP(req).resultCode,68);assert.equal(search(a,'(cn=New)').count,1);});
test('modify replace and search', () => {let a=fresh(),r=a.LDAP('modify',{dn:'CN=Bob Baker,OU=Users,'+ROOT,changes:[{operation:'replace',attribute:'department',values:['Legal']}]});assert.equal(r.resultCode,0);assert.equal(search(a,'(department=Legal)').count,1);});
test('modify atomic on error', () => {let a=fresh(),r=a.LDAP('modify',{dn:'CN=Bob Baker,OU=Users,'+ROOT,changes:[{operation:'replace',attribute:'department',values:['Legal']},{operation:'add',attribute:'cn',values:['Bob Baker']}]});assert.equal(r.resultCode,20);assert.equal(search(a,'(department=Finance)').count,1);});
test('delete leaf and membership cleanup', () => {let a=fresh(),r=a.LDAP('delete',{dn:'CN=Alice Adams,OU=Users,'+ROOT});assert.equal(r.resultCode,0);assert.equal(search(a,'(sAMAccountName=alice)').count,0);assert.equal(search(a,'(cn=GG_IT_Admins)').entries[0].attributes.member.length,0);});
test('delete nonleaf denied', () => {let a=fresh();assert.equal(a.LDAP('delete',{dn:'OU=Users,'+ROOT}).resultCode,66);});
test('readonly option', () => {let a=new ActiveDirectory(undefined,{allowWrites:false});assert.equal(a.LDAP('delete',{dn:'CN=Bob Baker,OU=Users,'+ROOT}).resultCode,50);});
test('invalid filter', () => {let r=search(fresh(),'(&(cn=Alice Adams)');assert.equal(r.resultCode,2);});
test('size limit', () => {let r=search(fresh(),'(objectClass=*)',{sizeLimit:2});assert.equal(r.resultCode,4);assert.equal(r.count,2);assert.equal(r.truncated,true);});
test('seed deep cloned', () => {let db=ActiveDirectory.sampleDB(), a=new ActiveDirectory(db);a.DB.entries[0].dn='changed';assert.notEqual(db.entries[0].dn,'changed');});
test('escaped literal filter *', () => {let a=fresh();a.LDAP('modify',{dn:'CN=Alice Adams,OU=Users,'+ROOT,changes:[{operation:'replace',attribute:'description',values:['a*b']}]});assert.equal(search(a,'(description=a\\2ab)').count,1);assert.equal(search(a,'(description=a*b)').count,1);});
test('inline dataset and method owned directly by constructor', () => {
  let a=fresh();assert.ok(Object.hasOwn(a,'DB'));assert.ok(Object.hasOwn(a,'LDAP'));
  assert.equal(typeof a.LDAP,'function');assert.ok(!Object.hasOwn(ActiveDirectory.prototype,'LDAP'));
  assert.equal(a.DB.entries.length,11);
});
test('new instances own independent nested inline objects', () => {
  let a=fresh(),b=fresh();a.DB.entries[0].attributes.dc[0]='changed';
  assert.equal(b.DB.entries[0].attributes.dc[0],'contoso');
});
test('sampleDB snapshots do not share references', () => {
  let a=ActiveDirectory.sampleDB(), b=ActiveDirectory.sampleDB();
  a.entries[0].attributes.dc[0]='changed';assert.equal(b.entries[0].attributes.dc[0],'contoso');
});
test('offline module has no JSON-fetch dependency', () => {
  const src=fs.readFileSync(adFile,'utf8');
  assert.match(src,/this\.DB\s*=\s*\{/);assert.match(src,/this\.LDAP\s*=\s*function\s*\(/);
  assert.doesNotMatch(src, /\bfetch\s*\(|\bXMLHttpRequest\s*\(|prototype\.LDAP\s*=/);
  assert.doesNotMatch(src, /module\.exports|\bfactory\b|\(function\s*\(root/);
});
test('plain browser script exposes top-level ActiveDirectory()', () => {
  const src = fs.readFileSync(adFile, 'utf8');
  const sandbox = { TextEncoder, TextDecoder };
  vm.runInNewContext(src, sandbox, { filename: adFile });
  assert.equal(typeof sandbox.ActiveDirectory, 'function');
  let a = new sandbox.ActiveDirectory();
  assert.equal(a.LDAP('search',{filter:'(objectClass=user)'}).count,4); // includes computer user objectClass
  assert.equal(a.DB.entries.length,11);
});
console.log('\n' + tests + ' tests passed.');
