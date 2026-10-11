param([Parameter(Mandatory=$true)][string]$Config)
$ErrorActionPreference='Stop'
$rawExit=1;$keys=$null;$privateHex=$null;$info=$null
$source=Join-Path $PSScriptRoot 'launch-preview.mjs'
$settings=Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
$node=if($settings.node){[string]$settings.node}else{'node'}
function Safe([string]$value){if($privateHex){return $value.Replace($privateHex,'[REDACTED]')};return $value}
try {
  & $node $source --verify $Config
  if($LASTEXITCODE -ne 0){throw 'Final review and candidate seal refused before signer generation'}
  $platformRoot=[string]$settings.infrastructure.platformRoot
  [void][Reflection.Assembly]::LoadFrom((Join-Path $platformRoot 'BouncyCastle.Cryptography.dll'))
  [void][Reflection.Assembly]::LoadFrom((Join-Path $platformRoot 'Lumio.Platform.Account.dll'))
  $keys=[Lumio.Platform.Account.Ed25519Keys]::Generate()
  $privateHex=[Convert]::ToHexString($keys.Item1).ToLowerInvariant()
  $info=[Diagnostics.ProcessStartInfo]::new()
  $info.FileName=$node;$info.ArgumentList.Add($source);$info.ArgumentList.Add('--run');$info.ArgumentList.Add($Config)
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  foreach($name in @($info.Environment.Keys)){
    if($name -match '^(PLATFORM_|Platform__|LUMIO_|PG|LumioBot)'){[void]$info.Environment.Remove($name)}
  }
  $info.Environment['LUMIO_ACCOUNT_ADMISSION_PRIVATE_KEY_HEX']=$privateHex
  $info.Environment['LUMIO_ACCOUNT_ADMISSION_PUBLIC_KEY_HEX']=[Convert]::ToHexString($keys.Item2).ToLowerInvariant()
  $process=[Diagnostics.Process]::new();$process.StartInfo=$info
  [void]$process.Start()
  $out=$process.StandardOutput.ReadLineAsync();$err=$process.StandardError.ReadLineAsync();$outDone=$false;$errDone=$false
  while(!$outDone -or !$errDone){
    if(!$outDone -and $out.IsCompleted){$line=$out.GetAwaiter().GetResult();if($null -eq $line){$outDone=$true}else{[Console]::Out.WriteLine((Safe $line));$out=$process.StandardOutput.ReadLineAsync()}}
    if(!$errDone -and $err.IsCompleted){$line=$err.GetAwaiter().GetResult();if($null -eq $line){$errDone=$true}else{[Console]::Error.WriteLine((Safe $line));$err=$process.StandardError.ReadLineAsync()}}
    if(!$outDone -or !$errDone){Start-Sleep -Milliseconds 10}
  }
  $process.WaitForExit();$rawExit=$process.ExitCode
}catch{[Console]::Error.WriteLine((Safe ($_|Out-String)))}finally{
  if($info){[void]$info.Environment.Remove('LUMIO_ACCOUNT_ADMISSION_PRIVATE_KEY_HEX')}
  if($keys){[Array]::Clear($keys.Item1)}
  $keys=$null;$privateHex=$null
  if($process){$process.Dispose()}
}
exit $rawExit
