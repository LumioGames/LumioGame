---
status: pending
---

# 101 移动输入改「持续意图」（F1）：方案草稿

接[离线准备交接](2026-10-08-movement-offline-prep-handoff.md)的「之后的正解」。F1 是输入 / 玩法侧的修复，与 F3（自角色一步内插值，表现侧）互相独立。**本稿只出方案，未改玩法源码、未跑测试**；文中机制均为源码推演，频率与手感贡献未测。定方向后才写 ADR、改策划案、拆 Workflow 单。

## 1. 现状核实（源码推演）

| # | 事实 | 出处 |
|---|---|---|
| 1 | 一条 Move 输入积分一整步（`1/TickRateHz` 秒，3.5 格/秒 × 50ms = 0.175 格）；没有输入的 Tick 原地不动 | [MoveAbility.Movement.cs](../../Gameplay/Abilities/MoveAbility.Movement.cs) `TryAdvance` |
| 2 | **同一 Tick 收到两条，并不会走两步**：Runtime GAS 在成功激活后设 `cooldown = Tick+1`，第二条在 Admit 2 / 提交复核被拒，映射为 `BusinessReject`。客户端据此撤销它已预测的那一步，表现为向后纠偏 | Runtime f69e2c9 `AbilityComponent.cs:536-584`、`:401-411`；本仓 `MovementInputMemoryTests.MultipleCommandsInOneAuthorityTickCannotSpendMultipleMovementBudgets` |
| 3 | 服务器每 Tick 把收件箱里的输入全部取出，按到达顺序执行。网络聚包时两条落进同一 Tick，第二条按第 2 行被拒；空拍的 Tick 不走 | Runtime `WorldManager.cs` `ApplyInputs` |
| 4 | 客户端预测时钟每次 pump 只 `Tick` 一次，步号按墙钟取整，可以一次跳 2 步；输入在当前 cursor 准入，跳过的那一步没有输入 | LumioClient `ClientSession.PredictionClock.cs` `AdvancePredictionClock` |
| 5 | 持键靠 `setInterval(50)` 发，主线程忙时丢拍不补（checkpoint114 探针：重载 134/1000 次 pump 收到 0 条）。本地和服务器都真实少走一步 | [player-controls.mjs](../../Client/UI/Spectator/player-controls.mjs) |
| 6 | 已有**服务器独有的续行**：转向缓冲未到期且本 Tick 没走时，服务器替玩家激活 Move（松键后的短按转向会继续走到路口）。这在 `.Server.cs` 里，客户端不预测，松键后会出现前向纠偏。放弹缓冲（`PendingPlaceUntilTick`，`Scope.None`）是同一类 | [BomberBufferedInputSystem.Server.cs:24](../../Gameplay/BomberBufferedInputSystem.Server.cs)；`EarlyTurnTapContinuesToTheOpeningAndFinishesAfterRelease` |
| 7 | GAS 预测**只按输入**关联、撤销和重放。预测世界不跑逐 Tick 的玩法系统，纠偏时也不按 Tick 重放 | Engine `gas.md` M7、ADR-106；Runtime `WorldManager.PublishEgress` 只在预测步上 `Rebuild` |
| 8 | Bot 每看到一个新的复制 Tick 发一条 Move，节拍跟着网络走；决定停就不发 | [BomberPlayScenario.cs](../../Client/Bots/BomberPlayScenario.cs) `Step` |
| 9 | 原型的宿主持有 `this.move` 和 `tapDir`，每个固定步采样一条移动输入，固定按「移动 → 放弹 → 技能」排序；卡顿后最多补跑 5 步，累计时间截断在 250ms | `prototype/src/app/local-host.ts` `sendInput` / `pump` / `stepOnce` |

第 2 行更正了交接里「一个 Tick 收两条就走两步」的说法。今天步数出错有四个来源：客户端空拍（两端都少走）、客户端同一 cursor 收两条（本地拒第二条，服务器可能分两 Tick 执行）、网络聚包（服务器拒第二条，客户端回拉）、服务器独有续行（客户端没预测）。它们都违反 Engine `movement.md:153` 的要求：每个逻辑 Tick 按生效意图推进，不能因为一个 Tick 多收几条输入就多走路。

**关键约束：** 因为第 7 行，F1 不能只在 Game 里把意图写进 `BomberPlayerState`、再加一个逐 Tick 推进的系统。那个系统只在服务器上跑，客户端预测不到，等于把今天第 6 行的错位扩大到每一步。

## 2. 方向对比

| | A 逐 Tick 意图采样（**推荐**） | B 服务器持有意图 + Runtime 预测续行 | C Game 内混合（不推荐） |
|---|---|---|---|
| 一句话 | 意图由输入端持有，每个预测步恰好采样提交一条；服务器每 Tick 最多执行一条，多出来的顺延到后面的 Tick | `MoveAbility` 只改意图；共享的逐 Tick 推进系统按意图走一步；预测世界逐步跑这个系统，并按 Tick 重放 | 意图写进 `BomberPlayerState`，服务器独有系统补空拍，客户端仍然按输入预测 |
| 参考锚 | 原型 `local-host`；Source / Overwatch 的 usercmd 加服务器输入缓冲 | Engine `movement.md` M3 的字面设计 | 今天的转向缓冲续行 |
| 两端确定性 | 已接受 N 条采样 = N 步，两端执行同一份 Ability 代码 | 两端按同一 Tick 跑同一系统；只有起停边沿可能因抖动差 ±1 步 | 服务器按 Tick 计步，客户端按输入计步，确认映射会错开，聚包和空拍都会纠偏 |
| Game 改动 | 中：输入层采样驱动、锁存、删除服务器独有的移动续行；Move 字段不变，不加组件字段 | 大：新增意图字段并迁移 schema 身份、推进系统、放弹先推进、Bot 显式停 | 中 |
| 上游改动 | R1 GAS 同 Tick 顺延，R2 Client 逐步推进加每步回调（R2 只有补步要用） | R3 GAS 预测续行：改 M7 / ADR-106 的输入关联与选择性重放，规模最大 | 无，但解决不了问题 |
| 架构风险 | 低：GAS 仍然按输入预测 | 高：按 Tick 重放进入选择性重放机制，WASM 解释执行有额外成本 | 高：违反「不建影子模拟」 |
| 手感收益 | 消除四类错步；卡顿后能补上 | 同 A，此外服务器空拍也照走，带宽更低 | 部分，而且引入新的纠偏 |
| 验证成本 | 低：现有埋点和 `movement-trace-analyze` 指标可直接复用 | 高：要补全套预测 / 纠偏联测 | — |
| 长线 | 以后可平滑迁到 B：输入形状不变，只换「谁触发这一步」 | Engine 通用解，其他游戏也能用 | 死路 |

**推荐 A：** 它是原型手感模型的联网版，不需要改 GAS 的预测编排。上游只要两个小而独立的能力，交付最快。B 是 Engine 的长线正解，记作上游诉求，不阻塞 101。

## 3. 方向 A 设计

### 3.1 输入语义

`Move {PrimaryDirection, SecondaryDirection, TurnPressed}` 字段不变，语义收紧为：**一条 Move = 一个逻辑 Tick 的意图采样**。

- `TurnPressed` 表示这次采样带着一个还没消费的按下沿，用于转向缓冲和短按锁存。不再表示「定时器第一拍」。
- 主 / 副方向的取法不变：按住集合按新按下优先，触屏副轴 ≥ 主轴一半，见 design §6.1-2。

### 3.2 意图状态放在哪里

| 状态 | 位置 | 说明 |
|---|---|---|
| 当前持有的方向（键盘按住集合 / 触屏摇杆） | 客户端输入层，已有的 `held` / `touch` | 不进世界状态；采样时读取 |
| 短按锁存、按下沿锁存 | 客户端输入层，F2 已有的 `tapDirection` / `turnPending` | 一直保留到被下一次采样消费；松键也不丢 |
| 转向缓冲、上次移动、吸附连续性 | `BomberPlayerState` 现有字段 `PendingTurn*`、`LastMove*`、`LastAssistTick`、`AssistToleranceMilli`（`Scope.Owner`） | **不加字段**，所以不触发 schema 身份迁移 |
| 同 Tick 多余输入的顺延队列 | Runtime GAS 准入层（R1） | 不进 Game 组件；只有真正执行时才确认 |

### 3.3 客户端采样节拍

- **由预测时钟驱动**：每个预测步之前恰好采样一条，即 F2 `?input=pump` 的位置升级为默认行为。
- **跳步时补步**：时钟一次前进 k 步时，逐步推进，每步之前采样一条（需要 R2）。上限 5 步，累计截断 250ms，与原型 `MAX_CATCH_UP`、250ms 截断一致；超出部分不补。
- **松键**：停止采样。如果还有未消费的锁存，下一步仍然发一条，保证短按至少走一步。
- **转向缓冲续行**：转向缓冲未到期时，客户端继续发「停」采样，直到缓冲到期，让续行进入预测。`CanActivate` 遇到「停」且没有缓冲时，要从报错改为成功但不动，避免刷拒绝。

### 3.4 预测与重放如何保持确定

1. 一条已接受的采样在两端执行同一份 `MoveAbility` 代码，结果是走一个固定步、走一步缓冲续行，或者被墙挡住不动。纠偏 = 权威状态 + 重放未确认的采样，重放时仍然一条一步，所以「N 条 = N 步」在两端都成立。
2. **删掉服务器独有的移动续行**（`BomberBufferedInputSystem.Server.cs:24-25` 的 Move 激活），改由 3.3 的「停」采样驱动。否则服务器会多走客户端没预测的步。放弹缓冲先不动，见 3.7。
3. **R1 是 A 成立的前提**：同 Tick 同类型的第二条输入不能被拒，要在准入层顺延到下一个 Tick 执行，而且执行前不确认。如果改成「已接受但下一 Tick 才走」，客户端会把它从重放里拿掉，照样回拉。顺延要求：
   - 每个实体每种类型最多排 2 条，满了就拒绝，这一层兼作防加速；
   - 同一连接内保序：一条被顺延，同一连接后续的输入一起顺延；
   - 断线、换绑、换命或换局时清空，残留的由 `CanActivate` 的 `IsCurrent` 拒绝（已有）。
4. 补步产生的输入天然是聚包的，所以没有 R1 就做补步，回拉会更多。R2 必须排在 R1 之后。

### 3.5 什么时候清意图

| 情况 | 行为 |
|---|---|
| 松键 | 停止采样；短按锁存保证一步；转向缓冲按 3.3 发「停」采样到期为止 |
| 失焦、标签页隐藏、UI 抢焦点 | 现有 `clear()` 清掉按住集合和锁存，停止采样；不发「停」，因为 A 里「不发」就是停 |
| 断线 | 没有输入，服务器当 Tick 就停；没有续行，也没有租期；R1 队列清空 |
| 冻结、泡泡、换命、换局 | `BomberInputMemory.Clear` 已有；冻结期间的采样两端都被拒，结果一致 |

### 3.6 转角吸附与 TurnBufferTicks

数值不改。这些规则都隐含「每个 Tick 走一步」：

- ADR [0032](../../../../.spec/decisions/0032-bomber-movement-dual-direction-and-doll-footprint.md) 推导「6 Tick 缓冲可覆盖 1050 千分格」；
- 连续转角的判据是「上一 Tick 走过」，见 `ExecuteMovement` 的 `previous` 和 `AssistTolerance`。

今天丢拍时 `previous` 归零、吸附回到 0.5 格、`carry` 失效，转角时灵时不灵。F1 让这个前提重新成立。顺延执行用执行时的 Tick 判断，连续性不受影响。

### 3.7 放弹的先后次序

- 每次采样内的次序固定为「移动 → 放弹 → 技能」，与原型 `stepOnce` 一致。放弹读的是走完这一步后的 Logic 位置，见 Engine `movement.md:171`。R1 的连接内保序保证顺延不会把它们的次序颠倒。
- 放弹缓冲 `PendingPlaceUntilTick` 也是服务器独有续行（`Scope.None`，客户端不预测），与第 1 节第 6 行同类，但只影响放弹表现，不在 F1 范围内，登记为后续。

### 3.8 对服务器与 Bot 的影响

- **服务器**：每人每 Tick 一条，与今天同量级，CPU 和带宽不变。顺延队列最坏让权威落后 2 Tick（100ms），远端插值的 2 Tick 延迟能吸收。
- **回放**：`commands.ndjson` 的 `tick` 必须记**执行 Tick**，不能记到达 Tick，否则回放对不上。
- **Bot**：Bot.Host 现在每看到一个新的复制 Tick 发一条，同样受聚包和空拍影响。R1 落地后自然受益。停步就是不发，这一点不受影响。Bot 改成按本地步采样属于可选优化，不进首批。

### 3.9 与 F2 / F3 的关系

A = F2 升为默认 + 补步 + 锁存语义 + R1。F3 只管自角色的显示。F1 落地后准入节拍变得规整，可以减少 F3 要平滑的量，但卡顿帧的显示仍然靠 F3。两者可以按任意次序交付，验收指标分开统计。

## 4. 方向 B 要点（选 B 时才展开）

- **新字段**：`BomberPlayerState` 加 `HeldPrimary`、`HeldSecondary`、`TapPending`、`HeldUntilTick`（租期，推断 3 Tick = 150ms，待验证），均为 `Scope.Owner` / `Authority.Server` / `[Persist]`；转向缓冲复用 `PendingTurn*`。必须走 `Tools/schema-identity-*` 账本迁移。
- **执行**：`MoveAbility.Execute` 写意图，本 Tick 还没走就当场走一步（Engine M4「意图可交当前控制者当场处理」）。共享推进系统放在 `ApplyInputs` 的 RPC 之后，给没走过且意图有效的玩家各推进一步，不能放到 `ProcessorPlan`，否则放弹会读到旧位置。`PlaceBomb` 先调推进入口，再读位置。
- **客户端**：只在边沿发送，每 4 Tick 续一次租；必须**真正发送「停」**，今天从来不发。失焦时 `clear()` 前先发「停」，租期兜底。
- **Bot**：决定停时也要发「停」。
- **上游 R3**：预测世界要逐步运行声明为可预测的推进系统，纠偏要按 Tick 重放，并接入选择性重放的读写闭包。这是对 GAS M7 和 ADR-106 的方向性扩展。

## 5. 与策划案 / 契约的冲突点

| # | 条款 | 现文 | A 的处理 | B 的处理 |
|---|---|---|---|---|
| 1 | [契约](../../../../docs/specs/bomber/stage0-kernel-contract.md) §2.1 Move 行 | 只列了字段与判据，没有定义一条输入代表多少时间 | 补一句：「一条 = 一个逻辑 Tick 的意图采样；同 Tick 最多执行一条，其余顺延；TurnPressed = 未消费的按下沿」 | 改为意图更新语义；「停」必须发送；加租期 |
| 2 | 契约 §2.1 PlaceBomb「缓冲归Ability」；design §6.1-5 放弹缓冲 125ms | 服务器独有续行 | 数值不变；补「同一采样内移动先于放弹」 | 补「放弹先调推进入口」 |
| 3 | 契约 §2.2「业务仅使用 ApplyInputs/ProcessorPlan…不得另建 loop」 | — | 不加系统，还删掉一段续行 | 新推进系统只能放在 `ApplyInputs` 的 RPC 之后 |
| 4 | 契约 §2.1 Facing 规则 | 取最近一次非停的主方向 | 不变 | 「停」输入不得改 Facing |
| 5 | 契约 §5 `commands.ndjson`「tick…只录实际提交输入」 | 没说明 tick 记的是什么 | 明确为执行 Tick | 记录量下降；新字段进入 statehash |
| 6 | [design](../../../../docs/specs/bomber/design.md) §6.1-1 连续转角 6 Tick；ADR 0032 的 1050 推导 | 隐含每 Tick 一步 | 前提重新成立，数值不改 | 同 A |
| 7 | design §6.1 | 没有「按住匀速、短按至少一步、松键即停」 | **新增第 9 条冻结手感规则**，需定调 | 同 A |
| 8 | design §15「10 条固定路径卡住 Tick = 0」 | 测试一 Tick 喂一条，绕开了真实输入管线 | 补「注入 0/2 批次、40ms 卡顿与聚包后，步数守恒」的验收 | 同 A |
| 9 | Engine `movement.md:153`「保持中的意图」 | 字面要求服务器持有意图 | 意图在输入端持有，服务器不跨空拍续行，与字面有偏差，要在上游 ADR 里说明 | 与字面一致，但缺 R3 |

第 1、2、5、7、8 行要改策划案或契约正文，第 9 行要走上游。

## 6. ADR 判定与草案要点

**需要。** 理由有两条：一是改了 Move 输入语义，并新增冻结手感规则（方向级取舍）；二是要改 GAS 公共准入行为（架构约束 8：公共契约变更走上游 ADR）。

**本仓根 ADR 0050（玩法）**：「炸弹人移动改为逐 Tick 意图采样：按住匀速、短按至少一步、同 Tick 至多一步」。

- **背景**：第 1 节的四类错步，以及服务器独有续行。
- **决策**：
  - 采样语义；
  - 锁存一直保留到被消费；
  - 补步上限（按第 8 节 Q2 定）；
  - 采样内次序「移动 → 放弹 → 技能」；
  - 删除服务器独有的移动续行；
  - design §6.1 增加第 9 条；
  - 契约 §2.1 与 §5 补语义；
  - 第 7 节的验收指标。
- **不锁**：补步上限、顺延深度。两者进 design §15。
- **后果**：依赖 R1 / R2；ADR 0032 数值不变；放弹缓冲的错位登记为后续；以后迁到 B 时由新 ADR 取代。

**上游 Engine ADR（在 LumioGameEngine 写，本仓只提诉求）**：

- **R1 GAS 同 Tick 同类型输入顺延**：有界（建议 2），连接内保序，执行前不确认，断线 / 换绑清空，超限拒绝。可做成按 AbilityType 声明的准入策略，默认行为不变。
- **R2 Client 预测时钟逐步推进 + 每步回调**：一次 pump 跨 k 步时逐步 `Tick`，每步之前回调 Game 采样，上限由 Game 配置。
- 如果选 B，换成 **R3 预测续行**。

## 7. 验收口径（全部可判定）

1. **两端一致**：同一份按键时间线，注入 0/2 批次、单次 40ms 卡顿和网络聚包后，客户端预测终点 = 服务器权威终点，向后纠偏 0 次。
2. **步数守恒**：按住 N 个逻辑 Tick、卡顿不超过 250ms 时，推进步数 = N（可通行路段，误差 0）；卡顿超过 250ms 时，少走的步数 = ⌊(卡顿 − 250ms) / 50ms⌋。
3. **短按**：按下到松开不足 50ms 时，恰好走 1 步（可通行时）。
4. **转向缓冲**：松键后的续行出现在客户端预测里，由它引起的纠偏 0 次。
5. **服务器**：同 Tick 的第二条 Move 产生 `BusinessReject` 0 次；顺延队列深度 p99 ≤ 1。
6. **浏览器**：`movement-trace-analyze` 中 `admission.movesPerHeldPump` 的 0/2 占比为 0；由 F1 引起的 `backwardFrames` 为 0（F3 另算）。
7. **回归**：ADR 0032 的 10 条路径在真实输入管线下卡住 Tick = 0。

## 8. 待用户拍板

- **Q1 方向**：选 A「逐 Tick 采样」（推荐，上游只需两个小能力），还是 B「服务器持有意图 + Runtime 预测续行」（Engine 字面正解，上游改动最大、周期最长）？
- **Q2 卡顿后补不补步**：
  - 补（推荐）：最多补 5 步 / 250ms，与原型一致；「按住 1 秒走 3.5 格」可预期，卡顿后会看到一小段追赶；需要 R2。
  - 不补：卡多久就少走多久，两端仍然一致，不需要 R2，但会出现「卡一下就短一截」。
- **Q3 短按语义**：
  - 短按必走一步（推荐）：0.175 格，与原型和今天一致，Facing 同时更新；
  - 短按只转身不走：方便闪现和飞踢原地瞄准，但要新增时长阈值，偏离原型。

## 9. 定案后的拆单草案（未上传）

| 单 | 仓 | 内容 | 前置 |
|---|---|---|---|
| T1 | LumioGameEngine | 上游 ADR：R1（与 R2） | — |
| T2 | LumioGameRuntime | R1 顺延准入与测试 | T1，basis=interface |
| T3 | LumioClient | R2 逐步推进与每步回调（Q2 选补步才做） | T1，basis=interface |
| T4 | LumioGame | ADR 0050；design §6.1 / §15 与契约 §2.1 / §5 修订；输入层采样驱动与锁存；删除服务器独有的移动续行；`CanActivate` 处理「停」；Move / 缓冲 / 次序测试 | T1，basis=interface |
| T5 | LumioGame | 浏览器 A/B 复测与用户前台验收 | T2–T4，basis=implementation（联调，必须真实合入才能测） |

知识同步：定案后 ADR 0050 落根 `.spec/decisions/`，策划案按 design-doc 修订；本草稿不沉淀为 feature 文档。
