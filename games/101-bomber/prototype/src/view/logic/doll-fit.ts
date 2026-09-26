import type { ProtoRules } from '../../contract'

/**
 * 玩偶「占地」的纯数学（ADR 0032 / design §6.1，第 4 轮 D10）：一个模块、一个口径（RESOLUTIONS #12）。
 * 规则层不看这些——移动只有通道与格心；这里只保证**看起来**玩偶站在 0.7 格的脚印里、不「顶」到前方的墙：
 *   - 缩放：场内玩偶 ≈ 1.2（原 1.3），配合 geo/doll.ts 收短的嘴 / 鼻 / 尾 / 手臂，向前探出 ≤ rules.dollReachMilli；
 *   - 脚圈：贴图外沿直径 = rules.dollFootprintMilli（0.7），本机脉动只往里缩；
 *   - 接触阴影：画在插值后的逻辑位置上，直径 = 脚印 × 1.2；
 *   - 太阳：从 (−9, 12, +6) 挪到 (−3, 14, +7)，头的影子不再朝 +x 落到前方墙顶。
 * 领奖台玩偶保持 1.3（仪式取景不变）。无 three 依赖，可在 node 下单测；实测守护见 `__tests__/doll-fit.test.ts`（顶点采样）。
 */

/** 场内玩偶缩放上限（表现取值，推断待验证）：原 1.3 → 1.2；实际取值还受 {@link DOLL_MODEL_REACH} 与规则约束。 */
export const DOLL_SCALE_MAX = 1.2
/** 领奖台（及选角头像）玩偶缩放：仪式取景不变。 */
export const PODIUM_DOLL_SCALE = 1.3
/**
 * 模型单位下玩偶走路时向前的最远外沿（嘴 / 鼻 / 脸 + 走路挤压拉伸 + 迈脚），由 doll-fit.test 的顶点采样实测守护：
 * 改了 geo/doll.ts 的脸部件或 dolls.ts 的步幅，测试会告诉你这个数是否还成立。
 */
export const DOLL_MODEL_REACH = 0.29

/** textures.ts `ringTexture` 的画法（256² 画布、半径 112、线宽 22）；脚圈外沿直径由它反推贴图四边形大小。 */
export const RING_TEX = { half: 128, radius: 112, width: 22 } as const
/** 圆环外沿占贴图半宽的比例（123 / 128）。 */
export const RING_OUTER_FRAC = (RING_TEX.radius + RING_TEX.width / 2) / RING_TEX.half

/** 相对棋盘中心的太阳位置（原 (−9, 12, +6)；表现取值，推断待验证）。 */
export const SUN_OFFSET = { x: -3, y: 14, z: 7 } as const

/** 其余表现取值（推断待验证）。 */
export const DOLL_FIT = {
  /** 接触阴影直径 = 脚印 × 该值（原固定 0.9）。 */
  shadowPerFootprint: 1.2,
  /** 本机脚圈呼吸：0.97 ± 0.03（只往里缩，外沿永不超过脚印）。 */
  localPulseMid: 0.97,
  localPulseAmp: 0.03,
  localPulseHz: 1,
  /** 重生保护的虚线圈（不属于脚印，维持原大小）。 */
  protectRing: 1.2,
  localRingAlpha: 0.95,
  otherRingAlpha: 0.8,
} as const

export interface DollLayout {
  /** 场内玩偶缩放。 */
  scale: number
  /** 领奖台玩偶缩放。 */
  podiumScale: number
  /** 脚圈贴图四边形边长（外沿直径 = 脚印）。 */
  ringQuad: number
  /** 脚圈外沿直径（= rules.dollFootprintMilli / 1000）。 */
  ringOuter: number
  /** 接触阴影直径。 */
  shadow: number
  /** 保护期虚线圈直径。 */
  protectRing: number
}

type FitRules = Pick<ProtoRules, 'dollFootprintMilli' | 'dollReachMilli'>

/** 脚圈贴图四边形边长：让贴图外沿直径恰好 = 脚印。 */
export function footRingQuad(footprintMilli: number): number {
  return footprintMilli / 1000 / RING_OUTER_FRAC
}

/** 本机脚圈的呼吸系数 ∈ [0.94, 1]（乘在 footRingQuad 上，只往里缩）。 */
export function localRingPulse(nowMs: number): number {
  return DOLL_FIT.localPulseMid + DOLL_FIT.localPulseAmp * Math.sin((nowMs / 1000) * Math.PI * 2 * DOLL_FIT.localPulseHz)
}

export function contactShadowSize(footprintMilli: number): number {
  return (footprintMilli / 1000) * DOLL_FIT.shadowPerFootprint
}

/** 缩放：不超过 {@link DOLL_SCALE_MAX}，且模型外沿 × 缩放 ≤ 向前探出上限与半个脚印。 */
export function dollScale(r: FitRules): number {
  return Math.min(DOLL_SCALE_MAX, r.dollReachMilli / 1000 / DOLL_MODEL_REACH, r.dollFootprintMilli / 2000 / DOLL_MODEL_REACH)
}

export function dollLayout(r: FitRules): DollLayout {
  return {
    scale: dollScale(r),
    podiumScale: PODIUM_DOLL_SCALE,
    ringQuad: footRingQuad(r.dollFootprintMilli),
    ringOuter: r.dollFootprintMilli / 1000,
    shadow: contactShadowSize(r.dollFootprintMilli),
    protectRing: DOLL_FIT.protectRing,
  }
}

/**
 * 平行光下高度差 drop 的点在地面（或更低的平面）上的影子相对该点的水平位移（米）。
 * 太阳 (−3, 14, +7) → (+0.214, −0.5)·drop：影子略朝 +x、主要朝 −z（远离镜头）。
 */
export function shadowDrift(drop: number, sun: { x: number; y: number; z: number } = SUN_OFFSET): { x: number; z: number } {
  return { x: (-sun.x / sun.y) * drop, z: (-sun.z / sun.y) * drop }
}
