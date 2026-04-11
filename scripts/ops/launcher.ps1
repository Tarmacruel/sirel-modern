[CmdletBinding()]
param(
  [ValidateSet("Menu", "StartLocal", "StartTunnel", "Stop", "Reset", "Status", "Logs", "Backup")]
  [string]$Action = "Menu"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "common.ps1")

function Invoke-LauncherAction([string]$SelectedAction) {
  $root = (Get-SirelPaths).Root
  switch ($SelectedAction) {
    "StartLocal" { & (Join-Path $PSScriptRoot "start-dev.ps1") }
    "StartTunnel" { & (Join-Path $PSScriptRoot "start-dev.ps1") -WithTunnel }
    "Stop" { & (Join-Path $PSScriptRoot "stop-dev.ps1") }
    "Reset" { & (Join-Path $PSScriptRoot "reset-dev.ps1") }
    "Status" { & (Join-Path $PSScriptRoot "status-dev.ps1") }
    "Logs" { & (Join-Path $PSScriptRoot "logs-local.ps1") }
    "Backup" {
      $npmCmd = Find-NpmCmd
      Invoke-ExternalCommand -FilePath $npmCmd -Arguments @("run", "backup:local") -WorkingDirectory $root -Description "npm run backup:local"
    }
    default { throw "Ação não suportada: $SelectedAction" }
  }
}

if ($Action -ne "Menu") {
  Invoke-LauncherAction -SelectedAction $Action
  exit 0
}

Clear-Host
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "   SIREL - Launcher Operacional Local" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "[1] Iniciar sem tunnel"
Write-Host "[2] Iniciar com tunnel"
Write-Host "[3] Parar ambiente"
Write-Host "[4] Reset operacional"
Write-Host "[5] Status do ambiente"
Write-Host "[6] Abrir logs"
Write-Host "[7] Executar backup"
Write-Host "[0] Sair"
Write-Host ""

$option = Read-Host "Escolha uma opção"
switch ($option) {
  "1" { Invoke-LauncherAction -SelectedAction "StartLocal" }
  "2" { Invoke-LauncherAction -SelectedAction "StartTunnel" }
  "3" { Invoke-LauncherAction -SelectedAction "Stop" }
  "4" { Invoke-LauncherAction -SelectedAction "Reset" }
  "5" { Invoke-LauncherAction -SelectedAction "Status" }
  "6" { Invoke-LauncherAction -SelectedAction "Logs" }
  "7" { Invoke-LauncherAction -SelectedAction "Backup" }
  "0" { Write-Host "Encerrando launcher." -ForegroundColor Yellow }
  default { Write-Host "Opção inválida." -ForegroundColor Red }
}

if ($option -ne "0") {
  Write-Host ""
  Read-Host "Pressione Enter para fechar"
}
