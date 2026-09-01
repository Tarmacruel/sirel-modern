[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "common.ps1")

$paths = Initialize-OpsLayout
$session = Load-Session
if (-not $session) {
  throw "Nenhuma sessão local do SIREL foi encontrada. Inicie o ambiente local antes de subir o túnel."
}

if (-not (Wait-ForHttp -Url "http://localhost:5173" -TimeoutSeconds 10)) {
  throw "O frontend local não está respondendo em http://localhost:5173."
}

if ([bool]$session.tunnel.enabled -and $session.tunnel.pid -and (Get-AliveProcessInfo -ProcessId ([int]$session.tunnel.pid))) {
  Write-OpsLog "Túnel já está em execução com PID $($session.tunnel.pid)."
  exit 0
}

$cloudflared = Find-CloudflaredCmd
$tunnelProcess = Start-BackgroundCommand -Name "Cloudflared" -WorkingDirectory $paths.Root -CommandPath $cloudflared -Arguments @("tunnel", "--url", "http://localhost:5173", "--http-host-header", "localhost:5173") -OutLog $paths.TunnelOutLog -ErrLog $paths.TunnelErrLog
Write-PidFile -Path $paths.TunnelPid -ProcessId $tunnelProcess.Id

$session.tunnel.enabled = $true
$session.tunnel.pid = $tunnelProcess.Id
$session.mode = "local+tunnel"
Save-Session $session

$tunnelUrl = Wait-ForTunnelUrl -LogPath $paths.TunnelOutLog -TimeoutSeconds 20
if (-not $tunnelUrl) {
  $tunnelUrl = Wait-ForTunnelUrl -LogPath $paths.TunnelErrLog -TimeoutSeconds 25
}
if ($tunnelUrl) {
  $session = Load-Session
  $session.tunnel.url = $tunnelUrl
  Save-Session $session
  Write-OpsLog "Túnel Cloudflare disponível em $tunnelUrl."
  Write-Host "☁️ Tunnel:   $tunnelUrl" -ForegroundColor Green
} else {
  Write-OpsLog "Túnel iniciado, mas a URL pública ainda não foi detectada no log." "WARN"
}
