# 101 浏览器正式 Tick 成本：只读调查

日期：2026-10-04，调查者 reentry_trace。范围为 Game 浏览器 Tick 到正式 Client、Runtime、Engine WASM 的调用链。未改生产源码、SDK、完整包、DLL、source pins、玩家数量、体素、预测、Tick 频率或校验；未启动、关闭或重启服务。本文是调查记录，不是体验验收或生产修改裁决。

## 当前结论与测量边界

Root 保存的原八人 Running 基线中，A/B 的 Tick 均值为 36.7/37.4ms。该数据来源是 `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/browser-experience-repair-01/baseline-A.json` 和 `baseline-B.json`，也已记入已有[预测接缝调查](C:/Work/LumioGames/LumioGame/.sdd/101-20261004-browser-prediction-readonly-report.md)。本调查不重复 Game 的移动预测、确认世界渲染及输入 schema 现状。

源码能够证明：已绑定 joint prediction 后，每个闭合权威组和每条新接纳的本地输入都会触发一次实际 selective rebuild；rebuild 即使没有 pending input，也会刷新整个 ECS 权威投影、收集表现键并完成 Native 发布。源码不能证明这些步骤就是 37ms 的主要成本。正常 delta 路径没有发现整份 ECS 快照编码/恢复或整份 Native voxel capture/restore；这里的 field capture、ingress snapshot 和 Native prediction begin 分别是字段复制、入站消息冻结和预测更新窗口，不能混称为 full-world snapshot。

静态调查封存后，Root交回正式完整包08 live-06 的raw，已在本文末尾独立分析。随后确认其仪器保留大对象并每500ms整历史JSON到DOM的重大观测扰动；不能用live-06多百ms停顿裁决引擎根因。以下成本排序仍为待验证假说，等待紧凑v3仪器与未加仪器正式页对照。所有真实性能结论应绑定实际运行包、浏览器页、采样窗口、主/后台状态、初始接入/稳定 delta/输入期及相同八人负载。

## 来源身份和所属边界

已按顺序读取父仓入口与导航、101入口/交接；本轮重新读取下列 exact07 所属仓 `.spec/AGENTS.md`、`.spec/knowledge/README.md` 和 repository-architecture。源码均只读，Git status 未显示改动。

| 所属源码 | 路径 | HEAD |
|---|---|---|
| Runtime ECS、GAS、Tick语义 | `C:/Work/LumioGames/.101-pack07/LumioGameRuntime` | `d8ae3da3793d5d95785606be319668a4318af85a` |
| Client Session、Replica、WASM适配 | `C:/Work/LumioGames/.101-pack07/LumioClient` | `a6071a2a28c3cfda78400254654d6da1fef25b92` |
| NativeCore kernel/clock/spatial | `C:/Work/LumioGames/.101-pack07/LumioNativeCore` | `81b2501a621db2657bd087db2afa808ecfb9e846` |
| Voxel prediction/storage | `C:/Work/LumioGames/.101-pack07/LumioVoxelEngine` | `2ba61e431d8080ff6450a07e6ee447e3f0994e0b` |

NativeCore 不拥有 VoxelWorld 或 prediction 日志语义；对应 Native 原语在 VoxelEngine，跨语言 ABI 与插头的唯一真值在 Engine。若最终测量要求生产修复，必须在准确所属仓的新干净工作树先做根因 RED，再最小实现和正式回归，最后通过官方完整包消费。本文没有授权修改现存冻结根，也没有把 Server 重进修复通过扩大为 Client 性能通过。

## 准确调用链

以下 `Client/` 路径均相对上表 exact07 Client 根，`modules/` 均相对 exact07 Runtime 根。

1. Game [SpectatorReplicaHost.cs:105](C:/Work/LumioGames/LumioGame/games/101-bomber/Client/UI/Spectator/SpectatorReplicaHost.cs:105) 读取轻量 Session snapshot，然后执行 `_session.Tick(ownerTick+1)`。Game 的 `SessionState`、`PlayerState`、`PresentationState`、`ReadBox` 是独立导出调用，不能把其序列化/读取算成单个 C# Tick 内部成本。
2. [ClientSession.cs:225](C:/Work/LumioGames/.101-pack07/LumioClient/Client/Gameplay/Session/src/Internal/ClientSession.cs:225) 在 owner lock 下推进收包、分片、生命周期、闭合权威组、异步 transaction 完成/期限、joint attach 和出站。`DrainClosedAuthorityGroups` 在905行循环处理所有已闭合组，因此一个页面 Tick 可以处理零个、一个或多个权威组。页 Tick 数与 authority group 数不能等同。
3. [ClientSession.cs:934](C:/Work/LumioGames/.101-pack07/LumioClient/Client/Gameplay/Session/src/Internal/ClientSession.cs:934) 对一个闭合组执行 `_dependencies.JointPrediction.PublishAuthorityGroup(manager, apply)`：同一发布窗口中先正式 Section delivery，然后 ECS authority transaction。FullSnapshot 时先 retire 旧 driver，并按需重建拥有 Native voxel resources 的 manager；新 driver 在 baseline 完成后 attach。`PrepareFullSnapshotWorld` 标记会被后续应用复用，已有机制避免同一 FullSnapshot 重建两次。
4. [RuntimeJointPrediction.cs](C:/Work/LumioGames/.101-pack07/LumioClient/Client/UI/Spectator/src/RuntimeJointPrediction.cs) 是接线器；已 attach 同 manager 时 no-op。authority 时委托 `GasJointPrediction.ApplyAuthority`；它自己没有每页 Tick 循环。
5. [ReplicaWorld.cs:604](C:/Work/LumioGames/.101-pack07/LumioClient/Client/Gameplay/ECS/src/Public/ReplicaWorld.cs:604) `ApplyPack` 将已经正式解码的 WorldChange 入站到唯一 `WorldManager`，调用 `Manager.Tick`，读取对应 `WorldChangeApplyResult`。Delta 在现有 manager 上应用；仅 FullSnapshot、session replacement 等生命周期路径创建替换 manager。
6. Runtime [WorldManager.cs:1384](C:/Work/LumioGames/.101-pack07/LumioGameRuntime/modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.cs:1384) 验证 tracked WorldChange、应用权威字段、绑定 pending welcome，再调用 `TryRebuildPredictedWorld`。已绑定 joint 时路由到 driver，而非普通 clone fallback。
7. [GasJointPrediction.cs:164](C:/Work/LumioGames/.101-pack07/LumioGameRuntime/modules/gas/src/Lumio.GameRuntime.Gas/Prediction/GasJointPrediction.cs:164) `ApplyAuthority` 先 Native Begin，置 `_applyingAuthority`，执行闭合组，退出最外层窗口后实际 Rebuild。内层 `Manager.Tick → driver.Rebuild` 的 `RebuildSelective` 在 `_applyingAuthority` 为true时直接返回（Selective:262）；外层才执行完整重建。不能把这两次方法进入称为两次全重建。
8. [GasJointPrediction.Selective.cs:258](C:/Work/LumioGames/.101-pack07/LumioGameRuntime/modules/gas/src/Lumio.GameRuntime.Gas/Prediction/GasJointPrediction.Selective.cs:258) 清理已覆盖输入/Native keys，Project(0)/TrimProjected，刷新 ECS authority，检查幸存输入 typed/native witness，纠正失效记录，只重演 affected/未执行且已可用输入，最终 Project 和 PrepareJointPublication/Native Complete。
9. Client [ClientSession.cs:1324](C:/Work/LumioGames/.101-pack07/LumioClient/Client/Gameplay/Session/src/Internal/ClientSession.cs:1324) 出站为每条正式 input 编码、进入 Client 未确认账本，继而 `Manager.EnqueueLocalInput`。joint driver 接纳一条新 input 后同步 `Rebuild`；同 Tick 多条新 input 可以造成多次完整 authority refresh。之后通过正式连接发送，并未另造输入世界。

## 每类边界实际做什么

| 边界 | 实际操作 | 不应混淆的名称/待测量项 |
|---|---|---|
| 无入站组、无新输入的 Active 页 Tick | Session收包/parts poll/状态/attach guard、已存在账本和出站扫描 | 没有无条件 `WorldManager.Tick` 或 joint rebuild；具体 transport/state work 需计时 |
| 每个 authority group | 多层合法 decode/bytes isolation；WorldChange ingress冻结；Runtime Tick+逐字段应用；joint authority refresh+publication | group数量必须单独记；Section部分是否存在要单独记 |
| 每条新输入 admission | 编码/指纹/有限消息冻结；一次 selective rebuild；当前 authoritative ECS 全刷新；一次新的输入执行 | `WorldIngressSnapshot.Capture(input)`只复制commands/payload/metadata，不复制整世界 |
| 每个仍 pending input 的 rebuild检查 | typed invalid witness、native read/write/physical witness，affected传播，等待可用性判断 | 已执行且未 affected 的 input 不重演；pending数不等于重演次数 |
| affected/未执行输入 | typed layer Project，输入 undo journal/局部框架状态捕获；ApplyInput/commands/settlement；预测写/物理查询跨Native | selective state与局部journal，不是每条input重新建完整World |
| FullSnapshot / joint attach | 替换manager/voxel世界、正式Section初始化、一次确认ECS clone/OnHydrate、打开Native session | 初始/重进一次性成本必须和稳定delta分开 |
| 独立 UI导出/渲染 | SessionState等JSON、ReadBox C#↔JS字节桥、JSON cells，Native mesher/ReadBox | 不属于同一Tick调用的operation不能累计归入Tick |

## ECS 全扫描、typed capture 与序列化

确认最值得测量的托管边界是 [WorldManager.JointPrediction.cs:176](C:/Work/LumioGames/.101-pack07/LumioGameRuntime/modules/ecs/src/Lumio.GameRuntime.Ecs/Prediction/WorldManager.JointPrediction.cs:176) `RefreshTypedAuthority`。它不是仅遍历本次 dirty fields：先 Project(0)，扫描上次 authority IDs 处理消失实体，然后遍历当前 `World.CreationOrder` 的每个存在 record/每个 component，执行 Generated `CaptureSync` 和 `CapturePersist`，再 `CopyCapturedFields` 写到预测投影；还同步 observer projection、allocator、Tick、parents、terminated IDs，并 Project(old cutoff)/RebuildAccountIndex。scalar/typed比较已在 `PredictionStateLayers.Location.ApplyAuthority` 有相等早退（484行）；但是 collector及遍历先发生，不能据此声称完整刷新已消除。

[SyncFieldCloneWriter.cs:37](C:/Work/LumioGames/.101-pack07/LumioGameRuntime/modules/ecs/src/Lumio.GameRuntime.Ecs/Prediction/SyncFieldCloneWriter.cs:37) 对有budget的同步容器调用 `IPredictionSnapshotContainer.CapturePredictionSnapshot`。`SyncList`复制List，`SyncDict`复制Dictionary（[SyncTypes.cs:493](C:/Work/LumioGames/.101-pack07/LumioGameRuntime/modules/ecs/src/Lumio.GameRuntime.Ecs/Sync/SyncTypes.cs:493)、692）；这覆盖当前 authority字段内容而非整个Native状态。`PredictionStateLayers.Project`遍历全部已注册locations并克隆可见值（214、512行）；`TrimProjected`移除无layers/observations schema，再压缩账本（220行）。两者实际location数、字段数、container元素数和分配字节尚未测量，不能用源码行数估计毫秒。

Authority本身还有重复工作的候选：`ReplicaWorld.TryValidateAuthority`正式DecodePack；`RuntimeReplicaPlanAdapter.TryValidate`再DecodePack；`ClientReplica.ObserveRuntimeOutcome`再解码owned update；`AuthorityUpdateOrchestrator.TryReadAppliedInputSequence`再解码读取ack。配置了RPC preflight时它也会正式解码；Game本次host没有看到设置RPC preflight。stage ledger、隔离mapper参数、applyPlan与orchestrator plan都复制owned字节，以防caller/mapper保留或改写。这些是信任、代次、容量与一致性边界，不能直接删除其中一层检查。

Runtime [WorldIngressSnapshot.cs:46](C:/Work/LumioGames/.101-pack07/LumioGameRuntime/modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldIngressSnapshot.cs:46) 冻结WorldChange的creates/fields/RPC values，并在138行通过正式EncodePack计算线性消息账本字节。随后 [WorldManager.cs:2311](C:/Work/LumioGames/.101-pack07/LumioGameRuntime/modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.cs:2311) 指纹再次EncodePack+SHA256。其对象/JSON成本应测量，不能把“入站snapshot”误写为WorldSnapshotCodec。

## Native / FFI / JSON 的精确区分

- [EngineWasmCall.cs:56](C:/Work/LumioGames/.101-pack07/LumioClient/Client/Engine/Wasm/EngineWasmCall.cs:56) 每个Native调用新建MemoryStream/BinaryWriter，写args/buffers/relocations，ToArray，经JSImport传给JS，然后拷贝response各buffer。POD写/读取用临时Marshal内存和byte copies。这条桥是二进制packet，**没有每次Native调用JSON或Base64**。
- 已发布07 [engine-wasm.mjs:12](C:/Work/LumioGames/LumioGame/games/101-bomber/.run/two-player-schema15-preview-01/browser-publish/wwwroot/engine-wasm.mjs:12) 从packet切片、逐buffer在Rust memory分配/拷贝、改指针relocation、调用正式export，再把所有buffers拼成返回Uint8Array，finally逐bufferfree。JS `engineInvoke`包围时长包含JS封包/Rust工作，但不包括此前C# `EngineWasmCall`构建/Marshal及返回后的C# decode/copy。
- [EngineWasmPrediction.cs:43](C:/Work/LumioGames/.101-pack07/LumioClient/Client/Engine/Wasm/EngineWasmPrediction.cs:43) Begin/Complete各一次桥；有writes/keys/查询时另外Stage、ReleaseCovered、Correct、ReadSelected/SweepSelected等。选择性查询仍持有原正式native session、同一物理算法；没有Native whole-world restore。
- Voxel原语 [operations.rs:7](C:/Work/LumioGames/.101-pack07/LumioVoxelEngine/crates/lumio-voxel-world/src/prediction/operations.rs:7) Begin验证session并开token；Complete在173行验证retained-record drift、增加publicationversion、关闭token和返回账本进度。其 `drift` 只遍历本session block/binding记录所涉及的section（storage:206）。Begin没有clone/capture全体素，Complete没有restore全体素；空记录时日志校验loop为空，仍有ABI/bridge与发布边界。
- `EngineWasmPlatform.Clock`绑定EngineWasmCore。正常Runtime Tick的 `TickExecutionContext.CheckpointCore` 会读Native `clock_now`；13阶段runner有入口/各phase/cooperative progress检查，即使phase sampler关闭仍有多次clock桥。不能关闭timeout/cooperative额度校验来优化；先测clock调用数和总占比。
- Runtime `CaptureSnapshotHashMetrics` 在 [WorldManager.cs:462](C:/Work/LumioGames/.101-pack07/LumioGameRuntime/modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.cs:462) 是空方法。名称不能证明每Tick有整世界hash/capture。生产Tick也不为状态证据Base64编码（IBase64Encoder接口注释）。Native `voxel_restore`仅在新world options显式带snapshot时调用；普通浏览器delta不经过它。

## 已存在的合法去重，以及尚未实现的候选

已有行为：

1. 同manager joint attach只执行一次；FullSnapshot Sections与entity共享一个replacement manager和一个authority publication interval。
2. Runtime WorldChange exact fingerprint duplicate会在实际字段应用前 `DuplicateIgnored`，并拒绝tick/appliedInputSequence回退。Client metadata也有duplicate/gap判断。不过外层`Gas.ApplyAuthority`已在duplicate裁决前开窗口，不能据此宣称duplicate权威组零prediction成本。
3. 已覆盖input、相同已接纳input（含完整相同fingerprint）在入站前返回；变体输入必须拒绝。pending input只有未执行或affected且可用时才执行，未受影响幸存输入不全量replay。
4. `ObserveRuntimePredictionFaces`在ClientSession:1679比较immutable发表集合引用；sameTrace在1698比较值快照。重复读同一次发布不会重复复制Delta/Trace。这里的guard不跳过Runtime实际authority refresh。
5. `Location.ApplyAuthority`相等早退、selective native retained keys/correction/witness和typed层按影响保留，已避免每个pendinginput整世界重建。

待实测后才可立项的候选：

- **Runtime authority refresh**：新input没有新authority/covered变化时仍全刷新。可调查按已验证authority版本/coverage、结构、self/generation、配置、Section与closed-publication语义建立有效性依据，减少重复投影。需要真实RED证明相同输入结果/Native记录/receipt与publication仍原子；不能单凭World.Tick相同、pending count=0或输入payload为空直接跳过。
- **无pendinginput authority**：现代码仍全authority projection和publication。轻量路径只有在所有confirmed/predicted读取、Tick、表现键delta、覆盖释放、Native窗口与基线语义都一致时才合法。直接return或停用joint会留下陈旧投影/开放窗口，不是修复。
- **Client多次解码**：owned bytes+profile+generation+ledger identity中缓存一次正式decoded immutable WorldChange，保留每个独立校验及budget/mapper防改写/receipt语义，可能避免重复JSON parse。这是Client/Runtime所属修复候选，不允许复用未owned或可变caller/mapper对象。
- **Bridge分配**：真实Native耗时若占比高，再测packet构建/JSImport/Rust memory allocation及结果回拷；优化必须保留全部pointer relocation/ABI validation/ownership和错误输出。不得用少调用校验、改变预算或绕过正式provider获得快帧。

这些候选没有修改生产，也没有性能RED。本轮不能声称某个候选已经是根因，更不能以静态调查替代官方完整包/八人浏览器回归。

## 真实计时的下一步和判据

Root被动JS profiler只记录operation名、count、耗时，不记录payload或凭据。初版instrument脚本将每op durations限制600条但count累计；需避免把全窗累计count和末600样本之和相除，也不能把ReadBox/renderer等独立导出Native工作误归入C# Tick。已提醒Root添加每条op的at/end和所属导出标签，或每次同步Tick前后native count/ms差。若未加边界，数据只支持该op尾窗分布和全窗口调用次数，不支持严谨managed/native分解。

必须在同一稳定窗口收集：每C# Tick耗时、收包/闭合group数、authority推进数、新输入数、outstanding输入数；每Tick Native operation counts和sum、mean/p95/p99，包含clock、prediction begin/complete、section delivery、spatial、HFSM、ReadBox；managed phase（解码/入站冻结/Manager.Tick/authority field apply/RefreshTypedAuthority/Project/Trim/PrepareJointPublication/InputExecute）及分配量。Native耗时少只能排除该JS桥窗内Rust/JS作为主要成本，剩余还包含C# bridge组包/GC/调度及未覆盖代码，不能直接证明ECS。

现有合法instrument面：WorldTickBinding绑定时可接入 `ITickPhaseSampleSink`；ClientSession drain sample包含drained/queue/runtimeCalls/replicaStages等；GasJointPrediction已有InputExecutions/Replays/NativeStageAttempts/CorrectionCalls/Discarded/TraceVisits/RetainedBytes，且有有限Execution/Causal telemetry。这些不能单独覆盖authority全字段刷新，因此若Native占比低，需要所属Runtime/Client隔离源的正常Stopwatch/Logger精确包围上述managed边界。遥测身份/时间不进入权威world/hash；捕获不得产生影子Gameplay状态。

体验门仍由Root在最终正式包/正式Game构建上验证两独立玩家同房间、双向移动放弹及至少10次真实tab关闭新建重进。本文没有关闭该门，也未关闭旧Platform gameReleaseId和产品身份差异。

## 关键来源字节封存

以下SHA256仅证明本报告读取来源；不是schema source pins更新或review通过。

| 文件（完整路径见上文） | SHA256 |
|---|---|
| Game SpectatorReplicaHost.cs | `e46d2970012e2980fd5cf74aa80803affcaefff59fae26dba3b38da750973b03` |
| exact07 ClientSession.cs | `4e4dd0c79c67262d41827ed53842327a7a5d858c31f51c01127c080b01506aa5` |
| exact07 RuntimeJointPrediction.cs | `a4c553d40cd43c2e945bd3dff3cfe05be43907bc381bbfe35116efa16a594029` |
| exact07 EngineWasmCall.cs | `ce0fb373f975748b60bba669fe6e44e7415ffa56d914810538d4418ebe49ffec` |
| exact07 GasJointPrediction.Selective.cs | `e0eb26fabf09923e99e8812011455c94355216ec2c8c26596beb2a952ae8224e` |
| exact07 WorldManager.JointPrediction.cs | `53139d06078bef95c61a22fdeb6011640bed85465793f226b3f296b881caa8a3` |

## 正式08 live-06 raw 追加调查：有仪器扰动，不能裁决引擎成本

读取同目录四份raw：`C:/Work/LumioGames/LumioGame/games/101-bomber/.run/browser-experience-repair-01/live-06/` 的 `performance-A.json`、`performance-B.json`、`first-input-A.json`、`first-input-B.json`。后两份是前两份的早期历史截取，不能相加当四个独立窗口。原文件完全保留，独立派生数据为该目录 `performance-analysis-reentry.json` 和 `performance-analysis-reentry-timing.json`。无凭据读取或输出。

核验08 manifest sources：Runtime、Client、NativeCore、Voxel仍为上表exact07身份；Server正式新commit为`15418fc104a97fc30f7de45fd0f0c7c93309777c`。live-06验证记录列6 Bot+2player；其SERVING只作进程/配置来源，不作为体验通过。A/B记录均只有visible状态，faults为空；这不证明资源、同步或帧率通过。

### 测量仪器自身的重大扰动

当前raw对应私有 [measured08b main.js:5](C:/Work/LumioGames/LumioGame/games/101-bomber/.run/browser-experience-repair-01/measured08b-wwwroot/main.js:5)，hash `a757d40fa5fb464c518e43c7b3b8fe1eadd4924a7c62198ab0341c991744cecd`，与保留identity JSON一致。它每Tick把完整PresentationState结果再次JSON.parse并存进600条history（20行），pose/state也保留大对象，并且每500ms把**全部**browserProbe JSON.stringify后写DOM（46–53行）。performance-A为34,392,022bytes，B35,345,544bytes；该仪器虽然条数有限，体积并不轻。Root也观察到后续B历史达到67MB。

由此不能把live-06的百毫秒停顿、晚窗均值或managed剩余时间全归于Runtime。DOM整历史序列化发生在同步Tick外，但浏览器共享CPU、内存、调度/GC等扰动可影响后续Tick与组堆积。Probe原包装是同步`invoke.apply`，不是await Promise；Native在该同一同步Tick内确实计数。不能因此排除观测扰动。旧07的约120KB最小probe基线仍独立保留，37ms均值不被这里的新instrument替代。

### 原raw自身记录的事实（均含仪器影响）

| 指标 | performance-A | performance-B |
|---|---:|---:|
| 保留同步Tick数量 | 330 | 333 |
| Tick mean / p50 / p95 / max ms | 56.66 / 28.7 / 254.8 / 874.5 | 57.64 / 34.4 / 208.0 / 549.4 |
| 同Tick Native JS桥窗 mean / p95 / max ms | 0.692 / 2.40 / 12.30 | 0.714 / 2.50 / 14.00 |
| Native JS桥窗sum ÷同步Tick sum | 1.220% | 1.239% |
| Tick开始gap mean / p95 / max ms | 113.14 / 395.8 / 1571.7 | 114.77 / 324.2 / 946.9 |
| prediction Begin总数 / 同Tick最高 | 722 / 22 | 757 / 17 |
| 单Begin Tick数量 / duration p50 ms | 145 / 19.2 | 131 / 19.6 |
| 两Begin Tick数量 / duration p50 ms | 97 / 43.0 | 90 / 41.6 |
| 无Begin且无clock Tick数量 / mean ms | 26 / 0.308 | 31 / 0.316 |

Native值不是“永远小于3ms”：尾部大部分小，但初始与替换世界有12–14ms离群值。Native JS桥窗占比小只覆盖Rust调用与JS packet桥；C#组包/Marshal/返回解析仍在其外，不能把98.8%直接标为ECS或SHA。

以`clock_now == 29 × Begin`、无voxel_world_create、Self一致、前后authorityTick正数的稳定tick为筛选条件，将最近Tick结束后的PlayerState与之前state匹配：A291/291、B289/289的`authorityTick推进数 == Begin数`。典型1→2→10组duration上升和58→290个clock，支持“当前同步Tick按顺序应用积压的每个权威组，通常每组各发布一次”。初始、FullSnapshot/新Self、new-input-only更新不符合估计条件，不能把所有Begin机械等同authority组。此记录未看到每正常权威组两次Native Complete，不能声称常规joint双全重建。

最后10秒A71ticks：duration mean64.23/p95278.6ms，Begin mean2.56/max14；B72ticks：mean68.14/p95210.3ms，Begin mean2.93/max17。它们是在有扰动仪器窗口中观察到的积压，不能当纯Engine后半局退化基准。

### 输入和确认记录

按input/发送记录顺序配对，再在发送之后匹配**相同observedSelf**且appliedInputSequence达到该sequence的首个PlayerState；不能跨死亡/新Self把归零sequence当未确认。全部10条找到匹配ack。A用户Move两次：accept→send 59.4/274.5ms，send→首观测ack255.0/666.6ms；B143.8/261.0ms、539.7/734.4ms。A放弹两边沿accept→send598.0/594.8ms，accept→首观测ack1453.0/1449.7ms；B373.1/367.1ms、733.9/1071.7ms。选角两端accept→ack1084.9/1105.1ms。首观测ack是UI采样上界，不能当DS实际处理时刻。

这些说明该被仪器影响窗口中输入出站和确认观测确有长等待，与多组批量处理同窗；不证明是网络丢包、某一pending input重演或Engine唯一根因。raw未记录Gas OutstandingCount/Replays，不能用Begin数推定pending queue长度。后窗sequence为0对应新Self/driver replacement，不能据此声称之前4/5号输入永久丢失。

### FullSnapshot、新生命与隐藏的重复投影

初始A Tick527.8ms、B549.4ms，均Begin0、clock87、创建1个voxel world并打开prediction session；说明它们是initial同步/attach路径，不能纳入稳定单组成本。A后续Self改变的874.5ms Tick中有world create2、clock377而Begin4；B对应265.6/392.9ms等也有world create2/额外clock。这些是manager/session replacement与baseline窗口，必须单独测。仅Native世界计数不能证明每次创建冗余，可能属于规范要求的observing/controlled两个边界。

源码另有可直接定位但尚未量时的重复：首full authority成功时joint尚未Attach，Runtime `TryRebuildPredictedWorld`走普通`CloneConfirmedForPrediction`；随后Client在Tick末`AttachJointPredictionIfReady`，`InitializeJointPrediction`先Dispose已有PredictedWorld再CloneConfirmedForPrediction。若一个Tick在attach前应用更多闭合组，普通fallback也可能逐组clone。必须用clone方法计时/次数和实际group顺序证明其份额，不能直接绕过首snapshot原子应用/基线验证。

**准确的局部最小候选**在Runtime [LogicTransform.cs:442](C:/Work/LumioGames/.101-pack07/LumioGameRuntime/modules/ecs/src/Lumio.GameRuntime.Ecs/LogicTransform.cs:442)：CapturePersist和CaptureSync无条件构造并写相同四个serialized transform字段；`RefreshTypedAuthority`调用两者，`CopyCapturedFields`再通过WriteField/ApplySerialized解析八项。Game新generated的CapturePersist已有`if (writer is IPredictionFieldWriter) return`（BomberMatchState.g:127，BomberPlayerState.g:187），因此不能泛称所有Game容器被Persist重复JSON。框架LogicTransform缺相同guard这一点是源码事实；占比仍未测。若干净v3及phase计时证实它显著，可在所属Runtime做同等typed-capture guard，保留普通persist四字段完整。回归需真实LogicTransform的typed capture/clone/transform replay/correction/普通snapshot restore结果，不可只改golden、增budget或停预测。可用唯一字段capture与相应预算/操作计数作确定性RED，避免CI毫秒阈值或只镜像if实现。

### 最小分段诊断计划：暂未写入或构建

Root决定先做紧凑v3+无instrument正式页面对照；只有剩余managed成本仍超预算才继续此计划。拟用新私有 owningRuntime树`C:/Work/LumioGames/LumioGameRuntime-101-browser-tick-diagnostic`、基准d8ae3da，不碰任何冻结根。所需最少边界：

1. WorldManager.cs：Enqueue的WorldChange ingress capture/Encode预算、ValidateWorldChange fingerprint、StageFieldValues、CloneConfirmedForPrediction（cold与替换分别计）。
2. WorldManager.JointPrediction.cs：RefreshTypedAuthority总、Project(0)、generatedCapture+Copy字段loop、尾Project/index；同时计record/component/LogicTransform数量，确认重复字段工作。
3. GasJointPrediction.Selective.cs：外层RebuildSelective总、witness/affected执行、PrepareJointPublication，区分inner `_applyingAuthority`早退。
4. 新internal fixed-array诊断helper：Stopwatch.GetTimestamp，固定8个阶段count/sum/max，每64个外层rebuild/clone输出≤1KB普通Logger/Console，非server、私有常量启用；无payload/credential、无权威状态/hash改动，不增额度、不改协议。最终全部删除后才正式源码审查/package。

若上述总量不足解释同步Tick，再在a6071a2新隔离Client树精确测StageAuthority合法decode/mapper、owned commit decode和ack读取decode；Runtime/Client两仓身份分别记录。不会先批量构建诊断package或以替换旧DLL消费；官方完整工具的私有诊断包消费路径与依赖先由Root确认。此计划没有性能根因RED，也没有生产修改裁决。

### live-06原始文件SHA256

| 文件 | SHA256 |
|---|---|
| performance-A.json | `fec88a9069b1788f81d26bc29513ca67b6059f5ab00720b81037739dc31027b6` |
| performance-B.json | `9c172d0bbf8e9fc705529162d16268146409ccbb1107567a7eafee72b5c0fb35` |
| first-input-A.json | `aeb686cf49dcf193df468923c39ed3d654f7966d2a496e890c282da69a2a5ff5` |
| first-input-B.json | `79bcdcf80b5088375dad3e27ee25d64fe807232ff2dc19bb7529afb6865314db` |

## 私有AOT对照：本机工具链与完整保留配置，只读裁决

Root提出产品宿主运行模式对照；此调查没有修改host、SDK、冻结包或引擎生产源码，也没有启动构建。原宿主 [csproj:28](C:/Work/LumioGames/LumioGame/games/101-bomber/Client/UI/Spectator/host/Lumio.Bomber.Client.Spectator.csproj:28) 显式`RunAOTCompilation=false`及`PublishTrimmed=false`，Release注释确认优化解释器。机器实际SDK根为`C:/Users/g923/.dotnet`，SDK10.0.400、MSBuild18.9.6、wasm-tools manifest10.0.112/10.0.100；安装的browser runtime/toolchain pack为10.0.12。`Microsoft.NETCore.App.Runtime.AOT.win-x64.Cross.browser-wasm/10.0.12/tools/mono-aot-cross.exe`、Emscripten3.1.56 SDK/Node/Python/cache、MonoAOTCompiler.Task均存在。不是`C:/Program Files/dotnet`；对该不存在目录的第一次只读查找未取得证据。

Root的`aot-comparison08-build-01`实际尝试已返回1，保留原始log/command JSON；[本机WasmApp.Common.targets:600](C:/Users/g923/.dotnet/packs/Microsoft.NET.Runtime.WebAssembly.Sdk/10.0.12/Sdk/WasmApp.Common.targets:600)明确拒绝`RunAOTCompilation=true`且`PublishTrimmed!=true`。所以当前SDK**不支持无ILLink过程的AOT**，不能继续把第一次参数称为可行对比。此错误不是Game API错误，不能通过压警告或伪装构建成功处理。

### 可审核的最小私有attempt2配置

保留正式08 release.props/所有原始Game和released assembly输入及完整Native WASM，设置`RunAOTCompilation=true`、`PublishTrimmed=true`、`JsonSerializerIsReflectionEnabledByDefault=true`、`TrimMode=full`，本次兼容性对照额外`WasmStripILAfterAOT=false`。SDK默认AOT之后strip IL，先保留IL便于完整反射/诊断边界对比，不据此宣称每一方法均由AOT执行。

本机 [ILLink.targets:55](C:/Users/g923/.nuget/packages/microsoft.net.illink.tasks/10.0.11/build/Microsoft.NET.ILLink.targets:55)在裁剪时默认关闭System.Text.Json反射，Game宿主实际多处匿名对象`JsonSerializer.Serialize`，必须显式保留该功能。对全部Lumio宿主/Client/Runtime/Game/Hfsm程序集，Root可在**私有selection配置**导入下面target；此代码尚未写入生产或尝试构建。全Lumio成员保留，但BCL仍执行正常link过程；任何IL警告保持原级别及原TreatWarningsAsErrors。

```xml
<Target Name="PreserveCompleteLumioForAotComparison"
        AfterTargets="PrepareForILLink" BeforeTargets="_RunILLink">
  <ItemGroup>
    <ManagedAssemblyToLink
      Condition="$([System.String]::Copy('%(ManagedAssemblyToLink.Filename)').StartsWith('Lumio.'))">
      <TrimMode>copy</TrimMode>
    </ManagedAssemblyToLink>
    <TrimmerRootAssembly
      Include="Lumio.Bomber.Client.Spectator;Lumio.Bomber.Gameplay;Lumio.Client.Engine.Wasm;Lumio.Client.Gameplay.ECS;Lumio.Client.Gameplay.GAS;Lumio.Client.Gameplay.Input;Lumio.Client.Gameplay.Session;Lumio.Client.Log;Lumio.Client.Network.Connection;Lumio.Client.Network.Handshake;Lumio.Client.Spectator;Lumio.Client.Storage;Lumio.Engine.NativeLoader.Hfsm;Lumio.GameRuntime.Config;Lumio.GameRuntime.Coordination;Lumio.GameRuntime.Ecs;Lumio.GameRuntime.Gas;Lumio.GameRuntime.Hosting;Lumio.GameRuntime.Persistence;Lumio.GameRuntime.Primitives;Lumio.GameRuntime.Replication;Lumio.GameRuntime.Simulation">
      <RootMode>all</RootMode>
    </TrimmerRootAssembly>
  </ItemGroup>
</Target>
```

这22项来自candidate08原始browser host输出DLL及publish `_framework`交集，不是随意补的assembly。只修改`ManagedAssemblyToLink` metadata，未加减linker输入，符合本机ILLink.targets:197的扩展点。私有构建应保存最终ILLink response file，确认22个`--action copy`及`-a ... all`真实进入命令，并在linker后、AOT/wasm打包前比较Lumio DLL SHA256及MVID（host自身因运行配置需单独记录）。否则不能声称类型/方法完整保留。

Root随后授权唯一新增私有配置 [aot-preserve-closure08.targets](C:/Work/LumioGames/LumioGame/games/101-bomber/.run/browser-experience-repair-01/aot-preserve-closure08.targets)，已写入exact22 expected-set/count guard，输入action/root/SHA证明及linker后原字节SHA相等断言。这不是生产配置修复。另发现本机Microsoft.NET.Sdk.WebAssembly.Browser.targets:47在TrimmerDefaultAction空值时默认`SuppressTrimAnalysisWarnings=true`；所以Root必须在命令行显式`-p:SuppressTrimAnalysisWarnings=false`，早于SDK初始化，且私有target也检查此值。保持原TreatWarningsAsErrors，不用SDK默认的`--notrimwarn`掩盖真正风险。

本机`illink.dll --help`确认`all`保留root所有成员、`copy`分析整程序集并复制输出。与.NET10.0.11官方[LinkTask源代码](https://github.com/dotnet/runtime/blob/v10.0.11/src/tools/illink/src/ILLink.Tasks/LinkTask.cs)、[OutputStep源代码](https://github.com/dotnet/runtime/blob/v10.0.11/src/tools/illink/src/linker/Linker.Steps/OutputStep.cs)相符：per-assembly TrimMode直接变成`--action copy Name`，copy输出复制原始程序集。**全局TrimMode=copy单独不充分**：全局action只默认作用于IsTrimmable程序集，未声明者走DefaultAction；不要用已弃用`TrimmerDefaultAction`或SDK硬门绕过。全局copy所有BCL可以解析但未在此验证其AOT兼容性和必要性，不推荐代替局部完整保留。

### 互操作与剩余风险的边界

宿主 [Program.cs:16](C:/Work/LumioGames/LumioGame/games/101-bomber/Client/UI/Spectator/host/Program.cs:16)的JSImport收发`string`/`byte[]`，JSExport使用基本值/字符串/数组/Task；正式Client `EngineWasmCall`构造并Marshal二进制packet。正式engine-wasm.mjs将byte packet复制/重定位到**另一个Rust WASM模块的内存**，返回值再复制成JS Uint8Array。AOT只改变.NET模块的编译方式，没有源码证据说明必须与Rust模块合并或互相共享raw managed pointer；能否正常导出/封送仍以实际发布及真实运行验证，不能只凭类型检查判通过。

对浏览器正式入口可达代码的静态查询没有发现运行中Assembly.LoadFrom/Reflection.Emit/DynamicMethod能力依赖。Runtime Simulation的IL扫描/PrepareMethod在`NET10_0_OR_GREATER`条件内，而正式浏览器消费的是已发布netstandard2.1 Runtime：`TickPathWarmup.Run`走no-op，不因宿主net10重新编译成CoreCLR warmup路径。搜索结果中的Bot assembly动态加载不属于这个浏览器闭包；测试反射亦不能混为产品要求。DevLoadedModules只枚举已载程序集，不加载动态代码。

这还不是完整trim/AOT安全证明：全root仍会暴露BCL反射警告、泛型实例化/Marshal/浏览器HFSM导出兼容性，System.Text.Json反射可能对BCL类型需要额外保留。须让真实compiler诊断裁决，不能消除警告来凑成功。WASM体积、冷启动、下载/编译、退出资源、后台/可见调度均需分别实测；完成valid v3解释器基线后才做重构建，避免CPU构建扰动实时数据。只有同正式08、同GameDLL、同八人重功能的A/B测量确有收益，并通过独审与全部功能/至少十次关闭重进，才可讨论产品Host Release配置修复。当前无AOT性能收益或体验通过结论。

### AOT实验实际关闭

Root的attempt2已在CoreCompile被9条IL2026拒绝，未执行ILLink/AOT，22个copy/root和输入/输出SHA检查全部**NOT_RUN**。保留failed私有target SHA `7f10e660d77b52275f80d48ae77e1073ce9561ab8eef209cc0ae10a123734333`及原日志，独审按BUILD_BLOCKED封存。Root裁决停止AOT路径；不降警告，不做宽泛serializer改写，没有任何AOT产物被采用。

## 正式08 live-08紧凑v4：真实管理端组成本与生命切换长帧

原始目录 [live-08](C:/Work/LumioGames/LumioGame/games/101-bomber/.run/browser-experience-repair-01/live-08) 保留。`second-input-A/B`与`performance-A/B`各端分别原字节相同，不可重复算作独立窗口；`performance-final-A/B`为更晚的600条环形窗口，未与早窗口完整拼接，丢弃计数明示缺口。first-input的191/225条Tick仍保留最早调用，但state/pose只保留最新80条，因此初始选角ack已被裁去，不能拿首个保留state构造实际确认延迟。原文件pretty JSON约1.0–1.4MB；真实DOM compact body为594–822KB，均低于仪器1MiB门，这两种字节口径不能混用。

派生文件为同目录`performance-analysis-reentry-v4.json`、`performance-analysis-reentry-timing-v4.json`和`performance-analysis-reentry-v4-input-ack.json`。最后一份明确修正首选角ack历史截断口径；主派生文件中的首保留ack只能作有截断的观测上界。全部原始文件保留，derived不含票据或message payload。

| 实际窗口/指标 | A | B |
|---|---:|---:|
| early单Begin无replacement Tick mean / p50 / p95 ms | 20.88 / 19.5 / 30.7（138条） | 20.83 / 19.3 / 28.7（157条） |
| middle单Begin无replacement mean / p50 ms | 18.40 / 15.8（499条） | 18.26 / 15.6（483条） |
| final单Begin无replacement mean / p50 / p95 ms | 19.18 / 16.9 / 36.1（496条） | 19.26 / 16.9 / 37.5（484条） |
| final两Begin无replacement mean / p50 ms | 46.84 / 43.6（68条） | 44.61 / 42.7（88条） |
| final全部Tick mean / p95 / max ms | 26.81 / 64.3 / 361.9 | 24.45 / 51.5 / 225.0 |
| final Native JS桥窗sum ÷ Tick sum | 1.204% | 1.125% |
| final rAF gap mean / p95 / max ms | 21.32 / 37.5 / 300.6 | 19.65 / 19.5 / 57.1 |
| final Tick start gap mean / p95 / max ms | 62.50 / 103.6 / 744.7 | 59.16 / 102.7 / 537.2 |

按相同Self、正authority、无创建/打开会话、clock=29×Begin且前后state都在保留窗的条件匹配：early A75/75、B76/76；middle A71/71、B77/77；final A77/77、B79/79均有authority推进=Begin数。没有把input-only Begin或生命周期切换混入；没有看到正常权威组两次Native Complete。单组管理调用仍约19ms，两组约45ms，真实catchup可一次处理11–21组，进而占用200–500ms。不能把同步Tick叫作固定20Hz的单次模拟步。

初始A524.1ms/B509.4ms：Begin0、clock87、world-create1、prediction-open1；随后A532.5ms/B522.9ms Tick有Begin13/clock348（12个常规World Tick加另一个更新边界），再跟11组359.5/316.3ms。初始同步/attach的半秒与后继积压的半秒是不同调用，不是一个Native CPU热点。

early A两次Self切换：14.6179s Tick352.4ms由life0e变participant0f，17.7208s Tick356.6ms由participant变新life25；均Begin0、clock116、world-create2/open1/close1、authority归0，8个Section request及4个section delivery。随后分别8组177.8ms、12组208.8ms和8组177.0ms。更晚replacement约152–296ms，final B2次158/168ms、A5次153–296ms。final A最高361.9ms对应12组clock348且本次无replacement，但发生在刚换生命后的catchup中；B225.0ms对应11组clock319。

所以剩余可观测链是**初始/生命切换baseline成本 + 后续逐组管理重建成本**，不是稳定Tick从19ms永久退化成100ms，也没有证据说明协议帧是低频发送。Native盒读亦不能解释数百毫秒：final每ReadBox管理export均值约1.81ms、Rust JS窗约0.12ms；PresentationState均值约2.5ms，其他状态export多在0.1–0.4ms。观察器JSON.stringify final mean4.68/4.72ms，每500ms一次，max8.9/8.4ms；Native逐调用bookkeeping仍在管理Tick内却没被单独扣除，所以各数值保留仪器成本声明，不能以此直接归为ECS某方法。

可匹配且未截断的真实输入窗口：B early两个Move accept→send116.3/125.3ms，send→首观测ack284.9/159.1ms；两放弹边沿accept→ack439.5/434.4ms。A middle Move48.9/152.8ms、send→ack283.5/316.9ms；放弹accept→ack316.5/485.2ms。跨生命sequence重置按observedSelf匹配，没有把旧ack冒认新input。它们仍是浏览器首观测ack上界，未测DS实际commit时刻；不构成移动/放弹完整体验验收。

现有数据只把剩余成本收窄到管理路径和生命周期路径。clock87/116可估计3/4次World Tick，但**不能推出3/4次clone或其耗时**。Root因此授权新私有Runtime诊断树及四文件计时；正式源码修复仍等真实phase数据及根因RED。实施与准确边界见 [私有诊断交回](C:/Work/LumioGames/LumioGame/.sdd/101-20261004-runtime-private-tick-diagnostic-review.md)。

### live-08原始SHA256

| 原文件 | SHA256 |
|---|---|
| first-input-A.json | `6d0c0135f13688da5e376eaa649c4808cc113fa121f1bf479939b49e98e4b3ee` |
| first-input-B.json | `7e1442b93ad90f7b214b929640ce8e1851c1c3a54c7cc97403607e001ef31f42` |
| performance-A.json（=second-input-A） | `c11d3d96e75cf17ac9ba8431d7d5e35b46b52ba95f17dfd03a0991effd596886` |
| performance-B.json（=second-input-B） | `0c85a79e2c9e365330f748bc6a98990002365e577d8d1330dabb013c6c3354cf` |
| performance-final-A.json | `84964c192ca294a3756c60d323cd15bc5e77255bea06571fc4dadf1926b024c9` |
| performance-final-B.json | `51b73bdc6f84fae675020edcd4c8c131db9a998317499a6be5aa53e1f08997ab` |
