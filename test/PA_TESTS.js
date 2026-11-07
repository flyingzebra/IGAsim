/* Browser-only PowerAutomateJS v0.1 integration regression suite. */
'use strict';
(async function () {
  let passes = 0;
  async function test(name, fn) {
    try { await fn(); console.log('PASS ' + name); passes++; }
    catch (error) { console.error('FAIL ' + name, error); }
  }
  function ps() { return new PowerShellJS.PowerShellSimulator(); }
  function runner(backend) { return new PowerAutomateJS.WorkflowEngine({ powershell: backend }); }
  function withSteps(...steps) {
    return { properties: {}, sequence: [
      {id:'start',componentType:'task',type:'trigger',name:'Manual',properties:{event:'manual'}},
      ...steps
    ]};
  }
  function action(id, type, properties) { return {id,componentType:'task',type,name:id,properties}; }

  await test('NoCode JS-compatible workflow schema and sample validated', () => {
    const model = PowerAutomateJS.sampleDefinition();
    assert.equal(PowerAutomateJS.assertValid(model),true);
    assert.equal(model.sequence[3].componentType,'switch');
    assert.ok(Array.isArray(model.sequence[3].branches.true));
  });
  await test('Shared PowerShell engine executes the hybrid sample offline', async () => {
    const actual = ps();
    const result = await runner(actual).run(PowerAutomateJS.sampleDefinition());
    assert.equal(result.status,'success',result.error);
    assert.ok(result.trace.some(x=>x.type==='graph'&&x.status==='success'));
    assert.ok(result.trace.some(x=>x.type==='powershell'&&x.status==='success'));
    assert.equal(actual.session.entra.Session.connected,true);
  });
  await test('Graph GET exposes in-memory response to state', async () => {
    const r = await runner(ps()).run(withSteps(action('connect','powershell',{script:'Connect-MgGraph'}),action('g','graph',{method:'GET',uri:'/v1.0/users?$top=1'})));
    assert.equal(r.status,'success',r.error);
    assert.equal(r.state.lastStatus,200);
    assert.ok(r.state.last.value.length===1);
  });
  await test('Graph POST writes to the same Entra core instance', async () => {
    const actual=ps();
    const def=withSteps(action('connect','powershell',{script:'Connect-MgGraph'}),action('create','graph',{method:'POST',uri:'/v1.0/identityGovernance/entitlementManagement/catalogs',body:'{"displayName":"PA Demo Catalog"}'}));
    const result=await runner(actual).run(def);
    assert.equal(result.status,'success',result.error);
    assert.ok(actual.session.entra.DB.accessPackageCatalogs.some(x=>x.displayName==='PA Demo Catalog'));
    actual.reset();
    assert.ok(!actual.session.entra.DB.accessPackageCatalogs.some(x=>x.displayName==='PA Demo Catalog'));
  });
  await test('PowerShell changes are shared with in-memory AD', async () => {
    const actual=ps();
    const def=withSteps(action('ps1','powershell',{script:'Set-ADUser -Identity leo.chen -Department Operations'}));
    const result=await runner(actual).run(def);
    assert.equal(result.status,'success',result.error);
    const read=await actual.execute('Get-ADUser -Identity leo.chen -Properties Department');
    assert.equal(read.objects[0].Department,'Operations');
  });
  await test('Graph failure stops the workflow and reports failed step', async () => {
    const def=withSteps(action('connect','powershell',{script:'Connect-MgGraph'}),action('bad','graph',{method:'GET',uri:'/v1.0/unavailable'}),action('never','log',{message:'should not run'}));
    const result=await runner(ps()).run(def);
    assert.equal(result.status,'failed');
    assert.equal(result.trace.at(-1).id,'bad');
    assert.match(result.error,/Graph HTTP 404/);
  });
  await test('Conditions route only through the selected true branch', async () => {
    const def=withSteps(action('set','setVariable',{name:'x',value:'42'}), {
      id:'if',componentType:'switch',type:'condition',name:'if',properties:{path:'variables.x',operator:'eq',value:'42'},
      branches:{true:[action('yes','log',{message:'yes'})],false:[action('no','log',{message:'no'})]}
    });
    const result=await runner(ps()).run(def);
    assert.equal(result.status,'success',result.error);
    assert.ok(result.trace.some(x=>x.id==='yes'));
    assert.ok(!result.trace.some(x=>x.id==='no'));
  });
  await test('Conditions route through the false branch', async () => {
    const def=withSteps({id:'if',componentType:'switch',type:'condition',name:'if',properties:{path:'lastStatus',operator:'eq',value:'200'},
      branches:{true:[action('yes','log',{message:'yes'})],false:[action('no','log',{message:'no'})]}});
    const result=await runner(ps()).run(def);
    assert.equal(result.status,'success',result.error);
    assert.equal(result.trace.at(-1).id,'no');
  });
  await test('Path-backed variables copy data from Graph state', async () => {
    const def=withSteps(action('connect','powershell',{script:'Connect-MgGraph'}),action('g','graph',{uri:'/v1.0/users?$top=1',method:'GET'}),
      action('set','setVariable',{name:'httpStatus',source:'path',value:'lastStatus'}));
    const result=await runner(ps()).run(def);
    assert.equal(result.status,'success',result.error);
    assert.equal(result.state.variables.httpStatus,200);
  });
  await test('Templates interpolate known state paths without eval', () => {
    assert.equal(PowerAutomateJS.interpolate('HTTP ${lastStatus}',{lastStatus:200}),'HTTP 200');
    assert.throws(()=>PowerAutomateJS.interpolate('${variables.__proto__}',{variables:{}}),/Forbidden/);
  });
  await test('Validation rejects unsupported actions before any changes', async () => {
    const actual=ps();
    const original=JSON.stringify(actual.session.entra.DB);
    const def=withSteps(action('bad','unknown',{foo:'bar'}));
    assert.throws(()=>PowerAutomateJS.assertValid(def),/Unknown step/);
    try { await runner(actual).run(def); throw new Error('Expected validation failure'); }
    catch(error) { assert.match(error.message,/Unknown step/); }
    assert.equal(JSON.stringify(actual.session.entra.DB),original);
  });
  await test('Validation rejects nested triggers and duplicate identifiers', () => {
    assert.throws(()=>PowerAutomateJS.assertValid(withSteps(action('again','trigger',{event:'manual'}))),/Trigger must/);
    assert.throws(()=>PowerAutomateJS.assertValid(withSteps(action('start','log',{message:'duplicate'}))),/duplicate/);
  });
  await test('Safety: prototype pollution and remote Graph URI rejected', async () => {
    const bad=withSteps(action('var','setVariable',{name:'__proto__',value:'x'}));
    assert.equal((await runner(ps()).run(bad)).status,'failed');
    const remote=withSteps(action('bad','graph',{method:'GET',uri:'https://graph.microsoft.com/v1.0/users'}));
    assert.equal((await runner(ps()).run(remote)).status,'failed');
  });
  await test('Wrong trigger event blocks execution', async () => {
    const actual=ps();
    try { await runner(actual).run(PowerAutomateJS.sampleDefinition(),{event:'employee.created'}); throw new Error('Unexpected run'); }
    catch(error) { assert.match(error.message,/Trigger event does not match/); }
  });
  await test('Reentrant calls are rejected', async () => {
    const actual=ps(), r=runner(actual);
    const doc=withSteps(action('ps','powershell',{script:'Get-ADUser -Filter *'}));
    let nestedError='';
    const result=await r.run(doc,{onStep(entry){if(entry.type==='trigger'&&entry.status==='running') {
      r.run(doc).catch(error=>{nestedError=error.message;});
    }}});
    await Promise.resolve();
    assert.equal(result.status,'success',result.error);
    assert.match(nestedError,/already running/);
  });
  await test('UI script and JSON runner remain separated from terminal engine', () => {
    assert.equal(typeof PowerAutomateJS.WorkflowEngine,'function');
    assert.ok(typeof PowerShellTerminal==='object');
    assert.equal(typeof PowerAutomateJSApp,'undefined'); // test suite does not load app UI
  });
  console.log('\n' + passes + ' PowerAutomateJS checks passed.');
})().then(() => BrowserTest.done()).catch(error => BrowserTest.crash(error));
