[CmdletBinding()]
param(
  [string]$BackupRoot = "",
  [string]$MirrorRoot = "",
  [ValidateRange(1, 365)]
  [int]$RetentionCount = 10,
  [bool]$IncludeReports = $true,
  [bool]$IncludeEnv = $false
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.IO.Compression.FileSystem

Set-Location -Path (Join-Path $PSScriptRoot "..")

function Get-EnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path $Path)) { return $null }

  $line = Get-Content $Path | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1
  if (-not $line) { return $null }

  return ($line -replace "^$Name=", "").Trim().Trim([char]34).Trim([char]39)
}

function Find-PgDump {
  $cmd = Get-Command pg_dump -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName "bin\pg_dump.exe" } |
    Where-Object { Test-Path $_ }

  if ($candidates) { return ($candidates | Select-Object -First 1) }

  throw "pg_dump não foi encontrado. Instale o PostgreSQL client tools nesta máquina."
}

function Ensure-Directory([string]$Path) {
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function Write-Log([string]$Message, [string]$Level = "INFO") {
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$timestamp] [$Level] $Message"
  Write-Host $line
  if ($script:LogPath) {
    Add-Content -Path $script:LogPath -Value $line -Encoding utf8
  }
}

function Remove-LockFile([string]$LockPath) {
  if (Test-Path $LockPath) {
    Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue
  }
}

function Get-SirelVersion([string]$RootPath) {
  $packagePath = Join-Path $RootPath "package.json"
  if (-not (Test-Path $packagePath)) { return "desconhecida" }
  $package = Get-Content -Raw $packagePath | ConvertFrom-Json
  return [string]$package.version
}

function Test-DirectoryHasContent([string]$Path) {
  if (-not (Test-Path $Path)) { return $false }
  return [bool](Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function New-ZipFromDirectory([string]$SourcePath, [string]$DestinationPath) {
  if (Test-Path $DestinationPath) {
    Remove-Item -LiteralPath $DestinationPath -Force
  }
  [System.IO.Compression.ZipFile]::CreateFromDirectory($SourcePath, $DestinationPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)
}

function Get-FileSha256([string]$Path) {
  if (-not (Test-Path $Path)) { return $null }
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
}

function Apply-Retention([string]$TargetPath, [int]$KeepCount) {
  Ensure-Directory $TargetPath
  Get-ChildItem -LiteralPath $TargetPath -Filter "sirel-backup-*.zip" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip $KeepCount |
    ForEach-Object {
      $metadataSidecar = "$($_.FullName).metadata.json"
      $shaSidecar = "$($_.FullName).sha256.txt"
      Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      if (Test-Path $metadataSidecar) {
        Remove-Item -LiteralPath $metadataSidecar -Force -ErrorAction SilentlyContinue
      }
      if (Test-Path $shaSidecar) {
        Remove-Item -LiteralPath $shaSidecar -Force -ErrorAction SilentlyContinue
      }
    }
}

$root = (Get-Location).Path
$backupRootAbsolute = if (-not $BackupRoot) {
  Join-Path $env:LOCALAPPDATA "SIREL\backups"
} elseif ([System.IO.Path]::IsPathRooted($BackupRoot)) {
  $BackupRoot
} else {
  Join-Path $root $BackupRoot
}
$mirrorRootAbsolute = if (-not $MirrorRoot) {
  $null
} elseif ([System.IO.Path]::IsPathRooted($MirrorRoot)) {
  $MirrorRoot
} else {
  Join-Path $root $MirrorRoot
}
if ($mirrorRootAbsolute) {
  throw "Espelhamento de backup esta desabilitado ate a entrega da criptografia AES-256-GCM."
}
if ($IncludeEnv) {
  throw "Inclusao de .env no backup esta desabilitada enquanto o pacote nao for criptografado."
}
$envFile = Join-Path $root ".env"
$databaseUrl = Get-EnvValue -Path $envFile -Name "DATABASE_URL"
if (-not $databaseUrl) {
  throw "DATABASE_URL não encontrada no arquivo .env."
}

$uri = [System.Uri]$databaseUrl
if ($uri.Scheme -notin @("postgres", "postgresql")) {
  throw "DATABASE_URL deve usar o esquema postgres ou postgresql."
}
$dbName = [System.Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart("/"))
$userInfo = $uri.UserInfo.Split(":", 2)
$dbUser = [System.Uri]::UnescapeDataString($userInfo[0])
$dbPassword = if ($userInfo.Count -gt 1) { [System.Uri]::UnescapeDataString($userInfo[1]) } else { "" }
$dbHost = $uri.Host
$dbPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }

Ensure-Directory $backupRootAbsolute
if ($mirrorRootAbsolute) {
  Ensure-Directory $mirrorRootAbsolute
}

$lockPath = Join-Path $backupRootAbsolute ".backup.lock"
if (Test-Path $lockPath) {
  $lockInfo = Get-Content -Raw $lockPath -ErrorAction SilentlyContinue
  throw "Já existe uma rotina de backup em andamento. Lock encontrado em $lockPath. Detalhes: $lockInfo"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmssfff"
$executionStart = Get-Date
$workingDir = Join-Path $backupRootAbsolute ".tmp-$timestamp"
$archiveName = "sirel-backup-$timestamp.zip"
$archivePath = Join-Path $backupRootAbsolute $archiveName
$mirrorArchivePath = if ($mirrorRootAbsolute) { Join-Path $mirrorRootAbsolute $archiveName } else { $null }
$archiveMetadataPath = Join-Path $backupRootAbsolute ("$archiveName.metadata.json")
$mirrorMetadataPath = if ($mirrorRootAbsolute) { Join-Path $mirrorRootAbsolute ("$archiveName.metadata.json") } else { $null }
$archiveShaPath = Join-Path $backupRootAbsolute ("$archiveName.sha256.txt")
$mirrorShaPath = if ($mirrorRootAbsolute) { Join-Path $mirrorRootAbsolute ("$archiveName.sha256.txt") } else { $null }
$sqlPath = Join-Path $workingDir "database.sql"
$uploadsArchivePath = Join-Path $workingDir "uploads.zip"
$reportsArchivePath = Join-Path $workingDir "reports.zip"
$metadataTxtPath = Join-Path $workingDir "metadata.txt"
$metadataJsonPath = Join-Path $workingDir "metadata.json"
$script:LogPath = Join-Path $workingDir "backup.log"
$version = Get-SirelVersion $root
$uploadsDir = Join-Path $root "storage\uploads"
$reportsDir = Join-Path $root "storage\reports"

Ensure-Directory $workingDir
Set-Content -Path $lockPath -Value (@(
  "started_at=$($executionStart.ToString("o"))"
  "user=$([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)"
  "working_dir=$workingDir"
) -join [Environment]::NewLine) -Encoding utf8

$metadata = [ordered]@{
  system = "SIREL"
  version = $version
  startedAt = $executionStart.ToString("o")
  finishedAt = $null
  status = "PROCESSANDO"
  archiveName = $archiveName
  archivePath = $archivePath
  mirrorArchivePath = $mirrorArchivePath
  host = $env:COMPUTERNAME
  windowsUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  rootPath = $root
  database = [ordered]@{
    name = $dbName
    host = $dbHost
    port = $dbPort
    user = $dbUser
  }
  includes = [ordered]@{
    env = $false
    uploads = $false
    reports = $false
  }
  checksums = [ordered]@{
    databaseSqlSha256 = $null
    uploadsZipSha256 = $null
    reportsZipSha256 = $null
    envBackupSha256 = $null
    localArchiveSha256 = $null
    mirrorArchiveSha256 = $null
  }
  paths = [ordered]@{
    uploads = $uploadsDir
    reports = $reportsDir
    env = $envFile
    backupRoot = $backupRootAbsolute
    mirrorRoot = $mirrorRootAbsolute
  }
}

try {
  $pgDump = [string](Find-PgDump)
  Write-Log "Iniciando backup robusto do SIREL $version."
  Write-Log "Gerando dump PostgreSQL em $sqlPath."

  $previousPgPassword = [Environment]::GetEnvironmentVariable("PGPASSWORD", "Process")
  $env:PGPASSWORD = $dbPassword
  try {
    $quotedSqlPath = '"' + $sqlPath + '"'
    $dumpProcess = Start-Process -FilePath $pgDump -ArgumentList @(
      "--host=$dbHost",
      "--port=$dbPort",
      "--username=$dbUser",
      "--dbname=$dbName",
      "--file=$quotedSqlPath",
      "--no-owner",
      "--no-privileges"
    ) -NoNewWindow -PassThru -Wait
    if ($dumpProcess.ExitCode -ne 0 -or -not (Test-Path $sqlPath)) {
      throw "Falha ao gerar o dump PostgreSQL."
    }
    $metadata.checksums.databaseSqlSha256 = Get-FileSha256 $sqlPath
  } finally {
    if ($null -eq $previousPgPassword) {
      Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    } else {
      $env:PGPASSWORD = $previousPgPassword
    }
  }

  if (Test-DirectoryHasContent $uploadsDir) {
    Write-Log "Compactando storage/uploads em uploads.zip."
    New-ZipFromDirectory -SourcePath $uploadsDir -DestinationPath $uploadsArchivePath
    $metadata.includes.uploads = $true
    $metadata.checksums.uploadsZipSha256 = Get-FileSha256 $uploadsArchivePath
  } else {
    Write-Log "storage/uploads ausente ou vazio; seguindo sem uploads.zip." "WARN"
  }

  if ($IncludeReports -and (Test-DirectoryHasContent $reportsDir)) {
    Write-Log "Compactando storage/reports em reports.zip."
    New-ZipFromDirectory -SourcePath $reportsDir -DestinationPath $reportsArchivePath
    $metadata.includes.reports = $true
    $metadata.checksums.reportsZipSha256 = Get-FileSha256 $reportsArchivePath
  } elseif ($IncludeReports) {
    Write-Log "storage/reports ausente ou vazio; seguindo sem reports.zip." "WARN"
  } else {
    Write-Log "Inclusão de reports desativada por parâmetro."
  }

  if ($IncludeEnv -and (Test-Path $envFile)) {
    Write-Log "Copiando .env para .env.backup."
    Copy-Item -LiteralPath $envFile -Destination (Join-Path $workingDir ".env.backup") -Force
    $metadata.includes.env = $true
    $metadata.checksums.envBackupSha256 = Get-FileSha256 (Join-Path $workingDir ".env.backup")
  } elseif ($IncludeEnv) {
    Write-Log ".env não encontrado; seguindo sem .env.backup." "WARN"
  } else {
    Write-Log "Inclusão do .env desativada por parâmetro."
  }

  $metadata.status = "SUCESSO"
  $metadata.finishedAt = (Get-Date).ToString("o")
  $metadata.durationSeconds = [math]::Round(((Get-Date) - $executionStart).TotalSeconds, 2)
  $metadata.retentionCount = $RetentionCount

  $mirrorDescription = if ($mirrorArchivePath) { $mirrorArchivePath } else { "DESATIVADO" }
  $metadataText = @(
    "SIREL $version - Backup robusto local"
    "Data de inicio: $($executionStart.ToString("dd/MM/yyyy HH:mm:ss"))"
    "Data de fim: $((Get-Date).ToString("dd/MM/yyyy HH:mm:ss"))"
    "Banco: $dbName"
    "Host: ${dbHost}:$dbPort"
    "Usuario Windows: $([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)"
    "Raiz: $root"
    "Uploads incluidos: $($metadata.includes.uploads)"
    "Reports incluidos: $($metadata.includes.reports)"
    "Env incluido: $($metadata.includes.env)"
    "Destino local: $archivePath"
    "Destino espelhado: $mirrorDescription"
  )
  $metadataText | Set-Content -Path $metadataTxtPath -Encoding utf8
  ($metadata | ConvertTo-Json -Depth 6) | Set-Content -Path $metadataJsonPath -Encoding utf8

  Write-Log "Gerando pacote final $archiveName."
  if (Test-Path $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }
  New-ZipFromDirectory -SourcePath $workingDir -DestinationPath $archivePath
  if (-not (Test-Path $archivePath)) {
    throw "O pacote final não foi criado em $archivePath."
  }

  $metadata.checksums.localArchiveSha256 = Get-FileSha256 $archivePath
  if ($mirrorArchivePath) {
    Write-Log "Espelhando pacote para $mirrorArchivePath."
    Copy-Item -LiteralPath $archivePath -Destination $mirrorArchivePath -Force
    if (-not (Test-Path $mirrorArchivePath)) {
      throw "A cópia espelhada não foi criada em $mirrorArchivePath."
    }
    $metadata.checksums.mirrorArchiveSha256 = Get-FileSha256 $mirrorArchivePath
  } else {
    Write-Log "Espelhamento desativado; o backup permanece somente no destino local."
  }
  ($metadata | ConvertTo-Json -Depth 8) | Set-Content -Path $archiveMetadataPath -Encoding utf8
  $metadata.checksums.localArchiveSha256 | Set-Content -Path $archiveShaPath -Encoding ascii
  if ($mirrorArchivePath) {
    ($metadata | ConvertTo-Json -Depth 8) | Set-Content -Path $mirrorMetadataPath -Encoding utf8
    $metadata.checksums.mirrorArchiveSha256 | Set-Content -Path $mirrorShaPath -Encoding ascii
  }

  Write-Log "Aplicando retenção de $RetentionCount backups no destino local."
  Apply-Retention -TargetPath $backupRootAbsolute -KeepCount $RetentionCount
  if ($mirrorRootAbsolute) {
    Write-Log "Aplicando retenção de $RetentionCount backups no destino espelhado."
    Apply-Retention -TargetPath $mirrorRootAbsolute -KeepCount $RetentionCount
  }

  Write-Log "Backup concluído com sucesso: $archivePath"
  Write-Host "✅ Backup concluído: $archivePath" -ForegroundColor Green
  if ($mirrorArchivePath) {
    Write-Host "☁️ Cópia espelhada: $mirrorArchivePath" -ForegroundColor Green
  }
}
catch {
  $metadata.status = "ERRO"
  $metadata.finishedAt = (Get-Date).ToString("o")
  $metadata.durationSeconds = [math]::Round(((Get-Date) - $executionStart).TotalSeconds, 2)
  $metadata.error = $_.Exception.Message
  try {
    ($metadata | ConvertTo-Json -Depth 6) | Set-Content -Path $metadataJsonPath -Encoding utf8
  } catch {
    # sem ação adicional
  }
  Write-Log $_.Exception.Message "ERROR"
  throw
}
finally {
  Remove-LockFile $lockPath
  if (Test-Path $workingDir) {
    Remove-Item -LiteralPath $workingDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
