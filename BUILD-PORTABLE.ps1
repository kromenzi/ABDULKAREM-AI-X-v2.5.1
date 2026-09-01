$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$npm = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $npm) { throw "npm.cmd was not found." }
$lock = Join-Path $Root "package-lock.json"
if (-not (Test-Path -LiteralPath $lock -PathType Leaf)) {
  Write-Host "package-lock.json not found. Creating it from exact direct pins..." -ForegroundColor Yellow
  & $npm.Source install --package-lock-only --save-exact
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $lock -PathType Leaf)) { throw "Could not create package-lock.json." }
}
Write-Host "Running clean npm ci from package-lock.json..." -ForegroundColor Yellow
& $npm.Source ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }
& $npm.Source run release:gate
if ($LASTEXITCODE -ne 0) { throw "Release Gate BLOCKED portable build." }
& $npm.Source run dist:portable
if ($LASTEXITCODE -ne 0) { throw "Portable build failed." }
Write-Host "Portable build completed: $Root\release" -ForegroundColor Green
