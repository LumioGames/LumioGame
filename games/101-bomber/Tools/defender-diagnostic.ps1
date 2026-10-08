param(
  [Parameter(Mandatory = $true)][string]$TargetPath,
  [Parameter(Mandatory = $true)][datetime]$FromUtc,
  [Parameter(Mandatory = $true)][datetime]$ThroughUtc
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$statusQuery = @{ availability = 'unavailable'; reason = 'query-failed' }
$eventQuery = @{ availability = 'unavailable'; reason = 'query-failed' }
$events = @()

try {
  $status = Get-MpComputerStatus -ErrorAction Stop
  $statusQuery = @{
    availability = 'available'
    realTimeProtectionEnabled = [bool]$status.RealTimeProtectionEnabled
    antivirusEnabled = [bool]$status.AntivirusEnabled
    isTamperProtected = [bool]$status.IsTamperProtected
    antivirusSignatureVersion = [string]$status.AntivirusSignatureVersion
    engineVersion = [string]$status.AMEngineVersion
    productVersion = [string]$status.AMProductVersion
    antivirusSignatureLastUpdatedUtc = if ($status.AntivirusSignatureLastUpdated) { $status.AntivirusSignatureLastUpdated.ToUniversalTime().ToString('o') } else { '' }
  }
} catch {
  if ($_.Exception -is [System.UnauthorizedAccessException]) { $statusQuery.reason = 'access-denied' }
}

try {
  $records = @(Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-Windows Defender/Operational'
    Id = @(1116, 1117)
    StartTime = $FromUtc
    EndTime = $ThroughUtc
  } -MaxEvents 201 -ErrorAction Stop)
  $eventQuery = if ($records.Count -gt 200) {
    @{ availability = 'unavailable'; reason = 'query-limit' }
  } else { @{ availability = 'available' } }
  foreach ($record in ($records | Select-Object -First 200)) {
    $xml = [xml]$record.ToXml()
    $fields = @{}
    foreach ($data in $xml.Event.EventData.Data) {
      if ($data.Name) { $fields[[string]$data.Name] = [string]$data.'#text' }
    }
    $matched = @()
    foreach ($name in @('Path', 'Resources')) {
      if (-not $fields.ContainsKey($name)) { continue }
      foreach ($resource in ($fields[$name] -split '[\r\n;]+')) {
        $path = ($resource.Trim() -replace '^(?i:file:_?)', '')
        if ([string]::Equals($path, $TargetPath, [System.StringComparison]::OrdinalIgnoreCase)) {
          $matched += $TargetPath
        }
      }
    }
    if ($matched.Count -eq 0) { continue }
    $events += @{
      eventId = [int]$record.Id
      recordId = [long]$record.RecordId
      timeCreatedUtc = $record.TimeCreated.ToUniversalTime().ToString('o')
      resources = @($TargetPath)
      detectionId = [string]$fields['Detection ID']
      threatId = [string]$fields['Threat ID']
      threatName = [string]$fields['Threat Name']
      actionId = [string]$fields['Action ID']
      actionName = [string]$fields['Action Name']
      resultCode = [string]$fields['Status Code']
      errorCode = [string]$fields['Error Code']
      postCleanStatus = [string]$fields['Post Clean Status']
    }
    if ($events.Count -ge 20) { break }
  }
} catch {
  if ($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') {
    $eventQuery = @{ availability = 'available' }
  } elseif ($_.Exception -is [System.UnauthorizedAccessException]) {
    $eventQuery = @{ availability = 'unavailable'; reason = 'access-denied' }
  } else {
    $eventQuery = @{ availability = 'unavailable'; reason = 'query-failed' }
  }
}

@{ statusQuery = $statusQuery; eventQuery = $eventQuery; events = @($events) } |
  ConvertTo-Json -Depth 5 -Compress
