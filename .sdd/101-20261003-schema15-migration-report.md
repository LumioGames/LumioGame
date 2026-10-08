# v15 traversal / Favorite region 身份与迁移私有交回

2026-10-03，fresh schema implementer。**PRIVATE READY / STOP，等待非作者审查。** 只写 .run/schema15-migration-draft-01/ 和本报告。没有写物理 Tools、Gameplay、Table、Reader、DECL、generated、Engine或Runtime，没有 build、GEN、配置编译器、Native、format、commit 或实际 readObservation。

读取父仓核心、导航、repository-architecture、testing，101核心、导航、testing，六份完整身份工具，Compatibility全目录，traversal两份计划和manifest，Favorite plan / declaration manifest / behavior draft-03，以及Root10112/10124历史分配审计。使用workflow:test-driven-development方法：私有纯模型的新合法10112用例先在现有模型真实失败，再运行私有模型。Root的Reset4 RED44、Favorite1 GREEN41、Region1 RED41均是Root证据，本作者没有运行或重新归类。

## 实际冻结线

input-fence.before.json / input-fence.after.json包含六份实际Tools与Compatibility全67文件，共73项完整SHA256。结束比较 **73/73 unchanged**。predecessor-audit.json逐份识别真实ledger、认证退休页，并保留所有其他opaque evidence的原字节哈希。

| 项目 | 实际值 |
|---|---|
| 当前ledger SHA256 | d3bca141e0a1f777892ba6c6e7e155dfc5842ddaf09ca5eea1857184c41dcb7f |
| 当前schema | bomber-v14-m2-bounded-producers-candidate |
| 当前active / retired / pages | 765 / 8423 / 36 |
| 历史ledger Engine | 0e2fc74783f9f186d59909b38d4ee70887a21137 |
| 历史ledger Runtime | 23356eafc365c753b6e8d9987fd069815ff067ce |
| 正式07 manifest | 652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04 |
| 正式07 version | 0.0.5-main.0e2fc74 |
| 正式07 SDK | 93d8ec4731f39726294cc92ac5eb1e643aab9693d9a2f8c6f24bc24b16539ea1 |
| 正式07 Runtime | d8ae3da3793d5d95785606be319668a4318af85a |
| 正式07 config author | a991a517f9dbae255321c25d65fea0bfdfdca42f |

实际读取器仍pin较早06 manifest/SDK和过时reducer/generated body；这是既有审计读取器与当前构建不一致的缺口。原历史字节不能retrorewrite成07来源。私有读取器换用真实07 package pin，但未来v15 generated SHA不能凭模板猜，正式body审查门保持关闭。

## 完整工具提案

proposal/是完整可审阅源码，目标均为101 Tools。

- schema-identity-model.mjs：新独立名称 bomber-v15-traversal-favorite-regions-candidate；容器ordinal/capacity与历史路径仍严格校验；仅exact10112型、16参数、finite-ta、duration1、empty contributions/writes可以成为新有限效果。
- schema-identity-read.mjs：真实07 package pin；closed Effect set加入10112；继续逐项核对声明、两端字段binding/hook/codec/完整RestorePersist branch、容量元数据、slots、events、unmatched files。10112证据显式含producer、CanSettle、reducer、Awake作者源。
- schema-identity-v15-evidence.mjs：固定完整authored source路径集和两端32份Effect生成输出路径集。V15_REVIEW=null；正式观察抛v15_review_required / exit2。只有accepted-nonauthor、精确路径和完整SHA256 closure可开启；额外/缺少路径或失配字节均失败。
- schema-identity-traversal-regions-migration.mjs：精确v14 predecessor SHA与765/8423/36校验；原页descriptor和字节完整保留；追加每条旧active完整shape/evidence，引用新的immutable predecessor snapshot；breaking v14→v15 transition。
- schema-identity-local-history.mjs：只新增必读Gameplay/Compatibility/schema-identities.before-traversal-favorite-regions.json的当前v14 SHA，旧独立历史资格全部保留。
- schema-identity-history.mjs / schema-identity-storage.mjs：实际原文件逐字复制，逻辑不改。Git blob、authenticated页和固定8MiB输入/index预算保持。

迁移纯函数接收实际observed.identities，不硬编码active新数量或ContactedChests新max。Root以后选定并由正式GEN观察的新max将作为原字段新shape继承，旧shape退休。当前物理cap5；52未选。测试中的53仅验证函数不会偷选52，**不是产品候选容量**。

这是审计账本迁移，不是WorldSnapshot业务转换。旧数据不能可靠补造冻结几何、Region finite handle和Native状态。破坏性发布必须使用不同 **GameReleaseId**；transition仍releaseDecision:null、freezeEligible:false，不能宣称发布已批准。私有文件位置自身禁止--apply；只有Root将审查后工具置入正式101 Tools才可apply。immutable冲突、目标并发字节、staging rename及模型/历史/观察读回校验保留。

## 实际支持的shape变化

layout-audit.json来自作者草案，经真实parseComponent语法解析，**不是GEN输出**。

| 来源 | 精确变化 |
|---|---|
| BomberBombState | TraversalOriginX/Z/Power：Persist、Server/None、int、默认−1；TraversalArms：Persist、Server/None、SyncList<int>、max4。 |
| BomberFireZoneState | 新11个Persist字段ordinal13–23；旧13个ordinal保持；SourceLife/SourceLifeGeneration/SourceMatchId/SourceChainId/CoverageMask五列None→Aoi；新RegionCoverage为Aoi，其余新列None。 |
| BomberFireZoneEntity | 原slot0–3保持，尾加AttributeComponent4、EffectComponent5；没有新增公共Native槽位。 |
| Effect10112 | BomberFireZoneLifetimeEffect。Duration1 ulong、Fx2 string32、Participant3/Life4/Zone11 full NetEntityId；Generation5/MatchId6/ChainId7/AuraWorld8/AuraInstance9/BirthTick16 ulong；仅AuraGeneration10 uint；Ordinal12/X13/Z14/Mask15 int。 |
| ReducerMapping10124 | 独立于EffectType命名空间。UntilTick1/LifetimeOutcome2由Root审计分配；完整作者与生成body进入byte closure，不虚构模型不支持的reducer identity kind。 |
| Typed events | fire_region_born / fire_region_expired，record FireRegionBorn / FireRegionExpired；full region、原BomberActor、skill/level/chain、center/mask/from/until。通用事件reader核对实际record/catalog，不编造历史事件。 |

生成器scalar先于container排序：BomberBombState旧scalar0–29保持，新scalar30–32；**旧10个容器ordinal整体+3**，新fixed4位于43。源码尾追加不能保证所有旧ordinal不变；v15必须退休完整v14旧shape。正式GEN须复核排序与客户端列。

模型没有扩大旧有限effect类型/参数白名单。10111唯一Favorite7 bool保持。新增uint payload只准exact10112 AuraGeneration10，所有16列名称、顺序、type、bound同时核对。Region新uint仍走现有checked uint RestorePersist。

调用对应已读：10112仅BomberFavoriteFireZones.Published的Effects.Apply；启动为attached region protected Awake；CanSettle委托同owner；actual finite row用生成codec Decode；10124核对actual result fullhandle/source/Initial/Terminal；新事件来自实际Initial及Expired+Native动作。原10107/10108/10109/10111声明不改。behavior作者catalog44→46仍为私有，正式数量未观察。完整行为仍须非作者review和Native执行，byte pin不替代业务证明。

## 工具测试与旧保存资格

作者轻量工具执行：

1. 新schema15-contract.test.mjs在旧物理模型：total4/pass3/fail1。合法10112/v15被invalid_shape + invalid_schema拒绝，失败原因符合模型缺失。
2. 私有模型同组total4/pass4/fail0/skipped0。覆盖合法唯一10112、uint移列、伪新ID、名字/顺序/duration错位拒绝。
3. 私有schema15-migration.test.mjs：total6/pass6/fail0/skipped0。覆盖旧36页+765完整旧行、确定性、实际observation capacity继承、predecessor/page篡改拒绝、全部snapshot历史closure、缺正式review证据拒绝。synthetic observation明确test-only，不能作实际GEN。
4. synthetic迁移retired9188/pages39；旧36页descriptor完整相同；历史校验通过固定8MiB index预算。512-byte precharge、8MiB输入/index、1MiB blob、64MiB World record均未提高。

初次migration synthetic fixture沿用旧external Runtime，compareObserved正确报错；修正fixture为07后绿，没有削弱provenance检查。capture先遇到非ledger汇总JSON和UTF16 opaque证据，现按真实ledger形状读取、opaque只保留原hash。Windows python aliases不可用，采用已有py -3.12成功，未安装依赖。这些是作者工具前检失败，不是玩法RED。

以下全部 **PRIVATE / C#或正式observation UNRUN**：

- schema-identity-v15-generated.test.mjs.draft：4个Root-only正式观察测试，验证persist/sync、exact10112/10124、slots/events及真正byte substitution拒绝。
- BomberContactV15ReleaseBoundaryTests.cs.draft：3 Fact，读Root实际所选capacity（前置>5）；旧canonical raw经真实typed container拒绝；整个immutable旧World以exact bad_delta_envelope拒绝；新actual full contacts world官方capture/restore逐字相等，不改canonical payload。
- BomberContactV15StorageCohortTests.cs.draft：原storage2两profile输入，改读actual selectedcapacity。只证明结构storage；裸旧line wall RegionCoverage=false，不提供finite10112区域、真实traversal/pending terrain、全finite共存证据。固定profile是否与新config作者输出相容由Root复核，前置失败不能算storage成功。
- BomberContactImmutableOldReleaseQualificationTests.cs.draft：额外正资格，loaded Game/Runtime SHA必须等于原artifact actual.json，旧cap5官方Restore/capture逐字相等。必须oldGame executor，不能在v15下删/skip旧断言。

原 .run/resource-chest-budget-formal-formula-draft-01/release3和storage2全原样保留；本目录before另存原字节副本。物理BomberContactOldWorldSnapshotTests原Fact不改，BoundedObjectStorageTests原旧5断言不删不skip。Root已有old资格是07、Game78b1a0ec5ad12867da0e78757db7414d70c61e8e9fc72e48e7a60d4ea803626e、Ecsaa5520f37e22eb6337d4e9e5c33008684bb7fd51e598dad38ef404351dddbd49，证据在games/101-bomber/.run/v14-fullpack07-native-20261003/contact-old-cap5-world-baseline-01.json，本作者只读。Root须保存oldGame/generated/SDK/test executor和原config/export/World bytes，继续运行原旧5Fact；新Game重建payload不算原资格。

whole oldWorld拒绝还要求Root证明真实异常发生于typed RestorePersist、早于OnHydrate，保留stack/执行阶段证据。本作者没有运行恢复、添加生产test-only hook或宣称该顺序已测。

## Root正式顺序

1. 非作者review私有Tools、完整traversal callsite、Favorite owner/reducer/events及原旧资格保存方案，冻结accepted作者源和v14ledger，保留所有真正业务RED和旧tests。
2. 确定distinct GameReleaseId / oldWorld strict拒绝策略。52待actual tight traversal完整证明；若未选max，v15实际observation仍为5，扩容release/storage测试候选不发布运行。
3. Root唯一串行窗口发布审查后声明/行为及选择后的实际capacity，用07正式generator生成server/client，不手写generated，不从草案猜SHA。
4. 非作者审查实际ordinal、各列Persist/sync/inverse/checked uint、capacity、codec registry/reducers/program plans、guard/callsite和真实成本，把完整true bytes输入V15_REVIEW。schema checker此前必须清晰失败，不能绕过或宽松放行。
5. 发布审查后Tools；只观察真正GEN。当前v14保存为新immutable snapshot后迁移；确认旧36页和全部67旧文件原字节，9188退休行及实际新active observation精确一致。新snapshot/三页为追加，旧06和全部旧history不retrorewrite。
6. Root运行4个正式generated测试、既有Schema工具全集及CLI独立Gitbaseline+required snapshots，报告非零total/passed/failed/skipped。旧版本定死v14计数/shape的资格测试按原历史输入运行，新测试验当前v15，不删除旧测试隐藏分支丢失。
7. 保存old executor原旧5正资格，执行newrelease raw+whole oldSnapshot exact negative、actual selectedcapacity capture positive。然后真Native traversal/region/paired restore正负、Unknown/来源死亡/expiry/round等待、actual共存cohort，以及实际blob/record/index测量。公共上限不变；effect/config/Native前置失败独立诊断。

完整before/after与proposal SHA、layout和文件清单在私有manifest.json。工具纯函数绿只证明审计算法和历史预算。正式v15身份/GEN、生产修复、snapshot边界、Contact容量和全玩法验收仍未完成。作者在此STOP，等待非作者review。
