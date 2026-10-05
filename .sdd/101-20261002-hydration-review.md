# 101 Hydration 完整批次独立审查

2026-10-02。审查对象：`C:/Work/LumioGames/LumioGameRuntime-101-hydration-complete-world` 当前工作树的 `World.Residency.cs`、`WorldManager.cs`、新增 `HydrationBatchTests.cs` 与 `docs/plans/2026-10-02-hydration-batches.md`。已按该仓 AGENTS、知识导航、架构和测试规范读取。未修改生产代码。

**结论：本次限定的完整实体集恢复顺序修复通过审查，未发现必须阻止这一切片集成的缺陷。** 这不是 Runtime 全部待办、组合候选或正式发布物的验收通过。

- `HydrateRows` 先逐行 Attach + RestorePersist，全部实体附加后再解析 Transform parent、重建 account 索引，最后按原实体/组件顺序回调。首行回调现在能访问后续行完整字段；未改快照格式、身份、生命周期开关或单记录 structural undo 接口。
- `CloneConfirmedForPrediction` 先复制全部 Sync/Persist、Observer 投影，再恢复关系、索引、水位、Tick 和 BoundSelf，最后回调；每次回调后的 `EnsureOwnerAccess` 仍在，因此回调关闭 Manager 会中断后续发布并进入既有 clone.Dispose 清理路径。源组件未作为目标存储复用。
- 新构造失败继续由 RestoreLowLevel 构造 catch 清理候选；晚回调失败测试确认候选 live entity 为 0、Manager 已释放，源快照字节不变。Clone catch 保留首异常与清理异常组合的原行为。
- 生命周期调用点在批次之后仍重复解析关系/重建 account 索引；首次已经完成，后续解析无 PendingParent、索引重建为幂等操作，不是多调用 OnHydrate。

实际证据：原 `hydration-red-02.log` 三个新增测试 3/3 失败、0 跳过（前向实体不可见）；`hydration-regression-02.log` 67/67 成功、0 失败、0 跳过。独审另外实际执行了 `dotnet test --project modules/ecs/tests/Lumio.GameRuntime.Ecs.Tests/Lumio.GameRuntime.Ecs.Tests.csproj --no-build --filter-class '*HydrationBatchTests'`，exit 0，3/3 成功、0 失败、0 跳过；日志为该 Runtime 工作树 `.run/hydration-20261002/hydration-independent-review.log`。

保留覆盖边界：新增用例直接覆盖任意跨实体引用、源隔离、重复恢复字节和晚回调抛错；没有新增“Transform parent/account 查询在 OnHydrate 内观察”“clone 回调关闭 Manager”的直接用例，后者目前由实现中保留的逐回调守卫审查支持。下一次整体组合回归宜补这两类直接断言，特别是有限 Effect 激活与 successor 关系恢复相序。

明确不宣称：既有 World 的 partition restore 失败事务回滚、旧结构 undo、Host 双切、有限 Effect/successor 组合已修复或通过；真实 Native 83f1a8 的匹配与 67 项受影响回归由主协调者构建证据覆盖，本次 3 项独审复跑本身未调用 Native。最终完整包必须按组合后的真实依赖重新构建和回归。
