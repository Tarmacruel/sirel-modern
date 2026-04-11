Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:OpsRoot = $PSScriptRoot
$script:SirelRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\.." )).Path
$script:LauncherVersion = "1.0.0"

function Get-SirelPaths {
  $storageRoot = Join-Path $script:SirelRoot "storage"
  $logsRoot = Join-Path $storageRoot "logs"
  $runtimeRoot = Join-Path $storageRoot "runtime"
  $locksRoot = Join-Path $runtimeRoot "locks"
  $outputRoot = Join-Path $script:SirelRoot "output"
  $uiValidationRoot = Join-Path $outputRoot "ui-validation"

  [pscustomobject]@{
    Root = $script:SirelRoot
    Storage = $storageRoot
    Logs = $logsRoot
    Runtime = $runtimeRoot
    Locks = $locksRoot
    Session = Join-Path $runtimeRoot "session.json"
    LauncherLog = Join-Path $logsRoot "launcher.log"
    ServerPid = Join-Path $runtimeRoot "server.pid"
    ClientPid = Join-Path $runtimeRoot "client.pid"
    TunnelPid = Join-Path $runtimeRoot "cloudflared.pid"
    ServerOutLog = Join-Path $logsRoot "server.out.log"
    ServerErrLog = Join-Path $logsRoot "server.err.log"
    ClientOutLog = Join-Path $logsRoot "client.out.log"
    ClientErrLog = Join-Path $logsRoot "client.err.log"
    TunnelOutLog = Join-Path $logsRoot "cloudflared.out.log"
    TunnelErrLog = Join-Path $logsRoot "cloudflared.err.log"
    Output = $outputRoot
    UiValidation = $uiValidationRoot
    UiValidationPid = Join-Path $uiValidationRoot "dev.pid"
  }
}

function Ensure-Directory([string]$Path) {
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function Initialize-OpsLayout {
  $paths = Get-SirelPaths
  @($paths.Storage, $paths.Logs, $paths.Runtime, $paths.Locks, $paths.Output, $paths.UiValidation) | ForEach-Object {
    Ensure-Directory $_
  }
  return $paths
}

function Write-OpsLog([string]$Message, [string]$Level = "INFO") {
  $paths = Initialize-OpsLayout
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$timestamp] [$Level] $Message"
  Write-Host $line
  Add-Content -LiteralPath $paths.LauncherLog -Value $line -Encoding utf8
}

function Find-NpmCmd {
  $nodeDir = "C:\Program Files\nodejs"
  $npmCmd = Join-Path $nodeDir "npm.cmd"
  if (Test-Path $npmCmd) {
    $env:Path = "$nodeDir;$env:Path"
    return $npmCmd
  }

  $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  throw "Node.js não foi encontrado. Instale o Node.js 22+ antes de iniciar o SIREL."
}

function Find-CloudflaredCmd {
  $cmd = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  $candidates = @(
    "C:\Program Files (x86)\cloudflared\cloudflared.exe",
    "C:\Program Files\cloudflared\cloudflared.exe",
    "C:\ProgramData\chocolatey\bin\cloudflared.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "cloudflared não foi encontrado. Instale o Cloudflare Tunnel para usar o perfil com túnel."
}

function Get-EnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path $Path)) { return $null }
  $line = Get-Content $Path | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -replace "^$Name=", "").Trim()
}

function Ensure-EnvFile {
  $paths = Get-SirelPaths
  $envPath = Join-Path $paths.Root ".env"
  $examplePath = Join-Path $paths.Root ".env.example"
  if (-not (Test-Path $envPath) -and (Test-Path $examplePath)) {
    Copy-Item -LiteralPath $examplePath -Destination $envPath
    Write-OpsLog "Arquivo .env ausente. .env.example foi copiado automaticamente." "WARN"
  }
  if (-not (Test-Path $envPath)) {
    throw "Arquivo .env não encontrado. Crie ou restaure o .env antes de iniciar o SIREL."
  }
  return $envPath
}

function Ensure-Dependencies {
  $paths = Get-SirelPaths
  $nodeModules = Join-Path $paths.Root "node_modules"
  if (-not (Test-Path $nodeModules)) {
    $npmCmd = Find-NpmCmd
    Write-OpsLog "Dependências não encontradas. Executando npm install." "WARN"
    Invoke-ExternalCommand -FilePath $npmCmd -Arguments @("install") -WorkingDirectory $paths.Root -Description "npm install"
  }
}

function Invoke-ExternalCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string]$Description
  )

  Write-OpsLog "Executando $Description."
  Push-Location $WorkingDirectory
  try {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Falha ao executar $Description. Código: $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Get-PortOwners([int]$Port) {
  $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -in @("Listen", "Established") }
  if (-not $connections) { return @() }
  return $connections | Select-Object -ExpandProperty OwningProcess -Unique
}

function Test-PortInUse([int]$Port) {
  return [bool](Get-PortOwners -Port $Port)
}

function Wait-ForPort([int]$Port, [int]$TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortInUse -Port $Port) {
      return $true
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Wait-ForHttp([string]$Url, [int]$TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 | Out-Null
      return $true
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  return $false
}

function Convert-ToPsSingleQuoted([string]$Value) {
  return "'" + ($Value -replace "'", "''") + "'"
}

function Start-BackgroundCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string]$CommandPath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$OutLog,
    [Parameter(Mandatory = $true)][string]$ErrLog
  )

  Initialize-OpsLayout | Out-Null
  if (-not (Test-Path $OutLog)) {
    Set-Content -LiteralPath $OutLog -Value "" -Encoding utf8
  }
  if (-not (Test-Path $ErrLog)) {
    Set-Content -LiteralPath $ErrLog -Value "" -Encoding utf8
  }

  $process = Start-Process -FilePath $CommandPath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog -WindowStyle Hidden -PassThru

  Write-OpsLog "$Name iniciado em background com PID $($process.Id)."
  return $process
}

function Stop-ProcessTreeSafe([int]$ProcessId, [string]$Label) {
  if ($ProcessId -le 0) { return }
  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) { return }
  Write-OpsLog "Encerrando $Label (PID $ProcessId)."
  & taskkill.exe /PID $ProcessId /T /F | Out-Null
}

function Get-CloudflaredCandidateProcesses {
  @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^cloudflared(\.exe)?$' -and $_.CommandLine -match 'localhost:5173'
  })
}

function Read-PidFile([string]$Path) {
  if (-not (Test-Path $Path)) { return $null }
  $raw = (Get-Content -Raw -LiteralPath $Path).Trim()
  if (-not $raw) { return $null }
  return [int]$raw
}

function Write-PidFile([string]$Path, [int]$ProcessId) {
  Set-Content -LiteralPath $Path -Value ([string]$ProcessId) -Encoding ascii
}

function Load-Session {
  $paths = Get-SirelPaths
  if (-not (Test-Path $paths.Session)) { return $null }
  return Get-Content -Raw -LiteralPath $paths.Session | ConvertFrom-Json
}

function Save-Session($Session) {
  $paths = Get-SirelPaths
  ($Session | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $paths.Session -Encoding utf8
}

function Remove-SessionArtifacts {
  $paths = Get-SirelPaths
  @($paths.Session, $paths.ServerPid, $paths.ClientPid, $paths.TunnelPid) | ForEach-Object {
    if (Test-Path $_) {
      Remove-Item -LiteralPath $_ -Force -ErrorAction SilentlyContinue
    }
  }
}

function Get-AliveProcessInfo([int]$ProcessId) {
  if ($ProcessId -le 0) { return $null }
  return Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
}

function Get-SirelVersion {
  $packagePath = Join-Path $script:SirelRoot "package.json"
  if (-not (Test-Path $packagePath)) { return "desconhecida" }
  return [string]((Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json).version)
}

function New-SessionTemplate([string]$Mode) {
  $paths = Get-SirelPaths
  return [ordered]@{
    launcherVersion = $script:LauncherVersion
    sirelVersion = Get-SirelVersion
    mode = $Mode
    startedAt = (Get-Date).ToString("o")
    root = $paths.Root
    backend = [ordered]@{ port = 3030; pid = $null; outLog = $paths.ServerOutLog; errLog = $paths.ServerErrLog; url = "http://localhost:3030" }
    frontend = [ordered]@{ port = 5173; pid = $null; outLog = $paths.ClientOutLog; errLog = $paths.ClientErrLog; url = "http://localhost:5173" }
    tunnel = [ordered]@{ enabled = $false; pid = $null; outLog = $paths.TunnelOutLog; errLog = $paths.TunnelErrLog; url = $null }
  }
}

function Test-SessionAlive($Session) {
  if (-not $Session) { return $false }
  $backendAlive = $Session.backend.pid -and (Get-AliveProcessInfo -ProcessId ([int]$Session.backend.pid))
  $frontendAlive = $Session.frontend.pid -and (Get-AliveProcessInfo -ProcessId ([int]$Session.frontend.pid))
  if ($backendAlive -and $frontendAlive) {
    return $true
  }
  return $false
}

function Wait-ForTunnelUrl([string]$LogPath, [int]$TimeoutSeconds = 40) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $LogPath) {
      $content = Get-Content -Raw -LiteralPath $LogPath -ErrorAction SilentlyContinue
      if ($content -match 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com') {
        return $Matches[0]
      }
    }
    Start-Sleep -Seconds 1
  }
  return $null
}

function Get-StatusSnapshot {
  $paths = Get-SirelPaths
  $session = Load-Session
  $snapshot = [ordered]@{
    sessionExists = [bool]$session
    session = $session
    serverPortOwners = @(Get-PortOwners -Port 3030)
    clientPortOwners = @(Get-PortOwners -Port 5173)
    cloudflared = @(Get-CloudflaredCandidateProcesses | Select-Object ProcessId, CommandLine)
    paths = $paths
  }
  return [pscustomobject]$snapshot
}

function Clear-VolatileArtifacts {
  $paths = Initialize-OpsLayout
  Remove-SessionArtifacts

  @(
    $paths.Locks,
    $paths.Runtime,
    (Join-Path $paths.Storage "restore-temp"),
    (Join-Path $paths.Storage "backup-retention-test")
  ) | ForEach-Object {
    if (Test-Path $_) {
      Get-ChildItem -LiteralPath $_ -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  @(
    $paths.ServerOutLog,
    $paths.ServerErrLog,
    $paths.ClientOutLog,
    $paths.ClientErrLog,
    $paths.TunnelOutLog,
    $paths.TunnelErrLog,
    $paths.UiValidationPid,
    (Join-Path $paths.UiValidation "dev.log")
  ) | ForEach-Object {
    if (Test-Path $_) {
      Remove-Item -LiteralPath $_ -Force -ErrorAction SilentlyContinue
    }
  }

  foreach ($pattern in @("*.log", "*.out.log", "*.err.log")) {
    Get-ChildItem -LiteralPath $paths.Root -File -Filter $pattern -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  }
}

function Open-LogsFolder {
  $paths = Initialize-OpsLayout
  Start-Process explorer.exe $paths.Logs | Out-Null
  Write-OpsLog "Pasta de logs aberta em $($paths.Logs)."
}
