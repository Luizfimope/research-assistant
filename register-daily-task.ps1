param([string]$Time = '07:00')
$ErrorActionPreference = 'Stop'
$null = Get-Command node -ErrorAction Stop
$jobPath = Join-Path $PSScriptRoot 'run-daily-hidden.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -File "' + $jobPath + '"') -WorkingDirectory $PSScriptRoot
$dailyTrigger = New-ScheduledTaskTrigger -Daily -At $Time
$loginTrigger = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName 'ResearchAssistantDaily' -Action $action -Trigger @($dailyTrigger,$loginTrigger) -Settings $settings -Description 'Artigos do dia anterior às 07h ou ao entrar no Windows, sem reenvio da edição já enviada' -Force
