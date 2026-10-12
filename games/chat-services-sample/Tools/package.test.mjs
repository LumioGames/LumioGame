import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildFixturePackage } from './package-test-helper.mjs';

test('official package whitelists view and spirit and resolves both HTML entry resources', async () => {
  const output = await buildFixturePackage();
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(output, 'publication-manifest.json'), 'utf8'));
    const paths = manifest.files.map(file => file.path);
    assert.ok(paths.includes('Client/view.mjs'), 'dedicated UI module must ship');
    assert.ok(paths.includes('Client/assets/spirit-sequence.webp'), 'local sprite sheet must ship');
    for (const name of ['index.html', 'Client/index.html']) {
      const html = await fs.readFile(path.join(output, name), 'utf8');
      for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) {
        const target = path.resolve(output, path.dirname(name), match[1]);
        assert.ok((await fs.stat(target)).isFile(), `${name}: ${match[1]}`);
      }
    }
    const css = await fs.readFile(path.join(output, 'Client/style.css'), 'utf8');
    assert.match(css, /assets\/spirit-sequence\.webp/);
    assert.equal(await fs.readFile(path.join(output, 'Client/session.mjs'), 'utf8'), await fs.readFile(new URL('../Client/session.mjs', import.meta.url), 'utf8'));
  } finally { await fs.rm(output, { recursive: true, force: true }); }
});
