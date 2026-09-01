$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
Write-Host "=== ABDULKAREM AI X v2.5.1 - Windows Stability EXE Builder ===" -ForegroundColor Cyan
$npm = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $npm) { throw "npm.cmd was not found. Install Node.js first." }
$lock = Join-Path $Root "package-lock.json"
if (-not (Test-Path -LiteralPath $lock -PathType Leaf)) {
  Write-Host "package-lock.json not found. Creating it once from exact direct dependency pins..." -ForegroundColor Yellow
  & $npm.Source install --package-lock-only --save-exact
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $lock -PathType Leaf)) { throw "Could not create package-lock.json. Stable EXE build aborted." }
}
Write-Host "Running clean npm ci from package-lock.json..." -ForegroundColor Yellow
& $npm.Source ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }
Write-Host "[1/3] Running Windows Stability + Release Evaluation Gate..." -ForegroundColor Yellow
& $npm.Source run release:gate
if ($LASTEXITCODE -ne 0) { throw "Release Evaluation Gate BLOCKED this build." }
Write-Host "[2/3] Building production UI..." -ForegroundColor Yellow
& $npm.Source run build
if ($LASTEXITCODE -ne 0) { throw "Vite build failed." }
Write-Host "[3/3] Building NSIS x64 installer..." -ForegroundColor Yellow
& $npm.Source run dist:win
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed." }
$Release = Join-Path $Root "release"
Write-Host ""; Write-Host "Installer build completed." -ForegroundColor Green
Write-Host "Output folder: $Release" -ForegroundColor Cyan
Get-ChildItem $Release -File -ErrorAction SilentlyContinue | Select-Object Name,Length,LastWriteTime | Format-Table -AutoSize
