import { el, iconEl, setStyle, setText } from './dom'
import { formatDuration } from './format'
import type { SettlementResults } from './hud-brain'
import { ANIMAL_COLOR, SLOT_COLOR } from './icons'
import { resultsRuleLine } from './podium'
import { visibleRows } from './ranking'

/**
 * 结算页（design §13，ADR 0031）：Top-10（存活者在前，名次 1 戴冠）、本人名次与「击败了 X%」、帽王时长、击杀、
 * 放弹、破坏方块、拾取、技能施放、最佳连锁、最高帽数；每行标「★ 存活」或「出局」；标题下是规则行与本局结束原因；
 * 「换角色」按钮（下一局生效，打开时结算倒计时暂停）；底部自动下一局倒计时（match.phaseEndTick）。
 * 领奖台（design §13）之后才出现，倒计时条按结算表自己的时长走。
 */
export class ResultsView {
  private readonly root: HTMLDivElement
  private readonly rank: HTMLDivElement
  private readonly beaten: HTMLDivElement
  private readonly table: HTMLOListElement
  private readonly stats: HTMLDivElement
  private readonly next: HTMLSpanElement
  private readonly bar: HTMLDivElement
  private readonly rule: HTMLDivElement
  private visible = false

  constructor(
    parent: HTMLElement,
    private readonly settlementSeconds: number,
    onChangeCharacter?: () => void,
  ) {
    this.root = el('div', 'hud-results', parent)
    this.root.dataset.ui = '1'
    const card = el('div', 'rs-card', this.root)
    const head = el('div', 'rs-head', card)
    iconEl('crown', 'rs-ico', head)
    el('div', 'rs-title', head).textContent = '本局结束'
    this.rule = el('div', 'rs-rule', head)
    this.rule.textContent = resultsRuleLine(null)
    const hero = el('div', 'rs-hero', card)
    this.rank = el('div', 'rs-rank', hero)
    this.beaten = el('div', 'rs-beaten', hero)
    const body = el('div', 'rs-body', card)
    const left = el('div', 'rs-col', body)
    el('div', 'rs-sub', left).textContent = 'Top 10'
    this.table = el('ol', 'rs-table', left)
    const right = el('div', 'rs-col', body)
    el('div', 'rs-sub', right).textContent = '你的本局'
    this.stats = el('div', 'rs-stats', right)
    const foot = el('div', 'rs-foot', card)
    this.next = el('span', 'rs-next', foot)
    const track = el('div', 'rs-track', foot)
    this.bar = el('div', 'rs-bar', track)
    if (onChangeCharacter) {
      const btn = el('button', 'md-btn rs-char', foot)
      btn.type = 'button'
      iconEl('swap', '', btn)
      el('span', '', btn).textContent = '换角色'
      btn.title = '下一局生效'
      btn.addEventListener('click', () => {
        btn.blur()
        onChangeCharacter()
      })
    }
  }

  show(r: SettlementResults, tickRateHz: number): void {
    setText(this.rule, resultsRuleLine(r.reason))
    setText(this.rank, `第 ${r.localRank} 名`)
    setText(this.beaten, r.playerCount > 1 ? `击败了 ${r.percentBeaten}% 的玩家` : '单人练习局')
    this.table.textContent = ''
    for (const row of visibleRows(r.rows, 10)) {
      const li = el('li', 'rs-row', this.table)
      li.classList.toggle('is-local', row.isLocal)
      li.classList.toggle('is-king', row.rank === 1)
      el('span', 'rs-r', li).textContent = String(row.rank)
      const dot = el('span', 'lb-dot', li)
      dot.style.background = ANIMAL_COLOR[row.animal] ?? '#ccc'
      dot.style.borderColor = SLOT_COLOR[row.slot] ?? '#fff'
      if (row.rank === 1) iconEl('crown', 'rs-crown', li)
      el('span', 'rs-name', li).textContent = row.isLocal && row.name !== '你' ? `${row.name}（你）` : row.name
      if (row.survived && (r.finalCircle || r.reason !== 'timeUp')) {
        const tag = el('span', 'rs-tag is-alive', li)
        iconEl('star', '', tag)
        el('span', '', tag).textContent = '存活'
      } else if (!row.survived) {
        el('span', 'rs-tag is-out', li).textContent = '出局'
      }
      li.classList.toggle('is-out', !row.survived)
      el('span', 'rs-kills', li).textContent = `击杀 ${r.stats.killsById.get(row.id) ?? 0}`
      const hats = el('span', 'rs-hats', li)
      iconEl('hat', '', hats)
      el('span', '', hats).textContent = String(row.hats)
    }
    const s = r.stats
    this.stats.textContent = ''
    const stat = (label: string, value: string, wide = false): void => {
      const box = el('div', wide ? 'rs-stat is-wide' : 'rs-stat', this.stats)
      el('div', 'rs-v', box).textContent = value
      el('div', 'rs-l', box).textContent = label
    }
    stat('帽王时长', formatDuration(s.hatKingTicks / tickRateHz), true)
    stat('击杀', String(s.kills))
    stat('最高帽数', String(s.maxHats))
    stat('最佳连锁', s.bestChain >= 2 ? `×${s.bestChain}` : String(s.bestChain))
    stat('放弹', String(s.bombsPlaced))
    stat('破坏方块', String(s.bricksDestroyed))
    stat('拾取糖果', String(s.pickups))
    stat('技能', String(s.skillCasts))
    this.visible = true
    this.root.classList.add('is-on')
  }

  update(remainingSeconds: number): void {
    if (!this.visible) return
    const r = Math.max(0, remainingSeconds)
    setText(this.next, `下一局 ${Math.ceil(r)} 秒`)
    setStyle(this.bar, 'transform', `scaleX(${Math.min(1, r / this.settlementSeconds).toFixed(3)})`)
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
