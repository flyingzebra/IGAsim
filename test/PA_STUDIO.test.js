/* Browser DOM smoke tests for the standalone NoCode JS Workflow Studio. */
'use strict';
(async function () {
  let passes=0;
  async function check(name,fn){try{await fn();console.log('PASS '+name);passes++;}catch(error){console.error('FAIL '+name,error);}}
  const fixture = `
    <main id="pa-workflows">
      <select id="studio-template"><option value="inventory">Hybrid inventory</option></select>
      <button id="studio-load"></button><button id="studio-reset"></button>
      <button id="studio-clear"></button><button id="studio-refresh-outline"></button>
      <button id="studio-open-visual"></button>
      <div id="studio-visual-intro"></div>
      <div id="studio-ad-count"></div><div id="studio-entra-count"></div>
      <div id="studio-catalog-count"></div><div id="studio-package-count"></div>
      <div id="studio-graph-connected"></div>
      <div id="studio-step-count"></div><ol id="studio-outline"></ol>
      <div id="studio-run-summary"></div><ol id="studio-timeline"></ol>
      <pre id="studio-state"></pre>
      <button id="pa-visual-toggle"></button><button id="pa-run"></button>
      <button id="pa-example"></button><button id="pa-apply"></button>
      <button id="pa-export"></button><input type="file" id="pa-import">
      <textarea id="pa-json"></textarea><div id="pa-status"></div>
      <pre id="pa-output"></pre><div id="pa-visual"><div id="pa-designer"></div></div>
    </main>`;
  const scripts = [
    '../res/PS_PARSER.js','../res/AD_CORE.js','../res/PS_AD_COMMANDS.js',
    '../res/ENTRA_CORE.js','../res/PS_GRAPH_COMMANDS.js','../res/PS_CORE.js',
    '../res/PA_CORE.js','../res/PA_LIBRARY.js','./PA_STUDIO.fixture.js',
    '../res/PA_APP.js','../tools/NoCodeJS-Studio.js'
  ];
  const realm=await BrowserTest.realm(scripts,fixture);
  try{
    const w=realm.window,document=realm.document;
    const $=id=>document.getElementById(id);
    await check('Studio bootstraps in a standalone browser frame',()=>{
      assert.equal(typeof w.NoCodeJSStudio,'object');
      assert.equal(typeof w.PowerAutomateJSApp.engine.run,'function');
    });
    await check('Studio exposes all sample templates',()=>{
      assert.equal($('studio-template').options.length,5);
    });
    await check('Initial outline shows a valid workflow',()=>{
      assert.ok($('studio-outline').children.length>4);
      assert.ok($('studio-step-count').textContent.includes('steps'));
    });
    await check('Example picker loads a different JSON definition',()=>{
      w.NoCodeJSStudio.loadTemplate('branch');
      const def=JSON.parse($('pa-json').value);
      assert.equal(def.properties.name,'Evaluate workflow variables');
      assert.ok($('studio-outline').children.length>=4);
    });
    await check('Workflow run updates execution trace and history',async()=>{
      $('pa-run').click();
      const started=Date.now();
      while ($('pa-run').disabled && Date.now()-started<2000) await new Promise(r=>setTimeout(r,10));
      assert.ok(!$('pa-run').disabled,'Workflow did not complete');
      assert.ok(w.NoCodeJSStudio.getLastRun());
      assert.equal(w.NoCodeJSStudio.getLastRun().status,'success');
      assert.ok($('studio-timeline').children.length>=4);
      assert.equal(w.NoCodeJSStudio.getHistory().length,1);
    });
    await check('Reset simulated identity sandbox clears Graph connection',async()=>{
      w.PowerShellJSApp.adapter.engine.session.entra.Connect([]);
      $('studio-reset').click();
      assert.equal(w.PowerShellJSApp.adapter.engine.session.entra.Session.connected,false);
      assert.equal($('studio-graph-connected').textContent,'Disconnected');
    });
    await check('Clear trace clears history without deleting the workflow',()=>{
      const before=$('pa-json').value;
      $('studio-clear').click();
      assert.equal(w.NoCodeJSStudio.getHistory().length,0);
      assert.equal($('studio-timeline').children.length,0);
      assert.equal($('pa-json').value,before);
    });
    await check('Unsafe prototype-key example is not loaded',()=>{
      assert.throws(()=>w.NoCodeWorkflowLibrary.get('__proto__'),/Unknown studio example/);
    });
  }finally{realm.close();}
  console.log('\n'+passes+' NoCode JS Studio DOM checks passed.');
})().then(()=>BrowserTest.done()).catch(error=>BrowserTest.crash(error));
