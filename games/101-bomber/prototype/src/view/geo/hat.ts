import { ConeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from 'three'
import { INK, SUNSHINE } from '../palette'
import { GeoBuilder, mat } from './merge'

/** 玩具小礼帽：墨色帽身 + 金色帽带（在奶油地面上对比最强）。原点在帽檐底。 */
export function hatGeometry(): BufferGeometry {
  const b = new GeoBuilder()
  b.add(new CylinderGeometry(0.2, 0.2, 0.03, 24), INK, mat(0, 0.015, 0))
  b.add(new TorusGeometry(0.19, 0.016, 6, 24), 0x3a302b, mat(0, 0.03, 0, Math.PI / 2, 0, 0))
  b.add(new CylinderGeometry(0.135, 0.14, 0.13, 20), (_nx, ny) => (ny > 0.7 ? 0x3d3330 : INK), mat(0, 0.03 + 0.065, 0))
  b.add(new CylinderGeometry(0.143, 0.143, 0.035, 20), SUNSHINE, mat(0, 0.055, 0))
  return b.build()
}

/** 帽王皇冠（金色金属，原点在底）。 */
export function crownGeometry(): BufferGeometry {
  const b = new GeoBuilder()
  b.add(new CylinderGeometry(0.17, 0.16, 0.08, 20, 1, true), SUNSHINE, mat(0, 0.04, 0))
  b.add(new TorusGeometry(0.165, 0.02, 6, 20), 0xffb020, mat(0, 0.005, 0, Math.PI / 2, 0, 0))
  const spikes = 5
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2
    const x = Math.sin(a) * 0.165
    const z = Math.cos(a) * 0.165
    b.add(new ConeGeometry(0.045, 0.12, 8), SUNSHINE, mat(x, 0.14, z))
    b.add(new SphereGeometry(0.025, 8, 6), i % 2 === 0 ? 0xff5a6e : 0x3db8da, mat(x, 0.21, z))
  }
  return b.build()
}

/** 压缩帽塔段（条纹贴图沿 V 重复），原点在底、单位高度，按段高缩放 Y。 */
export function hatSegmentGeometry(): BufferGeometry {
  const g = new CylinderGeometry(0.15, 0.15, 1, 20, 1, false)
  g.translate(0, 0.5, 0)
  return g
}
