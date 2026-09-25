import { BlockType } from './components'

/**
 * 材质行为绑定：design.md §5.1「一行数据、六个字段」（可破坏、阻断爆炸、破坏后残留、掉落、地面效果、可通行）。
 * 方块目录归 Voxel 侧，**每个方块在炸弹人里的行为归本仓**（ADR 0016 / 0019）；引擎的水不挡路也不挡火，
 * 这些玩法列全靠本表判定。原型只用到 Stage 0 + Stage 2 的六种。
 */
export interface MaterialRow {
  /** 1 次爆炸即破坏。 */
  destructible: boolean
  /**
   * 爆炸传播遇到该格的处理：
   * - `stopBefore` 不覆盖该格、立即停（硬砖）
   * - `destroyThenStop` 摧毁该格后停；该格不计入 Reach（软砖 / 木箱）
   * - `coverThenStop` 覆盖该格（站在里面会被炸到）后停（水方格，地面层）
   * - `pass` 不影响传播
   */
  fire: 'stopBefore' | 'destroyThenStop' | 'coverThenStop' | 'pass'
  /** 破坏后的掉落：`roll` 按 dropRatePermille 掷；`always` 必掉 1 颗糖果；`none` 不掉。 */
  drop: 'roll' | 'always' | 'none'
  /** 砖层：砖为空才可通行。地面层：`walkable` 可走、`water` 可走但减速 / 禁放弹 / 溺水。 */
  passable: boolean
  ground: 'none' | 'walkable' | 'water'
  /** 残留（纯表现层贴花 / 粒子，不是方块）。 */
  residue: 'none' | 'blockDebris' | 'crateSplinters'
}

export const MATERIALS: Readonly<Record<BlockType, MaterialRow>> = {
  [BlockType.Air]: { destructible: false, fire: 'pass', drop: 'none', passable: true, ground: 'none', residue: 'none' },
  [BlockType.铁皮]: { destructible: false, fire: 'stopBefore', drop: 'none', passable: false, ground: 'none', residue: 'none' },
  [BlockType.积木]: { destructible: true, fire: 'destroyThenStop', drop: 'roll', passable: false, ground: 'none', residue: 'blockDebris' },
  [BlockType.木箱]: { destructible: true, fire: 'destroyThenStop', drop: 'always', passable: false, ground: 'none', residue: 'crateSplinters' },
  // 木头 / 鞭炮 / 冰属 Stage 5 / 候选，原型不生成；行保留以免表查询越界。
  [BlockType.木头]: { destructible: true, fire: 'destroyThenStop', drop: 'roll', passable: false, ground: 'none', residue: 'blockDebris' },
  [BlockType.鞭炮]: { destructible: true, fire: 'destroyThenStop', drop: 'none', passable: false, ground: 'none', residue: 'none' },
  [BlockType.地面]: { destructible: false, fire: 'pass', drop: 'none', passable: true, ground: 'walkable', residue: 'none' },
  [BlockType.水]: { destructible: false, fire: 'coverThenStop', drop: 'none', passable: true, ground: 'water', residue: 'none' },
  [BlockType.冰]: { destructible: false, fire: 'pass', drop: 'none', passable: true, ground: 'walkable', residue: 'none' },
}
