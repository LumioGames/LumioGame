import { BufferAttribute, BufferGeometry, Color, Mesh, ShaderMaterial, type Object3D, type Quaternion, type Texture } from 'three'
import type { FinalCircleView, RingRect } from '../../contract'
import { Batch, M, tqs, trs } from '../batch'
import { billboardQuad, groundQuad } from '../geo/bomb'
import { hash01 } from '../logic/rand'
import { fogCells, forEachRingDash, sameRing } from '../logic/ring'
import { softQuadMaterial } from '../materials'

/**
 * 决赛圈毒雾（design §4.2 / round-2 表现规格）：圈外内场每格一块 0.9 格高的半透明紫雾
 * （#7B3FA0 → #B06BD8 竖向渐变 + 流动噪声 + 闪点），只画顶面与朝安全区的侧面，相邻雾格之间不叠透明；
 * 圈收缩时新进毒圈的格从地面「涨」起来。边界一圈明亮流动虚线（雾顶沿 + 地面），
 * 已预告的下一圈画成地面上白 ↔ 黄脉动的虚线方框。上浮的星形闪点散在雾里。
 */

export const FOG_HEIGHT = 0.9
const RISE_SEC = 0.7
const MOTES = 90
const DASH_SPACING = 0.5

const fogVert = /* glsl */ `
attribute float aBorn;
uniform float uTime;
varying vec3 vW;
varying float vH;
varying float vFresh;
void main() {
  float r = clamp((uTime - aBorn) / ${RISE_SEC.toFixed(2)}, 0.0, 1.0);
  float e = 1.0 - pow(1.0 - r, 3.0);
  vec3 p = position;
  p.y *= e;
  vH = position.y / ${FOG_HEIGHT.toFixed(2)};
  vFresh = 1.0 - r;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

const fogFrag = /* glsl */ `
uniform float uTime;
uniform float uStrength;
uniform vec3 uLow;
uniform vec3 uHigh;
varying vec3 vW;
varying float vH;
varying float vFresh;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 p = vW.xz * 1.1 + vec2(uTime * 0.22, -uTime * 0.17) + vec2(0.0, vW.y * 0.8);
  float n = noise(p) * 0.6 + noise(p * 2.7 - uTime * 0.35) * 0.4;
  vec3 col = mix(uLow, uHigh, clamp(vH * 0.75 + (n - 0.5) * 0.6 + 0.15, 0.0, 1.0));
  float a = mix(0.58, 0.34, vH) * (0.72 + 0.56 * n);
  // 雾里的闪点：稀疏网格上的小亮点按各自相位闪烁。
  vec2 g = vec2(vW.x + vW.y * 0.7, vW.z - vW.y * 0.5) * 5.0 + vec2(0.0, uTime * 0.6);
  vec2 gi = floor(g);
  float h = hash(gi);
  float tw = 0.5 + 0.5 * sin(uTime * 4.0 + h * 50.0);
  float d = length(fract(g) - 0.5);
  float spark = step(0.9, h) * smoothstep(0.22, 0.0, d) * tw;
  col += vec3(1.0, 0.82, 1.0) * spark * 1.4 + uHigh * vFresh * 0.6;
  a = max(a, spark * 0.85) + vFresh * 0.2;
  gl_FragColor = vec4(col, clamp(a * uStrength, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export class RingFog {
  private readonly size: number
  private readonly mesh: Mesh
  private readonly mat: ShaderMaterial
  private readonly born: Float32Array
  private readonly fogged: Uint8Array
  private readonly dashes: Batch
  private readonly motes: Batch
  private ring: RingRect | null = null
  private next: RingRect | null = null
  private cells: number[] = []
  private strength = 0
  private readonly c = new Color()
  private readonly edge = new Color(0xf6d2ff)
  private readonly white = new Color(0xffffff)
  private readonly yellow = new Color(0xffe066)
  private readonly moteColor = new Color(0xf2b8ff)
  private dashY = 0
  private dashScale = 1
  private dashAlpha = 1
  private readonly putDash = (x: number, z: number, rotY: number): void => {
    const i = this.dashes.push(trs(M, x, this.dashY, z, 0, rotY, 0, 0.36 * this.dashScale, 1, 0.1 * this.dashScale))
    this.dashes.tint(i, this.c.r, this.c.g, this.c.b, this.dashAlpha)
  }

  constructor(parent: Object3D, size: number, dashTex: Texture, starTex: Texture) {
    this.size = size
    this.born = new Float32Array(size * size).fill(-1e6)
    this.fogged = new Uint8Array(size * size)
    this.mat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uStrength: { value: 0 },
        uLow: { value: new Color(0x7b3fa0) },
        uHigh: { value: new Color(0xb06bd8) },
      },
      vertexShader: fogVert,
      fragmentShader: fogFrag,
      transparent: true,
      depthWrite: false,
    })
    this.mesh = new Mesh(new BufferGeometry(), this.mat)
    this.mesh.renderOrder = 8
    this.mesh.frustumCulled = false
    parent.add(this.mesh)
    this.dashes = new Batch(groundQuad(), softQuadMaterial(dashTex, false, { toneMapped: false }), 480, { tint: true, renderOrder: 9 })
    this.motes = new Batch(billboardQuad(), softQuadMaterial(starTex, true), MOTES, { tint: true, renderOrder: 10 })
    parent.add(this.dashes.mesh, this.motes.mesh)
    this.rebuild()
  }

  /** 启动预热：临时铺一圈雾，让着色器在开局前编译好。 */
  warmup(on: boolean): void {
    if (on) {
      this.cells = fogCells(this.size, { Min: 2, Max: this.size - 3 })
      for (const i of this.cells) this.fogged[i] = 1
    } else {
      this.cells = []
      this.fogged.fill(0)
    }
    this.rebuild()
    this.mesh.visible = on
    this.mat.uniforms.uStrength.value = on ? 1 : 0
  }

  clear(): void {
    this.ring = null
    this.next = null
    this.cells = []
    this.fogged.fill(0)
    this.born.fill(-1e6)
    this.strength = 0
    this.rebuild()
  }

  /** 新快照：安全圈变化时重建雾体；silent（首帧 / 换局）时不做「涨起来」。 */
  sync(fc: FinalCircleView | null, nowSec: number, silent: boolean): void {
    const ring = fc ? fc.ring : null
    this.next = fc ? fc.nextRing : null
    if (sameRing(ring, this.ring)) return
    this.ring = ring ? { Min: ring.Min, Max: ring.Max } : null
    this.cells = ring ? fogCells(this.size, ring) : []
    const now = new Uint8Array(this.size * this.size)
    for (const i of this.cells) {
      now[i] = 1
      if (!this.fogged[i]) this.born[i] = silent ? nowSec - 10 : nowSec
    }
    this.fogged.set(now)
    this.rebuild()
  }

  /** 世界格是否在毒雾里（给玩偶染色等用）。 */
  isFog(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return false
    return this.fogged[y * this.size + x] === 1
  }

  update(nowMs: number, dt: number, camQuat: Quaternion): void {
    const t = nowMs / 1000
    this.strength = Math.max(0, Math.min(1, this.strength + (this.ring ? dt / 0.6 : -dt / 0.4)))
    this.mat.uniforms.uTime.value = t
    this.mat.uniforms.uStrength.value = this.strength
    this.mesh.visible = this.strength > 0 && this.cells.length > 0
    this.dashes.begin()
    this.motes.begin()
    if (this.ring && this.strength > 0) {
      // 当前圈边界：雾顶沿一圈 + 地面一圈，顺时针流动。
      this.c.copy(this.edge)
      this.dashAlpha = 0.95 * this.strength
      this.dashScale = 1
      this.dashY = FOG_HEIGHT + 0.015
      forEachRingDash(this.ring, DASH_SPACING, t * 0.5, 0, this.putDash)
      this.dashY = 0.035
      this.dashAlpha = 0.8 * this.strength
      forEachRingDash(this.ring, DASH_SPACING, t * 0.5, 0.08, this.putDash)
      // 下一圈预告：白 ↔ 黄脉动，逆向流动。
      if (this.next) {
        const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 4)
        this.c.copy(this.white).lerp(this.yellow, pulse)
        this.dashAlpha = (0.55 + 0.45 * pulse) * this.strength
        this.dashScale = 1.05 + 0.2 * pulse
        this.dashY = 0.04
        forEachRingDash(this.next, DASH_SPACING, -t * 0.6, 0.1, this.putDash)
      }
      // 上浮闪点
      const n = this.cells.length
      if (n > 0) {
        for (let i = 0; i < MOTES; i++) {
          const cell = this.cells[Math.floor(hash01(i, 21) * n) % n]
          const cx = (cell % this.size) + 0.15 + hash01(i, 22) * 0.7
          const cz = Math.floor(cell / this.size) + 0.15 + hash01(i, 23) * 0.7
          const period = 2.2 + hash01(i, 24) * 1.6
          const u = (t / period + hash01(i, 25)) % 1
          const y = 0.1 + u * 1.1
          const s = (0.1 + hash01(i, 26) * 0.1) * Math.sin(Math.PI * u)
          const idx = this.motes.push(tqs(M, cx + Math.sin(t * 1.3 + i) * 0.08, y, cz, camQuat, s, s, 1))
          this.motes.tint(idx, this.moteColor.r * 1.4, this.moteColor.g * 1.2, this.moteColor.b * 1.4, 0.9 * this.strength)
        }
      }
    }
    this.dashes.end()
    this.motes.end()
  }

  private rebuild(): void {
    const s = this.size
    const H = FOG_HEIGHT
    const pos: number[] = []
    const born: number[] = []
    const isFog = (x: number, y: number) => x >= 0 && y >= 0 && x < s && y < s && this.fogged[y * s + x] === 1
    const interior = (x: number, y: number) => x >= 1 && y >= 1 && x <= s - 2 && y <= s - 2
    const quad = (b: number, ...v: number[]): void => {
      // v = a, b, c, d 四个角（各 xyz），已按外侧看逆时针排好。
      for (const k of [0, 1, 2, 0, 2, 3]) pos.push(v[k * 3], v[k * 3 + 1], v[k * 3 + 2])
      for (let k = 0; k < 6; k++) born.push(b)
    }
    for (const i of this.cells) {
      const x = i % s
      const y = Math.floor(i / s)
      const x0 = x
      const x1 = x + 1
      const z0 = y
      const z1 = y + 1
      const b = this.born[i]
      quad(b, x0, H, z0, x0, H, z1, x1, H, z1, x1, H, z0)
      if (interior(x, y - 1) && !isFog(x, y - 1)) quad(b, x0, 0, z0, x0, H, z0, x1, H, z0, x1, 0, z0)
      if (interior(x, y + 1) && !isFog(x, y + 1)) quad(b, x1, 0, z1, x1, H, z1, x0, H, z1, x0, 0, z1)
      if (interior(x - 1, y) && !isFog(x - 1, y)) quad(b, x0, 0, z1, x0, H, z1, x0, H, z0, x0, 0, z0)
      if (interior(x + 1, y) && !isFog(x + 1, y)) quad(b, x1, 0, z0, x1, H, z0, x1, H, z1, x1, 0, z1)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    g.setAttribute('aBorn', new BufferAttribute(new Float32Array(born), 1))
    this.mesh.geometry.dispose()
    this.mesh.geometry = g
  }
}
