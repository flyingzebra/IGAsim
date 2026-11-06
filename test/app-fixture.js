/* DOM and terminal double for exercising the real res/PS_APP.js bootstrap. */
function TERMINAL(options)
{
    this.lines = [];
    this.onInput = function(callback) { this.callback = callback; };
    this.pushPrompt = function() {};
    this.write = function(line) { this.lines.push(String(line)); };
    this.clear = function() { this.lines = []; };
}
(function()
{
    const ids = ['terminal','status','script','entry-count','run','reset','inspect','copy','ast-output','ast-details'];
    for (const id of ids)
    {
        const el = document.createElement(id === 'script' ? 'textarea' : 'div');
        el.id = id;
        document.body.appendChild(el);
    }
    const keys = ['adUsers','ldap','groups','modify','logic','files','graph',
        'graphTenant','graphITUsers','graphPaging','graphMembership','graphRoles',
        'graphApplications','graphRequest','graphHybrid','graphEnable','graphNewUser',
        'graphNewGroup','graphMembershipEdit','graphPatch','graphAppRegistration',
        'govCatalogRead','govPackageRead','govCatalogCreate','govCatalogUpdate',
        'govCatalogDelete','govPackageCreate','govPackageUpdate','govPackageDelete','govLifecycle'];
    for (const key of keys)
    {
        const button = document.createElement('button');
        button.dataset.example = key;
        button.textContent = key;
        document.body.appendChild(button);
    }
})();
