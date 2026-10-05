import { BlockType, type TerrainView } from './contract'
import type { ReplicaChest } from './replica-types'

interface Surface { states: Uint8Array; blockIds: Uint32Array; width: number; depth: number }
interface VoxelReader { readSurface(box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }): Surface }
interface BlockRow { blockType: number; name: string }

const visuals: Record<string, number> = { air: BlockType.Air, floor: BlockType.地面,
  iron: BlockType.铁皮, hardPillar: BlockType.铁皮, softBrick: BlockType.积木,
  crate: BlockType.木箱, chest: BlockType.Air, wood: BlockType.木头, firecracker: BlockType.鞭炮,
  barrel: BlockType.桶, water: BlockType.水, ice: BlockType.冰 }

/** This cache contains only rendering bytes derived from the Engine's voxel world. */
export class ReplicaTerrain {
  private revision = 0
  private previous: TerrainView | null = null
  private readonly blocks: Map<number, number>
  private readonly chestTypes: Set<number>
  constructor(private readonly size: number, private readonly groundLayer: number,
    private readonly obstacleLayer: number, blocks: readonly BlockRow[]) {
    this.blocks = new Map(blocks.map(b => {
      if (!(b.name in visuals)) throw new Error(`presentation_block_unsupported:${b.name}`)
      return [b.blockType, visuals[b.name]]
    }))
    this.chestTypes = new Set(blocks.filter(b => b.name === 'chest').map(b => b.blockType))
  }
  read(grid: VoxelReader, chests: readonly ReplicaChest[] = []): TerrainView | null {
    const layer = (y: number) => grid.readSurface({ minX: 0, maxX: this.size - 1, minY: y, maxY: y, minZ: 0, maxZ: this.size - 1 })
    const ground = layer(this.groundLayer), brick = layer(this.obstacleLayer)
    if ([ground, brick].some(s => s.width !== this.size || s.depth !== this.size
      || s.states.length !== this.size ** 2 || s.blockIds.length !== this.size ** 2))
      throw new Error('presentation_terrain_dimensions_invalid')
    if (ground.states.some(s => s === 0) || brick.states.some(s => s === 0)) return null
    const convert = (surface: Surface) => Uint8Array.from(surface.blockIds, (id, index) => {
      if (surface.states[index] === 1) return BlockType.Air
      const visual = this.blocks.get(id >>> 8)
      if (visual === undefined) throw new Error(`presentation_block_unknown:${id >>> 8}`)
      return visual
    })
    const g = convert(ground), b = convert(brick)
    const resourceCells = new Set(chests.filter(c => c.resourceTier > 0)
      .map(c => Math.floor(c.z) * this.size + Math.floor(c.x)))
    for (const index of resourceCells) {
      if (brick.states[index] === 2 && this.chestTypes.has(brick.blockIds[index] >>> 8)) b[index] = BlockType.木箱
    }
    const chestCells = Array.from(brick.blockIds, (id, i) => this.chestTypes.has(id >>> 8) && !resourceCells.has(i)
      ? { X: i % this.size, Y: Math.floor(i / this.size) } : null).filter(c => c !== null)
    const old = this.previous
    if (old && g.every((v, i) => v === old.ground[i]) && b.every((v, i) => v === old.brick[i])
      && JSON.stringify(old.chestCells) === JSON.stringify(chestCells)) return old
    this.previous = { size: this.size, ground: g, brick: b, chestCells, rev: ++this.revision }
    return this.previous
  }
}
