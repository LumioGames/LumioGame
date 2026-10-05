# 101 finite Effect + successor Runtime 独立审查

审查日期：2026-10-02（Asia/Shanghai）。结论：**SPEC FAIL；QUALITY NEEDS_FIXES**。本次独立静态审查已完成，不是上次 HTTP 502 中断的续写通过记录。发现 1 个可由当前调用顺序定位的 P1 原子性缺陷、2 个必需组合验收缺口。尚未执行新的动态反例；下面明确区分代码结论和未验证风险。

## 范围与输入

- `R = C:/Work/LumioGames/LumioGameRuntime-101-finite-successor-composition`。
- `A = C:/Work/LumioGames/LumioGameEngine-101-finite-successor-composition-dependency`。
- `E = C:/Work/LumioGames/LumioGameRuntime-101-effect-integrated-evidence/finite-successor-composition-v1`。
- 阅读 Game、101、Runtime、Engine 入口/导航和相关所有权、测试规范，以及组合 report、independent-review-brief、原始 task brief、API-note、overlap、worksheet、执行违规审计。旧冻结/阶段限制不替代本次完整交付要求。
- 主审四个合并文件及其直接调用链：`WorldManager.cs`、`WorldManager.Visibility.cs`、`GasWorldContext.cs`、`AttributeEvaluator.cs`。交叉检查 finite settlement/result lease、partition capture、cold restore、successor identity/admission/drain。
- 没有修改 R/A、Git metadata、进程或服务，没有重跑作者测试。只新增本报告及相邻 `101-20261002-runtime-composition-review-inputs.json`。本次检查的 14 个相关源文件均逐文件长度/SHA256 匹配 final2 manifest；没有重复完整源树重 hash。
- final2 Runtime manifest：972 路径，SHA256 `a885bc831dc3a81249cd01b8bb1aa6e4f02cca48b496dc0555d9e2c0e45c2a7c`。A manifest：899 路径，`c3a08f6118df6b5160fa4977822e60b511fa24ddbd2c736f2ecebe006468cc33`。两份 patch 的实际 hash 与 brief 一致，详见相邻输入记录。完整路径集历史证明来自 `.run/runtime-finite-successor-composition-review-inputs/root-pathset-completion-final2.json`；它不等于本次重新证明全部源树。

## F1 — P1：完整初始 baseline 的容量拒绝晚于实体和 route 提交

定位：R 的 `modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.SuccessorProjection.cs:25`（初始 admission 只扣常量额度），`WorldManager.cs:835`（随后调用实际 admission），`modules/replication/src/Lumio.GameRuntime.Replication/Binding/EntityBindingQuery.cs:261`、`:279`（Bind/route 或不可撤销 CreateFor），`WorldManager.cs:1106`（发号、Attach、Revision、CaptureSuccessorAdmissionBindings），`WorldManager.Visibility.cs:313`（最终完整包检查）及 `:348`（有限 rollback）。

触发：一个合法已运行的 World 已有较多、当前不 dirty 的普通可见实体；它们单独增量发布均曾在预算内。新的 successor-profile correlated admission 需要它们的完整 census，同时有一项自身估算可容纳的有限 Effect。已有静态实体的完整初始 census 加上当帧有限行/字段/RPC 超过 65536。无需非法字段、伪造认证或提高配额。

根因：`ReserveSuccessorAdmission` 固定预留 `65536 + MaxAuthorizationBytes + MaxResultBytes`，没有计算实际初始 census/Welcome，也没有在调用 adapter 前预检全部 baseline。`FitsEffectProjection`（`WorldManager.EffectProjection.cs:11`、`:40`）只为 proposed finite targets 计 create，并计 dirty/predictable/RPC，不计其它当前静态实体在新观察者 baseline 中的 create。最终 `ProjectObserver` 确实先编码完整 escaped frame 再加入 outbox，但此时 admission 的 route/entity/发号及 phase-9 Effect 已经提交。它的 finally 仅恢复 observer view、AOI hooks 和 waiting Sections；不恢复这些先前的权威修改。`ExecuteBoundTick` 随后把异常作为 World fault（`WorldManager.cs:406`），不是 mutation-free 的 capacity refusal。

这违反组合 brief §3 的完整预检/精确边界原子性要求，以及 A `engine/wire/successor-binding-v1.json:62`、`:63`、`:544` 的 reserve-before-mutate、完整 escaped publication/baseline obligation 和 foreseeable refusal。该结论来自真实代码路径的静态追踪，**尚无本次执行的 RED 日志**。现有 `PendingSuccessorAdmissionAndFiniteSettlementDrainOneBoundedPublication` 只有小包成功情形，不能推翻此路径。

修复要求：把 admission 的完整 census/parts obligation 与当帧 finite full/create/delta/control 的实际预算接到提交前的准备阶段，或提供该契约允许、经过完整证明的原子准备/提交机制。保持有效实体集合与 65536；不得删实体、少发字段、忽略异常或用 Game 旁路。修复后用真实 Native 的 ordinary Tick 证明超限输入在 Bind/CreateFor/发号/Effect frame ordinal/信用扣减之前拒绝，并证明边界内邻例和正式 parts/完整 census 路径可以完成。

## F2 — P1 验收缺口：缺少 lethal final-period → expiry → death → restore 的跨存档组合回归

定位：R `modules/replication/tests/Lumio.GameRuntime.Replication.Tests/FiniteSuccessorCompositionTests.cs:15`；`modules/gas/tests/fixtures/successor/FiniteDormantEffect.cs:5`；`SuccessorScenario.cs:52`（Stage 5 独立 instant death）。

当前测试的 finite fixture 没有 `PeriodFieldId`、没有 Period、没有 Base 写入。测试中的死亡来自 `h.Run(5)` 发出的 `EliminateLifeEffect`，随后 `h.Run(1)` 显式 prepare/destroy；它有效证明 finite expiry 不自行制造 restoration witness，但没有证明 lethal 最后周期的 Base/死亡/捕获次数。

报告把该项归给独立 RF 测试也不充分：`FiniteEffectLifecycleTests.cs:19` 明确关闭 death system；其 `FiniteProbeEffect.Period`（`FiniteProbeEffect.cs:28`）只检查时序、不写 Health。存档 Base probe（同文件 `:65`）每周期把 Health 加 1。现有 `FiniteSaveBoundaryTests` 可支持 Base once-only 保存语义，不能替代致死末周期与 successor 同时工作的断言。

需新增真实 Native 回归：有限 Effect 的最后 aligned Period 真实穿越 lethal Base/Current 阈值，同 Tick 产生 Period/Expired，跨明确 BeforeTick/AfterSettlement cut 冷恢复，记录一次 Base 写、一次死亡事实/结构捕获和一次真实 Initial/Applied restoration witness；不能从 Period/Terminal 生成 witness，不能重复结算原 saved Tick。应分别检查 continuing owner 与 cold owner 的身份/授权区别。缺少这项必需测试使组合验收未完成；本项不声称已证明生产 death 算法错误。

## F3 — P1 验收缺口：没有 pending admission 下的 Apply/Refresh 拒绝及信用不变回归

定位：R `modules/replication/tests/Lumio.GameRuntime.Replication.Tests/FiniteSuccessorCompositionTests.cs:50`；`modules/gas/tests/Lumio.GameRuntime.Gas.Tests/FiniteCorrectiveProjectionTests.cs:14`。

前者只有 bounded publication 成功、drain 后信用归零；后者虽覆盖新 Tick 首次 Apply/Refresh 拒绝的旧 frame Tick/ordinal 不变，但没有 successor admission/route/publication debt。因此没有证据证明四文件合并后，完整 escaped baseline 与 finite 控制一起拒绝时，reservation/result/publication、route/attachment、view、Section 等状态仍一致。F1 正是这类缺口能掩盖的路径。

需将 Apply 和 Refresh 都放入真实待准入场景，包含 full-fit/delta-overflow、初始 create/census、control、escaped 字符串、两目标同时工作及 success/failure 边界；失败时比较旧 frame Tick/ordinal、handle/行、allocator、三个 successor 额度、认证 route、outbox 和 observer/Section 状态，随后合法操作以 ordinal 1 接纳且结果/Welcome/baseline 仅释放一次。不得仅断言抛异常或进程退出。

## 已核对的合并行为

| 接缝 | 本次可支持的结论 |
| --- | --- |
| 唯一 Tick / save cut | ordinary `WorldManager.Tick()` 保留；`CreateFromSnapshot` 使用 `header.Cut.ResumeTick`，`ConsumeSave` 使用 After(World.Tick)，公开 capture 在两次 Tick 间。没有发现新合成 Tick。 |
| 有限结果与 lease | phase-9 settlement 后固定 reducer/result window，再 phase-10 save；Terminal/Expired 使用原 EndTick，而 lease 仍约束当前 World/Tick/generation。`CaptureSuccessorRestoration` 仅从 Initial/Applied 批次调用。 |
| GAS/持久化身份 | 单个服务同时提供 finite persistence 与 server successor GAS authority。ECS InstanceId、随机 GAS WorldId、manager WorldIncarnation 分开；冷恢复重绑 finite handle 的 WorldId，没有序列化旧 reservation/grant。Replica finite authority 默认空，`BindEffectAuthority` 不能任意换绑。 |
| AttributeEvaluator | prepared contributions 在 restore 准备期计算，激活重算消费 prepared；RSC 的 retirement 使用 `TryGetService` 取得既有 modifier store，未重新调用 disposed Require。未发现该合并点的具体回归。 |
| Partition | `CapturePartition` 在 Encode/ExitResidency 之前拒绝 `IsSuccessorControlReserved` 的 Participant/issued dormant body；组合测试比较 snapshot 字节和信用，另检查 97-byte 空 Section 循环。 |
| 当前 owner / drain | RSC 的 live route、epoch/profile、generated eligibility/current life、实际 witness 重验路径仍在；Applied history 与 current facts 分开；未发现本合并删除既有 terminal reconciliation。相关绿色测试只能支持其覆盖的状态。 |

需要避免夸大：“in-flight controls refused at save boundary”在已读实现中明确指已接纳但未结算的 **Effect** requests/controls、开放结果 lease 和未提交结构工作；不是所有 successor reservation/host message 都被拒绝。外部尚未接纳命令在 cut 外，已持久化 Game facts 也不会恢复授权。API/report 后续应使用准确范围。

## 现有证据与限制

本次直接读取 run JSON、日志末尾并核对日志 SHA 与 JSON 一致：

| 作者运行 | 实际记录 |
| --- | --- |
| `build-solution-final-35` | exit 0；包含 net10.0 / netstandard2.1；0 warnings、0 errors。 |
| `replication-final-36` | 186 total，186 passed，0 failed，0 skipped，exit 0。 |
| `gas-finite-13` | 55 total，55 passed，0 failed，0 skipped，exit 0。 |
| `ecs-focused-14` | 55 total，55 passed，0 failed，0 skipped，exit 0。 |
| `generator-focused-15` | 86 total，86 passed，0 failed，0 skipped，exit 0。 |
| `combined-save-33` | 1 total，1 passed，0 failed，0 skipped，exit 0；仍受 F2 范围限制。 |
| `format-final-34` | exit 0；日志含 workspace warning；仅是 focused format。 |

final build/replication/save/format 的历史前后 manifest 关联为 final2。finite/ECS/generator 较早运行不能表述为新修复后的回归。官方生成 20 successor + 3 finite 产物/21 roles 的 byte 一致性是既有生成证据，本次未重新生成。未重跑完整 format、严格 lint、所有套件、Host/浏览器或 Game 整局。

保留执行审计结论：作者 lint helper 曾执行两次临时 Git commit 和 fixture cleanup，不能用 sourceStable 声称 metadata/所有 scratch 未变；它不抹掉有效测试日志，也不能被本次代码审查改判为合规。完整源树身份/恢复回放等不在本次重复重验范围。Root 另行处理的最新 main hydration 完整实体集问题未改入本候选，也不在这里冒充已批准。

收口条件：先用最小真实 Native 反例验证并修复 F1，补齐 F2/F3；对实际修复版本重跑受影响回归和独立审查。当前不能批准该组合供最终交付，也不能宣布 101、hydration 或完整引擎链路完成。

## 2026-10-02 修复执行计划

> For agentic workers: use subagent-driven-development for implementation and independent review; root coordinates the available workers. 此报告是 Root 指定的计划与恢复落点。

Goal：按现有 approved owning 契约修复 finite/successor 容量原子性，补齐 F2/F3，保留完整有效 baseline、65536 帧限额和唯一真实 Tick。

Architecture：先用独立 probe 只读消费 final2 的已构建程序集和真实 Native，取得可重现 RED；随后在新的真实 Git 工作树 `codex/101-finite-successor-capacity` 中接续 common R04 + final2 patch。正式修复归 Runtime 的 admission/projection 准备与提交路径；完整 parts/census 仍由所属复制链路提供。Root 负责与最新 main hydration 的明确合流。

Tech stack：C#/.NET 10、Runtime ECS/GAS/Replication、现有 native production DLL、xUnit v3。

- [ ] RED：`.sdd/runtime-capacity-probe-20261002/Program.cs` 使用公开 WorldManager、EntityBindingQuery 和现有 generated successor fixture；先提交多项静态 Participant，再接纳 finite Effect 和 correlated initial admission，记录异常、实际 route/live entity/finite row。测试期望提交前拒绝，现候选应失败。输出独立构建/运行日志，测试数 1、真实退出码；R/A 源码和输出只读。
- [ ] 隔离：现有 effect-integrated/current-validation/baseline-verify/pack 分别有 216/11/37/3 项未提交修改，不复用覆盖。新 Runtime 工作树从现有 common 的 Git base 接入 common R04 和 final2 diff；不改冻结副本，不新建全量 manifest 镜像。
- [ ] F1/F3：在 `WorldManager.SuccessorProjection.cs`、`WorldManager.EffectProjection.cs`、`WorldManager.Visibility.cs`、`EntityBindingQuery.cs` 所属边界建立完整 initial publication 的提交前准备/预算；xUnit 负例和邻例覆盖 pending admission + Apply/Refresh 的旧 Tick/ordinal、allocator、route、credits/outbox 不变及下一合法 ordinal 1。parts/census 正常路径必须保留全部实体。
- [ ] F2：为 generated successor fixture 新增实际写 Health 的 finite final-period Effect 与一次性死亡事实/恢复证据；官方生成，真实普通 Tick 下分别验证明确 save cut、Period/Expired 顺序、Base once-only、旧授权失效和真实 Initial/Applied witness。
- [ ] 回归与审查：运行新增定向测试、受影响 finite/replication/生成一致性与两个 TFM 构建；记录 count/fail/skip/exit。Root 分派独立复审，修复后保留原 RED 和最终 GREEN，更新本报告。

## 2026-10-02 实际 RED 与修复工作树

已完成独立真实 Native RED，未将工具中断或零测试视作通过。`../.sdd/runtime-capacity-probe-20261002/native-red-01.json`（同目录 log）记录 total 1 / passed 0 / failed 1 / skipped 0 / exit 1：有限 Effect 已接纳，correlated admission 之后 entity count 102 → 104、revision 102 → 104、真实 route 已成立，随后普通 Tick 在 ReplicationProjection 因 `WorldChange exceeds 65536 bytes` fault。Native SHA-256=`6f2aac8009922b8a848a5cd44d567887b39823dcb56cbaad08c206a974e76337`，ABI=`112c63bd8c5bc0d83e6507cddfb68ade5a83a9fe36e789a7b333b1c033843a0a`。

需要校正最初 RED 的预期：该输入协商的是 successor receipts **parts**，完整逻辑消息大于 65536 但小于 owning `world-change-parts-v1.json` 的 maxLogicalBytes 时应成功输出完整 census，由 Host 进行物理分片。65536 是物理消息上限，不可将它作为 parts 的逻辑上限。非 parts 或超过逻辑上限的情况仍需提交前拒绝，不能丢实体或拆分游戏权威事务掩盖问题。

工作已转入真实 Git 工作树 `C:/Work/LumioGames/LumioGameRuntime-101-finite-successor-capacity`，分支 `codex/101-finite-successor-capacity`。从 common R04 基线 d287bcd + 已核验 final2 patch 恢复后单独提交 `2ab1deeb2abd5b34cb6d722136b2225d120df97a`，14 个关键源文件匹配 final2。所有修复仅在该新工作树；冻结 RFC/AFC 源未改。构建使用 `.artifacts-capacity` 输出，包括 Engine ProjectReference 的中间产物，避免写入冻结依赖输出。

当前实现正在回归：Engine owning JSON 作为 embedded resource 消费（无手抄 4 MiB 常量）；Binding 初始化真实 detached EntityOrder 后先预算完整 current + pending census 再进入结构队列；GAS 临时提供 resident/pending 投影上界，后续 Apply/Refresh 在预算通过前不改 frame/ordinal/handle。新增 5 个实际 Native 用例覆盖 parts 大 baseline、两档超限拒绝及待准入 Apply/Refresh。首次组合回归检出了 prepared order 同步字段仍绑定 live host 的问题（5 fail / 0 skip，`Runtime/.run/capacity/test-02.log`），已改为 detached 初始化后 commit 才绑定，尚待新回归，不表述为 GREEN。

Root 接手 F2 新7404真实周期致死与 save-cut/restore 用例，并发现 Period 结果把 CrossedZero 写死为 false，正在其独占的 Period settlement 部分做 RED → 修复。当前裁决仍 NEEDS_FIXES，未经复审不得升级为通过。

## F2 修复独立复审（本 reviewer 未实现此修复）

Root 在独立 capacity 工作树新增 7404 finite Period 实际修改 Health 的 fixture，按结果根因修改 `EffectSettlement.cs:131` 的共用 `DetectZeroCrossing` 和 `FiniteEffectSettlement.cs:79` 的 Period 捕获。只复用原 instant 的 Lethal Base before > 0 / after <= 0 判定；真实变化同时写入 Period.CrossedZero 与 LastZeroCrossingTick。控制/终结结果默认 false，expiry 仍取 row.EndTick；未新增 RPC 或移动 Tick/lease。

代码检查：`FiniteSuccessorSaveDeathTests.cs` 用 WorldSaveComponent.Save + 实际 SnapshotSink 在最后周期前/后两个 phase10 cut 捕获，正常 Tick 完成周期并验证 Period→Terminal 顺序、实际 AppliedTick/dueTick/Health Base/Current、LastZeroCrossingTick、唯一跨零。before cut 冷恢复经真实 Binding 重准入再执行同一 due Tick；after cut 冷恢复不重放周期/终结。后续 Prepare→Destroy→Create→真实7401 RestoreLifeEffect witness→正式 TransferSuccessorConnection→eligibility Tick→route activation→Game result consumption 均通过既有 Runtime 原语；无伪造 witness。新body seed=1沿用既有 Harness，仍要求创建本身无 witness。

已直接读取并校验 Root 的实测日志（目录 `Runtime-101-finite-successor-capacity/.artifacts-capacity/f2-evidence`）：

| 证据 | 结果 / SHA-256 |
| --- | --- |
| `finite-final-red-02.log` | 1 total / 0 pass / 1 fail / 0 skip，Root记录exit2；失败确实在 period.CrossedZero 应为true处。SHA `e75a1b65c04781f45afcc59ebec8503c0f13a0fea7ef1db8428519d8098b40bb`。 |
| `finite-final-green-02.log` | 1 total / 1 pass / 0 fail / 0 skip，Root记录exit0；6.940s。SHA `f1432bab79f6e32bb331ac9e0573133dce7f0455ae8bf1e50a47cadee1744b01`。 |
| `build-green-02.log` | Root串行构建exit0、0warning/error。SHA `2852870adedb0da66a3e94dbe0f0df62598681ded6666dd672da063741c988f6`。 |

F2 scoped SPEC PASS / QUALITY PASS；没有发现阻塞P1。此裁决只涵盖 Root 所实施的跨零修复、完整存档/死亡/恢复/Transfer 组合回归；本 reviewer 自己的容量代码须由 Root 独立评审，且整体回归未完成前仍不得将总裁决改为通过。
