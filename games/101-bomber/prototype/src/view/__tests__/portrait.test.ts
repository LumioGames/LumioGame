import { describe, expect, it } from 'vitest'
import { renderDollPortraits, type PortraitDeps, type PortraitRenderer } from '../portrait'

/** 离屏头像的退化路径：任何一步失败都返回已有的部分，渲染器一定被释放（选角界面退回色块，不阻塞开局）。 */
function fake(failAt = Infinity): { deps: PortraitDeps; state: { renders: number; disposed: number } } {
  const state = { renders: 0, disposed: 0 }
  const r: PortraitRenderer = {
    render: () => {
      if (state.renders + 1 >= failAt) throw new Error('context lost')
      state.renders++
    },
    toDataURL: () => `data:image/png;base64,${state.renders}`,
    dispose: () => {
      state.disposed++
    },
  }
  return { deps: { createRenderer: () => r }, state }
}

describe('doll portraits', () => {
  it('renders one data URL per distinct animal and releases the renderer', () => {
    const f = fake()
    const m = renderDollPortraits(['rabbit', 'duck', 'cat', 'bear', 'cat'], 64, f.deps)
    expect([...m.keys()]).toEqual(['rabbit', 'duck', 'cat', 'bear'])
    expect(new Set(m.values()).size).toBe(4)
    expect(f.state.renders).toBe(4)
    expect(f.state.disposed).toBe(1)
  })
  it('a failure midway returns the portraits already made', () => {
    const f = fake(3)
    const m = renderDollPortraits(['rabbit', 'duck', 'cat', 'bear'], 64, f.deps)
    expect([...m.keys()]).toEqual(['rabbit', 'duck'])
    expect(f.state.disposed).toBe(1)
  })
  it('no WebGL at all → empty map, no throw', () => {
    const deps: PortraitDeps = {
      createRenderer: () => {
        throw new Error('no webgl')
      },
    }
    expect(renderDollPortraits(['cat'], 64, deps).size).toBe(0)
  })
  it('the default renderer degrades to an empty map without a DOM (node)', () => {
    expect(renderDollPortraits(['cat']).size).toBe(0)
  })
})
