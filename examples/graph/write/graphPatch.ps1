# Update an attribute using Graph's REST-style endpoint
Connect-MgGraph -Scopes "User.ReadWrite.All"
Invoke-MgGraphRequest -Method PATCH -Uri '/v1.0/users/f0000000-0000-4000-8000-000000000101' -Body '{"jobTitle":"Platform Lead"}'
Get-MgUser -UserId ada.martin@northwind.example -Property "displayName,jobTitle"
