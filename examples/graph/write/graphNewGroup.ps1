# Create a cloud security group and inspect it
Connect-MgGraph -Scopes "Group.ReadWrite.All"
New-MgGroup -DisplayName "Project Sunset" -MailNickname project-sunset -MailEnabled $false -SecurityEnabled $true -GroupTypes ""
Get-MgGroup -Filter "displayName eq 'Project Sunset'"
