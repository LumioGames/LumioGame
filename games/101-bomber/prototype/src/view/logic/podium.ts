import { clamp01, easeInOutCubic } from './interp'

/**
 * 领奖台（design §13）的纯逻辑：名次与站位顺序、台子布局、电影镜头轨迹。无 three 依赖。
 */

export interface PodiumEntry {
  id: number
  hats: number
  eliminated: boolean
  /** PlayerEliminated.Rank（出局时名次，越小 = 出局越晚）；事件缺席时为 undefined。 */
  elimRank?: number
  /** 在快照里第一次看到 eliminated 的 Tick；越大 = 出局越晚。 */
  elimTick?: number
}

export interface PodiumRow {
  id: number
  /** 竞赛排名（1, 1, 3）：帽数优先，再看决赛圈存活 / 出局先后；都相同才并列。 */
  rank: number
  /** 展示位（1 起，逐个不重复）：1–3 上台阶，其余站台下。 */
  place: number
  hats: number
  eliminated: boolean
}

/** 出局者之间谁更晚出局：有 Rank 用 Rank，否则用首见 Tick；> 0 表示 a 排在 b 后面。 */
function elimCompare(a: PodiumEntry, b: PodiumEntry): number {
  if (a.elimRank !== undefined && b.elimRank !== undefined && a.elimRank !== b.elimRank) return a.elimRank - b.elimRank
  if (a.elimTick !== undefined && b.elimTick !== undefined && a.elimTick !== b.elimTick) return b.elimTick - a.elimTick
  return 0
}

/**
 * 排名（design §4 平局，与 hud/ranking.ts 同口径）：帽数降序 → 决赛圈存活优先 → 出局越晚越靠前；
 * 三者都相同才并列同名次；展示顺序最后按 id 升序。
 */
export function podiumOrder(entries: readonly PodiumEntry[]): PodiumRow[] {
  const sorted = [...entries].sort(
    (a, b) =>
      b.hats - a.hats ||
      Number(a.eliminated) - Number(b.eliminated) ||
      (a.eliminated && b.eliminated ? elimCompare(a, b) : 0) ||
      a.id - b.id,
  )
  const rows: PodiumRow[] = []
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]
    const p = sorted[i - 1]
    const tie = i > 0 && e.hats === p.hats && e.eliminated === p.eliminated && (!e.eliminated || elimCompare(e, p) === 0)
    const rank = tie ? rows[i - 1].rank : i + 1
    rows.push({ id: e.id, rank, place: i + 1, hats: e.hats, eliminated: e.eliminated })
  }
  return rows
}

// ---- 台子布局（相对舞台中心，米；+z 朝镜头） ----

export const PODIUM = {
  /** 舞台台面高度：盖过积木（0.8）与铁皮（1.0）。 */
  stageTop: 1.2,
  stageWidth: 7.6,
  stageDepth: 4.6,
  stepWidth: 1.56,
  stepDepth: 1.5,
  stepZ: -0.95,
  /** 1 / 2 / 3 名台阶的 x 偏移与高度（台面以上）。 */
  steps: [
    { dx: 0, h: 1.2 },
    { dx: -1.62, h: 0.8 },
    { dx: 1.62, h: 0.5 },
  ],
  rowZ: 1.3,
  rowMaxSpacing: 1.25,
  rowMaxWidth: 6.2,
  /** 开场：舞台升起时长；各名次落位时刻（秒，相对结算开始）。 */
  riseSec: 0.8,
  rowDropSec: 1.0,
  rowDropStepSec: 0.12,
  dropSec: [3.0, 2.2, 1.6],
} as const

export type PodiumPose = 'cheer' | 'wave' | 'clap' | 'droop'

export interface PodiumSpot {
  id: number
  place: number
  /** 相对舞台中心。 */
  x: number
  /** 站立面高度（世界 y）。 */
  y: number
  z: number
  pose: PodiumPose
  /** 落位时刻（秒，相对结算开始）。 */
  dropSec: number
}

/** 名次 → 站位：前三上台阶（1 中、2 左、3 右），其余在台前一排；出局者垂头。 */
export function podiumSpots(rows: readonly PodiumRow[]): PodiumSpot[] {
  const out: PodiumSpot[] = []
  const rest = rows.filter((r) => r.place > 3)
  const n = rest.length
  const spacing = n > 1 ? Math.min(PODIUM.rowMaxSpacing, PODIUM.rowMaxWidth / (n - 1)) : 0
  for (const r of rows) {
    if (r.place <= 3) {
      const s = PODIUM.steps[r.place - 1]
      out.push({
        id: r.id,
        place: r.place,
        x: s.dx,
        y: PODIUM.stageTop + s.h,
        z: PODIUM.stepZ + 0.05,
        pose: r.place === 1 ? 'cheer' : r.place === 2 ? 'wave' : 'clap',
        dropSec: PODIUM.dropSec[r.place - 1],
      })
    } else {
      const i = r.place - 4
      out.push({
        id: r.id,
        place: r.place,
        x: (i - (n - 1) / 2) * spacing,
        y: PODIUM.stageTop,
        z: PODIUM.rowZ,
        pose: r.eliminated ? 'droop' : 'clap',
        dropSec: PODIUM.rowDropSec + i * PODIUM.rowDropStepSec,
      })
    }
  }
  return out
}

// ---- 电影镜头 ----

export interface CamPose {
  px: number
  py: number
  pz: number
  lx: number
  ly: number
  lz: number
}

const DEG = Math.PI / 180

/**
 * 领奖台镜头（相对舞台中心）：从高处全景缓推到台前低机位（俯角 55° → 21°），
 * 同时从 +12° 绕到 −12°；时长结束后停在终点附近慢慢摆动。窄屏按宽度需求自动拉远。
 */
export function podiumCameraPose(tSec: number, durSec: number, aspect: number, out: CamPose): CamPose {
  const u = easeInOutCubic(clamp01(tSec / Math.max(0.001, durSec)))
  const hold = Math.max(0, tSec - durSec)
  const pitch = (55 + (21 - 55) * u) * DEG
  const yaw = (12 * Math.cos(Math.PI * u) - 4 * Math.sin(hold * 0.35)) * DEG
  const needW = 9.5 / (2 * Math.tan(22.5 * DEG) * Math.max(0.2, aspect))
  const dist = Math.min(26, Math.max(21 + (9.2 - 21) * u, needW))
  const ly = PODIUM.stageTop + 0.9 + 0.9 * u
  const lz = -0.3
  out.lx = 0
  out.ly = ly
  out.lz = lz
  out.px = Math.sin(yaw) * Math.cos(pitch) * dist
  out.py = ly + Math.sin(pitch) * dist
  out.pz = lz + Math.cos(yaw) * Math.cos(pitch) * dist
  return out
}
