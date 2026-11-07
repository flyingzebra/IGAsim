/* Browser-only layout regression: real COM_TERM + production IGAsim styles.
   No Node.js, network, parser or simulated-directory state is required. */
'use strict';

async function terminalScrollingSuite()
{
    let passed = 0;
    async function test(name, callback)
    {
        try { await callback(); console.log('PASS ' + name); passed++; }
        catch (error) { console.error('FAIL ' + name, error.stack || error); }
    }

    // The ordinary test/app-fixture.js supplies a fake TERMINAL for app
    // bootstrap checks. Use a separate browser realm with the real terminal.
    // The stylesheet links are part of the actual production application.
    const isolated = await BrowserTest.realm(['../res/COM_TERM.js'],
        '<link rel="stylesheet" href="../res/COM_TERM.css">' +
        '<link rel="stylesheet" href="../res/PS_APP.css">' +
        '<div class="terminal-shell" style="width:520px;height:300px">' +
        '<div id="terminal"></div></div>');

    try
    {
        // BrowserTest.realm defaults to a hidden iframe. Layout tests need a
        // rendered frame; park it off-screen without setting display:none.
        isolated.frame.hidden = false;
        isolated.frame.style.cssText =
            'position:fixed;left:-10000px;top:0;width:650px;height:420px;border:0;';
        const doc = isolated.document;
        const win = isolated.window;
        await new Promise(resolve => win.setTimeout(resolve, 0));
        assert.equal(typeof win.TERMINAL, 'function', 'Real terminal script did not load');

        const terminal = new win.TERMINAL({
            container: 'terminal', storageKey: 'IGAsimTerminalScrollRegression',
            prompt: 'PS C:\\Users\\Demo', separator: '&gt;', welcome: ''
        });
        const root = doc.getElementById('terminal');
        const viewport = root.querySelector('.container');
        const output = root.querySelector('output');
        const shell = root.closest('.terminal-shell');
        const widthBefore = shell.getBoundingClientRect().width;
        const originalPanelWidth = root.getBoundingClientRect().width;

        await test('terminal viewport scrolls horizontally and vertically', () =>
        {
            const css = win.getComputedStyle(viewport);
            assert.equal(css.overflowX, 'auto');
            assert.equal(css.overflowY, 'auto');
        });

        const distinguishedName =
            'CN=Very Long Demonstration User,OU=Deeply Nested Business Units,' +
            'OU=Fictional Engineering,OU=Users,DC=corp,DC=example,DC=com';
        terminal.write(distinguishedName.repeat(5) + '\n', 'rx');

        await test('wide LDAP distinguished name is unwrapped and scrollable', () =>
        {
            const span = output.querySelector('span.serial-rx');
            assert.ok(span, 'Missing streamed text');
            assert.equal(win.getComputedStyle(span).whiteSpace, 'pre');
            assert.equal(win.getComputedStyle(span).overflowWrap, 'normal');
            assert.ok(viewport.scrollWidth > viewport.clientWidth + 100,
                'Expected a horizontal overflow wider than the viewport');
        });

        await test('wide output does not change existing terminal panel width', () =>
        {
            assert.equal(shell.getBoundingClientRect().width, widthBefore);
            assert.equal(root.getBoundingClientRect().width, originalPanelWidth);
        });

        await test('preformatted AD/Graph table preserves all columns', () =>
        {
            terminal.output('<pre>Name'.padEnd(160, ' ') + 'DistinguishedName</pre>');
            const pre = output.querySelector('pre');
            assert.ok(pre);
            assert.equal(win.getComputedStyle(pre).whiteSpace, 'pre');
            assert.ok(viewport.scrollWidth > viewport.clientWidth);
        });

        // Let pending MutationObserver/autofocus work from the fixture settle
        // before measuring a deliberate user scroll position.
        await new Promise(resolve => win.setTimeout(resolve, 60));
        // Set a meaningful horizontal offset so an implicit scrollIntoView()
        // would incorrectly move the view back toward the prompt on the left.
        viewport.scrollLeft = 260;
        const leftBefore = viewport.scrollLeft;
        await test('new streamed output preserves horizontal scroll position', async () =>
        {
            assert.ok(leftBefore > 0, 'Could not scroll horizontally');
            terminal.write('A new directory entry arrived\n', 'rx');
            await new Promise(resolve => win.setTimeout(resolve, 35));
            assert.equal(viewport.scrollLeft, leftBefore);
        });

        await test('command submission remains usable while horizontally scrolled', async () =>
        {
            terminal.onInput(() => true);
            const input = root.querySelector('.command .input');
            input.value = 'Get-ADUser -Filter *';
            input.dispatchEvent(new win.KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', bubbles: true, cancelable: true
            }));
            await new Promise(resolve => win.setTimeout(resolve, 35));
            assert.ok(output.querySelector('.line'), 'Command echo was lost');
            assert.equal(input.value, '');
            assert.equal(viewport.scrollLeft, leftBefore);
        });

        await test('vertical auto-scroll remains functional with tall output', async () =>
        {
            terminal.write(('additional simulated row\n').repeat(100), 'rx');
            await new Promise(resolve => win.setTimeout(resolve, 35));
            assert.ok(viewport.scrollHeight > viewport.clientHeight,
                'Expected vertical overflow');
            assert.ok(viewport.scrollTop > 0, 'Expected terminal to bring input into view');
            assert.equal(viewport.scrollLeft, leftBefore);
        });
    }
    finally { isolated.close(); }
    console.log(passed + ' terminal scrolling regression checks passed.');
}

terminalScrollingSuite()
    .then(() => BrowserTest.done())
    .catch(error => BrowserTest.crash(error));
