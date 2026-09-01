$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$npm = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $npm) { throw "npm.cmd was not found." }
Write-Host "=== ABDULKAREM AI X v2.5.1 Dependency Lock ===" -ForegroundColor Cyan
Write-Host "Direct dependencies are exact-pinned in package.json." -ForegroundColor DarkGray
& $npm.Source install --package-lock-only --save-exact
if ($LASTEXITCODE -ne 0) { throw "Failed to generate package-lock.json." }
& $npm.Source ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed against the generated lockfile." }
& $npm.Source run check:windows
if ($LASTEXITCODE -ne 0) { throw "Windows stability checks failed." }
Write-Host "Dependency lock generated and verified." -ForegroundColor Green
