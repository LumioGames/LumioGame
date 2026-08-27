# LumioGameEngine V3 (v0.3) Architecture Review

> **评审日期**：2026-08-27
> **评审范围**：LumioNativeCore、LumioVoxelEngine、LumioCoreEngine、LumioGameRuntime、LumioServer、LumioClient、LumioGame（main 分支）
> **评审依据**：各仓库 `README.md`、`docs/architecture/LumioGameEngine_Architecture_v0.3.md`、`.github/workflows/repository-policy.yml`
> **评审性质**：独立、严格、面向开发前置条件的架构评审（不修改代码或文档）

---

## 评审前提说明

**七个仓库目前没有任何实现代码。** 每个仓库仅包含：

- `README.md`
- 一份逐字节相同的 `docs/architecture/LumioGameEngine_Architecture_v0.3.md`（md5 `e0fbba7908d74e07de7e974b69f5a166`，7 份拷贝完全一致）
- 仅校验 README 标题的 `repository-policy.yml`
- 单人 `CODEOWNERS`（`@Go1c`）

因此「代码与文档一致性」无从评审，本次结论完全基于设计文档对**开发前置条件**的充分性判断。

**文档漂移证据**：当前 Cursor 工作区 `/Users/cui/Sites/LumioEngine/LumioGame` 的拷贝已落后一个 commit 且缺失 `docs/` 目录，说明多拷贝同步机制尚未建立。

---

## 1. Executive Verdict

### 总体结论

**CONDITIONALLY_READY**

v0.3 是一份**边界契约**，不是一份**可实现规范**。它在仓库职责、依赖方向、语言边界、World 所有权、双层实体身份、「Local 不走捷径」这些容易犯错的地方表现出罕见的纪律性，且各仓库 README 之间自洽度很高。

但架构文档开篇自己承认「本文描述边界和行为，不替代具体 API 设计」（v0.3 行 3）——问题在于，被推迟的恰恰不是 API 细节，而是**决定四个仓库能否并行开发的运行时协议**：Tick 阶段机、跨 World 事务语义、NetEntityId 生命周期、复制协议、确定性策略。这些协议每一个都横跨 2–4 个仓库，不先冻结就并行开工，每个仓库会各自发明一套语义，返工将在集成期集中爆发。

### 最大的三个风险

1. **核心协议全部停留在名词层。** Tick、Prepare/Commit、Snapshot/Delta/Ack、NetEntityId、Capability、Replay 格式在全部文档中只以名词出现，没有一个有可实现的状态机或失败语义。这不是文档不完整，而是跨仓库接口未冻结。

2. **确定性是整个架构的承诺基础，却没有任何确定性设计。** 「Replay 必须能在不同 Host 重放并指出第一个 Tick 差异」（v0.3 §8.3）是 §1 首要目标的直接推论，但浮点策略、RNG、Processor 调度顺序、State Hash 覆盖范围全部空白。这条不成立，测试架构的核心卖点就不成立。

3. **复制/预测链路没有单一所有者。** Snapshot Projection 在 Runtime、Replication Context 在 Server、Apply/Prediction/Rollback 在 Client、Mapping 在 Game——四个仓库各持一段，没有一份端到端协议文档，且 Client 与 Runtime 对 Prediction/Correction/Rollback 存在双重所有权声明。

### 当前最适合开始开发的范围

- LumioNativeCore 全部（其「当前阶段任务」本身就是正确的第一步）
- LumioCoreEngine 的构建/打包/Manifest/Loader 管线
- LumioVoxelEngine 的领域内核（Chunk/Revision/Mutation 数据模型与序列化）
- LumioServer 的 Connection/Session/Transport 与 CoreCLR Hosting 技术验证（spike）

### 当前不应该开始的范围

- GAS Framework
- Client Prediction/Correction/Rollback
- Replication Mapping 实现
- Gameplay Content
- 生产 Migration 编排
- 跨 Host Replay 基础设施

这些全部被未冻结的 P0 协议阻塞。

---

## 2. Findings

> 按严重程度排序。每个 Finding 均含：位置、问题、影响、证据、建议。

### P0 —— 不解决就不应进入（对应模块的）开发

---

#### [P0-1] 核心运行协议只有名词，没有语义

- **位置**：`docs/architecture/LumioGameEngine_Architecture_v0.3.md`（7 仓库同文件）§3.3、§4.3、§8.3、§9.1
- **问题**：整份体系依赖一组反复出现的协议名词——Tick 阶段、CommandBuffer 提交点、Typed Channel、Snapshot、Revision、Replay 格式、Capability 表——但没有任何一处给出阶段枚举、顺序、格式或状态机。全文对 Tick 结构的最具体描述只有两句：「所有结构变更通过 CommandBuffer，在固定 Tick 阶段统一提交」（行 131）和「在同一个 Tick 的 Commit 阶段提交」（行 100）。「固定 Tick 阶段」有哪些阶段、Input/Simulation/GAS/Coordinator/Snapshot/Replication 的先后顺序、VoxelWorld Tick 相对 GameWorld Tick 的位置，全部未定义。
- **影响**：Tick 阶段机是 Runtime、Server、Client、VoxelEngine 四方的共同时序契约。不冻结它，Server 的「驱动权威 Tick」（LumioServer README 行 28）、Runtime 的「Tick 阶段、结构提交」（LumioGameRuntime README 行 18）、Coordinator 的「同 Tick Commit」三者无法对齐，任何一方先写代码都是在猜。
- **证据**：

```127:132:/Users/cui/LumioGames/LumioNativeCore/docs/architecture/LumioGameEngine_Architecture_v0.3.md
### 4.3 执行模型

- `Processor/Handler` 是主要执行抽象，按 Query、Role、Phase 和读取/写入集合注册。
- `System` 不是必需概念；仅在需要传统调度注册语义时作为 Processor 的一种实现。
- 所有结构变更通过 CommandBuffer，在固定 Tick 阶段统一提交。
- 网络线程、Native Job 和平台回调只能向 Typed Queue/Channel 写入数据；Gameplay Processor 在确定性 Tick 中消费。
```

- **建议**：在 LumioGameRuntime 出一份 Tick 阶段机 ADR + State Machine：阶段枚举（建议至少 `IngestInput → Simulate → GasTick → CoordinatorPrepare → CoordinatorCommit → StructuralCommit → SnapshotProject → Replicate`）、每阶段允许的操作集合、VoxelWorld Tick 的插入点、CommandBuffer 的提交与可见性规则。这是所有其他协议的时间轴，必须第一个冻结。

---

#### [P0-2] Cross-World Prepare/Commit 只有快乐路径，且 Prepare 的副作用语义存在歧义

- **位置**：v0.3 §3.3（行 94–103）；LumioVoxelEngine README 行 29
- **问题**：协议全文四步，其中失败处理只有一句「任一失败则返回可记录、可重试的失败结果」。未定义：(a) Prepare 是否产生副作用——行 99 说 Coordinator 在 Prepare 阶段收集「VoxelWorld **Mutation 结果**」，如果 Prepare 已经执行了 Mutation，那 GameWorld 侧校验失败时 Voxel 侧如何撤销？如果 Prepare 只做验证，Commit 时 Voxel 状态已变（如异步 Chunk 卸载）怎么办？(b) 超时与重试的幂等键；(c) 同一 Tick 内多个 Prepare 触碰同一 Block/资源时的排序与冲突仲裁；(d) 失败分类（可重试 vs 永久失败 vs 需要回滚）；(e) Chunk 未加载时 Prepare 的行为（同步失败？触发加载后下一 Tick 重试？）。用户问题 C5、C7 在现有文档中没有任何答案。
- **影响**：这是 GameWorld 与 VoxelWorld 之间唯一的写协作协议，建造/破坏/资源类玩法全走这条路。语义不冻结，VoxelEngine 的「变更摘要和可重试结果」（其 README 行 29）和 Runtime Coordinator 会各自实现出不兼容的假设；半提交和状态不一致会成为最难排查的一类 bug。
- **证据**：

```96:101:/Users/cui/LumioGames/LumioNativeCore/docs/architecture/LumioGameEngine_Architecture_v0.3.md
例如建造玩法需要同时修改玩家资源和体素块时：

1. Gameplay Processor 通过 `IVoxelWorldPort` 发出带 `TickId` 的 Prepare 请求。
2. Coordinator 收集 GameWorld 资源校验和 VoxelWorld Mutation 结果。
3. 两边均成功时在同一个 Tick 的 Commit 阶段提交；任一失败则返回可记录、可重试的失败结果。
4. Snapshot、Replay 和 Metrics 记录请求、Revision、Commit 结果和失败原因。
```

- **建议**：出跨 World 事务 ADR + Sequence Diagram + API Contract。核心决策：**放弃通用 2PC，改为「同 Tick 内、单线程时序保证下的 Validate-then-Apply」**——两个参与方都在同一进程、同一 Tick 时间轴上被 Coordinator 串行驱动，不需要分布式 2PC 的复杂度；Prepare 定义为纯验证 + 资源预留（带 Tick 内有效的 Reservation Token），Commit 定义为不可失败的 Apply（所有可失败校验前移到 Prepare），Revision 作为乐观并发检查。明确同 Tick 冲突按 Processor 确定性顺序仲裁。

---

#### [P0-3] NetEntityId 生命周期完全未定义

- **位置**：v0.3 §4.1（行 107–114）；LumioGameRuntime README 行 29；LumioClient README 行 9
- **问题**：文档定义了双层身份的静态含义和「权威侧分配」，但用户问题 D2 的每一项都无答案：分配器结构（区段？递增？）、回收与复用策略（复用会让晚加入/重连的 Client 把新实体误认为旧实体）、客户端预测生成实体时的临时 ID 与服务器确认后的重映射协议、断线重连后 Client World 重建时的映射恢复、Replay 与 Session Migration 中的 ID 稳定性、Destroy/Respawn 是否复用同一 NetEntityId。
- **影响**：NetEntityId 是 Replication Mapping、Snapshot、Replay、GAS Target 全部机制的主键。预测生成（开火生成投射物是最常见玩法）没有临时 ID + 重映射协议就无法实现；ID 回收策略错了会在重连场景产生鬼实体。这些决策一旦实现后再改，波及全部四个上层仓库。
- **证据**：v0.3 行 114 仅有一句约束：「`NetEntityId` 由权威侧分配或由生成契约定义映射；不得把网络 ID 当成数组下标或直接复用为 Local ID。」
- **建议**：在 LumioGameRuntime 出 NetEntityId 生命周期 ADR + State Machine：`Allocated → Replicated → (Destroyed → Tombstone → Recycle-after-N-ticks)`；预测实体使用 Client 区段的 Provisional ID，服务器确认包携带 `Provisional → Authoritative` 重映射；Replay 中 ID 序列由 Command Stream 确定性重放。

---

#### [P0-4] 确定性策略缺失，但 Replay 与跨 Host 一致性承诺全部依赖它

- **位置**：v0.3 §1.2（「确定性时钟」）、§8.2–8.3；LumioGameRuntime README 行 20、51
- **问题**：文档承诺「Replay 必须能在不同 Host 重放并指出第一个 Tick、World、Entity、Component 或 Revision 差异」（行 249），并在 Host 矩阵中要求同一 Scenario 跨 `PureHeadless`（无 Native）与 `NativeHeadless`（有 Native）运行。但没有任何确定性策略：浮点数在 Rust/C#、x86/ARM、有无 SIMD 之间的一致性方案（定点数？软浮点？还是放弃跨平台位级一致，只承诺同平台确定性？）；RNG 的种子与流划分；Processor 调度顺序的确定性保证（尤其「System 可选」之后调度顺序由什么决定）；State Hash 的覆盖范围（ECS？GAS？Voxel Revision？网络队列？）与序列化顺序。
- **影响**：这是「最小环境测试更多问题」这一首要目标（§1 行 7）的技术前提。若 PureHeadless 用 C# 模拟路径、NativeHeadless 用 Rust SIMD 路径，二者浮点结果必然不同，跨 Host Replay 对比会永远报「第一个差异 Tick」，测试基础设施直接失效。这不是可以后补的实现细节，它决定 NativeCore 的 Kernel 能不能用快速浮点、VoxelEngine 能不能并行生成 Mesh。
- **证据**：

```244:249:/Users/cui/LumioGames/LumioNativeCore/docs/architecture/LumioGameEngine_Architecture_v0.3.md
### 8.3 Scenario、Bot 与 Replay

- C# 编写 Scenario 初始状态、输入命令、Bot 行为、断言和结束条件。
- Scenario 可被 Pure Headless、Local、DS、Bot 和 CI 复用；测试数据与执行逻辑分开。
- 失败时导出 `Command Stream`、关键 Snapshot、`State Hash`、Metrics、结构化日志、Manifest 和随机种子。
- Replay 必须能在不同 Host 重放并指出第一个 Tick、World、Entity、Component 或 Revision 差异。
```

- **建议**：出确定性策略 ADR，明确分级承诺：Level 1 同平台同二进制可重放（最低要求，需冻结 RNG 与调度顺序）；Level 2 跨 Host Profile 可重放（需定义哪些计算属于「确定性核心」、哪些属于表现层可豁免）；明确放弃或推迟跨 CPU 架构位级一致。State Hash 范围与算法作为 Schema 一并冻结。

---

#### [P0-5] 复制协议横跨四个仓库、无单一所有者、无协议文档

- **位置**：LumioGameRuntime README 行 27（Snapshot Projection）；LumioServer README 行 19、28（Replication Context）；LumioClient README 行 17–18、25–26（Apply/Ack/缺口/Resync）；LumioGame README 行 26（Replication Mapping）；v0.3 §9.1
- **问题**：Snapshot/Delta/Ack/Revision/Resync 这条链路的四段分别写在四个仓库的 README 里，各自只有一行式描述。未定义：Mapping 的粒度模型（字段级/Component 级/Entity 级/Role 级——用户问题 D5）、与 AOI/Interest 的关系、可靠性分级（哪些走可靠通道哪些可丢弃）、Delta 基线管理（针对每 Client 的 Ack 基线？）、Resync 触发条件、Voxel Chunk 复制（订阅、优先级、限速）与 ECS 复制是否同一协议。NativeCore 提供「Snapshot Diff、Delta Encoding」内核（其 README 行 25），但谁调用它做什么粒度的 Diff 没有落点。
- **影响**：复制是 Server、Client、Runtime、Game 的四方合同，也是不对称 Component 设计（§4.2）能否成立的判据。没有协议文档，Client 的 Prediction/Rollback 无法开工（回滚需要知道权威状态以什么形式到达），Game 的 Mapping 声明格式无法生成。
- **建议**：指定 LumioGameRuntime 为复制**语义**所有者（Mapping 模型、Projection、Apply 语义），LumioServer/LumioClient 为**传输**所有者（Ack/重传/Resync 触发），LumioGame 为**内容**所有者（具体 Mapping 声明）；产出一份端到端 Replication Protocol ADR + Schema，包含 Voxel Chunk 复制通道。

---

### P1 —— 可以开始局部开发，但会影响主干架构

---

#### [P1-1] SimulationSession 模型把 Client ReplicaWorld 画进服务器的 WorldSlot，分布式会话与本地容器混淆

- **位置**：v0.3 §3（行 74–84）对比 LumioServer README 行 19
- **问题**：架构图把「Client ReplicaWorld（每个 Client 一份）」「Client VoxelReplicaWorld」画在 `WorldSlot → SimulationSession` 之下。但 DS 模式下 Replica World 物理上在客户端进程里，服务器不可能拥有它。LumioServer README 的所有权清单（行 19）就只列了 Server GameWorld、权威 VoxelWorld、Replication Context——与架构图矛盾。这张图只在 LocalEmbedded 下字面成立。
- **影响**：SimulationSession 的生命周期（用户问题 C2）无法定义——一个「逻辑分布式会话」和一个「服务器本地容器」的创建/销毁/Snapshot 语义完全不同。Session Snapshot 包不包含 Client 侧状态？Migration 迁移的是哪个范围？不澄清，Server 与 Runtime 会各自按自己的理解建模。
- **证据**：

```74:84:/Users/cui/LumioGames/LumioNativeCore/docs/architecture/LumioGameEngine_Architecture_v0.3.md
```text
WorldSlot
└─ SimulationSession
   ├─ Server GameWorld (GameRuntime)
   ├─ Authoritative VoxelWorld (VoxelEngine)
   ├─ Client ReplicaWorld (GameRuntime, 每个 Client 一份)
   ├─ Client VoxelReplicaWorld (VoxelEngine, 每个 Client 一份)
   ├─ Cross-World Coordinator (GameRuntime)
   ├─ Replication Context
   └─ Session Snapshot / Replay Metadata
```
```

- **建议**：修订 §3，拆分为 `ServerSimulationSession`（服务器本地：GameWorld + 权威 VoxelWorld + Replication Context + 每 Client 的复制视图/Ack 状态）与 `ClientSession`（客户端本地：ReplicaWorld + VoxelReplicaWorld + 预测缓冲），二者通过 SessionId 逻辑关联。

---

#### [P1-2] Tick Clock 所有权被 Server 与 Runtime 双重声明

- **位置**：LumioServer README 行 18（「`WorldSlot -> SimulationSession` 生命周期、**Tick Clock**、资源预算」）对比 LumioGameRuntime README 行 20（「`SimulationSession` 的 **Tick Clock**、Determinism Context…」）
- **问题**：两个仓库的「拥有的状态与生命周期」章节都声明拥有 Tick Clock，且都指向 SimulationSession。这是文档间唯一一处直接的状态所有权冲突。
- **影响**：Tick 驱动权决定线程模型：是 Rust Host 线程调用托管 Tick 入口（Server 拥有时钟），还是托管侧自驱动、Host 只供帧预算（Runtime 拥有时钟）？两种实现的暂停/冻结/Migration 时序完全不同。
- **建议**：明确「Server/Client Host 拥有**时钟驱动**（何时 Tick、频率、冻结），Runtime 拥有**Tick 内部阶段语义**」，并同步修订两份 README。这与 P0-1 的 Tick ADR 合并解决。

---

#### [P1-3] Prediction/Correction/Rollback 的机制归属在 Client 与 Runtime 之间双重声明

- **位置**：v0.3 行 38（LumioClient = "Prediction/Correction/Rollback"）对比行 142（Runtime GAS 提供 "Prediction、Correction、Rollback 和 Snapshot/Replication 接口"）；LumioClient README 行 26；LumioGameRuntime README 行 19
- **问题**：两个仓库都宣称拥有预测/校正/回滚。合理的分工（Runtime 提供 ECS/GAS 级回滚**机制**——状态环形缓冲、重模拟入口；Client 提供**驱动策略**——何时预测、何时回滚）在任何文档中都没有写出来。且回滚粒度本身未定义：整 World 回滚重模拟，还是仅 GAS/预测 Component 局部回滚？重模拟要求 Client 侧 Processor 可确定性重执行，这个要求没有出现在 Processor 的注册契约里。
- **影响**：回滚机制深刻影响 ECS 存储设计（需要廉价的状态快照/恢复），如果 Runtime ECS 先开工而不考虑回滚，Client 预测落地时会要求 ECS 返工。
- **建议**：在 GAS/预测 ADR 中明确机制在 Runtime（含 Prediction Key、Authority Confirmation——后者目前只在 LumioClient README 行 26 出现过一次且无定义）、策略在 Client；同时把「可重模拟」写入 Processor 注册契约。

---

#### [P1-4] InMemoryTransport 保真度未定义，「Typed」直传可能掏空 LocalEmbedded 的测试价值

- **位置**：LumioGameRuntime README 行 73（"通过 **Typed** InMemoryTransport 交换命令、事件和快照"）；v0.3 §6.2
- **问题**：架构处处强调 LocalEmbedded「仍经过消息/快照边界」（行 191），但「Typed InMemoryTransport」暗示传递托管对象引用而非序列化字节。对象直传会：(a) 跳过序列化器——契约生成物中最容易出 bug 的一层在 Local 完全不被测试；(b) 产生引用别名——Server 与 Client World 通过共享对象意外共享状态，恰好违反「Local 不共享状态」的第 3 条不可违背原则，而且是以最隐蔽的方式违反。此外故障注入（延迟/丢包/乱序）在 CLI 层被提及（行 229），但没有要求 InMemoryTransport 支持。
- **影响**：这是用户问题 F1/F2 的答案是否成立的关键。不冻结，LocalEmbedded 会退化为「测过了但没测到」的假覆盖。
- **建议**：ADR 规定 InMemoryTransport 默认走完整序列化→字节→反序列化路径（性能模式可选直传但 CI 禁用），并内建延迟/丢包/乱序/断线注入钩子。

---

#### [P1-5] 移动端 C# 热更程序集与 iOS AOT 约束、商店审核与严格 GameReleaseId 锁步之间的冲突未评估

- **位置**：v0.3 §1.1 第 7 条（"必须一起验证和发布"）、§6.1（MobileLocal 第一阶段范围）；LumioGame README 行 13（Gameplay "由 LumioGameRuntime 作为热更程序集加载"）
- **问题**：架构规定 Client Gameplay 是运行时加载的 C# 热更程序集，且 Server/Client 必须同一 `GameReleaseId` 严格锁步。两个平台现实未被讨论：(a) iOS 禁止 JIT，CoreCLR/Mono 在 iOS 上要么全量 AOT 要么解释执行，「下发新 DLL 并加载」面临技术与商店政策双重限制；(b) 严格锁步 + 商店审核延迟意味着每次 Gameplay 变更要么服务器等待各商店过审后同时切换，要么客户端强制更新——没有 N/N-1 兼容窗口的设计，生产运营会非常僵硬。
- **影响**：如果第一阶段就承诺 MobileLocal（§6.1 行 177 明确承诺），而热加载路径在 iOS 上不可行，Client Host 与发布管线要推倒重来。
- **建议**：先做 spike 验证移动端装载模型（解释器/AOT 预编译进包 + 内容热更），并出 ADR 决策兼容窗口策略：严格锁步（接受强更）vs 结构安全前提下的 N-1 握手兼容。宁可现在明确「移动端 Gameplay 随包 AOT、不支持运行时热更，热更仅限桌面开发期」，也不要留给实现期发现。

---

#### [P1-6] 故障隔离模型缺失：ALC 不是故障边界，一个 Session 的托管异常可拖垮进程内全部 WorldSlot

- **位置**：LumioServer README 行 18、24（WorldSlot、Watchdog）；LumioGameRuntime README 行 21（"异常隔离和回滚状态"）
- **问题**：文档提到 Watchdog、「异常隔离」和「旧 ALC 回收监测」，但 .NET 中 AssemblyLoadContext 只是加载边界不是故障边界：Hot Gameplay 抛出的未处理异常、栈溢出或让 GC 长暂停的行为影响整个 CoreCLR 进程，即全部 WorldSlot。WorldSlot 的隔离级别（同进程多 Slot？进程每 Slot？）从未声明；Rust Host 跨 hostfxr 边界能否捕获/处置托管异常也未定义。
- **影响**：这决定 DS 的部署形态和资源治理设计（用户问题 G7），也决定「WorldSlot 隔离」这个词的真实含义。同进程多 Slot 便宜但隔离弱，进程每 Slot 则 Connection 路由与升级编排完全不同——必须在 Server Host 开工前定。
- **建议**：ADR 明确第一阶段隔离模型（建议：进程内多 Slot + 托管侧 Tick 级异常捕获降级该 Slot + Watchdog 超时杀进程重启作为兜底），并定义 Rust↔C# 边界的异常/panic 双向转换规则。

---

#### [P1-7] 工具链（`lumio` CLI、契约生成器、Scenario/Replay Schema）没有归属仓库

- **位置**：v0.3 §8.1（CLI"负责选择**仓库原生测试**"，跨仓库工具）、§9.1（"契约生成器输出 C# 类型…"）；LumioGame README 行 64（"由契约生成器产出…"）
- **问题**：统一 CLI 和契约生成器是两件横跨全部七仓的基础设施，但七份 README 的职责清单中没有任何一个仓库认领它们。同样无归属的还有：Scenario 描述格式、Replay 文件格式、失败证据包格式、State Hash 算法实现。
- **影响**：契约生成器是 §9.1「禁止手写重复布局」的执行者，它不先存在，VoxelEngine 的 C# 绑定、Game 的 Schema 都无法按规范产出；CLI 是测试架构的入口。无主工具最后一定长在某个仓库里成为隐性耦合。
- **建议**：新建 `LumioTooling`（或明确归入 LumioGameRuntime 的独立包）承载 CLI、契约生成器、Scenario/Replay Schema 与 State Hash 参考实现，并加入依赖图。

---

#### [P1-8] PureHeadless 与 IVoxelWorldPort 矛盾：不加载 Native 时谁提供 Voxel 实现

- **位置**：v0.3 §8.2（行 235："PureHeadless：**不加载 Native**/Renderer，快速验证 Gameplay、ECS、GAS 和确定性"）对比 §8.2 行 242（"同一个 Scenario 必须只通过 Host 配置切换这些环境"）
- **问题**：任何调用 `IVoxelWorldPort` 的 Scenario（例如跨 World 建造）在 PureHeadless 下需要一个纯托管的 Voxel 测试替身，否则「同一 Scenario 跨 Host」承诺对含 Voxel 的玩法不成立。这个替身归谁（Runtime？VoxelEngine 出托管参考实现？）、它与真实 Rust 实现的行为一致性如何保证（对拍测试？）、Replay 能否跨「替身 vs 真实」对比，全部未定义。
- **影响**：不解决则 PureHeadless 的适用范围被静默缩小为「无 Voxel 玩法」，或者各处出现临时 mock，测试矩阵出现覆盖空洞（用户问题 I3）。
- **建议**：ADR 规定 Runtime 提供 `FakeVoxelWorldPort`（确定性、语义级正确、非性能等价），VoxelEngine 提供契约一致性测试套件（同一 Fixture 在 Fake 与真实实现上跑对拍）；Scenario 声明 `RequiresNativeVoxel` capability，CLI 据此裁剪矩阵。

---

### P2 —— 可以在开发期补齐

#### [P2-1] 架构文档 7 份拷贝无同步机制，且已实际发生漂移

- **位置**：全部 7 仓库 `docs/architecture/LumioGameEngine_Architecture_v0.3.md`；`.github/workflows/repository-policy.yml` 行 19–27
- **问题**：repository-policy.yml 只 grep 标题，不校验 7 份拷贝哈希一致；实测当前工作区 `/Users/cui/Sites/LumioEngine/LumioGame` 的拷贝落后一个 commit 且整个 `docs/` 缺失。
- **影响**：架构基线会随仓库各自演进产生 silent drift，集成期发现「各仓理解的 v0.3 不是同一份」。
- **建议**：指定唯一权威仓库 + CI 校验其余拷贝哈希，或改为 submodule/同步 bot。

#### [P2-2] 托管绑定生成职责重复声明

- **位置**：LumioVoxelEngine README 行 58 vs LumioCoreEngine README 行 24
- **问题**：VoxelEngine 称自己「生成 Voxel ABI Header、**C# P/Invoke/源生成绑定**」，CoreEngine 也称「生成给 C# Runtime…使用的**托管绑定、P/Invoke 元数据**」。
- **影响**：两套 P/Invoke 签名漂移风险。
- **建议**：源仓库产出契约元数据，CoreEngine 统一生成绑定包。

#### [P2-3] GAS 与 ECS 存储关系未定义

- **位置**：v0.3 §5.1；LumioGameRuntime README 行 19
- **问题**：Attribute 是 ECS Component 还是独立存储、GAS 状态如何进入 Snapshot Projection 与 State Hash、Effect Stack/触发链/循环检测（用户问题 E7）在 §5.1 的能力列表中不存在。
- **影响**：GAS 开工前必须补，但不阻塞 ECS 本体。
- **建议**：GAS 开工前冻结 Attribute 存储模型、Snapshot 投影规则、Effect 生命周期状态机。

#### [P2-4] 故障注入矩阵未统一

- **位置**：分散在 LumioClient README、LumioCoreEngine README、LumioVoxelEngine README
- **问题**：丢包/乱序/延迟散落在 Client README，Capability 缺失/版本不匹配在 CoreEngine README，崩溃恢复在 VoxelEngine README；Chunk Load Failure、Hot Reload Failure、OOM、Native ABI Mismatch 没有统一矩阵与期望行为定义。
- **建议**：产出 Failure Matrix（故障 × Host Profile × 期望行为）。

#### [P2-5] 生产 Migration 失败恢复只有一句话

- **位置**：v0.3 §7.2 行 211
- **问题**：「校验失败则按编排策略回滚或保持停服」——「编排策略」本身不存在；Game Migration 成功但 Voxel Migration 失败的半迁移状态如何回滚（快照回滚点在哪一步）未定义。
- **建议**：出 Migration 失败状态机，定义半迁移回滚点。

#### [P2-6] Manifest 兼容矩阵语义未定义

- **位置**：v0.3 §9.2 行 286
- **问题**：列出了 "compatibility matrix" 字段但矩阵的判定规则（谁生成、精确匹配还是范围匹配）没有定义，与 P1-5 的兼容窗口决策绑定。
- **建议**：定义矩阵判定规则（精确匹配 vs 范围匹配 vs N-1 窗口）。

---

### P3 —— 优化项或长期演进项

#### [P3-1] CODEOWNERS 全部仓库单人（`@Go1c`）

- **问题**：七仓库结构的评审/发布流程对单人团队是显著开销。
- **建议**：组织层面决策，供参考。

#### [P3-2] 100 玩家基线缺工作负载定义

- **问题**：玩家在做什么（移动密度、建造频率、AOI 重叠度）未定义，基线数字不可比。
- **建议**：Benchmark Definition。

#### [P3-3] Singleplayer 存档 → DS 的迁移路径未提及

- **问题**：玩家把单机世界搬到自建服是体素游戏的常见诉求，Session Snapshot 可移植性顺手能覆盖，建议排入长期。

#### [P3-4] 拒绝 Listen Server 的长期影响未在 ADR 中记录理由

- **位置**：LumioServer README 行 9（"也不是 Listen Server"）
- **问题**：代价是「邀请好友加入我的单机世界」必须经历 存档导出→启动独立 DS→重连，无平滑路径；这是自觉的取舍，建议在 ADR 中记录理由以免日后反复。

---

## 3. Repository Responsibility Review

### A. 仓库职责是否合理 —— 逐仓评估

#### LumioNativeCore

| 问题 | 结论 |
|---|---|
| A1 职责过多/过少/边界错误？ | **合理**。边界清晰，「明确不负责什么」完备（README 行 31–37）。 |
| A2 职责重叠？ | **无显著重叠**。AOI/Streaming 明确下沉到 VoxelEngine（README 行 29）。 |
| A3 应下沉但目前在上层？ | **无**。 |
| A4 不应下沉但目前放底层？ | **低风险**。README 行 25「导航计算」需复用性论证后再下沉。 |
| 风险 | **低** |

#### LumioVoxelEngine

| 问题 | 结论 |
|---|---|
| A1 | **合理**。完整 Voxel 领域所有权明确。 |
| A2 | 与 CoreEngine 在托管绑定生成上**重复**（P2-2）。 |
| A3 | **无**。 |
| A4 | **无**。Prepare/Commit 变更摘要属于对外契约，合理。 |
| 风险 | **中**——Port 层事务语义（P0-2）未冻结 |

#### LumioCoreEngine

| 问题 | 结论 |
|---|---|
| A5 LumioCoreEngine 是否真正只是 Native 聚合发布层？ | **是**，且 README 行 90 有防黑洞条款。当前文档层面防守到位。 |
| A2 | **无**与 NativeCore/VoxelEngine 的领域重叠。 |
| 风险 | **低** |

#### LumioGameRuntime

| 问题 | 结论 |
|---|---|
| A6 是否应该拥有 GAS Framework？ | **应该**。GAS 深度依赖 ECS、Tick、预测回滚；独立成仓会制造接口税。代价是 Runtime 巨型化——**强烈建议内部拆为独立版本化包**（`Lumio.Ecs` / `Lumio.Gas` / `Lumio.Coordination` / `Lumio.HotReload`），否则 GAS 不稳定会拖累 ECS 版本信用。 |
| A1 | **职责偏多**——同时承载 ECS、GAS、Coordinator、Hot Reload、复制语义、Determinism、Tick 阶段语义。 |
| A2 | 与 Server 在 Tick Clock 上**冲突**（P1-2）；与 Client 在 Prediction/Rollback 上**重叠**（P1-3）。 |
| 风险 | **高**——职责黑洞候选 |

#### LumioServer

| 问题 | 结论 |
|---|---|
| A8 与 LumioClient 边界是否清晰？ | **大体清晰**：Server = 进程/网络/Session/WorldSlot/CoreCLR/升级编排；Client = 连接/Replica/预测驱动/平台 Adapter。 |
| A2 | Replication Context 语义部分与 Runtime Snapshot Projection **边界需明确**。 |
| 风险 | **中** |

#### LumioClient

| 问题 | 结论 |
|---|---|
| A8 | 与 Server 边界清晰，但 Prediction/Rollback **机制**不应全归 Client（P1-3）。 |
| A1 | Unity 作为 Host Adapter 是**被一笔带过的高难度承诺**（README 行 29），建议第一阶段明确排除或单独 spike。 |
| 风险 | **中高** |

#### LumioGame

| 问题 | 结论 |
|---|---|
| A7 是否承担过多 Runtime/Host 职责？ | **否**。README 行 35–41 防守条款到位，未越权。 |
| A2 | CLI/契约生成器**展示但不认领**（P1-7）。 |
| 风险 | **低**（当前） |

#### LumioVoxelEngine 与 LumioGameRuntime 隐性耦合（A9）

- **结论**：文档层面通过 `IVoxelWorldPort` + Generated Contract 做了正确隔离（v0.3 行 67、LumioGameRuntime README 行 39）。
- **风险**：Voxel-aware AOI/Streaming 优化若实现不当，Runtime Coordinator 可能渗入 Voxel 语义（v0.3 行 103 有约束但缺 enforcement）。**当前是设计风险，不是已实现耦合。**

#### 是否有必要增加、合并或拆分仓库（A10）

- **不需要合并或删除**——分层逻辑成立。
- **建议新增**：`LumioTooling`（CLI + 契约生成器 + Scenario/Replay Schema，见 P1-7）。
- **组织成本**：7 仓库 + 单人 Owner + 版本锁步意味着一次跨层改动要 5–7 个 PR。建议引入 meta-repo/workspace 工具（统一 checkout、跨仓 CI 触发、锁文件自动化）。

### 职责矩阵

| 仓库 | 应该拥有 | 当前拥有 | 不应该拥有 | 风险 |
|---|---|---|---|---|
| LumioNativeCore | 领域无关 Kernel、ABI 基础类型、Handle/Error/Capability | 与「应该」一致；边界防守条款完备（README 行 31–37） | Voxel/网络/托管语义 | **低** |
| LumioVoxelEngine | Voxel 领域全部 | 一致；额外承诺 Prepare/Commit 变更摘要（行 29） | 托管绑定最终产出；Gameplay 判断 | **中** |
| LumioCoreEngine | 聚合构建、统一 ABI、Loader、Manifest/Hash/签名 | 一致，防黑洞条款明确（行 90） | 领域逻辑、Kernel 增量 | **低** |
| LumioGameRuntime | ECS、Tick 阶段语义、Coordinator、GAS Framework、Hot Reload、复制语义 | 以上全部 + Tick Clock（冲突） | Tick 驱动权、Socket、玩法内容 | **高** |
| LumioServer | 进程/网络/Session/WorldSlot/CoreCLR/升级编排/Tick 驱动 | 一致 + Tick Clock（冲突）+ Replication Context | Tick 阶段语义、Gameplay 规则 | **中** |
| LumioClient | 连接/Replica Host/预测驱动/平台 Adapter/Bot | 一致 + Prediction/Rollback 全量（重叠） | 预测/回滚机制（应属 Runtime） | **中高** |
| LumioGame | 内容、Mapping/RPC、Scenario、Migration、发行组合 | 一致；未越权 | 契约生成器工具本体、CLI | **低** |

### 需要移动、拆分或合并的职责

1. **Tick Clock** → 驱动归 Server/Client Host、阶段语义归 Runtime
2. **Prediction/Rollback** → 机制归 Runtime，策略归 Client
3. **托管绑定生成** → 唯一化到 CoreEngine
4. **CLI + 契约生成器 + Replay/Scenario Schema** → 新建 LumioTooling 或归 Runtime 独立包
5. **SimulationSession 定义** → 拆分服务器视图与客户端视图（修订 v0.3 §3）
6. **GameRuntime 内部** → 拆为 `Lumio.Ecs` / `Lumio.Gas` / `Lumio.Coordination` / `Lumio.HotReload` 独立包

---

## 4. System Architecture Review

### B. 总体分层是否合理

| # | 问题 | 评估 |
|---|---|---|
| B1 | 「越底层越通用」是否落实？ | **是**。NativeCore → VoxelEngine → CoreEngine → Runtime → Server/Client → Game 收敛方向正确；各 README「明确不负责什么」一致。 |
| B2 | 依赖方向是否单向？ | **文档声明单向**（v0.3 §2.2 依赖图）。无实现可验证。 |
| B3 | 依赖反转或循环依赖风险？ | **低风险**。Game 引用 Server/Client **契约**而非实现（LumioGame README 行 56）。需警惕工具链无主导致的隐性耦合（P1-7）。 |
| B4 | Rust 与 C# 边界是否合理？ | **合理**。版本化 C ABI + Managed Adapter + Generated Contract；禁止脚本控制平面（v0.3 行 52）。 |
| B5 | CoreEngine → Server/Client → Runtime → Game 加载关系是否完整？ | **意图完整**（各 README Runtime Loading Relationships 章节）。缺 Loader 失败语义与热更卸载顺序（P1-6、H3）。 |
| B6 | Native ABI / Managed API / Generated Contract 边界是否清楚？ | **概念清楚**，生成职责**执行层重复**（P2-2）。 |
| B7 | 重复加载/符号冲突/版本漂移/ABI 不一致风险？ | **已被 CoreEngine 设计正面回答**（单包加载、Manifest 校验、ABI 主版本）。 |
| B8 | 过度抽象问题？ | **当前无过度抽象**——相反是协议层欠定。需警惕 Runtime 巨型化后的内部抽象膨胀（建议分包）。 |
| B9 | 为性能破坏领域边界？ | **有约束**（v0.3 行 103、§8.4 行 260）。Voxel-aware AOI 是主要观察点。 |
| B10 | 未来难以替换 Renderer/网络/ECS 存储/Voxel 后端？ | **Renderer/网络**：Envelope 之下可换，设计允许。 **ECS 存储/Voxel 后端**：Runtime 与 VoxelEngine 内部实现若未 Port 化，替换成本高——当前可接受，但 Port 契约必须先冻结。 |

### C. World 与生命周期设计

| # | 问题 | 评估 |
|---|---|---|
| C1 | GameWorld 和 VoxelWorld 状态所有权是否清楚？ | **是**——§3.1/3.2 明确；C# 不保存 Chunk 第二真相（行 92）。 |
| C2 | SimulationSession、WorldSlot、Server/Client Role 生命周期是否完整？ | **否**——只有名词；且 §3 图与 DS 物理部署矛盾（P1-1）。 |
| C3 | 创建/启动/暂停/恢复/Snapshot/Migration/销毁顺序是否完整？ | **否**——§7.2 有生产更新顺序，但 Session 级状态机缺失。 |
| C4 | Cross-World Prepare/Commit 是否足够表达实际玩法？ | **不足**——只有快乐路径（P0-2）。 |
| C5 | 跨 World 事务失败/超时/重试/幂等/回滚？ | **未定义**（P0-2）。 |
| C6 | GameWorld 与 VoxelWorld Tick 顺序？ | **未定义**（P0-1）。 |
| C7 | 跨 World 死锁/半提交/状态不一致/重复提交？ | **未定义**；单 Tick 串行驱动可降低死锁风险，但需 ADR 明确。 |
| C8 | VoxelWorld Revision 如何参与 GameWorld 状态判断？ | **只有「记录 Revision」**（§3.3 行 101）；缺读一致性规则（GameWorld 决策引用的 Voxel 读取以哪个 Revision 为快照点）。 |
| C9 | AOI/Streaming 使用 Voxel 数据优化时，边界是否清楚？ | **是**——§3.3 行 103、§8.4 行 260 约束合格。 |
| C10 | 是否需要更明确的 Coordinator/Transaction/Revision/Snapshot 协议？ | **是**——P0-1/P0-2/P0-5 即为必须补齐项。 |

### D. ECS、Entity 和 Component 设计

| # | 问题 | 评估 |
|---|---|---|
| D1 | NetEntityId + LocalEntityId 是否足够？ | **作为静态模型足够**；动态生命周期不足（P0-3）。 |
| D2 | NetEntityId 分配/回收/重连/迁移/Replay？ | **未定义**（P0-3）。 |
| D3 | LocalEntityId 稳定性与生命周期？ | **部分**——「只在单个 ECS World 内有效」（v0.3 行 111）；结构变更后 LocalEntityId 是否稳定未定义。 |
| D4 | 非对称 Component 能否支持复制/预测/校正？ | **设计方向正确**（§4.2 示例）；**缺 Mapping 协议**（P0-5）支撑实现。 |
| D5 | Replication Mapping 粒度规则？ | **未定义**（P0-5）。 |
| D6 | Entity Destroy/Respawn/Ownership/Authority Transfer？ | **零覆盖**；Authority Transfer 甚至未作为名词出现。 |
| D7 | CommandBuffer 提交边界与顺序？ | **只有「固定 Tick 阶段统一提交」**（行 131）；可见性与顺序规则未定义。 |
| D8 | Processor 调度依赖/读写集/并行/确定性？ | **读写集注册是好设计**（行 129）；调度顺序确定性、冲突仲裁、并行边界未定义。 |
| D9 | 「System 可选」是否导致调度/依赖/诊断不明确？ | **本身不构成风险**——Processor 的 Phase + 读写集已承载调度元数据；风险在元数据语义未冻结。 |
| D10 | Archetype/Storage/Query/Change Tracking/Snapshot Projection 稳定 API？ | **在 GameRuntime README 行 17 被认领**，但均为名词，ECS 开工前至少需冻结 Query 与 Change Tracking API 形状（复制和回滚构建在其上）。 |

### E. GAS Framework 设计

| # | 问题 | 评估 |
|---|---|---|
| E1 | GAS Framework 放在 GameRuntime 是否合理？ | **合理**（见 A6）。 |
| E2 | Runtime GAS API 是否足够通用？ | **无法评估**——API 尚不存在；§5.1/5.2 切分干净，目前未见玩法假设混入。 |
| E3 | Ability/Effect/Attribute/Tag 所有权与生命周期？ | **未定义**（P2-3）。 |
| E4 | Handle 跨 Tick/Snapshot/Rollback/热更？ | **未定义**。 |
| E5 | Server/Client GAS 状态映射？ | **未定义**；与复制协议（P0-5）和预测语义（P1-3）绑定。 |
| E6 | Prediction Key/Authority Confirmation/Correction/Rollback？ | **不充分**——Authority Confirmation 仅在 Client README 行 26 出现一次且无定义。 |
| E7 | Effect Stack/持续时间/取消/依赖/触发链/循环检测？ | **§5.1 能力列表中不存在**。 |
| E8 | GAS 与 ECS Component 关系？ | **未定义**（P2-3）。 |
| E9 | GAS 与网络 Replication 关系？ | **未定义**；Runtime 声明提供 Replication 接口（行 142）但无协议。 |
| E10 | GAS 与 Tick/Determinism/Replay 关系？ | **未定义**；依赖 P0-1/P0-4。 |
| E11 | 哪些 GAS 设计必须在开发前冻结？ | **最小集合**：Attribute 存储模型、Handle 语义、Prediction Key 与确认/回滚协议、Effect 生命周期状态机、GAS 状态进入 Snapshot/State Hash 的投影规则。触发链/循环检测/Stack 策略细节可开发期演进。 |

### F. Local / Online / Host Profile

| # | 问题 | 评估 |
|---|---|---|
| F1 | LocalEmbedded 是否覆盖 DS 真实路径？ | **设计上意图是**（§6.2、LumioServer README 行 102）；**实际取决于 InMemoryTransport 保真度**（P1-4）——当前未保证。 |
| F2 | InMemoryTransport 是否会绕过网络层重要行为？ | **可能**——Typed 直传风险（P1-4）。 |
| F3 | Local 模式 Server/Client 权限边界是否真实？ | **依赖复制协议按 Role 校验**（P0-5）；设计意图正确。 |
| F4 | Local 是否需要模拟延迟/丢包/乱序/断线/重连？ | **需要**，且应内建于 InMemoryTransport（P1-4）；CLI 层已提及故障注入（§8.1 行 229）但未要求 Transport 支持。 |
| F5 | LocalSplitProcess/RemoteDS/MobileLocal 优先级？ | **合理**——§11 排在第 6 步；建议 RemoteDS 自动化也显式推迟。 |
| F6 | RoomMode/HostProfile 选择时机？ | **正确**——进房时选择（LumioGame README 行 100）。 |
| F7 | Public DS/Player DS/Localhost DS 是否只通过 Endpoint 区分？ | **是**（v0.3 §6、各 README Room Modes 表）。 |
| F8 | 是否需要 Listen Server？ | **不需要**（LumioServer README 行 9）。**长期影响**（P3-4）：「邀请好友加入单机世界」需 存档导出→启动 DS→重连，无平滑路径。 |
| F9 | 移动端双角色内存/线程/性能风险？ | **高且无数值**——两套 ECS + 两套 Voxel + CoreCLR；叠加 P1-5 iOS AOT 问题，MobileLocal 是承诺中风险密度最高项。 |
| F10 | Host Profile 是否足够表达 Bot/Replay/Benchmark/Editor Preview/Automated Test？ | **Bot/Replay/Benchmark 够用**；Editor Preview 未预留但可后加 `EditorPreview` Profile。 |

### G. Server 与 Client 系统层设计

| # | 问题 | 评估 |
|---|---|---|
| G1 | Rust Server Host + C# CoreCLR Hosting 边界？ | **合理**——Server 不编译 Gameplay 进 Rust（LumioServer README 行 13）。 |
| G2 | 线程模型？ | **完全缺失**——Tick 线程、网络线程、IO 线程、Native Job、Gameplay Tick 归属未定义。 |
| G3 | 网络回调/队列/Batch/Backpressure/错误传播？ | **Backpressure/限流被点名**（LumioServer README 行 25）但无策略；「网络回调只入队」（行 98）正确。 |
| G4 | Client Apply/Prediction/Correction/Rollback 环依赖？ | **风险真实**——因 P1-3 归属不清而放大。 |
| G5 | Snapshot/Delta/Ack/Revision/Resync 协议？ | **不完整**（P0-5）。 |
| G6 | 客户端预测状态与 GAS 状态不一致？ | **无法评估**——二者回滚机制均未定义。 |
| G7 | DS 资源治理/WorldSlot 隔离/故障恢复/优雅停服？ | **不完整**（P1-6）；升级顺序固定（LumioServer README 行 101）是好的。 |
| G8 | Server/Client 是否都需要 Determinism Harness？ | **是**；Runtime README 行 51 已列为产物，方向正确。 |
| G9 | Headless Client/Bot 能否复用 Client 代码？ | **能**——Client README 行 103 明确 Headless 与渲染 Host 使用同一 API。 |
| G10 | 网络协议/Gameplay Schema/Runtime API 兼容层级？ | **需要**；Manifest 字段已有对应物（§9.2），缺判定规则（P2-6）。 |

### H. 更新、热更和版本设计

| # | 问题 | 评估 |
|---|---|---|
| H1 | 同一 GameReleaseId 约束是否足够？ | **结构层面足够**；运营层面缺兼容窗口（P1-5/P2-6）。 |
| H2 | 开发期重建 World 策略是否可执行？ | **是**——§7.1 务实（默认重置、不把热更误当无缝升级）。 |
| H3 | Hot Reload 时 Native Handle/Timer/Task/Event 清理？ | **有约束无机制**（Runtime README 行 44、111）；建议 Hot Reload Host 提供强制审计。 |
| H4 | 生产 Migration 责任边界？ | **清楚**——Framework 结构安全 + Migration Hook；玩法语义归 LumioGame（§7.2 行 213）。 |
| H5 | GameWorld Migration 与 VoxelWorld Migration 顺序？ | **正确**——§7.2：先 GameWorld 再 VoxelWorld（行 209）。 |
| H6 | Migration 失败恢复？ | **不足**（P2-5）。 |
| H7 | Client 连接/重连时遇到 Release 更新？ | **停服模型下握手失败**，行为可接受但 UX 未设计。 |
| H8 | Schema/ABI/Contract/Manifest/Content/Config 版本关系？ | **§9.2 字段完整**。 |
| H9 | Framework 是否应提供更强兼容性校验？ | **结构校验应强制执行**；语义兼容无法由框架推断——边界划得对，前提是 P2-5/P2-6 落地。 |
| H10 | 「兼容性由玩法作者负责」是否过度放权？ | **否**——区分了结构安全与语义兼容；真正风险在严格锁步无 N-1 窗口（P1-5）。 |

### I. 测试和可观测性

| # | 问题 | 评估 |
|---|---|---|
| I1 | 统一 CLI 职责是否清晰？ | **意图清晰**（§8.1）；**归属不清**（P1-7）。 |
| I2 | 各仓库测试职责是否合理？ | **是**——各 README Headless Test Surface 章节分工合理。 |
| I3 | Host 矩阵覆盖空洞？ | **有**——PureHeadless + Voxel（P1-8）；RemoteDS/MobileLocal 推迟可接受。 |
| I4 | 同一 Scenario 跨 Host 是否可行？ | **设计上承诺是**（§8.2 行 242）；**技术上未保证**（P0-4/P1-4/P1-8）。 |
| I5 | Replay 能否定位第一个差异 Tick？ | **承诺是**（§8.3 行 249）；**依赖确定性 ADR**（P0-4）。 |
| I6 | State Hash 是否足够？ | **不足**——覆盖范围必须显式定义。建议：ECS 权威 Component + GAS 状态 + Voxel Revision 序列 + RNG 游标；排除表现层与网络队列。 |
| I7 | 是否需要分层 Golden/Property/Fuzz/Stress/Soak Test？ | **需要**。NativeCore 已列 Sanitizer/Miri（其 README 行 78）；建议 VoxelEngine 加 Property Test、协议层 Fuzz、DS Soak。 |
| I8 | 性能测试覆盖项？ | **§8.4 字段完整**（Tick/Processor/GAS/ECS/AOI/Voxel/Replication/Network/Native Job/Memory）；端到端基线推迟到最小切片。 |
| I9 | 100 玩家基线是否足够？ | **作为第一阶段合适**；缺工作负载定义（P3-2）。 |
| I10 | 是否需要故障注入矩阵？ | **需要**（P2-4）：丢包/乱序/延迟/断线/Chunk Load Failure/Migration Failure/ABI Mismatch/Hot Reload Failure/OOM。 |
| I11 | 是否需要统一日志/Metrics/Trace/Snapshot/Replay 格式？ | **需要**；应与 Scenario/Replay Schema 一起在工具链仓库冻结。 |
| I12 | 能否从一次失败自动重建完整测试环境？ | **设计上可行**——证据包含种子/Manifest/数据集版本（§8.3）；依赖 CLI 存在（P1-7）。 |

---

## 5. 必须重点检查的潜在风险（评审要求 §五）

| # | 风险项 | 结论 | 关联 Finding |
|---|---|---|---|
| 1 | Cross-World Prepare/Commit 真实语义是否足够 | **不足** | P0-2 |
| 2 | LocalEmbedded 是否因 InMemoryTransport 失去测试价值 | **可能**，取决于 Transport 保真度 ADR | P1-4 |
| 3 | Server/Client 非对称 Component 是否有完整 Mapping/Ownership/生命周期 | **Mapping/生命周期未定义**；设计方向正确 | P0-3, P0-5, D6 |
| 4 | NetEntityId + LocalEntityId 是否支持重连/Replay/迁移/销毁 | **不支持**（生命周期未定义） | P0-3 |
| 5 | GAS Framework 是否会过早绑定网络或具体玩法 | **当前文档防守到位**（§5.1 行 145）；实现期需 vigilance | E2 |
| 6 | Rust/C# 边界 ABI/GC/线程/生命周期问题 | **约束充分**（单包加载、Native Job 不回调托管、不保存 Delegate）；缺异常转换规则 | P1-6, B4 |
| 7 | CoreEngine 聚合仓库是否会变成职责黑洞 | **当前不会**——防守条款最好 | A5 |
| 8 | Server Rust Host 与 C# Gameplay 异常隔离和热更回收是否可行 | **未验证**——ALC 非故障边界 | P1-6, H3 |
| 9 | Voxel-aware AOI/Streaming 是否造成 Runtime 与 VoxelEngine 隐性耦合 | **设计有风险约束**（§3.3 行 103），缺 enforcement | A9 |
| 10 | Runtime/Server/Client/Game 版本发布关系是否可自动校验 | **Manifest 字段完整**（§9.2），判定规则未定义 | P2-6 |
| 11 | 是否存在未定义的关键协议 | **是**——Tick/Snapshot/Revision/Command/Event/Migration/Replay/Capability 均缺可实现规范 | P0-1~P0-5 |
| 12 | 架构是否支持「最小环境下测试更多问题」 | **意图支持，技术前提未浇筑**（确定性 + Transport 保真度 + CLI） | P0-4, P1-4, P1-7, P1-8 |

---

## 6. Missing Design Decisions

| 优先级 | 缺失设计 | 所属仓库 | 为什么必须补 | 建议产物 |
|---|---|---|---|---|
| P0 | Tick 阶段状态机（阶段枚举、双 World Tick 顺序、CommandBuffer/Coordinator/Snapshot 插入点、时钟驱动权） | LumioGameRuntime（语义）+ LumioServer（驱动） | 四仓库共同时间轴，一切协议的坐标系 | ADR + State Machine |
| P0 | 跨 World 事务协议（Prepare 副作用、Reservation、超时/幂等/冲突排序、失败分类、Revision 读一致性） | LumioGameRuntime + LumioVoxelEngine | 唯一写协作路径，半提交 bug 不可事后修 | ADR + Sequence Diagram + API Contract |
| P0 | NetEntityId 生命周期（分配、预测临时 ID 重映射、回收、重连、Replay、Destroy/Respawn/Authority Transfer） | LumioGameRuntime | 复制/快照/Replay/GAS 的主键 | ADR + State Machine |
| P0 | 确定性策略（分级承诺、浮点、RNG、调度顺序、State Hash 范围与算法） | LumioGameRuntime | Replay 与跨 Host 对比的成立前提；影响 NativeCore Kernel 实现自由度 | ADR + Test Fixture |
| P0 | 端到端复制协议（Mapping 粒度、Delta 基线、Ack/Resync、可靠性分级、Voxel Chunk 通道） | Runtime（语义）/ Server+Client（传输）/ Game（内容） | 四方合同，Client 预测无法先行 | ADR + Schema |
| P1 | SimulationSession 模型拆分（服务器视图 vs 客户端视图） | v0.3 文档本体 | 生命周期与 Snapshot 范围定义的前提 | 文档修订 + ADR |
| P1 | InMemoryTransport 保真度（强制序列化、故障注入钩子） | LumioGameRuntime / LumioServer | LocalEmbedded 测试价值的存亡 | ADR + Test Fixture |
| P1 | 线程与故障隔离模型（Slot 并发、ALC vs 进程、GC 预算、跨边界异常转换） | LumioServer + LumioGameRuntime | 决定 DS 部署形态，Host 开工前置 | ADR + Sequence Diagram |
| P1 | GAS 预测语义（Prediction Key、确认、回滚粒度、Attribute 存储、Handle 稳定性） | LumioGameRuntime | GAS 开发闸门；影响 ECS 存储设计 | ADR + API Contract + State Machine |
| P1 | 移动端装载模型与兼容窗口（iOS AOT、商店锁步 vs N-1） | LumioClient + LumioGame | MobileLocal 承诺的可行性；发布运营模型 | Spike 报告 + ADR |
| P1 | 工具链归属（CLI、契约生成器、Scenario/Replay/证据包 Schema） | 新仓库或 Runtime | 契约生成是其他仓库产出的前置依赖 | ADR + Schema |
| P2 | PureHeadless Voxel 测试替身与对拍套件 | Runtime + VoxelEngine | 消除测试矩阵空洞 | Test Fixture |
| P2 | 统一故障注入矩阵 | LumioGame + LumioServer | 回答「期望行为」而非仅「能注入」 | Failure Matrix |
| P2 | 生产 Migration 失败状态机 | LumioServer + LumioGame | 生产升级编排开工前置 | State Machine |
| P2 | Manifest 兼容矩阵判定规则 | LumioGame + LumioServer | 握手拒绝逻辑的可实现化 | Schema |
| P2 | 文档单源化与同步校验 | 全部 | 已发生漂移 | CI check |
| P3 | 100 玩家基线工作负载定义 | LumioGame | 基线可比性 | Benchmark Definition |

---

## 7. Development Readiness Gate

| 模块 | 判定 | 说明 |
|---|---|---|
| **NativeCore** | **READY** | 自包含、边界清晰；其 README「当前阶段任务」（冻结 ABI 基础类型→Kernel 最小实现→Benchmark CI）就是正确顺序。唯一前置：确定性 ADR 会约束 Kernel 的浮点/SIMD 自由度，建议同步进行 |
| **VoxelEngine** | **CONDITIONALLY_READY** | 领域内核（Chunk/Revision/Mutation 数据模型、序列化、Streaming）可立即开工；对外 Port 层（Prepare/Commit 摘要、复制 Snapshot/Diff 契约）等 P0-2/P0-5 冻结后再做 |
| **CoreEngine** | **READY** | 构建/打包/Loader/Manifest 管线不依赖任何未决协议；先冻结 CoreEngineManifest 字段（草案已在 README） |
| **GameRuntime ECS** | **CONDITIONALLY_READY** | Tick 阶段 ADR（P0-1）与 EntityId ADR（P0-3）先行——两者都由本仓库自己产出，可在一到两周内完成后开工；存储设计必须预留回滚需求（P1-3） |
| **GameRuntime GAS** | **NOT_READY** | 预测语义、Attribute 存储、Handle 稳定性、GAS–ECS 关系全部未冻结；且依赖 ECS API 成形 |
| **Server Host** | **CONDITIONALLY_READY** | Connection/Session/Transport 可开工；CoreCLR Hosting 先做 spike 验证异常传播与 ALC 回收；WorldSlot 隔离模型（P1-6）定案前不做多 Slot；升级编排推迟 |
| **Client Replica** | **NOT_READY** | 被 P0-3/P0-5/P1-3 三重阻塞；可先行的只有 Headless 连接壳与输入采样骨架 |
| **LocalEmbedded** | **CONDITIONALLY_READY** | InMemoryTransport 保真度 ADR（P1-4）通过后即可作为第一个集成载体，且应该尽早——它是验证全部协议 ADR 的最小环境 |
| **Gameplay Content** | **NOT_READY** | 依赖 Runtime API、Mapping 格式、GAS API 三者成形；当前只能写 Scenario 意图文档 |
| **Replay/Test Infrastructure** | **NOT_READY**（完整系统）/ 骨架 **CONDITIONALLY** | 确定性 ADR（P0-4）是闸门；CLI 骨架、结果格式、证据包 Schema 可先行（需先解决 P1-7 归属） |
| **Performance Infrastructure** | **CONDITIONALLY_READY** | NativeCore/Voxel 微基准随模块开工即建；端到端 100 玩家基线推迟到最小切片跑通后 |

### P0/P1 阻塞项汇总（开发准入判断格式）

#### P0 —— 不解决就不应该进入开发

| ID | 标题 | 为什么会阻塞 | 不解决返工 | 解决仓库 | 需冻结 | 最小解决方案 |
|---|---|---|---|---|---|---|
| P0-1 | Tick 阶段机未定义 | 四仓库无法对齐时序 | Server/Runtime/Voxel/Client 各自猜阶段顺序，集成期全面返工 | LumioGameRuntime + LumioServer | Tick Phase Enum ADR | 8 阶段状态机 + Voxel Tick 插入点 |
| P0-2 | Prepare/Commit 语义歧义 | 跨 World 写路径唯一 | 半提交 bug、Voxel/Game 状态不一致 | LumioGameRuntime + LumioVoxelEngine | Cross-World Transaction ADR | Validate-then-Apply + Reservation Token |
| P0-3 | NetEntityId 生命周期缺失 | 复制/Replay/GAS 无主键规则 | 预测实体、重连映射全面返工 | LumioGameRuntime | EntityId Lifecycle ADR | Provisional ID + 重映射 + Tombstone 回收 |
| P0-4 | 确定性策略缺失 | Replay/跨 Host 对比不成立 | 测试基础设施失效 | LumioGameRuntime | Determinism ADR + State Hash Schema | Level 1/2 分级承诺 + RNG/调度冻结 |
| P0-5 | 复制协议无单一文档 | Client 预测/Mapping 无法开工 | 四方各自实现不兼容复制 | Runtime + Server + Client + Game | Replication Protocol ADR | Mapping 粒度 + Delta/Ack/Resync Schema |

#### P1 —— 可局部开发，但影响主干

| ID | 标题 | 解决仓库 | 最小解决方案 |
|---|---|---|---|
| P1-1 | SimulationSession 模型混淆 | v0.3 + Runtime | 拆分 ServerSimulationSession / ClientSession |
| P1-2 | Tick Clock 双重声明 | Server + Runtime README | Host 驱动时钟，Runtime 拥有阶段语义 |
| P1-3 | Prediction 归属重叠 | Runtime + Client | 机制在 Runtime，策略在 Client |
| P1-4 | InMemoryTransport 保真度 | Runtime + Server | 默认序列化路径 + 故障注入 |
| P1-5 | 移动端热更/AOT 未评估 | Client + Game | Spike + 兼容窗口 ADR |
| P1-6 | 故障隔离未定义 | Server + Runtime | Slot 隔离模型 + Rust↔C# 异常转换 |
| P1-7 | 工具链无主 | 新 LumioTooling | CLI + 契约生成器 + Schema |
| P1-8 | PureHeadless Voxel 空洞 | Runtime + VoxelEngine | FakeVoxelWorldPort + 对拍套件 |

---

## 8. 最小开发切片

建议以**「消耗资源放置一个方块」**为第一条端到端垂直切片——它是能同时压测全部未决协议的最小玩法：

1. **Server Component**：`ResourceAuthority { Wood: int }` + `BuildPermission`（权威侧）。
2. **Client Component**：`ResourceDisplay { ShownWood: int }` + `PlacementPreview { PredictedBlockPos, PredictionKey }`（本地侧，与 Server 结构不对称）。
3. **不对称 Replication Mapping**：`ResourceAuthority.Wood → ResourceDisplay.ShownWood`（字段级投影）；`BuildPermission` 不下发；`PlacementPreview` 仅本地——一条 Mapping 声明同时覆盖投影、屏蔽、本地三种规则。
4. **一个 GameWorld + 一个 VoxelWorld**：单 WorldSlot、单 Session。
5. **跨 World Prepare/Commit**：`PlaceBlock` = Prepare（GameWorld 校验 Wood≥1 并预留 + VoxelWorld 校验目标位置可写、返回 Revision）→ 同 Tick Commit（扣资源 + SetBlock）；必须同时实现并测试三条失败路径：资源不足、目标 Chunk 未加载、Revision 冲突。
6. **一个 GAS Ability**：`PlaceBlockAbility`（Cost=1 Wood，Cooldown=10 Tick），走 Runtime GAS API 注册，Client 侧带 PredictionKey 预测激活、Server 确认或回滚。
7. **LocalEmbedded 双角色 Host**：双 ECS World + 双 Voxel World + 序列化路径的 InMemoryTransport。
8. **Headless Scenario**：Bot 连续放置 20 个方块，其中注入 1 次资源不足与 1 次 Chunk 未加载，断言最终 Wood 数量、Voxel Revision 序列与失败事件。
9. **Replay**：录制 Command Stream，重放并逐 Tick 比对 State Hash；人为篡改一个输入验证「第一个差异 Tick」定位能力。
10. **性能基线**：100 Bot 并发放置，记录 Server Tick p95/p99、Coordinator 事务吞吐、复制字节数、峰值内存。
11. **GameRelease 校验**：构造 Server/Client `GameReleaseId` 不匹配的握手，断言拒绝加入并输出可诊断错误。

这条切片跑通之日，P0-1 到 P0-5 的 ADR 就全部得到了实现验证；跑不通的地方就是 ADR 写错的地方。

---

## 9. 最终建议（未来 2–3 个架构迭代周期）

### 必须先冻结的协议（第 1 周期，全部为 ADR，冻结顺序即依赖顺序）

1. Tick 阶段机与时钟驱动权
2. NetEntityId 生命周期
3. 跨 World 事务协议
4. 确定性分级策略与 State Hash 定义
5. 复制协议分层与 Mapping 粒度
6. CoreEngineManifest / GameManifest 字段与兼容判定规则

### 可以边开发边演进的部分

- ECS 内部存储布局（Archetype 实现可换，只要 Query/ChangeTracking API 冻结）
- Voxel Streaming/压缩策略
- AOI 算法
- 网络传输实现（Envelope 之下可换）
- 性能优化全线
- GAS 的 Effect Stack/触发链细节（在核心生命周期冻结之后）

### 应该推迟的复杂能力

- MobileLocal 与 Unity Adapter（先 spike 后承诺）
- LocalSplitProcess / RemoteDS 自动化
- 生产升级编排与 Migration 状态机（停服手动流程先顶）
- Voxel-aware AOI 优化（先拿到 100 玩家基线再谈）
- Listen Server 相关的一切

### 不建议引入的抽象

- 通用脚本控制平面（文档已禁，坚持住）
- 字段级反射式自动复制「魔法」（Mapping 必须走生成器，保持可审计）
- 为假想第二款游戏预留的 Runtime 扩展点（「越底层越通用」不等于「处处插件化」——NativeCore 的复用性论证条款请同样适用于 Runtime）
- 跨 CPU 架构位级确定性（成本极高，先明确放弃，用同平台确定性 + 语义断言覆盖跨平台）

### 下一轮 ADR 清单（第 2–3 周期）

1. GAS 预测语义与 Attribute 存储模型
2. WorldSlot 隔离与线程模型
3. InMemoryTransport 保真度
4. 工具链归属与 Scenario/Replay/证据包 Schema
5. 移动端装载模型与兼容窗口
6. Hot Reload 泄漏审计机制
7. 故障注入矩阵
8. 生产 Migration 失败状态机

---

## 附录 A：评审纪律观察

这套文档最大的优点是**知道自己不该做什么**——每份 README 的「明确不负责什么」都写得比「职责」更用力，这在架构文档中是好信号。

它最大的短板是把「边界已清晰」误当作「可以开工」：边界回答的是*谁做*，协议回答的是*怎么做对*，目前只有前者。

按 P0 清单补五份 ADR、用最小切片验证，这套架构就能从 **CONDITIONALLY_READY** 走到 **READY**，预计需要一到两个迭代周期，且大部分 ADR 可以由 GameRuntime 一个仓库主导产出。

---

## 附录 B：文档版本说明

| 版本 | 日期 | 说明 |
|---|---|---|
| v1.0（摘要版） | 2026-08-27 | 首版 MD，结构化为摘要 |
| v2.0（完整版） | 2026-08-27 | 补回 A–I 全部问答、代码引用、P1–P3 全文、§五风险清单、开发准入 P0/P1 表格 |

---

*本文档基于 2026-08-27 对 LumioGameEngine V3 (v0.3) 全部七个仓库 main 分支文档的独立架构评审。*
