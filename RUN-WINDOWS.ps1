$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Get-OllamaExe {
  $preferred = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
  if (Test-Path -LiteralPath $preferred -PathType Leaf) {
    return (Resolve-Path -LiteralPath $preferred).Path
  }
  $cmd = Get-Command ollama.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd -and $cmd.Source -and $cmd.Source.ToLower().EndsWith(".exe") -and (Test-Path -LiteralPath $cmd.Source -PathType Leaf)) {
    return $cmd.Source
  }
  throw "Ollama executable was not found."
}

$OllamaExe = Get-OllamaExe
try {
  $null = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/version" -TimeoutSec 2
} catch {
  Write-Host "Starting Ollama server..." -ForegroundColor Yellow
  Start-Process -WindowStyle Hidden -FilePath $OllamaExe -ArgumentList "serve"
  Start-Sleep -Seconds 3
}

if (-not (Test-Path -LiteralPath (Join-Path $Root "node_modules") -PathType Container)) {
  Write-Host "node_modules was not found. Run INSTALL-WINDOWS.ps1 first." -ForegroundColor Red
  exit 1
}

$npm = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $npm) { throw "npm.cmd was not found." }
& $npm.Source run dev
