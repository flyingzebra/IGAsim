# Add a new direct group member, inspect, then undo
Connect-MgGraph -Scopes "GroupMember.ReadWrite.All"
New-MgGroupMemberByRef -GroupId f0000000-0000-4000-8000-000000000201 -DirectoryObjectId f0000000-0000-4000-8000-000000000102
Get-MgGroupMember -GroupId f0000000-0000-4000-8000-000000000201 | Select-Object displayName,id
Remove-MgGroupMemberByRef -GroupId f0000000-0000-4000-8000-000000000201 -DirectoryObjectId f0000000-0000-4000-8000-000000000102
Get-MgGroupMember -GroupId f0000000-0000-4000-8000-000000000201 | Select-Object displayName,id
