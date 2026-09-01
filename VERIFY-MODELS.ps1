$ErrorActionPreference = "Stop"

function Get-OllamaExe {
  $preferred = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
  if (Test-Path -LiteralPath $preferred -PathType Leaf) {
    return (Resolve-Path -LiteralPath $preferred).Path
  }

  $cmd = Get-Command ollama.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd -and $cmd.Source -and $cmd.Source.ToLower().EndsWith(".exe") -and (Test-Path -LiteralPath $cmd.Source -PathType Leaf)) {
    return $cmd.Source
  }

  throw "Ollama executable was not found. Expected: $preferred"
}

$OllamaExe = Get-OllamaExe
Write-Host "Ollama EXE: $OllamaExe" -ForegroundColor Cyan

$models = (& $OllamaExe list 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) {
  throw "ollama list failed:`n$models"
}

Write-Host $models

$required = @(
  "abdulkarem-general-sa:v2",
  "qwen3-coder:30b"
)

foreach ($name in $required) {
  if ($models -match [regex]::Escape($name)) {
    Write-Host "READY   $name" -ForegroundColor Green
  } else {
    Write-Host "MISSING $name" -ForegroundColor Yellow
  }
}

$vision = "gemma4:26b"
if ($models -match [regex]::Escape($vision)) {
  Write-Host "READY   $vision (Vision priority)" -ForegroundColor Green
} else {
  Write-Host "OPTIONAL $vision is not installed; the app will try other Vision models." -ForegroundColor DarkYellow
}

$embeddingCandidates = @(
  "qwen3-embedding:4b",
  "qwen3-embedding:8b",
  "qwen3-embedding",
  "nomic-embed-text",
  "mxbai-embed-large",
  "bge-m3"
)
$embeddingFound = $false
foreach ($candidate in $embeddingCandidates) {
  if ($models -match [regex]::Escape($candidate)) {
    Write-Host "READY   $candidate (Semantic RAG)" -ForegroundColor Green
    $embeddingFound = $true
    break
  }
}
if (-not $embeddingFound) {
  Write-Host "OPTIONAL No embedding model found. Knowledge Base will still work with lexical search." -ForegroundColor DarkYellow
  Write-Host "         For Hybrid RAG you can later install: qwen3-embedding:4b" -ForegroundColor DarkYellow
}

Write-Host "Verification finished. No models were modified or deleted." -ForegroundColor Green
