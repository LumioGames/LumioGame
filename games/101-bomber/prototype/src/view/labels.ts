import { Vector3, type PerspectiveCamera } from 'three'
import { stackBadge } from './logic/hat-layout'

/**
 * 世界锚定的 DOM 标签层（opts.labelRoot）：玩家名牌（帽塔超过 4 顶时贴着塔顶的「×N」牌 + 名字 + 心条）、
 * 本机「你」胶囊、强化帽落到头顶时的「+1」飘字、宝箱 / 金箱命中点、中央补给光柱名牌。元素只在实体出现时创建，逐帧只写 transform 与变化了的文本。
 * 心条（ADR 0039，design §12）：格数 = 本人心数上限（3–8），金心那几格为金色；Boss（上限 ≥ 6 心）常驻、放大，其余受击后 3 s。
 */

const HAT_SVG =
  '<svg viewBox="0 0 24 20" aria-hidden="true"><rect x="1" y="15" width="22" height="4" rx="2" fill="#2B2320"/><rect x="5" y="2" width="14" height="14" rx="2.5" fill="#2B2320"/><rect x="5" y="10" width="14" height="3.5" fill="#FFC93C"/></svg>'

/** 原型扩展（NON-CONTRACT，ADR 0030）：进化飘字的星芒、回春飘字的爱心。 */
const SPARK_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5l2.6 7.2 7.4 2.3-7.4 2.6L12 22.5l-2.6-8.9L2 11l7.4-2.3z" fill="#FFD84D" stroke="#2B2320" stroke-width="1.4" stroke-linejoin="round"/></svg>'
const HEART_SVG =
  '<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 20.5S3 14.9 1.8 9.2C1 5.3 3.6 2 7 2c2.1 0 3.8 1.2 5 3 1.2-1.8 2.9-3 5-3 3.4 0 6 3.3 5.2 7.2C21 14.9 12 20.5 12 20.5z" fill="#FF5A6E" stroke="#2B2320" stroke-width="1.6" stroke-linejoin="round"/></svg>'

/** 原型扩展（NON-CONTRACT，ADR 0033）：中毒飘字的毒泡、麻痹飘字的闪电。 */
const TOXIN_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="14" r="7" fill="#7ED957" stroke="#2B2320" stroke-width="1.6"/><circle cx="18" cy="6" r="3.2" fill="#B8F07A" stroke="#2B2320" stroke-width="1.4"/><circle cx="7.6" cy="11.6" r="1.8" fill="#fff" opacity=".8"/></svg>'
const SHOCK_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.2 1.8 4.6 13.9h6.3L9.4 22.2l10-12.6h-6.4z" fill="#FFE23C" stroke="#2B2320" stroke-width="1.5" stroke-linejoin="round"/></svg>'

/**
 * 飘字种类：吃强化落帽「+1」/ 进化「进化！」/ 回春「+1 心」/ 中毒弹「中毒」/ 麻痹弹「麻痹」/
 * 命中「−1♥」（ADR 0043：自己的炸弹伤到人，红色，数字在前、心在后）。
 */
export type FloatKind = 'hat' | 'evolve' | 'heal' | 'toxin' | 'shock' | 'hurt'

const FLOAT_ICON: Readonly<Record<FloatKind, string>> = { hat: HAT_SVG, evolve: SPARK_SVG, heal: HEART_SVG, toxin: TOXIN_SVG, shock: SHOCK_SVG, hurt: HEART_SVG }

/** 中央补给名牌的礼盒图标（ADR 0040，与帽王皇冠区分）。 */
const GIFT_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="9" width="17" height="4" rx="1" fill="#5EE0C8" stroke="#2B2320" stroke-width="1.3"/><rect x="5" y="13" width="14" height="8" rx="1.2" fill="#5EE0C8" stroke="#2B2320" stroke-width="1.3"/><rect x="10.8" y="9" width="2.4" height="12" fill="#FFF8EC"/><path d="M12 9c-1.5-3.4-5.6-4.4-5.6-1.8C6.4 8.6 9 9 12 9zm0 0c1.5-3.4 5.6-4.4 5.6-1.8 0 1.4-2.6 1.8-5.6 1.8z" fill="#FFF8EC" stroke="#2B2320" stroke-width="1.1"/></svg>'

export interface PlayerTagState {
  name: string
  isLocal: boolean
  /** 画面上的帽数：> 4 时塔顶显示「×N」牌；0 = 隐藏（领奖台由 HUD 名次牌显示帽数）。 */
  stack: number
  king: boolean
  /** 心条亮着的整心数（向上取整）；< 0 = 隐藏心条。 */
  pips: number
  /** 心条格数 = 心数上限（缺省 3）。 */
  pipMax?: number
  /** 其中最上面几格是金心（缺省 0）。 */
  pipGold?: number
  /** Boss（上限 ≥ 6 心）：心条常驻、放大。 */
  boss?: boolean
  visible: boolean
}

/** 心条最多几格（ADR 0039：封顶 8 心）。 */
const PIP_CAP = 8

class PlayerTag {
  readonly el: HTMLDivElement
  private readonly nameEl: HTMLSpanElement
  private readonly stackEl: HTMLSpanElement
  private readonly pipsEl: HTMLSpanElement
  private readonly pipEls: HTMLElement[] = []
  private last = { name: '', stack: -1, stackTier: -1, king: false, pips: -2, pipMax: -1, pipGold: -1, boss: false, visible: true, x: NaN, y: NaN }

  constructor(root: HTMLElement, isLocal: boolean) {
    this.el = document.createElement('div')
    this.el.className = isLocal ? 'bv-tag bv-local' : 'bv-tag'
    this.nameEl = document.createElement('span')
    this.nameEl.className = isLocal ? 'bv-you' : 'bv-name'
    this.stackEl = document.createElement('span')
    this.stackEl.className = 'bv-stack'
    this.stackEl.style.display = 'none'
    this.pipsEl = document.createElement('span')
    this.pipsEl.className = 'bv-pips'
    for (let i = 0; i < PIP_CAP; i++) {
      const p = document.createElement('i')
      this.pipEls.push(p)
      this.pipsEl.appendChild(p)
    }
    const row = document.createElement('span')
    row.className = 'bv-row'
    row.append(this.nameEl)
    // 从下往上：×N 牌（贴着塔顶 / 皇冠）→ 名字 → 血条点。
    this.el.append(this.pipsEl, row, this.stackEl)
    root.appendChild(this.el)
  }

  update(s: PlayerTagState, x: number, y: number): void {
    const l = this.last
    if (s.visible !== l.visible) {
      this.el.style.display = s.visible ? '' : 'none'
      l.visible = s.visible
    }
    if (!s.visible) return
    if (s.name !== l.name) {
      this.nameEl.textContent = s.name
      l.name = s.name
    }
    if (s.stack !== l.stack) this.updateStack(s.stack)
    if (s.king !== l.king) {
      this.el.classList.toggle('bv-king', s.king)
      l.king = s.king
    }
    const pipMax = Math.max(1, Math.min(PIP_CAP, s.pipMax ?? 3))
    const pipGold = Math.max(0, Math.min(pipMax, s.pipGold ?? 0))
    const boss = s.boss === true
    if (s.pips !== l.pips || pipMax !== l.pipMax || pipGold !== l.pipGold) {
      this.pipsEl.style.display = s.pips < 0 ? 'none' : ''
      for (let i = 0; i < PIP_CAP; i++) {
        const el = this.pipEls[i]
        if (i >= pipMax) {
          el.style.display = 'none'
          continue
        }
        el.style.display = ''
        const gold = i >= pipMax - pipGold
        el.className = `${i < s.pips ? 'on' : ''}${gold ? ' gold' : ''}`.trim()
      }
      l.pips = s.pips
      l.pipMax = pipMax
      l.pipGold = pipGold
    }
    if (boss !== l.boss) {
      this.el.classList.toggle('bv-boss', boss)
      l.boss = boss
    }
    const rx = Math.round(x * 2) / 2
    const ry = Math.round(y * 2) / 2
    if (rx !== l.x || ry !== l.y) {
      this.el.style.transform = `translate3d(${rx}px, ${ry}px, 0)`
      l.x = rx
      l.y = ry
    }
  }

  /** ×N 牌：> 4 顶显示（分三档），变大「弹」、变小「缩」一下；回到 4 顶及以下直接隐藏。 */
  private updateStack(stack: number): void {
    const l = this.last
    const b = stackBadge(stack)
    const el = this.stackEl
    if (b.tier === 0) {
      el.style.display = 'none'
    } else {
      el.textContent = b.text
      if (b.tier !== l.stackTier) el.className = `bv-stack bv-stack-t${b.tier}`
      // 数字变化（含 4 → 5 出现）重放动画，第一次见到不演（照宝箱命中点：移除类名 → 触发重排 → 加回）。
      if (l.stack >= 0 && stack !== l.stack) {
        const cls = stack > l.stack ? 'bv-stack-pop' : 'bv-stack-drop'
        el.classList.remove('bv-stack-pop', 'bv-stack-drop')
        void el.offsetWidth
        el.classList.add(cls)
      }
      el.style.display = ''
    }
    l.stack = stack
    l.stackTier = b.tier
  }

  remove(): void {
    this.el.remove()
  }
}

/** 强力宝箱头顶的命中点（●●○：实心 = 还要挨几下）。 */
class ChestBadge {
  readonly el: HTMLDivElement
  private readonly pips: HTMLElement[] = []
  private last = { left: -1, req: -1, x: NaN, y: NaN, visible: true }

  constructor(root: HTMLElement) {
    this.el = document.createElement('div')
    this.el.className = 'bv-chest'
    root.appendChild(this.el)
  }

  update(left: number, req: number, x: number, y: number, visible: boolean): void {
    const l = this.last
    if (visible !== l.visible) {
      this.el.style.display = visible ? '' : 'none'
      l.visible = visible
    }
    if (!visible) return
    if (req !== l.req) {
      this.el.textContent = ''
      this.pips.length = 0
      for (let i = 0; i < req; i++) {
        const p = document.createElement('i')
        this.pips.push(p)
        this.el.appendChild(p)
      }
      l.req = req
      l.left = -1
    }
    if (left !== l.left) {
      for (let i = 0; i < this.pips.length; i++) this.pips[i].className = i < left ? 'on' : ''
      if (l.left > left) {
        // 挨打时点子弹一下（重放 CSS 动画）。
        this.el.classList.remove('bv-chest-hit')
        void this.el.offsetWidth
        this.el.classList.add('bv-chest-hit')
      }
      l.left = left
    }
    const rx = Math.round(x * 2) / 2
    const ry = Math.round(y * 2) / 2
    if (rx !== l.x || ry !== l.y) {
      this.el.style.transform = `translate3d(${rx}px, ${ry}px, 0)`
      l.x = rx
      l.y = ry
    }
  }

  remove(): void {
    this.el.remove()
  }
}

/** 世界锚定的飘字（吃强化时帽塔上的「+1」、进化、回春）：progress 0 → 1 上浮淡出；图标按种类。 */
class FloatLabel {
  readonly el: HTMLDivElement
  private last = { text: '', o: -1, x: NaN, y: NaN }

  constructor(
    root: HTMLElement,
    private readonly kind: FloatKind,
  ) {
    this.el = document.createElement('div')
    this.el.className = `bv-float bv-float-${kind}`
    root.appendChild(this.el)
  }

  update(text: string, x: number, y: number, progress: number, visible: boolean): void {
    const l = this.last
    if (text !== l.text) {
      // 命中「−1♥」数字在前、心在后；其余图标在前。
      if (this.kind === 'hurt') {
        this.el.innerHTML = `<span></span>${FLOAT_ICON[this.kind]}`
        ;(this.el.firstChild as HTMLElement).textContent = text
      } else {
        this.el.innerHTML = `${FLOAT_ICON[this.kind]}<span></span>`
        ;(this.el.lastChild as HTMLElement).textContent = text
      }
      l.text = text
    }
    const p = Math.max(0, Math.min(1, progress))
    const o = visible ? Math.round((p < 0.15 ? p / 0.15 : p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1) * 20) / 20 : 0
    if (o !== l.o) {
      this.el.style.opacity = `${o}`
      l.o = o
    }
    const pop = p < 0.15 ? 0.6 + 0.4 * (p / 0.15) * 1.25 : 1
    const rx = Math.round(x * 2) / 2
    const ry = Math.round((y - p * 36) * 2) / 2
    if (rx !== l.x || ry !== l.y) {
      this.el.style.transform = `translate3d(${rx}px, ${ry}px, 0) scale(${Math.min(1.1, pop).toFixed(2)})`
      l.x = rx
      l.y = ry
    }
  }

  remove(): void {
    this.el.remove()
  }
}

/** 中央补给光柱顶上的名牌（ADR 0040）：礼盒图标 +「补给 8」倒计时 / 「补给！」。 */
class BeaconBadge {
  readonly el: HTMLDivElement
  private readonly text: HTMLSpanElement
  private last = { text: '', x: NaN, y: NaN, visible: true }

  constructor(root: HTMLElement) {
    this.el = document.createElement('div')
    this.el.className = 'bv-beacon'
    this.el.innerHTML = GIFT_SVG
    this.text = document.createElement('span')
    this.el.appendChild(this.text)
    root.appendChild(this.el)
  }

  update(text: string, x: number, y: number, visible: boolean): void {
    const l = this.last
    if (visible !== l.visible) {
      this.el.style.display = visible ? '' : 'none'
      l.visible = visible
    }
    if (!visible) return
    if (text !== l.text) {
      this.text.textContent = text
      l.text = text
    }
    const rx = Math.round(x * 2) / 2
    const ry = Math.round(y * 2) / 2
    if (rx !== l.x || ry !== l.y) {
      this.el.style.transform = `translate3d(${rx}px, ${ry}px, 0)`
      l.x = rx
      l.y = ry
    }
  }

  remove(): void {
    this.el.remove()
  }
}

export class LabelLayer {
  private readonly tags = new Map<number, PlayerTag>()
  private readonly chests = new Map<number, ChestBadge>()
  private beacon: BeaconBadge | null = null
  private beaconStamp = -1
  private readonly floats = new Map<number, FloatLabel>()
  private readonly chestStamp = new Map<number, number>()
  private readonly floatStamp = new Map<number, number>()
  private readonly v = new Vector3()
  private stamp = 0
  private readonly tagStamp = new Map<number, number>()
  width = 1
  height = 1

  constructor(
    private readonly root: HTMLElement,
    private readonly camera: PerspectiveCamera,
  ) {}

  /** 每帧开始调用；本帧没被 set 的标签在 end() 里隐藏 / 回收。 */
  begin(width: number, height: number): void {
    this.width = width
    this.height = height
    this.stamp++
  }

  /** 世界点投影到容器像素；背后或出屏返回 false。 */
  private toScreen(x: number, y: number, z: number): boolean {
    const v = this.v.set(x, y, z).applyMatrix4(this.camera.matrixWorldInverse)
    if (v.z > -0.1) return false
    v.applyMatrix4(this.camera.projectionMatrix)
    const sx = (v.x * 0.5 + 0.5) * this.width
    const sy = (-v.y * 0.5 + 0.5) * this.height
    this.v.set(sx, sy, 0)
    return sx > -80 && sx < this.width + 80 && sy > -80 && sy < this.height + 80
  }

  setPlayer(id: number, s: PlayerTagState, wx: number, wy: number, wz: number): void {
    let t = this.tags.get(id)
    if (!t) {
      t = new PlayerTag(this.root, s.isLocal)
      this.tags.set(id, t)
    }
    this.tagStamp.set(id, this.stamp)
    const on = s.visible && this.toScreen(wx, wy, wz)
    s.visible = on
    t.update(s, this.v.x, this.v.y)
  }

  setChest(id: number, left: number, req: number, wx: number, wy: number, wz: number, visible: boolean): void {
    let c = this.chests.get(id)
    if (!c) {
      c = new ChestBadge(this.root)
      this.chests.set(id, c)
    }
    this.chestStamp.set(id, this.stamp)
    const on = visible && this.toScreen(wx, wy, wz)
    c.update(left, req, this.v.x, this.v.y, on)
  }

  /** 中央补给光柱名牌（全场只有一个）；本帧不调用即隐藏。 */
  setBeacon(text: string, wx: number, wy: number, wz: number): void {
    this.beacon ??= new BeaconBadge(this.root)
    this.beaconStamp = this.stamp
    const on = this.toScreen(wx, wy, wz)
    this.beacon.update(text, this.v.x, this.v.y, on)
  }

  /** key 由调用方分配（每条飘字唯一）；kind 决定配色（'hat' 金色）。 */
  setFloat(key: number, kind: FloatKind, text: string, wx: number, wy: number, wz: number, progress: number): void {
    let f = this.floats.get(key)
    if (!f) {
      f = new FloatLabel(this.root, kind)
      this.floats.set(key, f)
    }
    this.floatStamp.set(key, this.stamp)
    const on = this.toScreen(wx, wy, wz)
    f.update(text, this.v.x, this.v.y, progress, on)
  }

  end(): void {
    if (this.beacon && this.beaconStamp !== this.stamp) this.beacon.update('', 0, 0, false)
    for (const [id, c] of this.chests) {
      if (this.chestStamp.get(id) !== this.stamp) {
        c.remove()
        this.chests.delete(id)
        this.chestStamp.delete(id)
      }
    }
    for (const [id, f] of this.floats) {
      if (this.floatStamp.get(id) !== this.stamp) {
        f.remove()
        this.floats.delete(id)
        this.floatStamp.delete(id)
      }
    }
    for (const [id, t] of this.tags) {
      if (this.tagStamp.get(id) !== this.stamp) {
        t.remove()
        this.tags.delete(id)
        this.tagStamp.delete(id)
      }
    }
  }

  dispose(): void {
    for (const t of this.tags.values()) t.remove()
    for (const c of this.chests.values()) c.remove()
    for (const f of this.floats.values()) f.remove()
    this.beacon?.remove()
    this.beacon = null
    this.tags.clear()
    this.chests.clear()
    this.floats.clear()
  }
}
