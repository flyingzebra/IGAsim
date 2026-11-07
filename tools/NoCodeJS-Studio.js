/* IGAsim NoCode JS Workflow Studio — standalone UI for PA_APP.js and PA_CORE.js.
 * No network calls; the optional NoCode JS designer is loaded by PA_APP.js.
 */
(function (root) {
  'use strict';
  const $ = id => document.getElementById(id);
  const api = root.PowerAutomateJS;
  const library = root.NoCodeWorkflowLibrary;
  const host = root.PowerShellJSApp;
  const app = root.PowerAutomateJSApp;
  if (!api || !library || !host || !app) {
    const status = $('pa-status');
    if (status) status.textContent = 'Studio initialization failed: workflow runtime unavailable.';
    return;
  }
  const ps = host.adapter.engine;
  const templates = library.list();
  const select = $('studio-template');
  const outline = $('studio-outline');
  const timeline = $('studio-timeline');
  let lastRun = null;
  const sessions = [];

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = String(text);
    return node;
  }
  function stats() {
    const session = ps.session;
    const db = session && session.entra && session.entra.DB;
    if (!session || !db) return;
    $('studio-ad-count').textContent = session.directory.all().length;
    $('studio-entra-count').textContent = (db.users || []).length;
    $('studio-catalog-count').textContent = (db.accessPackageCatalogs || []).length;
    $('studio-package-count').textContent = (db.accessPackages || []).length;
    $('studio-graph-connected').textContent = session.entra.Session.connected ? 'Connected' : 'Disconnected';
  }
  function currentDefinition() {
    return JSON.parse($('pa-json').value);
  }
  function drawOutline() {
    outline.replaceChildren();
    let doc;
    try { doc = currentDefinition(); api.assertValid(doc); }
    catch (error) {
      $('studio-step-count').textContent = 'Invalid definition';
      outline.appendChild(el('li','',error.message));
      return;
    }
    let count = 0;
    function render(seq, depth, branch) {
      for (const step of seq) {
        count++;
        const item = el('li',depth ? 'branch' : '');
        const name = el('strong','',step.name || step.type);
        const type = el('small','',(branch ? branch+' · ' : '')+step.type);
        item.style.marginLeft = Math.min(depth*15,72)+'px';
        item.append(name,type);
        outline.appendChild(item);
        if (step.type==='condition') {
          render(step.branches.true,depth+1,'True');
          render(step.branches.false,depth+1,'False');
        }
      }
    }
    render(doc.sequence,0,'');
    $('studio-step-count').textContent = count + (count===1 ? ' step' : ' steps');
  }
  function drawRun(result) {
    lastRun = result;
    timeline.replaceChildren();
    const summary = $('studio-run-summary');
    summary.className = 'run-summary '+result.status;
    summary.textContent = (result.status==='success' ? 'Completed successfully' : 'Failed') +
      ' · '+result.trace.length+' steps'+(result.error ? ' · '+result.error : '');
    for (const entry of result.trace) {
      const node = el('li',entry.status);
      node.append(el('strong','',entry.name || entry.id),el('small','',entry.status+' · '+(entry.detail || entry.type)));
      timeline.appendChild(node);
    }
    $('studio-state').textContent = JSON.stringify(result.state,null,2);
  }
  const originalRun = app.engine.run.bind(app.engine);
  app.engine.run = async function (definition, options) {
    const result = await originalRun(definition,options);
    sessions.unshift({date:new Date().toISOString(),name:definition.properties.name,status:result.status,steps:result.trace.length});
    if (sessions.length>20) sessions.pop();
    drawRun(result);
    stats();
    drawOutline();
    return result;
  };
  function loadTemplate() {
    try {
      const candidate = library.get(select.value);
      app.setDefinition(candidate);
      drawOutline();
      $('studio-run-summary').textContent = 'Example loaded. Click Run workflow to execute.';
    } catch (error) { $('pa-status').textContent = error.message; }
  }
  templates.forEach(item => {
    const option = document.createElement('option');
    option.value=item.id;
    option.textContent=item.label+' · '+item.category;
    option.title=item.description;
    select.appendChild(option);
  });
  // The original static fallback option has the same id as the first rich option.
  if (select.options.length>templates.length) select.remove(0);
  select.value='inventory';
  $('studio-load').addEventListener('click',loadTemplate);
  $('studio-reset').addEventListener('click',() => {
    if (app.engine.running) { $('pa-status').textContent='Wait for the current workflow to finish before resetting.'; return; }
    ps.reset();
    stats();
    $('pa-status').textContent='AD, Entra and PowerShell sandbox reset to fictional fixtures.';
  });
  $('studio-clear').addEventListener('click',() => {
    lastRun=null;sessions.length=0;
    timeline.replaceChildren();
    $('pa-output').textContent='';
    $('studio-state').textContent='Not run yet.';
    const s=$('studio-run-summary');s.className='run-summary';s.textContent='Execution trace cleared.';
  });
  $('studio-refresh-outline').addEventListener('click',drawOutline);
  $('pa-apply').addEventListener('click',drawOutline);
  $('pa-example').addEventListener('click',() => {select.value='inventory';drawOutline();});
  $('pa-import').addEventListener('change',() => setTimeout(drawOutline,0));
  $('pa-json').addEventListener('change',drawOutline);
  $('studio-open-visual').addEventListener('click',() => $('pa-visual-toggle').click());
  // Keep the explanation visible when the offline CDN fails; only hide if the actual designer is visible.
  const intro=$('studio-visual-intro');
  const visual=$('pa-visual');
  new MutationObserver(() => {
    intro.hidden=visual.classList.contains('active');
    drawOutline();
  }).observe(visual,{attributes:true,attributeFilter:['class']});
  // Expose a small, read-only inspection surface for browser regression tests.
  root.NoCodeJSStudio = Object.freeze({
    version:'0.2',listTemplates:library.list,loadTemplate(id){select.value=id;loadTemplate();},
    refreshStats:stats,refreshOutline:drawOutline,
    getLastRun:()=>lastRun,
    getHistory:()=>sessions.map(x=>Object.assign({},x))
  });
  stats();drawOutline();
})(globalThis);
