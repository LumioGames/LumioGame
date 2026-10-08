import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectDefenderDiagnostic } from './defender-diagnostic.mjs';

const targetPath = 'C:\\Games\\Engine\\lumio-ds.exe';
const startedAt = '2026-09-30T10:00:00.000Z';
const event = (resources, timeCreatedUtc = '2026-09-30T10:00:05.000Z') => ({
  eventId: 1117, recordId: 42, timeCreatedUtc, resources,
  detectionId: 'det-1', threatId: '123', threatName: 'Test', actionId: '2', actionName: 'Quarantine', resultCode: '0',
});
const source = (events, changes = {}) => JSON.stringify({
  statusQuery: { availability: 'available', realTimeProtectionEnabled: true, antivirusEnabled: true,
    isTamperProtected: true, antivirusSignatureVersion: '1.2.3', engineVersion: '1.4.5',
    productVersion: '4.18', antivirusSignatureLastUpdatedUtc: '2026-09-30T09:00:00Z' },
  eventQuery: { availability: 'available' }, events, ...changes,
});
const run = (stdout, options = {}) => collectDefenderDiagnostic({ targetPath, startedAt,
  platform: 'win32', now: '2026-09-30T10:01:00.000Z',
  execute: async () => ({ stdout, exitCode: 0 }), ...options });

test('exact Windows path matching ignores similar names and retains only target resources', async () => {
  const result = await run(source([
    event(['file:_c:\\games\\engine\\LUMIO-DS.EXE', 'file:_C:\\Other\\unrelated.exe']),
    event(['file:_C:\\Games\\Engine\\lumio-ds.exe.bak']),
    event(['file:_C:\\Games\\Engine\\lumio-ds-helper.exe']),
  ]));
  assert.equal(result.status, 'correlated-events');
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0].resources, [targetPath]);
  assert.equal(result.events[0].relation, 'during-run');
  assert.equal(result.events[0].recordId, 42);
});

test('older exact-target action is historical evidence', async () => {
  const result = await run(source([event([targetPath], '2026-09-29T12:00:00.000Z')]));
  assert.equal(result.status, 'correlated-events');
  assert.equal(result.events[0].relation, 'historical');
});

test('empty query is no-related-events, while partial or failed queries are unavailable', async () => {
  assert.equal((await run(source([]))).status, 'no-related-events');
  for (const changes of [
    { eventQuery: { availability: 'unavailable', reason: 'access-denied' } },
    { eventQuery: { availability: 'unavailable', reason: 'query-limit' } },
    { statusQuery: { availability: 'unavailable', reason: 'access-denied' } },
  ]) {
    const result = await run(source([], changes));
    assert.equal(result.status, 'unavailable');
    assert.equal(result.eventQuery.availability, changes.eventQuery?.availability ?? 'available');
  }
});

test('malformed, oversized and timed-out collection never imply a clean query', async () => {
  assert.equal((await run('{')).status, 'unavailable');
  assert.equal((await run('x'.repeat(100_000))).status, 'unavailable');
  assert.equal((await run('', { execute: async () => { throw Object.assign(new Error('private details'), { code: 'ETIMEDOUT' }); } })).status, 'unavailable');
  assert.equal((await run(source([]), { platform: 'linux', execute: async () => { throw new Error('called'); } })).status, 'not-applicable');
});

test('incomplete status and malformed event records cannot report no-related-events', async () => {
  const incomplete = await run(source([], { statusQuery: { availability: 'available' } }));
  assert.equal(incomplete.status, 'unavailable');
  assert.equal(incomplete.statusQuery.reason, 'malformed-output');
  for (const malformed of [
    { ...event([targetPath]), eventId: 9999 },
    { ...event([targetPath]), timeCreatedUtc: 'invalid-date' },
    { ...event([targetPath]), resources: null },
  ]) assert.equal((await run(source([malformed]))).status, 'unavailable');
});

test('PowerShell record parsing failures remain unavailable after successful event lookup',
  { skip: process.platform !== 'win32' }, t => {
    const scratch = mkdtempSync(join(tmpdir(), 'bomber-defender-script-'));
    t.after(() => rmSync(scratch, { recursive: true, force: true }));
    const harness = join(scratch, 'harness.ps1');
    writeFileSync(harness, String.raw`
param([string]$DiagnosticScript, [string]$Case)
function Get-MpComputerStatus {
  [pscustomobject]@{ RealTimeProtectionEnabled=$true; AntivirusEnabled=$true;
    IsTamperProtected=$true; AntivirusSignatureVersion='1.2.3'; AMEngineVersion='1.4.5';
    AMProductVersion='4.18'; AntivirusSignatureLastUpdated=[datetime]'2026-09-30T09:00:00Z' }
}
function Get-WinEvent {
  [CmdletBinding()]param($FilterHashtable, $MaxEvents)
  if ($Case -eq 'empty') { Write-Error 'No records' -ErrorId NoMatchingEventsFound -ErrorAction Stop }
  $record = [pscustomobject]@{ Id=1117; RecordId=42; TimeCreated=[datetime]'2026-09-30T10:00:05Z' }
  $record | Add-Member -MemberType ScriptMethod -Name ToXml -Value {
    if ($Case -eq 'throwing-xml') { throw 'Invalid event XML' }
    if ($Case -eq 'malformed-xml') { return '<Event' }
    return '<Event><EventData><Data Name="Path">file:_c:\games\engine\LUMIO-DS.EXE;file:_C:\Other\unrelated.exe</Data><Data Name="Threat Name">Fixture</Data></EventData></Event>'
  }
  return $record
}
. $DiagnosticScript -TargetPath 'C:\Games\Engine\lumio-ds.exe' -FromUtc '2026-09-30T09:00:00Z' -ThroughUtc '2026-09-30T11:00:00Z'
`);
    const script = fileURLToPath(new URL('./defender-diagnostic.ps1', import.meta.url));
    for (const scenario of ['valid', 'empty', 'throwing-xml', 'malformed-xml']) {
      const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
        '-File', harness, '-DiagnosticScript', script, '-Case', scenario],
      { encoding: 'utf8', timeout: 8000, windowsHide: true });
      assert.equal(result.status, 0, result.stderr);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.eventQuery.availability,
        scenario.endsWith('xml') ? 'unavailable' : 'available', scenario);
      if (scenario.endsWith('xml')) assert.equal(parsed.eventQuery.reason, 'query-failed');
      if (scenario === 'valid') {
        assert.equal(parsed.events.length, 1);
        assert.deepEqual(parsed.events[0].resources, [targetPath]);
      }
      if (scenario === 'empty') assert.deepEqual(parsed.events, []);
    }
  });
