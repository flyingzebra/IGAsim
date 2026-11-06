/* Whitelist suite names; never convert arbitrary URL input into a script URL. */
(function()
{
    const suites = IGAsimTestSuites;
    const name = new URLSearchParams(location.search).get('suite');
    if (!suites.includes(name)) { BrowserTest.crash(new Error('Unknown test suite')); return; }
    const script = document.createElement('script');
    script.src = name;
    script.onerror = function() { BrowserTest.crash(new Error('Unable to load ' + name)); };
    document.body.appendChild(script);
})();
