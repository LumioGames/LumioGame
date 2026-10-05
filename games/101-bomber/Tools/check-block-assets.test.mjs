import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  C0_BLOCKS,
  assetRefToPath,
  checkAlpha,
  checkBlockAssets,
  decodePng,
  parseSourcesTable,
  resolveSlots,
  validateDescription,
  validatePack,
} from './check-block-assets.mjs';
import {
  KENNEY_DERIVED,
  TEXTURE_NAMES,
  TEXTURE_SIZE,
  deriveKenney,
  encodePng,
  renderFinalTexture,
  renderTexture,
} from '../Client/Assets/Blocks/source/generate-textures.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const F = 'lumio.block-asset.v1';

// 以下七格期望照抄契约 block-asset-v1 faceResolution.vectors（LumioGameEngine af56fb1）的语义。
test('faceResolution: all / side / 具体面键的覆盖优先级', () => {
  const S = 'textures/stone.png';
  assert.deepEqual(resolveSlots({ format: F, faces: { all: S } }), [S, S, S, S, S, S, null]);
  assert.deepEqual(
    resolveSlots({ format: F, faces: { top: 'textures/g.png', bottom: 'textures/d.png', side: 'textures/s.png' } }),
    ['textures/d.png', 'textures/g.png', 'textures/s.png', 'textures/s.png', 'textures/s.png', 'textures/s.png', null],
  );
  assert.deepEqual(
    resolveSlots({ format: F, faces: { north: 'textures/n.png', all: 'textures/p.png' } }),
    ['textures/p.png', 'textures/p.png', 'textures/n.png', 'textures/p.png', 'textures/p.png', 'textures/p.png', null],
  );
  assert.deepEqual(
    resolveSlots({ format: F, faces: { all: 'textures/t.png', side: 'textures/s.png' } }),
    ['textures/t.png', 'textures/t.png', 'textures/s.png', 'textures/s.png', 'textures/s.png', 'textures/s.png', null],
  );
  assert.deepEqual(resolveSlots({ format: F, faces: {}, cross: 'textures/f.png' }), [null, null, null, null, null, null, 'textures/f.png']);
});

test('不合法的描述七格全是 null', () => {
  const nulls = Array(7).fill(null);
  assert.deepEqual(resolveSlots({ format: F, faces: { front: 'textures/x.png' } }), nulls);
  assert.deepEqual(resolveSlots({ faces: { all: 'textures/x.png' } }), nulls);
  assert.deepEqual(resolveSlots({ format: F, faces: { all: 3 } }), nulls);
  assert.ok(validateDescription({ format: F, faces: {}, layer: 1 }).length > 0, '不认的顶层键');
  assert.ok(validateDescription({ format: F, faces: { all: '../x.png' } }).length > 0, '路径不得含 ..');
  assert.ok(validateDescription({ format: F, faces: { all: '/x.png' } }).length > 0, '路径不得以 / 开头');
  assert.ok(validateDescription({ format: F, faces: { all: 'x.jpg' } }).length > 0, '只收 .png');
  assert.ok(validateDescription({ format: F, faces: {}, license: { spdx: 1 } }).length > 0);
  assert.deepEqual(validateDescription({ format: F, faces: {}, cross: 'textures/f.png', license: { spdx: 'CC0-1.0' } }), []);
});

test('assetRef 解析到 Blocks/<id>.json，不合语法返回 null', () => {
  assert.equal(assetRefToPath('asset://blocks/lumio.stone'), 'Blocks/lumio.stone.json');
  assert.equal(assetRefToPath('asset://blocks/Lumio.Stone'), null);
  assert.equal(assetRefToPath('asset://blocks/.hidden'), null);
  assert.equal(assetRefToPath('asset://blocks/a..b'), null);
  assert.equal(assetRefToPath('asset://items/lumio.stone'), null);
});

test('pack.json：textureSize 是 16 ~ 512 的 2 的幂', () => {
  const pack = (textureSize) => ({ format: 'lumio.block-asset-pack.v1', textureSize });
  assert.deepEqual(validatePack(pack(16)), []);
  assert.deepEqual(validatePack(pack(512)), []);
  for (const bad of [8, 24, 1024, '16']) assert.ok(validatePack(pack(bad)).length > 0, `应拒绝 ${bad}`);
});

test('PNG 编解码往返，透明度分类', () => {
  const rgba = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < 16; i++) rgba.set([i * 10, 20, 30, i % 2 ? 255 : 0], i * 4);
  const image = decodePng(encodePng(4, 4, rgba));
  assert.equal(image.width, 4);
  assert.deepEqual([...image.rgba], [...rgba]);
  assert.equal(checkAlpha('cutout', { transparent: 1, partial: 0, opaque: 3, discarded: 1 }), null);
  // 契约按 alpha < 0.5 丢弃，中间 alpha 合法（Kenney 原图边缘有抗锯齿）
  assert.equal(checkAlpha('cutout', { transparent: 1, partial: 1, opaque: 2, discarded: 2 }), null);
  assert.match(checkAlpha('cutout', { transparent: 0, partial: 0, opaque: 4, discarded: 0 }), /alpha < 128/);
  assert.match(checkAlpha('cutout', { transparent: 0, partial: 4, opaque: 0, discarded: 4 }), /整张被丢弃/);
  assert.match(checkAlpha('translucent', { transparent: 0, partial: 0, opaque: 4 }), /半透明/);
  assert.match(checkAlpha('opaque', { transparent: 1, partial: 0, opaque: 3 }), /不透明/);
});

test('SOURCES.md 表按表头取列', () => {
  const rows = parseSourcesTable('# x\n\n| 文件 | 来源 | 版本 | 许可 |\n|---|---|---|---|\n| textures/a.png | 自绘 | r1 | CC0-1.0 |\n\n| 别的 | 表 |\n|---|---|\n| b | c |\n');
  assert.equal(rows.size, 1);
  assert.equal(rows.get('textures/a.png')['许可'], 'CC0-1.0');
});

test('仓内材质包通过全部检查', () => {
  const { errors, summary, blocks } = checkBlockAssets(repoRoot);
  assert.deepEqual(errors, []);
  assert.equal(summary.blocks, C0_BLOCKS.length);
  assert.equal(summary.catalogRows, 777);
  const catalog = JSON.parse(readFileSync(join(repoRoot, 'Server/Assets/Maps/official-catalog.json'), 'utf8'));
  const barrel = catalog.rows.filter(row => row.blockType === 1032);
  assert.equal(barrel.length, 1);
  assert.equal(barrel[0].name, 'lumio.bomber.barrel');
  assert.equal(barrel[0].assetRef, 'asset://blocks/lumio.bomber.barrel');
  assert.equal(summary.textureSize, 128);
  assert.equal(summary.textureSize, TEXTURE_SIZE, 'pack.json 与生成脚本的边长一致');
  const grass = blocks.find((block) => block.name === 'lumio.grass_block').slots;
  assert.deepEqual(grass.slice(0, 3), ['textures/dirt.png', 'textures/grass_top.png', 'textures/dirt_grass.png']);
});

test('Kenney 原图：SOURCES.md 标「未修改」的贴图与记下的原图 sha256 逐字节相同', () => {
  const sources = parseSourcesTable(readFileSync(join(repoRoot, 'Client/Assets/Blocks/SOURCES.md'), 'utf8'));
  const verbatim = [...sources.values()].filter((row) => row['修改'] === '未修改');
  assert.equal(verbatim.length, 13);
  for (const row of verbatim) {
    const bytes = readFileSync(join(repoRoot, 'Client/Assets/Blocks', row['文件']));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), row['原图 sha256'], row['文件']);
    assert.match(row['作者'], /Kenney/);
  }
});

test('贴图生成是确定的：两次逐字节相同，且等于仓内导出物', () => {
  const size = TEXTURE_SIZE;
  const outputs = [
    ...TEXTURE_NAMES.map((name) => [`${name}.png`, () => renderFinalTexture(name)]),
    ...Object.keys(KENNEY_DERIVED).map((file) => [file, () => deriveKenney(file)]),
  ];
  assert.equal(outputs.length, 9);
  for (const [file, render] of outputs) {
    const first = encodePng(size, size, render().rgba);
    const second = encodePng(size, size, render().rgba);
    assert.ok(first.equals(second), file);
    const onDisk = readFileSync(join(repoRoot, 'Client/Assets/Blocks/textures', file));
    assert.ok(onDisk.equals(first), `${file} 与生成结果不一致，需重新运行生成脚本`);
  }
});

test('自绘贴图是 16px 配方按最近邻放大：每个 8×8 块同色，且与 16px 画布一一对应', () => {
  const factor = TEXTURE_SIZE / 16;
  for (const name of TEXTURE_NAMES) {
    const small = renderTexture(name);
    const big = renderFinalTexture(name);
    assert.equal(big.width, TEXTURE_SIZE);
    for (let y = 0; y < TEXTURE_SIZE; y++) {
      for (let x = 0; x < TEXTURE_SIZE; x++) {
        const i = (y * TEXTURE_SIZE + x) * 4;
        const j = (Math.floor(y / factor) * 16 + Math.floor(x / factor)) * 4;
        for (let k = 0; k < 4; k++) {
          if (big.rgba[i + k] !== small.rgba[j + k]) assert.fail(`${name} (${x},${y}) 不等于 16px 画布 (${Math.floor(x / factor)},${Math.floor(y / factor)})`);
        }
      }
    }
  }
});

test('Kenney 派生：只改 alpha，RGB 与原图一致', () => {
  for (const [file, recipe] of Object.entries(KENNEY_DERIVED)) {
    const original = decodePng(readFileSync(join(repoRoot, 'Client/Assets/Blocks/source', recipe.original)));
    const derived = deriveKenney(file);
    assert.equal(derived.width, TEXTURE_SIZE, file);
    for (let i = 0; i < original.rgba.length; i += 4) {
      for (let k = 0; k < 3; k++) if (derived.rgba[i + k] !== original.rgba[i + k]) assert.fail(`${file} 像素 ${i / 4} 的 RGB 被改了`);
      if (derived.rgba[i + 3] !== recipe.alpha) assert.fail(`${file} 像素 ${i / 4} 的 alpha 不是 ${recipe.alpha}`);
    }
  }
});

// 负例：复制一份材质包到临时目录，逐项弄坏，确认检查真的会失败。
function withBrokenCopy(breakIt) {
  const root = mkdtempSync(join(tmpdir(), 'block-assets-'));
  try {
    cpSync(join(repoRoot, 'Client/Assets/Blocks'), join(root, 'Client/Assets/Blocks'), { recursive: true });
    mkdirSync(join(root, 'Server/Assets/Maps'), { recursive: true });
    cpSync(join(repoRoot, 'Server/Assets/Maps/official-catalog.json'),
      join(root, 'Server/Assets/Maps/official-catalog.json'));
    breakIt(join(root, 'Client/Assets/Blocks'), root);
    return checkBlockAssets(root).errors.join('\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('catalog boundary rejects a placeholder row with a missing referenced description', () => {
  const errors = withBrokenCopy((_, root) => {
    const path = join(root, 'Server/Assets/Maps/official-catalog.json');
    const catalog = JSON.parse(readFileSync(path, 'utf8'));
    const placeholder = catalog.rows.find((row) => row.name === 'lumio.block_257');
    placeholder.assetRef = 'asset://blocks/lumio.missing_placeholder';
    writeFileSync(path, JSON.stringify(catalog));
  });
  assert.match(errors, /official-catalog\.json lumio\.block_257.*lumio\.missing_placeholder/);
});

test('catalog boundary rejects a placeholder row with an invalid referenced description', () => {
  const errors = withBrokenCopy((dir, root) => {
    const path = join(root, 'Server/Assets/Maps/official-catalog.json');
    const catalog = JSON.parse(readFileSync(path, 'utf8'));
    const placeholder = catalog.rows.find((row) => row.name === 'lumio.block_257');
    placeholder.assetRef = 'asset://blocks/lumio.invalid_placeholder';
    writeFileSync(path, JSON.stringify(catalog));
    writeFileSync(join(dir, 'lumio.invalid_placeholder.json'), JSON.stringify({ format: 'invalid', faces: {} }));
  });
  assert.match(errors, /official-catalog\.json lumio\.block_257.*lumio\.invalid_placeholder/);
});

test('catalog boundary requires a present, nonempty rows array', () => {
  const cases = [
    { name: 'missing catalog', change: (path) => rmSync(path), expected: /official-catalog\.json.*文件不存在/ },
    { name: 'missing rows', change: (path) => writeFileSync(path, '{}'), expected: /official-catalog\.json.*rows.*数组/ },
    { name: 'non-array rows', change: (path) => writeFileSync(path, '{"rows":{}}'), expected: /official-catalog\.json.*rows.*数组/ },
    { name: 'empty rows', change: (path) => writeFileSync(path, '{"rows":[]}'), expected: /official-catalog\.json.*rows.*至少一行/ },
  ];
  for (const { name, change, expected } of cases) {
    const errors = withBrokenCopy((_, root) => {
      change(join(root, 'Server/Assets/Maps/official-catalog.json'));
      const cli = spawnSync(process.execPath, [join(repoRoot, 'Tools/check-block-assets.mjs'), '--root', root], { encoding: 'utf8' });
      assert.equal(cli.status, 1, `${name}: ${cli.stderr}`);
      assert.match(cli.stderr, expected, name);
    });
    assert.match(errors, expected, name);
  }
});

test('负例：缺 C0 方块描述', () => {
  const errors = withBrokenCopy((dir) => rmSync(join(dir, 'lumio.torch.json')));
  assert.match(errors, /lumio\.torch 没有素材描述/);
});

test('负例：引用的贴图不存在', () => {
  const errors = withBrokenCopy((dir) => rmSync(join(dir, 'textures/stone.png')));
  assert.match(errors, /textures\/stone\.png 不存在/);
});

test('负例：贴图边长不是 2 的幂 / 与 textureSize 不一致', () => {
  const rgba = new Uint8Array(24 * 24 * 4).fill(255);
  const errors = withBrokenCopy((dir) => writeFileSync(join(dir, 'textures/dirt.png'), encodePng(24, 24, rgba)));
  assert.match(errors, /边长 24 不是 2 的幂/);
  const rgba32 = new Uint8Array(32 * 32 * 4).fill(255);
  const errors32 = withBrokenCopy((dir) => writeFileSync(join(dir, 'textures/dirt.png'), encodePng(32, 32, rgba32)));
  assert.match(errors32, /不等于 pack\.json 的 textureSize 128/);
});

test('负例：镂空贴图没有会被丢弃的像素', () => {
  const solid = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4).fill(255);
  const errors = withBrokenCopy((dir) =>
    writeFileSync(join(dir, 'textures/leaves_transparent.png'), encodePng(TEXTURE_SIZE, TEXTURE_SIZE, solid)),
  );
  assert.match(errors, /leaves_transparent\.png: lumio\.oak_leaves：镂空贴图至少要有一个 alpha < 128/);
});

test('负例：标「未修改」的 Kenney 贴图被改过 / 缺 Kenney 许可原文', () => {
  const texture = decodePng(readFileSync(join(repoRoot, 'Client/Assets/Blocks/textures/stone.png')));
  texture.rgba[0] ^= 1;
  const edited = withBrokenCopy((dir) => writeFileSync(join(dir, 'textures/stone.png'), encodePng(128, 128, texture.rgba)));
  assert.match(edited, /stone\.png: 标「未修改」，但 sha256/);
  const noLicense = withBrokenCopy((dir) => rmSync(join(dir, 'LICENSE-kenney.txt')));
  assert.match(noLicense, /缺 Kenney 许可原文 LICENSE-kenney\.txt/);
});

test('负例：SOURCES.md 缺记录或许可不收', () => {
  const missing = withBrokenCopy((dir) => {
    const path = join(dir, 'SOURCES.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/^\| textures\/ice\.png .*$/m, ''));
  });
  assert.match(missing, /ice\.png: SOURCES\.md 里没有/);
  const sa = withBrokenCopy((dir) => {
    const path = join(dir, 'SOURCES.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/(\| textures\/ice\.png .*)CC0-1\.0/m, '$1CC-BY-SA-4.0'));
  });
  assert.match(sa, /许可「CC-BY-SA-4\.0」不收/);
  const ccby = withBrokenCopy((dir) => {
    const path = join(dir, 'SOURCES.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/(\| textures\/ice\.png .*)CC0-1\.0/m, '$1CC-BY-4.0'));
  });
  assert.match(ccby, /必须在 ATTRIBUTION\.md 里署名/);
});

test('负例：草方块三面不分', () => {
  const errors = withBrokenCopy((dir) =>
    writeFileSync(join(dir, 'lumio.grass_block.json'), JSON.stringify({ format: F, faces: { all: 'textures/grass_top.png' } })),
  );
  assert.match(errors, /顶、侧、底必须是三张不同的贴图/);
});
