$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "=== ABDULKAREM AI X v2.5.1 - Windows Stability Installer ===" -ForegroundColor Cyan

function Require-App([string]$ExeName, [string]$HelpText) {
  $cmd = Get-Command $ExeName -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $cmd) {
    throw "$ExeName was not found. $HelpText"
  }
  return $cmd.Source
}

function Get-OllamaExe {
  $preferred = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
  if (Test-Path -LiteralPath $preferred -PathType Leaf) {
    return (Resolve-Path -LiteralPath $preferred).Path
  }

  $cmd = Get-Command ollama.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd -and $cmd.Source -and $cmd.Source.ToLower().EndsWith(".exe") -and (Test-Path -LiteralPath $cmd.Source -PathType Leaf)) {
    return $cmd.Source
  }

  throw "Ollama executable was not found. Install Ollama or verify: $preferred"
}

$NodeExe = Require-App "node.exe" "Install Node.js 20 or newer."
$NpmExe = Require-App "npm.cmd" "npm is installed with Node.js."

$PythonExe = $null
foreach ($candidate in @("python.exe", "py.exe")) {
  $p = Get-Command $candidate -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($p) { $PythonExe = $p.Source; break }
}
if (-not $PythonExe) {
  throw "Python was not found. Install Python 3.11 or newer and add it to PATH."
}

$OllamaExe = Get-OllamaExe
Write-Host "Node:   $NodeExe" -ForegroundColor DarkGray
Write-Host "npm:    $NpmExe" -ForegroundColor DarkGray
Write-Host "Python: $PythonExe" -ForegroundColor DarkGray
Write-Host "Ollama: $OllamaExe" -ForegroundColor DarkGray

Write-Host "[1/7] Installing locked Node dependencies..." -ForegroundColor Yellow
$LockFile = Join-Path $Root "package-lock.json"
if (Test-Path -LiteralPath $LockFile -PathType Leaf) {
  Write-Host "package-lock.json found -> npm ci" -ForegroundColor DarkGray
  & $NpmExe ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
} else {
  Write-Host "package-lock.json not found. Bootstrapping it once from exact direct dependency pins..." -ForegroundColor DarkYellow
  & $NpmExe install --save-exact
  if ($LASTEXITCODE -ne 0) { throw "npm install lock bootstrap failed with exit code $LASTEXITCODE" }
  if (-not (Test-Path -LiteralPath $LockFile -PathType Leaf)) { throw "npm did not create package-lock.json; stable build aborted." }
  Write-Host "Lockfile created. Reinstalling cleanly with npm ci..." -ForegroundColor DarkGray
  & $NpmExe ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci after lock bootstrap failed with exit code $LASTEXITCODE" }
}

Write-Host "[2/7] Security audit (high/critical gate when registry is reachable)..." -ForegroundColor Yellow
& $NpmExe audit --audit-level=high
if ($LASTEXITCODE -ne 0) {
  Write-Host "npm audit returned a non-zero result. Review the audit output; no --force fix is applied automatically." -ForegroundColor DarkYellow
}

Write-Host "[3/7] Installing Python dependencies..." -ForegroundColor Yellow
if ([System.IO.Path]::GetFileName($PythonExe).ToLower() -eq "py.exe") {
  & $PythonExe -3 -m pip install --upgrade pip
  if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed with exit code $LASTEXITCODE" }
  & $PythonExe -3 -m pip install -r requirements.txt
} else {
  & $PythonExe -m pip install --upgrade pip
  if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed with exit code $LASTEXITCODE" }
  & $PythonExe -m pip install -r requirements.txt
}
if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed with exit code $LASTEXITCODE" }

Write-Host "[4/7] Running Windows Stability + Agent Test Lab Release Gate..." -ForegroundColor Yellow
& $NpmExe run release:gate
if ($LASTEXITCODE -ne 0) { throw "Release Evaluation Gate BLOCKED installation build with exit code $LASTEXITCODE" }
Write-Host "[5/7] Building the v2.5.1 UI (Test Lab + Intelligence Core + Parallel Lanes + Transactions + Resource Governor + Recovery + Automation + Workflow + Multi-Agent)..." -ForegroundColor Yellow
& $NpmExe run build
if ($LASTEXITCODE -ne 0) { throw "Vite production build failed with exit code $LASTEXITCODE" }
Write-Host "UI build passed." -ForegroundColor Green

Write-Host "[6/7] Checking Ollama server..." -ForegroundColor Yellow
try {
  $null = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/version" -TimeoutSec 3
  Write-Host "Ollama server is running." -ForegroundColor Green
} catch {
  Write-Host "Ollama server is not running. Starting it now..." -ForegroundColor DarkYellow
  Start-Process -WindowStyle Hidden -FilePath $OllamaExe -ArgumentList "serve"
  Start-Sleep -Seconds 4
  try {
    $null = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/version" -TimeoutSec 4
    Write-Host "Ollama server started." -ForegroundColor Green
  } catch {
    Write-Host "Could not confirm Ollama server. You can start Ollama manually and continue." -ForegroundColor Yellow
  }
}

Write-Host "[7/7] Checking Smart Router models..." -ForegroundColor Yellow
$InstalledModels = (& $OllamaExe list 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw "ollama list failed:`n$InstalledModels" }

$ProtectedModel = "qwen3-coder:30b"
$GeneralModel = "abdulkarem-general-sa:v2"

if ($InstalledModels -match [regex]::Escape($ProtectedModel)) {
  Write-Host "Coding model ready: $ProtectedModel (PROTECTED)" -ForegroundColor Green
} else {
  Write-Host "Coding model missing: $ProtectedModel" -ForegroundColor Yellow
}

if ($InstalledModels -match [regex]::Escape($GeneralModel)) {
  Write-Host "Saudi general model ready: $GeneralModel" -ForegroundColor Green
} else {
  Write-Host "Saudi general model missing: $GeneralModel" -ForegroundColor Yellow
  Write-Host "The app can fall back to qwen3:8b when available." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Installation finished. No Ollama model was deleted or replaced." -ForegroundColor Green
Write-Host "Vision model priority: gemma4:26b (optional fallback: qwen3-vl:8b)" -ForegroundColor Cyan
Write-Host "Knowledge RAG works without an embedding model; Hybrid Search activates automatically when qwen3-embedding/nomic/mxbai/bge-m3 is installed." -ForegroundColor Cyan
Write-Host "Deep Research: SearXNG is optional; DuckDuckGo fallback works without an API key. Brave Search can be enabled with BRAVE_SEARCH_API_KEY in .env." -ForegroundColor Cyan
if (-not (Test-Path -LiteralPath (Join-Path $Root ".env") -PathType Leaf) -and (Test-Path -LiteralPath (Join-Path $Root ".env.example") -PathType Leaf)) {
  Copy-Item -LiteralPath (Join-Path $Root ".env.example") -Destination (Join-Path $Root ".env")
  Write-Host "Created .env from .env.example." -ForegroundColor DarkGray
}
Write-Host "Coding Agent: Monaco editor, interactive PowerShell terminal, Git, project runner and browser verification are included." -ForegroundColor Cyan
Write-Host "Multi-Agent: Orchestrator, Coder, Researcher, Office, Vision, Data, Reviewer and Verifier are included." -ForegroundColor Cyan
Write-Host "Skills: built-in skills are loaded from .\skills and user skills can be added later." -ForegroundColor Cyan
Write-Host "MCP: client SDK is installed with npm. Configure servers from the Agents panel -> Open MCP config." -ForegroundColor Cyan
Write-Host "v2.5.1: Windows Stability Hotfix + Agent Test Lab + Release Gate + Regression Baseline + Production Intelligence Core + Parallel Lanes + Transactional Rollback + Resource Governor + Recovery + Automation + Workflow + Approval-Gated Cloud Actions + Memory are included." -ForegroundColor Cyan
Write-Host "Integration Hub uses official CLI sessions and does not store cloud tokens in the project." -ForegroundColor Cyan
Write-Host "Start the app with START-WINDOWS.bat" -ForegroundColor Cyan
Write-Host "Build a Windows installer later with BUILD-WINDOWS-EXE.ps1" -ForegroundColor Cyan
