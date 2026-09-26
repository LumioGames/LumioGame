import type { MatchResultsView } from '../../contract'
import { rankMatch } from '../../shared/ranking'
import { clamp01, easeInOutCubic } from './interp'

/**
 * 领奖台（design §13）的纯逻辑：名次与站位顺序、台子布局、电影镜头轨迹。无 three 依赖。
 * 名次口径 = D2「活到最后者赢」（ADR 0031）：唯一实现在 shared/ranking.rankMatch，这里只做适配。
 */

export interface PodiumEntry {
  id: number
  hats: number
  eliminated: boolean
  /** 出局 Tick（快照 eliminatedTick，缺席时用首见 eliminated 的 Tick）；越大 = 出局越晚。 */
  elimTick?: number
}

export interface PodiumRow {
  id: number
  /** 竞赛名次（1, 1, 3）：存活者在前比帽数，出局者按出局先后；同 Tick 出局并列。 */
  rank: number
  /** 展示位（1 起，逐个不重复）：1–3 上台阶，其余站台下。 */
  place: number
  hats: number
  eliminated: boolean
}

/** 名次（与 HUD 结算表、规则层 match.results 同一实现）：rankMatch 的结果换成领奖台行。 */
export function podiumOrder(entries: readonly PodiumEntry[]): PodiumRow[] {
  return rankMatch(entries.map((e) => ({ id: e.id, eliminated: e.eliminated, eliminatedTick: e.elimTick ?? 0, hats: e.hats }))).map((r) => ({
    id: r.id,
    rank: r.rank,
    place: r.place,
    hats: r.hats,
    eliminated: !r.survived,
  }))
}

/** 规则层给了结果（snapshot.match.results）就直接用它，不再自己排。 */
export function rowsFromResults(r: MatchResultsView): PodiumRow[] {
  return [...r.rows]
    .sort((a, b) => a.place - b.place)
    .map((x) => ({ id: x.id, rank: x.rank, place: x.place, hats: x.hats, eliminated: !x.survived }))
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
  /** 竞赛名次：rank === 1 都戴皇冠（并列第 1 都戴，ADR 0031）。 */
  rank: number
  /** 相对舞台中心。 */
  x: number
  /** 站立面高度（世界 y）。 */
  y: number
  z: number
  pose: PodiumPose
  /** 落位时刻（秒，相对结算开始）。 */
  dropSec: number
}

/**
 * 名次 → 动作，按**真实名次 rank**（design §13）：第 1 名（含全部并列第 1）跳跃欢呼、第 2 名挥手、第 3 名拍手——
 * 即使已出局（名次是挣来的）；第 3 名之后：出局者垂头，其余鼓掌。
 */
export function podiumPose(rank: number, eliminated: boolean): PodiumPose {
  if (rank === 1) return 'cheer'
  if (rank === 2) return 'wave'
  if (rank === 3) return 'clap'
  return eliminated ? 'droop' : 'clap'
}

/**
 * 名次 → 站位：前三行上台阶（1 中、2 左、3 右），其余在台前一排；同名次按 id 排版（站位看 place）。
 * 动作与皇冠看 rank（{@link podiumPose}）：并列第 1 的人不管站哪都欢呼、戴冠，不会在台下垂头。
 */
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
        rank: r.rank,
        x: s.dx,
        y: PODIUM.stageTop + s.h,
        z: PODIUM.stepZ + 0.05,
        pose: podiumPose(r.rank, r.eliminated),
        dropSec: PODIUM.dropSec[r.place - 1],
      })
    } else {
      const i = r.place - 4
      out.push({
        id: r.id,
        place: r.place,
        rank: r.rank,
        x: (i - (n - 1) / 2) * spacing,
        y: PODIUM.stageTop,
        z: PODIUM.rowZ,
        pose: podiumPose(r.rank, r.eliminated),
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
