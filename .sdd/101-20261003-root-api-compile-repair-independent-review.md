# 101 Root API/编译修复 · 非作者独立窄审

2026-10-03。裁决：**STATIC ACCEPT，限五项精确源码修复、Wire import 和三份既有共享声明的完整发布；未发现阻断问题。** 全部完整前后文件、指定替换与逐字节逆操作通过独立核验；没有删除断言、放宽谓词、改写完整来源或提高公共限额。本裁决不等于完整构建、startup、Native、Favorite 准入或历史恢复成功。

本代理只写本报告和 `.run/v15-root-compile-repair-independent-review-01/`，读取 Root 已产生的构建记录及 actual07 Runtime 源码，运行轻量 Node hash/完整字节和生成拓扑检查。没有修改任何生产、测试、generated、schema、Runtime，没有执行 .NET、官方 GEN、Native、配置 CLI、format、stage 或 commit。此审查不扩为 build54 随后暴露的九项 Followup 测试修复审查。

**精确输入与逆操作。** [compile-repair-02 publication](C:/Work/LumioGames/LumioGame/.run/v15-root-compile-repair-02/publication.json) 实际 SHA256 `3005a5ceb68d0648025d3de9b283765cb5222b4efc702a01dc5491a2e15f37c6`；[共享声明 publication](C:/Work/LumioGames/LumioGame/.run/v15-root-declarations-publication-01/publication.json) 为 `ca0eb9f669333f30765001d425f1065c3cae0090549d07618d5a449794d3219f`，均与指定身份一致。

| 完整修复文件 | before → accepted SHA256 前缀 | 独立核验 |
|---|---|---|
| UseActiveSkillAbility.Server.cs | `5f9db1e8 → 3274aa0b` | 唯一 out 输出保存；正反字节相等 |
| BomberFavoriteFireZones.Server.cs | `4e07e9ab → 7527a8cc` | 唯一位置初始化替换；正反字节相等 |
| BomberIceBridges.Server.cs | `2ba7055a → 76688e24` | 一个完整 region 分支局部改名；正反字节相等 |
| BomberTerrainTransactions.Server.cs | `506843ab → 50bf9541` | 三项私有参数类型与一次遍历存在判断替换；正反字节相等 |
| BomberEffectPlanValidationDiagnosticTests.cs | `97aef79d → a1bda9ff` | 4→5 与 required name 追加；正反字节相等 |

所有完整 before/accepted hash 与 publication 精确一致；按记录的唯一 ops 从 before 重建 accepted，再反序替换回 before，逐字节相等；审查时五个物理目标也都等于 accepted。原四 program diagnostic 完整 before `97aef79d83571c0aa586b6b13641630a18089ff93e9b850ac1576572ae4d98c6` 保留，没有把过去四 program 的结果改写成五 program 结果。具体全长 hashes、字节数与 ops 留在 [独立 audit](C:/Work/LumioGames/LumioGame/.run/v15-root-compile-repair-independent-review-01/audit.json)。

**五项修复的语义。** `UseActiveSkillAbility:31` 将同一 `TryResolveSlot(..., out _)` 保存为 `out int kind`，使原先已写出的 ReservedFire 分支能使用实际 resolver 输出。level Duration/Cooldown、resolver 失败、CanReserve 的原判断与 failureCode 路径不变；没有让其他 kind 进入 Favorite，也没有跳过 admission。

`BomberFavoriteFireZones:138` 的旧 `LogicTransform.LocalPosition = ...` 在 actual07 SDK 为只读属性，无法编译。完整修复使用 `EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition", FormattableString.Invariant(...), silent:true)`。已读 actual07 的 `EcsRegistry.Generated:107`、public `IGeneratedComponent.WriteField` 和 `LogicTransform:474/485/562`：它写入同一 LocalPosition 真值，按 invariant culture 解析三个 float，验证有限值，保留 EffectReducerBarrier。新字符串的 X/Z 仍为原 `x+.5f/z+.5f` 的 round-trip 格式，Y仍1.5，位置没有另建影子账。

这里写的是结构创建 order 上的 draft transform，不是给已存在角色移动另开 controller 旁路。PlaceBomb、Barrel promise、DeathDrop、CentralSupply、Frenzy、Split、Successor 和 terrain pickup 等既有创建生产者使用相同公开初始化路径。Emit 的 durable Submitted witness 仍早于 Create，原 ordinal、exact owed Tick、PendingZone、owner/source/generation/match/chain、mask、promise token 与 lifetime 状态写序均未变化；该 API 替换没有触碰 lease/claim 语义。

`BomberIceBridges` 只将 region 分支局部 lifeId/participantId/generation/chain/occurred 改为 region 前缀名称，消除与后续 fire 分支同一 C# scope 的冲突。完整实体、Life/Participant、generation、chain、match、Occurred、From/Until、coverage mask、坐标和活性比较原样，region source melt 债务条件没有放松；private exception 描述里的 generation 一词也随局部改名为 regionGeneration，不是公共错误码变化。round/fire 其他分支逐字保留。

`BomberTerrainTransactions` 的三个 helper 均为 private，所有调用者传入原本就是 frame 的 `List<BomberPendingVoxelCell>` / `List<BomberTerrainDetail>`。参数类型具体化没有新增 list 修改。`runtime.PendingKinds.Any(IsTraversalKind)` 对 SDK SyncList 不适用，改为 `Count/索引` 按相同纯谓词短路扫描。原 `hasTraversal && exact header` 判断完整保留，空集合仍 false，任一 traversal kind 仍 true；header、SourceBomb full ID、source tuple、chain/family/Occurred、唯一每臂 Pending、remaining、cursor、section/offset、capacity cohort 和 Original 写前检查均逐字保留。

Diagnostic 保留所有 Assert 及 Fact/Theory/InlineData 数量；唯二变化是当前报告数从4改5，以及 required inventory 添加 `bomber.fire-region`。当前官方生成的完整 server program images 经只读解码，名称确为 fire、fire-region、health、settlement、outcome 五个，无缺项/重复。错误必须为空、字段/成本、原 Base64 不改、public quota、400/704 context 和严格验证路径均不放松。这个拓扑修订不是 future context GREEN，当前 Region MaxWrites720/ResultRecords360 也没有借机扩大；生成第五程序不等于 Favorite 所需 live/pending/context 预算已经开放。

**Wire import 与共享声明。** [Wire repair](C:/Work/LumioGames/LumioGame/.run/v15-root-declarations-publication-01/wire-import-repair.json) 的完整 `0335076f…→ec97a9bd…` 只增加 `using Lumio.Wire;`，移除这一行逐字节返回 before。实际 Runtime EffectResults.cs 自身也从 Lumio.Wire 消费 EffectResultKind/Outcome；该修复解决 build52 的 unresolved enum。Reduce body 及声明逐字未变：Initial 非零 ordinal、Terminal 真正 ordinal0、完整 lifetime handle/world/instance/generation、旧 SourceLife、AppliedTick/fromTick 与真实 untilTick expiry guards 均保留。

三份完整共享声明与早已独审的私有稿逐字相等，物理目标也匹配：

- BomberFireZoneState `e34adb43…`，旧全部字段保留，追加 region ordinal/duration、Aura/lifetime 完整 handle、outcome、birth witness 与 Aoi RegionCoverage；Scope/Persist/Authority 没有改写。
- BomberFireZoneEntity `d19ba51e…`，旧 CS/Observer/LogicTransform/State/HFSM 保留，追加实际 Effect target 所需 AttributeComponent/EffectComponent。
- BomberFireZoneLifetimeEffect `b6d633a5…` 是原 absent 文件，有限 TA 的 Game-owned ID10112、完整16项参数与固定 Fx budget 保留；未新增 public Runtime/Engine 身份或涨限。

完整 before 与 accepted 都已保存；已有两文件可用全字节 before 恢复，新 Effect 文件的 inverse 为删除新增文件，保存的零字节 before 不意味着原来存在空文件。声明发布修复了 build51 缺字段/实体结构，不能代替 schema history、新 GameRelease、双端正式 GEN、startup 或 Native 证据；本审查不重新分配 IDs，也不批准 Favorite enablement。

**冻结旧证据与实际构建地位。** 本轮独立读取 `executor-freeze.json`，确认 SHA `9311302f83d1d8ebaeec3f37a444d7680a43a7853cce17fe5e41bc2d918a2775`；其全部 **3688 files / 42037481 bytes** 逐项 hash/bytes 仍等于原 manifest。旧冻结源与产物保持原字节；没有把新 five-program diagnostic 或 API repairs 写回冻结 suite。本核验仅证明不可变存档仍原样，不声称它已在 v15 新底座执行或 exact original executor 已恢复。

只读检查 Root 四次真实记录的日志 SHA、JSON 和 raw exit：build51 缺声明而 GEN失败；build52 缺 Wire enum 而 GEN失败；build53 官方 server GEN 实际成功，但随后编译/analyzer有11项 Gameplay错误，raw1；build54 再次生成，原11项不再出现，但9项错误均指向 `BomberFavoriteFireFollowupProductionTests.cs`，仍 raw1。它们不是 Native RED，也不是构建 GREEN。该新九项需 Root另修、另存完整前后/逆字节再窄审；本报告不预先批准尚未读到的修复。

独立检查全部通过，批准仅绑定本报告明确的精确文件与机械/API修复。没有删断言、降限额或隐藏来源债务；实际新编译、注册、Native、历史及完整玩法门继续由 Root串行取证。**STOP。**
