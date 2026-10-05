# Schema v15 私有工具与迁移独立审查

2026-10-03，非作者审查。结论：**REQUEST CHANGES（P1：作者字节闭包不完整）；迁移纯函数与历史保留方案静态通过；正式 v15 admission 保持关闭。** 本结论只针对精确私有 bundle，不是生产发布、GEN、GAS、Native、扩容或完整游戏验收结论。

审查输入：`.run/schema15-migration-draft-01/manifest.json` SHA256 **93c61b7548e41f9582796a40df4fa44a3688d2f78c857d466bffcdb7bac920e0**；作者报告 SHA256 **11351c74c19b25e6f97d329cb925ffb35d2be8c89174a47d94c68b124cde2c42**。13 项完整文件 inventory 逐字哈希复核通过。父仓核心/导航/仓库边界/测试/代码风格、101 入口/核心/导航/测试/代码风格及完整用户 attachment 已读。新增/修改工具逻辑、声明、traversal packed 状态方法及 Favorite producer/CanSettle/reducer/恢复验证采用完整方法阅读；未改的 history/storage 实现另以完整原字节相等复核，没有从 diff 片段推断缺失方法。

证据目录：`.run/schema15-migration-independent-review-01/`。本审查只写该目录和本报告；没有写物理 Game、Tools、Compatibility、generated、Runtime，没有 GEN、.NET、Native、配置编译器、实际 readObservation、stage 或 commit。

## P1：完整审查闭包遗漏实际修改的作者文件

落点：`.run/schema15-migration-draft-01/proposal/schema-identity-v15-evidence.mjs:5–24` 的 `V15_AUTHOR_PATHS`，配合 `schema-identity-read.mjs:253–260` 输入枚举与 `:318` 相关声明过滤。

当前固定列表 35 个作者路径没有包括以下实际行为来源：

| 遗漏生产路径 | 具体调用/变化与影响 |
| --- | --- |
| `Gameplay/BomberFireRegionCoverage.cs` | Favorite owner 草稿 `BomberFavoriteFireZones.Server.cs:303` 使用 `Contains`；IceBridges 草稿 `:151`/`:624` 使用 `Cells`/`Contains`。改几何或 mask 位序不会改变身份声明，能够改变伤害/地形覆盖。 |
| `Gameplay/BomberBarrelBombPromises.Server.cs` | traversal revision03 草稿 `:60` 的新 `PreflightStage` 及 `:114` 的 `RequireTraversalPending` 参与已冻结 ray 的桶事务准入与回执复核；移除这些行为不会改变被观察字段。 |
| `Gameplay/Components/Bomber/BomberSkillState.Server.cs` | Favorite revision03 的 `OnHydrate` 将 AuraOutcome 允许上界 3 改为 6。它既不含新增 Sync 字段，也没有完整方法体结构校验；恢复门可漂移。 |
| `Gameplay/Config/BomberObjectBudgets.cs` | Favorite revision03 修改真实 FireZone/cast 范围计算。当前 `walk` 明确跳过 Config，连输入 fingerprint 都不含此源码；仅向固定列表加该路径会因 bytes 缺失失败，还须明确读入。 |

`requireV15Review` 只遍历闭包中的路径；读取器的普通词法解析不能替代完整行为字节审核。`closed-review-gate-probe.json` 的 **TEST-ONLY** 纯函数探针独立证明：默认 null 被 `v15_review_required/exit2` 拒绝、列表内篡改被拒绝、给 review 增加额外路径被拒绝；但上述四个未列入文件的字节改动仍通过 gate。这些合成 gate bytes 不是 GEN、没有构造实际官方观察、没有伪造可发布 accepted 审查对象。

修订要求：在新的私有 revision 中按实际 traversal 8 项作者路径与 Favorite 最终 24 项 producer/behavior 路径并集核对完整闭包，包含新 coverage helper、SkillState hydrate、桶 pending owner 与实际 budget 源；输入枚举必须真正捕获闭包要求的 Config 文件。仍保持闭合集合、缺/多路径失败、精确 SHA256 和 null 默认门。Root 正式 GEN 后才填写独立审查实际 bytes；不得猜 SHA 或降低原有结构校验。

另一个正式审核关注点：当前 `V15_GENERATED_PATHS` 固定 32 个 Effect 输出。两个修改组件的 server/client `.g.cs` 由结构核对，而非这一固定字节列表覆盖；RestorePersist 的分支与尾部覆盖严格，但 CapturePersist/CaptureSync 仍使用写调用存在性检查（读取器 `:427–447`）。Root 后续应把正式改变的组件生成完整方法也纳入真实字节审核/冻结，或补完完整 capture 方法结构核对。现有 `compareObserved` 对已落账 identity evidence 的漂移会拒绝，不能把此提醒描述为已验证生产绕过。

## 迁移与身份静态结论

- v15 名称独立；10112 仅接受 `BomberFireZoneLifetimeEffect` 的 exact 16 列 finite-ta 参数：Duration1 ulong、Fx2 string32；Participant3/Life4/Zone11 为完整 NetEntityId；Generation5/MatchId6/ChainId7/AuraWorld8/AuraInstance9/BirthTick16 为 ulong；仅 AuraGeneration10 为 uint；Ordinal12/X13/Z14/Mask15 为 int。empty contributions/instantWrites，duration1，无 period。10111 Favorite7 bool 与旧有限类型白名单未扩大。
- 10112 Producer→CanSettle→生成 Decode→10124 reducer→正常业务消费/Awake 路径已静态阅读。10124 独立 reducer mapping 命名空间，UntilTick1/LifetimeOutcome2 沿 Root 既有历史审计；不虚构身份模型不支持的 reducer kind。Typed born/expired events 与既有 actor/full Region 字段相连。不能将此源码审查替代实际 result/cost/registry/GAS/Native 证明。
- 独立使用真实 `parseComponent` 阅读声明草稿：旧 Bomb scalars0–29 保持，旧10个容器30–39整体变为33–42；新 scalar30–32，TraversalArms43/fixed4；ContactedChests 仍5。packed arm distance*4+state 与 Ready0/Pending1/Finished2 的持久化只用一个 int 容器，未另建状态真值。完整 restore 走原 int/container 分支。
- FireZone 旧13个 ordinal 保持，新11个 ordinal13–23；BirthSubmitted22/RegionCoverage23 是 bool，前者 None、后者 Aoi；指定旧五列 None→Aoi。uint 用原 UInt64 capture 与 checked uint inverse。FireZone slot0–3 保留，尾加4 AttributeComponent/5 EffectComponent；公共 Native reserved slots 未改。
- 精确 v14 原件 d3bca141…c7f，active765/retired8423/36pages。迁移每个旧 active 完整 shape/evidence 追加为 retirement，sourceSnapshot 指向独立不可变 before-traversal 原件；旧36个 descriptors 保留，原 page bytes 仍逐次认证。纯 fixture 9188 退休/39pages，历史 Pascal/大小写身份与全部 snapshot closure 未删改。
- 历史36pages、765新增墓碑、整个 required snapshot closure 在原8MiB index预算下验证成功。512-byte precharge、8MiB 输入/index、1MiB blob、64MiB World record 未提高；后两项没有本次实际世界测量。
- `history.mjs`/`storage.mjs` 提案与原件逐字一致；local-history 只追加当前 v14 snapshot 原 hash。原06/history provenance 没有改成07。真实07 manifest **652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04** 与 SDK **93d8ec4731f39726294cc92ac5eb1e643aab9693d9a2f8c6f24bc24b16539ea1** 已独立读物理字节核对，version0.0.5-main.0e2fc74。
- 私有 migration 无法从此路径 `--apply`；正式入口仍先 readObservation，再校验 full history、immutable conflicts、输入未变化与当前 ledger before bytes，再 staging rename。releaseDecision:null/freezeEligible:false 明确保留。这个迁移是审计账本迁移，不是 WorldSnapshot 转换；新 distinct GameReleaseId 与 oldWorld strict 拒绝策略必须在 Root 实际发布中落实。

## 实际轻量验证

| 独立执行 | total/pass/fail/skip | exit | 范围 |
| --- | --- | --- | --- |
| 私有模型 contract | 4/4/0/0 | 0 | 唯一合法10112、新 uint 错列、任意新 ID、字段名/顺序/duration 异常拒绝 |
| 私有 migration | 6/6/0/0 | 0 | 页/旧行保留、确定性、capacity 参数继承、原件/页篡改、历史闭包、正式审核缺失拒绝 |

测试中53是 synthetic observation 参数，未选择产品 capacity、未宣称52。它不是正式作者声明或生成证据。

73 个原输入（6 Tools+全部67 Compatibility）当前 SHA/bytes 与作者 before/after 全相等，额外目录项0。既有5个被提案覆盖的工具完整 before/draft 逆变换字节相等，2个新工具不存在生产目标；原 release3/storage2 草稿 before 副本与原草稿逐字相等。证据 `input-fence.verified.json`、`bundle-inventory.verified.json`、`full-before-draft-inverse.json`。没有改旧 cap5 producer Fact、旧 BoundedObjectStorageTests 断言或原 qualifier。

## 旧 World 资格策略及追加草稿复核

Root 后续提供已修 metadata 审查点的私有 `BomberContactImmutableV14CompatibilityQualificationTests.cs.draft`，SHA **ff28567a450c761f0a69e26bc749e345c6960a9de6d06404fbcf0ef573deb5bc**。**静态接受 Root 发布此测试候选并真实执行/冻结 v14 executor**。初稿9f624…缺独立 metadata pin，已保留 before-metadata-review，当前稿修复：

- 原 original.lwm 固定 SHA **6a0e5a671cdb89a003c4567ccefa9534481c0fcd48e147b10c583d8aabd755a8** /21,487B；原 metadata 固定 **d9512037e1f85c11775ced7271a31ceb970e6947bcf67b9789b00060d25fb573**。
- 原 captureGame **78b1a0ec5ad12867da0e78757db7414d70c61e8e9fc72e48e7a60d4ea803626e** 与兼容 readerGame **61ffd66564c634a13b173a04af4eefcd212e1305da41d27d07675de1f13b5e55** 独立核对；Runtime **aa5520f37e22eb6337d4e9e5c33008684bb7fd51e598dad38ef404351dddbd49** 固定。没有伪称 reader 就是原 capture Game。
- metadata 先 hash 后解析；31个唯一 export 路径与实际递归文件集合相等，每个文件 hash 验证；cap5 typed 结构、官方 Restore→Capture 整 World byte equality 及原 World/metadata/export 前后保留断言均存在。独立只读审计确认实际原件与31个文件 drift0，测试 Restore 本轮未运行。

Root binary-inventory SHA **8184db4df0dd62471d36df61aaf6e9909c17a464b53e1c2e51b5966b2641a1c8** 的290个程序集/102个不同 hash/零78b1匹配已核数据。**原 captureGame78b1 完整 executor 仍未找回，exact original-release qualifier 保持未执行/不可满足现有 reader 身份；compatible v14 reader 的成功不能改名为 recovered original release。** 可以把独立 compatible-reader 资格作为精确标明双身份的额外正证据，保留原 snapshot 原件、原 captured metadata/exports、原 exact qualifier 不放宽，并把当前 v14 cap5 executor/source/generated/SDK/config/test output 整体冻结。在该旧 executor 内运行原 cap5 Fact；新v15中不得删/skip旧断言掩盖分支丢失。

## 尚未执行的门

正式 v15 DECL/GEN、真实 source/generated byte acceptance、schema 工具全集与 CLI Git baseline/required snapshots；new release3/raw+whole oldWorld strict negative、actual selectedcapacity positive、storage2；immutable exact old qualification1；compatible v14 qualification1 的真实 Restore；actual traversal/region/paired restore 正负、Unknown/死亡/expiry/round/cohort/actual costs 与固定预算测量均 **UNRUN**。whole oldWorld negative 还需真正证明异常在 typed RestorePersist 且早于 OnHydrate，不以一般异常或前置 Effect 注册失败冒充。

本审查没有选择 Contact52，没有填 V15_REVIEW，没有批准 breaking release，没有将测试模板或纯工具绿色归为正式 Gameplay/admission/GAS/Native 成功。先修上述 P1 私有闭包并非作者复审，再进入 Root 唯一正式发布/GEN 窗口。
