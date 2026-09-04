# 体素炸弹人 · Stage 0a 内核契约

> **状态**：已冻结 v1.0.0
> **序位 / 适用范围**：体素炸弹人 Stage 0a（headless）内核实现卡（G-1..G-7）与网络契约卡（C-1）的唯一契约来源
> **上游**：[`design.md`](design.md)（策划案）、ADR [`0013`](../../../.spec/decisions/0013-logic-first-browser-client-no-engine.md)（逻辑先行）、[`0014`](../../../.spec/decisions/0014-bomber-v04-stage0-convergence.md)（v0.4 收敛）、[`0015`](../../../.spec/decisions/0015-bomber-stage0a-runtime-capability-finding.md)（Runtime 接入核验结论与实现口径）
> **冻结物**：`modules/server-gameplay/src/Lumio.Game.ServerGameplay/Bomber/Contracts/**`（不含 `generated/`）；内容 sha256（源文件按路径升序拼接后整体哈希）：`f82fdb88bee3384c6a70d40fceea50c9ba39292770dffd17b632c94a14c173fd`

## 0. Runtime 接入核验

核验对象：sibling `LumioGameRuntime` 仓（本机路径 `../LumioGameRuntime`，供 Game 通过 `LumioRuntimeRoot`/`LUMIO_RUNTIME_ROOT` 引用）。核验方法：直接阅读 Runtime 源码与其自身测试，并在 Game 侧写出真实可运行的探针测试对照验证，不采信「应该可行」的推断。

| # | 待核验能力 | 结论 | 证据 |
|---|---|---|---|
| ① | Game 可定义并注册全新 Component（不复用 Username 样例） | **可行** | `[EcsComponent]`/`[EntityType]`/`[Has]` 等注解全部 `public`；`EcsRegistry`/`WorldManager.Create(EcsRegistry, ulong?)` 接受任意注册表；`gen-declarations` CLI（`LumioGameRuntime/tools/gen-declarations`）以 `--namespace`/`--assembly-name`/`--sources` 为参数、与命名空间无关，可直接对 Game 自己的源码目录生成 Registry + 组件 partial。已用 6 个自定义 EntityType/Component 实证（见 §1）。 |
| ② | Game 可注册 Processor，参与 Runtime 的 Logical Tick 编排 | **不可行，硬阻塞** | `modules/ecs` 无任何 `ISystem`/`IProcessor` 抽象；`modules/simulation` 的 `TickExecutorComposition` 构造函数、`SimulationSession` 构造函数、`SimulationModule.CreateSession(options, composition)` 重载均为 `internal`，`InternalsVisibleTo` 只授权 Runtime 自身测试程序集。`WorldManager.Tick()` 公开但内部序列（ApplyInputs→CommitCreates→StampAndProject→ConsumeSave）固定、无扩展点。**Game 现有 Chat 功能本就不经此路径**——`ChatSetMessageSystem.Admit/SetMessage` 由 Game 代码直接调用，配合 `manager.Tick()`，同一模式本次沿用（见 §2）。 |
| ③ | Game 可发起 CrossWorldTxn，触及 `IVoxelWorldPort` | **不可行，设计上刻意阻塞** | `internal interface IVoxelWorldPort`（`coordination/Prepare/TxnPrepareCoordinator.cs:73`）与全部请求/结果类型 `internal`；唯一公开的 `CoordinationModule.Create(initialRevision)` 固定接一个私有 `FailClosedVoxelWorldPort`；接受自定义端口的重载 `internal static`。Runtime 自身用反射测试 `VoxelAdapterSurfaceTests.SubstituteVoxelContractTypesAreNotExported` 断言 Voxel 契约类型永不导出。与 [`../risks-and-engine-asks.md`](../risks-and-engine-asks.md) A2（`LumioVoxelEngine` 尚未导出 C 接口）互证：即便端口公开，当前也无真实 Voxel 后端可接。 |
| ④ | 可取得确定性逐 Tick 快照并哈希，用于「同 Seed 可重放」 | **可行** | `WorldManager.CaptureSnapshot()` 公开，返回可复制 `byte[]`；Game 自行 SHA-256。已用真实测试证明：同一命令序列在两个独立 `WorldManager` 实例上产出逐字节相等的快照哈希（`SameSeedAndCommandSequenceProducesByteIdenticalSnapshotOnTwoIndependentWorlds`）。Runtime 内部另有更完整的 `StateHashCoordinator`（`Determinism/StateHashCoordinator.cs`），但其官方接线只经 `TickExecutionContext`（internal），Game 不可达；Game 自算快照哈希已足够 Stage 0a 的确定性门。 |

**结论对实现口径的影响**（ADR 0015 定案，详见该 ADR）：Stage 0a 的规则内核（G-1/G-2/G-3/G-4）**不经** Runtime `simulation`/`coordination`，改为 Game 自有普通 C# 函数、由 Scenario 宿主（G-6）在每次 `WorldManager.Tick()` 前后按固定顺序调用；地图格子（材质/据点）在 Stage 0a 是 Game 自有 Component 状态，不是真实 Voxel 存储，真实 Voxel 集成留给 Stage 2+。

**复现命令**：

```bash
dotnet build modules/server-gameplay/src/Lumio.Game.ServerGameplay/Lumio.Game.ServerGameplay.csproj
dotnet build modules/server-gameplay/tests/Lumio.Game.ServerGameplay.Tests/Lumio.Game.ServerGameplay.Tests.csproj
dotnet exec modules/server-gameplay/tests/Lumio.Game.ServerGameplay.Tests/bin/Debug/net10.0/Lumio.Game.ServerGameplay.Tests.dll --xunit-list tests
dotnet exec modules/server-gameplay/tests/Lumio.Game.ServerGameplay.Tests/bin/Debug/net10.0/Lumio.Game.ServerGameplay.Tests.dll
```

2026-09-04 实测：`total: 26, failed: 0, succeeded: 26`（含 `Bomber.RuntimeIntegrationProbeTests` 3 个用例）。

## 1. Component 面（Server 权威，`Bomber/Contracts/Components/`）

单位纪律：位置一律 milli-cell 定点（1000 = 1 格）；时间一律 Tick（`ulong`）；`NetEntityId` 不满足 `Sync<T>` 的隐式约束，一律以 `*Raw` 后缀的裸 `ulong` 编码表示；全部字段整数（config IntegerOnly 纪律向下游对齐）。已在 §0 的探针测试中注册、创建、Tick、快照全部通过。

| Component | 挂载实体类型 | 字段 | design.md 出处 |
|---|---|---|---|
| `BomberMatchState` | `BomberWorldEntity`（World 单例） | `MatchTick:u64`、`StartTick:u64`、`EndTick:u64`、`Phase:i32`（0 Warmup/1 Running/2 Endgame/3 Settlement）、`HatKingNetEntityIdRaw:u64`（0=无帽王） | §4 / §4.1 / §13 |
| `BomberPlayerState` | `BomberPlayerEntity` | `Hearts:i32`、`HatCount:i32`、`BombPower:i32`、`BombCapacity:i32`、`SpeedTier:i32`、`RespawnAtTick:u64`、`ProtectedUntilTick:u64`、`CellX/CellY:i32`、`PosMilliX/PosMilliY:i32` | §7.1 / §9 / §10 / §12 |
| `BomberBombState` | `BomberBombEntity` | `OwnerNetEntityIdRaw:u64`、`CellX/CellY:i32`、`FuseEndTick:u64`、`Power:i32`、`ChainId:u64` | §7.1 / §7.2 / §7.5 |
| `BomberExplosionCell` | `BomberExplosionCellEntity` | `ChainId:u64`、`SourceBombOwnerNetEntityIdRaw:u64`、`CellX/CellY:i32`、`DangerUntilTick:u64` | §7.2 / §7.5 / §12 |
| `BomberHatPile` | `BomberHatPileEntity` | `Count:i32`、`CellX/CellY:i32`、`ExpireAtTick:u64` | §9.2 |
| `BomberPickupItem` | `BomberPickupItemEntity` | `Kind:i32`（0 FirePlus/1 BombPlus/2 SpeedPlus）、`CellX/CellY:i32` | §7.4 / §8.5 |

**明确不在本冻结物内**：地图材质网格本身（硬砖/软砖/空地布局）尚未定为 Component 形态，留给 G-4 按 §5.3 断言设计具体表示（Game 自有状态，不经 CrossWorldTxn，见 §0 结论）；装备/技能相关 Component 属 Stage 5，不进 Stage 0a 契约。

## 2. 内部命令（`Bomber/Contracts/Commands/`）

Game 内部 DTO，不依赖 Runtime；Bot 与回放场景直接构造，不经网络。网络包络由 C-1 在架构源登记。

| 类型 | 字段 | 说明 |
|---|---|---|
| `MoveIntent` | `DirX:int, DirY:int` | 各自 ∈ {-1,0,1}（八向）；越界值由调用方在构造前校验 |
| `PlaceBombIntent` | 无 | 落点由服务器按 §6.1「炸弹总是落在最近的合法格中心」计算 |

## 3. 事件（`Bomber/Contracts/Events/`）

服务器权威事件，Game 内部 DTO；由规则内核（G-1/G-2/G-3）产出，经 `IBomberTelemetrySink` 落遥测（G-7），网络包络由 C-1 登记。

| 事件 | 字段 | design.md 出处 |
|---|---|---|
| `BombPlaced` | `OwnerNetEntityIdRaw, CellX, CellY, FuseEndTick, Tick` | §7.1 |
| `BombExploded` | `ChainId, SourceBombOwnerNetEntityIdRaw, CellCount, Tick` | §7.2 |
| `DamageApplied` | `VictimNetEntityIdRaw, SourceBombOwnerNetEntityIdRaw, ChainId, HeartsLeft, Tick` | §7.5（同一 `SourceBombId` 对同一玩家只出现一次） |
| `PlayerDied` | `VictimNetEntityIdRaw, KillerNetEntityIdRaw, ChainId, CellX, CellY, Tick` | §9.1（自杀时 Killer==Victim） |
| `PlayerRespawned` | `NetEntityIdRaw, CellX, CellY, Tick` | §12 |
| `HatPileSpawned` | `CellX, CellY, Count, ExpireAtTick, Tick` | §9.2 |
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

## 5. Config Schema（G-5 落地，键名与默认值冻结）

全部整数（时间用毫秒或 Tick 整数，速度用 Tier + 换算表）；来源标注见 design.md §15 数值来源纪律。

| 键 | 类型 | 首轮默认值 | design.md 出处 |
|---|---|---|---|
| `fuseMs` | int | 2100 | §7.1（A/B：1800/2400） |
| `dangerWindowMs` | int | 350–400 | §7.1（A/B：300/500） |
| `initialBombPower` | int | 2 | §7.1（A/B：1） |
| `initialBombCapacity` | int | 1 | §7.1（固定） |
| `speedTierToCellsPerSecond[]` | int[] | Tier0=3500（milli-格/秒） | §7.1（A/B：3300/3800） |
| `respawnMs` | int | 3000 | §12（A/B：4000） |
| `respawnProtectionMs` | int | 1500 | §12 |
| `hatPileExpireMs` | int | 15000 | §9.2（A/B：12000/20000） |
| `matchDurationMs` | int | 360000（6 分钟） | §4（A/B：300000/480000） |
| `inputBufferMs` | int | 100–150 | §6.1 |
| `tickRateHz` | int | 20 | Gate 0（推断待验证） |
| `heartsMax` | int | 3 | §12 |
| `dropRatePermille` | int | 300 | §7.4 |
| `hatPileMinStacks` / `hatPileMaxStacks` | int | 3 / 6 | §9.2 |
| `mapSize` | int | 19 | §5（Stage 0a 固定，无分区档位） |

A/B 变体文件（每个只改一键）：`fuse-1800`、`fuse-2400`、`power-1`、`speed-3300`（Tier0=3.3）、`speed-3800`、`respawn-4000`、`hat-expire-12000`、`hat-expire-20000`、`match-300000`、`match-480000`。

## 6. Scenario / 命令流 / StateHash 文件格式（G-6 落地）

三个文件，均带 `schemaVersion: 1`：

- `scenario.json`：`{schemaVersion, seed, configVersion, mapSeed, bots:[{name, behavior, params}], durationTicks}`。
- `commands.ndjson`：每行 `{tick, netEntityIdRaw, command: "Move"|"PlaceBomb", dirX?, dirY?}`。
- `statehash.ndjson`：每行 `{tick, sha256Hex}`（`sha256Hex` = `SHA256(manager.CaptureSnapshot())` 的十六进制）。

回放 oracle 判据：两次运行的 `statehash.ndjson` 逐行相等（不得只比行数）；空文件或截断文件必须 FAIL（沿用 `integration/entity-chat` 的 oracle 纪律）。

## 7. 与 design.md 待验证项的对应

本契约冻结的是**类型形状**，不是数值；本文档的默认值全部来自 design.md §15「首轮可测默认值」，验证方式与阶段仍以 design.md §15 为准，不在本文档重复。
