param([ValidateSet('Install', 'Status', 'Disable', 'Enable', 'Remove')][string]$Action = 'Status')
$ErrorActionPreference = 'Stop'
$taskName = 'Pulse Next - T3 release candidate'
$repoPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
switch ($Action) {
  'Install' {
    if ($existing) { throw 'Task already exists. Inspect it with -Action Status; do not overwrite another registration.' }
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    $entryPath = Join-Path $PSScriptRoot 'run.mjs'
    $taskAction = New-ScheduledTaskAction -Execute $nodePath -Argument ('"' + $entryPath + '" candidate') -WorkingDirectory $repoPath
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 1)
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Settings $settings -Principal $principal -Description 'Hourly stable T3 release check and isolated source preparation. No AI, host install, publication or automatic repair.'
  }
  'Status' { $existing | Select-Object TaskName, State, Actions, Triggers; if ($existing) { Get-ScheduledTaskInfo -TaskName $taskName } }
  'Disable' { Disable-ScheduledTask -TaskName $taskName }
  'Enable' { Enable-ScheduledTask -TaskName $taskName }
  'Remove' { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
}
