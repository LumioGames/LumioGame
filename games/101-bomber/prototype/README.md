# 101 · 体素炸弹人「帽王乱斗」网页原型

**抛弃型参考原型**（ADR [0024](../../../.spec/decisions/0024-per-game-directories-and-101-web-prototype.md)）：画面参考 Tripo「Bubble Bay / 泡泡小镇」，玩法按 [`docs/specs/bomber/design.md`](../../../docs/specs/bomber/design.md) 与内核契约 [`stage0-kernel-contract.md`](../../../docs/specs/bomber/stage0-kernel-contract.md) v2。不进 `LumioGame.sln`、不进任何 Release / CI。

## 运行

```bash
pnpm install
pnpm dev          # http://127.0.0.1:5173
pnpm test         # 规则替身 / Bot / 表现层纯逻辑 / 接缝守卫 / 整局联调
pnpm build        # 类型检查 + 生产构建到 dist/
```

URL 参数（可选）：`?seed=123` 固定种子 · `?match=120` 局时秒数（默认 360）· `?bots=7` Bot 数 0–7。

操作：WASD / 方向键移动（四向），空格放炸弹，V 切跟随 / 俯瞰，Esc 暂停，M 静音；触屏设备显示左下摇杆与右下放弹按钮。

## 内容范围

- **Stage 0 + 1 规则**：19×19（含外圈铁皮）、你 + 7 个 Bot（动物玩偶）、四向移动与转角修正、离格穿透、125 ms 放弹缓冲；引信 2.1 s、危险窗 0.4 s、火力 2、连锁同 Tick 结算（同弹同人一次、同链同人 ≤ 3 心）；三心（半心点）、死亡晚一帧、3 s 重生 + 3 s 保护（放弹即解除）；三种糖果 + 血包；帽王光柱 + 边缘箭头 + Top-10；6 分钟局 → 领奖台 + 结算共 16 s → 自动下一局。
- **Stage 2 材质（用户要求提前放入）**：木箱（必掉糖果）、水方格（减速 30%、放弹即熄灭、火焰覆盖首格后停、每秒 −0.5 心溺水）。
- **最后一命决赛圈（ADR [0025](../../../.spec/decisions/0025-bomber-final-circle-and-death-drops.md)，design §4.2）**：积木剩 < 20% 或只剩 90 秒时触发，固定 90 秒；不能复活、圈外每秒 −0.5 心、安全圈 13×13 → 9×9 → 7×7、每段落一个强力宝箱（3 次命中开启）；存活 ≤ 1 人提前结束；仍按帽子数定胜负。
- **软砖再生（ADR [0026](../../../.spec/decisions/0026-bomber-small-map-regen-and-resource-trigger-gate.md)，design §5）**：常规阶段每 8 秒在无人区域补回镜像积木，距时间触发 60 秒时停止；资源触发只在再生停止后生效。
- **帽子 = 强化数（ADR [0028](../../../.spec/decisions/0028-bomber-hats-are-powerup-count.md)，design §9）**：没有独立的帽子资源，头顶几顶帽子就是身上几个强化（火力 / 炸弹 / 速度高出初始值的级数）；吃强化 +1 顶，死亡掉一半强化帽塔同步变矮，决赛圈出局强化全掉；地上不再有帽堆、击杀不单独铸帽。
- **死者掉落保护（ADR [0029](../../../.spec/decisions/0029-bomber-death-drops-blast-protection.md)）**：死者掉出的强化落地后 3 秒内炸不掉，外罩淡金色泡泡。
- **死亡掉强化（ADR 0025，design §8.5）**：已吃的火力+ / 炸弹+ / 速度+ 每级 50% 掉在死亡点周围，谁捡归谁。
- **领奖台（design §13）**：结算前 10 秒 3D 领奖台，前三名戴着帽子塔上台庆祝，之后 6 秒结算表并自动下一局。
- **不做**：装备三槽、狂暴糖、分区补给箱与中央大补给（决赛圈强力宝箱除外）、分区、木头 / 鞭炮 / 冰面、中途加入补偿、联网。

`?match=150` 可以在 2.5 分钟内看完一整局（前 60 秒常规 + 90 秒决赛圈 + 领奖台 + 结算）；局时 ≤ 90 秒时整局都是决赛圈。

## 结构与接缝

```
src/contract/   规则面：字段逐字照抄 C# 契约（组件、事件、配表、技能输入、快照、GameSource）
src/shared/     纯格子数学
src/present/    表现时钟（快照缓冲、插值、事件按渲染 Tick 派发、定帧）与本机设置
src/view/       Three.js 程序化画面          ┐
src/hud/        DOM HUD                     │ 只依赖 contract / shared / present
src/input/      键盘 + 触屏                  │ ——接引擎时保留
src/audio/      WebAudio 合成音效            ┘
src/bots/       Bot：只读快照、只发技能输入（像真实 Bot 客户端）
src/sim/        TS 规则替身 ← 接引擎时整体删除
src/app/        组装；local-host.ts 是唯一允许 import sim/ 的文件 ← 接引擎时换成 Replica 适配器
```

`tests/architecture.test.ts` 机械守住上面的依赖方向。接入引擎（ADR-067：规则跑 C# .NET WASM Replica）时：实现一个新的 `GameSource`（把 Replica 的组件 / 事件搬进 `src/contract` 的形状），替换 `app/local-host.ts`，删除 `src/sim/`；表现层不改。

## 原型扩展（NON-CONTRACT，待议是否提给契约）

- `BomberPlayerState.HatCount` 改为派生值（强化数），契约的 `BomberHatPile` / `HatPile*` 事件在原型里不再使用（ADR 0028）。
- `BomberPickupItem.Kind = 3` 血包（契约只到 0–2）；`PlayerDied.Cause = 3` 毒圈（契约只到 2）。
- 决赛圈与领奖台：`MatchMeta.finalCircle` / `resourceInitial` / `resourceRemaining`、`PlayerView.eliminated`、`PickupView.droppedBy` / `protectedUntilTick`、`WorldSnapshot.Chests`，事件 `FinalCircleStarted`、`RingShrinkAnnounced`、`RingShrunk`、`PlayerEliminated`、`ChestSpawned` / `ChestHit` / `ChestOpened`、`PowerupsDropped`（`HatMinted` 已停用）；`ProtoRules` 的决赛圈 / 宝箱 / 掉落 / 领奖台参数。
- 表现事件：`BrickDestroyed`、`PickupSpawned`、`PickupDestroyed`、`BombExtinguished`、`ChainResolved`、`MatchStarted`；契约事件上的 `proto` 扩展字段。表现层把它们当提示，快照 diff 才是依据。
- `PlayerMeta`（名字 / 动物 / 槽位）、`MatchMeta.phaseEndTick`、`EntityView.teleportTick`。
- `ProtoRules`：契约 §5 未收录但 design.md 给了数值（或原型自定）的规则参数，逐项注明出处，见 `src/contract/config.ts`。
- 以上扩展是否进契约，等原型验证后走契约修订另议（ADR 0025「后果」）。

## 规则替身对「契约未规定处」的取舍（C# 落地时逐条核对）

- ms → Tick 向上取整（125 ms @20 Hz = 3 Tick）。
- 移动按契约四向 + 停（design §6.1 写的是自由八向，契约胜）。
- 软砖 / 木箱格被摧毁但不计入 `Reach*`；水格计入并停止；火焰越过被连锁引爆的炸弹继续传播。
- 炸弹在引爆时回到手上；炸弹+ 上限按「手上 + 场上未爆」计。
- 死亡事件在结算 Tick 发出（同时掷出要掉的强化），掉落与重生计时在下一 Tick。
- 帽王 = HatCount 最高且 ≥ 1，并列保留现任；光柱阈值 N = 3 只是表现阈值。
- 拾取竞争：离格心最近者得，再按 id；糖果池权重 30 / 30 / 25 / 15（推断）。

美术：本原型不构成美术定调（仍在 ADR 0007 比稿中）；遵守世界观 ADR 0008，配色借比稿方向 B 色板。
