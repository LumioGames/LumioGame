# 0050 · 炸弹人移动改为逐 Tick 意图采样:按住匀速、短按至少一步、同 Tick 至多一步

- 日期:2026-10-08
- 状态:生效
- 决策依据:用户 2026-10-08 拍板 F1 方案第 8 节 Q1–Q3(方向 A、卡顿补步、短按必走一步)。方案稿 `games/101-bomber/.spec/plans/2026-10-08-movement-continuous-intent-design.md` 在 [PR #53](https://github.com/LumioGames/LumioGame/pull/53),机制均为源码推演,频率与手感贡献未测。

## 背景

101 本地试玩反馈移动「一卡一卡」。源码推演出今天步数出错的四个来源,外加一处服务器独有续行:

1. **客户端空拍。** 持键靠 `setInterval(50)` 发 Move,主线程忙时丢拍不补(checkpoint114 探针:重载下 134/1000 次 pump 收到 0 条)。两端都真实少走一步。
2. **同一 cursor 收两条。** 客户端预测时钟一次 pump 只 Tick 一次、可以跨 2 步,跨过的那一步没有输入;本地拒第二条,服务器却可能分两 Tick 执行。
3. **网络聚包。** Runtime GAS 成功激活后设 `cooldown = Tick+1`,同 Tick 第二条 Move 在准入 / 提交复核被拒并映射为 `BusinessReject`;客户端撤销已预测的那一步,表现为向后回拉(Runtime f69e2c9 `AbilityComponent.cs:536-584`、`:401-411`;本仓 `MovementInputMemoryTests.MultipleCommandsInOneAuthorityTickCannotSpendMultipleMovementBudgets`)。
4. **服务器单方面续走。** 转向缓冲未到期且本 Tick 没走时,`BomberBufferedInputSystem.Server.cs:24-25` 替玩家激活 Move;这段只在服务器跑,客户端预测不到,松键后出现前向纠偏。

它们都违反 Engine `movement.md` M3「每个逻辑 Tick 按生效意图推进,不能因一个 Tick 多收几条输入就多走路」。另一个约束:GAS 预测只按输入关联、撤销和重放,预测世界不跑逐 Tick 玩法系统(Engine `gas.md` M7、ADR-106)。所以 Game 不能单独把意图写进 `BomberPlayerState` 再由服务器逐 Tick 推进——那等于把第 4 条的错位扩大到每一步。

## 决策

**方向 A「逐 Tick 意图采样」。** 意图由输入端持有,每个预测步恰好采样提交一条;服务器每 Tick 对同一实体最多执行一条 Move,多出来的顺延到后面的 Tick。参考原型 `prototype/src/app/local-host.ts` 的 `pump` / `stepOnce`,是它的联网版。

1. **采样语义。** `Move {PrimaryDirection, SecondaryDirection, TurnPressed}` 字段不变,语义收紧为「一条 Move = 一个逻辑 Tick 的意图采样」:同一实体同 Tick 至多执行一条,其余由 GAS 准入层顺延,执行前不确认;`TurnPressed` 表示这次采样带着一个尚未消费的按下沿,不再表示「定时器第一拍」。主 / 副方向的取法不变(design §6.1 第 2 条)。
2. **锁存保留到被消费。** 短按方向与按下沿锁存在客户端输入层,一直保留到被下一次采样消费,松键也不丢。**短按必走一步**:按下到松开不足一个 Tick,仍恰好走 1 步(可通行时)并更新 Facing;不做「短按只转身」。
3. **采样节拍由预测时钟驱动。** 每个预测步之前恰好采样一条;松键即停止采样,不发「停」——A 里「不发」就是停。例外:转向缓冲未到期时客户端继续发「停」采样直到缓冲到期,让续行进入预测;`MoveAbility.CanActivate` 遇到「停」且无缓冲时由报错改为成功但不动,避免刷拒绝。失焦、标签页隐藏、UI 抢焦点沿用现有 `clear()`,清掉按住集合与锁存并停止采样。
4. **卡顿补步。** 预测时钟一次前进 k 步时逐步推进,每步之前采样一条;**最多补 5 步,累计时间截断在 250 ms**,超出部分不补。数值引用原型 `MAX_CATCH_UP = 5` 与 `pump` 的 250 ms 截断;手感上推断待验证。
5. **采样内次序固定为「移动 → 放弹 → 技能」**,与原型 `stepOnce` 一致;放弹读走完这一步之后的 Logic 位置(Engine `movement.md` M4)。顺延由连接内保序保证不颠倒这个次序。
6. **删除服务器单方面的移动续行**(`BomberBufferedInputSystem.Server.cs:24-25` 的 Move 激活),改由第 3 条的「停」采样驱动。放弹缓冲 `PendingPlaceUntilTick` 同属服务器独有续行,只影响放弹表现,不在本次范围,登记为后续。
7. **design §6.1 新增第 9 条冻结手感规则**「按住匀速、短按至少一步、同 Tick 至多一步」;§15 补步数守恒、补步上限与顺延深度两行。
8. **契约补语义。** `stage0-kernel-contract.md` §2.1 Move 行写明采样语义与 `TurnPressed`,PlaceBomb 行补「同一采样内移动先于放弹」;§6 回放包 `commands.ndjson` 的 `tick` 明确记**执行 Tick**,不记到达 Tick。(方案稿第 5 节写作「契约 §5」,`commands.ndjson` 实际在契约 §6。)
9. **验收口径**(全部可判定,进 design §15):
   - 两端一致:同一份按键时间线,注入 0/2 批次、单次 40 ms 卡顿和网络聚包后,客户端预测终点 = 服务器权威终点,向后纠偏 0 次;
   - 步数守恒:按住 N 个逻辑 Tick、卡顿 ≤ 250 ms 时推进步数 = N(可通行路段,误差 0);卡顿超过 250 ms 时少走的步数 = ⌊(卡顿 − 250 ms) / 50 ms⌋;
   - 短按:按下到松开不足 50 ms,恰好走 1 步(可通行时);
   - 转向缓冲:松键后的续行出现在客户端预测里,由它引起的纠偏 0 次;
   - 服务器:同 Tick 第二条 Move 产生 `BusinessReject` 0 次;顺延队列深度 p99 ≤ 1;
   - 浏览器:`movement-trace-analyze` 中 `admission.movesPerHeldPump` 的 0/2 占比为 0;由 F1 引起的 `backwardFrames` 为 0(F3 另算);
   - 回归:ADR [0032](0032-bomber-movement-dual-direction-and-doll-footprint.md) 的 10 条固定路径经真实输入管线,卡住 Tick = 0。
10. **锁与不锁。** 锁「一条采样 = 一步、同 Tick 至多一步、短按至少一步、锁存到被消费、采样内移动先于放弹、服务器不单方面续走移动」。**不锁**补步上限(5 步 / 250 ms)和顺延深度(建议 2),两者进 design §15 按真人与浏览器 A/B 调。

**不选 B「服务器持有意图 + Runtime 预测续行」**:本地手感与 A 相当,但要扩展 GAS M7 / ADR-106 的输入关联与按 Tick 重放,周期最长;记作 Engine 长线诉求,不阻塞 101。**不选 C「Game 内混合」**:服务器按 Tick 计步、客户端按输入计步,两端口径不一致,且违反「不建影子模拟」。

## 后果

- **依赖上游两项能力,先在 LumioGameEngine 写 ADR 再由 Runtime / Client 实现,本仓不改 Runtime / Client:**
  - **R1 GAS 同 Tick 同类型输入顺延**:有界(建议每实体每类型 2 条,满则拒绝,兼作防加速);同一连接内保序;执行前不确认;断线 / 换绑 / 换命 / 换局清空,残留由 `CanActivate` 的 `IsCurrent` 拒绝。按 AbilityType 声明启用,默认行为不变。
  - **R2 Client 预测时钟逐步推进 + 每步回调**:一次 pump 跨 k 步时逐步 `Tick`,每步之前回调 Game 采样,上限由 Game 配置。
  - **R2 必须排在 R1 之后**:补步产生的输入天然聚包,没有 R1 先做补步,回拉会更多。
- Engine `movement.md` M3 字面要求「保持中的意图」由服务器跨空拍推进;A 让意图留在输入端、服务器不跨空拍续行,这一偏差在上游 ADR 里说明。
- 顺延最坏让权威落后 2 Tick(100 ms),由远端插值的 2 Tick 延迟吸收;服务器每人每 Tick 仍是一条,CPU 与带宽不变。
- ADR [0032](0032-bomber-movement-dual-direction-and-doll-footprint.md) 的数值不变。它的 6 Tick 缓冲覆盖 1050 千分格、连续转角判据「上一 Tick 走过」都隐含每 Tick 一步;今天丢拍时这个前提失效,本 ADR 让它重新成立。顺延执行按执行 Tick 判断连续性。
- 不加组件字段,不触发 schema 身份迁移;Bot.Host 仍是每看到一个新复制 Tick 发一条,R1 落地后自然受益,改为按本地步采样属可选优化,不进首批。
- F3(自角色一步内插值,表现侧)与本决策独立,验收指标分开统计;F1 让准入节拍规整后可减少 F3 要平滑的量,卡顿帧的显示仍靠 F3。
- 放弹缓冲的服务器独有续行登记为后续,不在本次修。
- 以后迁到 B 时输入形状不变,只换「谁触发这一步」,由新 ADR 取代本条。
