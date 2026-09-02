param(
  [string]$Root = "E:\DADOS\LICITACAO.1"
)

$ErrorActionPreference = "Continue"

Write-Host "=== SIREL Arquivos - Diagnóstico ===" -ForegroundColor Cyan
Write-Host "Computador: $env:COMPUTERNAME"
Write-Host "Usuário: $env:USERNAME"
Write-Host "Root: $Root"

if (Test-Path -LiteralPath $Root) {
  Write-Host "[OK] Pasta encontrada" -ForegroundColor Green
  try {
    $sample = Get-ChildItem -LiteralPath $Root -Force -ErrorAction Stop | Select-Object -First 5
    Write-Host "[OK] Leitura da pasta permitida" -ForegroundColor Green
    $sample | Format-Table Name, Length, LastWriteTime
  } catch {
    Write-Host "[ERRO] Não foi possível listar a pasta: $($_.Exception.Message)" -ForegroundColor Red
  }
} else {
  Write-Host "[ERRO] Pasta não encontrada." -ForegroundColor Red
}

$loCandidates = @(
  $env:LIBREOFFICE_PATH,
  "C:\Program Files\LibreOffice\program\soffice.exe",
  "C:\Program Files (x86)\LibreOffice\program\soffice.exe"
) | Where-Object { $_ }

$lo = $loCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($lo) {
  Write-Host "[OK] LibreOffice: $lo" -ForegroundColor Green
} else {
  Write-Host "[AVISO] LibreOffice não encontrado. Preview Office ficará indisponível." -ForegroundColor Yellow
}

try {
  node --version
  npm --version
} catch {
  Write-Host "[ERRO] Node/npm não encontrados no PATH." -ForegroundColor Red
}

Write-Host "=== Fim ===" -ForegroundColor Cyan
