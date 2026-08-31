[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupArchivePath,
  [string]$RestoreRoot = "",
  [bool]$RestoreDatabase = $true,
  [bool]$RestoreUploads = $false,
  [bool]$RestoreReports = $false,
  [bool]$RestoreEnv = $false,
  [string]$TargetDatabaseUrl = "",
  [switch]$AllowLegacyBackup,
  [switch]$AllowOperationalTarget,
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not $RestoreRoot) {
  $RestoreRoot = Join-Path $PSScriptRoot ".."
}

$resolvedRoot = (Resolve-Path $RestoreRoot).Path
$resolvedArchive = (Resolve-Path $BackupArchivePath).Path
$tempRoot = Join-Path $resolvedRoot "storage\restore-temp"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$workingDir = Join-Path $tempRoot ("restore-$timestamp")
$logPath = Join-Path $workingDir "restore.log"

function Write-Log([string]$Message, [string]$Level = "INFO") {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$Level] $Message"
  Write-Host $line
  if ($script:LogPath) {
    Add-Content -LiteralPath $script:LogPath -Value $line -Encoding utf8
  }
}

function Ensure-Directory([string]$Path) {
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function Get-EnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path $Path)) { return $null }
  $line = Get-Content $Path | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -replace "^$Name=", "").Trim().Trim([char]34).Trim([char]39)
}

function Find-Psql {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName "bin\psql.exe" } |
    Where-Object { Test-Path $_ }

  if ($candidates) { return ($candidates | Select-Object -First 1) }

  throw "psql não foi encontrado. Instale o PostgreSQL client tools nesta máquina."
}

function Get-FileSha256([string]$Path) {
  if (-not (Test-Path $Path)) { return $null }
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
}

function Get-ExpectedChecksum($Checksums, [string]$PropertyName) {
  if (-not $Checksums) { return $null }
  $property = $Checksums.PSObject.Properties[$PropertyName]
  if (-not $property) { return $null }
  return [string]$property.Value
}

function Get-DatabaseIdentity([string]$DatabaseUrl) {
  $uri = [System.Uri]$DatabaseUrl
  $port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
  $databaseName = [System.Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart("/"))
  return "$($uri.Host.ToLowerInvariant()):$port/$databaseName"
}

function Restore-ZippedDirectory([string]$ZipPath, [string]$TargetDir, [string]$Label) {
  if (-not (Test-Path $ZipPath)) {
    Write-Log "$Label ausente no pacote, pulando restauração." "WARN"
    return
  }

  $backupDir = "$TargetDir.before-restore-$timestamp"
  if (Test-Path $TargetDir) {
    Move-Item -LiteralPath $TargetDir -Destination $backupDir -Force
    Write-Log "$Label anterior preservado em $backupDir."
  }

  Ensure-Directory $TargetDir
  [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $TargetDir)
  Write-Log "$Label restaurado em $TargetDir."
}

try {
  Ensure-Directory $workingDir
  $script:LogPath = $logPath
  Write-Log "Iniciando restauração assistida do backup $resolvedArchive."

  [System.IO.Compression.ZipFile]::ExtractToDirectory($resolvedArchive, $workingDir)
  $metadataPath = Join-Path $workingDir "metadata.json"
  if (-not (Test-Path $metadataPath)) {
    throw "metadata.json não encontrado dentro do backup."
  }

  $metadata = Get-Content -Raw $metadataPath | ConvertFrom-Json
  Write-Log "Backup detectado: SIREL $($metadata.version) - status $($metadata.status)."

  $backupStatus = [string]$metadata.status
  if (-not $backupStatus) {
    if (-not $AllowLegacyBackup) {
      throw "Backup legado sem status verificavel. Use -AllowLegacyBackup somente apos confirmacao explicita da origem."
    }
    Write-Log "Backup legado sem status; excecao confirmada por -AllowLegacyBackup." "WARN"
  } elseif ($backupStatus -ne "SUCESSO") {
    throw "Backup recusado porque metadata.status nao e SUCESSO: $backupStatus"
  }

  $checksumBag = $null
  if ($metadata.PSObject.Properties["checksums"]) {
    $checksumBag = $metadata.checksums
  } else {
    if (-not $AllowLegacyBackup) {
      throw "Backup sem bloco de checksums. Use -AllowLegacyBackup somente apos confirmacao explicita da origem."
    }
    Write-Log "Backup legado sem bloco de checksums; excecao confirmada." "WARN"
  }

  $checks = [ordered]@{
    database = @{
      path = Join-Path $workingDir "database.sql"
      expected = Get-ExpectedChecksum -Checksums $checksumBag -PropertyName "databaseSqlSha256"
    }
    uploads = @{
      path = Join-Path $workingDir "uploads.zip"
      expected = Get-ExpectedChecksum -Checksums $checksumBag -PropertyName "uploadsZipSha256"
    }
    reports = @{
      path = Join-Path $workingDir "reports.zip"
      expected = Get-ExpectedChecksum -Checksums $checksumBag -PropertyName "reportsZipSha256"
    }
    env = @{
      path = Join-Path $workingDir ".env.backup"
      expected = Get-ExpectedChecksum -Checksums $checksumBag -PropertyName "envBackupSha256"
    }
  }

  foreach ($name in $checks.Keys) {
    $entry = $checks[$name]
    $componentExists = Test-Path $entry.path
    $componentSelected = switch ($name) {
      "database" { $RestoreDatabase }
      "uploads" { $RestoreUploads }
      "reports" { $RestoreReports }
      "env" { $RestoreEnv }
      default { $false }
    }
    $declaredIncluded = $false
    if ($metadata.PSObject.Properties["includes"] -and $metadata.includes) {
      $includeProperty = $metadata.includes.PSObject.Properties[$name]
      $declaredIncluded = $includeProperty -and [bool]$includeProperty.Value
    }
    $componentRequired = $componentSelected -or $componentExists -or $declaredIncluded
    if ($componentRequired -and -not $componentExists) {
      throw "Componente obrigatorio ausente no backup: $name"
    }
    if (-not $entry.expected) {
      if (-not $componentRequired) {
        continue
      }
      if (-not $AllowLegacyBackup) {
        throw "Checksum obrigatorio ausente para $name."
      }
      Write-Log "Checksum ausente para $name; excecao legada confirmada." "WARN"
      continue
    }
    $actual = Get-FileSha256 $entry.path
    if ($actual -ne $entry.expected) {
      throw "Checksum SHA-256 inválido para $name. Esperado: $($entry.expected). Atual: $actual"
    }
    Write-Log "Checksum validado para $name."
  }

  if (-not $Apply) {
    Write-Log "Modo validação: nenhum dado foi restaurado. Use -Apply para executar a restauração."
    Write-Host ""
    Write-Host "Resumo da restauração assistida"
    Write-Host "Arquivo: $resolvedArchive"
    Write-Host "Banco: $RestoreDatabase"
    Write-Host "Uploads: $RestoreUploads"
    Write-Host "Reports: $RestoreReports"
    Write-Host "Env: $RestoreEnv"
    exit 0
  }

  if ($RestoreDatabase) {
    if ($AllowLegacyBackup -and $AllowOperationalTarget) {
      throw "Nao e permitido combinar backup legado sem integridade comprovada com destino operacional."
    }
    if (-not $TargetDatabaseUrl) {
      throw "-TargetDatabaseUrl e obrigatoria quando -Apply restaura o banco. O script nao usa DATABASE_URL implicitamente."
    }

    $envFile = Join-Path $resolvedRoot ".env"
    $databaseUrl = $TargetDatabaseUrl.Trim().Trim([char]34).Trim([char]39)
    $operationalDatabaseUrl = Get-EnvValue -Path $envFile -Name "DATABASE_URL"
    if (
      $operationalDatabaseUrl -and
      (Get-DatabaseIdentity $databaseUrl) -eq (Get-DatabaseIdentity $operationalDatabaseUrl) -and
      -not $AllowOperationalTarget
    ) {
      throw "O destino coincide com DATABASE_URL. Use um banco vazio isolado ou confirme deliberadamente com -AllowOperationalTarget."
    }

    $uri = [System.Uri]$databaseUrl
    if ($uri.Scheme -notin @("postgres", "postgresql")) {
      throw "TargetDatabaseUrl deve usar o esquema postgres ou postgresql."
    }
    $dbName = [System.Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart("/"))
    $userInfo = $uri.UserInfo.Split(":", 2)
    $dbUser = [System.Uri]::UnescapeDataString($userInfo[0])
    $dbPassword = if ($userInfo.Count -gt 1) {
      [System.Uri]::UnescapeDataString($userInfo[1])
    } else {
      ""
    }
    $dbHost = $uri.Host
    $dbPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
    $psql = [string](Find-Psql)
    $databaseSqlPath = Join-Path $workingDir "database.sql"
    if (-not (Test-Path $databaseSqlPath)) {
      throw "database.sql não encontrado no backup."
    }

    $previousPgPassword = [Environment]::GetEnvironmentVariable("PGPASSWORD", "Process")
    $env:PGPASSWORD = $dbPassword
    try {
      $objectCountOutput = & $psql `
        "--host=$dbHost" `
        "--port=$dbPort" `
        "--username=$dbUser" `
        "--dbname=$dbName" `
        "--no-psqlrc" `
        "--tuples-only" `
        "--no-align" `
        "--set=ON_ERROR_STOP=1" `
        "--command=SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname !~ '^pg_toast' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f');"
      if ($LASTEXITCODE -ne 0) {
        throw "Nao foi possivel verificar se o banco de destino esta vazio."
      }
      $objectCountText = ($objectCountOutput | Out-String).Trim()
      $objectCount = 0
      if (-not [int]::TryParse($objectCountText, [ref]$objectCount)) {
        throw "Resposta inesperada ao verificar o banco de destino: $objectCountText"
      }
      if ($objectCount -ne 0) {
        throw "O banco de destino contem $objectCount objeto(s). A restauracao SQL exige um banco vazio e isolado."
      }

      Write-Log "Restaurando banco vazio $dbName em ${dbHost}:$dbPort."
      $quotedSqlPath = '"' + $databaseSqlPath + '"'
      $psqlProcess = Start-Process -FilePath $psql -ArgumentList @(
        "--host=$dbHost",
        "--port=$dbPort",
        "--username=$dbUser",
        "--dbname=$dbName",
        "--no-psqlrc",
        "--file=$quotedSqlPath",
        "--single-transaction",
        "--set=ON_ERROR_STOP=1"
      ) -NoNewWindow -PassThru -Wait
      if ($psqlProcess.ExitCode -ne 0) {
        throw "Falha ao restaurar o banco PostgreSQL."
      }
    } finally {
      if ($null -eq $previousPgPassword) {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
      } else {
        $env:PGPASSWORD = $previousPgPassword
      }
    }
  }

  if ($RestoreUploads) {
    Restore-ZippedDirectory -ZipPath (Join-Path $workingDir "uploads.zip") -TargetDir (Join-Path $resolvedRoot "storage\uploads") -Label "Uploads"
  }

  if ($RestoreReports) {
    Restore-ZippedDirectory -ZipPath (Join-Path $workingDir "reports.zip") -TargetDir (Join-Path $resolvedRoot "storage\reports") -Label "Reports"
  }

  if ($RestoreEnv) {
    $envBackupPath = Join-Path $workingDir ".env.backup"
    if (-not (Test-Path $envBackupPath)) {
      Write-Log ".env.backup ausente no pacote, pulando restauração do .env." "WARN"
    } else {
      $targetEnv = Join-Path $resolvedRoot ".env"
      if (Test-Path $targetEnv) {
        Copy-Item -LiteralPath $targetEnv -Destination "$targetEnv.before-restore-$timestamp" -Force
      }
      Copy-Item -LiteralPath $envBackupPath -Destination $targetEnv -Force
      Write-Log ".env restaurado em $targetEnv."
    }
  }

  Write-Log "Restauração concluída com sucesso."
}
finally {
  if (Test-Path $workingDir) {
    Remove-Item -LiteralPath $workingDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
