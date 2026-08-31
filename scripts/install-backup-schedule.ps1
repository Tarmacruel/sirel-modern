[CmdletBinding()]
param(
  [string]$TaskName = "SIREL Backup Automatico",
  [string]$BackupScriptPath = "",
  [string]$WorkingDirectory = "",
  [string]$MirrorRoot = "",
  [ValidateRange(1, 365)]
  [int]$RetentionCount = 10
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($MirrorRoot) {
  throw "Espelhamento agendado esta desabilitado ate a entrega da criptografia AES-256-GCM."
}

if (-not $BackupScriptPath) {
  $BackupScriptPath = Join-Path $PSScriptRoot "backup-local.ps1"
}
if (-not $WorkingDirectory) {
  $WorkingDirectory = Join-Path $PSScriptRoot ".."
}

if (-not (Test-Path $BackupScriptPath)) {
  throw "Script de backup não encontrado em $BackupScriptPath"
}

$resolvedBackupScript = (Resolve-Path $BackupScriptPath).Path
$resolvedWorkingDirectory = (Resolve-Path $WorkingDirectory).Path
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

$taskArguments = "-NoProfile -ExecutionPolicy Bypass -File `"$resolvedBackupScript`" -RetentionCount $RetentionCount"
if ($MirrorRoot) {
  $taskArguments += " -MirrorRoot `"$MirrorRoot`""
}

$taskAction = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument $taskArguments `
  -WorkingDirectory $resolvedWorkingDirectory

$taskTriggers = @(
  (New-ScheduledTaskTrigger -Daily -At "00:00"),
  (New-ScheduledTaskTrigger -Daily -At "12:00"),
  (New-ScheduledTaskTrigger -Daily -At "19:00")
)

$taskPrincipal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $taskAction `
  -Trigger $taskTriggers `
  -Principal $taskPrincipal `
  -Settings $taskSettings `
  -Description "Rotina automatica de backup local do SIREL com execucao as 00:00, 12:00 e 19:00 e retencao de $RetentionCount copias." `
  -Force

Write-Host "✅ Tarefa agendada instalada/atualizada: $TaskName" -ForegroundColor Green
Write-Host "Usuário: $currentUser"
Write-Host "Horários: 00:00, 12:00, 19:00"
Write-Host "Script: $resolvedBackupScript"
if ($MirrorRoot) {
  Write-Host "Espelho local adicional: $MirrorRoot"
} else {
  Write-Host "Espelhamento: desativado"
}
