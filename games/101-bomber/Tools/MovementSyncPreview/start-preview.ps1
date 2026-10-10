param([Parameter(Mandatory=$true)][string]$Config)
$ErrorActionPreference='Stop'
$settings=Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
$node=if($settings.node){[string]$settings.node}else{'node'}
$source=Join-Path $PSScriptRoot 'launch-preview.mjs'
& $node $source --verify $Config
if($LASTEXITCODE -ne 0){throw 'Final review and candidate seal refused before starting hidden wrapper'}
$attempt=Join-Path ([string]$settings.evidenceRoot) ('wrapper-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($attempt)
$stdout=Join-Path $attempt 'stdout.txt';$stderr=Join-Path $attempt 'stderr.txt'
try {
  $arguments=@('-NoProfile','-File',(Join-Path $PSScriptRoot 'launch-preview.ps1'),'-Config',$Config)
  $process=Start-Process pwsh -ArgumentList $arguments -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  $receipt=@{kind='MOVEMENT_PREVIEW_HIDDEN_WRAPPER';pid=$process.Id;startTime=$process.StartTime.ToUniversalTime().ToString('o');exe=$process.Path.Replace('\','/');cwd=$PSScriptRoot;args=$arguments;stdout=$stdout;stderr=$stderr;startedUtc=[DateTime]::UtcNow.ToString('o')}
  [IO.File]::WriteAllText((Join-Path $attempt 'start.json'),($receipt|ConvertTo-Json -Depth 5))
  $process.WaitForExit();$code=$process.ExitCode
  [IO.File]::WriteAllText((Join-Path $attempt 'exit.json'),((@{rawExitCode=$code;finishedUtc=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json)))
  exit $code
}catch{
  [IO.File]::WriteAllText((Join-Path $attempt 'first-failure.json'),((@{at=[DateTime]::UtcNow.ToString('o');error=($_|Out-String)}|ConvertTo-Json)))
  exit 1
}
