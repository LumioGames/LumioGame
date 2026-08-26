# LumioGame

> Lumio 游戏产品与 Gameplay Content 的唯一事实源，以及最终发行组合入口。

## 定位

`LumioGame` 位于依赖图最上层。它把稳定的 `LumioGameRuntime`、`LumioServer`、`LumioClient` 和 `LumioCoreEngine` 组合成一款可运行的游戏，并提供所有具体的玩法、表现、配置与内容。

本仓库同时产出同一 `GameReleaseId` 下的 Server Gameplay Assembly、Client Gameplay Assembly、Replication Mapping、配置和内容包。Server 与 Client 可以拥有不同的 Component 集合和不同的执行代码，但必须来自同一份游戏发布组合；玩法作者负责定义它们之间的兼容语义。

总架构基线见 [`docs/architecture/LumioGameEngine_Architecture_v0.3.md`](docs/architecture/LumioGameEngine_Architecture_v0.3.md)。

具体 Gameplay、GAS Content、Server/Client Component、Processor、Migration 和测试场景统一使用 C#，由 `LumioGameRuntime` 作为热更程序集加载；底层 Rust Native/Server 能力通过稳定契约接入。

## 拥有的状态与生命周期

- **Gameplay 状态**：具体游戏的 Server `GameWorld` 状态、Client `ReplicaWorld` 的映射规则、输入命令和玩法事件。
- **内容状态**：Ability、Effect、Attribute、Tag、AI、任务、背包、经济、建造规则，以及对应配置和资产引用。
- **发布状态**：`GameReleaseId`、Schema/Replication Mapping 版本、依赖锁定文件和内容包 Hash。
- **生命周期**：由 `LumioGameRuntime` 的稳定 Host 加载、激活、暂停、迁移、重载或卸载；Server 和 Client 的 Gameplay Assembly 在一个发布中同步换包。

`LumioGame` 不拥有 Native/Voxel 的权威状态，也不拥有网络连接或进程生命周期。

## 职责

- 定义 Server Component、Client Component、Shared DTO 与 Replication Mapping；允许两端完全不对称。
- 实现具体 Processor/Handler、RPC 处理、输入映射、表现桥接和玩法规则。
- 实现具体 GAS Content：Ability、Effect、Buff、AttributeSet、Tag、Formula、Targeting、Cost 和 Cooldown。
- 定义 `GameWorld` 与 Client `ReplicaWorld` 的创建、销毁、快照投影和 Migration Hook。
- 通过 `IVoxelWorldPort`、Generated Contract 和 `LumioGameRuntime` 访问 `VoxelWorld`，将体素结果转化为玩法命令或事件。
- 提供场景、Bot 行为、Replay Fixture、性能基线和端到端回归测试。
- 锁定底层依赖的 SemVer、Commit、Artifact Hash、ABI/Schema 版本，并生成最终客户端和 DS 发行包。

## 明确不负责什么

- 不实现 ECS Storage、Tick Scheduler、GAS 通用生命周期、Handle、Prediction/Correction/Rollback 框架。
- 不实现 Voxel Chunk、Revision、Streaming、Mesh 或 Voxel-aware AOI；这些由 `LumioVoxelEngine` 及其 Port 契约负责。
- 不实现 Native Kernel、C ABI、Socket、Connection、Session、CoreCLR Hosting 或 DS 进程治理。
- 不把 Server 与 Client 强行做成同一套 Component、同一份 ECS World 或同一套表现代码。
- 不在 Gameplay 中根据 `IsOffline`、平台或传输实现分叉；模式差异由 Host Profile 和框架适配层隐藏。
- 不自行决定旧存档或在线状态是否兼容；玩法作者必须显式提供 Migration 或声明不兼容。

## 对外产物与契约

- `ServerGameplay.<version>.dll`：Server Component、Processor、GAS Content、RPC Handler 和 Migration。
- `ClientGameplay.<version>.dll`：Client Component、Replica/Prediction Processor、表现桥接和输入处理。
- `Gameplay.Contracts.json`（或等价生成格式）：Component Schema、RPC、NetEntity 映射、Snapshot 字段、Role 权限和版本。
- `GameManifest.json`：`GameReleaseId`、Runtime/Core/Server/Client 版本、平台、Artifact Hash、内容包和迁移版本。
- `Config/`、`Content/`、`Scenarios/`、Replay Fixture 和签名元数据。

契约由本仓库定义，底层仓库只消费生成结果。破坏性 Schema 变化必须更新 `GameReleaseId`，并同步发布 Server 与 Client。

## Source / Compile-Time Dependencies

- `LumioGameRuntime`：稳定 C# API、ECS、GAS Framework、Processor 管线、Host Profile 和 `IVoxelWorldPort`。
- `LumioServer`、`LumioClient`：仅引用其公开的宿主/Adapter 契约；不引用对方实现源码。
- `LumioCoreEngine`：通过锁定版本的托管 Native Contract/Manifest 消费，不直接引用 Rust crate。
- .NET SDK、项目内编译器和经审核的第三方 C# 包。

业务代码禁止对 `LumioNativeCore` 或 `LumioVoxelEngine` 源码建立 Compile-Time 依赖。

## Generated Contract Dependencies

构建前先固定 `GameManifest` 中的 Runtime、Core、Voxel、Server、Client 版本。由契约生成器产出双方所需的 C# 类型、序列化器、RPC ID、Component Schema 和 Replication Mapping；生成物必须可在干净环境重建并纳入 CI 校验。

## Runtime Loading Relationships

```text
Host Profile
  -> LumioServer/LumioClient Host
  -> LumioGameRuntime stable host
  -> ServerGameplay.dll + ClientGameplay.dll
  -> generated contracts + Config + Content
```

Server 与 Client Assembly 分开加载，均由同一 `GameReleaseId` 校验。Local 模式在一个进程中仍启动两个 Role 和两个独立 ECS World，通过 `InMemoryTransport` 交换契约消息。

## Release Composition Relationships

一次发布必须同时包含：

1. 一个 `LumioCoreEngine` 平台产物包。
2. 一个 `LumioGameRuntime`、`LumioServer`、`LumioClient` 兼容版本组合。
3. 同一 `GameReleaseId` 的 Server/Client Gameplay Assembly、生成契约、配置和内容。
4. 可验证的 Manifest、Hash、签名和 Migration 列表。

生产升级由 `LumioServer` 编排停服、换包、World Migration、启动校验和失败处理；玩法语义兼容由本仓库负责。

## Room Modes / Host Profiles

玩家可见模式只有 `Online` 与 `Singleplayer`：

| RoomMode | Host Profile | 说明 |
| --- | --- | --- |
| `Online` | `PublicDedicatedServer` | 连接公共 DS。 |
| `Online` | `PlayerHostedDedicatedServer` | 玩家启动独立 DS 进程后连接。 |
| `Online` | `LocalhostDedicatedServer` | 连接本机独立 DS 进程。 |
| `Singleplayer` | `LocalEmbedded` | 同进程 Server Role + Client Role + InMemoryTransport。 |

进入房间时选择 Host Profile；Gameplay 只依赖 Role、Command、Event 和 Port，不读取模式开关。第一阶段移动端支持 `LocalEmbedded` 和加入远程 DS，不负责启动 Player-hosted DS。

## Headless Test Surface

统一入口由 CLI 提供：

```text
lumio test
lumio test simulation
lumio test local
lumio test ds
lumio test bots
lumio test replay
lumio test perf
```

同一 Scenario/Bot 不改代码即可运行于 `PureHeadless`、`NativeHeadless`、`LocalEmbedded`、`LocalSplitProcess`、`RemoteDS` 和 `MobileLocal`。失败产物至少包括 Command Stream、Snapshot、State Hash、Metrics 与结构化日志。

## Version / Manifest

- 产品版本遵循 SemVer；`GameReleaseId` 是一次 Server/Client 同步发布的不可变标识。
- Manifest 必须列出每个仓库的版本、Commit、Artifact Hash、目标平台、ABI/Schema 版本、内容 Hash 和 Migration 版本。
- 启动时校验 Release、Generated Contract、Runtime Host 和 Core Engine 的兼容矩阵；校验失败时拒绝进入房间。

## 开发规范

- 新玩法先写可重复运行的 Scenario 和最小 Headless 测试，再接入表现层。
- Server/Client Component 必须标注 Role、所有权、快照字段和预测/校正策略；不假设对端存在同名 Component。
- 所有跨 World 操作通过 Tick 内 Prepare/Commit 协议和明确的 Coordinator Event；禁止直接读写另一个 World 的 Storage。
- GAS Content 只使用 Runtime GAS API；公式、Targeting、资源消耗等产品语义留在本仓库。
- RPC 与 Schema 由生成器产生；禁止手写重复的 MessageId、序列化布局或 Native Handle。
- 任何状态迁移都必须有旧版本 Fixture、失败路径和可回放验证。
- 性能测试记录玩家数、Bot 数、Tick、AOI/Streaming、内存、CPU、网络和 p95/p99；第一阶段以约 100 名真实玩家规模建立基线。

## 当前阶段任务

- 建立 Server/Client Gameplay Assembly、契约生成器和 `GameManifest` 最小闭环。
- 实现 GameWorld/ReplicaWorld 的示例 Component、Processor、Replication Mapping 和 LocalEmbedded Scenario。
- 为 GAS Content、Voxel Port 调用、Migration、Replay 和 100 玩家性能场景建立 CI 骨架。
- 在实现代码落地前保持本 README 与 `docs/architecture/LumioGameEngine_Architecture_v0.3.md` 的契约同步。
