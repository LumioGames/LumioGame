# 0015 · Stage 0a 不依赖 Runtime Processor 与公开 CrossWorldTxn/IVoxelWorldPort；网格与规则结算改为 Game 自有 EcsComponent 状态

- 日期:2026-09-04
- 状态:生效

## 背景

G-0(体素炸弹人 Stage 0 内核契约,R-00423)的「Runtime 接入核验」按 ADR 0013 的交付纪律先于其余交付执行,核验四项能力:①自定义 Component 注册、②注册 Processor 参与 Logical Tick、③从 Game 侧发起 CrossWorldTxn、④取得确定性逐 Tick 快照与哈希。核验以真实代码对照 sibling `LumioGameRuntime` 仓源码与其自身测试执行,结论:

- ①③④ **可行**:`EcsRegistry`/`WorldManager.Create`/`AttributeDeclarationScanner`/`gen-declarations` CLI 均为 public 且与命名空间无关,Game 可定义全新 Component/EntityType/Registry(不复用 Username 样例);`WorldManager.CaptureSnapshot()` 返回可复制字节,Game 可自行 SHA-256。已用真实测试证明:6 个自定义 EntityType/Component(`BomberWorldEntity`/`BomberPlayerEntity`/`BomberBombEntity`/`BomberExplosionCellEntity`/`BomberHatPileEntity`/`BomberPickupItemEntity`)注册、创建、Tick、快照全部通过;并证明同一命令序列在两个独立 `WorldManager` 上产出逐字节相等快照(确定性)。证据:`modules/server-gameplay/tests/Lumio.Game.ServerGameplay.Tests/Bomber/RuntimeIntegrationProbeTests.cs`,`dotnet test --project modules/server-gameplay/tests/Lumio.Game.ServerGameplay.Tests/Lumio.Game.ServerGameplay.Tests.csproj` 26/26 通过(2026-09-04)。
- ② **不可行,硬阻塞**:`modules/ecs` 无任何 `ISystem`/`IProcessor` 抽象;`modules/simulation` 的 `TickExecutorComposition`、`SimulationSession` 构造函数与 `SimulationModule.CreateSession(options, composition)` 重载均为 `internal`,`InternalsVisibleTo` 只授权给 Runtime 自身测试程序集。`WorldManager.Tick()` 是公开方法但内部序列(ApplyInputs→CommitCreates→StampAndProject→ConsumeSave)固定、不可注入。Username 样例(Game 现有 Chat 功能的唯一先例)本身也不经 `modules/simulation`,而是由 Game 代码直接调用 `ChatSetMessageSystem.Admit/SetMessage` 配合 `manager.Tick()`——即「Game 自行编排、Runtime 只提供数据与 Tick 原语」本就是本仓已有先例,不是权宜之计。
- ③ **不可行,设计上刻意阻塞**:`internal interface IVoxelWorldPort`(`coordination/Prepare/TxnPrepareCoordinator.cs:73`)与其请求/结果类型全部 `internal`;唯一公开的 `CoordinationModule.Create(initialRevision)` 固定接一个私有 `FailClosedVoxelWorldPort`,接受自定义端口的重载是 `internal static`。Runtime 自身有一条反向测试
  `VoxelAdapterSurfaceTests.SubstituteVoxelContractTypesAreNotExported` 用反射断言 Voxel 契约类型永不导出——这是刻意的架构边界,不是尚未补齐的疏漏。与 [`risks-and-engine-asks.md`](../../docs/specs/risks-and-engine-asks.md) A2 互相印证:`LumioVoxelEngine` 尚未导出 C 接口,即便 `IVoxelWorldPort` 公开,当前也没有真实 Voxel 后端可接。

design.md §16 Gate 0 已把「爆炸批量挖块事务与 A8 阈值走上游 ADR」列为独立于 Stage 0a 之外的准入项,本条发现是这条待办的具体证据,不构成对 design.md 或 ADR 0013/0014 的推翻——需要决策的是**Stage 0a 的内核在这条上游能力就绪前怎么实现**,这是本 ADR 要定的事。

## 决策

- **Stage 0a 内核不经 Runtime `simulation`(Processor/Logical Tick)、不经 Runtime `coordination`(CrossWorldTxn/IVoxelWorldPort)。** 规则内核(G-1 移动/传播/连锁/结算、G-2 帽子经济、G-3 掉落、G-4 地图生成)一律实现为**普通 C# 函数**,由 Game 自有的 Scenario 宿主(G-6)在每次调用 `WorldManager.Tick()` 前后按固定顺序直接调用,读写 Runtime 公开的 `EcsWorld`/Component 数据——这正是 Chat 功能已经验证过的模式,不是新发明。
- **软砖/据点等「地图格子」状态在 Stage 0a 是 Game 自有 EcsComponent,不是真实 Voxel 存储。** 用一个或若干 Game 定义的 Component(如按格存材质枚举)持有网格,通过普通 Component 读写完成「炸开」;**明确不经** `IVoxelWorldPort`/`CrossWorldTxn`,因为该端口对消费方不可见且当前无真实 Voxel 后端(A2)。这是 Stage 0a 专属的临时简化,一俟 Gate 0 的上游 ADR 项(A8 方块写入预算 + 公开的跨 World 写入通道)落地,Stage 2+ 的真实 Voxel 集成应替换本条,不得把这份简化误当作长期架构。
- **所有 6 个 Stage 0a 实体类型与组件按此口径落地并已验证**:`BomberWorldEntity`(挂 `BomberMatchState`)、`BomberPlayerEntity`(挂 `BomberPlayerState`)、`BomberBombEntity`(挂 `BomberBombState`)、`BomberExplosionCellEntity`(挂 `BomberExplosionCell`)、`BomberHatPileEntity`(挂 `BomberHatPile`)、`BomberPickupItemEntity`(挂 `BomberPickupItem`);字段一律整数或裸 `ulong`(`NetEntityId` 编码,因其不满足 `Sync<T>` 的隐式约束,契约里一律以 `*Raw` 后缀的裸 u64 表示,详见 `docs/specs/bomber/stage0-kernel-contract.md`)。
- **命令(`MoveIntent`/`PlaceBombIntent`)、事件(`BombPlaced`/`BombExploded`/… 等 11 个)、端口(`IBomberTelemetrySink`/`IBomberRandom`)均为 Game 内部纯 C# 类型,不依赖 Runtime,不复制任何公共契约字段**——网络包络仍按 C-1 走上游 ADR 登记,Stage 0a 的 Bot/回放场景直接构造这些值,不经网络。
- **不因此新增 Runtime 侧诉求卡**:本条发现登记进 [`risks-and-engine-asks.md`](../../docs/specs/risks-and-engine-asks.md) A8(方块写入预算),不单独立项——Runtime 是否要开放 Processor 注册与 IVoxelWorldPort 测试双件,属 Runtime 仓自己的路线图决策,本仓只记录消费方影响。
- **锁与不锁**:锁「Stage 0a 内核不经 Runtime Processor/CrossWorldTxn」「网格为 Game 自有 Component」「六个实体类型的组件挂载」;不锁具体字段增减、Config 键名(进 G-5)、Scenario 文件格式细节(进 G-6)。

## 后果

- G-0 契约文档(`docs/specs/bomber/stage0-kernel-contract.md`)与本地 Workflow bundle 的 G-1/G-4/G-6 卡正文按本 ADR 改写(移除「经 CrossWorldTxn 走 IVoxelWorldPort」「Runtime Processor」等已证伪的措辞);已上传的 R-00423(G-0)与 R-00422([原始需求])描述同步 PATCH。
- Stage 2 起若要把 Stage 0a 的 Game 自有网格换成真实 Voxel 存储,是一次已知的、有意为之的架构替换点,不是技术债——替换前提是 Gate 0 的 A8 上游 ADR 落地且 `LumioVoxelEngine` 已导出可用接口(A2)。
- 「Runtime 无公开 Processor/公开 IVoxelWorldPort」的现状可能随 Runtime 自身路线图变化;本 ADR 的技术前提若变化(如 Runtime 后续开放这两个面),不需要撤销本 ADR,但 Stage 2+ 的实现应重新评估是否切换到 Runtime 原生机制。
- 好处:Stage 0a 完全不依赖跨仓的 Runtime 能力扩展,可在 A1–A3(网络、Rust↔C# 桥、渲染)与 Runtime 自身的 Processor/Voxel 路线图之外独立推进,契合 ADR 0013「headless 优先、不被引擎侧卡住」的初衷。
