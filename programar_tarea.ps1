# Registra (o actualiza) la tarea diaria en el Programador de tareas de Windows.
# Uso:  powershell -ExecutionPolicy Bypass -File programar_tarea.ps1 -Hora 07:30
param([string]$Hora = "07:30", [string]$Nombre = "AdNetworks_Descarga")

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = (Get-Command python).Source
$accion = New-ScheduledTaskAction -Execute $python -Argument "`"$dir\run.py`"" -WorkingDirectory $dir
$disparador = New-ScheduledTaskTrigger -Daily -At $Hora
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName $Nombre -Action $accion -Trigger $disparador -Settings $ajustes -Force |
    Select-Object TaskName, State
