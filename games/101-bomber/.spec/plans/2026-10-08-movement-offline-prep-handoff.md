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
| Game | 已合入 main（见下方 PR） | `?trace=movement` 埋点、`?input=pump` A/B 开关、`Tools/movement-trace-analyze.mjs`、`Tools/movement-beat-probe.html` |
| Runtime | `exp/101-owner-interpolation` / `d53c26b` | `OwnerHeldCadenceTests`：f69e2c9 上 RED 17/36 |
| Runtime | 同上 / `98a9f69` | F3 候选：自角色一步内滑到完成目标，不外推、不收回；Ecs Owner 64/64，GAS 联合用例未执行 |

两个开关只在 loopback 页面或开发桥生效，默认行为不变。

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
