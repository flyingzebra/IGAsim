/* Browser regression dashboard; eight isolated suites run sequentially. */
(function()
{
    'use strict';
    const suites = IGAsimTestSuites;
    const root = document.getElementById('suites');
    const runButton = document.getElementById('run');
    const state = document.getElementById('overall');
    const passedEl = document.getElementById('passed'), failedEl = document.getElementById('failed');
    const finishedEl = document.getElementById('finished');
    let token = 0;
    function rowFor(name)
    {
        const row = document.createElement('section');
        row.className = 'suite'; row.dataset.status = 'pending';
        const heading = document.createElement('div'); heading.className = 'suite-header';
        const label = document.createElement('strong'); label.textContent = name;
        const status = document.createElement('span'); status.textContent = 'Pending';
        heading.append(label, status);
        const details = document.createElement('details');
        const summary = document.createElement('summary'); summary.textContent = 'Test results';
        const log = document.createElement('pre');
        details.append(summary, log);row.append(heading,details);root.appendChild(row);
        return {row,status,details,log};
    }
    async function runAll()
    {
        const ownToken = ++token;
        runButton.disabled = true;
        root.replaceChildren();
        let pass = 0, fail = 0, finished = 0;
        passedEl.textContent = '0';failedEl.textContent = '0';
        finishedEl.textContent = '0 / ' + suites.length;state.textContent = 'Running...';
        const rows = new Map(suites.map(name => [name,rowFor(name)]));
        for (const name of suites)
        {
            if (ownToken !== token) return;
            const ui = rows.get(name);ui.status.textContent = 'Running';ui.row.dataset.status='running';
            const frame = document.createElement('iframe');
            frame.title = 'Regression suite: ' + name;
            frame.src = 'suite.html?suite=' + encodeURIComponent(name) + '&run=' + ownToken;
            document.body.appendChild(frame);
            const result = await new Promise(resolve =>
            {
                let complete = false;
                let timeoutId = null;
                function finish(p, f, message)
                {
                    if (complete) return;
                    complete = true;window.removeEventListener('message', onMessage);
                    if (timeoutId !== null) clearTimeout(timeoutId);
                    if (message) append('fail', message);
                    frame.remove();resolve({passed:p, failed:f});
                }
                function append(type, message)
                {
                    const entry = document.createElement('span');
                    entry.className = type === 'fail' ? 'fail' : type === 'pass' ? 'pass' : '';
                    entry.textContent = message + '\n';ui.log.appendChild(entry);
                    if (type === 'fail' && document.getElementById('details').checked) ui.details.open = true;
                }
                let p = 0, f = 0;
                function onMessage(event)
                {
                    if (event.source !== frame.contentWindow) return;
                    const data = event.data;
                    if (!data || data.channel !== 'IGAsimTestResultsV1' || data.suite !== name) return;
                    if (data.type === 'pass') { p++;append('pass','PASS ' + data.message); }
                    if (data.type === 'fail') { f++;append('fail','FAIL ' + data.message); }
                    if (data.type === 'log') append('log', data.message);
                    if (data.type === 'done') finish(data.passed, data.failed);
                }
                window.addEventListener('message', onMessage);
                frame.addEventListener('error', () => finish(p,f+1,'Test frame failed to load'));
                // Do not report success merely because a frame loads. The suite must signal done.
                // A timeout is a failure, never a pass.
                timeoutId = window.setTimeout(() => finish(p,f+1,'Suite timed out (30s)'), 30000);
            });
            pass += result.passed;fail += result.failed;finished++;
            passedEl.textContent = pass;failedEl.textContent = fail;
            finishedEl.textContent = finished + ' / ' + suites.length;
            ui.status.textContent = result.failed ? 'Failed (' + result.failed + ')' : 'Passed (' + result.passed + ')';
            ui.row.dataset.status = result.failed ? 'fail':'pass';
        }
        state.textContent = fail ? 'FAILED — ' + fail + ' failing checks' : 'PASSED — ' + pass + ' checks';
        runButton.disabled = false;
        window.IGAsimTestSummary = {passed:pass, failed:fail, suites:finished};
    }
    runButton.addEventListener('click', runAll);
    runAll();
})();
