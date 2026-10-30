$ErrorActionPreference = 'Stop'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$jobPath = Join-Path $PSScriptRoot 'src\daily.js'
$process = Start-Process -FilePath $nodePath -ArgumentList ('"' + $jobPath + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -Wait -PassThru
exit $process.ExitCode
