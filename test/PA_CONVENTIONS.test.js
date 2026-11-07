/* Browser regression: public constructor APIs and instance-owned workflow state. */
'use strict';
(async function()
{
    let passed = 0;
    async function check(name, callback)
    {
        try
        {
            await callback();
            console.log('PASS ' + name);
            passed++;
        }
        catch (error)
        {
            console.error('FAIL ' + name, error);
        }
    }

    await check('Public browser containers are named constructor functions', function()
    {
        assert.equal(typeof PowerAutomateCore, 'function');
        assert.equal(typeof NoCodeWorkflowLibraryContainer, 'function');
        assert.equal(PowerAutomateCore.name, 'PowerAutomateCore');
        assert.equal(NoCodeWorkflowLibraryContainer.name, 'NoCodeWorkflowLibraryContainer');
    });

    await check('Existing PowerAutomateJS API stays compatible', function()
    {
        assert.equal(PowerAutomateJS.version, '0.1');
        assert.equal(typeof PowerAutomateJS.WorkflowEngine, 'function');
        for (const name of ['assertValid','sampleDefinition','interpolate'])
        {
            assert.ok(Object.prototype.hasOwnProperty.call(PowerAutomateJS, name));
        }
        assert.ok(Object.isFrozen(PowerAutomateJS));
    });

    await check('Public engine method belongs directly to each instance', function()
    {
        const fake = {execute: async () => ({success:true,objects:[],output:[],errors:[]})};
        const first = new PowerAutomateJS.WorkflowEngine({powershell:fake});
        const second = new PowerAutomateJS.WorkflowEngine({powershell:fake});
        assert.ok(Object.prototype.hasOwnProperty.call(first, 'run'));
        assert.ok(Object.prototype.hasOwnProperty.call(second, 'run'));
        assert.ok(!Object.prototype.hasOwnProperty.call(PowerAutomateJS.WorkflowEngine.prototype, 'run'));
        assert.equal(first.running, false);
        assert.equal(second.running, false);
    });

    await check('Two engines maintain independent run state and variables', async function()
    {
        const fake = {execute: async () => ({success:true,objects:[],output:[],errors:[]})};
        const first = new PowerAutomateJS.WorkflowEngine({powershell:fake});
        const second = new PowerAutomateJS.WorkflowEngine({powershell:fake});
        const definition = {
            properties: {},
            sequence: [
                {id:'trigger',componentType:'task',type:'trigger',name:'Start',properties:{event:'manual'}},
                {id:'var',componentType:'task',type:'setVariable',name:'Set',properties:{name:'x',value:'7'}}
            ]
        };
        const a = await first.run(definition);
        const b = await second.run(definition);
        assert.equal(a.status, 'success', a.error);
        assert.equal(b.status, 'success', b.error);
        a.state.variables.x = 99;
        assert.equal(b.state.variables.x, 7);
        assert.notEqual(a.trace, b.trace);
    });

    await check('Library metadata and definitions are per-instance and cloned', function()
    {
        const first = new NoCodeWorkflowLibraryContainer();
        const second = new NoCodeWorkflowLibraryContainer();
        assert.equal(first.list().length, 5);
        assert.equal(second.list().length, 5);
        first.list()[0].label = 'CHANGED';
        assert.notEqual(second.list()[0].label, 'CHANGED');
        const a = first.get('branch');
        a.sequence[1].name = 'MUTATED';
        assert.notEqual(first.get('branch').sequence[1].name, 'MUTATED');
    });

    await check('Container constructor source has no wrapper or runtime module dependency', function()
    {
        for (const constructor of [PowerAutomateCore, NoCodeWorkflowLibraryContainer])
        {
            const source = constructor.toString();
            assert.doesNotMatch(source, /\b(?:module\.exports|export\s+default|require\s*\(|fetch\s*\(|eval\s*\()/);
            assert.doesNotMatch(source, /\bglobalThis\b/);
        }
    });

    console.log('\n' + passed + ' PA convention checks passed.');
})().then(() => BrowserTest.done()).catch(error => BrowserTest.crash(error));
