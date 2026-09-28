import type { PersonalBest, PersonalBestKey } from '../present/personal-best'
import { el, iconEl, setStyle, setText } from './dom'
import { formatDuration } from './format'
import type { SettlementResults } from './hud-brain'
import { ANIMAL_COLOR, SLOT_COLOR } from './icons'
import { resultsCharacterText, resultsRuleLine, resultsSkillText } from './podium'
import { visibleRows } from './ranking'

/** 「个人最佳 · 连锁 ×7 · 击杀 5 · 最好第 1 名 · 帽王 1 分 05 秒」（design §13，ADR 0043）；一项都没有时为空串。 */
export function personalBestLine(b: PersonalBest): string {
  const parts: string[] = []
  if (b.bestChain >= 2) parts.push(`连锁 ×${b.bestChain}`)
  if (b.mostKills > 0) parts.push(`击杀 ${b.mostKills}`)
  if (b.bestRank !== null) parts.push(`最好第 ${b.bestRank} 名`)
  if (b.longestKingSec > 0) parts.push(`帽王 ${formatDuration(b.longestKingSec)}`)
  return parts.length ? `个人最佳 · ${parts.join(' · ')}` : ''
}

/** 结算表里哪一格对应哪一项个人最佳（名次在大字「第 N 名」上标）。 */
export const RECORD_STAT: Readonly<Record<Exclude<PersonalBestKey, 'bestRank'>, string>> = {
  bestChain: '最佳连锁',
  mostKills: '击杀',
  longestKingSec: '帽王时长',
}

/**
 * 结算页（design §13，ADR 0031）：Top-10（存活者在前，名次 1 戴冠）、本人名次与「击败了 X%」、帽王时长、击杀、
 * 放弹、破坏方块、拾取、技能施放、最佳连锁、最高帽数、角色、本局技能与进化；每行标「★ 存活」或「出局」；标题下是规则行与本局结束原因；
 * 「换角色」按钮（下一局生效，打开时结算倒计时暂停）；底部自动下一局倒计时（match.phaseEndTick）。
 * 领奖台（design §13）之后才出现，倒计时条按结算表自己的时长走。
 * ADR 0043：名次下面先亮本人高光卡（大）与全场其他人的高光（小签），结算表随后淡入；刷新个人最佳的格子标「新纪录！」，
 * 右栏底部一行个人最佳。
 */
export class ResultsView {
  private readonly root: HTMLDivElement
  private readonly rank: HTMLDivElement
  private readonly record: HTMLDivElement
  private readonly beaten: HTMLDivElement
  private readonly hl: HTMLDivElement
  private readonly hlMe: HTMLDivElement
  private readonly hlList: HTMLDivElement
  private readonly body: HTMLDivElement
  private readonly table: HTMLOListElement
  private readonly stats: HTMLDivElement
  private readonly best: HTMLDivElement
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
    this.record = el('div', 'rs-new rs-record', hero)
    this.beaten = el('div', 'rs-beaten', hero)
    // 高光卡（领奖台之后、结算表之前）。
    this.hl = el('div', 'rs-hl', card)
    this.hlMe = el('div', 'rs-hl-me', this.hl)
    this.hlList = el('div', 'rs-hl-list', this.hl)
    const body = el('div', 'rs-body', card)
    this.body = body
    const left = el('div', 'rs-col', body)
    el('div', 'rs-sub', left).textContent = 'Top 10'
    this.table = el('ol', 'rs-table', left)
    const right = el('div', 'rs-col', body)
    el('div', 'rs-sub', right).textContent = '你的本局'
    this.stats = el('div', 'rs-stats', right)
    this.best = el('div', 'rs-best', right)
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
    const records = new Set(r.personalBest?.newRecords ?? [])
    setText(this.record, records.size ? (records.has('bestRank') ? '新纪录！最好名次' : '新纪录！') : '')
    this.record.classList.toggle('is-on', records.size > 0)
    this.showHighlights(r)
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
    const recordLabels = new Set([...records].flatMap((k) => (k === 'bestRank' ? [] : [RECORD_STAT[k]])))
    const stat = (label: string, value: string, wide = false, extra = ''): void => {
      const box = el('div', `${wide ? 'rs-stat is-wide' : 'rs-stat'}${extra ? ` ${extra}` : ''}`, this.stats)
      if (recordLabels.has(label)) {
        box.classList.add('is-record')
        el('div', 'rs-new', box).textContent = '新纪录！'
      }
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
    stat('技能施放', String(s.skillCasts))
    stat('角色', resultsCharacterText(s.character))
    stat('本局技能与进化', resultsSkillText(s.skills), true, 'is-text')
    setText(this.best, r.personalBest ? personalBestLine(r.personalBest.best) : '')
    this.visible = true
    this.root.classList.add('is-on')
    // 高光卡先亮、结算表随后淡入（CSS 动画，prefers-reduced-motion 下直接出现）。
    this.hl.classList.remove('is-in')
    this.body.classList.remove('is-in')
    void this.hl.offsetWidth
    this.hl.classList.add('is-in')
    this.body.classList.add('is-in')
  }

  /** 本人高光卡（大）+ 其余每人一张小签（名字 + 称号），按名次顺序。 */
  private showHighlights(r: SettlementResults): void {
    const rows = new Map(r.rows.map((row) => [row.id, row]))
    this.hlMe.textContent = ''
    this.hlList.textContent = ''
    const mine = r.highlights.find((c) => rows.get(c.id)?.isLocal)
    this.hlMe.classList.toggle('is-on', !!mine)
    if (mine) {
      this.hlMe.dataset.kind = mine.kind
      this.hlMe.classList.toggle('is-leader', mine.leader)
      iconEl('spark', 'rs-hl-ico', this.hlMe)
      const text = el('div', 'rs-hl-text', this.hlMe)
      el('div', 'rs-hl-kicker', text).textContent = '你的本局高光'
      el('div', 'rs-hl-title', text).textContent = mine.title
      el('div', 'rs-hl-detail', text).textContent = mine.leader ? `${mine.detail} · 全场第一` : mine.detail
    }
    for (const c of r.highlights) {
      const row = rows.get(c.id)
      if (!row || row.isLocal) continue
      const chip = el('div', 'rs-hl-chip', this.hlList)
      chip.dataset.kind = c.kind
      chip.title = c.detail
      const dot = el('span', 'lb-dot', chip)
      dot.style.background = ANIMAL_COLOR[row.animal] ?? '#ccc'
      dot.style.borderColor = SLOT_COLOR[row.slot] ?? '#fff'
      el('span', 'rs-hl-name', chip).textContent = row.name
      el('span', 'rs-hl-kind', chip).textContent = c.title
    }
    this.hl.classList.toggle('is-empty', r.highlights.length === 0)
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
