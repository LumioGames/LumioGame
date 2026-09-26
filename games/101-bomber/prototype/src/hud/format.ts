/**
 * HUD 纯格式化工具（无 DOM，可单测）。
 */

/** 剩余秒数 → `mm:ss`；向上取整，最后 0.3 秒仍显示 `00:01` 而不是提前跳 0。 */
export function formatClock(remainingSeconds: number): string {
  const s = Math.max(0, Math.ceil(remainingSeconds - 1e-9))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

/** 累计时长（秒）→ 结算页文案：`42 秒` / `1 分 05 秒`。 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return `${s} 秒`
  const m = Math.floor(s / 60)
  return `${m} 分 ${String(s % 60).padStart(2, '0')} 秒`
}

/** 剩余 Tick → 秒（小数）。 */
export function ticksToSeconds(ticks: number, tickRateHz: number): number {
  return ticks / tickRateHz
}

/**
 * 移速（千分格/秒）→ HUD 速度档：基础速度为 1 档，每颗速度+ 再 +1。
 * 水格等减速不会让档位低于 1（减速另外用样式提示）。
 */
export function speedLevel(speedMilli: number, baseMilli: number, stepMilli: number): number {
  if (stepMilli <= 0) return 1
  return Math.max(1, Math.round(1 + (speedMilli - baseMilli) / stepMilli))
}

/**
 * 半心点 → 每颗心的填充比例（0 / 0.5 / 1），长度 = 满血心数。
 * 例：6 点满、剩 3 点 → [1, 0.5, 0]。
 */
export function heartFills(points: number, maxPoints: number, pointsPerHeart: number): number[] {
  const hearts = Math.max(1, Math.ceil(maxPoints / pointsPerHeart))
  const out: number[] = []
  for (let i = 0; i < hearts; i++) {
    const inHeart = Math.min(pointsPerHeart, Math.max(0, points - i * pointsPerHeart))
    out.push(Math.round((inHeart / pointsPerHeart) * 2) / 2)
  }
  return out
}

/** 心数文案（半心精度），给无障碍标签用：`2.5 / 3 心`。 */
export function heartsLabel(points: number, maxPoints: number, pointsPerHeart: number): string {
  const cur = Math.max(0, points) / pointsPerHeart
  const max = maxPoints / pointsPerHeart
  return `${cur} / ${max} 心`
}

/** 扣血文案：1 点 →「−半心」，2 点 →「−1 心」，3 点 →「−1.5 心」。 */
export function heartDelta(points: number, pointsPerHeart: number): string {
  if (points <= 0) return ''
  if (points * 2 === pointsPerHeart) return '−半心'
  return `−${points / pointsPerHeart} 心`
}

/** 死亡掉强化的弹字（ADR 0028：掉几个强化就少几顶帽子）：「掉了 3 个强化（−3 帽）」。 */
export function lossPopupText(lost: number): string {
  return `掉了 ${lost} 个强化（−${lost} 帽）`
}

/**
 * 死亡回顾「掉落强化」一行：`drops` 为 PowerupsDropped 给的明细（「火力 ×1、速度 ×2」/「无」），
 * `hatsLost` 为掉了几级（proto.HatsLost 或快照帽数差）；都还不知道时显示「…」。
 */
export function lossLine(drops: string | null, hatsLost: number | null): string {
  if (hatsLost === 0 || drops === '无') return '无'
  if (drops !== null) return hatsLost !== null ? `${drops}（−${hatsLost} 帽）` : drops
  if (hatsLost !== null) return `${hatsLost} 个强化（−${hatsLost} 帽）`
  return '…'
}

/** HUD 缩放系数 `--u`：以 1280×720 为 1，夹在 [0.75, 1.25]（HUD 与选角界面共用）。 */
export function uiScale(vw: number, vh: number): number {
  return Math.max(0.75, Math.min(1.25, Math.min(vw / 1280, vh / 720)))
}
