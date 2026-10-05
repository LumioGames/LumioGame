import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SkillChipModel, SkillHudModel } from '../../present/skill-hud'
import { SkillBar } from '../skill-bar'

class FakeElement {
  readonly children: FakeElement[] = []
  readonly dataset: Record<string, string> = {}
  readonly attributes = new Map<string, string>()
  readonly listeners = new Map<string, (event: { stopPropagation(): void; stopImmediatePropagation(): void; key?: string }) => void>()
  readonly classes = new Set<string>()
  readonly classList = { toggle: (name: string, on: boolean) => on ? this.classes.add(name) : this.classes.delete(name) }
  readonly styles = new Map<string, string>()
  readonly style = {
    getPropertyValue: (name: string) => this.styles.get(name) ?? '',
    setProperty: (name: string, value: string) => { this.styles.set(name, value) },
    removeProperty: (name: string) => { this.styles.delete(name) },
  }
  parent: FakeElement | null = null
  className = ''
  innerHTML = ''
  textContent = ''
  title = ''
  type = ''
  disabled = false
  tabIndex = 0
  focused = false

  constructor(readonly tagName: string) {}
  appendChild(child: FakeElement): FakeElement { this.append(child); return child }
  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.remove()
      child.parent = this
      this.children.push(child)
    }
  }
  remove(): void {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1)
    this.parent = null
  }
  blur(): void { this.focused = false }
  focus(): void { this.focused = true }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value) }
  addEventListener(name: string, listener: (event: { stopPropagation(): void; stopImmediatePropagation(): void; key?: string }) => void): void {
    this.listeners.set(name, listener)
  }
  descendants(tag: string): FakeElement[] {
    return this.children.flatMap((child) => [...(child.tagName === tag ? [child] : []), ...child.descendants(tag)])
  }
}

const chip = (slot: 'bomb' | 'active' | 'passive', skill: SkillChipModel['skill']): SkillChipModel => ({
  slot, skill, name: skill ?? '', level: 1, maxLevel: 1, bound: true, combo: false, favorite: false,
  cdFrac: 0, cdSec: 0, ready: true, effectFrac: 0, key: '', desc: '',
})
const model = (character: SkillChipModel): SkillHudModel => ({
  character: null, chips: [chip('bomb', null), character], frozen: false,
  regen: { visible: false, frac: 0, secLeft: 0 }, bubbled: false, alive: true,
  status: { poisoned: false, shocked: false, toxinSec: 0, shockSec: 0 },
})

afterEach(() => vi.unstubAllGlobals())

describe('SkillBar cast control', () => {
  it('keeps two containers through active, passive and absent transitions', () => {
    vi.stubGlobal('document', { createElement: (tag: string) => new FakeElement(tag) })
    let casts = 0
    const host = new FakeElement('div')
    const bar = new SkillBar(host as unknown as HTMLElement, () => { casts++ })
    const root = bar.root as unknown as FakeElement
    const active = model(chip('active', 'blink'))
    bar.update(active)
    expect(root.children).toHaveLength(2)
    expect(root.descendants('button')).toHaveLength(1)
    const button = root.descendants('button')[0]
    expect(button.disabled).toBe(false)
    button.focus()
    expect(button.focused).toBe(true)
    button.listeners.get('click')?.({ stopPropagation() {}, stopImmediatePropagation() {} })
    expect(casts).toBe(1)
    expect(button.focused).toBe(false)
    button.focus()
    let stopped = false
    button.listeners.get('keydown')?.({ key: ' ', stopPropagation() {}, stopImmediatePropagation() { stopped = true } })
    expect(stopped).toBe(true)
    button.listeners.get('click')?.({ stopPropagation() {}, stopImmediatePropagation() {} })
    expect(casts).toBe(2)
    expect(button.focused).toBe(false)

    bar.update(model(chip('passive', 'regen')))
    expect(root.children).toHaveLength(2)
    expect(root.children[1].dataset.slot).toBe('passive')
    expect(root.descendants('button')).toHaveLength(0)
    bar.update(model(chip('active', null)))
    expect(root.descendants('button')).toHaveLength(0)
    bar.update(active)
    expect(root.descendants('button')).toHaveLength(1)
    bar.update(model({ ...chip('active', 'blink'), ready: false }))
    expect(root.descendants('button')[0].disabled).toBe(true)
  })

  it('does not create a cast control without a callback', () => {
    vi.stubGlobal('document', { createElement: (tag: string) => new FakeElement(tag) })
    const bar = new SkillBar(new FakeElement('div') as unknown as HTMLElement)
    bar.update(model(chip('active', 'blink')))
    expect((bar.root as unknown as FakeElement).descendants('button')).toHaveLength(0)
  })
})
