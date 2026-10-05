# Bomber formal16 authority capture causal validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 验证仅在一次 `RefreshTypedAuthority` 内复用捕获缓冲能否减少分配，同时保持实际 typed authority、原预算与失败语义，随后以正式完整包验证浏览器收益。

**Architecture:** 仍由 Client 闭合完整权威组，GAS 统一刷新同一个预测 World。候选只让该次刷新中的组件顺序使用同一个 `AuthorityFields`、`SyncFieldCloneWriter` 及其两份 List；每个组件仍执行原捕获、完整复制、原逐次预留与释放。当前只完成只读调查与本计划；生产修改、测试执行和正式消费均未获本计划自动授权。

**Tech Stack:** C# / .NET 10 tests、netstandard2.1 Runtime、现有 xUnit v3/Microsoft.Testing.Platform、正式完整16 Native/WASM、原生成声明和 Client Session。

## Global Constraints

- 基准 Runtime 为 `C:/Work/LumioGames/.101-pack07/LumioGameRuntime16SuccessorPublicationRetirementComposition`，HEAD `da24b0d6a401adbcb2c1cbcda8464fcac6287d66`；不从0247诊断源或 OfflineDeath 草稿派生。
- 正式包为 `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-16`，manifest `da03566c44135860eabdc65b628c8502064e0ee7417f2df17daf50dbb2d17954`。本次只核所读源码与 manifest.sources，不重新作 whole package 资格宣称。
- 保持世界、输入、Owner/epoch、逐组闭合、GAS 的投影/覆盖/重放顺序；不跳过空 inputs 的 authority capture，不跳过未变字段，不增缓存 World。
- 不变额度、逐次 charge 数值、reserve/release 顺序及来源 Operation；不将较早 Origin 改为当前 Operation，不合并预留。
- 原 `WorldIngressBudget.Default.PredictionMaxBytes` 为 `1_048_576`。这是正常测试默认值；实际 Game 配置另按原消费保留，不能混为同一额度。
- 容器快照、类型、未知容器拒绝、容量/元素校验、silent 写回、普通 locals 过滤保持；不共享 authority 与 predicted 的可变 List/Dictionary。
- 无跨组件身份缓存、跨 refresh/group/World/Tick 池化、全局字段缓存或新预算；本候选只复用空缓冲的物理存储。
- 不修改 Client、Engine ABI、生成器、Game、共享 source pins、已封 raw、旧包、服务或浏览器。本次不执行 build/test/Native/query/诊断。
- 所有 future build/test 必须先经 Root 具体授权并错开真实静默窗，使用新 artifact/cache/output。行政失败不作行为 RED。

## 已确认机制与边界

### 调用频率

Client 正式源 `C:/Work/LumioGames/.101-pack07/LumioClient14Composition` HEAD `862f3ed231bdd0d8b9f9e953291222b2e07a67f7`，与完整16 `manifest.sources.LumioClient` 一致。

`Client/Gameplay/Session/src/Internal/ClientSession.cs:225` 的一个 owner Tick 可从 transport 取多个事件。`DrainClosedAuthorityGroups:905` 的 while 对每个闭合组分别进入 `TryApplyClosedGroup:934`，Section 与 entity 在 `PublishAuthorityGroup:963` 同一不可拆区间应用。`Client/UI/Spectator/src/RuntimeJointPrediction.cs:47` 在已有 driver 时转发 `GasJointPrediction.ApplyAuthority`；没挂 driver 时只 apply，不作此 typed refresh。

Runtime `modules/gas/src/Lumio.GameRuntime.Gas/Prediction/GasJointPrediction.cs:164` 在最外层 authority apply 成功后 `Rebuild()`。`GasJointPrediction.Selective.cs:258` 每次选择性 rebuild 都到 `RefreshJointAuthority:294`，与 `_inputs.Count` 是否为零无关。新本地输入 `GasJointPrediction.cs:96–123` 在合法入队且 publication 开放时也立即 rebuild；重复 sequence 与 closed publication 有原提前返回。重放每个受影响 input 由 `ExecuteAffected` 处理，并非每个 survivor 都另作 full capture。

所以 full refresh 的频率是**实际 rebuild 数**，不等于画面 rAF、收到的 WC 数或 UI 配置20Hz。一个长 UI Tick 可能闭合多个组，或同时处理新 input；不能只由 V9 header 到达数推断它的精确次数。

### 本候选会省什么，不会省什么

`modules/ecs/src/Lumio.GameRuntime.Ecs/Prediction/WorldManager.JointPrediction.cs:176–258` 当前每个 live source entity 的每个 generated component 都新建 `AuthorityFields`。它同时新建 scratch List、Writer、Writer 的 captured-field List，以及绑定的 reserve delegate。List 的实际 backing array 由原 `Add` 自动增长。候选预期减少这些**组件间重复对象和 backing-array 分配**，不减少实际字段数、容器项数或预算调用次数。

生成器 `tools/gen-declarations/CodeEmitter.cs:764` 的 typed `CaptureSync` 逐声明字段写 `object?` marker，value type 会经过装箱；ordinary locals 也进入 marker，但 `AuthorityFields.WritePredictionField:251` 仅准入已声明 Sync 元数据和容器。该方法分割 attribute id 并调用 metadata 的 Ordinal 字符串链。`CapturedSyncField.FieldId` 在 `SyncFieldCloneWriter.cs:76` 写回时再分割一次，生成 `WriteField` 也有字符串链。这些计算与装箱**仍存在**，本候选不能把它们的毫秒算成已消除。

`CodeEmitter.cs:734–736` 的 generated `CapturePersist` 对 `IPredictionFieldWriter` 立即 return；正式手写 Transform 也已有此 guard。`CaptureSync` 后调用它不代表重复 Persist 全遍历。正式16还已有 `ScratchCharge` 值记录（`PredictionStateLayers.cs:63–97`）；不能再声称本候选消除每 charge 的旧 class lease。

`SyncFieldCloneWriter.WriteContainer:37–54` 先预留，再取预算感知的独立 snapshot。`SyncTypes.cs:494/692` 逐项 reserve 并创建 List/Dictionary。`CopyCapturedFields` 在 `World/World.cs:1120` 使用 `silent:true`，容器再经原 `AssignFromRemote:509/710` 构 replacement、校验并写回。`PredictionStateLayers.Location<T>.ApplyAuthority:526` 对相同 authority 值有短路，但在这些捕获/替换工作之后。本候选保留这些复制和验证。

结构与类型化投影也保留：GAS 的 `Project(0)/TrimProjected`、Refresh 中的 `Project(0)` 与尾部恢复 cutoff、后续 correction/replay/publish 都不移动或删除。`CreationOrder` 扫描包括历史 dead IDs；不换成其他集合，不更改确定性与 cursor 归属。

### 原预算必须逐项保留

`AuthorityFields` 构造的 `ReserveScratch(256)` 经现有 helper 实际 charge `320`。字段头 `96 + attributeId.Length * 2` 经 `ReserveFieldScratch` 及 `ReserveScratchCharge` 两层64后为 `224 + attributeId.Length * 2`；一个32-byte typed scalar payload 同样成为 `160`。容器 snapshot 的项头/逐项 charge 原样走该 callback。结构 scratch 为 `256 + PredictionAuthorityIds.Count * 64` 再加原64。这里是源码推导，不是新的预算值或实际 browser 计数。

`PredictionStateLayers.ReserveScratch(List):65` **在 reserve callback 返回后**取 origin；`ReleaseScratch:82` 在调用 release callback 前推进 cursor，并保持 foreach fail-fast 和 throwing/reentrant 行为。候选不改此文件。不能以 Clear/re-init 抹掉剩余未释放 charge，不能异常后多次尝试新释放而掩盖原异常。

缓冲 capacity 在一个 refresh 内从大组件延续到小组件，是必须核清的所有权边界。Engine `gas.md:379` 明确预算计数不是 CLR heap 总量，但该事实并不自动授权任意不计账缓存。测试需要记录缓冲 high-water、空 List 不再持有字段/容器引用、与原临时 allocation 范围的关系；若原 charge 模型不足以覆盖这段短期存储复用，应拒绝这个 exact 候选，而非加 quota 或隐藏另一笔账。

## 已有实际证据，不能重标

历史15诊断解析报告：`C:/Work/LumioGames/LumioGame/.sdd/101-20261004-real-game15-authority-capture-cost-analysis.md`；原39cuts manifest `C:/Work/LumioGames/LumioGame/.run/browser-authority-capture-scene15-01/browser-freeze-root-01/manifest.json` SHA `e7869718d2cd7a161c62986ad16155e5f09a6b867cb3fd53f508e93b387e22b6`。

该历史 B Running quiet 六个 sampled refresh 的 mean 为 refresh52.867ms、generatedCapture29.617ms、fieldSink21.500ms、accounting7.067ms、copyFields19.000ms、writeDispatch13.117ms。capture 包含 sink/accounting，copy 包含 dispatch；八桶均 inclusive，不能相加或差分作独占归因。每样本 fieldSink2330–2770、writeDispatch2463–2976、accounting5209–6296；不是 JSON 次数，也不是本次正式16的实例 census。手写 builtin 的普通 writer 方法不在 marker sink 桶，不能由 sink 与 dispatch 差值推丢字段。

探针每样本 clock_calls82,208–99,088、clock-pair mean11.850ms、partial bookkeeping mean13.367ms，互有重叠且不是完整总成本；第二行日志成本未测。on/off不同 phase、生命、World 工作量与其他 DS 负荷；不得把 on 成本净减为普通Runtime，也不得从 Native<1ms 推 managed 独占。

本次 Game17 普通正式16 Runtime 的新 Running 窗短报告：`C:/Work/LumioGames/LumioGame/.run/live17-experience-analysis-01/quiet-running-report-01.md` SHA `0bae0a43b87a980a913f766eb49d157d39f3fe292b1f0cd5ca98b4a08f4cf943`。实际 Match3 有死亡/复活：A/B Tick p50为18.9/19.7ms、p95为59.9/65.1ms、max424.1/207.9ms；此窗口没有上述 Runtime 桶和实例计数，因此尚不能把这些长 Tick 归于每组件缓冲。

## 候选文件与责任

仅在将来经 Root 授权的新 Runtime worktree（建议 `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeAuthorityCaptureBufferReuse`，先确认不存在）从 `da24b0d6` 开始。

- 生产候选：`modules/ecs/src/Lumio.GameRuntime.Ecs/Prediction/WorldManager.JointPrediction.cs`。只在 `RefreshTypedAuthority` 的一次调用内懒建/reuse `AuthorityFields`，metadata 每组件重绑；原 per-component using/finally 生存边界保留。
- 生产候选：`modules/ecs/src/Lumio.GameRuntime.Ecs/Prediction/SyncFieldCloneWriter.cs`。加 internal 清空 captured fields 的能力；不改 public writer、field/value、snapshot 与 reserve 路径。
- 测试候选：`modules/ecs/tests/Lumio.GameRuntime.Ecs.Tests/AuthorityCaptureScratchTests.cs`。保留原所有测试与默认 Harness；新增独立多组件测试 helper，验证实际 `RefreshJointAuthority`，避免复制另一套 refresh 实现。normal World binding 必须沿 `WorldTickTestBinding.StartBound` 与原 Native test lease。
- 相关真实生成形状/Native回归只运行原 `modules/gas/tests/Lumio.GameRuntime.Gas.Tests/GasJointGeneratedShapeTests.cs` 和明确邻案；不修改其 fixture、项目、生成物来迎合候选。
- 本轮不选 `CodeEmitter.cs` 字符串 switch、fieldId 缓存、同步值 cache、projection 合并或 streaming 写回；它们应在本候选失效后重新因果调查，不能叠加。

## Task 1: 锁定测试资格及原语义控制

- [ ] Root 批准执行后，新建隔离 source 与短独立 NuGet/Artifact 路径；冻结上述三个 before source、normal构建输入和 Runtime/Engine HEAD，零生产 diff。
- [ ] 在新增测试中使用至少两种组件的实际 marker 路径：相同 field 名但 metadata 不同、Sync None 与普通 local、uint/ulong/NetEntityId、空与非空 List/Dictionary；含手写普通 writer builtin。原 `Probe.CaptureSync` 使用直接 `WriteInt32/WriteContainer`，**不能单靠原 Probe 声称 marker 元数据切换已测**。
- [ ] 原 source 先跑 semantic controls，确认多组件全部 typed 输出、silent hook、可变容器隔离及 local 排除成立。新 control 如果前置或代码错误，保留为 fixture/admin failure；不得把它计作性能 RED。
- [ ] 记录每个组件的 reserve/release 原序列、peak、最终 Used 和跨 Operation origin；从大组件（高 field/container charge 数）切到小组件及下一次 refresh。原原子失败恢复与暂停逻辑不能只检查最终 Used=0。
- [ ] 无 inputs、一个原合法未确认 input、authority覆盖/纠正三个阶段使用原 GAS 生成形状 fixture；不省 ACK/Native correction，不构造 shadow replay。

## Task 2: 建立有意义的分配 RED，仍不改生产

- [ ] 扩充上述正常 helper 的多组件情形：使用相同字段/值、固定组件数、原默认1MiB。先 warm up，再取 `GC.GetAllocatedBytesForCurrentThread` 的 actual Refresh 分配，关闭测试用账簿记录造成的分配（现有 `MeasureDenseCaptureAllocation:177` 已有 RecordCalls=false 先例）。无 stopwatch 通过门槛。
- [ ] 分别冻结一组件、多组件、连续两 refresh 的正常原 source 数值及全部 typed 输出。`1024` 容器项的旧 observation 不单独证明 writer 固定开销；新样本需要把同值容器复制保持为配对的共同工作。
- [ ] 根据实际 baseline 与可消除的组件级对象/backing-array 范围，给出明确分配目标，由 Root 审核再钉测试上限。没有采到数字前不填一个任意百分比或 bytes 魔数；若无法可靠建立分配 RED，停止称其性能修复，只报告该候选未获证。
- [ ] 新 allocation test 在纯 da24 跑到实际输出与预算 controls 后因目标失败，保存 source/rawExit/result/full normal bin+Content；不得把安装/路径/Native缺失当 RED。CoreCLR分配目标只属于这项正常 harness，不是 browser milliseconds 或真实 Game heap 上限。

## Task 3: 最小复用实现（需 Task2 后 Root 再授权）

- [ ] 第一个 generated component 仍先原 `ReserveScratch(256)` 后建 Writer；无 generated component 的 refresh 不额外建共享 writer。后续组件仅在上一组件 release 完整成功后进入新的 capture lease。
- [ ] 每组件先设置该 source 的 metadata，再执行原 `ReserveScratch(256)`、CaptureSync、CapturePersist、CopyCapturedFields，所有 callback/字段次序原样。Writer reserve delegate仍绑定同一个本次refresh state；它不得记住上一 Operation。
- [ ] 每组件结束调用原 `ReleaseScratch`；它成功完成后才清空 Writer.Fields、metadata并允许 reuse。Copy前不得清空；release throwing/reentrant 时不得重置 `_released` 或 scratch List、不得继续后组件、不得由新增 outer Dispose 自动补一次 release。原 foreach/cursor异常路径必须保持。
- [ ] 生命周期止于该次 Refresh返回/抛出；不挂到 WorldManager field、GAS driver、ThreadStatic、跨组或池。Clear移除引用但保留 capacity；high-water范围与费用论证提交非作者，未收口则拒候选。
- [ ] 保持 `PredictionStateLayers.cs`、`World.CopyCapturedFields`、GAS文件、CodeEmitter及所有 guard 逐字不变；检查 exact scope 和 inverse。

## Task 4: 同源 GREEN 与原边界

- [ ] NEW正常构建、同源码 allocation case 及 semantic controls，原上限通过且全部 typed/copy/ledger输出配对一致。不存在语义 RED 时如实称 allocation RED→GREEN。
- [ ] 扩展 `EveryActualCaptureReservationRefusalRestoresTheOperationAndItsCharges` 的多组件实例，按实际 reserve calls **每个边界**拒绝；确保先前组件已完成copy后的事务回滚、原应用旗标/cutoff、未来retry输出均原样，0未释放charge不取代state验证。
- [ ] 原 `CaptureChargesRetainTheirIndividualOriginsAcrossOperationRollback`、`CaptureOriginIsReadAfterTheReserveCallbackChangesTheOperation`、`ThrowingReleaseIsNotRepeatedAndRemainingChargesCanStillBeReleased` 都必须实际执行。另加真正 callback重入同捕获 owner 的一次对照，期望按 baseline 实际异常/顺序确定；不人为期待旧版本本来没有的成功。
- [ ] 原 `RealNativeGeneratedShapeUndoKeepsEarlierInputAndVoxelState` 全部16形状及正常 authority/unavailable controls实际Native不skip；邻案为 `ReceiptAndUnchangedAuthorityMayArriveInEitherOrder`、`PublicationIsPendingAcrossAuthorityAndOldGenerationCannotReplay`、`FrameworkMutationBudgetRefusesWithoutLosingPriorStateAndResumes`。仅有新风险才扩，不跑无关全矩阵。
- [ ] 正常 ECS和GAS tests project 用其原 references/Content；不跨编译私有 fixture源。`dotnet build ... -c Release -m:1 -p:ArtifactsPath=<本新绝对路径>` 后从其实际测试 DLL运行 `--filter-method`/`--minimum-expected-tests`；应用退出与外层工具退出分别记。必要正常 artifact必须含 Fixtures，不能只拷DLL/PDB后宣称可执行。
- [ ] Native 明确用完整16 `server/win-x64/SDK/Native/win-x64/lumio_engine_native.dll`，SHA `2cd9cebf1e61ae7c21c719163c8d3dcfa81f07d4d78f5642059f12672cb5ac17` 与 sidecar；Engine根仍523c。不重建Native、不替换发行包DLL。

## Task 5: 独审和实际浏览器因果验证

- [ ] 封精确两个生产文件+最少测试的 before/after、真实 allocation RED/GREEN及预算/输出对照，交非作者。只通过这些不能宣称当前 Game 卡顿根因闭合。
- [ ] 独审通过且 Root显式提交后，Root沿官方完整包构建统一消费（不是私有DLL替换），正常Game三侧/UI/publish和实际closure资格；GEN/pins若发生真实漂移则独立复审，不直接换hash。
- [ ] Root使用2独立human+6真实Bot、原20Hz/voxel/fullfeatures，在 Running阶段 quiet/input各连续至少15s。使用 bounded V9 observer/defaultoff；测实际 Tick、postTick residual、完成 drawCPU、wire到达组进度与自己的coverage/分母，保持observer成本、不净减Native。
- [ ] 比较相同生命/阶段与权威负载区间，死亡/复活/reattach单列；需要实际 refresh次数与组件/字段工作量资格才能归因“每次刷新减少分配”。若缺这些资格，仅作外层体验改善观察，不报净收益百分比。
- [ ] 双向走路/同房间放弹/十次真正close-newpage仍由Root实际操作验收，CoreCLR allocation测试和 packet header时序都不替代体验。

## 当前状态与停止条件

本次已完成只读源码和既有证据核对，以及本计划。没有新 test/source、build、Native、World查询、diagnostic、包或服务操作。候选仍待 Root 审计划和明确授权；buffer费用/失败语义不成立、实际 allocation不获证或浏览器对照无收益时，保留 raw 并退回因果调查，不能扩大到跨Tick cache、跳capture或放宽预算。
