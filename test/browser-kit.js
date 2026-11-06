/* Browser-only test utilities. Works from file:// with ordinary classic script includes. */
function BrowserTestContainer()
{
    'use strict';
    const suite = new URLSearchParams(location.search).get('suite') || 'unknown';
    const consoleLog = console.log.bind(console);
    const consoleError = console.error.bind(console);
    let passed = 0, failed = 0, completed = false;
    const sourceFrame = window.parent;
    function send(type, details)
    {
        if (sourceFrame !== window)
            sourceFrame.postMessage({channel: 'IGAsimTestResultsV1', suite, type, ...details}, '*');
    }
    function fmt(value) { return value instanceof Error ? (value.stack || value.message) : String(value); }
    console.log = function(...args)
    {
        consoleLog(...args);
        const msg = args.map(fmt).join(' ');
        if (/^PASS(?:\s|$)/.test(msg))
        {
            passed++;
            send('pass', {message: msg.replace(/^PASS\s*/, '')});
        }
        else send('log', {message: msg});
    };
    console.error = function(...args)
    {
        consoleError(...args);
        failed++;
        send('fail', {message: args.map(fmt).join(' ')});
    };
    this.fail = function(error)
    {
        console.error(error instanceof Error ? error.stack || error.message : error);
    };
    this.done = function()
    {
        if (completed) return;
        completed = true;
        window.IGAsimSuiteResult = {passed, failed, completed: true};
        send('done', {passed, failed});
    };
    this.crash = function(error) { this.fail(error); this.done(); };
    window.addEventListener('error', event => this.crash(event.error || event.message));
    window.addEventListener('unhandledrejection', event => this.crash(event.reason));

    /* Load real browser scripts into a fresh frame for isolation tests (no VM or eval). */
    this.realm = function(files, body = '')
    {
        const frame = document.createElement('iframe');
        frame.hidden = true;
        const tags = files.map(name => `<script src="${name}"></script>`).join('');
        // srcdoc inherits the page base URL and can resolve ../res/*.js on file://.
        frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><base href="' +
            document.baseURI.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"></head><body>' +
            body + tags + '</body></html>';
        return new Promise((resolve, reject) =>
        {
            frame.onload = function()
            {
                const child = frame.contentWindow;
                if (!child) reject(new Error('Could not access isolated script frame'));
                else resolve({window: child, document: frame.contentDocument, frame,
                    close() { frame.remove(); }});
            };
            frame.onerror = () => reject(new Error('Could not load isolated script frame'));
            document.body.appendChild(frame);
        });
    };
    this.appButton = function(key) { return document.querySelector('[data-example="' + key + '"]'); };
    this.runExample = async function(key)
    {
        const button = this.appButton(key);
        assert.ok(button, 'Missing sample button: ' + key);
        button.click();
        const reply = await PowerShellJSApp.adapter.submit(PowerShellJSApp.editor.value);
        return reply;
    };
};
var BrowserTest = new BrowserTestContainer();
