[CmdletBinding()]
param(
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "common.ps1")

$paths = Initialize-OpsLayout
$session = Load-Session
$stoppedSomething = $false

if ($session) {
  if ($session.tunnel.pid) {
    Stop-ProcessTreeSafe -ProcessId ([int]$session.tunnel.pid) -Label "Cloudflared"
    $stoppedSomething = $true
  }
  if ($session.frontend.pid) {
    Stop-ProcessTreeSafe -ProcessId ([int]$session.frontend.pid) -Label "Frontend"
    $stoppedSomething = $true
  }
  if ($session.backend.pid) {
    Stop-ProcessTreeSafe -ProcessId ([int]$session.backend.pid) -Label "Backend"
    $stoppedSomething = $true
  }
}

foreach ($owner in (Get-PortOwners -Port 5173)) {
  Stop-ProcessTreeSafe -ProcessId ([int]$owner) -Label "Processo na porta 5173"
  $stoppedSomething = $true
}
foreach ($owner in (Get-PortOwners -Port 3030)) {
  Stop-ProcessTreeSafe -ProcessId ([int]$owner) -Label "Processo na porta 3030"
  $stoppedSomething = $true
}
foreach ($cloudflaredProcess in (Get-CloudflaredCandidateProcesses)) {
  Stop-ProcessTreeSafe -ProcessId ([int]$cloudflaredProcess.ProcessId) -Label "Cloudflared residual"
  $stoppedSomething = $true
}

Remove-SessionArtifacts

$remaining3030 = @(Get-PortOwners -Port 3030)
$remaining5173 = @(Get-PortOwners -Port 5173)
if ($remaining3030.Count -gt 0 -or $remaining5173.Count -gt 0) {
  Write-OpsLog "Algumas portas ainda estão ocupadas após a parada. 3030=[$($remaining3030 -join ', ')] 5173=[$($remaining5173 -join ', ')]" "WARN"
}

if (-not $Quiet) {
  if ($stoppedSomething) {
    Write-OpsLog "Ambiente SIREL encerrado."
    Write-Host "🛑 Ambiente encerrado." -ForegroundColor Yellow
  } else {
    Write-OpsLog "Nenhum processo controlado do SIREL estava em execução." "WARN"
    Write-Host "ℹ️ Nenhum processo controlado do SIREL estava em execução." -ForegroundColor Yellow
  }
}
