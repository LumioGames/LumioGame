import { el, iconEl, restartAnimation, setText } from './dom'
import { ANIMAL_COLOR, SLOT_COLOR } from './icons'
import { plateTitle, type PodiumModel } from './podium'

/**
 * 领奖台的屏幕名牌层（design §13）：三级台阶上方的「第 N 名 · 名字 · 帽×N」、冠军头顶「本局帽王」、
 * 底部本人名次一句话。3D 领奖台本身由 view 画；这里按台阶左右顺序（2 · 1 · 3）排屏幕名牌。
 */
export class PodiumView {
  private readonly root: HTMLDivElement
  private readonly row: HTMLDivElement
  private readonly local: HTMLDivElement
  private visible = false

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud-podium', parent)
    const title = el('div', 'pd-title', this.root)
    iconEl('crown', 'pd-crown', title)
    el('span', '', title).textContent = '本局帽王'
    this.row = el('div', 'pd-row', this.root)
    this.local = el('div', 'pd-local', this.root)
  }

  show(m: PodiumModel): void {
    this.row.textContent = ''
    for (const p of m.plates) {
      const plate = el('div', 'pd-plate', this.row)
      plate.dataset.step = p.step
      plate.classList.toggle('is-local', p.isLocal)
      plate.classList.toggle('is-winner', p.isWinner)
      el('div', 'pd-rank', plate).textContent = String(p.rank)
      const who = el('div', 'pd-who', plate)
      const dot = el('span', 'lb-dot pd-dot', who)
      dot.style.background = ANIMAL_COLOR[p.animal] ?? '#ccc'
      dot.style.borderColor = SLOT_COLOR[p.slot] ?? '#fff'
      el('span', 'pd-name', who).textContent = plateTitle(p)
      const hats = el('div', 'pd-hats', plate)
      iconEl('hat', 'pd-hat', hats)
      el('span', '', hats).textContent = `×${p.hats}`
      if (p.isLocal) el('div', 'pd-you', plate).textContent = '你'
    }
    this.root.classList.toggle('has-winner', m.plates.some((p) => p.isWinner))
    setText(this.local, m.localLine)
    this.local.classList.toggle('is-top', m.localOnStage)
    this.visible = true
    restartAnimation(this.root, 'is-on')
  }

  isVisible(): boolean {
    return this.visible
  }

  hide(): void {
    if (!this.visible) return
    this.visible = false
    this.root.classList.remove('is-on')
  }
}
