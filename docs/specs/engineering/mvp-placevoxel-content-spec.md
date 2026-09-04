# MVP 内容规格：PlaceVoxelAbility（挖/放方块）

> **状态**：设计中
> **架构基线**：`LGE-V1.4-2026-08-27`（唯一架构源 `LumioGameEngineArchitecture`，本仓镜像 [`../../architecture/LumioGameEngine_Architecture_v1.4.md`](../../architecture/LumioGameEngine_Architecture_v1.4.md)）
> **上游**：架构评审稿 §7 垂直切片（[`Pro-LumioGameEngine_V3_Architecture_Review_2026-08-26.md`](../../architecture/Pro-LumioGameEngine_V3_Architecture_Review_2026-08-26.md)）、v1.4 §5–§7/§9/§11、MVP 大纲（架构仓 `docs/plans/mvp-browser-voxel-multiplayer.md`，A0 阶段）
> **定位**：设计文档，不含实现代码；来源 Workflow 卡 R-00259。配套文档：[`module-scaffolding-design.md`](module-scaffolding-design.md)（工程骨架与依赖边界）

## 1. 目标与范围

定义 MVP A0 验收物 **`PlaceVoxelAbility`（挖/放方块）** 的 GAS 内容、Server/Client Component 与 Replication Mapping、最小 config/content 面，以及对 GameRuntime `gas`（R-00159）/`replication`（R-00172）模块的接口假设。

**不在范围内**：实现代码；Runtime 通用 GAS 生命周期 / Prediction / Coordinator（Runtime 所有）；Voxel Chunk/Revision 语义（VoxelEngine 所有）；传输与 Host（Server/Client 所有）；任何公共契约新增——**需要新公共字段/能力时停下、卡上标 BLOCKED 上报**。

## 2. 能力面：两个 Ability

评审稿 §7 冻结的垂直切片锚点是 `PlaceVoxelAbility`；MVP 大纲要求「挖/放方块」。本设计定为**两个 GAS Ability TypeId**，共享同一 Command/Txn/Mapping 骨架：

| Ability | 语义 | Cost | 结果 |
| --- | --- | --- | --- |
| `PlaceVoxelAbility` | 在目标 Cell 放置 MaterialId 方块 | `AvailableBlocks - 1`（Prepare 期预留） | Voxel 置块 + 资源扣减，同 Txn 原子提交 |
| `DigVoxelAbility` | 移除目标 Cell 方块 | 无消耗 | Voxel 清块 + `AvailableBlocks + 1`（封顶 `MaxBlocks`），同 Txn 原子提交 |

- `PlaceVoxelAbility` 是架构锚点，语义一字不改自评审稿 §7.3–§7.4；`DigVoxelAbility` 是 MVP 内容级对称件（非架构锚点），只复用同一骨架，不引入新公共语义。
- 两者遵守 ADR-031：只在 Ability `Executing` 内定义业务子状态；不增删通用状态名（`Requested → Activated → Executing → Completed`；`Requested/Activated → Rejected`；非终态 → `Cancelled`；`Executing → Expired`；预测拒绝 → `RolledBack`），不改回滚窗口与 Handle 失效规则。
- Cooldown：MVP 均为 `0` tick（配置项预留，见 §6.1）；Targeting：目标 Cell 与施法者距离 ≤ `BuildRadius` 且所在 Chunk 已加载；权限：`BuildPermissionAuthority.CanBuild`，仅 Server 校验。
- Formula/数值一律整数定点（§6 的 IntegerOnly 纪律向上游对齐确定性要求）。

## 3. Component 面（Server/Client 非对称）

沿用评审稿 §7.1，字段与类型冻结如下；Server 与 Client 的 Component 名称、字段、生命周期、存在性均不同，禁止做成同名对称件。

### 3.1 Server（权威，`GameWorld`）

```text
BuildResourceAuthority            # 可复制
- AvailableBlocks: int32          # 当前建造资源
- ResourceRevision: uint32        # 资源变更单调修订

BuildPermissionAuthority          # Server-only，不复制
- CanBuild: bool
- BuildRadius: int32              # 定点：milli-cell（1000 = 1 cell），见 §6.1
```

### 3.2 Client（投影/表现，`ReplicaWorld`）

```text
BuildResourceHudReplica           # 复制目标
- DisplayBlocks: int32
- LastConfirmedTick: uint64

BuildGhostPresentation            # Client-only，本地表现
- TargetCell: int32 ×3
- VisualState: enum { Idle, Previewing, Pending, Rejected }
```

- GAS 与 ECS 单一真相：权威可复制状态（资源计数）落在 ECS Component（`BuildResourceAuthority`），GAS 侧只持框架索引与瞬时执行上下文（对齐 Runtime 已锁决策）；不在 GAS 内保存第二份资源计数。
- `BuildGhostPresentation` 只由 Presentation Processor 消费，渲染只走 `EmitPresentationDiff` 与副本世界只读投影（MVP 六条红线 §5-1/2）。

## 4. Replication Mapping

每条 Mapping 按 v1.4 §5.3 全字段声明。首批共三条：

| 声明项 | M1 资源 HUD | M2 权限 | M3 Ghost |
| --- | --- | --- | --- |
| Source | `BuildResourceAuthority.AvailableBlocks` | `BuildPermissionAuthority` | —（无 Server 对应） |
| Target | `BuildResourceHudReplica.DisplayBlocks` | 不复制 | `BuildGhostPresentation`（Client 本地） |
| Role | `ServerToClient` | —（Server 校验专用） | —（Client 本地） |
| Owner/AOI | OwnerOnly | — | — |
| Initial / Continuous | Included / OnChange | — | — |
| 可靠性 | ReliableOnChange | — | — |
| Quantization | 无（int32 原值） | — | — |
| Predicted | Predicted（预测扣减，权威确认覆写） | — | — |
| Add/Remove/Tombstone | 随 Entity 生命周期；Tombstone 按 §5.2 | — | — |
| 版本 | v1 | v1 | v1 |

- `LastConfirmedTick` 由 Client 侧在权威更新事务 `ApplyAuthoritativeEcsGasVoxel` 步内写入，不占独立 Mapping。
- Voxel 块变更**不走本表**：方块状态经 Runtime 的 Voxel 复制域（FullSnapshot/Delta）到 `VoxelReplicaWorld`，本仓不为其建 ECS Mapping（越权面）。
- `Role` 取值集合按现状消费 generated 目录（`Lumio.Gen.MappingTable` 的 `{ServerToClient, ClientToServer, SharedProjection}`）；Mapping 声明的机器格式待 R-00172 落地面冻结（见 §7）。

## 5. Command 与 Cross-World Txn 链路

### 5.1 Command（evented，经生成契约与权限校验，无本地旁路）

```text
PlaceVoxelCommand                    DigVoxelCommand
- NetEntityId                        - NetEntityId
- Cell: int32 ×3                     - Cell: int32 ×3
- MaterialId: uint16                 -（无 MaterialId）
- ClientCommandSeq                   - ClientCommandSeq
- PredictionKey                      - PredictionKey
- ExpectedGameRevision               - ExpectedGameRevision
- ExpectedVoxelRevision              - ExpectedVoxelRevision
```

### 5.2 执行顺序（消费 CrossWorldTxnV1，本仓零新增语义）

1. Server 收 Command，验证 Release/Schema/Ownership（生成门 ADR-022 先行）；
2. GAS Prepare：预留资源（Place：`AvailableBlocks ≥ 1`；Dig：封顶校验），不产生可见副作用；
3. Voxel Prepare：Chunk 可用、Cell 可放置/可移除、Revision 匹配 → Prepared Token；
4. Coordinator 固定 Barrier 决定 Commit；`VoxelCommit → EcsCommandBufferCommit` 顺序不可改，`GasAndEventFinalize` 是唯一权威 Commit Point；
5. 产出 `SessionRevisionVector`、GAS Authority Confirm、Replication Delta；
6. Client 经单一权威更新事务（v1.4 §7.2 六步）原子应用；失败回滚 Ghost/Cost 预测（`RolledBack`）；
7. 重复 `TxnId / ClientCommandSeq` 返回原结果，**不得二次扣费/二次建造**。

失败路径全部要有 Fixture：资源不足、无权限、超距、Chunk 未加载、Revision 冲突、重复命令、Delta 丢失 → Resync、断线重连（对齐 README「Headless Test Surface」与 v1.4 §6.2-8）。

## 6. 最小 config/content 面

### 6.1 Config（经 Runtime Config Port，typed table）

表 `build.basics`（v1，全部整数——见 §6.3 IntegerOnly）：

| 列 | 类型 | MVP 默认 | 说明 |
| --- | --- | --- | --- |
| `initialBlocks` | int32 | 20 | 出生资源 |
| `maxBlocks` | int32 | 99 | Dig 返还封顶 |
| `buildRadiusMilliCell` | int32 | 5000 | 定点半径（1000 = 1 cell） |
| `placeCooldownTicks` | int32 | 0 | 预留 |
| `digCooldownTicks` | int32 | 0 | 预留 |

- 源配表人类可读（JSON），`columns` 与 `activation` 必填，经 Schema 校验/默认值合并/编译为 typed binary table；层级顺序与激活规则按 v1.4 §11.3 消费，不自定义层级。
- MVP 数值是**占位默认**，只为跑通链路；调参属产品数值卡，不在本卡范围。

### 6.2 Content（MaterialId 目录）

```text
material-palette v1
- 0: Air        # 语义保留：Dig 结果；不可作为 Place 输入
- 1: Dirt
- 2: Stone
```

- `MaterialId` 是本仓拥有的产品语义目录；Voxel 侧按不透明 uint16 存取（经 `IVoxelWorldPort`），VoxelEngine 不解释其含义（假设 A6，§7）。**⚠ 假设 A6 已被上游证伪**（ADR [0019](../../../.spec/decisions/0019-bomber-terrain-align-voxel-world-contract.md)）：公共契约 `voxel-world-v1.json` 冻结的格值是 **32 位无符号 `BlockId` = `BlockType << 8 | BlockState`**，引擎按 BlockType 查材质类表解释它（网格 / 渲染通道 / 碰撞 / 透光四轴）。本节按 uint16 不透明目录写的部分随本文档整体重做时一并修正，本次只作标注。
- **目录内容归本仓，引擎只给机制**（ADR [0019](../../../.spec/decisions/0019-bomber-terrain-align-voxel-world-contract.md)，取代 ADR [0016](../../../.spec/decisions/0016-bomber-terrain-out-of-ecs-3d-coords.md)「方块目录归 Voxel 侧」一条）：上游 `blockCatalog.mintingProcedure` 原文「官方内容层在目录里加一行；**实现仓不得自行铸号**」。引擎交付的是段表（作用域位 bit 23、全局段 256 起连号稠密）、材质类的两个类（Solid / Liquid）与四轴、目录行的六字段结构与加载期校验；**表里填哪些方块、什么外观、归哪一类是本仓的配置**，随 `GameReleaseId` 锁定。**每个方块在某一产品里的行为绑定**（可破坏、阻断爆炸、破坏后残留、掉落、地面效果、可通行）同样归本仓，且**不是引擎四轴之一**——引擎的 `Liquid.collision = passable`，水在引擎里不挡路。同一块「水」在炸弹人是阻断爆炸 + 禁止放弹 + 溺水，在其他产品可以是别的语义。本表 `material-palette v1` 是 PlaceVoxel MVP 的最小目录；炸弹人自己的方块清单见 [`../risks-and-engine-asks.md`](../risks-and-engine-asks.md) A9 ①。
- `Place(MaterialId=0)` 在 Schema 校验层拒绝，挖块只走 `DigVoxelCommand`——两条路径不混用。

### 6.3 Config/Content Hash 口径（ADR-041 现状消费）

- 规范化与摘要遵守架构仓 `packages/canonical/canonical-digest-profile.json`：`CanonicalJsonV1`（成员 code point 升序、`AsciiEscaped`、拒绝重复/未知成员、**`numbers: IntegerOnly`——非整数构建期失败**）+ SHA-256（framing 取 profile 原词 `PrefixFreeOverCanonicalBytes`：域分离靠输入对象内 `digestDomain` 成员、不加外部 framing 头；Manifest 域例外无该成员）。§6.1/§6.2 全部数值设计为整数即源于此。
- ADR-041 冻结的 digestDomain 仅五个（`Manifest / ArtifactSet / ArtifactIndex / TargetProfile / CapabilitySet`）；**Config/Content 尚无专属 domainTag**。本设计按现状消费：ReleaseManifest 的 `ConfigHash + ContentHash` 以 canonical bytes 的 SHA-256 计算，domainTag 缺位记为显式假设（A7）；若需要注册新 domainTag，属公共契约变更——停下、卡上标 BLOCKED 上报。
- `snapshotId`、`mappingSetHash` 不在 ADR-041 覆盖范围，本文不引用它们作为 digest 口径。

## 7. 对 GameRuntime 的接口假设（R-00159 / R-00172）

两卡（架构项目 Workflow：R-00159 `gas` Type/Handle Context、R-00172 `replication` Mapping Registry 与 Identity Context）**均在 backlog，接口面未落地**。以下假设全部标注来源；任何一条失配：实现面差异在本仓适配层吸收，公共契约冲突升级架构源，不得在本仓改写公共语义。

| # | 假设 | 来源 |
| --- | --- | --- |
| A1 | Runtime `gas` 提供 Ability/Effect TypeId 注册与 Handle 生命周期；Game 以内容包形式注册 `PlaceVoxelAbility`/`DigVoxelAbility` 的 CanActivate/Cost/Targeting 回调，不触碰通用状态机 | v1.4 §9、ADR-031；R-00159 卡面「GAS Type/Handle 与 ECS 单一真相」 |
| A2 | GAS 权威可复制状态投影回 ECS（单一真相）；Game 的资源计数只存 `BuildResourceAuthority` | R-00159 卡面已锁决策；v1.4 §9 |
| A3 | Runtime `replication` 提供 Mapping Registry，接受 per-Component 声明（§4 全字段）并负责生成稳定 ID/序列化器/权限元数据；Game 只交声明不写 Serializer | v1.4 §5.3、README「Replication Mapping」；R-00172 卡面 |
| A4 | `NetEntityId`（128 位不透明）/`LocalEntityId` 语义按 v1.4 §5.2；Game 不解析位布局 | v1.4 §5.2；R-00172 卡面「Net/Local Identity Context」 |
| A5 | CrossWorldTxnV1、十三相、`GasAndEventFinalize` 唯一 Commit Point 按 v1.4 §4/§6 由 Runtime `coordination`/`simulation` 提供；Game 只消费 | v1.4 §4.5、§6.2 |
| A6 | ~~`IVoxelWorldPort` 提供带 Revision 只读查询与 CrossWorldTxn 置块/清块；MaterialId 对 Voxel 不透明~~ **已证伪**：`IVoxelWorldPort` 是 `internal` 且有反射测试断言 Voxel 契约类型永不导出（ADR 0015）；格值是 32 位无符号 `BlockId`，引擎要解释它（ADR 0019） | README「职责」；v1.4 §6；ADR 0015 / 0019 |
| A7 | Config/Content Hash 按 §6.3 口径、暂无专属 digestDomain；Runtime Config Port 消费 typed binary table 与 `ConfigRevision` | v1.4 §11.3；ADR-041 现状 |
| A8 | C# generated 面经本仓 `Lumio.Game.GeneratedContracts` 单点消费（**分层纪律**，非 TFM 约束）；**凡 generated 面已提供者必须委托使用、不得另造**（ADR-048 published rule，含 `ProtocolGate.Evaluate`；gate 不校验角色权限，不足则 BLOCKED 上报不得本地补表）；同时设计不因 generated 面缺失或收窄而阻塞。现状以 §6.1 为准 | [`module-scaffolding-design.md`](module-scaffolding-design.md) §6 |

## 8. Scenario 与 Headless 测试面

`Scenario.PlaceVoxel.BasicV1`（评审稿 §7.6 原样消费）＋ Dig 扩展：

1. Tick 0 建玩家与空 Cell；Tick 5 合法建造 → 资源 −1、Voxel 存在、Client 显示一致；
2. Tick 6 重复同一 Command → 无二次扣费/建造；
3. Tick 10 过期 `ExpectedVoxelRevision` → 两域都不提交；
4. Delta 丢失 → Gap → Resync；断线重连 FullSnapshot → `NetEntityId` 不变、`LocalEntityId` 可重建；
5. 结束断言无 Native Handle/ALC Scope/Timer/Task 泄漏；
6. **Dig 扩展**（MVP 内容级）：合法挖除 → 资源 +1 封顶、Voxel 清块；挖空 Cell → Prepare 拒绝。

- `RequiredCapabilities`：`ReferenceVoxel`（A0 用 ReferenceVoxelPort）；至少在 Reference/PureHeadless 与 LocalEmbedded 运行（A0 范围），NativeHeadless/LocalSplitProcess 随轨道 B/A1 接入。
- Replay：Failure/Replay Bundle 构成按评审稿 §7.7；首差异定位到 Tick/World/NetEntityId/Component/Chunk。

## 9. 首批实现卡拆卡蓝图（验收第 3 条）

前置：脚手架卡 S1–S5（见 [`module-scaffolding-design.md`](module-scaffolding-design.md) §7）完成。各卡文件集互不重叠：

| 卡 | 交付 | 独占文件集 | 结构化验收项 |
| --- | --- | --- | --- |
| C1 Component + Mapping 声明 | §3 四个 Component 与 §4 三条 Mapping 声明 | `modules/server-gameplay/src/**/Build*`、`modules/client-gameplay/src/**/Build*`、`modules/mapping/src/**/PlaceVoxel*` | ① 声明含 §4 全部字段并过 mapping 校验测试；② Server/Client 程序集互不引用（架构测试）；③ 权限 Component 无任何 Mapping 声明 |
| C2 GAS 内容 | 两个 Ability 的注册、Cost/Targeting/权限回调 | `modules/gas-content/src/**` | ① 状态机只挂 `Executing` 业务子状态（ADR-031 断言测试）；② Prepare 无可见副作用（测试）；③ 重复 PredictionKey 幂等 |
| C3 Config/Content 面 | `build.basics` 源表 + Schema、material-palette、Hash 计算输入 | `modules/config/src/**`、`modules/content/src/**` | ① 全数值整数、非整数构建期失败（负例测试）；② canonical bytes 摘要与 ADR-041 Golden 口径一致；③ `Place(Air)` Schema 层拒绝 |
| C4 Scenario 断言集 | `Scenario.PlaceVoxel.BasicV1` + Dig 扩展声明与断言 | `modules/scenario/src/**` | ① §8 六组断言齐全含全部失败路径；② `RequiredCapabilities` 声明并过 Host 匹配校验；③ Replay 首差异断言接入 |

依赖：C1 → C2/C4；C3 独立可并行；C2/C4 文件集不重叠可并行。凡卡内发现需要新公共字段/错误码/能力 → 该卡 BLOCKED 上报架构源，不得本仓私设。

## 10. Known gaps

- R-00159/R-00172 未开工，§7 假设待 Runtime 面落地后逐条复核；失配处置已内联在 §7 前言。
- Config/Content 专属 digestDomain 缺位（§6.3），待架构所有者裁决。
- Dig 扩展与 material-palette 为 MVP 内容级设计，未经产品数值评审；占位默认值只为链路验收。
- Windows 侧工程基线验证未执行；缺口不消解、不豁免，义务下移给 S1 实现卡（TD 裁决 2026-08-29 第四节，详见 [`module-scaffolding-design.md`](module-scaffolding-design.md) §8）。
