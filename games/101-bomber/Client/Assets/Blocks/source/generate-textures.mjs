/**
 * 「示例」方块材质包的源（R-00789，ADR-124 D9）。
 *
 * 用法（在仓根）：node Client/Assets/Blocks/source/generate-textures.mjs
 *   1. 自绘贴图：按下面的程序化配方在 16×16 上画，再按最近邻（每个像素复制成 8×8，不插值）
 *      放大到材质包边长 128，写 textures/<配方名>.png；
 *   2. Kenney 派生贴图：读 source/kenney/ 里 Kenney Voxel Pack 的原图（先核 sha256），只改 alpha，
 *      写 textures/<同名>.png；
 *   3. 读 Client/Assets/Blocks/lumio.*.json 素材描述，拼出 preview/blocks-preview.png。
 *
 * textures/ 下其余贴图是 Kenney Voxel Pack 原文件逐字节拷贝（CC0，见 ../SOURCES.md），不经本脚本。
 * 自绘部分只用写死的 RGB 常量、固定种子噪声与简单几何，不读外部图片，作者以 CC0-1.0 放弃权利
 * （见 ../LICENSE）。改贴图就改这里的配方、重新运行，不要直接改导出的 PNG。
 *
 * 确定性：每张自绘贴图用自己名字做种子的 mulberry32 伪随机数（不用 Math.random），
 * 同一版 Node 重跑两次逐字节相同。
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { C0_BLOCKS, decodePng, resolveSlots } from '../../../../Tools/check-block-assets.mjs';

/** 材质包边长（与 ../pack.json 的 textureSize 相同）。 */
export const TEXTURE_SIZE = 128;
/** 自绘配方的画布边长：先在 16×16 上画，再最近邻放大 TEXTURE_SIZE / DRAW_SIZE 倍。 */
const DRAW_SIZE = 16;

// ---------------------------------------------------------------------------------------------
// PNG 编码（RGBA8、无隔行、每行过滤类型 0）
// ---------------------------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

export function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 位深
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------------------------
// 画布与伪随机
// ---------------------------------------------------------------------------------------------

/** mulberry32：32 位状态的小型伪随机数，结果只取决于种子。 */
function prng(seedText) {
  let seed = 2166136261;
  for (const ch of seedText) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Canvas {
  constructor(size = DRAW_SIZE) {
    this.size = size;
    this.rgba = new Uint8Array(size * size * 4);
  }
  set(x, y, [r, g, b, a = 255]) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const i = (y * this.size + x) * 4;
    this.rgba[i] = clamp(r);
    this.rgba[i + 1] = clamp(g);
    this.rgba[i + 2] = clamp(b);
    this.rgba[i + 3] = clamp(a);
  }
  get(x, y) {
    const i = (y * this.size + x) * 4;
    return [...this.rgba.subarray(i, i + 4)];
  }
  fill(fn) {
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) this.set(x, y, fn(x, y));
  }
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
/** 把颜色整体提亮 / 压暗 d（RGB 三个通道同加），透明度不变。 */
const shade = ([r, g, b, a = 255], d) => [r + d, g + d, b + d, a];
/** 在 base 上加一点逐像素噪声，幅度 ±amount/2。 */
const noisy = (base, rand, amount) => shade(base, (rand() - 0.5) * amount);

// ---------------------------------------------------------------------------------------------
// 自绘配方：Kenney Voxel Pack 里没有对应图的方块（门、火把、虞美人、树苗、萤石、铁栏杆、彩色玻璃）。
// 每张贴图一个函数，在 16×16 上画。颜色都是自带的（不做生物群系染色，ADR-124 非目标）。
// 透明约定：镂空贴图只用 alpha 0 / 255；半透明贴图用 0 < alpha < 255。
// ---------------------------------------------------------------------------------------------

const PLANK = [168, 134, 82];

const recipes = {
  // 彩色玻璃（蓝，半透明）
  blue_stained_glass(c, rand) {
    c.fill((x, y) => {
      const edge = x === 0 || y === 0 || x === DRAW_SIZE - 1 || y === DRAW_SIZE - 1;
      if (edge) return [38, 64, 168, 210];
      if (x - y === 0 && x >= 3 && x <= 6) return [130, 168, 244, 160];
      return noisy([52, 92, 204, 120], rand, 8);
    });
  },

  // 萤石：暖黄色晶块，2×2 一格随机明暗
  glowstone(c, rand) {
    const tones = [
      [150, 104, 50],
      [206, 152, 72],
      [240, 192, 96],
      [255, 232, 150],
    ];
    const cells = Array.from({ length: 64 }, () => tones[Math.floor(rand() * tones.length)]);
    c.fill((x, y) => noisy(cells[Math.floor(y / 2) * 8 + Math.floor(x / 2)], rand, 12));
  },

  // 门：竖板门，一圈深色门框，中间一道横档。门上下两格用同一张（ADR-124 D5 已知限制），
  // 所以图案上下对称，叠起来仍像一扇门。
  oak_door(c, rand) {
    c.fill((x, y) => {
      if (x === 0 || y === 0 || x === DRAW_SIZE - 1 || y === DRAW_SIZE - 1) return noisy([104, 76, 44], rand, 8);
      if (y === 7 || y === 8) return noisy([126, 96, 58], rand, 8);
      if (x % 5 === 0) return noisy([118, 90, 54], rand, 6);
      return noisy(shade(PLANK, -6), rand, 12);
    });
  },

  // 铁栏杆（镂空）：四根竖杆，上下各一道横档
  iron_bars(c) {
    c.fill((x, y) => {
      const bar = x % 4 === 1 || x % 4 === 2;
      const band = y === 2 || y === 13;
      if (!bar && !band) return [0, 0, 0, 0];
      if (bar) return x % 4 === 1 ? [176, 178, 184] : [96, 98, 106];
      return [136, 138, 146];
    });
  },

  // 火把（交叉面片，镂空）：木柄 + 火苗
  torch(c) {
    c.fill(() => [0, 0, 0, 0]);
    for (let y = 6; y < DRAW_SIZE; y++) {
      c.set(7, y, [150, 110, 62]);
      c.set(8, y, [112, 80, 44]);
    }
    const flame = [
      [7, 1, [255, 236, 150]],
      [8, 1, [255, 214, 100]],
      [6, 2, [240, 140, 40]],
      [7, 2, [255, 240, 170]],
      [8, 2, [255, 214, 100]],
      [9, 2, [240, 140, 40]],
      [6, 3, [255, 180, 60]],
      [7, 3, [255, 250, 210]],
      [8, 3, [255, 236, 150]],
      [9, 3, [255, 180, 60]],
      [6, 4, [230, 120, 30]],
      [7, 4, [255, 214, 100]],
      [8, 4, [255, 214, 100]],
      [9, 4, [230, 120, 30]],
      [7, 5, [210, 100, 30]],
      [8, 5, [210, 100, 30]],
    ];
    for (const [x, y, color] of flame) c.set(x, y, color);
  },

  // 花（交叉面片，镂空）：绿茎两片叶，顶上红花黑心
  poppy(c) {
    c.fill(() => [0, 0, 0, 0]);
    for (let y = 8; y < DRAW_SIZE; y++) c.set(7, y, [62, 138, 46]);
    for (const [x, y] of [[8, 12], [9, 11], [6, 13], [5, 12]]) c.set(x, y, [82, 160, 56]);
    for (let y = 3; y <= 7; y++) {
      for (let x = 5; x <= 9; x++) {
        const corner = (x === 5 || x === 9) && (y === 3 || y === 7);
        if (corner) continue;
        c.set(x, y, (x + y) % 3 === 0 ? [236, 84, 72] : [204, 38, 40]);
      }
    }
    c.set(7, 5, [40, 30, 22]);
  },

  // 树苗（交叉面片，镂空）：细茎 + 三团小叶
  oak_sapling(c, rand) {
    c.fill(() => [0, 0, 0, 0]);
    for (let y = 9; y < DRAW_SIZE; y++) c.set(7, y, [112, 82, 48]);
    c.set(8, 11, [112, 82, 48]);
    for (const [cx, cy] of [[5, 7], [10, 6], [7, 3]]) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx * dx + dy * dy > 5) continue;
          c.set(cx + dx, cy + dy, noisy(rand() < 0.3 ? [90, 160, 58] : [58, 124, 40], rand, 10));
        }
      }
    }
  },
};

/** 最近邻放大：每个源像素复制成 factor×factor 块，不插值（像素风）。 */
export function upscaleNearest(source, factor) {
  const side = source.size * factor;
  const rgba = new Uint8Array(side * side * 4);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const from = (Math.floor(y / factor) * source.size + Math.floor(x / factor)) * 4;
      rgba.set(source.rgba.subarray(from, from + 4), (y * side + x) * 4);
    }
  }
  return { width: side, height: side, rgba };
}

// ---------------------------------------------------------------------------------------------
// Kenney 派生：原图不透明，但契约要求 Liquid / Translucent 按 alpha 混合（block-asset-v1
// texture.alpha），原样用会把水和冰画成实心。所以只把 alpha 统一改成下面的值，RGB 一个字节不动。
// 原图放在 source/kenney/，与 Kenney Voxel Pack zip 里 PNG/Tiles/<文件> 逐字节相同（sha256 见下）。
// ---------------------------------------------------------------------------------------------

export const KENNEY_DERIVED = {
  'water.png': {
    original: 'kenney/water.png',
    sha256: '8bf6b51ea13652f1937c83fd0649dcd45a91dd246814886236ac0458f256eb4b',
    alpha: 168,
  },
  'ice.png': {
    original: 'kenney/ice.png',
    sha256: '6b276bff1230d6131dd49bc013b01c4b2fe247c27577b1121b6e04e633f7c358',
    alpha: 192,
  },
};

const sourceDir = dirname(fileURLToPath(import.meta.url));

/** 按 KENNEY_DERIVED 读原图、核 sha256、改 alpha，返回 { width, height, rgba }。 */
export function deriveKenney(file) {
  const recipe = KENNEY_DERIVED[file];
  const bytes = readFileSync(join(sourceDir, recipe.original));
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== recipe.sha256) {
    throw new Error(`source/${recipe.original} 的 sha256 是 ${actual}，不是 Kenney 原图 ${recipe.sha256}`);
  }
  const image = decodePng(bytes);
  for (let i = 3; i < image.rgba.length; i += 4) image.rgba[i] = recipe.alpha;
  return image;
}

// ---------------------------------------------------------------------------------------------
// 预览图：每个 C0 方块一格，标方块名，按原尺寸（128px）画出它解析后的顶 / 侧 / 底 / 交叉面片
// ---------------------------------------------------------------------------------------------

// 5×7 点阵字，只有预览要用到的字符（小写、数字、少量符号）
const FONT = {
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  b: ['#....', '#....', '#.##.', '##..#', '#...#', '#...#', '####.'],
  c: ['.....', '.....', '.###.', '#....', '#....', '#...#', '.###.'],
  d: ['....#', '....#', '.##.#', '#..##', '#...#', '#...#', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  f: ['..##.', '.#..#', '.#...', '###..', '.#...', '.#...', '.#...'],
  g: ['.....', '.####', '#...#', '#...#', '.####', '....#', '.###.'],
  h: ['#....', '#....', '#.##.', '##..#', '#...#', '#...#', '#...#'],
  i: ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.'],
  j: ['...#.', '.....', '..##.', '...#.', '...#.', '#..#.', '.##..'],
  k: ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  l: ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#...#', '#...#'],
  n: ['.....', '.....', '#.##.', '##..#', '#...#', '#...#', '#...#'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['.....', '.....', '####.', '#...#', '####.', '#....', '#....'],
  q: ['.....', '.....', '.##.#', '#..##', '.####', '....#', '....#'],
  r: ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....'],
  s: ['.....', '.....', '.###.', '#....', '.###.', '....#', '####.'],
  t: ['.#...', '.#...', '###..', '.#...', '.#...', '.#..#', '..##.'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#..##', '.##.#'],
  v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  y: ['.....', '.....', '#...#', '#...#', '.####', '....#', '.###.'],
  z: ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};


class Image {
  constructor(width, height, background) {
    this.width = width;
    this.height = height;
    this.rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) this.rgba.set(background, i * 4);
  }
  /** 按 alpha 把颜色叠到当前像素上（预览图本身不透明）。 */
  blend(x, y, [r, g, b, a]) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    const t = a / 255;
    this.rgba[i] = Math.round(r * t + this.rgba[i] * (1 - t));
    this.rgba[i + 1] = Math.round(g * t + this.rgba[i + 1] * (1 - t));
    this.rgba[i + 2] = Math.round(b * t + this.rgba[i + 2] * (1 - t));
    this.rgba[i + 3] = 255;
  }
  rect(x0, y0, w, h, color) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.blend(x, y, color);
  }
  text(x0, y0, text, scale, color) {
    let x = x0;
    for (const ch of text.toLowerCase()) {
      const glyph = FONT[ch] ?? FONT[' '];
      glyph.forEach((row, gy) => {
        [...row].forEach((bit, gx) => {
          if (bit === '#') this.rect(x + gx * scale, y0 + gy * scale, scale, scale, color);
        });
      });
      x += 6 * scale;
    }
  }
  /**
   * 按原尺寸画一张贴图，底下先铺 16px 棋盘格，透明处看得出来。alpha 照契约 texture.alpha 处理，
   * 与客户端画出来的一致：Solid 忽略 alpha，Cutout 按 alpha < 128 丢弃、其余画实，Liquid / Translucent 混合。
   */
  tile(x0, y0, texture, materialClass) {
    const alphaOf = (a) => (materialClass === 'Solid' ? 255 : materialClass === 'Cutout' ? (a < 128 ? 0 : 255) : a);
    for (let y = 0; y < texture.height; y++) {
      for (let x = 0; x < texture.width; x++) {
        const checker = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0 ? 205 : 150;
        this.blend(x0 + x, y0 + y, [checker, checker, checker, 255]);
        const i = (y * texture.width + x) * 4;
        const [r, g, b, a] = texture.rgba.subarray(i, i + 4);
        this.blend(x0 + x, y0 + y, [r, g, b, alphaOf(a)]);
      }
    }
  }
}

/** 把七格归并成要展示的几张：六面同一张就只画一张 all。 */
function facesToShow(slots) {
  const [down, up, north, south, west, east, cross] = slots;
  const shown = [];
  const six = [down, up, north, south, west, east];
  if (six.every(Boolean) && six.every((path) => path === six[0])) shown.push(['all', down]);
  else {
    if (up) shown.push(['top', up]);
    if (north) shown.push(['side', north]);
    if (down) shown.push(['bottom', down]);
  }
  if (cross) shown.push(['cross', cross]);
  return shown;
}

function writePreview(blocksDir) {
  // 预览按描述文件画，和客户端看到的是同一份解析（复用检查工具里的契约实现）
  const tileSide = TEXTURE_SIZE;
  const gap = 16;
  const columns = 3;
  const cellWidth = 6 + 3 * (tileSide + gap) + 8;
  const cellHeight = 26 + tileSide + 4 + 7 + 14;
  const margin = 16;
  const header = 40;
  const rows = Math.ceil(C0_BLOCKS.length / columns);
  const image = new Image(margin * 2 + columns * cellWidth, header + margin + rows * cellHeight, [34, 36, 42, 255]);
  image.text(margin, 14, `lumio bomber block pack - ${TEXTURE_SIZE}px - cc0-1.0 - kenney voxel pack / lumio - client/assets/blocks`, 2, [230, 232, 236, 255]);

  const textures = new Map();
  const load = (path) => {
    if (!textures.has(path)) textures.set(path, decodePng(readFileSync(join(blocksDir, path))));
    return textures.get(path);
  };

  C0_BLOCKS.forEach((block, index) => {
    const x0 = margin + (index % columns) * cellWidth;
    const y0 = header + Math.floor(index / columns) * cellHeight;
    const description = JSON.parse(readFileSync(join(blocksDir, `${block.name}.json`), 'utf8'));
    image.rect(x0, y0, cellWidth - 8, cellHeight - 8, [48, 51, 60, 255]);
    image.text(x0 + 6, y0 + 6, block.name, 2, [250, 250, 250, 255]);
    facesToShow(resolveSlots(description)).forEach(([label, path], k) => {
      const tx = x0 + 6 + k * (tileSide + gap);
      image.tile(tx, y0 + 26, load(path), block.materialClass);
      image.text(tx, y0 + 26 + tileSide + 4, `${label} ${path.slice('textures/'.length, -'.png'.length)}`, 1, [190, 194, 204, 255]);
    });
  });

  const previewDir = join(blocksDir, 'preview');
  mkdirSync(previewDir, { recursive: true });
  writeFileSync(join(previewDir, 'blocks-preview.png'), encodePng(image.width, image.height, image.rgba));
}

// ---------------------------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------------------------

/** 在 16×16 画布上跑一张自绘配方（未放大）。 */
export function renderTexture(name) {
  const canvas = new Canvas();
  recipes[name](canvas, prng(name));
  return canvas;
}

/** 自绘贴图的最终导出（放大到 TEXTURE_SIZE），返回 { width, height, rgba }。 */
export function renderFinalTexture(name) {
  return upscaleNearest(renderTexture(name), TEXTURE_SIZE / DRAW_SIZE);
}

export const TEXTURE_NAMES = Object.keys(recipes);

function main() {
  const blocksDir = join(sourceDir, '..');
  const texturesDir = join(blocksDir, 'textures');
  mkdirSync(texturesDir, { recursive: true });
  for (const name of TEXTURE_NAMES) {
    const image = renderFinalTexture(name);
    writeFileSync(join(texturesDir, `${name}.png`), encodePng(image.width, image.height, image.rgba));
  }
  for (const file of Object.keys(KENNEY_DERIVED)) {
    const image = deriveKenney(file);
    writeFileSync(join(texturesDir, file), encodePng(image.width, image.height, image.rgba));
  }
  writePreview(blocksDir);
  const descriptions = readdirSync(blocksDir).filter((file) => file.startsWith('lumio.') && file.endsWith('.json'));
  console.log(
    `generate-textures: ${TEXTURE_NAMES.length} 张自绘、${Object.keys(KENNEY_DERIVED).length} 张 Kenney 派生贴图` +
      `（${TEXTURE_SIZE}px），${descriptions.length} 份描述的预览已写出`,
  );
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
