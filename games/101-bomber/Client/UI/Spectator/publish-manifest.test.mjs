import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Page-owned modules are listed one by one in the host project; only Engine web modules come
// from the release by wildcard. A page import missing from the list is a 404 in the published page.
const here = new URL('./', import.meta.url);
const project = fs.readFileSync(new URL('host/Lumio.Bomber.Client.Spectator.csproj', here), 'utf8');

test('every page-owned module the page imports is published', () => {
  const imported = new Set();
  for (const page of ['main.js', 'game-view.mjs']) {
    const source = fs.readFileSync(new URL(page, here), 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\(\s*)["']\.\/([\w-]+\.mjs)["']/g)) imported.add(match[1]);
  }
  const owned = [...imported].filter(name => fs.existsSync(new URL(name, here)));
  assert.ok(owned.includes('player-controls.mjs') && owned.includes('game-view.mjs'), 'scan found the page modules');
  for (const name of owned)
    assert.ok(project.includes(`Include="..\\${name}"`), `${name} is imported by the page but not published`);
});
