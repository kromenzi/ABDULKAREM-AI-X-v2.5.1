$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
Write-Host "=== ABDULKAREM AI X v2.5.1 — Windows Release Check ===" -ForegroundColor Cyan

$npm = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $npm) { throw "npm.cmd not found." }

$lock = Join-Path $Root "package-lock.json"
if (-not (Test-Path -LiteralPath $lock -PathType Leaf)) {
  Write-Host "[1/6] Lockfile missing -> generating from exact direct dependency pins..." -ForegroundColor Yellow
  & $npm.Source install --package-lock-only --save-exact
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $lock -PathType Leaf)) { throw "package-lock.json generation failed." }
} else {
  Write-Host "[1/6] package-lock.json present." -ForegroundColor Green
}

Write-Host "[2/6] Clean install with npm ci..." -ForegroundColor Yellow
& $npm.Source ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }

Write-Host "[3/6] Windows + regression checks..." -ForegroundColor Yellow
& $npm.Source run check
if ($LASTEXITCODE -ne 0) { throw "npm run check failed." }

Write-Host "[4/6] Production build..." -ForegroundColor Yellow
& $npm.Source run build
if ($LASTEXITCODE -ne 0) { throw "npm run build failed." }

Write-Host "[5/6] Production dependency audit (HIGH/CRITICAL block)..." -ForegroundColor Yellow
& $npm.Source audit --omit=dev --audit-level=high
if ($LASTEXITCODE -ne 0) { throw "npm audit found HIGH/CRITICAL vulnerabilities or registry audit failed. Review output before release." }

Write-Host "[6/6] Bundle evidence..." -ForegroundColor Yellow
$manifest = Join-Path $Root "dist\.vite\manifest.json"
if (Test-Path -LiteralPath $manifest) {
  $m = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
  $entryProp = $m.PSObject.Properties | Where-Object { $_.Value.isEntry -eq $true } | Select-Object -First 1
  if ($entryProp) {
    $entryPath = Join-Path $Root ("dist\" + ($entryProp.Value.file -replace '/', '\'))
    if (Test-Path -LiteralPath $entryPath) {
      $entry = Get-Item -LiteralPath $entryPath
      $kb = [math]::Round($entry.Length / 1KB, 1)
      Write-Host "Entry JS: $($entry.Name) — $kb KB" -ForegroundColor Cyan
      if ($entry.Length -gt 700KB) { Write-Host "WARN: entry bundle remains above 700 KB; review lazy-loading/chunking." -ForegroundColor DarkYellow }
    }
  }
}

Write-Host "Windows Release Check PASS." -ForegroundColor Green
Write-Host "Next: launch START-WINDOWS.bat and validate Electron UI/API smoke tests." -ForegroundColor Cyan
