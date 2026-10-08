# Fire / Aura 六域生产独立审查

2026-10-03。审查者未作者本次六处修复生产源码。本轮完整读取作者报告、调查、fix-02 manifest/patch/before/after、六域现源码、原14项与新增12项测试、冻结13项 Native 关联测试及 exact official06 Runtime 实现。仅新建本报告，没有运行 GEN、build、Native、测试或 format，没有改生产、测试、Config、Schema、索引或冻结，没有spawn。

**结论：发现一项 P2 恢复时钟边界；其他五项原缺口及其相关路径在源码上形成了完整修复链。业务 quality 仍待 Root 新二进制的实际诊断和 Native 结果，本报告不作执行验收。** P2 的依据为真实源码和 official06 cut 定义；尚无新增等号边界恢复的实际执行证据。

## 输入与身份

候选为 [fire-aura-production-fix-02 manifest](C:/Work/LumioGames/LumioGame/games/101-bomber/.run/v14-native-production-20261003/fire-aura-production-fix-02/manifest.json) 与 [完整 patch](C:/Work/LumioGames/LumioGame/games/101-bomber/.run/v14-native-production-20261003/fire-aura-production-fix-02/source-diff.patch)，独立重算 SHA256 分别为 `2f006dbc957ba7a5b09cadfb6998acb18a25c2f46c3107bf3ddcfdd11166cae9`、`12b931f5ec33c01241bd7ec80b3a8b0f97cb16168bf08e700f8a4bef4d2b4017`。七个 frozen-after 和四个 frozen-before 全部匹配 manifest。四个 before 对应旧实际 RED 源身份，没有用 Git HEAD 代替。

目前四个修改生产文件、一个新增测试逐字匹配 fix-02 after。Root 为编译前置仅给两处 Aura 文件添加 `using Lumio.Bomber.Gameplay.Config;`；删除这一行后与物理 frozen-after **逐字相同**，不是语义等价推断。当前两文件 SHA：

| 当前文件 | SHA256 |
|---|---|
| Gameplay/BomberFiniteAura.Server.cs | `cdc00d1794a39163d02ec28322abd5d097f93deda6288bc99d00b541e0d32def` |
| Gameplay/Effects/BomberFireAuraEffect.Server.cs | `83b6573cc06d078efe6af9c5b98a76c52ce021c3857aac927cc859d36709fa03` |

六个 unchanged guards（FireReducer、BurnDamageEffect.Server、ParticipantState.Server、三个原测试文件）均独立重算等于 manifest。原14项由 Exposure7 + Fire2 + Aura5 组成；新增测试为6 Fact + 两组各3 InlineData = **12 cases**，SHA `6a24a4c271dcb1e7ec8214b8afa4bcdda998e1d0fc0ab6a9b2632b7ee2f0ad93`。原负控与断言未削弱。

本轮两份其他 test-only fence 仍原样：NativeCorrelation13 SHA `23e8b7369e054dc3b95fcb90d3c718dfd7f25cf018b042d58771aa91ef012a26`；ObjectBudget 原83 + 新22 SHA `935511ee1e140dbc9a73516285314d1b164328d29169bce43ffdcbba63390787`。

Runtime 判定只取 `C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233`，现场 `git rev-parse HEAD` 为 `23356eafc365c753b6e8d9987fd069815ff067ce`。没有套用主仓最新语义。

## [P2] 非空曝光接受尚未处理的 ResumeTick 作为 LastTick

落点：[BomberFireExposure.Server.cs:125](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberFireExposure.Server.cs:125)。当前条件只拒 `FireExposureLastTick > world.Tick`，所以在已有合法非空 source tuple 的快照中将 LastTick 改为捕获时的 `scene.World.Tick`，恢复后该值等于 ResumeTick，仍能通过这个时钟条件。

真实写入位置在 [Advance:43](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberFireExposure.Server.cs:43) 与 [Advance:47](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberFireExposure.Server.cs:47)：LastTick 表示刚执行过的曝光采样 Tick。official06 [PublishEgress:468](C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233/modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.cs:468) 才推进 World.Tick；[公开 Capture:503](C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233/modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.cs:503) 仅在 Ticks 之间可执行，[WorldSnapshotCodec:22](C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233/modules/ecs/src/Lumio.GameRuntime.Ecs/Snapshot/WorldSnapshotCodec.cs:22) 默认 Before cut。两种合法 cut 的恢复游标见 [PersistenceCut:22](C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233/modules/ecs/src/Lumio.GameRuntime.Ecs/Snapshot/PersistenceCut.cs:22)：Before 为下一待处理 Tick，AfterSettlement 为 captureTick+1；帧内保存明确用 [ConsumeSave:1657](C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233/modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.cs:1657) 的 After cut。恢复先将 World.Tick 设为 [ResumeTick:140](C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233/modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.Lifetime.cs:140)，再 hydrate。

因此真实生产的非空曝光 LastTick 必须 **严格小于** 恢复游标；等号表示未执行过的采样 Tick，不是合法的 cut 边界。这个损坏状态目前不会被 fail-closed 拒绝，而且首次 Advance 的 `LastTick == world.Tick-1` 不成立，会静默重置已累计的曝光 FromTick。影响为损坏恢复被接受并丢失连续暴露记忆；不是已证明的早扣血或公开输入漏洞。

现有 [future-clock 负控:137](C:/Work/LumioGames/LumioGame/games/101-bomber/Server/Tests/Gameplay/BomberFireExposureReviewTests.cs:137) 设置的是 `scene.World.Tick + 1`，所以原7项即使全部变绿，也没有覆盖这个等号。建议 Root 在保留原断言的前提下，单独新增真实非空 source 的 equality 恢复负控，要求拒绝且原 snapshot 不变，真实 RED 后再将上界改为严格小于 ResumeTick。本轮没有运行该新增场景或修改测试/实现。

## 六域源码核查结果

| 审查路径 | 具体结论与证据 |
|---|---|
| 空源 / 本地身份 / 来源元组 | [ValidateExposure:108](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberFireExposure.Server.cs:108) 与 ResetExposure:180 对应完整清零字段，独立累计 FirePulseSequence 未被清掉；非空核 full NetEntityId、Match、Participant 类型及源种类。Bomb 分支:134 按 Owner/SourceLife/Generation/Chain/Family/DangerUntil/Skill0 校验，不要求旧 SourceLife live 或等于新 CurrentLife，因此不会改绑旧死亡来源。时钟上界另见上述 P2。 |
| 恢复查源顺序 | [World.Residency:71](C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233/modules/ecs/src/Lumio.GameRuntime.Ecs/World/World.Residency.cs:71) 先填全部实体字段后统一 OnHydrate；[Lifetime:153](C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233/modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.Lifetime.cs:153) hydrate 后才 activateEffects。Aura hydrate:144 只核已有持久 tuple，实际 finite 核验在正常 UpdatePlayers 执行，未提前要求 ActiveEffects。kind3 仅对应已有 Zone 持久字段；选源器没有 Zone 枚举，不将此分支称为 trail producer 验收。 |
| 同 Tick Native Burn | [BombSystem:278](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BombSystem.Server.cs:278) 将同一相变循环移到唯一 Advance 前。原 live、Terrain.HoldsSource、FireFacts.HoldsSource、pending hit、Split.HoldsFamily 守卫逐字保留；仍调用 Native Send，而非手写相变。真实 EnterBurn 动作在 [BombLifecycle:73](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberBombLifecycle.Server.cs:73)，残留 Duration 仍读源配置。 |
| actual Aura 准入 | [AuraEffect.CanSettle:14](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/Effects/BomberFireAuraEffect.Server.cs:14) 先核真实 source==target==Life、实体类型，再由 [MatchesAuraRequest:14](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberFiniteAura.Server.cs:14) 核 Participant/CurrentLife/Generation/Match/Duration/Chain/Favorite；还核活体、非 RestorePending、skill4 bound、pendingOutcome1、完整 handle、非零 CD、没有既有 active Aura。保护本人可合法施放，成功解除保护仍由原 FireReducer 的真实 Initial Applied 驱动。 |
| actual Aura 覆盖与 paired 重绑 | [MatchesActualAura:28](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberFiniteAura.Server.cs:28) 核实际 type/target/source、Instance/Generation、World（仅 paired 可重绑）、官方 typed payload、Duration/A。ConsumeAura:40 只在 CompletedRestore==PairedCheckpoint 借实际匹配行重绑，不重 Apply；投影取真实 EndTick。非 paired world 不放宽。 |
| 到期 / Remove / Refresh / source death | [AuraSources:77](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberFireExposure.Server.cs:77) 排除死亡源、本人、suppressed/End<=Tick 行；受害者保护/Bubble 重用 Advance:29 reset。ConsumeAura:47 使用实际 Remove；死亡屏障已清 CurrentLife 时 MatchesRequest 会不匹配，但源扫描仍排除死亡主体，并由 Runtime 销毁清理实体 finite owner（[EffectComponent:24](C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233/modules/gas/src/Lumio.GameRuntime.Gas/Ecs/EffectComponent.cs:24)、[Component:104](C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233/modules/ecs/src/Lumio.GameRuntime.Ecs/Component.cs:104)、[DetachFiniteOwner:28](C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233/modules/gas/src/Lumio.GameRuntime.Gas/Lifecycle/GasWorldContext.Persistence.cs:28)）。official06 [Refresh:124](C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233/modules/gas/src/Lumio.GameRuntime.Gas/Effect/FiniteEffectSettlement.cs:124) 保留 A/Duration/handle，只改 End，候选未错误限定 End=A+Duration。 |
| 3×3 Native 砖格 / 零地形写 | [AuraSources:84](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberFireExposure.Server.cs:84) 用施放者真实 LogicTransform 当前格推范围；[AuraCellIsOpen:94](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberFireExposure.Server.cs:94) 用既有整图 Native 批量读 obstacle layer 及官方配置 walkable/enable 判格，无体素写，无复制地形真值。actual Native brick 测试在新增:93 使用 Scene.Write 真实块，未用本地 coverage DTO。 |
| 10110 致死统一生命周期 | [Outcome:65](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberOutcomeReducer.Server.cs:65) 选择真实 Initial/Applied/CrossedZero，10110 分支:105 核受害 Participant full fact/handle/source/target/life/gen/match/tick/status1/ready/before>0/after0/actual。与10101分支汇入:132 同一个11写 body，没有复制第二套死亡路径。原事实消费先于 DeathStructure 销毁（[EffectBusiness:74](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberEffectBusiness.Server.cs:74)），保留 burn journal 与旧来源。 |

duration 未改设计参数、Config、ADR0048 或既有 M2 守卫；Aura fixture 仍从官方源配置 SkillLevel(4,1) 取 Duration/CD，并非将 ADR0048 狂暴6000ms套成 Aura 时长。本次没有实现公开 Aura ability、最爱留火、桥融化或解除正式 producer guard。

## 真实 Claim 与冻结 NativeCorrelation13

[FireReducer:25](C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberFireReducer.Server.cs:25) 仍缓存 full Handle(World/Instance/Generation)+Target+Source，保留完整结果枚举，最后匹配后一次真实 `c.Claim(r,"bomber.fire",participant,0)` 和 status。该文件与原 frozen SHA 相同，BurnDamage.CanSettle 同样未改。

official06 [EffectFactAssociation:28](C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233/modules/gas/src/Lumio.GameRuntime.Gas/Effect/EffectFactAssociation.cs:28) 在真实准入捕获 owner/index/payload；Complete:108 先核 immutable keys、写实际 before/after/actual/ready。随后 [EffectOperationClaim.Capture:33](C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233/modules/gas/src/Lumio.GameRuntime.Gas/Effect/EffectOperationClaim.cs:33) 对 owner/index/row 不同立即拒绝，并 ValidateResult:139 核完整原 receipt。Outcome 不创造新 Claim 能力，而在 After=bomber.fire 后读取已合法发布 status 的事实。

13关联测试中 Fire8 项仍直接真实 Effects.Apply10110；[IdleBomb:322](C:/Work/LumioGames/LumioGame/games/101-bomber/Server/Tests/Gameplay/BomberReducerNativeCorrelationReviewTests.cs:322) 先用正常 Tick 发布标准 Fuse source，StageFire:359 完整预留事实并交给官方 Effect admission，未以相变或 Family 限制人为排除此标准 source。候选新增 hydrate 校验只管持续曝光选择状态；未向原 BurnDamage eligibility 增加 source.Phase/Family 条件，故这条关联路径在源码上兼容。

Fire8 明确包含两个真实 Participant + unrelated10106 + 下一空结果窗、wrong-owner完整匹配拒绝、full identity五列分别不同、DestroyedTarget原 Rejected 收尾。观察器 [ReceiptProbe:513](C:/Work/LumioGames/LumioGame/games/101-bomber/Server/Tests/Gameplay/BomberReducerNativeCorrelationReviewTests.cs:513) 只读取真实 borrowed window/原 ResultFacts；FirstChance 仅原 Capture access 异常、同 world/线程/Tick，finally 解订阅及恢复 observer，无伪造 EffectResult、Claim 或补写生产帧。这13项本轮未运行，不把静态兼容称为已经通过。

## 执行证据和验收界限

独立重算三份原 JSON/log SHA 与调查报告一致，raw `.exit` 均为2且与 JSON exitCode 一致：

| 原 run（固定 build10） | pass / fail / skip | 原第一失败边界 |
|---|---|---|
| fire-exposure-review-01 | 3 / 4 / 0 | 三损坏 Restore 未拒；lethal 先停 health0 断言，不能称其已执行死亡屏障负向 |
| fire-production-original-01 | 1 / 1 / 0 | overlap 满秒 health expected4 actual6 |
| fire-aura-original-01 | 1 / 4 / 0 | 错 participant/match 接受、paired world 未重绑、actual pulse 缺失 |

原14总5pass/9fail/0skip。候选代码变化已逐项对应这些原因，但没有用旧 build10 RED 证明候选二进制成功。Root 消息中的官方 GEN06（四次run、112件proof/drift0、67 Schema不变）只作为调度状态；build11 的 imports/CA1510 编译前置失败不是业务 RED。新 build12/official plan 实际费用及26项 Fire/Aura（原14+新增12）、关联13 Native 结果尚未纳入本报告，不猜费用和成功率。

新增12源码覆盖非空 Bomb tuple 三负控、actual Aura payload life/gen/chain 三负控、随人/self/Native砖、真实 caster 致死终止、实际 Remove/Refresh、死旧投弹者 paired attribution；expiry/paired handle 的原 Aura5 继续保留。Root 必须分别读真实费用诊断和原14、新12、关联13 raw结果零skip，特别让原 lethal 继续越过 [ExposureReview:104](C:/Work/LumioGames/LumioGame/games/101-bomber/Server/Tests/Gameplay/BomberFireExposureReviewTests.cs:104) 后的双 lifePhase、DeathStructure full tuple、下一普通 Tick 真销毁与 burn journal，而不是只接受 health 改善。P2 equality 需要其独立真实恢复负控。

本报告为源码与契约独审，未宣布业务质量通过；也不覆盖16人完整负载、整局/下一局、公开主动技与 trail producer、M2最终准入或 Goal101完成。
