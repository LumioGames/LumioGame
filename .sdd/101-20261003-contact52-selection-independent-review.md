# 101 Contact52 选择与声明 · 非作者独立窄审

2026-10-03。裁决：**STATIC ACCEPT，限精确私有容量选择与完整声明；没有发现阻断问题。** 52 是所列 19/23/27 尺寸、非负边界和完整 TRV03 写者协议下的保守上界，不是实际 M2 整局可达的 tight maximum。此裁决不批准生产发布、恢复兼容或候选 Native 行为。GAS registration 与 WorldRuntime/product integration 的前次裁决独立，本报告不重复或扩大其批准范围。

本审查完整复核了八份 TRV03 生产稿的接触写入、Native settlement、cursor 恢复、生命周期与持久 owner 分支，并只读核对当前配置准入、箱生产者和 Round barrier。沿用此前已读的父仓/101 core、导航、架构、testing/code-style、设计、stage0、ADR0046/47/48及完整用户附件；本轮重读入口、导航与相关架构规范。本代理只写本报告和 `.run/contact52-selection-independent-review-01/`，仅运行轻量 Node 哈希、补丁和坐标算术检查，没有执行 Game/SDK 规则替身，没有生产、GEN、.NET、Native、配置 CLI、format、stage 或 commit 操作。

**输入身份与可逆性。** Root selection [manifest](C:/Work/LumioGames/LumioGame/.run/contact52-root-selection-draft-01/manifest.json) 实际 SHA256 为 `368c9710697308e80213ecdadcb3646e7eba2a49f66fab4dacef89af9f2bd701`；作者 [容量证书](C:/Work/LumioGames/LumioGame/.run/capacity-native-six-draft-01/capacity-certificate.md) 为 `eb7ceebd76d06bd744f597e13a19fdd843386ddccedbb3de5784f9682e1a49bd`；完整 TRV03 manifest 为 `fae6a3f08cb09885a6d7526ba32be4e959d6b0415a90f30ae299be7de051be0d`。三者均与指定身份相等，未被本审查改写。

| 声明身份 | 实际 SHA256 | 独立核验 |
|---|---|---|
| 当前物理 BomberBombState.cs / 完整 before | `fd871eb03ccd4f1e5737ec0a9e671943283b3d5a522d049c6cb4dd376ca356ea` | byte 相等，仍为 5 |
| accepted TRV03 声明 / selection 中保留的 traversal03 | `1a2ee493e5ca68438863792467954db04bc9a9b28b6a2c226077eb7379a3684f` | byte 相等，四个追加字段齐全 |
| Root Contact52 完整候选 | `a403a6c522187e74174fc7eab436cc6683bc0e55f4eaafd23bf814af791ab4f4` | 相对 accepted TRV03 仅 `5→52` |

独立逐 hunk 应用完整 forward 后等于完整候选，应用完整 inverse 后等于物理 before；将候选中的 52 逆回 5 又逐字节返回 accepted TRV03。相对物理文件，完整补丁同时包含容量变化和四个 TRV 追加持久字段，不能称为“物理只有一行改变”。旧 Owner/SourceLife/Generation、ContactedChests 的完整 NetEntityId、Persist/Scope.None/Authority.Server、其余旧字段、顺序和默认值均保留。所有八份 TRV03 production hashes、33 项私有输出 hash/bytes均匹配。

TRV03 的 31 项旧 sourceFence 中，29 项当前仍相等；另外两项是上一轮独立报告与 findings 的已知 closure 追加，不是生产漂移。原报告 `df4ff687…`、原 findings `1f769fa4…` 的完整字节分别在既有 `revision02-review.md.before` / `revision02-findings.json.before` 保留且匹配。原 REQUEST_CHANGES/P1 历史没有被容量选择替换；本轮也没有修改此前报告。全部具体身份记录在独立 [audit.json](C:/Work/LumioGames/LumioGame/.run/contact52-selection-independent-review-01/audit.json)。

**上界成立的源码前提。** 用槽 `(完整 BombId, direction, positiveDistance)` 而非格子或当前绑定识别一次新获得的步骤。完整 production 中只有两个 ContactedChests.Add 封装：`TryObserveChest` 与 `CommitPreparedChestContact`。没有 Clear、Remove、Insert 或覆写旧 contact 的生产路径。前者只准未爆炸且 traversal 未初始化的 storage 操作；真实 Native 爆炸 [预检](C:/Work/LumioGames/LumioGame/.run/per-bomb-traversal-implementation-draft-03/BomberBombState.Traversal.Server.cs.draft:12) 要求 ContactedChests.Count=0，因此事前观察不能多占一槽再继续合法爆炸。

实际 Native EnterDanger 才发布冻结原点/Power/四条 Ready 臂；后续严格对照 LogicTransform、固定 Power、爆炸时刻与完整来源。Trace 原点只有覆盖，Ray 从 step=1 调 TryDestroy，原点没有箱接触。踢弹、复活、换槽或下一 Tick 不能重启已经冻结的四臂。每次 TryDestroy 在任何 chest hit/contact/pending 写入前先调用 [PreflightNewTraversal](C:/Work/LumioGames/LumioGame/.run/per-bomb-traversal-implementation-draft-03/BomberBombState.Traversal.Server.cs.draft:95)：臂必须 Ready、距离严格大于持久旧距离、坐标位于冻结射线、remaining 精确符合固定 Power 和 Pierce 规则，且不超过该臂真实地图距离。

| 分支 | 新 full ID 与步骤的对应 | 为什么同一步不能再新增另一 full ID |
|---|---|---|
| ordinary 终端开箱 | 请求取得 Pending；真实 Original 才提交持久 PendingChests 中的旧 ID | 全批容量/来源/臂预检早于写入；消费不读当前新绑定 |
| Strong 或 Gold 非终端 | 当前合法 hit 记录 ID，同时把新获得的距离设 Finished | 本臂停止，Finished 不能重新获得步骤 |
| Strong 终端 | 发请求前记录 ID；Original 只 transfer 同一 observed ID，additional=0 | 不重复 append，不腾出旧历史槽 |
| 合法 Rejected/Aborted | ordinary 未消费不新增；Strong 预观察保留 | 同一个 Pending 距离变 Finished，拒绝不 rewind |
| Unknown、非 Original Applied、未匹配事务等未满足接受条件 | 不新增、不释放 owner 或改历史 | 原 Pending/header 保债务，不能再获得该步骤 |
| 已命中同族、重复 full ID、竞争重试 | 不新增或仅保留尚未取得新步骤的准确 Ready cursor | 重试从已接受前沿继续，不能重扫已获得部分 |

具体调用点为 [TryDestroy](C:/Work/LumioGames/LumioGame/.run/per-bomb-traversal-implementation-draft-03/BomberTerrainTransactions.Server.cs.draft:243) 的三个 hit/contact 分支及 [Begin](C:/Work/LumioGames/LumioGame/.run/per-bomb-traversal-implementation-draft-03/BomberTerrainTransactions.Server.cs.draft:89) 的整批 Original 验证/消费。`PreflightChestContactReservations:760` 按完整 SourceBombId 聚合 candidate、frame 或 durable pending，严格区分 future writes 与 alreadyObserved Strong，检验真实声明容量；header 有无控制互斥聚合，避免同一 obligation 双计。`PreflightTraversalBatch:870`、pending 验证与 WorldRuntime.RecordPending 保留 source Participant/Life/Generation、ChainId、Family、Occurred、坐标/section/offset、old/new block、tier/resource generation、精确 header 与唯一每臂 owner。SourceLife 仍为旧完整身份，没有以 current Life 代换。

Original 后 [Resume](C:/Work/LumioGames/LumioGame/.run/per-bomb-traversal-implementation-draft-03/BomberBlastTerrain.Server.cs.draft:36) 要求 cursor 等于同臂已获得距离。它读取当前 Native 照片；若该旧 cursor 格变成新 Destructible，立即 Finish，不调用 TryDestroy、不接触替换箱；空格仅补覆盖并从后一格继续。即使同格换了 EntityId/Generation，也不能用旧槽产生第二个新增身份。重复 Original 清债后不再拥有同一 header；保留历史不会随旧箱 ECS 退休被删除。

Barrel/cluster 的每颗子弹拥有自身完整 BombId 与四臂；命中族共享不等于共享 ContactedChests。`BombSystem:287` 在 Danger/Burn/Expired 处理前检查 terrain holds；pending/header 或 continuation 保留源。RoundTransition.Prepare 检查 pending/barrel/continuation/hits 等债务，之后仍拒绝任何剩余 BomberBombState，不能靠时长、下一局或清空历史继续原弹。该证明针对可信 Game 写者与 SDK hydration 的协议，并不认证任意协同伪造 source/progress/history 的快照。

因此每个新增 distinct full ID 可单射到一个唯一正距离槽；同 full ID transfer 的成本为零。对于获准原点 `B≤x<W−B, B≤z<D−B` 和非负 P，四臂分别受 `min(P,z−B)`、`min(P,W−B−1−x)`、`min(P,D−B−1−z)`、`min(P,x−B)` 限制；总数不超过 `W+D−4B−2`。这一步依赖上述完整分支证明，不依赖“同格永不换箱”的假设。

**合法配置边界与选择。** 当前 map schema 明确 boundary_cells minimum=0；ConfigBinding 只要求 game.map_size=width=depth，ObjectBudgetCalculator 限定 LegacyPillars/19×19/8 人，但没有把 BoundaryCells 固定为 1。因此只用默认 B=1 的 32/40/48 会遗漏 schema 未排除的 B=0 边界。作者证书与 selection 已明确纳入此条件，不存在该适用范围遗漏。

| 所列尺寸 | B=1 几何包络 | B≥0 保守包络 |
|---|---:|---:|
| 19 | 32 | 36 |
| 23 | 40 | 44 |
| 27 | 48 | 52 |

独立算术检查枚举各原点与多个非负 P（包括 Int32.MaxValue）验证这些包络；只是坐标/min 运算核验，不替代 C#/World/Native 证据。52 覆盖三档条件集合，当前正式准入仍只接受 19 档；23/27 仍被原 guard 拒绝。B=0 具备 schema 范围不等于已通过真实地图工具和完整准入。未来更大尺寸、共享族容器或协议变化均须重证，不能据此开放 UGC 或新房间人数。

Legacy/M2 的柱、水、安全格、初始箱非轴四象限分配、再生 Safe 和当前 Legacy chest 抽签 `continue`，均只能使实际接触更少；Strong 独立族命中会停止该臂。中心空走廊的几何可达不证明每格都能由真实箱生产者占用。证书区分这一点正确；没有以全局 ChestLimit（例如整局发行数）、Power≤6、match duration 或清历史替代单弹 full-ID 上界。候选只选择声明容量，没有改 Map/Power/UGC 准入、全局预算或公共 Runtime/Engine 限额。PerBombContactLimit 继续来自实际生成声明，不能发布候选源码却保留旧 generated cap5。

**依赖与实际证据。** Contact52 与四个 TRV Persist 字段必须作为同一 schema15 新 GameRelease 发布，双端官方 GEN、schema history、旧 typed cap5 快照拒绝/失败保留、paired snapshot 实际容量与同驻留预算仍是 Root 后续门。manifest 明确依赖完整 TRV03 与 schema15；新 release 身份已有独立私有 integration 提案，本报告只记录依赖，不重新批准该组合。不得在已发布旧 GameRelease 中原地解释新声明，也不得用旧 snapshot 替换新历史测试。

任务派发时 build47 只有两个 receiptByteCount uint 与 Length int 的编译错误，不能标作 Native RED。本轮结束前已读取 Root 随后产生的真实记录：build48 raw 0，唯一源码差异是原断言的 `checked((uint)Length)`，断言没有删除或降低；旧物理 cap5 的 [六箱 Native 57](C:/Work/LumioGames/LumioGame/games/101-bomber/.run/v14-fullpack07-native-20261003/public-pierce-six-native-cap5-red-57.json) 为 **1 failed / 0 succeeded / 0 skipped / raw 2**，日志显示 tick75 ProcessorPlan 的 `exceeds_max_capacity`，调用栈 `SyncList.Add ← TryObserveChest ← BomberTerrainTransactions.Begin ← WorldManager.Tick`。日志 SHA `b54998b32edf27457e9997e69a0d5f12f1cec51cc090575fb603630fd986e201` 与 run JSON 相等，全部 386 source hashes 起止相等，声明仍 `fd871…`；Game DLL 为 `50802758…`、Test DLL 为 `6c68fa99…`。本代理只读这些现成记录，没有执行或改写它们。

这个真实旧容量 RED 支持“5 不足”的结论，不证明候选 52、TRV03 或 schema15 已运行通过。作者证书、079122 原测试和早期审查的 UNRUN/旧裁决记录保留；现在的真实执行结果另行记录，不倒改历史。候选 GEN、startup、历史恢复、完整边界/Unknown/Rejected/Strong/替换 ID/多臂/Barrel/往返快照 Native GREEN，以及旧回归，仍未由本次窄审证明。

**证据与结束。** 独立 [audit.mjs](C:/Work/LumioGames/LumioGame/.run/contact52-selection-independent-review-01/audit.mjs) 与 audit.json 留存六个身份锚、声明完整 forward/inverse、八份生产稿、33 项输出、31 项围栏的历史 closure 区分、Add 写者库存、算术包络、支持源码及 Root 三次实际记录。全部本轮轻量检查通过。批准范围仅为精确私有容量选择和声明的静态质量；生产与运行门保持开放。**STOP。**
