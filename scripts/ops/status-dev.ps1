[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "common.ps1")

$snapshot = Get-StatusSnapshot
$session = $snapshot.session

Write-Host "SIREL - Status operacional local" -ForegroundColor Cyan
Write-Host "Raiz: $($snapshot.paths.Root)"
Write-Host "Logs: $($snapshot.paths.Logs)"
Write-Host "Runtime: $($snapshot.paths.Runtime)"
Write-Host ""

if ($session) {
  Write-Host "Sessão registrada: sim"
  Write-Host "Modo: $($session.mode)"
  Write-Host "Iniciado em: $($session.startedAt)"
  Write-Host "Backend PID: $($session.backend.pid)"
  Write-Host "Frontend PID: $($session.frontend.pid)"
  Write-Host "Tunnel ativo: $($session.tunnel.enabled)"
  if ($session.tunnel.pid) {
    Write-Host "Tunnel PID: $($session.tunnel.pid)"
  }
  if ($session.tunnel.url) {
    Write-Host "Tunnel URL: $($session.tunnel.url)"
  }
} else {
  Write-Host "Sessão registrada: não"
}

Write-Host ""
Write-Host "Porta 3030: $(if ($snapshot.serverPortOwners.Count -gt 0) { 'ocupada' } else { 'livre' })"
if ($snapshot.serverPortOwners.Count -gt 0) {
  Write-Host "  PIDs: $($snapshot.serverPortOwners -join ', ')"
}
Write-Host "Porta 5173: $(if ($snapshot.clientPortOwners.Count -gt 0) { 'ocupada' } else { 'livre' })"
if ($snapshot.clientPortOwners.Count -gt 0) {
  Write-Host "  PIDs: $($snapshot.clientPortOwners -join ', ')"
}

if ($snapshot.cloudflared.Count -gt 0) {
  Write-Host ""
  Write-Host "Processos cloudflared detectados:"
  $snapshot.cloudflared | ForEach-Object {
    Write-Host "- PID $($_.ProcessId)"
  }
}

Write-Host ""
Write-Host "Arquivos principais:"
Write-Host "- server.out.log: $($snapshot.paths.ServerOutLog)"
Write-Host "- client.out.log: $($snapshot.paths.ClientOutLog)"
Write-Host "- cloudflared.out.log: $($snapshot.paths.TunnelOutLog)"
