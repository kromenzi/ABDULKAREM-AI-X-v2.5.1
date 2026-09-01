param(
  [string]$ApiKey = "",
  [string]$BaseUrl = ""
)
$ErrorActionPreference = "Stop"

if (-not $BaseUrl) {
  $runtimeCandidates = @(
    (Join-Path $env:APPDATA "abdulkarem-ai-x\api-runtime.json"),
    (Join-Path $env:APPDATA "ABDULKAREM AI X\api-runtime.json")
  )
  foreach ($runtimeFile in $runtimeCandidates) {
    if (Test-Path -LiteralPath $runtimeFile -PathType Leaf) {
      try {
        $runtime = Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json
        if ($runtime.baseUrl) { $BaseUrl = [string]$runtime.baseUrl; break }
      } catch {}
    }
  }
}
if (-not $BaseUrl) { $BaseUrl = "http://127.0.0.1:8787/v1" }

Write-Host "=== ABDULKAREM AI X v0.3 API Test ===" -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl" -ForegroundColor DarkGray

try {
  $health = Invoke-RestMethod -Uri ($BaseUrl -replace '/v1$','/health') -Method Get -TimeoutSec 4
  Write-Host "API health: OK" -ForegroundColor Green
  Write-Host ("Ollama: " + $health.ollama) -ForegroundColor DarkGray
} catch {
  Write-Host "API is not reachable. Start ABDULKAREM AI X first." -ForegroundColor Red
  throw
}

if (-not $ApiKey) {
  $candidates = @(
    (Join-Path $env:APPDATA "abdulkarem-ai-x\api-config.json"),
    (Join-Path $env:APPDATA "ABDULKAREM AI X\api-config.json")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      try {
        $cfg = Get-Content -LiteralPath $candidate -Raw | ConvertFrom-Json
        if ($cfg.apiKey) { $ApiKey = [string]$cfg.apiKey; break }
      } catch {}
    }
  }
}

if (-not $ApiKey) {
  throw "API key was not found automatically. Open the API panel in the app and run: .\TEST-API.ps1 -ApiKey 'akx_...'"
}

$headers = @{ Authorization = "Bearer $ApiKey" }
$body = @{
  model = "abdulkarem-ai"
  messages = @(
    @{ role = "user"; content = "عرفني بنفسك بسطر واحد باللهجة السعودية." }
  )
  stream = $false
} | ConvertTo-Json -Depth 10

$result = Invoke-RestMethod `
  -Uri "$BaseUrl/chat/completions" `
  -Method Post `
  -Headers $headers `
  -ContentType "application/json; charset=utf-8" `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) `
  -TimeoutSec 300

Write-Host "" 
Write-Host "Model:" $result.model -ForegroundColor Cyan
Write-Host ("Verification: {0}%" -f $result.abdulkarem.verification.score) -ForegroundColor Cyan
Write-Host "" 
Write-Host $result.choices[0].message.content -ForegroundColor White
