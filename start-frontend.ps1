$ErrorActionPreference = 'Stop'
Set-Location "$PSScriptRoot\vitapulse-angular20"
if (!(Test-Path 'node_modules')) { npm install; if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' } }
npm start
