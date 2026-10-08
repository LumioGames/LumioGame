# 完整 traversal 私有实现交回

2026-10-03，fresh implementer。**PRIVATE READY / UNRUN / STOP，等待非作者审查与 Root 实际 TDD 发布。**

本交回只写入 `.run/per-bomb-traversal-implementation-draft-02/` 与本报告；没有写任何物理 Gameplay / Server Tests / Table / Reader / DECL / generated / SDK / Runtime 源码，没有 build、Native、GEN、format 或 commit。生产修复尚未发布。Node 只执行私有草案编排和作者静态前检，不能作 C# 编译或真实 Native RED/GREEN 证据。

按顺序读取父仓两个核心文档、repository-architecture、101 核心文档和知识导航，以及两端 code-style / testing。读取 workflow:test-driven-development 的方法要求；当前是已授权的私有设计实现草案，本作者没有执行实际 RED→发布→GREEN。Root 已在独立物理窗口运行原样 Reset4 得到真实 RED，尚待非作者审查、正式生产发布与实际 GREEN，不能称本草案已完成 TDD。

候选计划 SHA256 `44a253ded1fb3af0ebdca14777e5c2930360d4f5a498f6aa8f05b78c21c4c1f1`，原私有 manifest SHA256 `c98a905fcd9d091bf384b2e30fee9b55e83eddfb92f8874ace3ed4898e31cf56`；与简报给定哈希完全相等。Root 的当前 Fire 修复基线生命周期 `084552b027ce7c0819d5ddfc83df2803e868caf0986361ff9bb187477eb98e9c` 已保留，EnterBurn 继续通过 `fireConfig.SkillLevel(fireSkill.Id, 1).DurationMs` 取等级，不恢复旧 level.Name 查找。当前 budget 基线 `c1b3b0bfa543bc440044cfdcb842e313df91ab7eaefbcc952c132922ed2a28ec` 只读。

## 完整私有文件与身份

每个下列已有源码都有原始字节 `.before` 副本及完整 `.draft` 替换文件；Traversal partial 是新完整文件。差异列是私有草案哈希，物理源没有变化。**ContactedChests 仍为当前 cap5，本草案没有选择 cap52。**

| 文件 | 物理基线 SHA256 | 完整私有草案 SHA256 |
|---|---|---|
| BomberBombState.cs | `fd871eb03ccd4f1e5737ec0a9e671943283b3d5a522d049c6cb4dd376ca356ea` | `1a2ee493e5ca68438863792467954db04bc9a9b28b6a2c226077eb7379a3684f` |
| BomberBombState.Server.cs | `c403ac2ea15fd6651c82bd5b17cfa7fd62edcf84b6c2c4503e68a3c9f1e41bf0` | `c9001d587d634fd0e0ae443d33811bf91c7eb97a35d138ce3c3bcf43de552789` |
| BomberBombState.Traversal.Server.cs | `NEW` | `e5ec957ab63019d8daf4a9ec6489732f663c73007c6ed33fea517ae696706327` |
| BomberBombLifecycle.Server.cs | `084552b027ce7c0819d5ddfc83df2803e868caf0986361ff9bb187477eb98e9c` | `997217d757939c35dd6e11741b5d6c0af639a1be19cfd14dd39a7e95d21642e7` |
| BomberBlastTerrain.Server.cs | `701769cac2b57d5be3fb10bd39d387b1b13b8a35f0c089ff8c65b08cf6d8c843` | `05905abebe97fe2ee36f8354190d883165fae078fd3e04d276f1d2b8cfdebece` |
| BomberTerrainTransactions.Server.cs | `9621ba531ee42a6cc8358b6e212637d9e8dde9bd82981919cfc63ab1aeab29f2` | `cdbf184e1bf263637388d2aa30cad1f5f0d5eafa325303e8bbe54f97fbd2be63` |
| BomberBarrelBombPromises.Server.cs | `213e874d2bb3ee32f424a2390873b8fd2ab3ba8ed819fb0569fb57ff41c44c67` | `93f366f9799ef16d9f9b2d76805e74302c823d2fc9410e7e3e81460a82524bf9` |
| BomberWorldRuntime.Server.cs | `e33dc451d5d018aa0998a5760bb6b8ab631298f283f25649476eab2177deb1b8` | `d4d37c8c1578c156578ff8aeb88b5cab6c20a60ac5e3ccec7763df22c7e97e0a` |

保持原样的 Reset4：`BomberTerrainTraversalResetTests.cs.draft` SHA256 `901761a3afb9e56fcf45b73969e1221fc390e20275c8e5233cc013ec05beb5a6`。

新增完整 Native companion22：`BomberTraversalLifecycleNativeTests.cs.draft` SHA256 `39de6c9fff8127babe671794b4adfbfe0b4a9c728e56e350ecfff9d1f75d78d5`，全部 **UNRUN**。它使用真实 Native 场景、WorldManager.Tick、真实 Original/Aborted/Unknown/duplicate 及官方双切恢复，包含：冻结 current Power / LogicTransform 单列破坏六例、普通 Remaining0 小于 Power 的双切前后恢复一例、真实 public Fuse Kick→移后爆炸原点→Danger 再 Kick 拒绝一例、Pending owner reset 两例、Finished invented continuation 一例、原 Gold 原样断言加新臂状态一例、原 Wood/Iron/Gold stage/refusal 六例、历史 SourceLife 已死亡/新生命延迟 Original 两例，以及 strong 非终结/终结/已观察拒绝两例。借用现有 Native 场景的旧方法正文与所有旧断言保留在新命名 companion 中，并仅补充新持久化状态断言；物理旧文件未修改。每个新单列损坏测试先用实际未损坏双切做官方 paired positive；不写 Runtime canonical、checksum、Native receipt 或 terrain 数据包。

编排 `prepare.mjs`、`native-companions.mjs`、`native-companion-extra.txt`、`terrain-helpers.txt` 均在私有目录。`audit.mjs` 与 `author-static-preflight.json` 记录作者静态检查。首次 Node audit 的小写 distance 搜索误判及改为实际 TraversalDistance 标识符的修正保存在 `author-static-preflight-initial-failure.txt`，它不是业务 RED。

最终私有 manifest SHA256 `53c4a581fb9649d50dfe738f54d1f2797f5b78d0dd714e1f79be3af4e110cd21`；输入与所有输出全哈希/字节数以此 JSON 为准。`input-fence.json` 与最终 sourceFence 记录当前各物理 source before=after=current，观察到的本域漂移为 0。这不声称 Root 的所有共享窗口文件没有变化；Root 在本草案开工前已变更 Fire lifecycle / budget，这两个新身份正是本稿基线。

## 所有调用点与状态转移

| 调用点 | 完整接入及顺序 |
|---|---|
| DECL tail | 仅四个 append Persist Server/None：TraversalOriginX、TraversalOriginZ、TraversalPower 默认−1；TraversalArms cap4。没有每格历史、另一本地形、Native slot 或公共限制变更。 |
| Lifecycle.Ensure | 先 ValidateStorage 检查本地冻结几何，继续实际 Native HFSM 快照/Phase/Kick 一致性检查。 |
| Lifecycle.Send / EnterDanger | Native Send 得到实际 plan 后、StorePlan 和所有 action 写之前做纯 PreflightNativeExplosion。实际 EnterDanger 才 PublishNativeExplosionTraversal 为四个 Ready0，随后正常 Phase/Occurred。Fuse Kick 的实际 LogicTransform 在此时读取，冻结事实不能写回位置或 terrain。 |
| Trace | 必须四 Ready0、无旧 continuation。仅重置显示 Reach。读 unavailable 则四个合法 Unstarted；其它 arm 独立完成或竞争。 |
| Resume | ValidateStorage 与每行原始 Family/Occurred、方向、距离、Remaining、Ready 精确相等全部成功后才 Clear。已接受 cursor 上的替代障碍只 seal，不能接触替代 full ID。 |
| Ray | 竞争 retry 只保留同一 accepted cursor/Ready 及原余量。new terminal mutation 已变 Pending 时不能误 seal；已观察 nonterminal 为 Finished。boundary、未知 block、water/cover stop、range 结束、普通 Remaining0 全部 finish，允许小于 Power。真正 unavailable read 保留 Ready continuation。 |
| TryDestroy 入口 | 冻结完整 source 与 strict distance>本 arm Ready distance、原始 Remaining 先预检；任何 hits/contact/credits/arm 写之前失败。其它 arm 合法 Ready0 不受已有 contacts/Reach 干扰。 |
| Wood/Iron/Gold/strong 非终结 | 先实际 full-ID 和 Chest Family 双方 admission + Finished 编码；再 TryCountBomb、公开 ContactedChests append 和 Finished(d)。 |
| strong 终结 | 完整 reward 与 header/byte/promise 义务预检后才计最后 hit 和同一 full-ID preobserve；Own Pending(d)。Original 只转同一 arm，不第二次 contact append。Rejected/Aborted 保留已计 strong history。 |
| Prepared terminal write | 原始 Native address、full source、Generation、Family、Occurred、规则余量完整；PreflightPreparedDestruction 预演本批完整 transaction、真实最终 reward ordinal/string 与现有 Game pending-record 形状校验。Barrel 另纯预演完整 Promise 编码/容量。成功才 frame acquire + Pending(d)。 |
| End | 所有 final detail 编码、PendingRecord 与整批 source/progress 预检。DestroySoft 也在 Native staging 前写完整 Game header/details/reservation/chest pending，避免异常/OutcomeUnknown 丢所有权；Native promise 仍是现有 Runtime header/tuple。纯提取 ValidatePendingRecord，不扩 Runtime。 |
| Staging Rejected | 预检 exact Pending cohort，Pending→Finished(d)，清 exact provisional chest/reference/promise/header；无 phantom owner。已计 strong contact 不回滚。 |
| Begin / whole Original | 完整恢复切面的 ownership 检查后读取实际 delivery。Status0 + Applied + Original + token/receipt/section/advancing revisions 全部原检查保留。每个完整 source/cell/power/progress/continuation/terminal chest admission 与 encoded continuation 整批通过后才 contacts、rewards、stats、Pending→Ready(d) 与接受 continuation。 |
| Barrel Original | barrel 现有实际 binding retirement / promise / full source 预检外加 RequireTraversalPending；同一 actual Original 后该 barrel arm Finished(d)，不制造原代码没有的 continuation。 |
| Aborted known NotApplied | 只消费 actual Aborted + None + CleanupStatus0，先完整 Pending cohort 检查再 Finished(d)、原 promise/chest/header cleanup。TokenConsumed 可为真：Native Abort 也能合法消耗 token，不能把它当成已 Apply。 |
| Unknown / duplicate / no receipt | 原 disposition consumer 条件保持，不能转移、重建或释放 Pending；deadline 后和 SourceLife 已死仍保留。完全 settle/clear 后重复 actual Original 无匹配 header 被忽略。 |
| Bomb OnHydrate / ValidateStorage | 局部 frozen geometry / Power / actual position / phase / Kick / full source 与每行 durable progress 只读检查。旧 geometry-free TryObserveChest 仅 never-exploded 源可写，公开 ContactedChests 的旧存储测试及 cap5 负例仍有同一 authority。InspectChest 继续只读用于终结预检。 |
| Quiescent completeness | Begin 在新 frame producer 之前 ValidateTraversalOwners：Pending 必须恰好一个当前持久化 header 的 full source+direction+cell；Ready 必须恰好一个 matching continuation；Finished 两者都不允许。没有把 completeness 塞进 transient ValidateStorage 或半构造 ProcessorPlan。 |

OnHydrate 是逐实体执行，不能假设所有源或 header 都已 hydrate：实际 Runtime `modules/ecs/src/Lumio.GameRuntime.Ecs/World/World.Residency.cs` 的 AttachHydrated:59 在一个 entity 恢复后立刻调用组件 OnHydrate；HydrateRows:64 后按序 attach 每个 row，`WorldManager.cs` 的 restore:235 调用它。这里只读这些实际实现以核查顺序，没有编译引用、复制或改 Runtime。保留现有 WorldRuntime.OnHydrate 的 Validate 调用，但新增全世界 completeness 放在恢复后下一正常 Begin；本地 continuation-reset/frozen-column 拒绝仍在 Bomb OnHydrate 发生。如另要求所有跨实体 completeness 都在 CreateWorld 返回前拒绝，当前 Game 组件单行 hydrate hook 无这样的 completed-all-rows 保证，需明确上游正式 hook 或产品 restore orchestration，不能谎称已实现。

## 原测试保留证据

| 原物理文件 | 用例数 | before=after/current SHA256 |
|---|---|---|
| BomberTerrainFrontierRetryTests.cs | 2 | `4d25deea747123af962db28fac8e8e9b219cf1afbd9455ff4c3688b710014a2e` |
| BomberTerrainContinuationProofTests.cs | 11 | `e91d296cffec03164f772e95390dea9d5dea5532d9ab0e88b444cdc9171736de` |
| BomberPendingTerrainGeometryTests.cs | 6 | `d97a3e5e700e72179923ed23be95687797d2e7f78cdc1b8bba66520a07e7cf03` |

这是整文件字节身份相等，故原 body / assertions / fixture 和 case 数均未改变；不是只保留名字。原 Resource / production / journal / split 生命周期源码同样只读并在 fence 内。Reset4 原作者文件与私有拷贝保持同一个901哈希。

Root 初审指出 Reset4 runtime variant 仍持有 C pending，理论上可能在旧 runtime-only/paired gate 上先拒绝，native variant 也容忍 broad terrain 异常。因此 broad terrain 本身不能证明新增 monotonic column，必须检查实际因果。本稿完整保留 Reset4 原正文。

交回前 Root 回报真实证据：原样901 draft 已发布为测试，build40；`terrain-traversal-reset-first-44` 为0 pass /4 fail /0 skip、raw exit2，5.636sec。四次真实未损坏 paired positive 全成功，raw5paired packets已保存；storage line131 NoException，runtime line140 EngineHost NoException，paired line152 NoException，Native line194 替代新 full-ID chest 确实在回退 prefix 后被毁，之前 genuine history/receipt 检查均成功，没有 unrelated terrain 异常。这将原先 runtime-old-gate 疑问在该实际窗口中排除，是 Root 的真实当前代码 RED；本作者未运行或替换这些证据。Root 未发布本稿进度字段/生产修复/GEN/cap 变更。

companion 单列/owner/refinished 负例要求具体 frozen explosion / pending Native owner differs / continuation rewinds durable arm 诊断，但其22例全部 UNRUN，不能宣称这些新诊断已出现。

## schema15 和发布前依赖

1. 非作者先审上述完整八个文件与新 companion22，重点看 quiescent hook、whole cohort preflight、strong 同 ID 转移、End Game header 先于 staging；Root 再按实际 Reset4/原19 用例先 RED、正式发布最小修复后 GREEN。
2. Root 按正式 Game schema history / 生成入口把四个 appended identities 纳入 schema15 和新 GameReleaseId，同时测 generated storage/layout bytes。当前草案未触碰任何 schema history/GEN，不能拿旧 schema fixtures 默认为兼容。固定4是一个字段身份而非四个新 terminal flags。
3. 旧 cap5 fixture 必须不可改且期望拒绝保留。Contact52 仅在可信 producer+restore consistency、未来 map19/23/27 且 B0 几何域中的数学候选；本稿不开放23/27、不设 P6、不假定 B1、不概率折扣、不用 global333。大 Power 原 Continuation7/8 authored Reader 前置仍要 Root 在实际 table authoring 下核实，不能手补 Reader JSON 或放松 producer admission。
4. Candidate contact6/52/one-over、旧 release typed reader / rejection、official full-world paired capture/restore 的实际大小尚未测量；public 1MiB blob /64MiB record/8MiB relevant Section 上限不变。Root 所有 Fire/Frenzy/effect/debt/coexistence Native budgets 的独立证明不能被此局部草案替代。
5. actual paired positive→actual Original transfer 前后、actual Fuse Kick、已死亡 historical SourceLife、strong/Gold/普通、stage refusal、revision Aborted、duplicate、Unknown 及 pending across deadline 的 companion 均须真实 Native 跑测。根工作还需要原 Frontier2/Continuation11/Pending6 原样全绿及相关旧完整回归，不能删断言或降计数。

四个独立列只能约束可信生产者写入后的单列/局部恢复一致性，不认证可任意协调重写 source/progress/history/provenance 的快照。这里没有 per-contact 坐标日志或外部真实性签名，也不能重构公共 Native API 已合法 evict 的历史。正式 cap 与 restore integrity policy 必须保留此限制。

## 实际运行状态

| 项目 | 本作者结果 |
|---|---|
| 私有脚本编排 / 作者静态前检 | 已运行，仅字段数/路径调用/源字节 preservation/稿件 case 数/哈希；首次 string audit 失败后已修正，证据完整保留。 |
| C# build / compile | **UNRUN** |
| Native / xUnit / WorldManager.Tick | **UNRUN** |
| GEN / schema15 / declarations publication | **UNRUN** |
| authored table compile / Reader export | **UNRUN** |
| formal Contact capacity selection / acceptance | **UNRUN，未选择** |

交回完整可审阅私有草案；现在 STOP，所有物理发布、schema generation 与实际 RED/GREEN 均由 Root 承接。
