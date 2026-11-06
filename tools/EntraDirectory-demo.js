/* Offline Entra demo controls, shared with browser regression fixtures. */
var oEntra = new EntraDirectory();
    var examples = [
        { label: 'List users', method: 'GET', endpoint: '/v1.0/users', body: '' },
        { label: 'IT users (OData filter)', method: 'GET',
          endpoint: "/v1.0/users?$filter=department eq 'IT'&$select=id,displayName,department", body: '' },
        { label: 'List groups', method: 'GET', endpoint: '/v1.0/groups', body: '' },
        { label: 'Nested group members', method: 'GET',
          endpoint: '/v1.0/groups/f0000000-0000-4000-8000-000000000202/transitiveMembers', body: '' },
        { label: 'First user page (nextLink)', method: 'GET', endpoint: '/v1.0/users?$top=1', body: '' },
        { label: 'Directory roles', method: 'GET', endpoint: '/v1.0/directoryRoles', body: '' },
        { label: 'Applications', method: 'GET', endpoint: '/v1.0/applications', body: '' },
        { label: 'Disable Ada (PATCH)', method: 'PATCH',
          endpoint: '/v1.0/users/f0000000-0000-4000-8000-000000000101',
          body: '{"accountEnabled":false}' },
        { label: 'Add Ben to SG-IT (POST $ref)', method: 'POST',
          endpoint: '/v1.0/groups/f0000000-0000-4000-8000-000000000201/members/$ref',
          body: '{"@odata.id":"https://graph.microsoft.com/v1.0/directoryObjects/f0000000-0000-4000-8000-000000000102"}' }
    ];
    var exampleSelect = document.getElementById('examples');
    var methodSelect = document.getElementById('method');
    var endpointInput = document.getElementById('endpoint');
    var bodyInput = document.getElementById('body');
    var output = document.getElementById('output');
    var statusNode = document.getElementById('status');

    for (var index = 0; index < examples.length; index++)
    {
        var option = document.createElement('option');
        option.value = String(index);
        option.textContent = examples[index].label;
        exampleSelect.appendChild(option);
    }
    function applyExample()
    {
        var example = examples[Number(exampleSelect.value)];
        methodSelect.value = example.method;
        endpointInput.value = example.endpoint;
        bodyInput.value = example.body;
    }
    exampleSelect.addEventListener('change', applyExample);
    document.getElementById('send').addEventListener('click', function()
    {
        var request = { headers: { ConsistencyLevel: 'eventual' } };
        try
        {
            if (bodyInput.value.trim()) request.body = JSON.parse(bodyInput.value);
            var response = oEntra.Graph(methodSelect.value, endpointInput.value, request);
            output.textContent = JSON.stringify(response, null, 2);
            statusNode.textContent = 'Simulated HTTP ' + response.status;
            statusNode.style.color = response.status >= 400 ? '#f8a6a6' : '#8fd3a2';
        }
        catch (error)
        {
            statusNode.textContent = 'Invalid JSON body';
            statusNode.style.color = '#f8a6a6';
            output.textContent = String(error.message || error);
        }
    });
    document.getElementById('reset').addEventListener('click', function()
    {
        oEntra.Reset();
        statusNode.textContent = 'Fictional tenant reset';
        statusNode.style.color = '#8fd3a2';
        output.textContent = 'Directory state restored to the original inline fixture.';
    });
    applyExample();
