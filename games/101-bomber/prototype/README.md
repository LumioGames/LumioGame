# 101 · 体素炸弹人「帽王乱斗」网页原型

**抛弃型参考原型**（ADR [0024](../../../.spec/decisions/0024-per-game-directories-and-101-web-prototype.md)）：画面参考 Tripo「Bubble Bay / 泡泡小镇」，玩法按 [`docs/specs/bomber/design.md`](../../../docs/specs/bomber/design.md) 与内核契约 [`stage0-kernel-contract.md`](../../../docs/specs/bomber/stage0-kernel-contract.md) v2；第 4 轮起内容范围扩到角色、技能与组合进化（ADR [0030](../../../.spec/decisions/0030-bomber-characters-exclusive-skills-and-combos.md)，仅限原型）。不进 `LumioGame.sln`、不进任何 Release / CI。

## 运行

```bash
pnpm install
pnpm dev          # http://127.0.0.1:5173
pnpm test         # 规则替身 / Bot / 表现层纯逻辑 / 接缝守卫 / 手感路径 / 整局联调（默认不跑整局统计，很快）
pnpm build        # 类型检查 + 生产构建到 dist/
pnpm accept       # BOMBER_ACCEPT=1：验收 E，6 个种子全员 normal Bot 各打一整局（无界面）
pnpm stats        # BOMBER_STATS=1：统计批次——E 20 种子全员 normal、D 脚本玩家对 7 个 normal ×30、easy ×30、hard ×30（约 3.5 分钟）
```

URL 参数（可选）：

- `?seed=123` 固定地图与 Bot 随机种子（默认随机）。
- `?match=175` 局时秒数（默认 420 = 7 分钟封顶）。决赛圈固定 115 秒，`?match=` ≤ 115 时整局都是决赛圈。
- `?bots=7` Bot 数 0–7（默认 7）。
- `?ai=normal` Bot 难度 `easy` / `normal` / `hard`（默认 normal；hard = 第 3 轮强度）。
- `?char=cat` 本机角色 `rabbit` / `duck` / `cat` / `bear`，跳过选角界面（未知值照常显示选角）。
- `?dev=evolve,autopilot,fast` 开发开关，只在 `pnpm dev` 下生效（`pnpm build` 里编译掉）：evolve = 开局在脚下放几颗能直接进化的技能糖；autopilot = 本机由脚本玩家驾驶；fast = 4 倍速。

操作：WASD / 方向键移动（四向；两个方向同按时走得通的那个），空格放炸弹，Shift 主动技能（冷却显示在 HUD 技能栏），V 切跟随 / 俯瞰，Esc 暂停，M 静音；触屏设备显示左下摇杆、右下放弹按钮与技能副按钮（带冷却环，主动槽为空时隐藏）。

开局先单屏选角（默认选中上次的角色，本机记住）；结算页与暂停页都有「换角色」，下一局生效（打开时结算倒计时暂停）。

`?match=175` 约 3 分钟看完一整局（前 60 秒常规 + 115 秒决赛圈 + 领奖台 + 结算）；`pnpm dev` 下再加 `&dev=fast` 更快。

## 内容范围

- **Stage 0 + 1 规则**：19×19（含外圈铁皮）、你 + 7 个 Bot（动物玩偶）、四向移动与转角修正、离格穿透、125 ms 放弹缓冲；引信 2.1 s、危险窗 0.4 s、火力 2、连锁同 Tick 结算（同弹同人一次、同链同人 ≤ 3 心）；三心（半心点）、死亡晚一帧、3 s 重生 + 3 s 保护（放弹、施放火焰光环 / 火焰冲刺即解除）；三种糖果 + 血包；帽王光柱 + 边缘箭头 + Top-10；封顶 7 分钟一局 → 领奖台 + 结算共 16 s → 自动下一局。
- **Stage 2 材质（用户要求提前放入）**：木箱（必掉 1 个：一半技能糖、一半糖果 / 血包）、水方格（减速 30%、放弹即熄灭、火焰覆盖首格后停、每秒 −0.5 心溺水、踢进水的炸弹熄灭）。
- **开局选角 + 专属技能（ADR [0030](../../../.spec/decisions/0030-bomber-characters-exclusive-skills-and-combos.md)，design §8.0）**：棉花兔（被动·回春：10 秒没掉血回 1 心，之后每 10 秒再回，满血为止）、泡泡鸭（主动·泡泡：3 秒完整无敌、期间不能放弹，CD 18 s）、闪电猫（主动·闪现：朝面向最远 3 格、可越过砖块 / 炸弹 / 宝箱，CD 12 s）、火焰熊（主动·火焰光环：脚下 3×3 着火 4 秒，CD 20 s）。基础属性完全相同；Bot 每局重分角色，8 人时每个角色 2 个。
- **技能糖、三槽与组合进化（ADR 0030，design §8.1–§8.4）**：炸弹槽 / 主动槽 / 被动槽，专属技能占自己的槽且绑定。走过技能糖按顺序判定、不按键：能和身上某个技能配成组合 → 立即进化；同技能 → 升 1 级（上限 Lv3）；对应槽空 → 装上；其余捡不起、留在地上（**不做替换确认**，Shift 只管主动技能）。3 条组合：闪现 + 火焰光环 → 火焰冲刺；泡泡 + 踢弹 → 弹射泡泡；冰冻弹 + 穿透弹 → 冰川弹。死亡时拾取的技能每个 50% 掉成技能糖（保留等级；决赛圈出局全掉），专属技能永不掉。技能不算帽子。
- **中毒弹 / 麻痹弹（ADR [0033](../../../.spec/decisions/0033-bomber-toxin-and-shock-bombs-from-chests.md)，design §8.2 / §8.4 / §12）**：炸弹槽两种新形态，直击照常 −1 心。中毒 3 / 4 / 5 秒、每秒 −0.5 心、可致死（记投弹者），泡泡与血包解毒；麻痹 2 / 2.5 / 3 秒、移速降到 30%。技能糖池 = 泡泡 / 闪现 / 火焰光环 / 踢弹 / 冰冻弹 / 穿透弹 / 中毒弹 / 麻痹弹，炸弹类权重各 2、其余各 1（炸弹类约 2/3）；决赛圈强力宝箱每个多喷 1 颗、保底炸弹类。
- **决赛圈缩到 1×1、活到最后者胜（ADR [0031](../../../.spec/decisions/0031-bomber-final-circle-to-one-cell-last-survivor-wins.md)，design §4 / §4.2）**：积木剩 < 20%（再生停止后才生效）或局时只剩 115 秒时触发，固定 115 秒；不能复活。安全圈相对触发 +10 / 35 / 55 / 75 / 95 / 110 秒缩到 13 / 9 / 7 / 5 / 3 / 1 格，+115 秒局终；末三段（5×5 / 3×3 / 1×1）生效时清掉新圈内的积木与木箱（只清这两种）。强力宝箱 5 个，1×1 段不落、不落中心格。圈外毒：5×5 前每秒 −0.5 心，5×5 起每秒 −1 心。只剩 1 人时在致死的同一 Tick 结束、他是第 1 名；时间到仍 ≥ 2 人存活按帽数排（并列同名次）；出局者排在存活者之后，出局越晚越靠前。
- **软砖再生（ADR [0026](../../../.spec/decisions/0026-bomber-small-map-regen-and-resource-trigger-gate.md)，design §5）**：常规阶段每 8 秒在无人区域补回镜像积木，距时间触发 60 秒（4:05）时停止；资源触发只在再生停止后生效。
- **帽子 = 强化数（ADR [0028](../../../.spec/decisions/0028-bomber-hats-are-powerup-count.md)，design §9）**：没有独立的帽子资源，头顶几顶帽子就是身上几个强化（火力 / 炸弹 / 速度高出初始值的级数）；吃强化 +1 顶，死亡掉一半强化帽塔同步变矮，决赛圈出局强化全掉；地上不再有帽堆、击杀不单独铸帽。技能（专属、技能糖、等级、组合技）都不计帽数。
- **死者掉落保护（ADR [0029](../../../.spec/decisions/0029-bomber-death-drops-blast-protection.md)）**：死者掉出的强化与技能糖落地后 3 秒内炸不掉，外罩淡金色泡泡。
- **死亡掉强化（ADR [0025](../../../.spec/decisions/0025-bomber-final-circle-and-death-drops.md)，design §8.5）**：已吃的火力+ / 炸弹+ / 速度+ 每级 50% 掉在死亡点周围，谁捡归谁。
- **手感（ADR [0032](../../../.spec/decisions/0032-bomber-movement-dual-direction-and-doll-footprint.md)，design §6.1）**：同按两个方向时新按的优先，走不通就沿旧方向滑行，一旦走得通立即转入；转角吸附 0.5 格（连续转角 0.25 格）；玩偶视觉占地 ≤ 0.7 格（脚圈 0.7、前伸 ≤ 0.35），脚圈与影子画在逻辑位置。
- **火焰按暴露时长烧（design §8.4 / §12）**：在别人的光环或火墙里连续站满 1 秒才掉第一颗心，之后每满 1 秒再掉 1 颗，离开即重新计时（接触即烧让熊独大，见下文实测）。
- **Bot 难度分档（design §15「Bot 难度分档（原型工具）」）**：easy / normal（默认）/ hard（= 第 3 轮强度）；三档都会施放技能、抢技能糖，决赛圈末段有对决战术（晚入圈、以血换血、追最弱）。
- **领奖台（design §13）**：结算前 10 秒 3D 领奖台，前三名戴着帽子塔上台庆祝（第 1 名戴皇冠，并列都戴），之后 6 秒结算表（结束方式、角色、本局技能与进化）并自动下一局。
- **不做**：替换确认（占槽的技能糖捡不起，只能靠进化或死亡掉落换技能）；其余技能厚棉花 / 火焰弹 / 分裂弹 / 钻头 / 磁铁 / 筑墙 / 幽灵 / 长手 / 遗爆；中毒弹 / 麻痹弹的组合；狂暴糖、分区补给箱与中央大补给（决赛圈强力宝箱除外）、分区、木头 / 鞭炮 / 冰面、中途加入补偿、联网。

## 结构与接缝

```
src/contract/   规则面：字段逐字照抄 C# 契约（组件、事件、配表、技能输入、快照、GameSource）+ 标注 NON-CONTRACT 的原型扩展（技能 / 角色表、Bot 难度）
src/shared/     纯格子数学、技能几何、排名公式
src/present/    表现时钟（快照缓冲、插值、事件按渲染 Tick 派发、定帧）与本机设置
src/view/       Three.js 程序化画面          ┐
src/hud/        DOM HUD                     │ 只依赖 contract / shared / present
src/input/      键盘 + 触屏                  │ ——接引擎时保留
src/audio/      WebAudio 合成音效            ┘
src/bots/       Bot：只读快照、只发技能输入（像真实 Bot 客户端）
src/sim/        TS 规则替身 ← 接引擎时整体删除
src/app/        组装；local-host.ts 是唯一允许 import sim/ 的文件 ← 接引擎时换成 Replica 适配器
tests/harness/  无界面整局统计（pnpm accept / pnpm stats）
```

`tests/architecture.test.ts` 机械守住上面的依赖方向，并禁止 `src/sim`、`src/shared`、`src/bots` 出现 `Math.random` / `Date.now` / `performance.now`。接入引擎（ADR-067：规则跑 C# .NET WASM Replica）时：实现一个新的 `GameSource`（把 Replica 的组件 / 事件搬进 `src/contract` 的形状），替换 `app/local-host.ts`，删除 `src/sim/`；表现层不改。第 4 轮起（ADR 0030 修订 0024）表现层可以依赖 NON-CONTRACT 字段呈现角色、技能、决赛圈与排名，但字段缺席时必须退化而不崩溃；内核玩法（移动、放弹、爆炸、血量、帽数）不得依赖它们。

## 原型扩展（NON-CONTRACT，待议是否提给契约）

- `BomberPlayerState.HatCount` 改为派生值（强化数），契约的 `BomberHatPile` / `HatPile*` 事件在原型里不再使用（ADR 0028）；`isPowerupKind()` 判定什么算强化（血包与技能糖都不算帽子）。
- 枚举扩值：`BomberPickupItem.Kind` = 3 血包、4 `SkillCandy` 技能糖（契约只到 0–2）；`PlayerDied.Cause` = 3 `Poison` 毒圈、4 `Toxin` 中毒弹（契约只到 2；火焰光环 / 火墙致死复用契约值 2 燃烧）；`BombKind` = 5 `Toxin`、6 `Shock`（契约只到 4；冰川弹复用 `BombKind = 1` + `PierceLayers = 1`）。`玩家属性.移速当前` 在麻痹时含修饰、基础账不变（ADR 0033）。
- 输入：`AbilityActivation` 加 `{ ability: '技能' }`（主动槽，ADR 0030）；`移动技能输入.副方向`（另一个仍按住的垂直方向，ADR 0032）。
- 快照（第 4 轮）：
  - `PlayerView.skills`（`PlayerSkillsView`）：`character`、`facing`、`slots`（每槽 `SkillSlotView` = `skill` / `level` / `bound`）、`cdFromTick` / `cdUntilTick`、`bubbleUntilTick`、`auraUntilTick`、`frozenUntilTick`、`regenFromTick` / `regenNextTick`、`blinkTick`、`toxinUntilTick`、`shockUntilTick`；
  - `PlayerView.eliminatedTick`（= 使其出局的那条 `PlayerDied` 的 Tick）；
  - `BombView.kick`（`BombKickView`：`dir` / `progressMilli` / `cellsLeft` / `speedMilli`）；
  - `PickupView.skill`（`id` / `level`）；
  - `WorldSnapshot.FireZones`（`FireZoneView`：`owner` / `source` = `'aura' | 'firewall'` / `cells` / `untilTick`）；
  - `MatchMeta.results`（`MatchResultsView`：`reason` / `winner` / `rows`，每行 `MatchRankRow` = `id` / `rank` / `place` / `survived` / `hats` / `eliminatedTick`）。
- 契约事件上的扩展：`MatchEnded.proto { Reason: 'lastSurvivor' | 'allDown' | 'timeUp', WinnerNetEntityIdRaw }`（ADR 0031）；`PickupTaken.proto.Skill` / `SkillLevel`；其余契约事件的 `proto` 字段同前。
- 决赛圈与领奖台（第 3 轮起）：`MatchMeta.finalCircle` / `resourceInitial` / `resourceRemaining`、`PlayerView.eliminated`、`PickupView.droppedBy` / `protectedUntilTick`、`WorldSnapshot.Chests`。
- 表现事件（`presentationOnly`）：`BrickDestroyed`、`PickupSpawned`（第 4 轮加 `Skill` / `SkillLevel`）、`PickupDestroyed`、`BombExtinguished`、`ChainResolved`、`MatchStarted`、`BricksRegrown`、`PowerupsDropped`、`FinalCircleStarted`、`RingShrinkAnnounced`、`RingShrunk`、`PlayerEliminated`、`ChestSpawned` / `ChestHit` / `ChestOpened`（`HatMinted` 已停用）；第 4 轮 `SkillActivated`、`SkillFailed`、`SkillGained`、`SkillEvolved`、`SkillsDropped`、`PlayerHealed`、`BombKicked`、`PlayerFrozen`、`PlayerPoisoned`、`PlayerShocked`、`PlayerCured`。表现层把它们当提示，快照 diff 才是依据。
- `PlayerMeta`（名字 / 动物 / 槽位）、`MatchMeta.phaseEndTick`、`EntityView.teleportTick`。
- `ProtoRules`（`src/contract/config.ts`）：契约 §5 未收录但 design.md 给了数值（或原型自定）的规则参数，逐项注明出处。第 4 轮新增或改值：
  - 局时与决赛圈：`matchCapMs` = 420000（经 `protoConfig()` 覆盖局时；契约 `DEFAULT_CONFIG.matchDurationMs` 仍是 360000）、`finalCircleMs` 90000 → 115000、`ringStages` 6 段且每段带 `chest` / `clearInside` / `poisonPoints`（`RingStage`、`poisonPointsAt()`）；
  - 手感：`cornerAssistMilli` 400 → 500、`cornerAssistRepeatMilli` 200 → 250、`assistRepeatWindowTicks`、`dollFootprintMilli` / `dollReachMilli`（纯表现）；
  - 角色与技能：`characters` / `skills` / `combos`、`skillMaxLevel`、`skillCandyLevel`、`crateSkillCandyPermille`、`chestSkillCandies`、`chestSkillCandyPool`、`skillDeathDropPermille`、`burnIntervalMs` / `burnPointsPerInterval`、`toxinIntervalMs` / `toxinPointsPerInterval`、`freezeCapMs` / `freezeImmuneMs` / `freezeBombDamages`、`kickSpeedMilli`。
- 数据表（`src/contract/skills.ts`，ADR 0030 / 0033）：`SKILLS`（`SkillId`；`SKILL_IDS` 编码只在末尾追加；`SkillParams` 含 `slowPermille`）、`COMBOS`、`CHARACTERS`，以及 `candyPool()` / `bombCandyPool()` / `describeSkill()`。
- Bot 难度（`src/contract/ai.ts`，design §15「Bot 难度分档（原型工具）」）：`BOT_PROFILES`（`easy` / `normal` / `hard`，外加验收用的脚本玩家 `player`）、`BOT_TACTICS`（决赛圈对决与技能施放常量）、`parseBotDifficulty()`。规则层不读，只有 `src/bots` 与宿主读。
- 以上扩展是否进契约，等原型验证后走契约修订另议（ADR 0025、0030–0033「后果」）。

## 规则替身对「契约未规定处」的取舍（C# 落地时逐条核对）

- ms → Tick 向上取整（125 ms @20 Hz = 3 Tick）。
- 移动按契约四向 + 停（design §6.1 已改为四向，ADR 0032）。同按两向：`副方向` = 与主方向垂直、更早按下且仍按住的键，反向键不算；触屏摇杆副轴 ≥ 主轴一半算副方向；自动选择永不走进危险格。
- 软砖 / 木箱格被摧毁但不计入 `Reach*`；水格计入并停止；火焰越过被连锁引爆的炸弹继续传播。
- 炸弹在引爆时回到手上；炸弹+ 上限按「手上 + 场上未爆」计。
- 死亡事件在结算 Tick 发出（同时掷出要掉的强化），掉落与重生计时在下一 Tick。
- 帽王 = HatCount 最高且 ≥ 1，并列保留现任；光柱阈值 N = 3 只是表现阈值。
- 拾取竞争：离格心最近者得，再按 id；糖果池权重 30 / 30 / 25 / 15（推断）。
- 闪现 / 火焰冲刺落点：沿面朝方向逐格扫至多 N 格，出界或铁皮即止；扫到的格里砖层为空、没有未爆炸弹、没有宝箱的取最远一个（可以落水）；没有落点或面向为停 → 施放失败、不进 CD。火焰冲刺火墙 = 起点 + 途经的空格，不含落点。
- 火焰光环 = 熊脚下 3×3（含熊自己那格，砖格不着火），随人移动。烧伤按暴露时长：连续站在别人的火区里满 1 s 才烧第一下，之后每满 1 s 再烧；离开火区、重生保护期、泡泡期内清零。重叠火区只算一份，击杀记第一个火区的主人（光环在前按 id，火墙在后按生成序）；熊死了光环立即消失，火墙主人死了照烧。
- 踢弹在移动之前判定（副方向也能踢），每人每 Tick 至多踢一次；滑行 8 格/秒，砖 / 未爆弹 / 宝箱挡，玩家不挡；进入第一格水即熄灭、炸弹数照爆炸一样回手；滑行中不能再踢，旧火焰不引爆滑行中的弹。
- 冰冻弹 / 冰川弹 / 中毒弹 / 麻痹弹：同一颗弹先按标准弹扣血，再只给幸存者上状态（`freezeBombDamages` 可把冰冻切回「不扣心」）。冻结不叠加不刷新，解冻后 1 s 控制免疫；中毒 / 麻痹重复命中只刷新时长，中毒击杀改记最近一次投弹者。麻痹只进 `玩家属性.移速当前`，水中减速在移动时另乘、不发布。
- 名次由规则层算（`sim/results.ts` → `shared/ranking.ts`），经 `match.results` 与 `MatchEnded.proto` 发布，表现层只读。决赛圈内扣掉本 Tick 待死者后存活 ≤ 1 → 在致死的同一 Tick 结束；同 Tick 出局并列同名次；全灭时最后一批并列第 1。
- 玩家互不阻挡，1×1 那一格可以同时站好几个人（时间到按帽数排名）。

## 验收与实测（第 4 轮，2026-09-26）

`pnpm accept` 与 `pnpm stats` 的交付数字（缺省种子，不换种子；E 的「本机」是 0 号位按 normal 档自动驾驶的 Bot，D / easy / hard 的本机是脚本玩家 `player` 档、角色逐局轮换）：

| 批次 | 局数 | 平均局长 | 唯一存活 | 时间到 | 场均击杀 | 场均帽王更替 | 本机前 3 | 场均进化 |
|---|---|---|---|---|---|---|---|---|
| E · 6 种子 · 全员 normal | 6 | 5.6 分 | 100% | 0% | 8.0 | 8.8 | 50% | 1.5 |
| E · 20 种子 · 全员 normal | 20 | 5.6 分 | 100% | 0% | 9.5 | 8.2 | 65% | 1.1 |
| D · 脚本玩家 vs 7 normal | 30 | 5.6 分 | 93%（另 7% 同 Tick 全灭） | 0% | 9.2 | 8.4 | **43%** | 1.1 |
| easy · 脚本玩家 vs 7 easy | 30 | 5.7 分 | 90% | 10%（存活中位 2） | 9.2 | 7.8 | 40% | 1.3 |
| hard · 脚本玩家 vs 7 hard | 30 | 5.5 分 | 100% | 0% | 7.1 | 7.3 | 40% | 0.9 |

- **验收 E 通过**（ADR 0031 口径：唯一存活 ≥ 85%、时间到的存活中位 ≤ 2、1×1 可进入、平均局长 ≤ 7 分钟；最后一条由封顶本身保证，实测均值 5.6 分钟）。决赛圈 100% 由资源触发（约 4:05，再生停止即触发），多数局在 5×5 / 3×3 段就分出胜负；真正打到 1×1 的只有 E 0/20（6 种子是其子集）、D 1/30、easy 5/30、hard 1/30，所以 1×1 可进入另由 `src/sim/__tests__/final-cell.test.ts`（种子 1–100 的真实地图）断言。
- **验收 D 未达标**：目标脚本玩家对 7 个 normal Bot 进前 3 ≥ 50%，实测 43%（烧伤改按暴露时长之前那一版为 47%）；`pnpm stats` 因此以 D 断言失败退出（exit 1），不改断言、不换种子。
  - 原因：角色强弱主导名次。脚本玩家用棉花兔 6/7 进前 3，用火焰熊 3/7、泡泡鸭 2/8、闪电猫 2/8；D 批次第 1 名按角色为兔 16 / 鸭 8 / 熊 6 / 猫 2（32 人次，含 2 局同 Tick 全灭并列第 1）。改按暴露时长之前是熊独大（第 1 名熊 19/30）。此外脚本玩家档在调参前就固定（反应 3–5 Tick、噪声 5%、不设陷阱、同时 1 颗进攻弹），本身只比 normal（D9：反应 4–7 Tick、噪声 15%）略强。
  - 可用杠杆（design §15，另行决策）：先调角色平衡，例如回春间隔 A/B（兔子偏强，往长试）、闪现 CD（猫偏弱，往短试）；或经策划评审重新定义「普通水平玩家」这一基准。

美术：本原型不构成美术定调（仍在 ADR 0007 比稿中）；遵守世界观 ADR 0008，配色借比稿方向 B 色板。
