[CmdletBinding()]
param(
  [string]$TaskName = "SIREL Backup Automatico",
  [string]$BackupScriptPath = "",
  [string]$WorkingDirectory = "",
  [string]$MirrorRoot = "C:\Users\078364\OneDrive\BACKUPS",
  [int]$RetentionCount = 10
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

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

$taskAction = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$resolvedBackupScript`" -MirrorRoot `"$MirrorRoot`" -RetentionCount $RetentionCount" `
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

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $taskAction `
  -Trigger $taskTriggers `
  -Principal $taskPrincipal `
  -Settings $taskSettings `
  -Description "Rotina automatica de backup do SIREL com execucao as 00:00, 12:00 e 19:00, retencao de 10 copias e espelhamento em OneDrive."

Write-Host "✅ Tarefa agendada instalada/atualizada: $TaskName" -ForegroundColor Green
Write-Host "Usuário: $currentUser"
Write-Host "Horários: 00:00, 12:00, 19:00"
Write-Host "Script: $resolvedBackupScript"
Write-Host "Espelho: $MirrorRoot"
