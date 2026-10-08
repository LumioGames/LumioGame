# Runtime F2 周期致死与存档组合独立审查

审查对象：`C:/Work/LumioGames/LumioGameRuntime-101-finite-successor-capacity`，基线 `2ab1deeb2abd5b34cb6d722136b2225d120df97a` 上的 Root F2 改动。审查者 `capacity_resume` 没有实现该生产修复或该测试；本次只修改另一个 CapacityHarness 的预算配置。

## 裁决

F2 范围内 **SPEC PASS / QUALITY PASS**。没有发现需要退回的具体缺陷。此结论不替代容量实现的独立审查、最新 main 合流回归、Host 发布物或 101 整局验收。

## 契约与实现核对

唯一语义依据为 AFC 的 `engine/wire/effect-lifecycle-v1.json`：`production.results.rules` 规定 Period 带 owning handle 和实际 dueTick；Rejected/Obsolete 的 CrossedZero 为 false；P5 明确 CrossedZero 是结算事实，OnFx 观测和结算成功是不同语义。保存切点规定 aligned final Period 先于 expiry，冷恢复不补历史 Period、不重放已消费终结。

`EffectSettlement.DetectZeroCrossing` 从原 instant 路径提取同一 Lethal Base 正值到非正值判定，仍更新实际 Tick 的 `LastZeroCrossingTick`。`FiniteEffectSettlement` 在每次真实 Period 前捕获 Base，在 SettlePeriod 返回后计算并写入该 Period 的结果。没有合成 Apply、额外 RPC、第二份死亡状态或改变 Tick。Control/Terminal 默认 CrossedZero=false，Expired occurrence 仍为 EndTick。抽取前后的 instant 路径其余行为一致。

## 测试覆盖审查

新增 7404 Effect 的 Period 真实写入 Health Base；没有用独立 instant 代替周期伤害。测试使用真实 Native Tick、WorldSaveComponent.Save 和 ISnapshotSink：

- 最后周期前、最后周期后的两个真实保存切点分别恢复。
- 验证 Period/Applied/CrossedZero、同一 owning handle、AppliedTick/dueTick/Tick、Period 在 Terminal/Expired 前，以及 Base/Current 为零、活动行已移除。
- 前切点冷恢复经真实准入，仍在原 due Tick 发生一次周期致死；后切点冷恢复无周期或终结重放。
- Prepare→Destroy→Create→真实 7401 RestoreLifeEffect→正式 TransferSuccessorConnection→eligible Tick→真实新 route→消费 transfer result，逐步验证旧实体 tombstone、新实体不同身份、创建不能伪造 restoration witness、信用最后释放。

Root 原始 RED 日志 `f2-evidence/finite-final-red-02.log` 的失败确实为 Period.CrossedZero=false，1 fail / 0 skip；原 GREEN 1/1。

本审查者独立实际执行当前已构建版本：

| 执行 | Total | Passed | Failed | Skipped | Exit |
| --- | ---: | ---: | ---: | ---: | ---: |
| `--filter-method '*FinalPeriodicDeathSurvivesBothSaveCutsAndRequiresActualSuccessorRestoration'` | 1 | 1 | 0 | 0 | 0 |
| 完整 Replication（同样包含本例） | 193 | 193 | 0 | 0 | 0 |

日志在 Runtime 工作树 `.artifacts-capacity/capacity-resume-evidence/finite-final-independent-01.log` 与 `replication-full-01.log`；各有单独 `.exit.txt`。完整报告 XML 为 `.artifacts-capacity/bin/Lumio.GameRuntime.Replication.Tests/debug/TestResults/replication-full.xml`。独立生成 successor 21 个产物与 checked-in generated/server 逐字节一致，详见 `generator-consistency-01.json`。

Native 使用已有生产构建 `C:/Work/LumioGames/LumioGameEngine/.run/693f01ad148c0ef0f925cc4bd911c7c1/win-x64/run-KyEbZK/lumio_engine_native.dll`；这是旧 RFC ABI 的合法候选组合，不声称已接入最新 B3 main。

最终审查对象已固定于提交 `1907290daeaa12a8061a2cc0412c3065b62b8453`。之后没有修改 F2 源码；完整 ECS 另实跑 496/496，0 failed / 0 skipped / exit0（`ecs-full-02.log`）。
