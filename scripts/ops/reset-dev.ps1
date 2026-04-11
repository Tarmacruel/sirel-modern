[CmdletBinding()]
param(
  [switch]$WithTunnel
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "common.ps1")

$previousSession = Load-Session
$shouldUseTunnel = $WithTunnel
if (-not $WithTunnel -and $previousSession -and $previousSession.mode -eq "local+tunnel") {
  $shouldUseTunnel = $true
}

Write-OpsLog "Executando reset operacional do SIREL."
& (Join-Path $PSScriptRoot "stop-dev.ps1") -Quiet
Clear-VolatileArtifacts
if ($shouldUseTunnel) {
  & (Join-Path $PSScriptRoot "start-dev.ps1") -WithTunnel
} else {
  & (Join-Path $PSScriptRoot "start-dev.ps1")
}
