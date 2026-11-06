/* Run all IGAsim regression suites: node test/run-all.js (from any working directory). */
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const suites = [
    'PS_TESTS.js',
    'PS_TESTS_v01.js',
    'ActiveDirectory.test.js',
    'AD_INTEGRATION_SMOKE.js',
    'ENTRA_CORE.test.js',
    'PS_GRAPH_TESTS.js',
    'PS_GRAPH_SAMPLES.test.js',
    'ENTITLEMENT_TESTS.js'
];

let failures = 0;
for (const suite of suites)
{
    console.log('\n=== ' + suite + ' ===');
    const result = spawnSync(process.execPath, [path.join(__dirname, suite)], {
        stdio: 'inherit'
    });
    if (result.error || result.status !== 0)
    {
        failures++;
        console.error('FAILED: ' + suite + (result.error ? ': ' + result.error.message : ''));
    }
}

if (failures)
{
    console.error('\n' + failures + ' of ' + suites.length + ' suites failed.');
    process.exitCode = 1;
}
else
{
    console.log('\nAll ' + suites.length + ' regression suites passed.');
}
