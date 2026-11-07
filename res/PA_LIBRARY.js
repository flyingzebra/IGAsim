/* NoCode JS Studio — sample workflow definitions with fictional identity data.
 * Classic browser constructor; each library instance owns its template metadata.
 */
function NoCodeWorkflowLibraryContainer()
{
    'use strict';

    const catalogEndpoint = '/v1.0/identityGovernance/entitlementManagement/catalogs';
    const packageEndpoint = '/v1.0/identityGovernance/entitlementManagement/accessPackages';

    // Inline, instance-owned catalog of available examples.
    const examples = [
        {
            id: 'inventory',
            label: 'Hybrid identity inventory',
            category: 'Read-only',
            description: 'Query simulated Entra users and Active Directory users in one workflow.'
        },
        {
            id: 'joiner',
            label: 'Joiner: AD provisioning',
            category: 'Directory writes',
            description: 'Move a fictional employee into Operations and update group membership.'
        },
        {
            id: 'catalog',
            label: 'Governance: create catalog',
            category: 'Graph CRUD',
            description: 'Connect to Graph, create a fictional access catalog, then check the response.'
        },
        {
            id: 'package',
            label: 'Governance: create access package',
            category: 'Graph CRUD',
            description: 'Create a new package in the built-in General catalog.'
        },
        {
            id: 'branch',
            label: 'Condition and variables',
            category: 'Logic',
            description: 'Show a true/false decision using only internal workflow state.'
        }
    ];

    function action(id, type, name, properties)
    {
        return { id, componentType: 'task', type, name, properties: properties || {} };
    }

    function trigger()
    {
        return action('trigger-manual', 'trigger', 'Manual trigger', { event: 'manual' });
    }

    function powershell(id, name, script)
    {
        return action(id, 'powershell', name, { script });
    }

    function graph(id, name, method, uri, body = '')
    {
        return action(id, 'graph', name, { method, uri, body });
    }

    function log(id, name, message)
    {
        return action(id, 'log', name, { message });
    }

    function variable(id, name, key, value, source = 'literal')
    {
        return action(id, 'setVariable', name, { name: key, value, source });
    }

    function condition(id, name, path, operator, value, yes, no)
    {
        return {
            id,
            componentType: 'switch',
            type: 'condition',
            name,
            properties: { path, operator, value },
            branches: { true: yes, false: no }
        };
    }

    function definition(name, sequence)
    {
        return { properties: { name }, sequence: [trigger(), ...sequence] };
    }

    // Private template methods; the public API returns independently cloned JSON definitions.
    const templates = {
        inventory: function()
        {
            return PowerAutomateJS.sampleDefinition();
        },
        joiner: function()
        {
            return definition('Joiner — fictional AD user', [
                powershell('joiner-department', 'Set department',
                    'Set-ADUser -Identity leo.chen -Department Operations'),
                powershell('joiner-group', 'Assign Operations group',
                    'Add-ADGroupMember -Identity BR_Operations -Members leo.chen'),
                powershell('joiner-verify', 'Verify AD changes',
                    'Get-ADUser -Identity leo.chen -Properties Department\nGet-ADGroupMember -Identity BR_Operations'),
                log('joiner-complete', 'Finish',
                    'AD changes exist in the current in-memory sandbox only.')
            ]);
        },
        catalog: function()
        {
            return definition('Create an access catalog', [
                powershell('catalog-connect', 'Connect simulated Graph',
                    'Connect-MgGraph -Scopes "EntitlementManagement.ReadWrite.All"'),
                graph('catalog-create', 'Create catalog', 'POST', catalogEndpoint,
                    '{"displayName":"Studio Demo Catalog","description":"NoCode JS simulation"}'),
                condition('catalog-status', 'Created?', 'lastStatus', 'eq', '201',
                    [log('catalog-success', 'Catalog created', 'New fictional catalog ID: ${last.id}')],
                    [log('catalog-rejected', 'Unexpected response', 'Graph returned ${lastStatus}')]),
                graph('catalog-read', 'List catalogs', 'GET', catalogEndpoint),
                log('catalog-done', 'Complete', 'Catalogs listed successfully (HTTP ${lastStatus}).')
            ]);
        },
        package: function()
        {
            return definition('Create an access package', [
                powershell('package-connect', 'Connect simulated Graph',
                    'Connect-MgGraph -Scopes "EntitlementManagement.ReadWrite.All"'),
                graph('package-create', 'Create access package', 'POST', packageEndpoint,
                    '{"displayName":"Studio Demo Package","description":"Simulated access bundle","catalog":{"id":"f0000000-0000-4000-8000-000000001001"}}'),
                variable('package-id', 'Remember created ID', 'createdPackageId', 'last.id', 'path'),
                graph('package-get', 'List access packages', 'GET', packageEndpoint),
                log('package-done', 'Complete',
                    'Created package ${variables.createdPackageId}; HTTP ${lastStatus}.')
            ]);
        },
        branch: function()
        {
            return definition('Evaluate workflow variables', [
                variable('logic-set', 'Set onboarding stage', 'stage', 'approved'),
                condition('logic-if', 'Manager approved?', 'variables.stage', 'eq', 'approved',
                    [log('logic-yes', 'Approved path', 'Manager approved: continue provisioning.')],
                    [log('logic-no', 'Rejected path', 'Approval missing: do not provision.')]),
                log('logic-done', 'Complete', 'Decision recorded in the execution trace.')
            ]);
        }
    };

    this.version = '0.2';
    this.list = function()
    {
        return examples.map(item => Object.assign({}, item));
    };

    this.get = function(id)
    {
        if (!Object.prototype.hasOwnProperty.call(templates, id))
        {
            throw new Error('Unknown studio example: ' + id);
        }
        const document = templates[id]();
        PowerAutomateJS.assertValid(document);
        return JSON.parse(JSON.stringify(document));
    };

    Object.freeze(this);
}

var NoCodeWorkflowLibrary = new NoCodeWorkflowLibraryContainer();
