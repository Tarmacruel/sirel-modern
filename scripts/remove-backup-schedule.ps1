[CmdletBinding()]
param(
  [string]$TaskName = "SIREL Backup Automatico"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $existingTask) {
  Write-Host "ℹ️ Nenhuma tarefa encontrada com o nome: $TaskName" -ForegroundColor Yellow
  exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "✅ Tarefa removida: $TaskName" -ForegroundColor Green
