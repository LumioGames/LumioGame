import { BlockType } from '../contract'
import { removeResourceBox } from './chest'
import { cellOfIdx, emit, type World } from './world'

/**
 * 帧末一批写（契约 §6.1）：各系统本 Tick 下的砖层写单合成一批，同帧同格只下一条（先下者归属），
 * 在 VoxelCommit 相一次提交。帧内所有读都看帧初照片，本帧写入下一帧才可见（矩阵 6.8）。
 * 原型扩展（NON-CONTRACT，ADR 0040）：碎掉的木箱格同时从资源箱登记里删掉（登记与砖层同帧一致）。
 */
export function addBrickWrite(w: World, cell: number, block: BlockType, chainId: number, owner: number): boolean {
  if (w.batch.has(cell)) return false
  w.batch.set(cell, { cell, block, chainId, owner })
  return true
}

export function commitTerrain(w: World): void {
  if (w.batch.size === 0) return
  let changed = false
  for (const wr of w.batch.values()) {
    if (w.brick[wr.cell] === BlockType.Air) continue
    if (w.brick[wr.cell] === BlockType.木箱) removeResourceBox(w, wr.cell)
    w.brick[wr.cell] = BlockType.Air
    changed = true
    emit(w, {
      type: 'BrickDestroyed',
      presentationOnly: true,
      Cell: cellOfIdx(w, wr.cell),
      Block: wr.block,
      ChainId: wr.chainId,
      OwnerNetEntityIdRaw: wr.owner,
      Tick: w.t,
    })
  }
  w.batch.clear()
  if (changed) w.rev++
}
