# LumioGame

> Lumio 游戏产品、Gameplay Content、发布组合和产品语义的唯一事实源。

## 架构基线

- Baseline：`LGE-V1.4-2026-08-27`
- 唯一架构源：`LumioGameEngineArchitecture`
- 本地镜像：[`docs/architecture/LumioGameEngine_Architecture_v1.4.md`](docs/architecture/LumioGameEngine_Architecture_v1.4.md)
- ADR 索引：[`docs/architecture/ADR_INDEX.md`](docs/architecture/ADR_INDEX.md)
- 最终 Review 合并稿：[`docs/architecture/LumioGameEngine_V3_Architecture_Review_Final_2026-08-27.md`](docs/architecture/LumioGameEngine_V3_Architecture_Review_Final_2026-08-27.md)

`LumioGame` 位于依赖图最上层，把 `LumioEngineSDK`、Server、Client 和玩法内容组合成具体游戏。它同时产出同一 `ProductId + GameReleaseId` 下的 Server Gameplay、Client Gameplay、Component Schema、Replication Mapping、配置、内容、Scenario、Migration 和签名发布清单。

本仓库拥有玩法语义，不拥有 Native、Voxel 内部、网络连接、Host 进程或 Runtime 生命周期。A 游戏 1.1、BOE 2.1 等产品/版本可以同时发布，但每个 Session 只绑定一个精确 Release。

## Architecture Gate

Gameplay Schema、Replication Mapping、GAS/Config/Content/Migration Schema、ID Registry、正向/失败 Fixture 和契约校验器只维护在 `LumioGameEngineArchitecture`。新增玩法先补 Schema、Scenario、失败路径和 Replay 断言，再生成 Server/Client 产物；在架构源执行 `python3 tools/lumio_contract.py validate`，本仓库不手写重复 MessageId、Serializer 或 ABI 定义。

## 拥有的状态与生命周期

- Server Gameplay 的权威 Component、Processor、GAS Content、任务、经济、建造和玩法事件。
- Client Gameplay 的 Replica、Prediction/Presentation Component 和输入映射。
- Component/Entity/Field/Role/AOI 的 Replication Mapping 与权限声明。
- Config/Content/Scenario/Replay Fixture、Product Release 和语义 Migration。
- GameWorld/ReplicaWorld 的初始化、注册、快照投影和销毁 Hook；不拥有宿主状态机。

## 子模块

| 子模块 | 责任 | 首批状态 |
| --- | --- | --- |
| `server-gameplay` | 权威 Component、Processor、Command/RPC Handler | P0 |
| `client-gameplay` | Replica、Prediction、Input 和 Presentation Processor | P1 |
| `mapping` | Entity/Component/Field/Role/AOI/可靠性 Mapping | P0 |
| `gas-content` | Ability、Effect、Attribute、Tag、Formula、Cost、Cooldown | P1 |
| `config` | 源配表、Schema、默认值和 typed table 输入 | P1 |
| `content` | 资产引用、依赖、Hash、签名和平台变体 | P1 |
| `scenario` | 初始状态、输入、Bot、断言、Capability 要求 | P1 |
| `migration` | Game State/Save/Content 版本迁移和引用校验 | P1 |
| `release` | Product/GameRelease、Manifest、Catalog 和发布组合 | P1 |
| `mod-reserved` | P2 ModManifest/Capability 挂接点，仅预留 | P2 |

## 职责

- 定义 Server/Client 非对称 Component、Processor、RPC Payload、Mapping 和权限语义。
- 通过 Runtime API 实现具体 GAS Content、公式、Targeting、资源消耗、Cooldown 和表现事件。
- 通过 `IVoxelWorldPort` 请求带 Revision 的只读查询和 CrossWorldTxn，不访问 Voxel Storage。
- 定义 Scenario、Bot 行为、Replay Fixture、性能 Workload 和业务断言。
- 提供 Game Migration、Save/Load 语义、ReleaseManifest、Config/Content Hash 和签名输入。
- 声明每个 Scenario 的 `RequiredCapabilities`，避免假设所有 Host 都具备 Native、Renderer 或网络。

## 明确不负责什么

- 不实现 ECS Storage、Tick Scheduler、GAS 通用生命周期、Prediction/Rollback 机制或 Runtime Hot Reload。
- 不创建/销毁 Host、WorldSlot、CoreCLR、ALC、Socket、Connection 或 Release Pool。
- 不实现 Voxel Chunk、Revision、Streaming、Mesh 或 Native ABI。
- 不把 Server/Client 强制做成同名 Component 或同一份 World。
- 不在 Gameplay 中读取 `IsOffline`、平台或 Transport 实现来分叉规则。
- V1 不加载第三方 Mod；Mod 仅保留 P2 受控扩展位置。

## Gameplay 与 World 边界

Server GameWorld 是 Gameplay/ECS/GAS 权威域；VoxelWorld 是 Rust Voxel 权威域；Client ReplicaWorld/VoxelReplicaWorld 是投影和预测域。任何同时修改资源和方块的能力必须通过 Runtime `CrossWorldTxnV1`，不能直接跨 World 读写或保存第二份 Voxel 真相。

## Replication Mapping

每条 Mapping 必须声明 Source Entity/Component/Field、Target、Role、Owner、AOI/Visibility、Initial/Continuous、Reliable/Unreliable、Quantization、Predicted/Authoritative、Add/Remove/Tombstone 和版本。典型规则：

```text
BuildResourceAuthority.AvailableBlocks
  -> BuildResourceHudReplica.DisplayBlocks (OwnerOnly, ReliableOnChange)
BuildPermissionAuthority -> 不复制，仅 Server 校验
BuildGhostPresentation -> Client 本地
```

生成器负责稳定 ID、序列化器、权限元数据和 Mapping 测试；禁止手写重复 MessageId、布局或 Native Handle。

## GAS Content

Game 只定义具体内容和产品语义：Ability/Effect/AttributeSet/Tag、Formula、Targeting、Cost、Cooldown、权限和表现事件。Runtime 负责生命周期、Handle、Stack、PredictionFrame、Snapshot/Restore 和确定性；Server 负责权威验证，Client 负责输入和表现策略。复杂 Trigger Graph、Formula VM 和跨 Ability 求解器列为 P2。

## CrossWorld 场景约束

以 `PlaceVoxelAbility` 为首个垂直切片：Command 携带 `ClientCommandSeq、PredictionKey、ExpectedGameRevision、ExpectedVoxelRevision`；Server 校验权限/资源/Chunk，Runtime Coordinator 执行 Prepare/Reservation/Commit，最终生成 `SessionRevisionVector`、Delta、Audit、Txn Journal 和 Replay 记录。重复命令必须返回原结果，不得二次扣费。

## 配置、内容与存档

- 人类可读配表经 Schema 校验和编译，运行时只消费 typed binary table。
- 配置层级和优先级由架构基线固定；每个 Tick 使用不可变快照，开发可热载，生产显式版本切换。
- Content/Config/Gameplay Snapshot 使用版本、Length、Hash/Checksum、Compression 和签名元数据；读取路径必须先校验元数据再反序列化，失败不得激活半成品。
- Singleplayer 与 Dedicated Server 在同一 Release 使用可移植 Save/Snapshot；跨版本由本仓库提供 Migrator。
- Migrator 在不可变 Snapshot 的 Staging 副本上运行，完成引用/资源上限校验后才原子激活，失败保留旧数据。

## 日志与观测

定义 Gameplay Diagnostic、Audit、Economy/Permission Audit、Scenario Assertion 和业务 Trace Event；Host 提供成熟框架的异步 Sink。事件至少带 `ProductId、GameReleaseId、SessionId、WorldId、TickId、TxnId、NetEntityId、PredictionKey、TraceId`。Gameplay 不直接写文件或阻塞 Simulation Thread。

## ReleaseManifest 与 ReleaseCatalog

每个产品/版本发布组合至少包含：

```text
ProductId + GameReleaseId
Server/Client Gameplay Hash
Gameplay Contract + Mapping Hash
Runtime API / CoreEngine ABI / Capability
Network/Replication Protocol
Voxel Schema/Migration
Config/Content Hash
Signature / SBOM / Dependencies
```

`ReleaseCatalog` 由架构/发布工具生成签名清单，Server 通过 Adapter 路由到对应 Release Pool。不同版本可同时在线，但同一 Session 精确匹配一个 Release；不做未经声明的跨版本连接。

## Source / Compile-Time Dependencies

- `LumioGameRuntime`：稳定 ECS、Tick、GAS、Coordinator、Replication、Persistence 和 Config API。
- `LumioServer`/`LumioClient`：只引用公开 Host/Adapter Contract，不依赖实现源码。
- `LumioCoreEngine`：通过锁定版本的 Managed Contract/Manifest 消费 Native 能力。
- .NET SDK、C# 编译器和经过许可证/SBOM/漏洞/AOT/确定性/性能审查的包。

业务代码禁止对 NativeCore/VoxelEngine 源码建立 Compile-Time 依赖。

## Generated Contract Dependencies

构建前固定 Product/GameRelease、Runtime/Core/Voxel/Server/Client 版本。Contract Toolchain 从源 Schema 生成 Component/RPC/Mapping/Serializer/权限和兼容数据；生成物只读，可在干净环境重建，并记录 Compiler/Input/Output Hash。

## Runtime Loading Relationships

```text
ReleaseCatalog
  -> Server/Client Host
  -> stable Runtime + CoreEngine package
  -> ServerGameplay.dll / ClientGameplay.dll
  -> Config + Content + Scenario + Migration
```

Server/Client Gameplay 分开加载；Unity Client 可使用 HybridCLR Capability。Game 不控制 CoreCLR/ALC 资源回收，只提供注册和语义 Hook。

## Release Composition Relationships

一次 Release 必须同时锁定一个 CoreEngine、Runtime、Server Host、Client Host、Server/Client Gameplay、Generated Contract、Config/Content、Migration、签名和 SBOM。产品发布后不可变；修改破坏性 Schema 必须产生新 GameReleaseId。

## Room Modes / Host Profiles

Game 只依赖 Role、Command、Event、Port 和 Capability。可用 Preset 包括 `PublicDedicatedServer`、`PlayerHostedDedicatedServer`、`LocalhostDedicatedServer`、`LocalEmbedded`、`PureHeadless`、`NativeHeadless`、`LocalSplitProcess`、`RemoteDS`、`MobileLocal`；Scenario 通过 Capability 匹配，不复制 Offline Gameplay。

## Headless Test Surface

- Component/Mapping/权限、GAS Content、Scenario 初始状态和业务断言。
- PlaceVoxel 成功、资源不足、Chunk 未加载、Revision 冲突、重复命令、断线重连和预测回滚。
- Fake/Reference Voxel 与 Native Differential、Replay 首差异、Save/Load/Migration Golden。
- Config Schema/优先级/快照、Content Hash、ReleaseManifest/Catalog 和握手拒绝。
- 日志/审计关联、Failure Bundle、100 Bot Workload、Tick/事务/复制/内存指标。

## Version / Manifest

GameManifest 必须列出 Product/GameRelease、Server/Client Assembly、Contract/Mapping、Runtime、CoreEngine ABI/Capability、Network/Replication、Voxel Migration、Config/Content Hash、Signature、SBOM 和迁移列表。Server/Client 任一字段不匹配都返回稳定错误并拒绝进入 Session。

## 开源优先与供应链

优先采用成熟开源的 Schema、序列化、日志、测试、Unity/HybridCLR 和工具框架；通过 Adapter 隔离并锁定版本/Commit。默认优先 MIT、Apache-2.0、BSD、Zlib；强传染许可证需法务审核。Game 仍负责验证产品语义、数据迁移和内容安全。

## 开发规范

- 新玩法先写 Scenario、Schema、Mapping、失败路径和 Replay 断言，再接入表现。
- 所有跨 World 操作通过 Runtime Coordinator；所有网络输入经过生成契约和权限校验。
- 任何保存/迁移都必须有旧版本 Fixture、校验、失败保留和可回放证据。
- 不把产品规则下沉到 Runtime、Server、Voxel 或 NativeCore。

## 当前阶段与开发节奏

1. **Architecture Gate**：冻结 Gameplay Schema、Mapping、GAS 边界、Scenario/Config/Save Schema 和 ReleaseManifest。
2. **Foundation**：建立 Server/Client Assembly、Contract Toolchain、Config/Content 编译和基础 Scenario。
3. **Vertical Slice**：实现 `PlaceVoxelAbility`，跑通双 World、事务、复制、预测、Replay、Save/Load 和统一日志。
4. **Production Hardening**：Migration、Release Catalog、滚动更新/维护、RemoteDS、性能和故障矩阵。
5. **P2**：Mod SDK（签名 Managed/Data 扩展）、复杂 GAS、跨服和更多内容工具。
