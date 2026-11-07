/* Browser regression tests for IGAsim NoCode JS Studio sample workflows. */
'use strict';
(async function () {
  let passes=0;
  async function check(name,fn) {
    try {await fn();console.log('PASS '+name);passes++;}
    catch (error) {console.error('FAIL '+name,error);}
  }
  const api=PowerAutomateJS, examples=NoCodeWorkflowLibrary;
  await check('Studio template library exposes five distinct examples', () => {
    assert.equal(examples.list().length,5);
    assert.equal(new Set(examples.list().map(x=>x.id)).size,5);
  });
  await check('Every template validates and contains unique IDs', () => {
    for (const item of examples.list()) assert.equal(api.assertValid(examples.get(item.id)),true);
  });
  await check('Each template is cloned, not a shared mutable definition', () => {
    const first=examples.get('joiner');first.sequence[1].name='CHANGED';
    assert.notEqual(examples.get('joiner').sequence[1].name,'CHANGED');
  });
  await check('Missing template ID fails closed', () => {
    assert.throws(()=>examples.get('nonexistent'),/Unknown studio example/);
    assert.throws(()=>examples.get('__proto__'),/Unknown studio example/);
  });
  await check('Hybrid inventory executes through shared simulated PowerShell',async()=>{
    const ps=new PowerShellJS.PowerShellSimulator();
    const r=await new api.WorkflowEngine({powershell:ps}).run(examples.get('inventory'));
    assert.equal(r.status,'success',r.error);
    assert.ok(r.trace.some(x=>x.type==='graph'));
  });
  await check('Joiner workflow edits AD and reset restores it',async()=>{
    const ps=new PowerShellJS.PowerShellSimulator();
    const r=await new api.WorkflowEngine({powershell:ps}).run(examples.get('joiner'));
    assert.equal(r.status,'success',r.error);
    const read=await ps.execute('Get-ADUser -Identity leo.chen -Properties Department');
    assert.equal(read.objects[0].Department,'Operations');
    ps.reset();
    const after=await ps.execute('Get-ADUser -Identity leo.chen -Properties Department');
    assert.notEqual(after.objects[0].Department,'Operations');
  });
  await check('Catalog workflow creates a new fictional access catalog',async()=>{
    const ps=new PowerShellJS.PowerShellSimulator();
    const before=ps.session.entra.DB.accessPackageCatalogs.length;
    const r=await new api.WorkflowEngine({powershell:ps}).run(examples.get('catalog'));
    assert.equal(r.status,'success',r.error);
    assert.equal(ps.session.entra.DB.accessPackageCatalogs.length,before+1);
    assert.ok(r.trace.some(x=>x.type==='condition'&&x.detail==='true'));
  });
  await check('Package workflow creates and reads a simulated access package',async()=>{
    const ps=new PowerShellJS.PowerShellSimulator();
    const before=ps.session.entra.DB.accessPackages.length;
    const r=await new api.WorkflowEngine({powershell:ps}).run(examples.get('package'));
    assert.equal(r.status,'success',r.error);
    assert.equal(ps.session.entra.DB.accessPackages.length,before+1);
    assert.ok(r.state.variables.createdPackageId);
  });
  await check('Condition workflow follows approved path only',async()=>{
    const ps=new PowerShellJS.PowerShellSimulator();
    const r=await new api.WorkflowEngine({powershell:ps}).run(examples.get('branch'));
    assert.equal(r.status,'success',r.error);
    assert.ok(r.trace.some(x=>x.id==='logic-yes'));
    assert.ok(!r.trace.some(x=>x.id==='logic-no'));
  });
  console.log('\n'+passes+' NoCode JS Studio template checks passed.');
})().then(()=>BrowserTest.done()).catch(error=>BrowserTest.crash(error));
