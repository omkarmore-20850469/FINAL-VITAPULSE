$ErrorActionPreference = 'Stop'
Set-Location "$PSScriptRoot\vitapulse-dotnet"
dotnet restore
if ($LASTEXITCODE -ne 0) { throw 'dotnet restore failed.' }
dotnet run
