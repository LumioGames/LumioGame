# LumioGameEngine V3 Architecture Review

> 评审日期：2026-08-26
> 评审类型：独立架构评审 / 开发前置准入评审
> 评审分支：七个仓库的 `main`
> 总体结论：**NOT_READY**（不具备主干集成开发准入条件）
> 限定结论：允许开展不固化公共契约的隔离性 Spike、Benchmark、Loader/CoreCLR Smoke Test 和测试基础设施骨架。

---

## 0. 评审范围、证据边界与判定口径

### 0.1 已审阅的仓库

| 仓库 | 评审内容 |
| --- | --- |
| LumioNativeCore | `README.md`、`docs/architecture/LumioGameEngine_Architecture_v0.3.md`、`.github/workflows/repository-policy.yml`、`main` 根目录 |
| LumioVoxelEngine | 同上 |
| LumioCoreEngine | 同上 |
| LumioGameRuntime | 同上 |
| LumioServer | 同上 |
| LumioClient | 同上 |
| LumioGame | 同上 |

### 0.2 证据边界

1. 本次环境不能直接读取用户 Mac 上的 `/Users/cui/LumioGames/...` 工作区，因此本报告以七个 GitHub 仓库当前 `main` 分支为实际证据源；尚未推送的本地改动不在评审范围内。
2. 七个仓库当前 `main` 根目录均只显示 `.github/`、`docs/architecture/`、`LICENSE` 和 `README.md`，没有 Rust/C# 实现源码、构建清单或测试实现。因此：
   - 可以评审职责、依赖、状态所有权、生命周期与拟定契约是否足以开工；
   - 不能验证“实现代码是否符合文档”；该项当前结论为 **N/A（尚无可审代码）**，不是把“无代码”本身当作架构缺陷。
3. v0.3 文档自己声明它是“架构基线草案”，且“不替代具体 API 设计”（各仓库 `docs/architecture/LumioGameEngine_Architecture_v0.3.md:L0-L2`）。本报告的开发准入判断，正是判断当前缺失的具体协议是否会导致不可接受的主干返工。
4. 上传的 v0.2 文档仅作为历史演进背景，不作为 V3 主结论的唯一基线。

### 0.3 判定口径

- **READY**：框架级状态所有权、生命周期、依赖、协议和失败语义已经足以让多个仓库并行实现，剩余问题不会改变公共契约。
- **CONDITIONALLY_READY**：允许在明确冻结的边界内进行主干开发，未决项仅影响局部模块或可通过适配层隔离。
- **NOT_READY**：存在会让多个仓库产生互不兼容实现、导致核心状态模型返工，或无法证明正确性的 P0 缺口。

---

# 1. Executive Verdict

## 1.1 总体结论：NOT_READY

V3 的**架构方向总体正确**：Rust Host、Rust Native/Voxel、稳定 C# Runtime、热更 Gameplay 的语言分层是合理的；GameWorld 与 VoxelWorld 分权威域、Server/Client 本地 Entity 分离、非对称 Component、Local 不绕过消息边界、统一 Native 聚合包，以及 Headless/Replay 作为一等能力，都是值得保留的核心决策。

但当前还不是一套可由七个仓库并行实现的“可执行架构契约”。关键概念已经命名，关键协议尚未定义；更严重的是，`SimulationSession`、Tick Clock、World 生命周期在 Runtime、Server 和 Game 之间存在直接所有权冲突。若现在进入主干集成开发，最可能发生的不是局部重构，而是 ECS Tick、Replication、GAS Prediction、Cross-World、Hot Reload 和 Replay 一起返工。

## 1.2 最大的三个风险

1. **SimulationSession / World / Tick 没有唯一控制权。** 逻辑 Tick、宿主节拍、World 生命周期、客户端 Replica 生命周期混在同一个模型中，并被多个仓库同时声明拥有。
2. **Cross-World、Entity 生命周期、Replication/Prediction 仍是能力清单，不是可执行协议。** 缺少幂等、墓碑、基线、Revision 向量、Ack/Resync、失败与重放语义。
3. **Rust/C# ABI、契约生成器和版本兼容图尚未冻结。** 这会让 NativeCore、CoreEngine、Runtime、Server、Client 和 Game 各自产生不同的布局、ID 和加载假设。

## 1.3 当前最适合开始开发的范围

可以开始，但产物不得被当成已经冻结的公共协议：

- NativeCore 内部 Handle Table、批量空间 Kernel、压缩 Kernel、Typed Native Job 和 Benchmark Spike；
- VoxelEngine 内部 Chunk 布局、Revision 算法、只读查询和单域 Mutation 原型；
- CoreEngine 的可复现构建、单包 Loader、重复加载拒绝和 ABI Smoke Test 骨架；
- GameRuntime 的 ECS Storage、Query、CommandBuffer 单线程原型，以及确定性测试骨架；
- Server 的 Rust 进程、网络 Reactor、有界队列、CoreCLR 启动/关闭 Smoke Test；
- 统一 Failure Bundle、Metrics、Trace、Benchmark 元数据和测试数据集骨架。

这些工作应通过内部接口或实验命名空间完成，禁止提前把未冻结类型发布为 v1 公共 API。

## 1.4 当前不应该开始的范围

- Cross-World Coordinator 的正式 API 与持久化语义；
- GameRuntime GAS Prediction/Correction/Rollback 正式实现；
- Server/Client Snapshot/Delta/Ack/Resync 和非对称 Mapping 主干协议；
- LocalEmbedded 作为“真实 DS 路径等价证明”的验收实现；
- Gameplay 正式 Component/RPC Schema 大规模铺开；
- 生产 Hot Reload、World Migration、跨版本重连和滚动升级；
- 以当前 State Hash 定义为基础的 Replay 兼容承诺。

---

# 2. Findings

以下 Finding 按严重程度排序。P0 是主干开发准入阻塞；P1 允许局部开发但会影响主干架构；P2 可在开发期补齐；P3 是演进项。

## [P0-01] `SimulationSession`、Tick Clock 与 World 生命周期存在多重所有权

**位置：**

- `LumioGameRuntime/README.md:L13-L17`
- `LumioServer/README.md:L14-L24`
- `LumioGame/README.md:L21-L25`
- `*/docs/architecture/LumioGameEngine_Architecture_v0.3.md:L62-L73`

**问题：**

`LumioGameRuntime` 声明拥有 `SimulationSession` 的 Tick Clock、Coordinator Transaction 和 Snapshot Metadata；`LumioServer` 又声明拥有 `WorldSlot -> SimulationSession` 生命周期和 Tick Clock，并“驱动” GameWorld Tick、Cross-World、Snapshot/Replication；`LumioGame` 还声明定义 GameWorld/ReplicaWorld 的创建与销毁。与此同时，架构树把远端每个 Client 的 ReplicaWorld 放在 Server `WorldSlot` 下，却没有说明它是逻辑分布式视图，还是同进程对象所有权树。

**影响：**

- Server 与 Runtime 都可能实现暂停、恢复、Tick 递增和销毁状态机；
- Hot Reload、Snapshot、Migration 和优雅停服无法确定由谁先进入 Barrier；
- RemoteDS 与 LocalEmbedded 会形成两套不同对象模型；
- Client ReplicaWorld 的重连与销毁可能错误地被 Server Session 生命周期控制；
- Replay 无法确定唯一的逻辑 Tick 来源。

**证据：**

文档不是只缺少细节，而是三个仓库对同一生命周期使用了“拥有/定义/驱动”的不同表述，且没有 Host Clock 与 Simulation Clock 的区分。

**建议：**

冻结 `SessionOwnership ADR`：

- `LumioServer` 拥有 **Host/Wall Clock Pacing**、进程、资源、连接和 `WorldSlotHost`；
- `LumioGameRuntime` 拥有 **Logical TickId、Tick Phase Graph、SimulationSession 状态机**；
- `LumioClient` 拥有 `ClientReplicaSession` 与本地预测历史；
- `LumioGame` 只提供 `IGameModuleDescriptor`、World 初始化/销毁 Hook 和 Schema，不拥有生命周期状态机；
- Remote Client World 不是 Server 进程内对象；Server 只保存该客户端的 Replication/Connection Context。

开发前至少产出三个状态机：`WorldSlotHostState`、`SimulationSessionState`、`ClientReplicaSessionState`，以及一张创建、暂停、Snapshot、Reload、Stop、Destroy 的跨仓库 Sequence Diagram。

---

## [P0-02] Cross-World Prepare/Commit 不是可实现的事务协议

**位置：**

- `*/docs/architecture/LumioGameEngine_Architecture_v0.3.md:L82-L91`
- `LumioVoxelEngine/README.md:L21-L28`
- `LumioGameRuntime/README.md:L20-L26,L89-L94`

**问题：**

当前仅规定“Prepare、两边成功、同 Tick Commit、失败可重试”，但未定义：

- Transaction ID 与重复请求的幂等规则；
- Prepare 是否允许产生可见副作用或资源预留；
- `ExpectedGameRevision` / `ExpectedVoxelRevision`；
- 超时、租约、取消、Abort、查询最终状态；
- Commit 的顺序和 Commit 后是否还允许失败；
- 结果丢失、重复 Commit、客户端重发、进程崩溃时如何恢复；
- GameWorld 与 VoxelWorld 分别成功一半后的补偿或重放语义；
- 是否允许跨 FFI 持锁以及是否允许 Native 反向回调 Managed。

**影响：**

建造、扣费、拾取、破坏、门/机关等同时修改 ECS 与 Voxel 的玩法会出现：重复扣费、Voxel 已修改但 ECS 未提交、重试造成二次建造、死锁、Replay 分叉和 Snapshot 半提交。

**证据：**

架构文档仅有四步叙述；VoxelEngine 只承诺“变更摘要和可重试结果”，没有状态机、唯一键、Revision 前置条件或失败矩阵。

**建议：**

不要引入通用分布式事务框架；冻结一个窄域的 `CrossWorldTxnV1`：

```text
CrossWorldTxnV1
- SessionId
- TxnId                    // Session 内唯一，重复调用幂等
- TickId
- CommandId / PredictionKey
- ExpectedGameRevision
- ExpectedVoxelRevision
- DeadlineTick
- PreparedGameDelta
- PreparedVoxelToken
- ResultRevisionVector
```

状态最少为：

```text
Created -> Prepared -> Committed
        \-> Aborted
Prepared -> Indeterminate   // 仅表示需要按日志/状态查询恢复
```

第一阶段最小语义：

1. Prepare 只生成不可见 Delta 或有租约的 Reservation；
2. 两侧 Prepare 都成功后进入固定 Barrier；
3. Commit 必须幂等；已 Prepare 的提交路径应设计为不可再发生业务校验失败；
4. 不在 Rust 锁内调用 C#，不由 Native Worker 回调热更代码；
5. 进程崩溃不做通用 Durable 2PC，而是从上一个协调 Snapshot 加 Command Log 重放；
6. 必须有 Duplicate、Timeout、Lost Result、Revision Conflict、Crash Between Commits 的 Failure Matrix。

---

## [P0-03] `NetEntityId + LocalEntityId` 只解决映射，没有解决 Entity 生命周期

**位置：**

- `*/docs/architecture/LumioGameEngine_Architecture_v0.3.md:L93-L111`
- `LumioGameRuntime/README.md:L20-L24,L89-L91`
- `LumioClient/README.md:L13-L24,L86-L88`
- `LumioGame/README.md:L21-L26,L110-L115`

**问题：**

双层 ID 是正确起点，但当前没有定义：

- NetEntityId 的作用域、生成算法、Generation/Epoch 和回收规则；
- Destroy Tombstone 的保存与 Ack；
- Destroy 后同一逻辑对象 Respawn 是复用还是新 ID；
- 重连后如何重建 Net-to-Local Mapping；
- Snapshot/Replay 是否保留旧映射；
- World/Server 迁移是否保留 ID；
- Ownership Transfer 与 Authority Transfer 的 Revision；
- 迟到 Delta 如何避免“复活”已销毁 Entity；
- LocalEntityId 是否包含 Index + Generation、是否绑定 WorldId。

**影响：**

迟到包可能写入已经回收的本地槽位；重连可能重复创建 Entity；销毁后旧 Delta 可能把对象复活；Replay 和 Migration 无法确定同一逻辑对象；Ownership 变化会把 owner-only 数据发送给错误客户端。

**证据：**

文档定义了两个 ID 的用途和映射原则，但没有 Entity Spawn/Destroy/Respawn/Reconnect/Migrate 的状态机或 Tombstone 规则。

**建议：**

冻结 `EntityIdentityV1` 与 `EntityLifecycleV1`：

- `LocalEntityId = Index + Generation`，只在单个 World 有效；
- `NetEntityId` 是不透明固定宽度 ID，第一阶段在一个 SimulationSession 内**永不复用**；
- Snapshot 持久化 NetEntityId，重连通过 FullSnapshot/Resync 重建 Local Mapping；
- Destroy 产生 `EntityTombstone(NetEntityId, DestroyRevision)`，至少保留到相关 Baseline 被 Ack 或超时失效；
- Respawn 默认分配新 NetEntityId；确需保持身份时必须显式声明 `RespawnEpoch`；
- `OwnershipRevision` 与 `AuthorityEpoch` 独立于 Entity ID；第一阶段只实现 Server 固定 Authority，支持 Ownership Transfer，推迟任意 Authority Transfer。

---

## [P0-04] Snapshot/Delta/Ack/Resync/Prediction 仅被列举，未形成统一协议

**位置：**

- `LumioClient/README.md:L13-L24,L45-L61,L74-L88`
- `LumioServer/README.md:L20-L24,L35-L47`
- `*/docs/architecture/LumioGameEngine_Architecture_v0.3.md:L102-L117,L208-L225`

**问题：**

当前没有定义：

- Transport ACK 与 Replication Baseline ACK 的区别；
- FullSnapshot、Delta 的 Baseline、序号、Revision、依赖链；
- Delta 乱序、重复、缺口和未知 Baseline 的处理；
- Entity Tombstone 和 Component Remove；
- 字段级/Component 级/Entity 级/Role/Owner/AOI 映射规则；
- PredictionKey、ClientCommandSeq、Authority Confirm/Reject；
- Client 回滚到哪个确认 Tick，以及未确认命令如何重放；
- GAS、ECS 与 VoxelReplica 的校正是否必须在同一 Revision Barrier 原子应用；
- Resync 期间是否继续采样输入、如何限流和何时恢复 Active。

**影响：**

Server、Client、Game 和 Runtime 会各自定义不同的 Revision 与 Ack 含义。LocalEmbedded 即使“跑通”，也可能只证明一套进程内捷径；真实网络出现丢包、乱序、重连后会失效。客户端 GAS 预测和 ECS/体素校正还可能分别回滚，形成状态环依赖。

**证据：**

Client README 列出了 Ack、Gap、Resync、Prediction、Correction、Rollback，但没有消息 Schema、状态迁移或时序；架构文档只定义 Mapping 的存在。

**建议：**

冻结 `ReplicationProtocolV1`：

```text
HandshakeAccepted
-> FullSnapshot(SnapshotId, TickId, RevisionVector)
-> BaselineAck(SnapshotId)
-> Delta(BaseSnapshotId, FromRevision, ToRevision, Sequence)
-> DeltaAck / GapDetected
-> ResyncRequest
-> FullSnapshot or ResyncPatch
```

必须包含：

- `EntitySpawn`、`EntityTombstone`、`ComponentAdd/Remove/Patch`；
- Mapping 维度：Role、Owner、AOI/Visibility、Initial/Continuous、Reliability、Quantization、Predicted/Authoritative；
- `PredictionKey + ClientCommandSeq + AuthoritativeTick`；
- 客户端统一的 `PredictionFrame`，把 ECS、GAS 和 Voxel Overlay 作为同一个确认/回滚单元；
- 未知 Baseline、Schema 不匹配、历史窗口不足时直接进入 Full Resync；
- 第一阶段采用精确版本匹配，不做跨 Release Delta 兼容。

---

## [P0-05] Tick Phase、CommandBuffer 提交顺序与协调 Snapshot Cut 未冻结

**位置：**

- `*/docs/architecture/LumioGameEngine_Architecture_v0.3.md:L112-L117`
- `LumioGameRuntime/README.md:L13-L26,L77-L94`
- `LumioServer/README.md:L23-L24,L85-L89`

**问题：**

文档只规定 Processor 有 Phase、结构变更通过 CommandBuffer 固定阶段提交，但未规定完整 Tick Phase Graph、多个 Processor 的稳定排序、Native Job Completion Barrier、Cross-World Commit 与 ECS Structural Commit 的先后、Replication Projection 何时读取状态、Snapshot/State Hash 在哪个点生成。

**影响：**

同一命令在不同 Host 可能落到不同 Tick；Cross-World Commit 后 Replication 读取到半旧状态；并行 Processor 产生不可重复的结构命令顺序；Snapshot 包含 GameRevision N 与 VoxelRevision N-1；Replay 无法定位首个差异。

**证据：**

“固定 Tick 阶段”被多处引用，但没有任何命名阶段、Barrier 或总顺序定义。

**建议：**

冻结 `TickContractV1`。第一阶段建议使用单权威写线程，明确顺序：

```text
IngressCapture
-> DecodeAndCanonicalize
-> ApplyInputs
-> ProcessorPlan
-> CrossWorldPrepare
-> NativeJobBarrier
-> CommitDecision
-> VoxelCommit
-> EcsCommandBufferCommit
-> GasAndEventFinalize
-> ReplicationProjection
-> SnapshotHashMetrics
-> EgressPublish
```

同时冻结：

- Processor Descriptor：`ProcessorId / Role / Phase / Reads / Writes / StructuralWrites / Dependencies / DeterminismClass`；
- 多 CommandBuffer 的稳定合并顺序；
- Deferred Entity Token 的解析规则；
- Snapshot 只能在协调 Barrier 产生；
- `SessionRevisionVector { TickId, GameRevision, VoxelRevision, ReplicationRevision, SchemaEpoch }`，禁止继续把不同含义都叫单一 `Revision`。

---

## [P0-06] Rust/C# ABI、线程、错误与生命周期契约尚未冻结

**位置：**

- `LumioNativeCore/README.md:L34-L40,L78-L90`
- `LumioCoreEngine/README.md:L17-L24,L45-L58,L73-L89`
- `LumioGameRuntime/README.md:L20-L26,L38-L50`
- `LumioServer/README.md:L20-L24,L50-L58`

**问题：**

高层原则是正确的，但尚未产出可编译、可验证的 `HostApiV1`、`ManagedApiV1` 和统一 Root API Table。未决项包括：Calling Convention、结构 Layout/Alignment、Enum/Bool、Buffer 询长、Allocator 所有权、字符串编码、Handle 与 World 绑定、线程亲和、可重入性、取消、回调、Rust panic、Managed exception、CoreCLR 进入线程、服务端静态/动态链接矩阵，以及同进程单加载注册表。

**影响：**

- Rust/C# 结构布局漂移和 ABI 崩溃；
- 不同 allocator 跨边界释放；
- GC Pinning、悬挂 Handle、ALC 无法回收；
- Rust panic 或 C# exception 穿越边界；
- Server/Client/LocalEmbedded 重复加载 Native 全局状态和 Worker Pool；
- Native 线程未经约束进入 CoreCLR 或持锁回调 Managed，造成死锁。

**证据：**

NativeCore README 明确把“冻结 ABI 基础类型、Capability 和错误码”列为当前任务，并要求公共 API 在实现前定义所有权和线程约束；这说明当前主干尚未达到该门槛。

**建议：**

冻结 `NativeManagedAbiV1` 和可执行 Conformance Fixture：

- 单一入口，例如 `lumio_core_get_api_v1(requested_version, out_table)`；
- API Table 每个结构包含 `abi_version`、`struct_size` 和 `capability_bits`；
- 固定宽度 POD、显式 Layout，不跨边界传 Rust/C# 容器、异常或对象引用；
- 内存由创建侧释放，优先调用方提供 Buffer；
- Handle 使用 Index + Generation，并校验 World/Context；
- Rust 在 FFI 边界捕获 panic，C# 在 Managed Entry 捕获异常，统一转成稳定错误；
- Native Worker 不回调 Hot Gameplay；Managed Tick 仅由规定的 Simulation Owner Thread 进入；
- 任何 Managed 调用期间禁止持有可能阻塞的 Rust World/Queue 锁；
- 为每个平台冻结“静态链接或动态加载”的唯一方式，同一进程只暴露一份 Root API Table；
- ABI 正向/反向兼容、错误注入、重复加载、失效 Handle、异常和内存泄漏均有测试。

---

## [P0-07] Generated Contract 的所有者、ID 命名空间和构建图不完整

**位置：**

- `*/docs/architecture/LumioGameEngine_Architecture_v0.3.md:L237-L262`
- `LumioGame/README.md:L52-L75,L114-L120`
- `LumioServer/README.md:L39-L47`
- `LumioClient/README.md:L39-L47`
- `LumioCoreEngine/README.md:L45-L47`

**问题：**

文档列出了各仓库“提供哪些契约”，也要求生成器输出 C# 类型、序列化器、RPC ID、Schema 和绑定，但没有定义：

- 契约生成器本身由谁拥有和版本化；
- Schema 语言与稳定的 ID Namespace；
- Component/RPC/Tag/Ability/Error/Capability ID 的冲突与废弃规则；
- Native/Voxel/Runtime/Game Schema 的生成顺序；
- 生成物放在哪里、哪些进入源码、哪些进入 Artifact；
- Server/Client 如何消费 Game Payload 而不建立 Game 源码依赖；
- Generated Contract Hash 的规范化输入；
- 兼容性判定是 exact match、向前兼容还是 capability negotiation；
- 三张本应分开的图：源码依赖图、生成物依赖图、运行时加载图。

**影响：**

各仓库可能手写同名 ID 和布局；Game 构建需要 Server Contract，而 Server 又消费 Game 生成物，形成生成环；CoreEngine 或 Game 可能被迫吸收所有 codegen，成为新的职责黑洞；干净环境无法稳定重建 Manifest Hash。

**证据：**

架构文档只列出契约来源与输出；Game README 将“建立契约生成器”列为当前任务，但生成器明显跨越 Native、Voxel、Runtime、Server/Client 和 Game，不应默认成为 Gameplay 仓库内部工具。

**建议：**

先冻结 `ContractToolchain ADR`：

1. 每个领域仓库拥有自己的**源 Schema**；
2. 使用一个固定版本、可复现的 Schema Compiler；
3. 生成 ID 必须来自命名空间 + 显式稳定编号，禁止基于遍历顺序或运行时反射；
4. 生成物只读、不可手改，并记录 Compiler Version、Input Hash 和 Output Hash；
5. Server Host 不编译具体 Game Payload 类型，只加载经过签名/校验的 Payload Registry、Serializer Table 和权限元数据；
6. 明确三张 DAG，并在 CI 中检查无环；
7. 第一阶段兼容策略采用 exact-match Manifest，避免同时开发复杂的跨版本转换。

仓库层面暂不强制增加第八仓库；但必须指定工具链所有者。若同一个 Compiler 确实服务 Native/Voxel/Runtime/Game 四个域，应建立独立版本化的 `LumioContractTooling` 仓库或包，而不是塞入 CoreEngine 或 LumioGame。

---

## [P1-01] GAS Framework 放置正确，但当前仍是功能目录，不是稳定状态模型

**位置：**

- `LumioGameRuntime/README.md:L5-L7,L15-L27,L77-L94`
- `*/docs/architecture/LumioGameEngine_Architecture_v0.3.md:L119-L138`

**问题：**

GAS Framework 放在 GameRuntime 是合理的；文档也正确地把具体 Formula、Targeting、Cost、Cooldown 留给 Game。但 Runtime 目前一次性承诺 Ability、Effect、Attribute、Tag、Stack、Duration、Dependency、Prediction、Rollback、Snapshot、Replication，尚未定义基础状态机和确定性顺序。

**影响：**

若直接实现完整 GAS，会过早把网络确认方式、ECS 存储形态或某款游戏的技能假设固化进 Runtime；Handle 还可能跨 Snapshot、Rollback 和热更失效。

**证据：**

文档只列出能力名称，没有 Ability/Effect 状态迁移、Stack Policy、事件顺序、持久 ID、Prediction Key 或循环检测规则。

**建议：**

GAS 正式开发前冻结：

- `AbilityTypeId`、`AbilityInstanceId`、`EffectTypeId`、`EffectInstanceId` 与运行期 Handle 的区别；
- Ability：CanActivate → Activating → Committed → Active → Ending/Cancelled → Ended；
- Effect：Applied、StackChanged、Suspended、Expired、Removed；
- 确定性时间单位、同 Tick 事件排序和 RNG Context；
- Stack 合并/刷新/独立实例策略；
- Trigger 深度与循环预算；
- PredictionKey、Server Confirm/Reject、Rollback Snapshot；
- GAS 与 ECS 的关系：Runtime 可以用内部 Component/Store，但对外只暴露稳定语义；
- Replication 通过 Projection Port，不直接依赖网络字节。

建议在同一仓库内拆成 `Abstractions/ECS/Simulation/Replication/GAS/HotReload/Testing` 等程序集或包，暂不拆仓库。

---

## [P1-02] LocalEmbedded 的“完整消息边界”没有传输保真度契约

**位置：**

- `*/docs/architecture/LumioGameEngine_Architecture_v0.3.md:L160-L175,L208-L219`
- `LumioServer/README.md:L64-L71,L85-L89`
- `LumioClient/README.md:L48-L61`

**问题：**

文档要求 InMemoryTransport 仍经过消息/快照边界，但没有说明它是否使用与真实 DS 完全相同的 Envelope、Serializer、MessageId、大小限制、队列容量、排序、Tick 交付、Backpressure、断线和重连状态机。

**影响：**

若 InMemoryTransport 直接传对象引用、使用无界队列、立即同步调用或跳过编码与权限校验，Local 测试会系统性漏掉真实 DS 的协议错误，形成“本地全绿、远程失败”。

**证据：**

文档写了“不绕过”，但没有可验证的等价边界，也没有列出 InMemoryTransport 允许绕过和不得绕过的层。

**建议：**

冻结 `TransportFidelityV1`：

- 必须复用相同消息 Schema、Serializer、Envelope、MessageId、最大消息长度、版本校验、队列与 Tick 交付；
- 允许绕过 Socket、加密、内核网络栈和真实分片，但不得绕过业务协议；
- 使用有界双向队列，禁止 Server Processor 直接调用 Client Processor；
- 标配 Fault Decorator：Latency、Jitter、Loss、Reorder、Duplicate、Disconnect、Reconnect、QueueFull；
- 明确 LocalEmbedded **不能覆盖**端口绑定、TLS/QUIC、OS Buffer、进程崩溃和 NAT，以上由 LocalSplitProcess/RemoteDS 覆盖。

---

## [P1-03] Voxel-aware AOI/Streaming/Collision 的职责边界存在显式模糊

**位置：**

- `LumioVoxelEngine/README.md:L21-L28`
- `LumioNativeCore/README.md:L20-L33`
- `*/docs/architecture/LumioGameEngine_Architecture_v0.3.md:L91,L235`

**问题：**

VoxelEngine README 明确写“体素感知策略可以在本仓库或 Runtime Coordinator 中组合”。这会让同一策略在 Rust Voxel 和 C# Runtime 两边各实现一部分，形成对 Voxel 内部布局、Chunk 状态或 Revision 的隐性依赖。

**影响：**

- Runtime 可能开始读取原始 Chunk/Collision 数据；
- VoxelEngine 可能吸收玩家权限、阵营、隐身、订阅优先级等 Gameplay 语义；
- AOI 结果与 Voxel Revision 不一致；
- 替换空间算法或 Streaming Scheduler 时需要跨仓库重写。

**证据：**

NativeCore 的边界较清楚：只提供通用 Kernel；真正未决的是 VoxelEngine 与 Coordinator 之间的策略归属。

**建议：**

固定三层：

- NativeCore：通用 Spatial/Collision/Compression Kernel；
- VoxelEngine：基于 Voxel 数据的候选集、遮挡、Chunk 可用性、空间 Source，并返回带 `VoxelRevision` 的只读结果；
- GameRuntime/Server Replication：基于 Role、Owner、Permission、Interest、带宽和 Gameplay 规则做最终过滤与调度。

通过版本化 `VoxelSpatialProjection` / `VoxelInterestCandidateBatch` 交换，不暴露内部 Chunk Storage，不允许回调 ECS。

---

## [P1-04] Hot Reload 只规定“清理”，没有资源域和故障隔离模型

**位置：**

- `LumioGameRuntime/README.md:L15-L17,L26,L35,L79-L94`
- `*/docs/architecture/LumioGameEngine_Architecture_v0.3.md:L177-L184`
- `LumioServer/README.md:L14-L24,L61`

**问题：**

文档要求卸载前清理 Handle、订阅、Timer、Task，但没有定义谁登记这些资源、取消顺序、超时后怎么办、旧 ALC 如何判定泄漏、Managed exception 如何把单个 World 标记为 Faulted，以及 OOM/CoreCLR 崩溃属于 World 还是进程级故障。

**影响：**

旧 ALC 无法回收、后台 Task 继续写旧 World、Native Handle 泄漏、Timer 调用旧代码、热更失败后新旧模块同时活跃。Rust Host 也可能误以为能在同一 CoreCLR 内恢复进程级损坏。

**建议：**

定义 `GameplayModuleScope`：所有 Timer、Subscription、Task、Native Lease、Typed Channel Registration 必须通过 Scope 创建并返回 Registration Token；卸载顺序为 Quiesce → Cancel → Drain → Dispose → ValidateRoots → Unload ALC。设置 Grace Deadline，超时即热更失败并回滚或重启 Session。明确：

- 可捕获的 Gameplay exception 可隔离为 Session Fault；
- CoreCLR 崩溃、Stack Overflow、OOM 等按进程级故障处理，从最后 Snapshot 重启；
- Rust 永不保存 Hot Gameplay 函数地址；
- LocalEmbedded 的 Server/Client Gameplay 使用独立可回收 ALC，但共享稳定 Runtime/CoreCLR。

---

## [P1-05] 生产 Migration 的固定线性顺序缺乏跨域依赖与原子激活

**位置：**

- `*/docs/architecture/LumioGameEngine_Architecture_v0.3.md:L185-L192`
- `LumioServer/README.md:L80-L88`
- `LumioGame/README.md:L68-L75,L105-L115`

**问题：**

当前固定为先 GameWorld Migration、再 VoxelWorld Migration。这个顺序不具普适性：若 Game 状态引用需要由 Voxel Migration 重写的 Chunk/Object ID，Game 必须后迁；另一些场景则相反。文档也未定义 staging、交叉引用校验、原子发布和失败后的旧数据恢复。

**影响：**

迁移结果可能引用不存在的 Voxel 对象；失败时原 Snapshot 被部分覆盖；回滚旧二进制却无法读取已改写的数据；停服窗口不可预测。

**建议：**

使用声明式 Migration DAG，而不是固定顺序：

1. 从同一 `SnapshotId + SessionRevisionVector` 获取不可变输入；
2. 在 staging 目录/对象空间运行 Game/Voxel Migrator；
3. Migrator 声明输入版本、输出版本、依赖和幂等键；
4. 完成跨域引用与 Manifest 校验；
5. 通过原子版本指针激活；
6. 失败不修改旧版本，保留可重复的 Failure Bundle。

第一阶段不做不停服跨版本会话；连接中的 Client 收到 Maintenance/RequiredRelease，并在新 Release 启动后重新握手/Resync。

---

## [P1-06] Host Profile 把用户模式、部署位置、进程拓扑和测试能力混成枚举

**位置：**

- `*/docs/architecture/LumioGameEngine_Architecture_v0.3.md:L140-L175,L208-L219`
- `LumioServer/README.md:L62-L71`
- `LumioGame/README.md:L76-L102`

**问题：**

`PublicDedicatedServer`、`PlayerHostedDedicatedServer`、`LocalhostDedicatedServer` 描述部署/发现；`LocalEmbedded` 描述进程拓扑；PureHeadless/NativeHeadless 又描述测试依赖。把这些都视为 Host Profile 会导致组合爆炸。公共 DS、玩家 DS 和 localhost DS 也不只是 Endpoint 不同，它们在认证、发现、管理权限、持久化、信任和资源预算上有不同 Capability。

**影响：**

Gameplay 虽然不应读取模式开关，但 Host/运维代码仍会出现大量 profile 特判；Bot、Replay、Benchmark、Editor Preview 难以组合；配置矩阵不可验证。

**建议：**

改为正交描述：

```text
RoomMode
DeploymentProfile
ProcessTopology
RoleSet
TransportProfile
NativeProfile
RenderProfile
ClockProfile
FaultProfile
PlatformProfile
```

再提供命名 Preset。Gameplay 只读取 Role/Capability/Port，这一原则保留。

**Listen Server 判断：** 第一阶段不需要，长期也可以明确不支持。影响是多一个 DS 进程和启动/RSS 成本，但换来没有 Host Player 特权、没有 Listen 特有 Authority/NAT/迁移路径，安全和测试模型更统一。Player-hosted DS 应继续保持独立进程。

---

## [P1-07] Processor“System 可选”没有问题，但调度描述符不足

**位置：**

- `*/docs/architecture/LumioGameEngine_Architecture_v0.3.md:L112-L117`
- `LumioGameRuntime/README.md:L20-L24,L89-L93`

**问题：**

“System 不是强制概念”本身合理；真正缺失的是 Processor 必须提供的稳定调度元数据、读写冲突规则、并行条件、确定性等级和诊断信息。

**影响：**

不同团队会把 Processor 理解成任意回调；Scheduler 无法验证读写冲突；并行执行次序不确定；出现 Tick 超时或状态差异时无法定位到 Processor。

**建议：**

强制 `ProcessorDescriptor`，至少包含 ID、Role、Phase、Query、ReadSet、WriteSet、StructuralWrite、Before/After Dependency、DeterminismClass、Budget、DiagnosticName。第一阶段权威 World 单线程执行；只允许无共享写集且有稳定归并规则的 Processor 并行。不要冻结具体 Archetype 内存布局，但应冻结 Query、Change Tracking、CommandBuffer 和 Snapshot Projection 的语义 API。

---

## [P1-08] Server Host 与 Managed Gameplay 的线程、队列和错误传播模型不完整

**位置：**

- `LumioServer/README.md:L20-L24,L50-L58,L74-L89`
- `LumioGameRuntime/README.md:L20-L27`

**问题：**

当前只规定网络/IO/Job 线程通过 Typed Queue/Batch 与托管 Tick 交互，没有定义线程数量、队列所有者、容量、溢出策略、Backpressure 传播、Native Job Deadline、Managed Tick 超时、异常到 Session/Process 的升级路径。

**影响：**

无界队列造成 OOM；可靠消息积压阻塞 Tick；网络线程与 Simulation Thread 争锁；一个 World 的长 Job 拖垮其他 World；Managed exception 被吞或直接杀进程。

**建议：**

第一阶段固定：

```text
Rust Network Reactor(s)
-> bounded per-session ingress
-> one authoritative Simulation Owner Thread per active WorldSlot
-> bounded Native Job Pool + completion queue
-> IO/Persistence workers
-> bounded egress
```

定义每个队列的容量和满载策略；Simulation Thread 是唯一 Managed Tick 入口；Native Completion 只能在 Barrier 应用；可靠 backlog 超阈值应降级/断开而不是无限增长；所有错误映射到 Stable Fault Code，并定义 Session Fault、World Restart、Process Restart 三个级别。若第一阶段只服务一个 100 人房间，建议一个活跃 WorldSlot/进程，保留多 Slot 接口但推迟共享故障域。

---

## [P1-09] Replay、State Hash 与可观测性格式不足以定位“第一个差异 Tick”

**位置：**

- `*/docs/architecture/LumioGameEngine_Architecture_v0.3.md:L220-L235`
- `LumioGameRuntime/README.md:L38-L41,L77-L81`
- `LumioGame/README.md:L88-L116`

**问题：**

文档要求输出 Command Stream、Snapshot、State Hash 并定位首个差异，但没有定义 canonical serialization、Entity/Component 顺序、浮点与 RNG、Hash 分层、Pending Command/Timer/Job 是否纳入、Voxel 与 Game Hash 如何组合、网络状态是否属于模拟 Hash。

**影响：**

两个 Host 可能状态相同但 Hash 不同，也可能业务状态不同却被同一粗粒度 Hash 掩盖；Replay 无法从 Session 级差异钻取到 World/Entity/Component；失败环境不能自动重建。

**建议：**

定义分域 Hash：

```text
SessionHash
- GameWorldHash
  - ECSHash
  - GASHash
  - PendingCommandHash
  - RNG/TimerHash
- VoxelWorldHash
- RevisionVectorHash
```

网络队列、日志时间戳等非确定性状态放在 Diagnostic Hash，不进入权威 Simulation Hash。统一 `FailureBundleV1`：Manifest、平台/编译器、Seed、Scenario 数据、Command Stream、Fault Profile、关键 Snapshot、分层 Hash、日志、Metrics、Trace。Replay Runner 必须能从 Session → World → Entity → Component/Chunk 输出首差异。

---

## [P1-10] “同一 Scenario 在所有 Host 无修改运行”缺少 Capability 约束

**位置：**

- `*/docs/architecture/LumioGameEngine_Architecture_v0.3.md:L208-L225`
- `LumioGame/README.md:L88-L102`
- `LumioVoxelEngine/README.md:L68-L80`

**问题：**

PureHeadless 明确“不加载 Native”，但 Voxel 玩法又依赖 Native VoxelWorld。若没有 Reference Voxel Port，体素 Scenario 不可能在 PureHeadless 保持相同行为。不是每个 Scenario 都适用于 MobileLocal、RemoteDS 或无 Renderer Host。

**影响：**

为了满足不现实的统一承诺，团队可能在测试中绕过 Voxel、复制 Gameplay 或写 Host 分支，反而破坏测试目标。

**建议：**

Scenario 声明 `RequiredCapabilities`，Host 声明 `ProvidedCapabilities`；CLI 做匹配。对核心体素语义提供确定性但低性能的 `ReferenceVoxelPort`，使部分 Voxel Scenario 可在 PureHeadless 运行；涉及 Native 布局/性能/真实 Streaming 的场景只在 NativeHeadless 及以上运行。目标应是“同一 Gameplay/Scenario DSL，不复制业务代码”，而不是“所有 Scenario 必须在每个 Host 执行”。

---

## [P2-01] Repository Policy 只验证文档存在与标题，不验证架构边界

**位置：** 七仓库 `.github/workflows/repository-policy.yml:L16-L25`

**问题：**

当前工作流只检查 README、LICENSE、v0.3 文档非空，以及若干标题存在。它不验证七份架构文档一致、源码依赖方向、Generated Contract 可重建、ABI/Schema 兼容、Loader 单加载或 Headless 测试。

**影响：**

未来代码落地后，文档结构仍然“合规”，但仓库边界和依赖可能已经失效。

**建议：**

这不是当前第一优先级，但代码落地时应逐步加入：依赖 DAG 检查、生成物 diff、ABI layout test、Manifest schema 校验、跨仓库契约 fixture、架构文档 hash/版本检查。不要把它扩展成与本轮无关的大型治理工程。

---

## [P2-02] 七份复制的架构基线存在漂移风险

**位置：** 七仓库 `docs/architecture/LumioGameEngine_Architecture_v0.3.md`；各仓库 policy。

**问题：**

每个仓库保存完整架构副本，但工作流只检查标题，不检查内容 Hash 或 BaselineId。

**影响：**

某个仓库可能更新 World/ABI 定义而其他仓库继续使用旧文本，评审时难以确认唯一事实源。

**建议：**

指定一个 Canonical Architecture Baseline，发布 `ArchitectureBaselineId + ContentHash`；其余仓库由生成/同步流程镜像，或只保留仓库局部 README + 固定版本引用。暂不建议为此单独增加文档仓库。

---

## [P2-03] “100 名玩家”是合理里程碑，但不是可验收容量定义

**位置：**

- `*/docs/architecture/LumioGameEngine_Architecture_v0.3.md:L226-L235`
- `LumioServer/README.md:L72-L82`
- `LumioGame/README.md:L110-L116`

**问题：**

目前没有固定硬件、TickRate、Entity/Chunk/AOI 分布、技能频率、体素修改率、网络模型、运行时长和可接受 p99/内存阈值。

**影响：**

不同提交的“100 Bot”结果不可比较，也无法判断是否有容量余量或性能悬崖。

**建议：**

建立版本化 Workload Profile，至少测 1/10/25/50/100/150 或 200 玩家，记录性能斜率和拐点；将 100 人作为第一阶段目标负载，同时保留 30% 左右工程余量的验收设计。阈值应在 TickBudget/硬件 ADR 后确定，而不是现在拍定数字。

---

## [P2-04] MobileLocal 双角色的资源预算尚未进入设计门槛

**位置：** `*/docs/architecture/LumioGameEngine_Architecture_v0.3.md:L152-L175,L208-L217`

**问题：**

移动端 LocalEmbedded 同时持有 Server/Client ECS、Authoritative/Replica Voxel、两套 Gameplay Role 状态、预测历史和队列。文档只说后续在 Host/Runtime 优化，没有预算或降级策略。

**影响：**

内存峰值、线程竞争、热量和后台切换可能使该模式不可用；若过早把它设为第一阶段硬门槛，会拖慢服务器/桌面闭环。

**建议：**

保留逻辑正确性目标，但把移动端性能准入推迟到桌面 LocalEmbedded + NativeHeadless 闭环之后。先冻结可配置的 TickRate、Streaming 半径、Snapshot 历史、Bot/AI、Job 并发和内存预算，不允许通过共享 Server/Client World 来“优化”。

---

## [P3-01] 不应现在为 Renderer、网络、ECS Storage 或 Voxel Backend 建立通用插件系统

**位置：** 架构分层和各 README 的 Adapter/Port 约束。

**判断：**

当前替换边界已经足够表达第一阶段需求：Renderer 在 Client Adapter 外侧；Transport 在 Server/Client Host；ECS Storage 封装在 Runtime；Voxel 通过 Port 暴露。缺少的是语义契约，不是更多抽象层。

**建议：**

- Renderer：冻结 Presentation/Input Port，不做通用 Renderer Plugin Marketplace；
- 网络：冻结 Envelope/Transport Adapter，不同时支持多个生产协议；
- ECS：冻结 Query/Command/Snapshot 语义，不暴露可热插拔 Storage Backend；
- Voxel：它是产品核心，不以“可替换后端”为第一阶段目标；保持 Port 是为了领域隔离与测试，而不是承诺任意后端兼容。

---

# 3. Repository Responsibility Review

## 3.1 职责矩阵

| 仓库 | 应该拥有 | 当前拥有 | 不应该拥有 | 主要风险 |
| --- | --- | --- | --- | --- |
| **LumioNativeCore** | 通用 Rust Batch Kernel、Index+Generation Handle、内存/Worker/Typed Job 原语、通用空间/碰撞/压缩、ABI 基础类型与 Benchmark | README 基本符合 | Voxel/Gameplay/Session/CoreCLR、RPC Payload、ECS、体素感知业务策略 | 能力范围很广，若没有“跨项目复用 + 无领域名词 + Benchmark”准入规则，会成为 HPC 垃圾桶；公共 ABI 尚未冻结 |
| **LumioVoxelEngine** | VoxelWorld/ReplicaWorld、Chunk、Revision、Mutation、Streaming、Snapshot/Diff、Voxel Migration、Voxel Spatial/Collision Source | README 基本符合 | Gameplay 权限/扣费/技能、连接与 Replication Policy、ECS Storage、Host 生命周期 | AOI/Streaming 策略可放 Voxel 或 Coordinator 的表述过于模糊；跨 World 事务语义不足 |
| **LumioCoreEngine** | 锁定 NativeCore+Voxel 来源、统一 Root C ABI、平台构建、Loader、Manifest/Hash/签名、单加载和 ABI Smoke Test | README 明确是聚合发布层 | World、Kernel 算法、Voxel 领域、ECS/GAS、Host、Migration 业务逻辑 | 最容易成为“所有跨仓问题都塞进来”的职责黑洞；必须以无运行中 World 状态和无领域算法为硬约束 |
| **LumioGameRuntime** | ECS 语义、Logical Tick/Phase、GameWorld/ReplicaWorld Runtime、Coordinator、Replication 抽象、GAS Framework、Hot Reload 契约、Determinism/Test Kit | 当前声明范围很广且方向大体正确 | Socket/进程/端口、Voxel 内部、具体 Ability/经济/任务、Renderer | 与 Server/Game 的生命周期重叠；内部模块过多，若不做程序集级边界会形成托管单体 |
| **LumioServer** | Rust 进程、网络/Connection/Auth/Session、Host Pacing、WorldSlotHost、资源预算、CoreCLR Hosting、升级编排、故障治理 | 当前基本符合 | Logical Tick 状态、ECS World 生命周期实现、Replication Mapping、Gameplay Payload 语义、Voxel 内部 | 与 Runtime 同时声明 Tick Clock/SimulationSession；线程/队列/异常隔离未定 |
| **LumioClient** | Client Connection/Handshake、Replica Apply、Prediction/Correction/Rollback Host、Client Voxel 实例编排、Input/Presentation Adapter、Headless Bot | 当前基本符合 | Server Authority、具体 Gameplay/UI Content、协议 Schema 的唯一来源、Renderer 类型下沉 Runtime | Snapshot/Delta/Prediction 状态机未定；ECS/GAS/Voxel 回滚可能各自实现形成环依赖 |
| **LumioGame** | 具体 Server/Client Component、Processor、RPC Payload、Replication Mapping、GAS Content、Config/Content、Migration、Scenario、Release Composition | 当前基本符合 | Runtime/Host 生命周期状态机、Native ABI、通用契约生成器、网络/进程治理 | “定义 World 创建/销毁”与 Runtime 冲突；产品仓库可能吸收跨域 Tooling 和 Host 编排 |

## 3.2 应移动或澄清的职责

1. **Tick Clock 拆分：** Server 保留真实时间节拍与调度；Runtime 拥有逻辑 TickId 和 Phase Graph。
2. **World 生命周期：** Runtime 拥有状态机；Game 只提供模块描述符、初始化/迁移/销毁 Hook，不能定义宿主状态迁移。
3. **Replication：** Runtime 拥有 Projection/History/Apply 的通用语义；Game 拥有 Mapping；Server/Client 只拥有传输与角色适配。
4. **AOI：** NativeCore 是通用 Kernel；VoxelEngine 是 Voxel 候选/遮挡数据；Runtime/Server 是 Gameplay/Owner/带宽过滤。
5. **契约工具：** 必须指定独立版本化工具所有者，不能默认塞进 CoreEngine 或 Game。
6. **GAS：** Framework 继续留在 GameRuntime；Content 留在 Game，不应移动。

## 3.3 是否需要增加、合并或拆分仓库

- **当前不建议合并七个仓库。** 分层目标和发布节奏有真实差异。
- **当前不建议把 GameRuntime 再拆仓库。** 先在同仓库内拆稳定程序集/包，避免在协议尚未稳定时增加跨仓发布成本。
- **当前不建议拆 NativeCore。** 可在 Rust Workspace 内拆 crates；只有某个 Kernel 出现独立复用和发布节奏后再拆仓。
- **唯一可能合理的新仓库是 `LumioContractTooling`。** 前提是一个 Compiler/Registry 同时服务多个域且需要独立版本；若只是各仓局部生成器，则无需新增仓库。
- **CoreEngine 必须保留为纯聚合发布层。** 一旦加入 World 状态、调度、迁移或领域算法，应立即把代码移回所有者仓库，而不是继续扩张。

---

# 4. System Architecture Review

## 4.1 World / Session

### 结论

- **GameWorld 与 VoxelWorld 的权威状态划分是正确的。** C# 不复制完整 Chunk，Rust 不直接写 ECS，这一原则应冻结。
- **SimulationSession/WorldSlot 的物理与逻辑模型不完整。** 必须把 Server Host 对象、Runtime 逻辑会话、远端 Client 会话分开。
- **Cross-World 的方向正确，协议不足。** 第一阶段应采用 Tick Barrier 下的窄域协调事务，而不是通用分布式事务。

### 建议的生命周期

`WorldSlotHost`：

```text
Allocated
-> Bootstrapping
-> NativeReady
-> ManagedReady
-> LoadingSession
-> Running
-> Quiescing
-> Snapshotting / Reloading / Migrating
-> Stopping
-> Destroyed

Any Active State -> Faulted
```

`SimulationSession`：

```text
Created -> Initialized -> Ready -> Running <-> Paused
Running/Paused -> Draining -> Snapshotted -> Disposed
Any Active State -> Faulted
```

`ClientReplicaSession`：

```text
Disconnected -> Connecting -> Negotiating -> Synchronizing -> Active
Active -> Resyncing -> Active
Active/Resyncing -> Reconnecting -> Synchronizing
Any -> Closed/Faulted
```

### Snapshot 与 Revision

需要一个协调 Snapshot Cut：在 Tick Barrier 固定 `SnapshotId` 和 `SessionRevisionVector`，GameWorld 与 VoxelWorld 都对同一 Cut 输出快照。若 Voxel Snapshot 异步执行，需要 Revision Pin 或 Copy-on-Write，不能让 Chunk 在序列化期间继续变化却仍标为同一 Snapshot。

### AOI/Streaming

数据边界应是带 Revision 的只读投影或批次；性能边界由 Batch 大小、查询预算、Result 上限和超时表达。禁止 Runtime 持有 Voxel 内部指针，禁止 VoxelEngine读取玩家权限或 Gameplay Tag。

---

## 4.2 ECS / Entity

### 结论

- `NetEntityId + LocalEntityId` 必要但不充分；必须加生命周期、墓碑、OwnershipRevision。
- Server/Client Component 非对称是正确设计；Mapping 不能只停留在字段复制表。
- “System 可选”不会天然削弱架构，前提是 Processor Descriptor 强制且可诊断。

### Replication Mapping 最低维度

```text
Source Entity Type / Presence
Source Component + Field
Target Client Component + Field
Role
Owner / NonOwner
AOI / Visibility Class
Initial Snapshot / Continuous Delta
Reliable / Unreliable Channel
Quantization / Compression
Predicted / Authoritative
Add / Remove / Tombstone Policy
```

### Destroy、Respawn、Ownership、Authority

- Destroy：发 Tombstone，保留到 Baseline Ack；
- Respawn：第一阶段使用新 NetEntityId；
- Ownership Transfer：增加 `OwnershipRevision`，在同一 Replication Barrier 生效；
- Authority Transfer：第一阶段明确不支持，所有权威仍在 Server；
- Migration：保留 NetEntityId 与生命周期 Revision；
- Replay：按原 ID 和原 Tick 重放，不重新分配。

### CommandBuffer

冻结：每 Processor 独立写入、稳定合并顺序、结构提交点、Deferred Entity Token、无效目标错误、同 Tick Create/Write/Destroy 的规则。Processor 正在迭代 Archetype 时不得直接改结构，这一现有原则正确。

### 稳定 API

应冻结语义而非实现布局：Entity Handle、Query、Change Tracking、CommandBuffer、Snapshot Projection、Replication Dirty Set。Archetype/Chunk 内存布局可以边 Benchmark 边演进。

---

## 4.3 GAS

### 结论

- **Framework 放 GameRuntime 合理。** 它是跨游戏的生命周期、预测与回滚基础，不应放在具体 Game。
- **当前 API 范围过大且未分层。** 不应一次性实现完整 UE GAS 语义。
- **必须避免网络绑定。** 当前文档对此约束正确，应继续通过 Prediction/Replication Port 连接 Host。

### 所有权与生命周期

- Runtime：Ability/Effect 实例状态机、Attribute 聚合、Tag Registry、确定性时间、Prediction Context、Snapshot/Restore；
- Game：具体类型定义、Formula、Cost、Cooldown、Targeting、表现事件；
- Server：权威确认与消息传输；
- Client：本地预测历史和表现适配；
- GameRelease：稳定 TypeId 与内容 Hash。

### 必须在 GAS 开发前冻结

1. 类型 ID、实例 ID、Handle 和 Snapshot ID 的区别；
2. Ability/Effect 状态机；
3. Stack、Duration、Periodic Tick、Cancel、Remove 的顺序；
4. Attribute Modifier 求值顺序；
5. Event/Trigger 循环检测和最大深度；
6. PredictionKey、确认/拒绝、回滚窗口；
7. 同一 PredictionFrame 内 ECS/GAS/Voxel Overlay 的一致性；
8. Hot Reload 时旧 TypeId 的 Migration/拒绝策略；
9. Determinism、RNG 和 Replay 格式。

可推迟：高级 Targeting DSL、复杂触发图、跨 Ability 依赖求解器、通用 Formula VM。

---

## 4.4 Server / Client

### CoreCLR Hosting 边界

Rust Server Host + C# Gameplay 是合理组合，但应明确一进程一个 CoreCLR、稳定 Runtime 常驻、Gameplay 使用 Collectible ALC。Rust Host 只调用稳定 Managed Entry，不保存热更方法地址。

### 建议线程模型

- Network Reactor：收包、Envelope 校验、限流、分片/可靠通道；
- Ingress Builder：按 Session/Tick 生成有界 InputBatch；
- Simulation Owner Thread：唯一进入 Managed Tick；
- Native Job Pool：执行 Typed Native Kernel；
- IO/Persistence Worker：异步持久化；
- Egress Queue：网络发送和断线命令。

网络回调不能调用 Gameplay；任何 Job 结果只在 Tick Barrier 应用。

### Client Apply / Prediction / Correction

禁止形成三个互相回调的子系统。统一流程：

1. 收到权威 Delta；
2. 验证 Baseline/Revision；
3. 恢复最近 Confirmed PredictionFrame；
4. 原子应用 ECS/GAS/Voxel 权威结果；
5. 删除已确认命令；
6. 按原顺序重放未确认命令；
7. 生成表现差异。

### DS 隔离与恢复

WorldSlot 可以做资源和逻辑隔离，但同进程无法隔离 OOM、Native UB 或 CoreCLR 崩溃。第一阶段宜一个活跃 WorldSlot/进程，或至少承认多 World 同故障域。优雅停服流程必须与 Snapshot Cut、Ingress Gate、Egress Drain 协调。

### Determinism Harness 与 Bot

Server 和 Client 都需要独立 Harness：Server 比较权威完整状态；Client 比较 Replica、Prediction History 和表现事件。Headless Bot 应真实复用 LumioClient 的连接、Replica、Prediction，仅替换 Input/Presentation Adapter。

### 兼容层级

至少分开：Transport Envelope、Network Protocol、Runtime API、Replication Protocol、Gameplay Schema/Mapping、Content/Config、GameRelease。第一阶段全部 exact-match；不要过早实现复杂跨版本兼容。

---

## 4.5 Native / Managed Boundary

### 结论

语言边界总体合理：Rust 负责 Host、Voxel、HPC；C# 负责 ECS、GAS、Gameplay。高风险不在语言选择，而在 ABI、GC、线程和生命周期未形成可执行契约。

### 必须明确的边界规则

- Root API Table 与 Capability 协商；
- Caller-owned Buffer 或 Origin-owned Free；
- Handle 不暴露指针，Index+Generation+Context 校验；
- Rust panic/C# exception 不跨边界；
- 不逐 Entity、逐 Voxel、逐包 FFI；
- 不从 Native Worker 回调 Hot Gameplay；
- 不在 Managed 调用期间持有长时 Rust 锁；
- P/Invoke/Source Generated Binding 只来自锁定 Schema；
- CoreEngine 同进程单加载，Server/Client/LocalEmbedded 都从同一 Root API 获取能力。

### 重复加载、符号与版本漂移

CoreEngine 作为单包发布层是正确对策，但还需要进程级 Loader Registry、平台唯一链接方式、导出符号前缀、Manifest Hash、ABI Layout Test 和拒绝第二版本的错误路径。仅在 README 写“只加载一次”不构成保证。

---

## 4.6 Host Profile

### LocalEmbedded

只在以下条件下才具有真实 DS 路径价值：复用 Schema/Serializer/Envelope、使用有界队列、按 Tick 异步交付、执行权限与 Release 校验、支持 Fault Decorator。它永远不能替代 Split Process 对 OS 网络、端口和进程故障的测试。

### 优先级建议

1. PureHeadless（Gameplay/ECS/GAS + Reference Port）
2. NativeHeadless（真实 Core/Voxel）
3. LocalEmbedded（真实协议边界）
4. LocalSplitProcess
5. DS + Headless Client/Bot
6. RemoteDS
7. MobileLocal 性能准入

### RoomMode 选择时机

进入房间/创建 Session 前选择部署 Preset 是正确的。Gameplay 不读取 Local/Offline 布尔值。Public/Player/Localhost DS 可以共享 Gameplay 与协议，但其 Host Capability、认证和资源策略不应只靠 Endpoint 隐式区分。

### Listen Server

不需要。长期代价是额外进程与资源；长期收益是没有 Host 玩家特殊权威、没有 Listen 专属同步/安全路径、Player-hosted 与 Public DS 更一致。建议形成明确 Non-Goal ADR，避免未来团队再次引入。

---

## 4.7 Update / Migration

### GameReleaseId

同一 `GameReleaseId` 是必要条件，不是完整条件。实际握手和启动应校验不可变 ReleaseManifestHash，以及 Server/Client Assembly、Generated Contract、Runtime API、Core ABI/Capability、Network/Replication Protocol、Voxel Schema、Config/Content 和 Migration 列表。

### 开发期重建 World

可执行，但必须在双 Role Barrier：停止采样/接入 → Drain/Discard 规则 → 取消 ModuleScope → 卸载旧 ALC → 创建新 Server/Client World → 重注册 Mapping/Processor → Full Resync。Native Voxel World 是否保留必须由结构变更类型决定，不应默认所有变更都保留或都重建。

### Hot Reload 资源清理

Timer、Task、Subscription、Native Lease、Channel Registration 必须可枚举、可取消、可诊断；不能只依赖玩法作者“自觉清理”。Framework 负责结构安全和资源回收证明，Game 作者负责语义迁移。

### Migration 失败

从不可变协调 Snapshot 迁到 Staging；只有全部校验成功才原子激活。失败保留旧数据与旧 Release，可重跑，不允许在原地覆盖半成品。

### 连接/重连遇到更新

第一阶段：冻结接入，返回 Maintenance/RequiredReleaseId；旧 Client 不进入新 Session。更新完成后重新握手并 FullSnapshot。推迟同一房间内跨 Release 无缝重连。

### Framework 与玩法作者责任

- Game 作者：业务语义、默认值、经济/任务/Ability 迁移；
- Framework：Schema 唯一性、布局兼容、必需 Migrator 检查、输入输出版本、大小/资源限制、Dry Run、跨引用校验、失败隔离、回滚和审计。不能把全部兼容风险简单下放给玩法作者。

---

## 4.8 Testing / Observability

### 统一 CLI

职责方向正确，但所有者未定义。第一阶段可由 LumioGame 作为 Composition Root 提供命令入口，各仓库提供标准 Test Adapter；若未来有多个游戏，再把 CLI Compiler/Runner 提升为共享 Tooling。

### 覆盖矩阵

- PureHeadless：Runtime/GAS/Reference Port；
- NativeHeadless：ABI/Voxel/Native 性能；
- LocalEmbedded：协议、复制、预测；
- LocalSplitProcess：端口、启动、进程隔离；
- RemoteDS：真实网络/部署；
- MobileLocal：资源与平台。

每个 Scenario 必须声明 Capability，不能宣称所有场景无条件覆盖所有 Host。

### 测试类型

- Golden：Schema、Snapshot、Migration、Replay；
- Property：Entity 生命周期、Revision 单调性、Mapping；
- Fuzz：ABI、Envelope、Serializer、Chunk 数据、Migration 输入；
- Stress：Tick、队列、AOI、Replication、Native Job；
- Soak：长时间、断线重连、100 次热更、内存趋势；
- Differential：Reference Port 与 Native Port、Server Run 与 Replay；
- Fault Injection：见下表。

### 故障注入矩阵

| 域 | 必测故障 |
| --- | --- |
| 网络 | 延迟、抖动、丢包、乱序、重复、分片丢失、断线、重连、队列满 |
| Cross-World | Prepare 冲突、超时、重复 Txn、Commit 结果丢失、进程在两个 Commit 间崩溃 |
| Voxel | Chunk Load Failure、Revision Conflict、Snapshot Corruption、Migration Failure |
| Native | ABI Mismatch、Capability 缺失、失效 Handle、Job Timeout、panic、重复加载 |
| Managed | Gameplay exception、ALC 泄漏、Timer/Task 未取消、Hot Reload Failure |
| 资源 | OOM、CPU Stall、磁盘满、持久化超时、Backpressure |
| Release | Assembly Hash 不匹配、Schema 不匹配、内容 Hash 不匹配、签名失败 |

### 统一格式

日志、Metrics、Trace、Snapshot 和 Replay 应共享关联字段：`GameReleaseId、SessionId、WorldId、TickId、TxnId、NetEntityId、PredictionKey、SnapshotId、TraceId`。一次失败应产出可直接被 `lumio test replay --bundle ...` 重建的 Failure Bundle。

### 性能

必须覆盖 Tick、Processor、GAS、ECS Storage、AOI、Voxel Streaming、Replication、Network、Native Job、GC/Rust/总内存。100 人可以作为第一阶段目标，但必须绑定固定 Workload、硬件和 TickBudget，并有 150/200 人的压力余量测试。

---

# 5. Missing Design Decisions

| 优先级 | 缺失设计 | 所属仓库 | 为什么必须补 | 建议产物 |
| --- | --- | --- | --- | --- |
| P0 | Session/World/Clock 唯一所有权 | Server + Runtime + Client + Game | 当前多仓同时拥有 Tick/生命周期 | ADR + 3 个 State Machine + Sequence Diagram |
| P0 | Tick Phase 与 Processor Scheduler | GameRuntime | 决定 CommandBuffer、Native Job、Cross-World、Replication 和 Replay 顺序 | ADR + API Contract + Determinism Test Fixture |
| P0 | CrossWorldTxnV1 | GameRuntime + VoxelEngine + Server | 防止半提交、重复提交和重放分叉 | API Contract + State Machine + Failure Matrix |
| P0 | EntityIdentity/LifecycleV1 | Runtime + Server + Client + Game | 支持销毁、重连、Replay、Migration、Ownership | Schema + ADR + Property Test |
| P0 | Replication/Prediction/ResyncV1 | Runtime + Server + Client + Game | Server/Client 并行实现的共同语义 | Wire Schema + State Machine + Sequence Diagram |
| P0 | SessionRevisionVector/SnapshotCut | Runtime + Voxel + Server | 保证 ECS/GAS/Voxel 同一状态切面 | Schema + Snapshot Fixture + Replay Fixture |
| P0 | NativeManagedAbiV1 | NativeCore + CoreEngine + Runtime + Hosts | 避免 ABI/GC/线程/错误灾难 | C Header/API Table + Managed Binding + Conformance Test |
| P0 | Contract Toolchain、ID Registry、三张依赖图 | 全仓 | 防止生成环、ID 冲突和 Hash 不可复现 | ADR + Schema + Compiler Fixture + DAG Check |
| P1 | GAS Core State Model | GameRuntime + Game | 避免过早绑定网络/具体玩法 | ADR + State Machine + Golden Test |
| P1 | Server Thread/Queue/Backpressure/Fault Model | Server + Runtime | 防止 OOM、死锁和错误边界不明 | Thread Diagram + Queue Contract + Failure Matrix |
| P1 | Local Transport Fidelity | Server + Client + Runtime | 保证 Local 测试不绕过生产语义 | API Contract + Fault-injected Test Fixture |
| P1 | Hot Reload ModuleScope | Runtime + Server + Client | 保证 ALC、Task、Timer、Handle 可回收 | State Machine + Resource Registry API + Soak Test |
| P1 | Release Compatibility Predicate/Handshake | Core + Runtime + Server + Client + Game | `GameReleaseId` 本身不足 | Manifest Schema + Compatibility Matrix + Negative Tests |
| P1 | Migration DAG、Staging、Rollback | Game + Voxel + Server | 固定顺序和原地迁移不安全 | ADR + Migration Schema + Old-version Fixtures |
| P1 | Voxel Spatial Projection / AOI Boundary | Native + Voxel + Runtime + Server | 消除隐性耦合 | Port API + Data Schema + Benchmark Definition |
| P1 | Replay Hash 与 FailureBundleV1 | Runtime + Voxel + Game + Hosts | 才能自动定位首个差异和重建环境 | Schema + CLI Contract + Differential Fixture |
| P1 | Scenario Capability Model / Reference Ports | Runtime + Game + Voxel | 解决 PureHeadless 与 Native 场景矛盾 | Capability Schema + Reference Test Fixture |
| P1 | 100 人 Workload/TickBudget | Server + Client + Game + Core | 让性能结果可比较、可验收 | Benchmark Definition + Dataset + Hardware Profile |
| P2 | MobileLocal Resource Budget | Client + Runtime + Voxel | 防止双角色模式后期不可落地 | Budget ADR + Mobile Benchmark |
| P2 | Listen Server Non-Goal | Server + Client + Game | 避免后续重新引入第三套权威路径 | ADR |
| P2 | Canonical Architecture Baseline | 全仓 | 防止七份文档漂移 | Baseline Manifest + Hash Check |

---

# 6. Development Readiness Gate

| 项目 | 准入判断 | 现在可以做 | 准入前禁止固化/必须先补 |
| --- | --- | --- | --- |
| **NativeCore** | CONDITIONALLY_READY | 内部 Kernel、Handle Table、Benchmark、Miri/Sanitizer 骨架 | 公开 C ABI；先冻结 NativeManagedAbiV1 |
| **VoxelEngine** | CONDITIONALLY_READY | Chunk/Revision/单域 Mutation、只读 Query、Snapshot 原型 | Cross-World Commit、Replica 协议；先冻结 Txn/Revision/Snapshot |
| **CoreEngine** | CONDITIONALLY_READY | 可复现组合构建、单加载 Loader、Manifest/ABI Smoke | 对外稳定包与绑定；先冻结 Root ABI/平台链接矩阵 |
| **GameRuntime ECS** | CONDITIONALLY_READY | Storage/Query/CommandBuffer 单线程原型 | Public Tick/Entity/Processor API；先冻结 Lifecycle、Tick、ID |
| **GameRuntime GAS** | NOT_READY | 仅可做状态机实验与 Fixture | 正式 Framework API；先冻结 GAS Core Model 和 Prediction |
| **Server Host** | CONDITIONALLY_READY | Rust 进程、Network Reactor、有界队列、CoreCLR Smoke | SimulationSession/Tick/Upgrade 主干；先冻结所有权和错误域 |
| **Client Replica** | NOT_READY | 仅可做连接/队列和 throwaway apply 实验 | Snapshot/Delta/Prediction 正式实现；先冻结 ReplicationV1 |
| **LocalEmbedded** | NOT_READY | 仅可做 Transport 接口 Spike | 作为验收路径；先冻结 Fidelity、Replication、双 Role 生命周期 |
| **Gameplay Content** | NOT_READY | 一个可丢弃的垂直切片 Fixture | 大规模 Component/RPC/GAS Content；先冻结 Schema/Mapping/GAS |
| **Replay/Test Infrastructure** | CONDITIONALLY_READY | Failure Bundle、CLI Adapter、种子/产物目录骨架 | 稳定 Replay 格式；先冻结 Snapshot/Hash/Revision |
| **Performance Infrastructure** | CONDITIONALLY_READY | Metrics、Trace、Benchmark Harness、数据集版本化 | 性能验收阈值；先冻结 TickBudget、Workload 和硬件 Profile |

**总体 Gate 规则：** 七项 P0 全部形成 ADR/API/Schema，并各有至少一个可执行正向 Fixture 与一个失败 Fixture 后，整体状态才可从 NOT_READY 升为 CONDITIONALLY_READY。

---

# 7. 最小开发切片

在 P0 Gate 通过后，建议只做一个端到端闭环：**`PlaceVoxelAbility`（消耗一个建造资源并放置一个 Voxel）**。

## 7.1 最小对象

### Server Component

```text
BuildResourceAuthority
- AvailableBlocks: int32
- ResourceRevision: uint32
```

另有 Server-only：

```text
BuildPermissionAuthority
- CanBuild: bool
- BuildRadius: fixed-point
```

### Client Component

```text
BuildResourceHudReplica
- DisplayBlocks: int32
- LastConfirmedTick: uint64
```

Client-only：

```text
BuildGhostPresentation
- TargetCell
- VisualState
```

### 不对称 Replication Mapping

```text
BuildResourceAuthority.AvailableBlocks
  -> BuildResourceHudReplica.DisplayBlocks
  Scope: OwnerOnly
  Mode: ReliableOnChange
  Initial: Included

BuildPermissionAuthority
  -> 不复制，只由 Server 校验

BuildGhostPresentation
  -> Client 本地，无 Server 对应 Component
```

这能证明两端 Component 名称、字段、生命周期和存在性均可不同。

## 7.2 World

- 一个 Server `GameWorld`；
- 一个权威 Rust `VoxelWorld`，至少一个已加载 Chunk；
- 一个 Client `ReplicaWorld`；
- 一个 Client `VoxelReplicaWorld`；
- 一个 Server Replication Context；
- 一个 Client Prediction History。

## 7.3 GAS Ability

Game 中定义 `PlaceVoxelAbility`：

- Client 采样目标 Cell，生成 `PredictionKey`；
- Runtime GAS 做 CanActivate、预测激活和等待确认；
- Server 校验权限、距离、资源、Cooldown；
- 具体 Cost/Targeting 属于 Game，状态机与 Prediction Context 属于 Runtime。

## 7.4 Command 与 Cross-World Txn

```text
PlaceVoxelCommand
- NetEntityId
- Cell
- MaterialId
- ClientCommandSeq
- PredictionKey
- ExpectedGameRevision
- ExpectedVoxelRevision
```

顺序：

1. Server 收到 Command，验证 Release/Schema/Ownership；
2. GAS Prepare：预留一个 `AvailableBlocks`，不立即可见；
3. Voxel Prepare：确认 Chunk 可用、Cell 可放置、Revision 匹配，返回 Prepared Token；
4. Coordinator 在固定 Barrier 决定 Commit；
5. Voxel Commit 与 ECS CommandBuffer Commit 按冻结顺序幂等执行；
6. 生成 `SessionRevisionVector`、GAS Authority Confirm 和 Replication Delta；
7. Client 原子应用 Voxel/ECS/GAS 确认；失败则回滚 Ghost/Cost 预测；
8. 重复 `TxnId/ClientCommandSeq` 返回原结果，不再次扣费。

## 7.5 LocalEmbedded 双角色 Host

- 同一 CoreCLR、稳定 Runtime；Server/Client Gameplay 各自 ALC；
- 两个 ECS World、两个 Voxel World；
- 相同 Serializer/Envelope/MessageId；
- 双向有界 InMemoryTransport；
- 默认注入 50ms 延迟，可切换丢包/乱序/重复；
- 严禁对象引用直传和直接 Processor 调用。

## 7.6 Headless Scenario

`Scenario.PlaceVoxel.BasicV1`：

1. Tick 0 创建玩家和一个空 Cell；
2. Tick 5 发送合法建造，断言资源减 1、Voxel 存在、Client 显示一致；
3. Tick 6 重复同一 Command，断言无二次扣费/建造；
4. Tick 10 发送过期 `ExpectedVoxelRevision`，断言两域都不提交；
5. 注入一个 Delta 丢失，断言 Client Gap → Resync；
6. 断线、重连、FullSnapshot，断言 NetEntityId 不变、LocalEntityId 可重建；
7. 结束时断言无 Native Handle、ALC Scope、Timer、Task 泄漏。

同一 Scenario 至少在 Reference/PureHeadless（使用 ReferenceVoxelPort）、NativeHeadless、LocalEmbedded 和 LocalSplitProcess 运行。

## 7.7 Replay

Failure/Replay Bundle 包含：

- GameRelease/Manifest Hash；
- Scenario/Seed；
- Command Stream 与 Fault Profile；
- Tick 0/5/10 Snapshot；
- 每 Tick 的 Game/ECS/GAS/Voxel 分层 Hash；
- Txn、Prediction 和 Revision 日志。

验收：Replay 能指出首个差异 Tick、World、NetEntityId、Component 或 Chunk。

## 7.8 性能基线

临时工作负载（正式阈值待 TickBudget ADR）：

- 100 Headless Client/Bot；
- 10,000 ECS Entity；
- 256 活跃 Chunk；
- 每秒可配置建造、移动、AOI、碰撞和 Snapshot 请求；
- 30 分钟基准 + 至少一次 4 小时 Soak；
- 记录 Tick p50/p95/p99/max、CPU、RSS、Managed Allocation/GC、Rust Heap、Job/Ingress/Egress Queue、Replication 字节、丢包/重传、FFI Batch 数量和大小。

并运行 1/10/25/50/100/150 玩家曲线，避免只看单点。

## 7.9 Server/Client GameRelease 校验

握手必须同时校验：

```text
GameReleaseId
ReleaseManifestHash
ServerGameplayAssemblyHash
ClientGameplayAssemblyHash
GameplayContractHash
ReplicationMappingHash
RuntimeApiSchemaVersion
CoreEngineAbiVersion + CapabilityHash
NetworkProtocolVersion
ReplicationProtocolVersion
VoxelSchema/MigrationVersion
ConfigHash + ContentHash
```

任一不匹配都返回稳定错误并拒绝进入 Session。第一阶段不做“相近版本也许能连”的推断。

---

# 8. 最终建议

## 8.1 未来 2–3 个架构迭代周期

### 迭代 0：Architecture Gate

目标不是写完整引擎，而是把 P0 变成可执行契约：

- Session/World/Clock 所有权；
- Tick Phase；
- CrossWorldTxn；
- Entity Lifecycle；
- Replication/Prediction；
- Revision/Snapshot/Replay；
- Native/Managed ABI；
- Contract Toolchain/Manifest。

每项必须包含失败语义和最小 Fixture，不接受只有概念图的 ADR。

### 迭代 1：单一垂直切片

实现本报告第 7 节的 `PlaceVoxelAbility`，只支持 exact-match Release、单 WorldSlot、单权威 Simulation Thread、一个 GAS Ability、一个 Mapping。首先跑通 NativeHeadless 与 LocalEmbedded，再进入 Split Process。

### 迭代 2：生产路径验证

加入：

- LocalSplitProcess/RemoteDS；
- 网络与 Cross-World 故障矩阵；
- ALC/Task/Handle 100 次热更 Soak；
- Staging Migration 与失败回滚；
- 分层 Replay 首差异；
- 100 人标准负载和 150/200 压力曲线；
- Client reconnect/resync 与 Release 拒绝路径。

## 8.2 必须先冻结的协议

1. Session Lifecycle / Tick Contract；
2. CrossWorldTxnV1；
3. EntityIdentity/LifecycleV1；
4. Replication/Prediction/ResyncV1；
5. SessionRevisionVector / SnapshotCut / ReplayHash；
6. NativeManagedAbiV1 / Loader；
7. Contract Toolchain / ID Namespace；
8. Release Manifest / Compatibility Predicate。

## 8.3 可以边开发边演进

- ECS Archetype/Chunk 具体内存布局；
- Native 空间索引、压缩和 SIMD 实现；
- Voxel Chunk 内部布局和 Mesh 算法；
- Renderer Adapter；
- 具体 Gameplay Formula、Targeting、AI 与内容；
- 在确定性规则内的 Processor 并行优化；
- Benchmark 阈值的逐轮校准。

## 8.4 应该推迟的复杂能力

- 任意 Authority Transfer、跨 Server World 迁移和 Sharding；
- 同一在线 Session 的跨 Release 无缝滚动升级；
- 完整复杂 GAS Trigger Graph/Formula VM；
- Listen Server；
- MobileLocal 的深度内存优化；
- 可热插拔 ECS/Voxel Backend；
- 通用脚本控制平面；
- 复杂跨域 Durable 2PC。

## 8.5 不建议引入的抽象

- 巨型 `INativeEngine`；
- 通用 `IWorld` 抹平 Game/Voxel 领域差异；
- Server/Client 强制共享 Component 基类或镜像 Schema；
- 任意 Native ↔ Managed 回调总线；
- 全局无类型 Event Bus；
- 为“未来可能替换”而设计的通用插件系统；
- 把所有 Manifest、Codegen、Loader 和 Migration 都塞入 CoreEngine；
- 为 Local 模式创建旁路 Gameplay API。

## 8.6 下一轮 ADR 清单

1. Session Ownership and Clock Split
2. Tick Phase and Deterministic Processor Scheduling
3. CrossWorldTxnV1
4. Entity Identity, Tombstone and Ownership Revision
5. Replication Baseline, Delta, Prediction and Resync
6. Coordinated Snapshot and SessionRevisionVector
7. NativeManagedAbiV1 and Single-Load Loader
8. Contract Toolchain, ID Registry and Dependency DAGs
9. GAS Core State Model
10. Local Transport Fidelity and Fault Injection
11. Hot Reload GameplayModuleScope and Fault Domains
12. Release Manifest and Exact-Match Handshake
13. Migration DAG, Staging and Atomic Activation
14. Voxel Spatial Projection / AOI Boundary
15. Replay Hash, FailureBundle and Reproduction CLI
16. Benchmark Workload, TickBudget and Hardware Profile
17. Listen Server Non-Goal

---

# 9. 最终总结

LumioGameEngine V3 **不是方向错误**，也不需要推倒重来。七仓库的宏观分层、Rust/C# 分工、GameWorld/VoxelWorld 双权威域、非对称 Component、Local 双角色和统一 Native 包都是可保留的正确骨架。

当前的问题是：架构已经列出了大多数正确名词，却还没有把最容易产生跨仓分叉的部分压缩成唯一状态机、唯一 Revision、唯一 ABI 和唯一兼容判定。此时直接让七个仓库全面开工，会把未决的架构选择固化为多套代码事实。

因此最终准入结论为：

> **NOT_READY for integrated mainline development.**
> **READY for isolated, disposable spikes and architecture fixtures.**

只要先完成 P0 的八类契约，并用一个 `PlaceVoxelAbility` 垂直切片验证，不需要增加大量抽象，也不需要合并现有仓库，V3 就可以在下一轮转为 **CONDITIONALLY_READY**。
