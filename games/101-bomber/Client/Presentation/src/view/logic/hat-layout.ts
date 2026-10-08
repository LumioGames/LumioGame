/**
 * 帽子塔布局（原型表现：帽塔封顶 4 顶 + ×N 数字牌，取代 design §9.2 原「12 顶以内逐顶叠 / 压缩塔段」）。
 * - 最多画 4 顶，越往上越小（第 i 层缩放 1.1·0.85^i）；超过 4 顶的帽数由 DOM「×N」牌显示；
 * - 帽王皇冠戴在封顶后的塔顶（0 顶时直接戴在头上）；塔高已含皇冠。
 * 所有数值都在世界单位里（帽子不跟玩偶缩放）；领奖台另乘 unit 系数。
 * 纯数学，结果写进复用对象，避免每帧分配。
 */
export const HAT = {
  /** 单顶帽子高度（帽檐 + 帽身，缩放 1 时）。 */
  height: 0.16,
  /** 相邻两层交替倾斜 ±4°。 */
  tiltRad: (4 * Math.PI) / 180,
} as const

export const HAT_STACK = {
  /** 最多画几顶。 */
  cap: 4,
  /** 第 0 层缩放（帽檐直径 0.44，约头宽 61%）。 */
  baseScale: 1.1,
  /** 每往上一层缩放 ×0.85。 */
  levelScale: 0.85,
  /** 台阶 = 帽高 · 0.78 · s_i（上一顶压住下一顶帽身顶部）。 */
  stepFrac: 0.78,
  crownScaleMin: 0.8,
  crownScaleMax: 1.0,
  /** 皇冠下沉 = 0.09 · 帽高 · s_top（套在最上一顶帽顶上）。 */
  crownSinkFrac: 0.09,
  /** 皇冠几何高（缩放 1，含尖顶宝石）。 */
  crownHeight: 0.235,
  /** 0 顶戴冠时直接戴头上的缩放。 */
  crownOnHeadScale: 0.9,
  /** 摇摆滞后的参考高度。 */
  swayRef: 0.8,
  /** 摇摆滞后每层额外 +20%。 */
  swayPerLevel: 0.2,
} as const

export interface HatStackLayout {
  /** 实际画出的帽子数（≤ cap）。 */
  drawn: number
  /** 每顶帽子底部相对头顶的高度；只有前 drawn 项有效。 */
  offsets: Float32Array
  /** 每顶帽子的缩放；只有前 drawn 项有效。 */
  scales: Float32Array
  /** 最上一顶帽子的帽顶高度（0 顶 = 0）。 */
  hatsTop: number
  /** 皇冠底部高度与缩放（不戴冠时 crownScale = 0）。 */
  crownY: number
  crownScale: number
  /** 整座塔的高度（含皇冠）。 */
  totalHeight: number
  /** 超出封顶、只由 ×N 牌表示的帽数。 */
  overflow: number
}

export function createHatStackLayout(): HatStackLayout {
  return {
    drawn: 0,
    offsets: new Float32Array(HAT_STACK.cap),
    scales: new Float32Array(HAT_STACK.cap),
    hatsTop: 0,
    crownY: 0,
    crownScale: 0,
    totalHeight: 0,
    overflow: 0,
  }
}

/** 第 i 层的缩放 1.1·0.85^i（i = cap 是虚拟层：落帽目标 / 飞帽起点之上）。 */
export function hatLevelScale(i: number): number {
  return HAT_STACK.baseScale * Math.pow(HAT_STACK.levelScale, Math.max(0, i))
}

/** 第 i 层帽底的高度：Σ_{k<i} 帽高·0.78·s_k（闭式 0.1248·1.1·(1 − 0.85^i)/0.15）。 */
export function hatLevelOffset(i: number): number {
  const q = HAT_STACK.levelScale
  return (HAT.height * HAT_STACK.stepFrac * HAT_STACK.baseScale * (1 - Math.pow(q, Math.max(0, i)))) / (1 - q)
}

export function hatStackLayout(n: number, crowned = false, out: HatStackLayout = createHatStackLayout()): HatStackLayout {
  const count = Math.max(0, Math.floor(n))
  const drawn = Math.min(count, HAT_STACK.cap)
  out.drawn = drawn
  out.overflow = count - drawn
  for (let i = 0; i < drawn; i++) {
    out.offsets[i] = hatLevelOffset(i)
    out.scales[i] = hatLevelScale(i)
  }
  if (drawn === 0) {
    out.hatsTop = 0
    out.crownY = 0
    out.crownScale = crowned ? HAT_STACK.crownOnHeadScale : 0
  } else {
    const sTop = hatLevelScale(drawn - 1)
    out.hatsTop = hatLevelOffset(drawn - 1) + HAT.height * sTop
    out.crownScale = crowned ? Math.min(HAT_STACK.crownScaleMax, Math.max(HAT_STACK.crownScaleMin, sTop)) : 0
    out.crownY = crowned ? out.hatsTop - HAT_STACK.crownSinkFrac * HAT.height * sTop : out.hatsTop
  }
  out.totalHeight = crowned ? out.crownY + HAT_STACK.crownHeight * out.crownScale : out.hatsTop
  return out
}

/** n 顶的塔上最上一顶帽子的底部高度（0 顶 = 0）。 */
export function topHatOffset(n: number): number {
  const d = Math.min(Math.max(0, Math.floor(n)), HAT_STACK.cap)
  return d > 0 ? hatLevelOffset(d - 1) : 0
}

export interface HatSlot {
  /** 帽底相对头顶的高度。 */
  offset: number
  scale: number
}

/** 吃强化落帽的目标：塔上已有 n 顶时落到第 min(n, 4) 层（n ≥ 4 落到虚拟第 4 层，落上即被塔收进 ×N）。 */
export function dropLanding(n: number, out: HatSlot = { offset: 0, scale: 0 }): HatSlot {
  const level = Math.min(Math.max(0, Math.floor(n)), HAT_STACK.cap)
  out.offset = hatLevelOffset(level)
  out.scale = hatLevelScale(level)
  return out
}

/**
 * 死亡飞帽第 k 顶（从 0 起）的起飞位置：塔上原有 nBefore 顶。
 * 超出封顶的 overflow 顶最先飞，都从最上一层起飞（读作从 ×N 牌里飞出来）；之后从上往下一层层起飞，最低到第 0 层。
 */
export function lossLaunch(k: number, nBefore: number, out: HatSlot = { offset: 0, scale: 0 }): HatSlot {
  const n = Math.max(0, Math.floor(nBefore))
  const drawn = Math.min(n, HAT_STACK.cap)
  const overflow = n - drawn
  const top = Math.max(0, drawn - 1)
  const level = Math.max(0, k < overflow ? top : top - (k - overflow))
  out.offset = hatLevelOffset(level)
  out.scale = hatLevelScale(level)
  return out
}

/** 飞帽飞行缩放：起飞时 sLaunch，线性变到落地时 0.75。 */
export function lossScale(u: number, sLaunch: number): number {
  const t = Math.min(1, Math.max(0, u))
  return sLaunch + (0.75 - sLaunch) * t
}

export interface StackBadge {
  /** 「×N」（乘号 U+00D7）；n ≤ 4 为空串。 */
  text: string
  /** 0 = 隐藏；1 = 5–9 顶；2 = 10–19 顶；3 = 20 顶及以上。 */
  tier: 0 | 1 | 2 | 3
}

/** 塔顶 ×N 数字牌：超过封顶 4 顶才显示，按帽数分三档（补偿支柱 1「最强的最显眼」）。 */
export function stackBadge(n: number): StackBadge {
  const c = Math.max(0, Math.floor(n))
  if (c <= HAT_STACK.cap) return { text: '', tier: 0 }
  return { text: `×${c}`, tier: c >= 20 ? 3 : c >= 10 ? 2 : 1 }
}

/** 第 i 顶的交替倾斜（±4°）。 */
export function hatTilt(i: number): number {
  return i % 2 === 0 ? HAT.tiltRad : -HAT.tiltRad
}

/** 弹簧摇摆的逐顶滞后系数：(o / 0.8)·(1 + 0.2·i)，越往上越大。 */
export function hatSwayLag(i: number, offset: number): number {
  return (offset / HAT_STACK.swayRef) * (1 + HAT_STACK.swayPerLevel * i)
}
