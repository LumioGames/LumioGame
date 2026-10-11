param([int[]]$Pids,[switch]$Listeners)
$ErrorActionPreference='Stop'
function Identity([int]$ProcessId) {
  $ownedProcess=Get-Process -Id $ProcessId -ErrorAction Stop
  if($null -eq $ownedProcess.StartTime -or [string]::IsNullOrWhiteSpace([string]$ownedProcess.Path)) { throw 'preview_process_identity_unavailable' }
  @{pid=$ProcessId;startTime=$ownedProcess.StartTime.ToUniversalTime().ToString('o');exe=([string]$ownedProcess.Path).Replace('\','/')}
}
if($Listeners){
  $result=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | ForEach-Object {
    $listener=$_
    try { $row=Identity $listener.OwningProcess; $row.identityAvailable=$true }
    catch { $row=@{pid=[int]$listener.OwningProcess;startTime=$null;exe=$null;identityAvailable=$false;identityErrorClass=$_.Exception.GetType().FullName;identityError=$_.Exception.Message} }
    $row.localPort=$listener.LocalPort; $row.localAddress=$listener.LocalAddress; $row
  }); ConvertTo-Json -Depth 4 -Compress -InputObject $result
} else {ConvertTo-Json -Depth 4 -Compress -InputObject @($Pids | ForEach-Object {Identity $_})}
