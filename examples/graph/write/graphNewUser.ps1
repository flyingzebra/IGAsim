# Create a fictional user; password is not persisted by the simulator
Connect-MgGraph -Scopes "User.ReadWrite.All"
New-MgUser -DisplayName "Dana Owens" -UserPrincipalName dana@northwind.example -MailNickname dana -AccountEnabled $true -PasswordProfile '{"password":"SIMULATED-PASSWORD"}'
Get-MgUser -UserId dana@northwind.example -Property "id,displayName,userPrincipalName,accountEnabled"
