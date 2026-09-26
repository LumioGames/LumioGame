import type { U64 } from '../contract'
import { el, iconEl, setStyle, setText } from './dom'
import { ANIMAL_COLOR, SLOT_COLOR } from './icons'
import { visibleRows, type RankRow } from './ranking'

interface RowEls {
  root: HTMLDivElement
  rank: HTMLSpanElement
  dot: HTMLSpanElement
  name: HTMLSpanElement
  hats: HTMLSpanElement
}

/**
 * 右侧 Top-10（触屏 Top-5 + 本人，design §9.3）。每位玩家一行、按 id 复用；
 * 行用 translateY 定位，换名次时 CSS transition 自动做重排动画。
 */
export class LeaderboardView {
  readonly root: HTMLDivElement
  private readonly list: HTMLDivElement
  private readonly rows = new Map<U64, RowEls>()
  private readonly title: HTMLSpanElement
  private sig = ''

  constructor(parent: HTMLElement, private readonly limit: () => number) {
    this.root = el('div', 'hud-board', parent)
    const head = el('div', 'lb-head', this.root)
    iconEl('hat', 'lb-head-ico', head)
    this.title = el('span', 'lb-title', head)
    this.title.textContent = '帽子榜'
    this.list = el('div', 'lb-list', this.root)
  }

  /** 「帽子榜」（常规）/「决赛圈 · 存活优先」（决赛圈，D2）。 */
  setTitle(text: string): void {
    setText(this.title, text)
  }

  /** @param out 决赛圈已出局的玩家（行变灰）。 */
  update(all: readonly RankRow[], out: ReadonlySet<U64> = new Set()): void {
    const shown = visibleRows(all, this.limit())
    const sig = shown.map((r) => `${r.id}:${r.rank}:${r.hats}:${r.isKing ? 1 : 0}:${out.has(r.id) ? 1 : 0}:${r.name}:${r.animal}:${r.slot}`).join('|')
    if (sig === this.sig) return
    this.sig = sig
    const visible = new Set<U64>()
    shown.forEach((r, i) => {
      visible.add(r.id)
      const els = this.row(r)
      setText(els.rank, String(r.rank))
      setText(els.name, r.name)
      setText(els.hats, String(r.hats))
      // 第 4 轮 Bot 每局重抽角色（名字 / 动物跟着变），色点要跟着刷新。
      setStyle(els.dot, 'background', ANIMAL_COLOR[r.animal] ?? '#ccc')
      setStyle(els.dot, 'border-color', SLOT_COLOR[r.slot] ?? '#fff')
      els.root.classList.toggle('is-king', r.isKing)
      els.root.classList.toggle('is-local', r.isLocal)
      els.root.classList.toggle('is-out', out.has(r.id))
      els.root.classList.toggle('is-gap', r.isLocal && i > 0 && shown[i - 1].rank + 1 < r.rank && i === shown.length - 1)
      els.root.classList.remove('is-hidden')
      setStyle(els.root, '--i', String(i))
    })
    for (const [id, els] of this.rows) if (!visible.has(id)) els.root.classList.add('is-hidden')
    setStyle(this.list, '--rows', String(shown.length))
  }

  private row(r: RankRow): RowEls {
    let els = this.rows.get(r.id)
    if (els) return els
    const root = el('div', 'lb-row is-hidden', this.list)
    const rank = el('span', 'lb-rank', root)
    const dot = el('span', 'lb-dot', root)
    dot.style.background = ANIMAL_COLOR[r.animal] ?? '#ccc'
    dot.style.borderColor = SLOT_COLOR[r.slot] ?? '#fff'
    iconEl('crown', 'lb-crown', root)
    const name = el('span', 'lb-name', root)
    el('span', 'lb-you', root).textContent = '你'
    const hatWrap = el('span', 'lb-hats', root)
    iconEl('hat', 'lb-hat-ico', hatWrap)
    const hats = el('span', 'lb-hat-n', hatWrap)
    els = { root, rank, dot, name, hats }
    this.rows.set(r.id, els)
    return els
  }

  clear(): void {
    this.rows.clear()
    this.list.textContent = ''
    this.sig = ''
  }
}
