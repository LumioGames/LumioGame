# 体素炸弹人 · Stage 0a 内核契约

> **状态**：已冻结 v1.3.0
> **序位 / 适用范围**：体素炸弹人 Stage 0a（headless）内核实现卡（G-1..G-7）与网络契约卡（C-1）的唯一契约来源
> **上游**：[`design.md`](design.md)（策划案）、ADR [`0013`](../../../.spec/decisions/0013-logic-first-browser-client-no-engine.md)（逻辑先行）、[`0014`](../../../.spec/decisions/0014-bomber-v04-stage0-convergence.md)（v0.4 收敛）、[`0015`](../../../.spec/decisions/0015-bomber-stage0a-runtime-capability-finding.md)（Runtime 接入核验结论）、[`0016`](../../../.spec/decisions/0016-bomber-terrain-out-of-ecs-3d-coords.md)（三维坐标与地形出 ECS）、[`0017`](../../../.spec/decisions/0017-bomber-explosion-and-health-model.md)（爆炸与血量模型）、[`0019`](../../../.spec/decisions/0019-bomber-terrain-align-voxel-world-contract.md)（地形口径对齐上游体素契约）
> **冻结物**：`modules/server-gameplay/src/Lumio.Game.ServerGameplay/Bomber/Contracts/**`（不含 `generated/`）；内容 sha256（源文件按**仓库相对路径**升序、只拼接**文件内容**后整体哈希）：`d16de07a9d5d7f6d05d1fadfd54b9bb8b0709a4925f4bbb779549a40ff98fc08`
>
> **v1.3.0 相对 v1.2.0 的变化**（ADR 0019）：`ITerrainStore` 改照上游公共契约 `voxel-world-v1.json` 的 `blockRead` / `blockWrite` 定形——读改为 `GetCell` / `GetColumn` / `GetBox` 三请求并回带 `sectionRevision` 与四态，`ChunkRevision` 删除，写的 `expectedRevision` 改为每条目一个，格值 `MaterialId`(uint16) 改 `BlockId`(uint32 无符号)；§6 StateHash 的地形那一半改由确定性 box 读定义，`CanonicalBytes()` 删除；新增游戏坐标到引擎坐标的映射。**冻结物 sha256 不变**——`ITerrainStore` 不在 `Bomber/Contracts/**` 内，本次一行 C# 都没碰。
>
> **v1.2.0 相对 v1.1.0 的变化**（ADR 0018）：`DamageApplied` 增加 `SourceBombNetEntityIdRaw`；`dangerWindowMs` = 400、`inputBufferMs` = 125（原为区间，不可写进整数配表）；A/B 变体由 14 增至 18。§7 的 K1 / K2 两条缺口随之关闭。
>
> **v1.1.0 相对 v1.0.0 的变化**（ADR 0016 / 0017）：坐标升三维（实体恒 `Z=0`）；地图网格移出 ECS 改走 `ITerrainStore`；删除 `BomberExplosionCell` / `BomberExplosionCellEntity`，爆炸由炸弹实体持有；血量单位改半心点；`scenario.json` 携带地形数据；Config 键增删见 §5。

## 0. Runtime 接入核验

核验对象：sibling `LumioGameRuntime` 仓（本机路径 `../LumioGameRuntime`，供 Game 通过 `LumioRuntimeRoot`/`LUMIO_RUNTIME_ROOT` 引用）。核验方法：直接阅读 Runtime 源码与其自身测试，并在 Game 侧写出真实可运行的探针测试对照验证，不采信「应该可行」的推断。

| # | 待核验能力 | 结论 | 证据 |
|---|---|---|---|
| ① | Game 可定义并注册全新 Component（不复用 Username 样例） | **可行** | `[EcsComponent]`/`[EntityType]`/`[Has]` 等注解全部 `public`；`EcsRegistry`/`WorldManager.Create(EcsRegistry, ulong?)` 接受任意注册表；`gen-declarations` CLI（`LumioGameRuntime/tools/gen-declarations`）以 `--namespace`/`--assembly-name`/`--sources` 为参数、与命名空间无关，可直接对 Game 自己的源码目录生成 Registry + 组件 partial。已用自定义 EntityType/Component 实证（见 §1）——v1.0.0 时为 6 个，v1.2.0 起为 5 个（`BomberExplosionCellEntity` 已按 ADR 0017 删除，爆炸由炸弹实体持有）。 |
| ② | Game 可注册 Processor，参与 Runtime 的 Logical Tick 编排 | **不可行，硬阻塞** | `modules/ecs` 无任何 `ISystem`/`IProcessor` 抽象；`modules/simulation` 的 `TickExecutorComposition` 构造函数、`SimulationSession` 构造函数、`SimulationModule.CreateSession(options, composition)` 重载均为 `internal`，`InternalsVisibleTo` 只授权 Runtime 自身测试程序集。`WorldManager.Tick()` 公开但内部序列（ApplyInputs→CommitCreates→StampAndProject→ConsumeSave）固定、无扩展点。**Game 现有 Chat 功能本就不经此路径**——`ChatSetMessageSystem.Admit/SetMessage` 由 Game 代码直接调用，配合 `manager.Tick()`，同一模式本次沿用（见 §2）。 |
| ③ | Game 可发起 CrossWorldTxn，触及 `IVoxelWorldPort` | **不可行，设计上刻意阻塞** | `internal interface IVoxelWorldPort`（`coordination/Prepare/TxnPrepareCoordinator.cs:73`）与全部请求/结果类型 `internal`；唯一公开的 `CoordinationModule.Create(initialRevision)` 固定接一个私有 `FailClosedVoxelWorldPort`；接受自定义端口的重载 `internal static`。Runtime 自身用反射测试 `VoxelAdapterSurfaceTests.SubstituteVoxelContractTypesAreNotExported` 断言 Voxel 契约类型永不导出。与 [`../risks-and-engine-asks.md`](../risks-and-engine-asks.md) A2（`LumioVoxelEngine` 尚未导出 C 接口）互证：即便端口公开，当前也无真实 Voxel 后端可接。 |
| ④ | 可取得确定性逐 Tick 快照并哈希，用于「同 Seed 可重放」 | **可行** | `WorldManager.CaptureSnapshot()` 公开，返回可复制 `byte[]`；Game 自行 SHA-256。已用真实测试证明：同一命令序列在两个独立 `WorldManager` 实例上产出逐字节相等的快照哈希（`SameSeedAndCommandSequenceProducesByteIdenticalSnapshotOnTwoIndependentWorlds`）。Runtime 内部另有更完整的 `StateHashCoordinator`（`Determinism/StateHashCoordinator.cs`），但其官方接线只经 `TickExecutionContext`（internal），Game 不可达；Game 自算快照哈希已足够 Stage 0a 的确定性门。 |
| ⑤ | Component 可以承载整张地图网格（每格一个材质枚举） | **不可行** | `modules/ecs/src/Lumio.GameRuntime.Ecs/Sync/SyncTypes.cs:216` 的 `Sync<T>` 文档注释原文是 "Replicated scalar"：每个字段一个 `SyncSlot<T>`、一个 ordinal、一个 attributeId，由 `gen-declarations` 逐字段绑定，**无数组 / 集合 / blob 字段类型**。19×19 = 361 个字段已不可维护，design.md §5 的 61×61 = 3721 个字段不可能；塞进单个 `Sync<string>` 则每炸一格全图重传且每次写入做一次全图相等比较。**处置**：地图网格移出 ECS，改走 `ITerrainStore`（ADR 0016）。 |

**结论对实现口径的影响**（ADR 0015 定案第一段，0016 修订第二段，0019 重定接口形状）：

- 规则内核（G-1/G-2/G-3/G-4）**不经** Runtime `simulation`/`coordination`，改为 Game 自有普通 C# 函数、由 Scenario 宿主（G-6）在每次 `WorldManager.Tick()` 前后按固定顺序调用。
- 地图网格**不在 ECS 里**，走 Game 自有的 `ITerrainStore`（ADR 0016，取代 0015 的「Game 自有 EcsComponent」）。**接口形状照上游公共契约 `voxel-world-v1.json` 的 `blockRead` / `blockWrite` 定义**（ADR 0019，取代 0016 自拟的三方法），Stage 0a 的实现是 `InMemoryChunkStore`，Stage 2 起换成 `VoxelWorldStore`——**只换实现不改调用方**：

  ```text
  读  GetCell(x, y, z)                          → 一格
      GetColumn(x, y, zFrom..zTo)               → 一列，自下而上
      GetBox(min, max)                          → 矩形，固定序（竖直外层 / Y 中层 / X 内层）
      三者的结果都带 BlockId + 每个被覆盖 Section 的 sectionRevision + 四态
      （Ready / Unchanged / Pending / Unavailable），上限 262144 格 / 请求
  写  entry{sectionKey, cellOffset, blockId, expectedSectionRevision}
      批 = 若干 entry + transactionId，all-or-nothing、幂等，上限 65536 条 / 批
  ```

  三处与 0016 不同，都是硬要求：① 格值是 **`BlockId`（uint32 无符号）**，不是 `MaterialId`（uint16）——玩法层不得对它做位运算，一律走转换函数；② **`expectedRevision` 的粒度是每条目一个**，不是整批一个（单次爆炸 ≤ 24 格会跨多个 Section）；③ `ChunkRevision(chunkId)` **删除**——revision 随读结果返回，且 Chunk 本来就不持有 revision。读结果**必须能表达「不知道」**：Stage 0a 的 `InMemoryChunkStore` 永远返回 Ready，但接口现在就要留出 Pending / Unavailable，缺块不得填空气、不得填 0、不得省略。

- 地形分两层：`z = -1` 地面层（地面 / 水方格 / 冰面）、`z = 0` 砖层（Air / 铁皮 / 积木 / 木箱 / 木头 / 鞭炮）；`z ≥ 1` 预留。**爆炸传播每步要同时读两层**——水方格在地面层却要挡火；用一次 `GetColumn` 拿到两层，不是两次单格读。以上是**游戏坐标**；到引擎坐标的映射是 **游戏 (X, Y, Z) → 引擎 (x = X, z = Y, y = Z + 1)**（ADR 0019），只出现在 `ITerrainStore` 的实现里。
- 真实 Voxel 集成仍留给 Stage 2+，前置是 A2 与「Voxel 侧尚无块存储」（见 [`../risks-and-engine-asks.md`](../risks-and-engine-asks.md) A9 ⑧，按此顺序）。

**复现命令**：

```bash
dotnet build modules/server-gameplay/src/Lumio.Game.ServerGameplay/Lumio.Game.ServerGameplay.csproj
dotnet build modules/server-gameplay/tests/Lumio.Game.ServerGameplay.Tests/Lumio.Game.ServerGameplay.Tests.csproj
dotnet exec modules/server-gameplay/tests/Lumio.Game.ServerGameplay.Tests/bin/Debug/net10.0/Lumio.Game.ServerGameplay.Tests.dll --xunit-list tests
dotnet exec modules/server-gameplay/tests/Lumio.Game.ServerGameplay.Tests/bin/Debug/net10.0/Lumio.Game.ServerGameplay.Tests.dll
```

2026-09-04 实测：`total: 26, failed: 0, succeeded: 26`（含 `Bomber.RuntimeIntegrationProbeTests` 3 个用例；v1.1.0 后探针覆盖 5 个 EntityType 与炸弹爆炸态字段）。

> **已知坑**：本机上 `dotnet test --project ...` 可能以退出码 5 报 `Zero tests ran`。按 [`../../../.spec/knowledge/standards/testing.md`](../../../.spec/knowledge/standards/testing.md) 记录设 `DOTNET_ROOT`，或直接对已构建 dll 用上面的 `dotnet exec`。**不得把「运行了零个测试」当成通过。**

## 1. Component 面（Server 权威，`Bomber/Contracts/Components/`）

单位纪律：**坐标三维**（ADR 0016），实体恒 `Z = 0`、Stage 0a 不做垂直移动；位置一律 milli-cell 定点（1000 = 1 格）；时间一律 Tick（`ulong`）；**血量一律半心点**（ADR 0017，`healthPointsPerHeart = 2`）；`NetEntityId` 不满足 `Sync<T>` 的隐式约束，一律以 `*Raw` 后缀的裸 `ulong` 编码表示；全部字段整数（config IntegerOnly 纪律向下游对齐）。已在 §0 的探针测试中注册、创建、Tick、快照全部通过。

| Component | 挂载实体类型 | 字段 | design.md 出处 |
|---|---|---|---|
| `BomberMatchState` | `BomberWorldEntity`（World 单例） | `MatchTick:u64`、`StartTick:u64`、`EndTick:u64`、`Phase:i32`（0 Warmup/1 Running/2 Endgame/3 Settlement）、`HatKingNetEntityIdRaw:u64`（0=无帽王） | §4 / §4.1 / §13 |
| `BomberPlayerState` | `BomberPlayerEntity` | `HealthPoints:i32`（**半心点**，0..`maxHealthPoints`）、`HatCount:i32`、`BombPower:i32`、`BombCapacity:i32`、`SpeedTier:i32`、`RespawnAtTick:u64`、`ProtectedUntilTick:u64`、`CellX/CellY/CellZ:i32`、`PosMilliX/PosMilliY/PosMilliZ:i32` | §7.1 / §9 / §10 / §12 |
| `BomberBombState` | `BomberBombEntity` | `OwnerNetEntityIdRaw:u64`、`CellX/CellY/CellZ:i32`、`FuseEndTick:u64`、`Power:i32`、`ChainId:u64`、`BombKind:i32`（0 标准/1 冰冻/2 火焰/3 穿透/4 分裂）、`PierceLayers:i32`、`ExplodedAtTick:u64`、`DangerUntilTick:u64`、`BurnUntilTick:u64`、`ReachUp/ReachDown/ReachLeft/ReachRight:i32` | §7.1 / §7.2 / §7.3 / §7.5 |
| `BomberHatPile` | `BomberHatPileEntity` | `Count:i32`、`CellX/CellY/CellZ:i32`、`ExpireAtTick:u64` | §9.2 |
| `BomberPickupItem` | `BomberPickupItemEntity` | `Kind:i32`（0 FirePlus/1 BombPlus/2 SpeedPlus）、`CellX/CellY/CellZ:i32` | §7.4 / §8.5 |

**炸弹兼任它自己的爆炸**（ADR 0017）：引信到点后不销毁，`ExplodedAtTick` 起至 `DangerUntilTick` 为火焰阶段、至 `BurnUntilTick` 为留火阶段（Stage 5），随后销毁。`Reach*` 存的是传播算完后的**实际臂长**（已含地形阻断），客户端据此直接绘制火焰。原 `BomberExplosionCell` / `BomberExplosionCellEntity` 已删除——每格一个实体在 100 人下是每秒 100–300 个实体生灭。

**同弹命中记忆不在契约内**：§7.5「同一颗炸弹对同一玩家最多命中一次」需按 bombId 记录已命中集合，它不复制、不持久，落服务端临时结构。

**明确不在本冻结物内**：地图网格**不是 Component**（ADR 0016，见 §0 结论）——它在 `ITerrainStore` 后面，G-4 负责 `InMemoryChunkStore` 的实现与地形数据的序列化格式；`ITerrainStore` 的失败语义细节（RevisionConflict / SectionNotReady / Expired）未锁。**Section 尺寸不再是未决项**（ADR 0019）：上游契约 `limits` 已冻结 Section 16³、每 Chunk 16 层、世界高 256，且注明「改动它等于全量转档，没有例外」。装备/技能相关 Component 属 Stage 5，不进 Stage 0a 契约。

## 2. 内部命令（`Bomber/Contracts/Commands/`）

Game 内部 DTO，不依赖 Runtime；Bot 与回放场景直接构造，不经网络。网络包络由 C-1 在架构源登记。

| 类型 | 字段 | 说明 |
|---|---|---|
| `MoveIntent` | `DirX:int, DirY:int` | 各自 ∈ {-1,0,1}（八向）；越界值由调用方在构造前校验。**无 `DirZ`**：ADR 0016 锁定实体恒 `Z=0`、Stage 0a 不做垂直移动，恒为 0 的分量不进网络包络（C-1） |
| `PlaceBombIntent` | 无 | 落点由服务器按 §6.1「炸弹总是落在最近的合法格中心」计算 |

## 3. 事件（`Bomber/Contracts/Events/`）

服务器权威事件，Game 内部 DTO；由规则内核（G-1/G-2/G-3）产出，经 `IBomberTelemetrySink` 落遥测（G-7），网络包络由 C-1 登记。

| 事件 | 字段 | design.md 出处 |
|---|---|---|
| `BombPlaced` | `OwnerNetEntityIdRaw, CellX, CellY, CellZ, FuseEndTick, Tick` | §7.1 |
| `BombExploded` | `ChainId, SourceBombOwnerNetEntityIdRaw, CellCount, Tick` | §7.2 |
| `DamageApplied` | `VictimNetEntityIdRaw, SourceBombNetEntityIdRaw, SourceBombOwnerNetEntityIdRaw, ChainId, HealthPointsLeft, Tick` | §7.5（同一颗炸弹对同一玩家只出现一次；单位半心点）。`SourceBombNetEntityIdRaw` 由 ADR 0018 补齐，供 §9.6 死亡回顾逐炸弹归因 |
| `PlayerDied` | `VictimNetEntityIdRaw, KillerNetEntityIdRaw, ChainId, Cause, CellX, CellY, CellZ, Tick` | §9.1（自杀与溺死时 Killer==Victim；`Cause` 0=爆炸 1=溺水 2=燃烧，§9.6 要求死亡可解释，只靠 Killer==Victim 分不出自炸与淹死） |
| `PlayerRespawned` | `NetEntityIdRaw, CellX, CellY, CellZ, Tick` | §12 |
| `HatPileSpawned` | `CellX, CellY, CellZ, Count, ExpireAtTick, Tick` | §9.2 |
| `HatPilePicked` | `PickerNetEntityIdRaw, Count, Tick` | §9.2 |
| `HatPileExpired` | `Count, Tick` | §9.2 |
| `PickupTaken` | `PickerNetEntityIdRaw, Kind, Tick` | §7.4 |
| `HatKingChanged` | `PreviousHatKingNetEntityIdRaw, NewHatKingNetEntityIdRaw, Tick` | §9.3（0=无帽王） |
| `MatchEnded` | `Tick` | §4.1 |

## 4. 端口（`Bomber/Contracts/Ports/`）

| 接口 | 方法 | 说明 |
|---|---|---|
| `IBomberTelemetrySink` | `Emit(string eventName, ulong tick, string payloadJson)` | G-7 实现 JSONL Sink；实现不得阻塞 Simulation Thread（须缓冲/批刷） |
| `IBomberRandom` | `NextInt(minInclusive, maxExclusive)`、`NextDouble()` | 确定性随机源；同一 Seed 派生的调用序列必须逐次产出相同结果，不得读取系统时钟/GUID |
| `ITerrainStore` | `GetCell`、`GetColumn`、`GetBox`、`ApplyBatch(entries, transactionId)` | **签名由 ADR 0019 按上游 `blockRead` / `blockWrite` 锁定**（取代 0016 自拟的三方法），G-1 / G-2 / G-3 都消费它。接口与实现均由 G-4 落地（Stage 0a 后端 `InMemoryChunkStore`），**不在本冻结物内**——所以它不在 `Bomber/Contracts/Ports/` 下，也不计入 §0 的 sha256。`CanonicalBytes()` 已删除，§6 的 StateHash 改用 `GetBox` 的确定性结果 |

> **wave 编排提醒**：`ITerrainStore` 的接口面在 G-4 而不在 G-0，意味着 G-1 / G-2 / G-3 与 G-4 **不能真正并行**——它们要调 `GetColumn` / `ApplyBatch`。要么 G-4 先出接口再扇出，要么把接口本身提进 G-0 的下一次冻结（会再触发一次 sha256 重算）。这是编排选择，不是缺陷。

## 5. Config Schema（G-5 落地，键名与默认值冻结）

全部整数（时间用毫秒或 Tick 整数，速度用 Tier + 换算表）；来源标注见 design.md §15 数值来源纪律。

| 键 | 类型 | 首轮默认值 | design.md 出处 |
|---|---|---|---|
| `fuseMs` | int | 2100 | §7.1（A/B：1800/2400） |
| `dangerWindowMs` | int | 400 | §7.1（ADR 0018 由区间 350–400 收敛；取 A/B 三档 0.3/0.4/0.5 的中档，两侧对称可测；推断待验证） |
| `initialBombPower` | int | 2 | §7.1（A/B：1） |
| `initialBombCapacity` | int | 1 | §7.1（固定） |
| `speedTierToCellsPerSecond[]` | int[] | Tier0=3500（milli-格/秒） | §7.1（A/B：3300/3800） |
| `respawnMs` | int | 3000 | §12（A/B：4000） |
| `respawnProtectionMs` | int | **3000** | §12（ADR 0017 由 1500 抬到 3000；放弹即解除必须保留） |
| `hatPileExpireMs` | int | 15000 | §9.2（A/B：12000/20000） |
| `matchDurationMs` | int | 360000（6 分钟） | §4（A/B：300000/480000） |
| `inputBufferMs` | int | 125 | §6.1（ADR 0018 由区间 100–150 收敛，取中点；推断待验证） |
| `tickRateHz` | int | 20 | Gate 0（推断待验证） |
| `maxHealthPoints` | int | 6 | §12（ADR 0017 取代 `heartsMax`；6 个半心点 = 3 颗心） |
| `healthPointsPerHeart` | int | 2 | §12（表现层 `hearts = floor(HealthPoints / 2)`） |
| `drownIntervalMs` | int | 1000 | §12（每隔多久扣一次溺水伤害；与 `drownPointsPerInterval` 合成速率） |
| `drownPointsPerInterval` | int | 1 | §12（每次扣几点；默认 1000 ms / 1 点 = 每秒 −0.5 心，满血 6 秒溺死） |
| `dropRatePermille` | int | 300 | §7.4 |
| `hatPileMinStacks` / `hatPileMaxStacks` | int | 3 / 6 | §9.2 |
| `mapSize` | int | 19 | §5（Stage 0a 固定，无分区档位） |
| `coverReachCells` | int | 10 | §5.3 断言 4（3 秒 × 3.5 格/秒 的换算，按可通行路径长度） |

A/B 变体文件（每个只改一键）：`fuse-1800`、`fuse-2400`、`power-1`、`speed-3300`（Tier0=3.3）、`speed-3800`、`respawn-4000`、`hat-expire-12000`、`hat-expire-20000`、`match-300000`、`match-480000`、`protect-1500`、`protect-2500`、`protect-4000`、`drown-2s`（`drownIntervalMs` = 2000，即每 2 秒 −1 点、12 秒溺死）、`danger-300`、`danger-500`、`buffer-100`、`buffer-150`——**共 18 个**。

> 溺水速率**必须拆成间隔 + 点数两个键**：全表整数（IntegerOnly 纪律），若只留一个「每秒扣几点」的整数键，则「每 2 秒 −0.5 心」这一档改任何单键都表达不出来（1 → 6 秒，0 → 不溺水），而变体纪律要求「每个只改一键」。

## 6. Scenario / 命令流 / StateHash 文件格式（G-6 落地）

三个文件，均带 `schemaVersion: 1`：

- `scenario.json`：`{schemaVersion, seed, configVersion, mapSeed, map, bots:[{name, behavior, params}], durationTicks}`。**`map` 携带地形数据本身**（ADR 0016）——地图不再每次从 `mapSeed` 重生成，否则改一行生成器代码就会让全部历史回放基线静默失效；`mapSeed` 保留作为该地图的来源记录。地形数据的具体序列化格式由 G-4 定，须与 L1 编辑器复用同一格式（[`../ugc-ladder.md`](../ugc-ladder.md) L1）。
- `commands.ndjson`：每行 `{tick, netEntityIdRaw, command: "Move"|"PlaceBomb", dirX?, dirY?}`。
- `statehash.ndjson`：每行 `{tick, sha256Hex}`。

**StateHash 必须覆盖地形**：地形移出 ECS 后 `manager.CaptureSnapshot()` 拍不到它，只哈希 ECS 会让「同 Seed 回放」对地形完全失效——地形炸得不一样，hash 照样逐行相等。故

```text
sha256Hex = SHA256( manager.CaptureSnapshot() ‖ SHA256(terrain.GetBox(全图).BlockIds) )
```

**地形那一半由确定性 box 读定义**（ADR 0019，取代 v1.1.0 的「对齐架构源 `voxel-snapshot-payload` / ADR-035」——核验发现该 ADR 定的是 snapshot 载荷信封，从不定义方块字节）。上游 `blockRead` 的 box 请求已冻结「顺序排死，同一请求两次运行逐字节相同」，故取一次覆盖全图的 `GetBox`、按固定序铺开的 `BlockId` 数组求 SHA-256 即可，Stage 2 换真实 Voxel 存储时哈希连续、历史回放基线不作废。**不需要引擎另外提供地形 canonical 存档字节。** Stage 0a 的 `InMemoryChunkStore` 按同一顺序产出。

回放 oracle 判据：两次运行的 `statehash.ndjson` 逐行相等（不得只比行数）；空文件或截断文件必须 FAIL（沿用 `integration/entity-chat` 的 oracle 纪律）。

## 7. 已知缺口（v1.1.0 登记，已于 v1.2.0 由 ADR 0018 全部关闭）

> v1.1.0 登记的 K1 / K2 **已由 ADR [0018](../../../.spec/decisions/0018-bomber-k1-k2-resolution.md) 在 v1.2.0 关闭**，保留在表内供追溯。当前无未决缺口。

| # | 缺口 | 影响 | 处置 |
|---|---|---|---|
| K2 ✅已解决 | 两个键的「默认值」是**区间不是整数**：`dangerWindowMs` = 350–400、`inputBufferMs` = 100–150 | 与本表头「全部整数」及 IntegerOnly 纪律冲突，执行者无法把 `350–400` 写进整数配表。另：`dangerWindowMs` 出处列声明了 A/B 300/500，但 §5 的变体清单里没有 `danger-300` / `danger-500` | **已解决**（ADR 0018）：`dangerWindowMs` = 400、`inputBufferMs` = 125，均标推断待验证；补 `danger-300` / `danger-500` / `buffer-100` / `buffer-150` 四个变体，清单增至 18 个 |
| K1 ✅已解决 | `DamageApplied` **不携带来源炸弹的身份**，只有主人（`SourceBombOwnerNetEntityIdRaw`）与 `ChainId` | design.md §7.5 要求「同一颗炸弹对同一玩家最多命中一次」、§9.6 要求「死亡回顾列出每个伤害来源的**炸弹**、主人与 ChainId」；服务端可用临时的按 bombId 命中记忆强制执行规则，但**遥测与死亡回顾无法逐炸弹归因**，用例矩阵 2.4 的「字段含来源炸弹」在当前事件形状下不可满足。同一主人同一 Tick 放的两颗弹在事件流里分不开 | **已解决**（ADR 0018）：v1.2.0 增加 `SourceBombNetEntityIdRaw:u64`——原缺口属遗漏而非取舍，design.md §7.5 / §9.6 本就要求逐炸弹归因。用例矩阵 2.4 已恢复完整断言 |

## 8. 与 design.md 待验证项的对应

本契约冻结的是**类型形状**，不是数值；本文档的默认值全部来自 design.md §15「首轮可测默认值」，验证方式与阶段仍以 design.md §15 为准，不在本文档重复。
