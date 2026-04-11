[CmdletBinding()]
param(
  [switch]$WithTunnel
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "common.ps1")

$paths = Initialize-OpsLayout
$currentSession = Load-Session
if ($currentSession -and (Test-SessionAlive $currentSession)) {
  Write-OpsLog "Ambiente já está em execução."
  if ($WithTunnel -and -not [bool]$currentSession.tunnel.enabled) {
    & (Join-Path $PSScriptRoot "start-tunnel.ps1")
  }
  exit 0
}

if ($currentSession) {
  Write-OpsLog "Sessão anterior detectada, porém inconsistente. Limpando antes da nova inicialização." "WARN"
  & (Join-Path $PSScriptRoot "stop-dev.ps1") -Quiet
}

$envPath = Ensure-EnvFile
Ensure-Dependencies
$npmCmd = Find-NpmCmd

foreach ($port in 3030, 5173) {
  $owners = @(Get-PortOwners -Port $port)
  if ($owners.Count -gt 0) {
    throw "A porta $port já está em uso por outro processo ($($owners -join ', ')). Execute stop/reset antes de iniciar novamente."
  }
}

Invoke-ExternalCommand -FilePath $npmCmd -Arguments @("run", "db:migrate") -WorkingDirectory $paths.Root -Description "npm run db:migrate"

try {
  Invoke-ExternalCommand -FilePath $npmCmd -Arguments @("run", "db:check-seeded") -WorkingDirectory $paths.Root -Description "npm run db:check-seeded"
} catch {
  Write-OpsLog "Seed básico ausente. Executando npm run legacy:seed:basics." "WARN"
  Invoke-ExternalCommand -FilePath $npmCmd -Arguments @("run", "legacy:seed:basics") -WorkingDirectory $paths.Root -Description "npm run legacy:seed:basics"
}

$mode = if ($WithTunnel) { "local+tunnel" } else { "local" }
$session = New-SessionTemplate -Mode $mode

try {
  $serverProcess = Start-BackgroundCommand -Name "Backend SIREL" -WorkingDirectory $paths.Root -CommandPath $npmCmd -Arguments @("run", "dev", "--workspace", "server") -OutLog $paths.ServerOutLog -ErrLog $paths.ServerErrLog
  Write-PidFile -Path $paths.ServerPid -ProcessId $serverProcess.Id
  $session.backend.pid = $serverProcess.Id
  Save-Session $session

  if (-not (Wait-ForPort -Port 3030 -TimeoutSeconds 60)) {
    throw "O backend não abriu a porta 3030 dentro do tempo esperado."
  }
  $backendOwner = @(Get-PortOwners -Port 3030) | Select-Object -First 1
  if ($backendOwner) {
    Write-PidFile -Path $paths.ServerPid -ProcessId ([int]$backendOwner)
    $session.backend.pid = [int]$backendOwner
    Save-Session $session
  }

  $clientProcess = Start-BackgroundCommand -Name "Frontend SIREL" -WorkingDirectory $paths.Root -CommandPath $npmCmd -Arguments @("run", "dev", "--workspace", "client") -OutLog $paths.ClientOutLog -ErrLog $paths.ClientErrLog
  Write-PidFile -Path $paths.ClientPid -ProcessId $clientProcess.Id
  $session.frontend.pid = $clientProcess.Id
  Save-Session $session

  if (-not (Wait-ForHttp -Url "http://localhost:5173" -TimeoutSeconds 90)) {
    throw "O frontend não respondeu em http://localhost:5173 dentro do tempo esperado."
  }
  $clientOwner = @(Get-PortOwners -Port 5173) | Select-Object -First 1
  if ($clientOwner) {
    Write-PidFile -Path $paths.ClientPid -ProcessId ([int]$clientOwner)
    $session.frontend.pid = [int]$clientOwner
    Save-Session $session
  }

  if ($WithTunnel) {
    & (Join-Path $PSScriptRoot "start-tunnel.ps1")
    $session = Load-Session
  }

  Write-OpsLog "Ambiente SIREL iniciado com sucesso no perfil $mode."
  Write-Host "✅ Backend:  http://localhost:3030" -ForegroundColor Green
  Write-Host "✅ Frontend: http://localhost:5173" -ForegroundColor Green
  if ($WithTunnel -and $session -and $session.tunnel.url) {
    Write-Host "☁️ Tunnel:   $($session.tunnel.url)" -ForegroundColor Green
  }
} catch {
  Write-OpsLog $_.Exception.Message "ERROR"
  & (Join-Path $PSScriptRoot "stop-dev.ps1") -Quiet
  throw
}
