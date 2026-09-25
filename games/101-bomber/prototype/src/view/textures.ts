import { CanvasTexture, ClampToEdgeWrapping, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import { BlockType } from '../contract'
import { hexCss } from './palette'
import { mulberry32 } from './logic/rand'

/** 程序化贴图（CanvasTexture），不读任何资源文件。 */

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  if (!g) throw new Error('2d canvas unavailable')
  return { c, g }
}

function tex(c: HTMLCanvasElement, repeat = false): CanvasTexture {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  t.minFilter = LinearMipmapLinearFilter
  t.wrapS = t.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping
  return t
}

/** 白心 → 透明边的径向渐变（接触阴影、辉光、火花共用，由着色器上色）。 */
export function radialTexture(): Texture {
  const { c, g } = canvas(128, 128)
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.45, 'rgba(255,255,255,0.75)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  return tex(c)
}

/** 实心抗锯齿圆环（脚圈 / 危险地圈）。 */
export function ringTexture(): Texture {
  const { c, g } = canvas(256, 256)
  g.strokeStyle = '#fff'
  g.lineWidth = 22
  g.beginPath()
  g.arc(128, 128, 112, 0, Math.PI * 2)
  g.stroke()
  return tex(c)
}

/** 虚线圆环（保护期、帽王地圈）。 */
export function dashedRingTexture(dashes = 16): Texture {
  const { c, g } = canvas(256, 256)
  g.strokeStyle = '#fff'
  g.lineWidth = 16
  g.lineCap = 'round'
  const step = (Math.PI * 2) / dashes
  for (let i = 0; i < dashes; i++) {
    g.beginPath()
    g.arc(128, 128, 112, i * step, i * step + step * 0.55)
    g.stroke()
  }
  return tex(c)
}

/** 预览格：淡蓝填充 + 奶油色虚线边（冷色 = 你的计划，暖色 = 实时危险）。 */
export function previewTexture(): Texture {
  const { c, g } = canvas(128, 128)
  g.fillStyle = 'rgba(61,184,218,0.55)'
  g.beginPath()
  g.roundRect(8, 8, 112, 112, 18)
  g.fill()
  g.strokeStyle = 'rgba(255,248,236,0.95)'
  g.lineWidth = 7
  g.setLineDash([14, 10])
  g.beginPath()
  g.roundRect(10, 10, 108, 108, 16)
  g.stroke()
  return tex(c)
}

/** 压缩帽塔段的条纹（墨色 + 金带交替）。 */
export function stripeTexture(): Texture {
  const { c, g } = canvas(16, 64)
  g.fillStyle = '#2b2320'
  g.fillRect(0, 0, 16, 64)
  g.fillStyle = '#ffc93c'
  for (let y = 4; y < 64; y += 16) g.fillRect(0, y, 16, 5)
  const t = tex(c, true)
  return t
}

const MAT_PX = 64

/**
 * 奶油色软垫方砖棋盘（两档奶油色 + 细缝）；水方格挖成透明（材质 alphaTest 挖洞，下面是下沉的水池）。
 */
export function drawMatTexture(target: CanvasTexture | null, size: number, ground: Uint8Array): CanvasTexture {
  const px = size * MAT_PX
  let c: HTMLCanvasElement
  if (target && (target.image as HTMLCanvasElement).width === px) {
    c = target.image as HTMLCanvasElement
  } else {
    c = canvas(px, px).c
  }
  const g = c.getContext('2d')!
  g.clearRect(0, 0, px, px)
  const rnd = mulberry32(1234)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (ground[y * size + x] === BlockType.水) continue
      const x0 = x * MAT_PX
      const y0 = y * MAT_PX
      g.fillStyle = '#e4d2b0'
      g.fillRect(x0, y0, MAT_PX, MAT_PX)
      g.fillStyle = (x + y) % 2 === 0 ? '#f7eedb' : '#efe1c6'
      g.beginPath()
      g.roundRect(x0 + 2, y0 + 2, MAT_PX - 4, MAT_PX - 4, 6)
      g.fill()
      // 软垫毛面的细微斑点，避免大面积纯色显塑料。
      g.fillStyle = 'rgba(160,120,70,0.05)'
      for (let k = 0; k < 10; k++) g.fillRect(x0 + 4 + rnd() * (MAT_PX - 10), y0 + 4 + rnd() * (MAT_PX - 10), 3, 3)
      g.fillStyle = 'rgba(255,255,255,0.35)'
      g.fillRect(x0 + 6, y0 + 5, MAT_PX - 12, 2)
    }
  }
  if (target && target.image === c) {
    target.needsUpdate = true
    return target
  }
  const t = tex(c)
  t.anisotropy = 8
  return t
}

/** 托盘外沿的缝线包边（沿 U 方向重复）。 */
export function stitchTexture(base: number, stitch: string): Texture {
  const { c, g } = canvas(64, 32)
  g.fillStyle = hexCss(base)
  g.fillRect(0, 0, 64, 32)
  g.strokeStyle = stitch
  g.lineWidth = 3
  g.setLineDash([10, 8])
  g.beginPath()
  g.moveTo(0, 9)
  g.lineTo(64, 9)
  g.stroke()
  return tex(c, true)
}

/** 毛毡地毯（绿）+ 四周缝线边。 */
export function rugTexture(): Texture {
  const { c, g } = canvas(512, 512)
  g.fillStyle = '#9ed3a0'
  g.fillRect(0, 0, 512, 512)
  const rnd = mulberry32(99)
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(40,90,40,0.06)'
    g.fillRect(rnd() * 512, rnd() * 512, 2, 2)
  }
  g.strokeStyle = 'rgba(255,248,236,0.9)'
  g.lineWidth = 4
  g.setLineDash([14, 10])
  g.strokeRect(14, 14, 484, 484)
  g.strokeStyle = '#86c089'
  g.setLineDash([])
  g.lineWidth = 8
  g.strokeRect(2, 2, 508, 508)
  return tex(c)
}

/** 木纹桌面。 */
export function woodTexture(): Texture {
  const { c, g } = canvas(512, 512)
  g.fillStyle = '#e3b684'
  g.fillRect(0, 0, 512, 512)
  const rnd = mulberry32(7)
  for (let i = 0; i < 70; i++) {
    const y = rnd() * 512
    g.strokeStyle = rnd() < 0.5 ? 'rgba(160,100,50,0.12)' : 'rgba(255,230,190,0.18)'
    g.lineWidth = 1 + rnd() * 3
    g.beginPath()
    g.moveTo(0, y)
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4)
    g.stroke()
  }
  // 木板缝
  g.strokeStyle = 'rgba(120,70,30,0.25)'
  g.lineWidth = 3
  for (let y = 0; y < 512; y += 128) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(512, y)
    g.stroke()
  }
  return tex(c, true)
}

/** 圆头短划（安全圈边框虚线、预告线），白色由着色器上色。 */
export function dashTexture(): Texture {
  const { c, g } = canvas(128, 32)
  g.fillStyle = '#fff'
  g.beginPath()
  g.roundRect(4, 6, 120, 20, 10)
  g.fill()
  return tex(c)
}

/** 五角星闪光（毒雾闪点、宝箱开启、冠军聚光灯），白色由着色器上色。 */
export function starTexture(): Texture {
  const { c, g } = canvas(64, 64)
  g.fillStyle = '#fff'
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 30 : 12
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    const x = 32 + Math.cos(a) * r
    const y = 32 + Math.sin(a) * r
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.closePath()
  g.fill()
  return tex(c)
}
