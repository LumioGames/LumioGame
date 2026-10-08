import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  Vector2,
  type BufferGeometry,
  type CanvasTexture,
  type Scene,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BlockType, type ResourceBoxView, type TerrainView } from '../../contract'
import { Batch, M, trs } from '../batch'
import { barrelGeometry, crateGeometry, goldChestGeometry, hardBlockGeometry, ironBoxGeometry, softBlockGeometry } from '../geo/blocks'
import { tierCode, TIER_CODE } from '../logic/growth-look'
import { packShore, WATER_COLORS, waterCornerMask, waterShoreMask } from '../logic/water'
import { groundQuad } from '../geo/bomb'
import { hash01 } from '../logic/rand'
import type { SharedMaterials } from '../materials'
import { SKY, SOFT_BLOCK_COLORS } from '../palette'
import { drawMatTexture, rugTexture, stitchTexture, woodTexture } from '../textures'

/**
 * 地形：桌面软垫（奶油方砖）+ 托盘包边 + 毛毡地毯 + 木纹桌面；三种砖各一个 InstancedMesh（槽位 = Y·size + X）；
 * 水方格下沉 0.15（软垫挖洞 + 浅色池壁 + 奶油石沿 + 池底 + 水面）。水（用户 2026-09-28 反馈「一坨绿色」「水还是很丑」后重做，
 * 玩具水池风格）：池底是略深的蓝 + 缓慢漂移的光纹；上面一层半透明、不走色调映射的高饱和清亮蓝水面（logic/water WATER_COLORS），
 * 岸边浅、水心深，斜向流动的白色波纹条纹 + 卡通焦散网纹 + 零星四角星闪点 + 沿岸一圈起伏的白泡沫，整块水面缓慢升降
 * （每个水格经 aTint 带上四边与四个斜角是否是岸，拐角处深浅 / 泡沫连续不断缝）。全在着色器里算，只有十几个水格，开销可忽略。
 * 之前「一坨绿色」的根因：地毯（绿毛毡）与桌面整块铺在棋盘底下、比下沉的水面高，挖洞处露出的是地毯；现在两者在棋盘范围挖空。
 * 只按 `rev` 与自存副本做 diff —— 不依赖 BrickDestroyed 表现事件。
 * 原型扩展（NON-CONTRACT，ADR 0040）：木箱格按 `WorldSnapshot.ResourceBoxes` 的等级换成木箱 / 铁箱（斜角保险箱，金属材质）/
 * 金箱（拱顶宝箱，亮金属材质）三种实例网格；不在列表里的木箱格按木箱画。
 */

const ZERO = new Matrix4().makeScale(0, 0, 0)
const POP_MS = 80
/** 水面比地面低多少（格）；涟漪也画在这个高度上。 */
export const WATER_SINK = 0.15
const POOL_DEPTH = 0.36

const waterVert = /* glsl */ `
attribute vec4 aTint;
uniform float uTime;
varying vec3 vWorld;
varying vec4 vShore;
varying vec2 vCell;
void main() {
  vShore = aTint;
  // 格内坐标（0..1）走插值而不是在片元里 fract(世界坐标)：格缝上的抗锯齿片元会在格外取样，fract 一绕回去
  // 就算成对边的岸，格缝上出现一像素的亮线；插值只会略微越界，片元里夹紧即可。
  vCell = position.xz + 0.5;
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  #endif
  vec4 w = modelMatrix * p;
  // 水面整体缓慢起伏（整块一起升降，幅度很小，只为「活着」的感觉）。
  w.y += 0.012 * sin(uTime * 1.1);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`
/**
 * 水面（半透明，能隐约看到池底）：岸边清亮浅蓝 → 水心略深；斜向缓慢流动的白色波纹条纹 + 卡通焦散网纹（窄的硬边白线，
 * 不是噪点）+ 零星四角星闪点；岸边一圈随时间轻微起伏的白色泡沫；条纹 / 泡沫处更不透明。
 */
const waterFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec3 uSpark;
varying vec3 vWorld;
varying vec4 vShore;
varying vec2 vCell;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 p = vWorld.xz;
  // 到最近的岸的距离（格内坐标；aTint 每分量 = 边 + 2 × 斜角，见 logic/water packShore / shoreDistance，同一算法）。
  vec2 c = clamp(vCell, 0.0, 1.0);
  vec4 corner = step(1.5, vShore);
  vec4 side = step(0.5, vShore - 2.0 * corner);
  float d = 1.0;
  if (side.x > 0.5) d = min(d, c.x);
  if (side.y > 0.5) d = min(d, 1.0 - c.x);
  if (side.z > 0.5) d = min(d, c.y);
  if (side.w > 0.5) d = min(d, 1.0 - c.y);
  if (corner.x > 0.5) d = min(d, length(c));
  if (corner.y > 0.5) d = min(d, length(vec2(1.0 - c.x, c.y)));
  if (corner.z > 0.5) d = min(d, length(vec2(c.x, 1.0 - c.y)));
  if (corner.w > 0.5) d = min(d, length(1.0 - c));
  float depth = smoothstep(0.02, 0.5, d);
  vec3 col = mix(uShallow, mix(uShallow, uDeep, 0.5), depth);
  // 白色波纹条纹：斜向、缓慢流动、被两组正弦扭成卡通的弯线（窄、硬边）。
  float band = sin((p.x + p.y) * 3.0 - uTime * 0.8 + 1.4 * sin(p.x * 1.7 - uTime * 0.5) + 1.1 * sin(p.y * 2.3 + uTime * 0.4));
  float stripe = smoothstep(0.88, 0.94, band);
  // 卡通焦散网纹：两层扭曲的 |sin| 取小，阈值成细的白网线，缓慢漂移。
  vec2 q = p * 2.1 + vec2(uTime * 0.11, -uTime * 0.08);
  float n = min(abs(sin(q.x * 3.0 + 1.4 * sin(q.y * 2.1 + uTime * 0.45))), abs(sin(q.y * 2.6 + 1.4 * sin(q.x * 1.8 - uTime * 0.35))));
  float net = 1.0 - smoothstep(0.06, 0.13, n);
  float white = max(stripe * 0.9, net * 0.6) * (0.55 + 0.45 * depth);
  col = mix(col, vec3(1.0), white);
  // 零星闪点：格子里个别位置一闪一闪的四角星（亮度平滑起落，不频闪）。
  vec2 g = floor(p * 5.0);
  float h = hash(g);
  float ph = fract(h * 13.7 + uTime * (0.3 + 0.25 * h));
  float blink = smoothstep(0.0, 0.1, ph) * smoothstep(0.3, 0.1, ph);
  vec2 f = fract(p * 5.0) - 0.5 - 0.3 * (vec2(hash(g + 3.1), hash(g + 7.7)) - 0.5);
  float star = exp(-abs(f.x) * 60.0) * exp(-abs(f.y) * 9.0) + exp(-abs(f.y) * 60.0) * exp(-abs(f.x) * 9.0);
  float spark = step(0.82, h) * blink * clamp(star, 0.0, 1.0);
  col = mix(col, uSpark, spark);
  // 岸边白色泡沫描边：宽度随时间与位置轻微起伏。
  float fw = 0.1 + 0.035 * sin(uTime * 1.6 + (p.x - p.y) * 5.0);
  float foam = 1.0 - smoothstep(fw * 0.55, fw, d);
  col = mix(col, uFoam, foam);
  // 半透明：水心能隐约看到池底；泡沫、条纹、闪点处更实。
  float alpha = mix(0.9, 0.66, depth);
  alpha = max(alpha, max(foam, max(white, spark)));
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`
/** 池底：略深的蓝 + 缓慢漂移的柔和光纹（与水面的网纹错开速度，透过水面看有层次）。 */
const poolFloorFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
varying vec3 vWorld;
void main() {
  vec2 p = vWorld.xz * 1.5 + vec2(-uTime * 0.05, uTime * 0.04);
  float n = min(abs(sin(p.x * 2.7 + 1.2 * sin(p.y * 1.9 + uTime * 0.3))), abs(sin(p.y * 2.3 + 1.2 * sin(p.x * 1.6 - uTime * 0.25))));
  float light = 1.0 - smoothstep(0.08, 0.32, n);
  gl_FragColor = vec4(uDeep * (0.82 + 0.5 * light), 1.0);
  #include <colorspace_fragment>
}
`
const poolFloorVert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

/**
 * 平铺在地上的「回」字形平面（外边 outer、正中挖掉 inner 见方），XZ 平面、法线朝上，UV 按外框 0..1。
 * 地毯与桌面用它：棋盘底下不能有东西——原来地毯（绿毛毡，y −0.02）与桌面（y −0.05）整块铺在棋盘下、比下沉的水面
 * （y −0.15）还高，软垫挖洞处露出来的其实是绿地毯，这正是用户说的「水一坨绿色」（2026-09-28）。
 */
export function framePlaneGeometry(outer: number, inner: number): BufferGeometry {
  const o = outer / 2
  const i = inner / 2
  const shape = new Shape([new Vector2(-o, -o), new Vector2(o, -o), new Vector2(o, o), new Vector2(-o, o)])
  shape.holes.push(new Path([new Vector2(-i, -i), new Vector2(-i, i), new Vector2(i, i), new Vector2(i, -i)]))
  const g = new ShapeGeometry(shape)
  const pos = g.getAttribute('position')
  const uv = g.getAttribute('uv')
  for (let k = 0; k < pos.count; k++) uv.setXY(k, (pos.getX(k) + o) / outer, (pos.getY(k) + o) / outer)
  g.rotateX(-Math.PI / 2)
  return g
}

export interface RemovedBrick {
  idx: number
  block: number
}

interface Pop {
  kind: number
  idx: number
  start: number
}

export class TerrainView3D {
  private readonly size: number
  private brick: Uint8Array
  private ground: Uint8Array
  private rev = -1
  private readonly soft: InstancedMesh
  private readonly hard: InstancedMesh
  private readonly crate: InstancedMesh
  private readonly barrel: InstancedMesh
  /** 原型扩展（NON-CONTRACT，ADR 0040）：铁箱 / 金箱。 */
  private readonly ironBox: InstancedMesh
  private readonly goldBox: InstancedMesh
  /** 每格资源箱等级编码（logic/growth-look TIER_CODE；0 = 木）。砖消失后保留，弹飞时还用得上。 */
  private readonly tiers: Uint8Array
  private readonly matMesh: Mesh
  private matTex: CanvasTexture
  private readonly matMat: MeshStandardMaterial
  private readonly water: Batch
  private readonly walls: Batch
  private readonly rims: Batch
  private readonly waterMat: ShaderMaterial
  private readonly floorMat: ShaderMaterial
  private readonly pops: Pop[] = []
  /** 逻辑上已消失、画面上还在等爆炸时序弹飞的砖（idx → 方块类型）。 */
  private readonly pending = new Map<number, number>()
  private readonly c = new Color()

  constructor(scene: Scene, mats: SharedMaterials, size: number) {
    this.size = size
    const n = size * size
    this.brick = new Uint8Array(n)
    this.tiers = new Uint8Array(n)
    this.ground = new Uint8Array(n).fill(BlockType.地面)
    const center = size / 2

    // 软垫：挖洞贴图 + alphaTest
    this.matTex = drawMatTexture(null, size, this.ground)
    this.matMat = new MeshStandardMaterial({ map: this.matTex, roughness: 0.92, metalness: 0, alphaTest: 0.5 })
    this.matMesh = new Mesh(new PlaneGeometry(size, size), this.matMat)
    this.matMesh.rotation.x = -Math.PI / 2
    this.matMesh.position.set(center, 0, center)
    this.matMesh.receiveShadow = true
    scene.add(this.matMesh)

    // 池底（只从挖洞处、透过半透明水面看得见）：略深的蓝 + 缓慢漂移的光纹。
    this.floorMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDeep: { value: new Color(WATER_COLORS.deep) } },
      vertexShader: poolFloorVert,
      fragmentShader: poolFloorFrag,
    })
    this.floorMat.toneMapped = false
    const floor = new Mesh(new PlaneGeometry(size, size), this.floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(center, -POOL_DEPTH, center)
    scene.add(floor)

    // 托盘包边
    const rimMat = new MeshStandardMaterial({ map: stitchTexture(SKY, 'rgba(255,248,236,0.95)'), roughness: 0.8 })
    const rimTex = rimMat.map!
    rimTex.repeat.set(size + 0.8, 1)
    const rimW = 0.4
    const rimH = 0.3
    const len = size + rimW * 2
    const rimPlaces: [number, number, number][] = [
      [center, -rimW / 2, 0],
      [center, size + rimW / 2, 0],
      [-rimW / 2, center, Math.PI / 2],
      [size + rimW / 2, center, Math.PI / 2],
    ]
    const rimGeos = rimPlaces.map(([x, z, ry]) => {
      const g = new BoxGeometry(len, rimH, rimW)
      g.rotateY(ry)
      g.translate(x, rimH / 2, z)
      return g
    })
    const rim = new Mesh(mergeGeometries(rimGeos), rimMat)
    for (const g of rimGeos) g.dispose()
    rim.castShadow = true
    rim.receiveShadow = true
    scene.add(rim)

    // 地毯 + 桌面：棋盘范围挖空（软垫本身铺满棋盘），水格的洞下面才看得到水。
    const rugTex = rugTexture()
    const rug = new Mesh(framePlaneGeometry(size + 26, size), new MeshStandardMaterial({ map: rugTex, roughness: 1 }))
    rug.position.set(center, -0.02, center)
    rug.receiveShadow = true
    scene.add(rug)
    const wood = woodTexture()
    wood.repeat.set(24, 24)
    const table = new Mesh(framePlaneGeometry(240, size), new MeshStandardMaterial({ map: wood, roughness: 0.85 }))
    table.position.set(center, -0.05, center)
    table.receiveShadow = true
    scene.add(table)

    // 三种砖
    const mk = (geo: ReturnType<typeof softBlockGeometry>, mat: MeshStandardMaterial, color: boolean): InstancedMesh => {
      const im = new InstancedMesh(geo, mat, n)
      im.castShadow = true
      im.receiveShadow = true
      im.frustumCulled = false
      for (let i = 0; i < n; i++) {
        im.setMatrixAt(i, ZERO)
        if (color) im.setColorAt(i, this.c.setHex(0xffffff))
      }
      scene.add(im)
      return im
    }
    this.soft = mk(softBlockGeometry(), mats.plasticTinted, true)
    this.hard = mk(hardBlockGeometry(), mats.tin, false)
    this.crate = mk(crateGeometry(), mats.plastic, false)
    this.barrel = mk(barrelGeometry(), mats.plastic, false)
    this.ironBox = mk(ironBoxGeometry(), mats.tin, false)
    this.goldBox = mk(goldChestGeometry(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.6 }), false)

    // 水
    // 半透明、不走色调映射：水色就是 WATER_COLORS 给的高饱和清亮蓝；先于其他半透明物体画（涟漪画在它上面）。
    this.waterMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new Color(WATER_COLORS.deep) },
        uShallow: { value: new Color(WATER_COLORS.shallow) },
        uFoam: { value: new Color(WATER_COLORS.foam) },
        uSpark: { value: new Color(WATER_COLORS.spark) },
      },
      vertexShader: waterVert,
      fragmentShader: waterFrag,
      transparent: true,
      depthWrite: false,
    })
    this.waterMat.toneMapped = false
    this.water = new Batch(groundQuad(), this.waterMat, 96, { tint: true, renderOrder: -1 })
    const wallGeo = new PlaneGeometry(1, POOL_DEPTH)
    wallGeo.translate(0, -POOL_DEPTH / 2, 0)
    this.walls = new Batch(wallGeo, new MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.9 }), 256, { receiveShadow: true })
    this.rims = new Batch(new BoxGeometry(1.0, 0.07, 0.12), new MeshStandardMaterial({ color: 0xf6ead3, roughness: 0.85 }), 256, {
      castShadow: false,
      receiveShadow: true,
    })
    scene.add(this.water.mesh, this.walls.mesh, this.rims.mesh)
  }

  get groundLayer(): Uint8Array {
    return this.ground
  }

  get brickLayer(): Uint8Array {
    return this.brick
  }

  /** 该格资源箱的等级编码（0 木 / 1 铁 / 2 金）。 */
  tierAt(idx: number): number {
    return this.tiers[idx] ?? TIER_CODE.wood
  }

  /**
   * 资源箱等级（每份快照调用一次，放在 sync 之后）：当前是木箱的格按列表换网格；已消失的格保留旧等级（弹飞动画用）。
   */
  syncTiers(boxes: ReadonlyMap<number, ResourceBoxView>): void {
    let changed = false
    for (let i = 0; i < this.brick.length; i++) {
      if (this.brick[i] !== BlockType.木箱) continue
      const code = tierCode(boxes.get(i))
      if (code === this.tiers[i]) continue
      const was = this.crateMesh(this.tiers[i])
      this.tiers[i] = code
      if (this.pending.has(i)) continue
      was.setMatrixAt(i, ZERO)
      this.placeSlot(i, BlockType.木箱)
      changed = true
    }
    if (changed) this.flush()
  }

  groundAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return BlockType.地面
    return this.ground[y * this.size + x]
  }

  /**
   * 与快照地形 diff。新出现 / 改变的砖立刻生效；消失的砖返回给调用方，由它按爆炸时序调用 {@link pop}。
   * `silent`（开局 / 换图 / 首帧）时消失的砖直接清掉，不返回。
   */
  sync(t: TerrainView, silent: boolean, out: RemovedBrick[]): void {
    out.length = 0
    if (t.rev === this.rev && !silent) return
    this.rev = t.rev
    if (silent) this.reset()
    const n = this.size * this.size
    let groundChanged = false
    for (let i = 0; i < n; i++) {
      if (this.ground[i] !== t.ground[i]) {
        groundChanged = true
        break
      }
    }
    if (groundChanged) {
      this.ground = Uint8Array.from(t.ground)
      this.rebuildGround()
    }
    for (let i = 0; i < n; i++) {
      const was = this.brick[i]
      const now = t.brick[i]
      if (was === now) continue
      if (now === BlockType.Air && !silent) {
        this.brick[i] = now
        this.pending.set(i, was)
        out.push({ idx: i, block: was })
        continue
      }
      this.brick[i] = now
      this.setSlot(i, was, now)
    }
    this.flush()
  }

  /** 砖块弹飞（80 ms），槽位在结束时清空；返回该砖的颜色（给碎片用）。 */
  pop(idx: number, block: number, now: number): number {
    if (!this.pending.delete(idx)) return 0xffffff
    this.pops.push({ kind: block, idx, start: now })
    if (block === BlockType.积木) return this.softColor(idx)
    if (block === BlockType.桶) return 0xc98f5a
    if (block === BlockType.木箱) return this.tiers[idx] === TIER_CODE.gold ? 0xffc93c : this.tiers[idx] === TIER_CODE.iron ? 0x5b6778 : 0xc98f5a
    return 0x7f95b2
  }

  softColor(idx: number): number {
    const x = idx % this.size
    const y = Math.floor(idx / this.size)
    const base = SOFT_BLOCK_COLORS[(x * 7 + y * 13) % 4]
    const j = 1 + (hash01(idx, 5) - 0.5) * 0.08
    const r = Math.min(255, Math.round(((base >> 16) & 255) * j))
    const g = Math.min(255, Math.round(((base >> 8) & 255) * j))
    const b = Math.min(255, Math.round((base & 255) * j))
    return (r << 16) | (g << 8) | b
  }

  private crateMesh(code: number): InstancedMesh {
    return code === TIER_CODE.gold ? this.goldBox : code === TIER_CODE.iron ? this.ironBox : this.crate
  }

  private meshFor(block: number, idx: number): InstancedMesh | null {
    if (block === BlockType.积木 || block === BlockType.木头 || block === BlockType.鞭炮) return this.soft
    if (block === BlockType.铁皮) return this.hard
    if (block === BlockType.桶) return this.barrel
    if (block === BlockType.木箱) return this.crateMesh(this.tiers[idx] ?? TIER_CODE.wood)
    return null
  }

  private setSlot(i: number, was: number, now: number): void {
    const prev = this.meshFor(was, i)
    if (prev) prev.setMatrixAt(i, ZERO)
    this.placeSlot(i, now)
  }

  private placeSlot(i: number, now: number): void {
    const x = i % this.size
    const y = Math.floor(i / this.size)
    const next = this.meshFor(now, i)
    if (!next) return
    // 铁皮不旋转；积木 / 木箱按格微抖朝向，避免一排完全复制。
    const jitter = now === BlockType.铁皮 ? 0 : (hash01(i, 11) - 0.5) * 0.06
    next.setMatrixAt(i, trs(M, x + 0.5, 0, y + 0.5, 0, jitter, 0, 1, 1, 1))
    if (next === this.soft) next.setColorAt(i, this.c.setHex(this.softColor(i)))
  }

  private flush(): void {
    for (const m of [this.soft, this.hard, this.crate, this.ironBox, this.goldBox, this.barrel]) {
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  }

  private rebuildGround(): void {
    const s = this.size
    this.matTex = drawMatTexture(this.matTex, s, this.ground)
    if (this.matMat.map !== this.matTex) {
      this.matMat.map = this.matTex
      this.matMat.needsUpdate = true
    }
    this.water.begin()
    this.walls.begin()
    this.rims.begin()
    const isWater = (x: number, y: number) => x >= 0 && y >= 0 && x < s && y < s && this.ground[y * s + x] === BlockType.水
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        if (!isWater(x, y)) continue
        const cx = x + 0.5
        const cz = y + 0.5
        const wi = this.water.push(trs(M, cx, -WATER_SINK, cz, 0, 0, 0, 1, 1, 1))
        const shore = packShore(waterShoreMask(this.ground, s, x, y), waterCornerMask(this.ground, s, x, y))
        this.water.tint(wi, shore[0], shore[1], shore[2], shore[3])
        // 四条边：邻格不是水就立池壁 + 岸上石沿
        const edges: [number, number, number][] = [
          [0, -1, 0],
          [0, 1, Math.PI],
          [-1, 0, Math.PI / 2],
          [1, 0, -Math.PI / 2],
        ]
        for (const [dx, dy, ry] of edges) {
          if (isWater(x + dx, y + dy)) continue
          const ex = cx + dx * 0.5
          const ez = cz + dy * 0.5
          this.walls.push(trs(M, ex, 0, ez, 0, ry, 0, 1, 1, 1))
          this.rims.push(trs(M, ex + dx * 0.06, 0.035, ez + dy * 0.06, 0, ry, 0, 1.04, 1, 1))
        }
      }
    }
    this.water.end()
    this.walls.end()
    this.rims.end()
  }

  update(now: number, timeSec: number): void {
    this.waterMat.uniforms.uTime.value = timeSec
    this.floorMat.uniforms.uTime.value = timeSec
    if (this.pops.length === 0) return
    let keep = 0
    for (const p of this.pops) {
      const mesh = this.meshFor(p.kind, p.idx)
      if (!mesh) continue
      const t = (now - p.start) / POP_MS
      const x = p.idx % this.size
      const y = Math.floor(p.idx / this.size)
      if (t < 0) {
        this.pops[keep++] = p
        continue
      }
      if (t >= 1) {
        mesh.setMatrixAt(p.idx, ZERO)
      } else {
        const s = 1 - t * 0.85
        mesh.setMatrixAt(p.idx, trs(M, x + 0.5, t * 0.5, y + 0.5, t * 0.6, t * 0.8, 0, s * (1 + t * 0.2), s, s * (1 + t * 0.2)))
        this.pops[keep++] = p
      }
      mesh.instanceMatrix.needsUpdate = true
    }
    this.pops.length = keep
  }

  /** 换局：清掉进行中的弹飞。 */
  reset(): void {
    for (const p of this.pops) this.meshFor(p.kind, p.idx)?.setMatrixAt(p.idx, ZERO)
    for (const [idx, block] of this.pending) this.meshFor(block, idx)?.setMatrixAt(idx, ZERO)
    this.pending.clear()
    this.pops.length = 0
    this.flush()
  }
}
