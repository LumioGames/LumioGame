import { el, iconEl, restartAnimation, setText } from './dom'
import { ANIMAL_COLOR, SLOT_COLOR } from './icons'
import { plateTitle, type PodiumModel } from './podium'

/**
 * 领奖台的屏幕名牌层（design §13，ADR 0031）：三级台阶上方的「第 N 名 · 名字 · 帽×N」、顶部「本局冠军」
 * 与结束原因（唯一存活 / 时间到 · 活到最后者赢）、底部本人名次一句话。
 * 3D 领奖台本身由 view 画；这里按台阶左右顺序（2 · 1 · 3）排屏幕名牌。
 */
export class PodiumView {
  private readonly root: HTMLDivElement
  private readonly row: HTMLDivElement
  private readonly local: HTMLDivElement
  private readonly titleText: HTMLSpanElement
  private readonly sub: HTMLDivElement
  private visible = false

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud-podium', parent)
    const title = el('div', 'pd-title', this.root)
    iconEl('crown', 'pd-crown', title)
    this.titleText = el('span', '', title)
    this.titleText.textContent = '本局冠军'
    this.sub = el('div', 'pd-sub', this.root)
    this.row = el('div', 'pd-row', this.root)
    this.local = el('div', 'pd-local', this.root)
  }

  show(m: PodiumModel): void {
    setText(this.titleText, m.headline.title)
    setText(this.sub, m.headline.sub)
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
      if (!p.survived) el('div', 'pd-out', plate).textContent = '出局'
    }
    this.root.classList.toggle('has-winner', m.plates.length > 0)
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
