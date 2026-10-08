---
status: pending
---

# 101 移动手感：Mac 离线准备交接（Windows 浏览器 A/B）

接 [checkpoint114](2026-10-02-delivery-progress.md)（与云端 checkpoint113 的合入后 Review 并行）。本轮在 Mac 只做了能离线的部分：Review、机制定位、计时探针、埋点、A/B 开关、RED 证据和插值候选。**手感前台验收仍是 FAIL，F3 未定案。** 原[网页调试交接](2026-10-08-movement-browser-debug-handoff.md)的现场、Owner 门与保全规则全部继续有效。

## 判断（待浏览器证实）

一卡一卡 = 外推前探 × 准入节拍不稳。自角色显示 = 最新逻辑目标 + `v·min(e, 2h−e)`，只有每步恰好隔 h 准入才连续；而准入节拍受几件事扰动：持键 `setInterval(50)` 与 pump `setTimeout` 各自独立、主线程忙时 `setInterval` 丢拍不补、同一 tick 的第二条移动被 GAS `Tick+1` 冷却拒绝、pump 晚到时预测时钟一次前进 2 步。丢拍或被拒都是本地和服务器的真实漏步。任何偏差都被画成「先倒退再前跳」，停步必先冲过一整步再收回；Doll 再按显示位移差转身，于是持续 W 也会向后转。原型是单时钟 + 每 tick 持续意图 + 落后一帧插值，因此丝滑。

## 已准备的东西

| 仓 | 分支 / 提交 | 内容 |
|---|---|---|
| Game | PR #52 → main `4055647`；审查修复 PR #55 | `?trace=movement` 埋点、`?input=pump` A/B 开关、`Tools/movement-trace-analyze.mjs`、`Tools/movement-beat-probe.html` |
| Runtime | `exp/101-owner-interpolation` / `d53c26b` | `OwnerHeldCadenceTests`：f69e2c9 上 RED 17/36 |
| Runtime | 同上 / `98a9f69` → **`1955239`** | F3 候选：自角色一步内滑到完成目标，不外推、不收回；`1955239` 起纠偏也同样滑行、去掉独立残差。Ecs Owner 64/64，GAS 联合用例 Mac 未执行 |

两个开关只在 loopback 页面或开发桥生效，默认行为不变。

## 审查修复（PR #52 合入后的 reviewer，2026-10-08）

- **P1 埋点页起不来**：`movement-trace.mjs` 不在宿主发布清单，`?trace=movement` 在发布页 404，`initializePage` 被拒。PR #55 补进清单，并加 `publish-manifest.test.mjs` 守住。**用 `4055647` 发布的网页不能做 trace 组**，必须用含 #55 的 main 重新发布，并核实服务出的 `movement-trace.mjs` 返回 200。
- **P1 F3 纠偏回收**：`98a9f69` 纠偏时残差按 50ms 半衰减，而滑行在一步内走完，于是会先冲过纠偏目标、再无输入地往回收（.15→.191→.17）；整步被拒时会先前冲再回退。`1955239` 改为纠偏与普通新目标一样，从当前显示一步内滑到，单次变化单调（先 RED，`CorrectionWhileGlidingConvergesMonotonicallyWithoutOvershoot`）。**基于 `98a9f69` 的 native 结果与私有网页都已过时**，F3 组要换 `1955239`。
- **分析口径**：持键窗口改为从准入首条输入的 pump 到准入末条输入的 pump，松键后的空 pump 不再计入。pump 事件记录 Tick 后的自角色发布，新增 `execution.tickAdvancePerHeldPump` / `targetStepPerHeldPumpM` / `heldPumpsWithUnchangedTarget`，判读漏步用它们。原来基于渲染帧的 `publications.executionTickAdvance` 已删除。倒退帧只算持键期；停步过冲按最后一步方向，观察窗截止到下次按住；转向后 250ms 内的朝向不计为错误。pump 模式下 `admission.movesPerHeldPump` 按构造恒为 1，不作证据。
- **pump 模式**：按住时点按另一方向、两次 pump 之间松开不再丢；触屏松开后仍按住的键带转向标志。都与 interval 对齐。

持续意图（F1）方向已拍板，见 [F1 方案](2026-10-08-movement-continuous-intent-design.md)；实现另走单据，不在本 A/B 里做。

## Windows 要做

1. **先跑探针**：本地静态服务 `Tools/movement-beat-probe.html`，用户同款浏览器前台跑完，`__probe` 结果与 checkpoint114 的 Mac 表对比。这一步只看计时器在该机器上的迟到和丢拍。
2. **四组浏览器对照**，同一现场、同机负载、前台可见：
   - 基线：`/play/?player=A&trace=movement`
   - F2：再加 `&input=pump`
   - F3：网页 Runtime 换成 `98a9f69` 构建的 Ecs DLL，沿用以往私有预览替换与身份收据流程
   - F2+F3
   
   每组：持续 W 10s × 5、起停 10 次、四向转向、贴墙、A/B 双窗口对照。导出用 `copy(JSON.stringify(__lumioMovementTrace.export()))`，或 Playwright 的 `page.evaluate`；分析用 `node games/101-bomber/Tools/movement-trace-analyze.mjs <trace.json>`。
3. **判读**：
   - `admission.movesPerHeldPump` 的 0/2 占比、`publications.executionTickAdvance` 的 0/2，看节拍乱不乱。
   - `display.backwardFrames` / `reversalEvents` / `maxBackwardM`、`stopOvershootM`、`facing.over90deg`，看用户看到的倒退、过冲和转身。
   - `timing.tickMs` / `frameIntervalMs` / `longTasks`，看主线程成本。
   - 预期：基线有倒退和过冲；F2 降低 0/2 但卡顿帧下仍有倒退；F3 活动期倒退与停步过冲为 0。不符合就以数据为准，回头修正判断。
4. **GAS 联合用例**：在带 native 的机器上对 `98a9f69` 跑 `GasJointOwner*` 和 `GasJointPredictionClockTests`。断言「新后缀立即生效 / 租期」的用例按 F3 语义逐例修订，并保留原失败输出；不能删检查来消红。
5. **交用户前台试**指标最好的一组，由用户定 F3。定了再：在 LumioGameEngine 补 movement M8 自角色表现规则 ADR → Runtime 正式 PR → 官方整包 → 前台验收。

## 之后的正解

F2 只消除输入定时器与 pump 的竞争。主线程卡顿导致的漏步（本地和服务器都真实少走），要靠 F1 解决：MoveAbility 只更新持有方向，每个逻辑 tick 按意图推进一步，对齐 Engine movement.md 与原型。F1 属玩法改动，另走策划确认和单据。F4（朝向改读玩法 Facing）只在 F3 被否决时才需要。
