/**
 * 出局观战的镜头目标（design §4.2 / §12「观战只存在于决赛圈出局后」）：
 * 帽王能跟就跟帽王；否则沿用当前目标（避免目标在两人之间来回跳）；都不行就挑离镜头最近的存活玩家。
 */
export interface SpectateCandidate {
  id: number
  x: number
  z: number
  /** 未出局、血量 > 0、玩偶在场（重生倒计时中的人跟不了）。 */
  followable: boolean
}

/** @returns 目标 id；没有可跟的人时为 0。 */
export function chooseSpectateTarget(
  cands: readonly SpectateCandidate[],
  kingId: number,
  localId: number,
  currentId: number,
  fromX: number,
  fromZ: number,
): number {
  const ok = (id: number): boolean => id !== 0 && id !== localId && cands.some((c) => c.id === id && c.followable)
  if (ok(kingId)) return kingId
  if (ok(currentId)) return currentId
  let best = 0
  let bestD = Number.POSITIVE_INFINITY
  for (const c of cands) {
    if (!c.followable || c.id === localId) continue
    const d = (c.x - fromX) * (c.x - fromX) + (c.z - fromZ) * (c.z - fromZ)
    if (d < bestD || (d === bestD && c.id < best)) {
      bestD = d
      best = c.id
    }
  }
  return best
}
