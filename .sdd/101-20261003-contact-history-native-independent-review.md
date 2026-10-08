# 101 两项 Contact history Native Facts · 非作者独立窄审

2026-10-03。裁决：**STATIC ACCEPT，限这两个 additive 回执投递与接触历史边界测试；没有发现发布前必须修改的源码问题。** 它们按源码使用真实 Native 生产、Replay Duplicate、查询 Unknown 和真实回执字节，符合当前 helper、完整 TRV03 与 Root52 提案。编译、私有配置准入和实际 Native 均 UNRUN；本裁决不是行为 GREEN，也不计作 Runtime/Native paired recovery。

本代理仅写本报告和 `.run/contact-history-native-independent-review-01/`，只运行轻量 Node 文件/hash/完整补丁检查。没有发布或修改生产、现有测试、generated、schema、Runtime，没有 .NET、GEN、Native 或配置执行。审查完整读取候选两个 Fact、全部 helper、55 项围栏、accepted TRV03 的相关完整调用路径及精确 07 Runtime 的 adapter staging/query/checkpoint/binding 实现；沿用本线程此前已读项目规范和 Contact52 完整源码审查。

**精确身份与新增补丁。** [history-manifest.json](C:/Work/LumioGames/LumioGame/.run/capacity-native-six-draft-01/history-manifest.json) SHA256 `33faac2f063f83dd8184f573bdceab7061fda4199ab1f1dab54c2b55e862cbd7`；[完整候选](C:/Work/LumioGames/LumioGame/.run/capacity-native-six-draft-01/BomberPublicPierceContactHistoryNativeTests.cs.draft) SHA256 `2efd4911d5295084149612944722f9a991d6bc1a8b676bc83c72c3ff330a5156`，17201 bytes、273 行、2 Facts。当前物理 helper `BomberPublicPierceChestContactNativeTests.cs` 为 `f4edd19ab4c6b4d3250314f0fa31153b3fb382d40fd168679b6efed5aa076e73`，含已接受的 receipt byte length checked uint 转换；本候选没有复制旧 helper 或再次引入该重载错误。

| 项目 | 独立核验 |
|---|---|
| additive 目标 | `Server/Tests/Gameplay/BomberPublicPierceContactHistoryNativeTests.cs` 当前不存在 |
| forward | SHA `8503f136f1d354cc8088a2201ee818ba6dd2c695440f02eb401d5bd8799de09c`；仅一个 new-file hunk，从空输入重建完整候选 |
| inverse | SHA `56103f797c7a8868d410b8453d4a11b2dad24b787a280c7cb4a5477eeae2fa47`；完整删除候选，返回空 body/absent 语义 |
| 作者输出 | draft/forward/inverse/fence/static review/frozen main manifest 六项 hash/bytes 全匹配 |
| 作者输入 | 审查起始时 55 项 history-source-fence hash/bytes 全匹配，没有 drift；完成时 Root 并发变化另存 |
| 上游 | TRV03 manifest `fae6a3f0…`、八份完整 production hashes 与 Root52 声明 `a403a6c5…` 全匹配 |

原 main manifest `bf1722e0…`、079122 主测试原件及现有物理 helper 都只读保留。独立 assertion inventory 固定候选的 82 个 Assert 语句起点；所有原断言逐字保留，没有修改、移除或降低。发布本候选应仍是这个完整新增文件，不覆盖 main producer/helper 或其他现有测试。完整围栏与 before 空文件身份见 [独立 audit](C:/Work/LumioGames/LumioGame/.run/contact-history-native-independent-review-01/audit.json)。

**真实生产与第七债务建立。** 两例复用实际 helper 的 Power pickup/skill pickup/PlaceBombAbility 调用；资源箱 ECS 创建、初始走廊、位置与绑定则是明确的测试场景输入，不是自然整局地图/公共移动生产者。WorldManager.Tick 执行实际 Native mutation 和 dig；没有直接写 ContactedChests、伪造 receipt、改 World.Tick 或放弹后重写炸弹时钟。

`CaptureSixAndSeventhOriginal:215` 每 Tick 调用当前 `ObserveActualOriginal`，由真实 adapter checkpoint 核对 status0、Applied/Original、TokenConsumed、真实非空 byte count、section revision 和完整来源。它要求七个不同旧箱的实际 Original 已被捕获，但 Game 接触历史只有已结算的六个完整 ID；第七 old full ID 在 PendingChests，Native 已退休该 old ECS 且其格为空。第七 detail 明确为 (5,9)、generation7、同颗 bomb 的 Family/Occurred，完整 SourceBombId 必须等于该弹，并有 HoldsSource。分阶段断言使“把七条历史直接填进容器”不能满足前提。

第七和替换箱由不同完整 NetEntityId、同 world instance 创建，ResourceGeneration 分别 7/99。`BindReplacement` 检查当前 Native cell 空且 binding null，经实际 staged mutation + 正常 Tick 发布新的绑定；没有只改 DTO 或将新 ID 冒充旧 pending owner。

**Fact 1：Duplicate/Unknown 和到期仍保债。** 第七真实 Original 的完整 checkpoint 留在原 adapter，替换 delivery adapter 使用同一 Native handle。真实 Replay 使用 exact pending transaction、section/offset/旧 expected revision；测试随后核对实际 Applied/Duplicate，再 Tick 消费投递，要求原 header/detail、完整 pending source 与六条历史没有变化。它没有把 Duplicate 当作 Original 接受。

之后真实独立 replacement mutation 在 receiptLimit1 下驱逐旧 Native lookup；测试直接断言 QueryTransaction Unknown、Replay staging OutcomeUnknown，并检查捕获的真实 Original bytes 不变。exact 07 `HostVoxelWorldAdapter.Stage` 对 Replay 先查 Native，Unknown 会返回 OutcomeUnknown；Game Begin 只消费匹配 header 的真实 Original，其余投递没有释放 owner。Unknown 不是从队列暂时为空推断的 expiry，也没有构造 Unknown result。

Results phase 和 PhaseEndTick 是明确手工场景输入，World.Tick/DangerUntil 等炸弹时钟没有被改写。正常 Tick 超过 DangerUntil 后，断言同弹仍 live/Danger、MatchId/Index/Results 不推进、第七完整债务和六个 full-ID 历史原样，replacement99 仍 live/bound、零命中、未进入旧弹 ContactedChests，stats/events 仍六次。对应 TRV03/BombSystem 的 terrain hold 与 RoundTransition barrier 调用次序成立。该例以第七 accepted debt 仍持有结束；不证明债务最终结算、自然 MatchEnded 或下一局完成。

**Fact 2：旧 Original 只记录 old full ID，重投不再新增。** 私有 AuthoredFixture 的 danger_ms2000 与 max_bomb_entities8192 是放弹前源表输入；其余 maximum8、skills true、central supply false、pickups1351 同时保留。这是复合测试配置，用于延长观察窗口并满足生产者预算，不能宣称已获公共 profile/M2 准入或单参数 A/B；实际 compile/admission 必须由 Root 验证。

replacement 真实发布后，测试要求六条历史和第七 pending owner仍准确、当前 Tick 仍早于正常 DangerEnd。将捕获的实际 Original checkpoint 安装到 fresh delivery adapter，再正常 Tick：要求仅添加旧第七 ID、pending 和 continuation 清空，新 replacement99 未被接触、完整旧 source/chain/occurred 不变，stats/events 恰七次。

此行为与完整 TRV03 精确一致：Begin 在写入前预检完整 capacity cohort 和 durable source/traversal owner，ordinary settlement 使用持久 PendingChests 的旧 ID；Resume 验证准确旧 cursor，遇到该格新 Destructible 立即 Finish，不能在旧距离再次 TryDestroy。下一 Tick 重新安装同一真实 Original checkpoint时，已清债 header 不再匹配，七条历史、统计和事件不能重发；没有制造第二次 Native producer。新增断言同时检查 replacement generation99、RemainingHits1 和空 HitBombs。它没有替换旧弹实体或清空原历史容器。

**回执重投的准确限定。** `RestoreResultCheckpoint` 恢复的是 validated delivery facts。exact 07 实现要求 fresh adapter、复制实际 receipt bytes/sections、验证当前 world instance 及容量，随后由 Game 正常 DrainResults 消费。本例保持同一个 Native handle 和已变化的 Native cell/binding，并刻意重新投递此前捕获的真实 Native 输出；没有 Native 重新计算该 Original，也没有 Runtime/world reset。

两例未使用 DualCut checkpoint、Runtime snapshot、VoxelSnapshot 或新 manager paired restore，因此不能证明旧 six/seventh/history/progress 在实际成对恢复后仍存在。现有 paired 测试的源码结构不能替这两个新场景提供执行结论。若 Root 要关闭“超过旧5容量的真实 paired history恢复”门，应另行提供该精确新声明/GEN 下 Runtime+Voxel 的实际 paired positive/negative 证据，不能把本例改名后计入。原始真实字节输入是合法且已注明的 fault/delivery premise，不能称为伪造 receipt，也不能称为 paired recovery。

**发布与执行前的要求。** 无需修改该精确测试源码才能作为 additive 文件发布；Root 应再次核对目标 absent、helper f4edd19、candidate hash 和当前完整围栏。若编译需机械修订，保留此稿/原断言与新身份后再记录差异。当前物理 cap5 会先在第六真实 Original 阶段失败，无法检验后续 Duplicate/Unknown/deadline/替换格断言；这两个 Fact 不能替代最小六箱 RED，也不能将该早期失败当作历史分支已测试。

两个 Fact 的完整行为执行需要正式容量至少7、完整 accepted TRV03、Root52 新 schema/release 与双端官方生成一致；只增 cap 或手写 generated 不足。Root 还应串行证明第二例私有复合配置真实准入，并保留实际 source/DLL/SDK/Native/配置身份、每 Fact 的真实结果和原断言。官方 paired schema/history、旧 cap5 fixture 拒绝/失败保留、同驻留容量以及完整局/回放门继续独立开放。

完成前 Root 并发发布 foundation，八项物理输入发生变化：Budget、ConfigBinding、BombState 声明/Server、BombSystem、BlastTerrain、TerrainTransactions、RoundTransition。本轮起始 audit 与旧独审不改写；完成时实际 hash 另存 `completion-root-source-changes.json`。私有 history/manifest、helper f4edd19、accepted TRV03 与 Root52 提案仍保持精确身份，新 history 目标仍 absent。Root 随后提供的 build51/52 生成失败及 build53 正式 GEN 成功但11个编译/analyzer错误，属于其 foundation 组合执行，不是本私有两 Fact 的编译或 Native 证据。本裁决不扩成最新物理组合验收；Root 后续 API 机械修复应以新的完整正反身份另审。

独立轻量核验全部通过。新 Facts 的 C#、表编译/准入、GEN、Native 运行仍 **UNRUN**；Root 的其他串行 build/native 结果没有被挪作这两个私有 Facts 的执行证据。**STOP。**
