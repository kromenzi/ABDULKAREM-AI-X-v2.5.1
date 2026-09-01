$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "=== ABDULKAREM AI X v2.0 ONE-CLICK START ===" -ForegroundColor Cyan

Write-Host "[1/3] Verifying models..." -ForegroundColor Yellow
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "VERIFY-MODELS.ps1")
if ($LASTEXITCODE -ne 0) { throw "Model verification failed." }

if (-not (Test-Path -LiteralPath (Join-Path $Root "node_modules") -PathType Container)) {
  Write-Host "[2/3] First run detected. Installing dependencies..." -ForegroundColor Yellow
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "INSTALL-WINDOWS.ps1")
  if ($LASTEXITCODE -ne 0) { throw "Installation failed." }
} else {
  Write-Host "[2/3] Dependencies already installed." -ForegroundColor Green
}

Write-Host "[3/3] Starting ABDULKAREM AI X..." -ForegroundColor Yellow
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "RUN-WINDOWS.ps1")
