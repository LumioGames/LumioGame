import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  type CanvasTexture,
  type Scene,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BlockType, type TerrainView } from '../../contract'
import { Batch, M, trs } from '../batch'
import { crateGeometry, hardBlockGeometry, softBlockGeometry } from '../geo/blocks'
import { groundQuad } from '../geo/bomb'
import { hash01 } from '../logic/rand'
import type { SharedMaterials } from '../materials'
import { SKY, SOFT_BLOCK_COLORS } from '../palette'
import { drawMatTexture, rugTexture, stitchTexture, woodTexture } from '../textures'

/**
 * 地形：桌面软垫（奶油方砖）+ 托盘包边 + 毛毡地毯 + 木纹桌面；三种砖各一个 InstancedMesh（槽位 = Y·size + X）；
 * 水方格下沉 0.15（软垫挖洞 + 池壁 + 奶油石沿 + 动态波纹水面）。
 * 只按 `rev` 与自存副本做 diff —— 不依赖 BrickDestroyed 表现事件。
 */

const ZERO = new Matrix4().makeScale(0, 0, 0)
const POP_MS = 80
const WATER_SINK = 0.15
const POOL_DEPTH = 0.36

const waterVert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  #endif
  vec4 w = modelMatrix * p;
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`
const waterFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
varying vec3 vWorld;
void main() {
  vec2 p = vWorld.xz;
  float w1 = sin(p.x * 5.0 + uTime * 1.7) * sin(p.y * 4.3 - uTime * 1.3);
  float w2 = sin((p.x + p.y) * 7.0 - uTime * 2.1) * sin((p.x - p.y) * 3.1 + uTime * 0.9);
  float caust = smoothstep(0.62, 0.95, 0.5 + 0.3 * w1 + 0.3 * w2);
  vec3 col = mix(uDeep, uShallow, 0.5 + 0.5 * w1);
  col = mix(col, uFoam, caust * 0.7);
  gl_FragColor = vec4(col, 0.88);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

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
  private readonly matMesh: Mesh
  private matTex: CanvasTexture
  private readonly matMat: MeshStandardMaterial
  private readonly water: Batch
  private readonly walls: Batch
  private readonly rims: Batch
  private readonly waterMat: ShaderMaterial
  private readonly pops: Pop[] = []
  /** 逻辑上已消失、画面上还在等爆炸时序弹飞的砖（idx → 方块类型）。 */
  private readonly pending = new Map<number, number>()
  private readonly c = new Color()

  constructor(scene: Scene, mats: SharedMaterials, size: number) {
    this.size = size
    const n = size * size
    this.brick = new Uint8Array(n)
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

    // 池底（只从挖洞处看得见）
    const floor = new Mesh(new PlaneGeometry(size, size), new MeshStandardMaterial({ color: 0x2a8fb0, roughness: 1 }))
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

    // 地毯 + 桌面
    const rugTex = rugTexture()
    const rug = new Mesh(new PlaneGeometry(size + 26, size + 26), new MeshStandardMaterial({ map: rugTex, roughness: 1 }))
    rug.rotation.x = -Math.PI / 2
    rug.position.set(center, -0.02, center)
    rug.receiveShadow = true
    scene.add(rug)
    const wood = woodTexture()
    wood.repeat.set(24, 24)
    const table = new Mesh(new PlaneGeometry(240, 240), new MeshStandardMaterial({ map: wood, roughness: 0.85 }))
    table.rotation.x = -Math.PI / 2
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

    // 水
    this.waterMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new Color(0x2a9fc4) },
        uShallow: { value: new Color(0x3db8da) },
        uFoam: { value: new Color(0xbff0ff) },
      },
      vertexShader: waterVert,
      fragmentShader: waterFrag,
      transparent: true,
      depthWrite: false,
    })
    this.water = new Batch(groundQuad(), this.waterMat, 96, {})
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
    return block === BlockType.积木 ? this.softColor(idx) : block === BlockType.木箱 ? 0xc98f5a : 0x7f95b2
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

  private meshFor(block: number): InstancedMesh | null {
    if (block === BlockType.积木 || block === BlockType.木头 || block === BlockType.鞭炮) return this.soft
    if (block === BlockType.铁皮) return this.hard
    if (block === BlockType.木箱) return this.crate
    return null
  }

  private setSlot(i: number, was: number, now: number): void {
    const x = i % this.size
    const y = Math.floor(i / this.size)
    const prev = this.meshFor(was)
    if (prev) prev.setMatrixAt(i, ZERO)
    const next = this.meshFor(now)
    if (!next) return
    // 铁皮不旋转；积木 / 木箱按格微抖朝向，避免一排完全复制。
    const jitter = now === BlockType.铁皮 ? 0 : (hash01(i, 11) - 0.5) * 0.06
    next.setMatrixAt(i, trs(M, x + 0.5, 0, y + 0.5, 0, jitter, 0, 1, 1, 1))
    if (next === this.soft) next.setColorAt(i, this.c.setHex(this.softColor(i)))
  }

  private flush(): void {
    for (const m of [this.soft, this.hard, this.crate]) {
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
        this.water.push(trs(M, cx, -WATER_SINK, cz, 0, 0, 0, 1, 1, 1))
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
    if (this.pops.length === 0) return
    let keep = 0
    for (const p of this.pops) {
      const mesh = this.meshFor(p.kind)
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
    for (const p of this.pops) this.meshFor(p.kind)?.setMatrixAt(p.idx, ZERO)
    for (const [idx, block] of this.pending) this.meshFor(block)?.setMatrixAt(idx, ZERO)
    this.pending.clear()
    this.pops.length = 0
    this.flush()
  }
}
