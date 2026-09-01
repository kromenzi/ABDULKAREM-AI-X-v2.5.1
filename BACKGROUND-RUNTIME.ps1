$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Get-OllamaExe {
  $preferred = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
  if (Test-Path -LiteralPath $preferred -PathType Leaf) { return (Resolve-Path -LiteralPath $preferred).Path }
  $cmd = Get-Command ollama.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd -and $cmd.Source -and (Test-Path -LiteralPath $cmd.Source -PathType Leaf)) { return $cmd.Source }
  return $null
}

if (-not (Test-Path -LiteralPath (Join-Path $Root "node_modules") -PathType Container)) {
  throw "node_modules was not found. Run INSTALL-WINDOWS.ps1 first."
}

$OllamaExe = Get-OllamaExe
if ($OllamaExe) {
  try { $null = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/version" -TimeoutSec 2 }
  catch { Start-Process -WindowStyle Hidden -FilePath $OllamaExe -ArgumentList "serve"; Start-Sleep -Seconds 3 }
}

$npm = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $npm) { throw "npm.cmd was not found." }
& $npm.Source run dev:background
exit $LASTEXITCODE
