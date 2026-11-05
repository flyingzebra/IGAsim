# Changes are only in memory: Reset sandbox restores the original state
Connect-MgGraph -Scopes "User.ReadWrite.All"
Get-MgUser -UserId chloe.rivera@northwind.example -Property "displayName,accountEnabled"
Update-MgUser -UserId chloe.rivera@northwind.example -AccountEnabled $true -PassThru
Get-MgUser -UserId chloe.rivera@northwind.example -Property "displayName,accountEnabled"
