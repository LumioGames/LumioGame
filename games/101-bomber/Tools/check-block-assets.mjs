/**
 * 方块材质包检查（ADR-124 D8 / D9，R-00789）。
 *
 * 用法：node Tools/check-block-assets.mjs [--root <仓根>]
 *   通过时打印一行摘要、退出码 0；有问题时逐条打印、退出码 1。
 *
 * 检查的是 Client/Assets/Blocks/ 这一套材质包：
 *   1. pack.json 与每份 lumio.*.json 素材描述都符合架构仓契约 engine/wire/block-asset-v1.json
 *      （LumioGameEngine main af56fb1 冻结）。本文件只照着契约实现检查，不复述契约的设计理由。
 *   2. 描述引用的 PNG 都存在，正方形、边长是 2 的幂、全包一致且等于 pack.json 的 textureSize。
 *   3. 下面 C0_BLOCKS 里的每个方块都有一份描述，六个面（或交叉面片）都有贴图。
 *   4. 透明度符合材质类：不透明方块没有透明像素；镂空（契约：alpha < 0.5 丢弃）既有会被丢弃的像素、
 *      也有留下的像素；半透明至少有一个半透明像素。
 *   5. textures/ 下每张 PNG 在 SOURCES.md 里有来源、版本与许可，许可只能是 CC0-1.0 或 CC-BY-4.0；
 *      CC-BY 的贴图还要在 ATTRIBUTION.md 里出现（署名）。标「未修改」且写了「原图 sha256」的行，
 *      贴图必须与原图逐字节相同；来源作者是 Kenney 的，目录里要有 Kenney 许可原文 LICENSE-kenney.txt。
 *   6. 官方目录 Server/Assets/Maps/official-catalog.json 每行的 assetRef 都能解析到
 *      一份存在且合法的描述；C0 方块的材质类与本表一致（只读目录，不改；目录归 Tools/official-catalog.mjs）。
 *
 * 它只看文件，不跑客户端：贴图画出来对不对由浏览器对照 preview/ 下的预览图复验（C9）。
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

// ---------------------------------------------------------------------------------------------
// 契约常量（block-asset-v1）
// ---------------------------------------------------------------------------------------------

export const DESCRIPTION_FORMAT = 'lumio.block-asset.v1';
export const PACK_FORMAT = 'lumio.block-asset-pack.v1';
const DESCRIPTION_KEYS = new Set(['format', 'faces', 'cross', 'license']);
const FACE_KEYS = new Set(['all', 'side', 'top', 'bottom', 'north', 'south', 'west', 'east']);
const LICENSE_KEYS = new Set(['spdx', 'attribution', 'source']);
const ASSET_REF = /^asset:\/\/blocks\/((?!.*\.\.)[a-z0-9_][a-z0-9_.-]*)$/;
const TEXTURE_PATH = /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9_./-]+\.png$/;

/** 面贴图表一行的七格顺序（faceResolution.slots）。 */
export const SLOTS = ['down', 'up', 'north', 'south', 'west', 'east', 'cross'];
/** 每格按什么键找贴图，前面的优先（faceResolution.slotSource）。 */
const SLOT_SOURCE = {
  down: ['bottom', 'all'],
  up: ['top', 'all'],
  north: ['north', 'side', 'all'],
  south: ['south', 'side', 'all'],
  west: ['west', 'side', 'all'],
  east: ['east', 'side', 'all'],
};

/** 本批只收这两种许可（ADR-124 D9、契约 licensing.accepted）。 */
export const ACCEPTED_LICENSES = new Set(['CC0-1.0', 'CC-BY-4.0']);

// ---------------------------------------------------------------------------------------------
// C0 方块清单（ADR-124 第一批，C0 卡「方块清单」表；lumio.block_<N> 占位行不在内）
//   alpha：opaque = 每个像素不透明；cutout = 至少有一个 alpha < 128 的像素（渲染时丢弃）、
//          也至少有一个 alpha >= 128 的像素（留下），中间值合法（契约 texture.alpha：按 alpha < 0.5 丢弃）；
//          translucent = 至少有一个半透明像素；null = 不要求（岩浆是液体但画成不透明）。
//   crossOnly：只有交叉面片、没有方盒（花、草丛、树苗；火把按主会话 2026-09-25 裁决也只有交叉面片）。
// ---------------------------------------------------------------------------------------------

export const C0_BLOCKS = [
  { name: 'lumio.stone', materialClass: 'Solid', alpha: 'opaque' },
  { name: 'lumio.hard_wall', materialClass: 'Solid', alpha: 'opaque' },
  { name: 'lumio.ore', materialClass: 'Solid', alpha: 'opaque' },
  { name: 'lumio.dirt', materialClass: 'Solid', alpha: 'opaque' },
  { name: 'lumio.grass_block', materialClass: 'Solid', alpha: 'opaque' },
  { name: 'lumio.oak_planks', materialClass: 'Solid', alpha: 'opaque' },
  { name: 'lumio.oak_log', materialClass: 'Solid', alpha: 'opaque' },
  { name: 'lumio.oak_leaves', materialClass: 'Cutout', alpha: 'cutout' },
  { name: 'lumio.glass', materialClass: 'Cutout', alpha: 'cutout' },
  { name: 'lumio.blue_stained_glass', materialClass: 'Translucent', alpha: 'translucent' },
  { name: 'lumio.ice', materialClass: 'Translucent', alpha: 'translucent' },
  { name: 'lumio.glowstone', materialClass: 'Solid', alpha: 'opaque' },
  { name: 'lumio.water', materialClass: 'Liquid', alpha: 'translucent' },
  { name: 'lumio.lava', materialClass: 'Liquid', alpha: null },
  { name: 'lumio.oak_stairs', materialClass: 'Solid', alpha: 'opaque' },
  { name: 'lumio.oak_slab', materialClass: 'Solid', alpha: 'opaque' },
  { name: 'lumio.oak_door', materialClass: 'Solid', alpha: 'opaque' },
  { name: 'lumio.oak_fence', materialClass: 'Solid', alpha: 'opaque' },
  { name: 'lumio.glass_pane', materialClass: 'Cutout', alpha: 'cutout' },
  { name: 'lumio.iron_bars', materialClass: 'Cutout', alpha: 'cutout' },
  { name: 'lumio.torch', materialClass: 'Cutout', alpha: 'cutout', crossOnly: true },
  { name: 'lumio.poppy', materialClass: 'Cutout', alpha: 'cutout', crossOnly: true },
  { name: 'lumio.short_grass', materialClass: 'Cutout', alpha: 'cutout', crossOnly: true },
  { name: 'lumio.oak_sapling', materialClass: 'Cutout', alpha: 'cutout', crossOnly: true },
];

// ---------------------------------------------------------------------------------------------
// 描述：校验与七格解析
// ---------------------------------------------------------------------------------------------

/** 返回这份描述违反契约的地方（空数组 = 合法）。 */
export function validateDescription(description) {
  const errors = [];
  if (!description || typeof description !== 'object' || Array.isArray(description)) {
    return ['描述必须是 JSON 对象'];
  }
  for (const key of Object.keys(description)) {
    if (!DESCRIPTION_KEYS.has(key)) errors.push(`不认的键 "${key}"`);
  }
  if (description.format !== DESCRIPTION_FORMAT) errors.push(`format 必须是 "${DESCRIPTION_FORMAT}"`);
  const faces = description.faces;
  if (!faces || typeof faces !== 'object' || Array.isArray(faces)) {
    errors.push('faces 必须是对象（可以为空）');
  } else {
    for (const [key, value] of Object.entries(faces)) {
      if (!FACE_KEYS.has(key)) errors.push(`不认的面键 "${key}"`);
      else if (!isTexturePath(value)) errors.push(`faces.${key} 不是合法贴图路径：${JSON.stringify(value)}`);
    }
  }
  if ('cross' in description && !isTexturePath(description.cross)) {
    errors.push(`cross 不是合法贴图路径：${JSON.stringify(description.cross)}`);
  }
  if ('license' in description) errors.push(...validateLicenseField(description.license, 'license'));
  return errors;
}

/**
 * 把一份描述解析成七格（SLOTS 顺序），每格是贴图相对路径或 null。
 * 描述不合法时七格全是 null（契约 faceResolution.statement）。
 */
export function resolveSlots(description) {
  if (validateDescription(description).length > 0) return SLOTS.map(() => null);
  return SLOTS.map((slot) => {
    if (slot === 'cross') return description.cross ?? null;
    for (const key of SLOT_SOURCE[slot]) {
      if (key in description.faces) return description.faces[key];
    }
    return null;
  });
}

/** asset://blocks/<id> → 素材根下的相对路径 Blocks/<id>.json；不合语法返回 null。 */
export function assetRefToPath(assetRef) {
  const match = typeof assetRef === 'string' ? ASSET_REF.exec(assetRef) : null;
  return match ? `Blocks/${match[1]}.json` : null;
}

function isTexturePath(value) {
  return typeof value === 'string' && TEXTURE_PATH.test(value) && !value.includes('\\') && !value.includes(':');
}

function validateLicenseField(license, where) {
  if (!license || typeof license !== 'object' || Array.isArray(license)) return [`${where} 必须是对象`];
  const errors = [];
  for (const [key, value] of Object.entries(license)) {
    if (!LICENSE_KEYS.has(key)) errors.push(`${where} 里不认的键 "${key}"`);
    else if (typeof value !== 'string') errors.push(`${where}.${key} 必须是字符串`);
  }
  return errors;
}

/** 返回 pack.json 违反契约的地方。 */
export function validatePack(pack) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) return ['pack.json 必须是 JSON 对象'];
  const errors = [];
  for (const key of Object.keys(pack)) {
    if (!['format', 'textureSize', 'license'].includes(key)) errors.push(`pack.json 里不认的键 "${key}"`);
  }
  if (pack.format !== PACK_FORMAT) errors.push(`pack.json 的 format 必须是 "${PACK_FORMAT}"`);
  const size = pack.textureSize;
  if (!Number.isInteger(size) || size < 16 || size > 512 || !isPowerOfTwo(size)) {
    errors.push(`pack.json 的 textureSize 必须是 16 ~ 512 的 2 的幂，现在是 ${JSON.stringify(size)}`);
  }
  if ('license' in pack) errors.push(...validateLicenseField(pack.license, 'pack.json license'));
  return errors;
}

export function isPowerOfTwo(n) {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

// ---------------------------------------------------------------------------------------------
// PNG 解码（只用 node:zlib；支持 8 位的灰度 / 灰度+透明 / RGB / RGBA / 调色板，不支持隔行）
// ---------------------------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 解码成 { width, height, rgba }，rgba 是 width*height*4 的 Uint8Array。格式不支持时抛错。 */
export function decodePng(bytes) {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('不是 PNG 文件');
  let offset = 8;
  let header = null;
  let palette = null;
  let paletteAlpha = null;
  const data = [];
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        bitDepth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') paletteAlpha = body;
    else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
  }
  if (!header) throw new Error('PNG 缺 IHDR');
  const { width, height, bitDepth, colorType, interlace } = header;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (bitDepth !== 8 || channels === undefined) throw new Error(`不支持的 PNG 色彩类型 ${colorType} / 位深 ${bitDepth}`);
  if (interlace !== 0) throw new Error('不支持隔行 PNG');
  if (colorType === 3 && !palette) throw new Error('调色板 PNG 缺 PLTE');

  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? out[i - channels] : 0;
      const up = previous[i];
      const upLeft = i >= channels ? previous[i - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) predictor = paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`PNG 行过滤类型 ${filter} 不合法`);
      out[i] = (line[i] + predictor) & 0xff;
    }
    previous = out;
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const s = p * channels;
    let r, g, b, a;
    if (colorType === 6) [r, g, b, a] = [pixels[s], pixels[s + 1], pixels[s + 2], pixels[s + 3]];
    else if (colorType === 2) [r, g, b, a] = [pixels[s], pixels[s + 1], pixels[s + 2], 255];
    else if (colorType === 0) [r, g, b, a] = [pixels[s], pixels[s], pixels[s], 255];
    else if (colorType === 4) [r, g, b, a] = [pixels[s], pixels[s], pixels[s], pixels[s + 1]];
    else {
      const index = pixels[s];
      [r, g, b] = [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2]];
      a = paletteAlpha && index < paletteAlpha.length ? paletteAlpha[index] : 255;
    }
    rgba.set([r, g, b, a], p * 4);
  }
  return { width, height, rgba };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** 统计透明度：全透、半透、不透各多少像素，以及镂空渲染会丢弃（alpha < 128）的像素数。 */
export function alphaHistogram(rgba) {
  const counts = { transparent: 0, partial: 0, opaque: 0, discarded: 0 };
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] === 0) counts.transparent++;
    else if (rgba[i] === 255) counts.opaque++;
    else counts.partial++;
    if (rgba[i] < 128) counts.discarded++;
  }
  return counts;
}

/** 按期望检查透明度，返回问题描述或 null。 */
export function checkAlpha(expectation, counts) {
  if (expectation === 'opaque' && (counts.transparent || counts.partial)) {
    return `应全部不透明，却有 ${counts.transparent} 个全透、${counts.partial} 个半透像素`;
  }
  if (expectation === 'cutout') {
    const total = counts.transparent + counts.partial + counts.opaque;
    if (!counts.discarded) return '镂空贴图至少要有一个 alpha < 128 的像素（渲染时丢弃），现在一个都没有';
    if (counts.discarded === total) return '镂空贴图的像素 alpha 全都 < 128，渲染时整张被丢弃';
  }
  if (expectation === 'translucent' && !counts.partial) return '半透明贴图至少要有一个半透明像素';
  return null;
}

// ---------------------------------------------------------------------------------------------
// SOURCES.md：来源表
// ---------------------------------------------------------------------------------------------

/**
 * 读 SOURCES.md 里第一张表头含「文件」与「许可」的 Markdown 表，返回 Map(文件 → 行对象)。
 * 行对象的键就是表头文字（文件、来源、版本、作者、许可、修改）。
 */
export function parseSourcesTable(markdown) {
  const rows = new Map();
  let header = null;
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      if (header && rows.size > 0) break;
      header = null;
      continue;
    }
    const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim().replace(/^`|`$/g, ''));
    if (!header) {
      if (cells.includes('文件') && cells.includes('许可')) header = cells;
      continue;
    }
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    const row = Object.fromEntries(header.map((name, i) => [name, cells[i] ?? '']));
    rows.set(row['文件'], row);
  }
  return rows;
}

// 只是一道护栏，不是证明：来源里提到这些词的贴图一律不收（ADR-124 D9）。
const FORBIDDEN_SOURCE = /minecraft|mojang|faithful|\.jar\b/i;

// ---------------------------------------------------------------------------------------------
// 整包检查
// ---------------------------------------------------------------------------------------------

/**
 * 检查仓根 root 下的材质包。返回 { errors, summary, blocks }：
 *   errors 为空即通过；blocks 是「方块名 → 描述文件 → 七格贴图」清单（给 C9 对照用）。
 */
export function checkBlockAssets(root) {
  const errors = [];
  const fail = (where, message) => errors.push(`${where}: ${message}`);
  const blocksDir = join(root, 'Client', 'Assets', 'Blocks');
  const rel = (path) => relative(root, path).split('\\').join('/');
  if (!existsSync(blocksDir)) {
    return { errors: [`${rel(blocksDir)}: 目录不存在`], summary: null, blocks: [] };
  }

  // pack.json
  const packPath = join(blocksDir, 'pack.json');
  let textureSize = null;
  const pack = readJson(packPath, fail, rel);
  if (pack !== undefined) {
    const packErrors = validatePack(pack);
    packErrors.forEach((message) => fail(rel(packPath), message));
    if (packErrors.length === 0) textureSize = pack.textureSize;
  }

  // 许可文件（契约 licensing.files：仓库评审项，这里顺手查存在）
  const hasLicense = existsSync(join(blocksDir, 'LICENSE'));
  const attributionPath = join(blocksDir, 'ATTRIBUTION.md');
  const attribution = existsSync(attributionPath) ? readFileSync(attributionPath, 'utf8') : null;
  if (!hasLicense && attribution === null) fail(rel(blocksDir), '缺 LICENSE 或 ATTRIBUTION.md');

  // 所有描述：lumio.*.json 以及除 pack.json 外的任何 .json 都当描述查
  const descriptions = new Map();
  for (const file of readdirSync(blocksDir).sort()) {
    if (!file.endsWith('.json') || file === 'pack.json') continue;
    const path = join(blocksDir, file);
    const description = readJson(path, fail, rel);
    if (description === undefined) continue;
    const problems = validateDescription(description);
    problems.forEach((message) => fail(rel(path), message));
    descriptions.set(file.slice(0, -'.json'.length), { path, description, valid: problems.length === 0 });
  }

  // 贴图：描述引用到的，以及 textures/ 下实际存在的
  const textures = new Map(); // 相对 Blocks/ 的路径 → { counts, users: Set<方块名> }
  const loadTexture = (texturePath, where) => {
    if (textures.has(texturePath)) return textures.get(texturePath);
    const path = join(blocksDir, texturePath);
    const entry = { counts: null, users: new Set() };
    textures.set(texturePath, entry);
    if (!existsSync(path)) {
      fail(where, `引用的贴图 ${texturePath} 不存在`);
      return entry;
    }
    try {
      const image = decodePng(readFileSync(path));
      if (image.width !== image.height) fail(rel(path), `不是正方形（${image.width}×${image.height}）`);
      else if (!isPowerOfTwo(image.width)) fail(rel(path), `边长 ${image.width} 不是 2 的幂`);
      else if (textureSize !== null && image.width !== textureSize) {
        fail(rel(path), `边长 ${image.width} 不等于 pack.json 的 textureSize ${textureSize}`);
      }
      entry.counts = alphaHistogram(image.rgba);
    } catch (error) {
      fail(rel(path), `解不出：${error.message}`);
    }
    return entry;
  };

  // C0 清单：每个方块一份描述，面都覆盖，透明度对
  const blocks = [];
  for (const block of C0_BLOCKS) {
    const id = block.name;
    const found = descriptions.get(id);
    const where = `Client/Assets/Blocks/${id}.json`;
    if (!found) {
      fail(where, `C0 方块 ${id} 没有素材描述`);
      continue;
    }
    if (!found.valid) continue;
    const slots = resolveSlots(found.description);
    const faceSlots = slots.slice(0, 6);
    const cross = slots[6];
    if (block.crossOnly) {
      if (!cross) fail(where, '交叉面片方块必须写 cross');
      if (faceSlots.some(Boolean)) fail(where, '只有交叉面片的方块 faces 应为空');
    } else {
      SLOTS.slice(0, 6).forEach((slot, i) => {
        if (!faceSlots[i]) fail(where, `${slot} 面没有任何键覆盖`);
      });
      if (cross) fail(where, '这个方块没有交叉面片，不应写 cross');
    }
    for (const texturePath of new Set(slots.filter(Boolean))) {
      const entry = loadTexture(texturePath, where);
      entry.users.add(id);
      if (entry.counts) {
        const problem = checkAlpha(block.alpha, entry.counts);
        if (problem) fail(`Client/Assets/Blocks/${texturePath}`, `${id}：${problem}`);
      }
    }
    blocks.push({ name: id, description: rel(found.path), slots });
  }

  // C0 清单之外的描述也要引用得到贴图
  for (const [id, found] of descriptions) {
    if (!found.valid || C0_BLOCKS.some((block) => block.name === id)) continue;
    for (const texturePath of new Set(resolveSlots(found.description).filter(Boolean))) {
      loadTexture(texturePath, rel(found.path)).users.add(id);
    }
  }

  // ADR-124 验收 6：草方块顶 / 侧 / 底三张不同，底是泥土；原木顶底相同、与侧面不同
  const slotsOf = (name) => blocks.find((block) => block.name === name)?.slots;
  const grass = slotsOf('lumio.grass_block');
  const dirt = slotsOf('lumio.dirt');
  if (grass && (new Set([grass[0], grass[1], grass[2]]).size !== 3 || (dirt && grass[0] !== dirt[1]))) {
    fail('Client/Assets/Blocks/lumio.grass_block.json', '顶、侧、底必须是三张不同的贴图，且底面与泥土同一张');
  }
  const log = slotsOf('lumio.oak_log');
  if (log && (log[0] !== log[1] || log[1] === log[2])) {
    fail('Client/Assets/Blocks/lumio.oak_log.json', '原木顶底应是同一张年轮图，且与侧面树皮不同');
  }

  // textures/ 下实际存在但没人引用的 PNG 也要有来源记录，并且尺寸合规
  const texturesDir = join(blocksDir, 'textures');
  const onDisk = existsSync(texturesDir) ? listPngs(texturesDir).map((path) => rel(path).slice('Client/Assets/Blocks/'.length)) : [];
  for (const texturePath of onDisk) loadTexture(texturePath, 'Client/Assets/Blocks/textures');

  // SOURCES.md：每张 PNG 有来源、版本、许可
  const sourcesPath = join(blocksDir, 'SOURCES.md');
  if (!existsSync(sourcesPath)) {
    fail(rel(sourcesPath), '缺来源记录');
  } else {
    const sources = parseSourcesTable(readFileSync(sourcesPath, 'utf8'));
    if ([...sources.values()].some((row) => /kenney/i.test(row['作者'] ?? '')) && !existsSync(join(blocksDir, 'LICENSE-kenney.txt'))) {
      fail(rel(blocksDir), '用了 Kenney 素材，缺 Kenney 许可原文 LICENSE-kenney.txt');
    }
    for (const texturePath of [...textures.keys()].sort()) {
      const row = sources.get(texturePath);
      const where = `Client/Assets/Blocks/${texturePath}`;
      if (!row) {
        fail(where, 'SOURCES.md 里没有这张贴图的来源记录');
        continue;
      }
      if (!row['来源']) fail(where, 'SOURCES.md 的「来源」为空');
      if (!row['版本']) fail(where, 'SOURCES.md 的「版本」为空');
      if (!ACCEPTED_LICENSES.has(row['许可'])) fail(where, `许可「${row['许可']}」不收，只收 CC0-1.0 或 CC-BY-4.0`);
      if (FORBIDDEN_SOURCE.test(`${row['来源']} ${row['作者'] ?? ''}`)) fail(where, '来源疑似 MC / Mojang 或其派生包，不得进仓');
      if (row['许可'] === 'CC-BY-4.0' && !(attribution ?? '').includes(texturePath)) {
        fail(where, 'CC-BY-4.0 贴图必须在 ATTRIBUTION.md 里署名');
      }
      const originalHash = row['原图 sha256'];
      if (row['修改'] === '未修改' && originalHash && existsSync(join(blocksDir, texturePath))) {
        const actual = createHash('sha256').update(readFileSync(join(blocksDir, texturePath))).digest('hex');
        if (actual !== originalHash) fail(where, `标「未修改」，但 sha256 是 ${actual}，不是 SOURCES.md 记的原图 ${originalHash}`);
      }
    }
  }

  // 预览图（C9 截图对照的原图）
  const previewDir = join(blocksDir, 'preview');
  if (!existsSync(previewDir) || listPngs(previewDir).length === 0) fail('Client/Assets/Blocks/preview', '缺全量对照预览图');

  // 官方目录（只读）：每行的 assetRef 都指向已验证的描述；C0 材质类与清单一致
  const catalogPath = join(root, 'Server', 'Assets', 'Maps', 'official-catalog.json');
  let catalogRows = 0;
  const catalog = readJson(catalogPath, fail, rel);
  if (catalog !== undefined) {
    if (!Array.isArray(catalog?.rows)) fail(rel(catalogPath), 'rows 必须是非空数组');
    else if (catalog.rows.length === 0) fail(rel(catalogPath), 'rows 至少一行');
    for (const row of Array.isArray(catalog?.rows) ? catalog.rows : []) {
      catalogRows++;
      const where = `official-catalog.json ${row.name}`;
      const target = assetRefToPath(row.assetRef);
      if (!target) {
        fail(where, `assetRef ${JSON.stringify(row.assetRef)} 不合 asset://blocks/<id>`);
        continue;
      }
      const referenced = descriptions.get(target.slice('Blocks/'.length, -'.json'.length));
      if (!referenced) {
        const path = join(root, 'Client', 'Assets', target);
        fail(where, `assetRef ${row.assetRef} 指向的 Client/Assets/${target} ${existsSync(path) ? '不是合法描述' : '不存在'}`);
      } else if (!referenced.valid) {
        fail(where, `assetRef ${row.assetRef} 指向的 Client/Assets/${target} 不是合法描述`);
      }
      const expected = C0_BLOCKS.find((block) => block.name === row.name);
      if (expected && row.materialClass !== expected.materialClass) {
        fail(where, `材质类 ${row.materialClass} 与 C0 清单的 ${expected.materialClass} 不一致`);
      }
    }
  }

  return {
    errors,
    blocks,
    summary: {
      blocks: blocks.length,
      descriptions: descriptions.size,
      textures: textures.size,
      textureSize,
      catalogRows,
    },
  };
}

function readJson(path, fail, rel) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(rel(path), existsSync(path) ? `不是合法 JSON：${error.message}` : '文件不存在');
    return undefined;
  }
}

function listPngs(dir) {
  const found = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...listPngs(path));
    else if (name.toLowerCase().endsWith('.png')) found.push(path);
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// 命令行
// ---------------------------------------------------------------------------------------------

function main(argv) {
  const rootFlag = argv.indexOf('--root');
  const root = rootFlag >= 0 ? argv[rootFlag + 1] : join(dirname(fileURLToPath(import.meta.url)), '..');
  const { errors, summary } = checkBlockAssets(root);
  if (errors.length > 0) {
    for (const error of errors) console.error(`FAIL ${error}`);
    console.error(`check-block-assets: ${errors.length} 个问题`);
    return 1;
  }
  console.log(
    `check-block-assets: OK — ${summary.blocks} 个 C0 方块、${summary.descriptions} 份描述、` +
      `${summary.textures} 张贴图（${summary.textureSize}px），官方目录里核对了 ${summary.catalogRows} 行`,
  );
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
