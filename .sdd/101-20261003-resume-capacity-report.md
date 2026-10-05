# Schema v12 与特殊炸弹恢复交回

本报告记录实际证据，持续更新。Root负责独审及全局完成判定。

## 当前切片

- 复用既有v12、button、Pierce、普通容量成果；未reset、clean或一概暂存。
- 正式消费complete-release-06，manifest `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`；新Gameplay构建的cache、locks、artifacts隔离在 `.run/resume-capacity-20261003/`。
- 普通total-capacity冻结仍为原包04：`.run/special-bombs/total-capacity-freeze-01/manifest.json`，不能以包06重新标记历史。

## Schema v12

本切片完成的v12为 `bomber-v12-button-canonical-attributes-candidate`，667 active / 7076 retired / 30页；前27页描述符和内容原样保留，固定8MiB没有提高。其后新增声明进入v13，下面的v12精确冻结保持历史原字节。

独立官方生成：`.run/resume-capacity-20261003/generated-proof.json`，包06GenDeclarations，两端98文件逐字节一致，exit0；只生成到独立目录。首次build仅旧Remote测试缺Ecs using，补齐后真实包06构建0 warning/error。

发现并修复测试前置，未放宽生产校验：

1. B161跨kind负例选择了旧schema退休scalar，却把replacement指向新ability6，故按missing_replacement拒绝；改为选择本schema destination的scalar，实际RED→GREEN 1/1。
2. 旧测试history-inputs固定的是v11（6415 retired/27页）；CLI夹具与当前v12大数组deepEqual触发巨型差异输出和RangeError。新建独立只读v12历史并保留旧目录，增加完整ledger hash前置后仍保留完整deepEqual。第二全量CLI全部GREEN，147/146/1；唯一storage断言仍是旧6415。已更新为精确7076/31物理manifest+pages。

第三全量 `schema-full-03`：147 total / 147 pass / 0 fail / 0 skip / 0 cancelled，exit0，日志SHA256 `7cab07e8ae47e100caaf796fab76d76892a98125152c1e2f698c539c1c280bdf`。精确冻结 `.run/resume-capacity-20261003/schema-freeze-01/manifest.json`，312文件，manifest SHA256 `19dfc3265772d9ef30036df5419b73c4289f94aa74109442e97ac8df2d32e462`；ledger SHA256 `d24840c4b9a7b7552f6b61e01d849543f81b7a4f8319415bf3f322c0e2043314`。冻结包含官方06消费的观察源字节，不以本地不同包Engine检出替代。

## Remote

保留真实RPC/GAS/Native RED。`.run/resume-capacity-20261003/remote-red-04.json`：12 total / 10 succeeded / 2 failed / 0 skipped。有效失败是8秒fallback仍为42Tick（应160Tick），以及实际猫闪现成功但未引爆自己的Remote。

真实输入前置已修正：外层connection sequence必须连续1起；直接GAS Place使用过内部ability sequence，测试允许内部sequence独立101起。外层使用100会被Runtime拒绝，不能当功能失败。新增换槽捕获模式及旧Match/Life、死亡相、关闭相、真实finite freeze边界；有效RED其余10项已通过。

最小生产修复：Remote放置从正式技能level读取8000ms；猫实际成功blink且当前槽Remote后才引爆本Participant的Fuse。`remote-build-green-02` 0 warning/error、exit0；原输入矩阵12项全部GREEN。新增实际死亡/真实后继转移第13项仍RED，`remote-death-diagnostic-02`：13 total / 12 succeeded / 1 failed / 0 skipped，exit1；旧Life已实际destroy，后继restore=1而transfer未Applied，状态phase=2 / pending=true / eligible=true / slot=1，未当作通过。正在打印实际Outbox结果原因，未放宽测试。

Remote修复不改公开schema形状，仅active ability2源码证据更新；退休历史全保留。更新后ledger SHA256 `97abc333647fed9ada2654d68146bdf93e54691308240edb674067c7c5b7db44`，validateLedger / compareHistory / compareObserved均零错误，真实完整Git历史CLI bootstrap exit0，证据 `remote-active-evidence.json` / `remote-schema-cli-exit.json`。原v12 freeze仍为修复前精确历史，不覆盖。

真实后继原因已定位到Outbox：`remote-death-reason-01`，Request1在Tick6/revision26 Applied；Transfer2..21全部Refused/NotApplied/Backpressure，Code=`successor_capacity`。独立Runtime worker调查此真实拒绝分支，Remote第13项保持RED，不以修改测试槽位或跳过转移当作通过。

## Schema v13持久炸弹承诺

v13 `bomber-v13-durable-bomb-promises-candidate`新增13个身份：Bomb的FutureChildren/SubmittedMask/ResolvedMask/ChildDirection/PromiseToken五个私有持久字段，World的BarrelBombPromises，BarrelState及其三个私有字段，桶实体wire/alias/component-slot。官方complete06两端生成 `v13-generation.json`，两端各52文件（含gen.hash），0失败。active680 / retired7743 / 33页；v12全部667 active按原形状退休，前30页原样保留。精确前置 `schema-identities.before-bomb-promises.json` SHA256=`97abc333647fed9ada2654d68146bdf93e54691308240edb674067c7c5b7db44`，当前ledger SHA256=`0a15a9e69cff29c83915493472c7583977a585f3e850548ad49adfee48ca7e36`。

新增历史真的触及固定8MiB退休索引，未提高8MiB或降低512字节预收费：历史比较先完整认证所有退休行的整行hash，释放该索引后，再完整认证所需的前active版本/身份hash。每一历史行仍被检查；旧页、Pascal墓碑、退休原因/evidence/replacement全保留。`promises-storage-green-01`真实31/31、0skip/cancelled、exit0，日志SHA256=`ecc3d2c21cb2a3d8818072594c3c19731568e40a1111d3206c92a3423e434be9`。

新桶实体让绑定entityIndex变更，Bomb新scalars令后续containers ordinals加5，World新scalar令后续container加1。`v13-plan-review.json`逐项验证原483字段到490字段只有上述预期布局变化，九个Effect schema和三个Reducer主体/限制保持原语义，然后更新准确生成字节pin。所有源Effect声明pin未变。

首次完整18文件 `v13-schema-full-01`：152 total /150 pass /2 fail /0 skipped/cancelled。两失败均旧测试前置：hitParticipants仍断言旧ordinal25，及类型变更负例选中了新桶UInt64 scalar而把它再次设为UInt64。已修正为精确ordinal30和确定Int32→UInt64的真实负例。第二次完整 `v13-schema-full-02`：152/152、0fail/skip/cancelled、exit0，日志SHA256=`b3e83c271482e33ece1a36e14b0fca02ddbd7efbe475a712259a735084f5a0e1`。

串行private官方独立生成 `generated-proof-v13.json`：两端102个文件（不计两个gen.hash）逐字节零漂移。精确冻结 `schema-v13-freeze-01/manifest.json`：328文件，manifest SHA256=`54d2b322f9263492fed380deaadedbac80ff67b1dc2dbd19507839a935a960fa`。v12冻结、旧历史页、所有原证据未覆盖。冻结完成已通知Root；v14未生成。

## Split与通用预留

保留真实Native RED `split-red-01`：3 failed/0skip。生产母弹在放置结构提交前预留1+4 credit；FutureChildren、SubmittedMask和ResolvedMask是持久真值，服务只保留未知/未发布EntityOrder。同Tick新母弹、普通弹、地形承诺共用硬上限；`CreateFromPromise(World,string)`是原承诺转移，未知发布不重试、不超时回收。

子弹只在母弹所有原地形回执/continuations完成后按实际Reach端点发布，500ms/Power1/Standard，继承完整Participant/Life/generation/chain，HitFamily归母弹；发布才归还对应future credit。母弹持有共享Effect/箱命中记忆直到所有子弹及待结算事实退场；子弹不返普通库存、不可踢，水面经Native HFSM熄灭。`split-build-green-01`官方06独立build0warning/error；`split-green-02`真实3/3、0skip、exit0，四终点、阻挡臂、母子共享一次实际伤害及母体退休通过。

`split-green-01`3项在config启动前失败：协作桶作者曾启用barrel而正式预算守卫正确拒绝。桶作者恢复默认disabled并官方导出后，未改测试或守卫的同DLL `split-green-02`通过。扩充矩阵 `split-matrix-03` 为11/11、0skip、exit0：包括实际water/nokick、Native原回执长期withheld+runtime hydrate、paired restore、五种损坏持久承诺。早期矩阵的fixture错误保留原日志：结构发布后须两Tick才发生实际爆炸；地形探测缓存与测试直接改Native需跨Tick；实体销毁后Component.Entity会脱离，journal断言须保存原完整ID。未因这些fixture失败修改生产逻辑。

`future-capacity-01`：3/3、0skip、exit0，真实live+unpublished+paired restore旧边界及同Tick556个未发布5-credit Split订单+4个普通订单封顶，拒绝额外5/1credit。官方06 `fire-red-freeze-build-01` 0warning/error。

新增 `promise-ownership-red-01` 四项真实RED，4failed/0skip：没有真实持久owner的任意token仍可免费建弹、已发布/resolved的token重花、实际子弹改chain、实际两个子弹认同方向均未拒绝。已最小实现校验，但尚待下一串行窗口验证，不宣称GREEN。CreateFromPromise必须以Split母体字段或桶持久记录证明原承诺，临时服务不能作恢复真值。

桶生产与Promise真实实现由barrel_production负责，现已提供ReservedCount/HasSubmittedPromise/ObservePublished真实接缝；具体桶证据以其报告为准。Split桶形态承诺需5credit，发布转母弹1+future4。Fire、桶/狂暴综合预算及正式准入仍未完成，Fire/Split/M2正式守卫保持。普通total容量历史包04冻结未改标为06。

## Fire与狂暴真实RED

`fire-native-red-03`最终测试2failed/0skip、exit1：实际kind2炸弹经Native DangerElapsed后原完整ID提前销毁，既未进入1.5秒Burn，也不能维持连续1秒烧灼。旧 `fire-native-red-01` 为销毁后读Component触发detached错误，是无效功能RED；第二、第三次改为先检查真实实体并保存发布后的完整ID，保留原失败日志，不将其标GREEN。Fire正式守卫仍关闭。

Frenzy worker只新增测试、尚无新声明/生产实现时，`frenzy-native-red-01` 2failed/0skip、exit1：受伤者实际health仍4而应6，满血者的zero-point Applied结算后糖仍存在。已交回Frenzy worker和Root，不将这两项失败算作交付。下一v14须统一Fire、Supply、Frenzy、Bridge及私有16人固定容器依赖生成；上游公共ReservedSlot wire仍不在本切片授权内。

## v14 闭名单与当前未验证候选

Root 已审定并核对实际闭名单：77 个新 Persist 字段（Fire56、Supply5、Frenzy6、Regen/Bridge10）、58 个既有私有容器固定上界修改（16 人、两局32结果）、Bridge component/entity、Effect10110/10111。声明尾追加，历史 ordinals 通过完整退休保存；上游公共 ReservedSlot wire 未改。v14 声明冻结 `v14-declaration-freeze-01/manifest.json` 共14文件，SHA256=`5b8115bead94a5b2dd43716d4aea3e9b8481c00639c4addba82abd0075005345`。精确前置 before-m2-producers 是完整 v13 ledger，SHA256=`0a15a9e69cff29c83915493472c7583977a585f3e850548ad49adfee48ca7e36`。当前未运行 v14 官方生成，未写主 ledger；等待 Root 串行 heavy 窗口。

Reader 单独真实失败后修复混合 Skill scalar/fact row 和 Supply signed -1 default，`v14-reader-red-01` 2fail/1pass → `v14-reader-green-01` 3/3、0skip。M2 migration工具独立3/3验证 exact v13 前置、保留33旧页和680行完整退休，未 apply。长期 v13 测试转为认证不可变 before-m2 身份；旧 v13 官方冻结另复核2/2（`v13-frozen-audit-01`），不要求常规测试依赖 .run。

未编译 Fire 候选已实现 kind2 原弹 Native Burn、单一连续暴露时钟、单 pending 10110 真实 Effect/fact、稳定来源排序/归因和消费 journaling。Aura/trail/冰桥熔化仍未实施。新 Fire reducer 与 outcome After 元数据是下一 schema 候选；outcome 目前仍只识别10101死亡，**不算 Fire 致死通过**。新增 `BomberFireExposureReviewTests` 7 cases（覆盖空窗、真实 finite Bubble、paired restore 连续计时、真正致死屏障、3种暴露 owner/clock 损坏），尚未构建或运行。

新增 `BomberFireAuraNativeTests` 5 cases（真实 finite row Applied/投影CD与保护解除、错Participant/Match拒绝、实际 Aura 一秒 pulse、paired真实handle重绑与到期）。请求关联直接 fixture staging，明确不当作已开放 public skill producer；目前未 build/run，Aura CanSettle/helper 尚未实现。另新增 `BomberFrenzyBarrelIntegrationTests` 1 case：actual GAS ActivatePlace→真实 Native 桶 dig→派生 Frenzy 继承与自免；当前 Barrel typed record/producer 未保存/继承该标记，待真正 RED 后修。

Frenzy worker 已写生产 helper 和 Place/Inventory/Health 窄接缝；capacity 已接其真实 ReservedCount/HasSubmittedPromise/ObservePublished、Bomb/Participant hydrate、自免和不返普通库存。所有这些修改尚未构建，不将 prior GREEN 当成新候选证据。

发现新增恢复重放缺口：现两参数 CreateFromPromise 以 submitted durable owner 校验，service Held 只防当前进程重复；fresh restore 的 submitted-unknown owner 仍可再次调用 API。Root 批准三参数原子转账（先验证真实 unsubmitted owner → callback持久mark →复核submitted →唯一结构提交）；要求先跑新的 RED 再实施。已新增 `BomberBombPromiseReplayTests` 3 Fact，Split/Barrel/Frenzy 均 paired restore 后直接重放，要求拒绝、信用保留、原 snapshot 逐字不变；unknown structural 标记明确是 owner-state fixture，Barrel Native Applied provenance 真走原地形 dig。生产原子接口尚未改，等待窗口先跑 RED。

配置尚需协调：Damage24+Health25+Fire26=75 是列表总数，不能直接当成 SettlementFactFields 所需数量。Root 核对 exact06 FreezeCore 按全部 fact 的 non-status columns 组成全局 HashSet；三域先扣各 status 得72，但仍须官方生成后按实际 storage 精确去重计算。只读 `effect-operation-budgets` helper/tests 3/3，按实际 global field index 去重、排 status、解析每个 reducer binding，现 v13 精确47。64 暂不改，启动预算 RED 单列，不冒作 replay/Supply 功能 RED。旧 reducer 合计 Writes5975、Work3M 已近现6000/3M预算，新 Fire reducer 需官方实际 plan 计算整个集合，不能只提高 fact 上界。Outcome 保守式26P+7（death11 +AppliedRestore7 +RestoreResult5 +final elimination3/world7），8人215、私有16人423；仍未提高现215。完整 finite Aura rows 和综合 M2 对象预算须另外证明。全部正式守卫保持关闭。

### v14 official generation first diagnostics (2026-10-03)

Root released the Native heavy window and authorized generation/schema/drift/budget auditing only; no C# build or budget/atomic replay/Barrel production fix was performed. The 14-file closed declaration freeze still matches exactly (77 new Persist fields and 58 private bounds). New Native test inputs are frozen in games/101-bomber/.run/resume-capacity-20261003/v14-new-tests-freeze-01/manifest.json (SHA256 aba2cd89260a624690961cb1f71aec4490443e28a00f02a05edd14098d646e7d): 16 cases with prospective 12 failures, not an actual RED run.

Official generator attempts v14-generate-server.log / v14-generate-02-server.log / v14-generate-03-server.log / v14-generate-04-server.log fail in fact callback verification before successful output. Exact source verification shows official FactInspectionStubs allow GetBase(literal).Value, HasActiveEffect and World.Tick, but not GetBaseValue, World.IsServer or GameplayConfig casts. The SDK itself does expose GetBaseValue; the restriction is specifically the generator's typed callback verifier. Burn callback was changed to equivalent GetBase("HealthPoints").Value and direct actual EffectComponent.HasActiveEffect(10107u, world.Tick), matching the already generated explosion callback. Frenzy Heal callback's same GetBaseValue call was changed equivalently. Remaining Conversion diagnostic is its BomberConfigBinding.For/IsActive config path. Root was asked to approve keeping Enabled admission in actual Pickup/Submit business while settlement uses the exact persisted FrenzyLife/Until scalar condition. Ledger remains v13 and no v14 identity migration has been applied.

### v14 Participant FireFacts 替代与实际生成审计（2026-10-03）

原 mixed Skill scalar/fact row 声明被官方06生成器真实拒绝，合同调查区分公开显式 row-columns 语义与当前 whole-component 收集限制；未改 Runtime 合同或 Player Native 槽。Root 批准最小完整 Game 替代：Skill 保留23个 exposure/Aura标量，26个 cap-1 Fire事实列移至新 BomberFireFacts，并尾追加到现有 Participant 实体。Owner 为真实受害 Participant，Target/Life为完整旧身体，Source为真实Bomb/Aura Life/Zone；10101/DamageFacts声明不改，Outcome10110致死仍待实际RED。

原冻结01、失败冻结02和各次生成失败均保留。冻结02中遗留 Skill EffectRow 标记是 capacity 自动换行替换遗漏，已承认并移除；没有以生成成功假称原声明支持。当前16文件声明冻结03 SHA256=`794d58ed7a97d213fb0ffca103926383082191496d64eb3e2ecfeae7fe488231`，77新Persist字段和58私有容器边界不变，新增 FireFacts component + Participant slot 两identity，预期活动身份765。原16 Native用例仅两处事实查找改为实际Participant，动作/断言保持；新测试冻结02 SHA256=`acc8e9e0402b5481801b68e3b587e01318d05afa1570eb5b83fe76d57a483743`，16cases/预期12fail，actualRun=false，不是实际RED。

`v14-generation-09.json` 官方双端成功，each57文件含gen.hash；`generated-proof-v14.json` 独立第二生成112文件逐字节零漂移（不计gen.hash）。官方 actual plan 两端 SHA256=`46b284e18cd2990239753164764f6a1083bbf443d4123b3269a1bc27a8f3eb7c`。实际 Participant managed count7，Native bound slots1..6共6，≤8；FireFacts实际layout为Participant slot6，native10123、26字段，Status10123/1唯一；旧 Player.Has原字节不变。证据 `v14-native-slot-proof.json`。独立 registry_bounds_review 已复核这些实际产物和14条pins，无源码修改或编译。

`v14-plan-review.json` 完整核对490→560物理storage fields（77持久新增中7个string不在该operation scalar registry），实际changedBounds57（58授权边界中的Results string-list同样不在operation registry）。旧9Effect schema及旧3Reducer主体/限额语义保持，只有批准的layout/global索引、私有Aura/Protected两Native field bindings及After依赖变化。实际全局non-status factFields去重=72，maxvalue16；Damage24/cap16、Fire26/cap1、Health25/cap1。合计writes7775、indexedWrites7560、writeBytes372340、work4000000，scratch取max22576，ReducerFields99。当前Config常数仍6000/3M/64，未提前提高；须下一真实startup RED再窄调整。Outcome215只对应旧8人保守26P+7；16人保守423及可达互斥矩阵未证明，10110 death未接入，不能算火致死或正式M2预算通过。

实际迁移首次拒绝10111 Aura形状：模型尚未收录finite10111及Favorite bool7；旧主ledger未写。窄补exact Aura class/id/finite timing和该单一bool字段，保留wrong owner/policy/type及其他旧finite不得接受Favorite的负例；finite8/8、0skip。迁移apply-02成功：765active/8423retired/36pages，前33页描述符与原字节保留、680个原active完整退休，固定8MiB不变。主ledger SHA256=`d3bca141e0a1f777892ba6c6e7e155dfc5842ddaf09ca5eea1857184c41dcb7f`，不可变before-m2保持v13 SHA256=`0a15a9e69cff29c83915493472c7583977a585f3e850548ad49adfee48ca7e36`。

首次迁移shell未在native exit1时短路，后续history preparation错误读取旧v13；该旧输入 `history-v14-inputs.json` 原样保留，禁止用于正式完整回归。成功迁移后另建 `history-v14-inputs-02.json` 及独立Git夹具，不覆盖先前证据。完整Schema首轮按迁移后actual765启动，发现旧9Effects、Bomb命中ordinal30/cap8和遗漏before-m2固定历史输入清单等测试前置；将保留完整首失败并精确修正，完整GREEN与freeze尚待下文追加。本窗口没有C#构建或原子回放/Barrel review生产修复。

### v14 完整 GREEN、幂等与精确冻结

`v14-schema-full-01` 首轮20文件完整162 total /155 pass /7 fail /0 skip/cancel，exit1，log SHA256=`c621d2067bd86a9eb549d98e95b93a13cb2edcc86e4443d475ad97db86cb7739`。七项失败明细核实为3个旧Effect/容器精确断言及4个固定历史/CLI夹具遗漏（before-m2原字节）；保留原日志。窄更新为11 Effects、Bomb.hitParticipants ordinal31/cap16，并把不可变v13 before-m2及其exact SHA加入LOCAL_HISTORY_SNAPSHOTS，未放宽校验或绕过负例。

`v14-schema-full-02` 完整20文件：162/162，0fail/skip/cancel，exit0；log SHA256=`a318ae29ae6c40e800bf54c8c28273bf5b9e43a62f89f251ffa1206231937be6`。包括完整bootstrap原历史127 blobs、新不可变baseline及每页认证、CLI源码/生成物/墓碑删除与改写负例、input-change/固定8MiB与独立索引边界。第二轮负例完整执行，310040ms；首轮提前失败缩短耗时，不以两轮时长差推断优化。

`v14-migration-idempotent-01.log` 再次真实--apply exit0且manifest仍 `d3bca141e0a1f777892ba6c6e7e155dfc5842ddaf09ca5eea1857184c41dcb7f`；没有改写33旧页或新的3页。`v14-budget-helper-01.log` 3/3，0skip，按实际official生成storage逐项解析所有binding，仍仅报告预算需求。

最终精确冻结 `games/101-bomber/.run/resume-capacity-20261003/schema-v14-freeze-01/manifest.json`：359文件，SHA256=`f7be3c8f8c4887fbf31388e4088b66072e22e0ddc723871be9d3b5b51f72f8eb`。包含实际Gameplay source/双端产物、schema工具、budget reader、所有兼容前置/退休页、06消费manifest/SDK字节和上述证据hash；先完整认证所有历史，再逐项验证decl freeze03和16 Native test freeze02仍原字节。原v12/v13精确冻结保持。

生成 exact identity：complete06 release manifest=`8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`；SDK=`0.0.4-main.0e2fc74`，GenDeclarations.dll SHA256=`053d2fcbfd1ee062dd18ea86c30c51690b7cb44ecf7b79e0e2373602fe1cd537`；生成器来自隔离fullpack06-game nuget cache，二次private官方生成112文件drift0。本窗口全部工具进程结束，已明确把HEAVY交回Root供隔离serverbuild/真实Native测试。生产验证、10110death、16人Outcome、完整对象预算、原子未知重放及正式准入仍未完成；freezeEligible与productionVerified保持false。

### 构建接续窄编译修复（Root build-01 后）

Root新隔离真实build-01：exit1/0warning/1error，BomberFrenzy.Server.cs241 使用foreach但实际SyncList<string>不提供GetEnumerator。Root授权后，capacity仅把Read循环改为Count/index访问并读取同一encoded值；原count/UTF8/JSON/duplicate token/ValidateRow逻辑逐字不变。与schema-v14-freeze-01原源的no-index diff仅循环和局部读取两行。旧helper SHA=`d35b6715f48626828f2b7658f532a68e5f4ec5540ec23b7e079cc021ba4eac55`，新helper SHA=`4a2c74b956b70067e9c5242341e292fdfc70bdc0f604d804c1035982a4546c80`。未改声明、生成物、测试或预算常数；原v14冻结保留，未自行build。Source fence恢复，Root将新label build-02验证。此时真实Native RED尚未到达。

### Root build-02 后测试 API 窄修复

Root build-02生产已通过，但test工程真实23error/0warning，仍未到Native运行。Root授权三文件仅compile前置修复：FrenzyProduction所有SyncList<string> Assert.Empty改Count==0；Assert.Single改Count==1，涉及内容读取/比较的每一处先断Count==1再[0]，唯一性与字符串逐字比较均保留；PendingVoxelTransactionIds也以Count==1。Replay的该list唯一断言同样改Count==1。FrenzyBarrel只补System/Config using、StartsWith Ordinal明确比较和Count==0。没有改测试行为参数/预期结果、生产、声明或生成物，未自行build。

旧/新test hashes：FrenzyProduction `3ba161aab33bb5975eea7610ef4e4d8f0ce9d098c13b10444af0e8626042c737`→`59be7d3d0d9ce82e2ee39df82b9ac4adbdce1dcaba9e3966e205c5cb7ccad2b9`；Replay `06e554e3881f826988ba31a2155e74da0691bb5408206c24dbddf927c6e9dce3`→`9216255ea8186d166abc21220cb49aa7dff19a4f4cfa968a09322400b9b0ef1b`；FrenzyBarrel `6e65de1cf13ee596d65dd7b73c15e443d016a1f21ced04909ba0694a3ebd4a23`→`eeb9c7b0bdc4c491181cb7b53991bf40ae4b560bf0e697fba48eb7776eb8dc19`。原test freeze02保持，不复写或假称同字节。Root自行补旧GameRow克隆参数与Supply Entries.Count，不归本切片修改。Source fence恢复，供Root build-03。

### Root 真启动 RED 后的官方结构诊断

Root build-03 零warning/error，existingEffectsIntegration 的 startup-red02 真正8/8失败、0skip，FreezeCore拒绝注册。Root依据实际metadata仅提高私有全局字段/声明预算至72 non-status字段、7775写、7560索引写、372340字节、4M工作量。原method filter跑0tests的label01保留且不算RED。随后 startup-budget-green-01 名称虽然为green，实际8/8失败、0skip、raw child exit2：首内层从FreezeCore前置转到官方EffectOperationValidation，不能报告为通过。

capacity新增1个test-only诊断 `BomberEffectPlanValidationDiagnosticTests.ActualOfficialProgramsExposeValidationAndStructuralCostsWithoutChangingTheirImages`。它以真实官方未启动World shell、当前GeneratedRegistry和当前配置绑定，分别验证4个原编码program；不改program image、字段、限额、Runtime或生成物。同时调用同一官方Block，独立记录最终限额比较之前的实际结构费用。Root build-05首先被CA1869阻断（0warning/1error），Root把诊断ReportOptions缓存为静态单例后build-06零warning/error。此fixture编译失败不是业务RED；实际运行 official-plan-diagnostic-red-01 为1failed/0passed/0skip，4项均无structuralError，其中Health Validate通过，Fire/Settlement/Outcome Validate失败。诊断当前source SHA=`33fdfaee8a6b36dc25485afe76cde60420237d34df090a765d16d7492b47eede`；原source SHA=`0a550dae113ce0de0853f4334fe1a6caf9da1822ba1db2ceeb51f6cb3b62e928`与build-05证据保留。

真报告 `games/101-bomber/.run/v14-native-production-20261003/official-plan-validation-b98a16de21ea46568ba65ca33b336e67.json` SHA=`156f589fd5f0646183b8cea06dfdebb63e3ef869190b22da07a533eba07b2312`；run log SHA=`fbd593bb45cdf0a9cae7cb04d21e877dd2c27fc87885bb26cc1d0da12e0ef604`。ResultLimit=360，实际Block费用如下：

| Program | raw Work | Writes | Indexed | Bytes | 实际失败约束 |
|---|---:|---:|---:|---:|---|
| Fire | 9832684 | 5760 | 5760 | 207360 | Work>1M、Writes/Indexed>1800、Bytes>86400、fireStatus field 5760>1800 |
| Health | 549722 | 2160 | 360 | 70920 | Validate通过 |
| Settlement | 1248844 | 1800 | 360 | 63360 | Work>1M，其余上述限额内 |
| Outcome | 635274 | 423 | 0 | 14993 | Writes>215、Bytes>9460 |

raw Work不含Validate后加的invocation/counter initialization工作；故大于限额的结论已成立，小于限额的raw值不单独冒作完整validation通过（Health的通过来自真正Validate）。BomberFireFacts MaxStatusWrites360是row-column per-claim检查，当前每claim写1，官方Block成功；真正报告直接证明的是global field-charge5760>1800，不能把360误称本次实际触发的row-column失败。前述7775/7560/372340/4M是生成program的声明上限之和，不能代替actual结构费用。

Root提出Fire保留完整roster和Handle/Target/Source匹配、循环内仅唯一matchedParticipant赋local、循环外一次Claim/SetAt。capacity只读核对该模式保留已销毁旧Target的Rejected收尾，NetEntityId.IsDefault由官方lowering支持；实施与重生成尚待Root授权。Settlement的官方Maxima硬编码单program工作量1M，公开EffectReducer作者面只有MaxWrites/After，提升Config总工作量不能修此失败。Outcome423是此次真正官方结构费用，16人业务可达最坏值仍须另证；10110致死仍未实施。所有功能Native RED、原子恢复重放、正式准入与生产通过声明仍保持未完成，未自行构建或改生产源。

### Fire matched-owner 最小结构修复与官方生成

Root在真诊断后授权仅修改BomberFireReducer.Server.cs。第一版完整roster匹配不变，循环内local matchedParticipant，重复时c.Require，循环外一次Claim/SetAt；exact06官方server生成真实拒绝“EffectReducerContext does not contain a definition for Require”。底层operation支持Require不能推定C#作者面存在该方法。失败source SHA=`c90bceac98f412f3644a9356f1d5908339705cdeac1bb2cadbbc520cff072146`、log SHA=`04a4f73732e7748f5b65b28d9173d7bb8dffa582945d22d2e6121f581e98c04d`及完整args存在 `v14-fire-matched-01-failure.json`；原失败source/log保留，只算作者API前置失败，不算Native RED。

Root授权窄等价作者表达式后：循环内duplicate bool只记重复匹配，循环外claimOwner为duplicate?default:matchedParticipant，真实Claim只执行一次；duplicate的default owner在官方EffectOperationClaim.Capture中因association.Owner不等而确定effect_access_violation，未写status。合法路径完整Handle/Target/Source匹配与Claim不变，也不要求旧Target身体仍live。不改字段/数组/公共1M/Outcome/Settlement。

fresh02 exact06官方server/client生成成功，独立二次proof112文件drift0，三条旧Health/Settlement/Outcome完整program原像逐字未变。Fire source SHA=`4851338a92194461870747d19344f03d4c10a204b5b8c7bccdbd2382aae3f230`，新image SHA=`217fd30fa2e0df43048e8b2a95839fb1f5aad21eceec1723ff2e931b11bad37a`；限额仍1800/1800/86400/1M，scratch官方重算9616。双端operation-plans SHA=`92bfaa8432f927cb5ee9dfc42e0a8a922bbade2ea0f1bdf8f5939f4dda8cfda8`，registry schema仍`5ca0f1e5bcfe651ed57ced6d292cdaf24a9319ab3bafc2e02e35f34a8e1efc3f`。声明预算合计7775/7560/372340/4M/max22576不变，身份账本不改。

完整新原像、源码、声明summary、4次官方args和前后output哈希保存于 `games/101-bomber/.run/resume-capacity-20261003/v14-fire-matched-02-programs.json`、`-source.cs`、`-summary.json`、`-generation.json`及`-proof/server|client`。generation JSON SHA=`073cf69970175de070cde3e813896d2bb41370ddba2d4e298833aff3604f57b5`。原359-file v14 freeze manifest SHA=`f7be3c8f8c4887fbf31388e4088b66072e22e0ddc723871be9d3b5b51f72f8eb`逐字保留。capacity未运行C#build、Native或fullSchema，已明确释放heavy给Root build-07/diag02；实际Fire工作量尚待新官方诊断，不假称已GREEN。

Settlement仅HandleInstance选候选的只读评估：当前Game不保证一个Bomb所有保留事实的Instance唯一。公开effect-lifecycle api.terminal明确允许generation递增后的实例复用；实际GasWorldContext.IssueEffectHandle从1起找非live identity，Allocate递增该generation。Game Danger每Tick可新增不同Participant接触，CommitContact仅保留旧row并置ContactApplied，不删除，故合法旧已settled与新pending行可同Instance不同Generation。DamageFacts.Validate只检查列数，Bomb.Validate仅Participant唯一；不能据单Instance重复就拒绝合法延迟接触。两字段Instance+Generation候选仍须完整外部tuple与Target/Hit关联检查及官方结构费用验证；没有实施此候选。

### Fire facts缓存结构 fresh03（第二次真Work RED之后）

Root build07零warning/error、child exit0；真正官方diag02报告 `official-plan-validation-653ec8bd6d6045f5b1cf94ef135b3c88.json` 中Fire rawWork1646284仍>1M，status360、总writes1800/indexed360/bytes63360均已在限内。Settlement rawWork1248844与Outcome423/14993失败维持，Health通过。第一次matched-owner结构修复只解决循环写入，不能假称Work通过。

Root随后授权仅Fire换成Participant外层：每真实facts owner先Has/Count==1，缓存完整HandleWorld/Instance/Generation、Target、Source；内部扫描完整actualResultCount，只对10110完整匹配保存最后result index，循环后一次真实Claim/SetAt。用matched index=-1而非default EffectResult常量，官方作者API已真正生成成功。Aura仍保留原逐结果语义，没有改变其条件、结果排序、任何副作用或预算声明。capacity在编辑前明确指出官方结构计费会顺序相加Fire16+Aura5*360=1816，Root要求先以不变MaxWrites1800官方生成，再通过actual diag取得新Work/写计费证据，不提前放大预算。

fresh03官方06双端生成及独立proof112files drift0完成。Fire source SHA=`6ade526d5f8f9c7edadbfa1b85f195b8a6dcb5d78cfcfd2a6ce80eb1bdeaf39e`；new program image SHA=`cf13f9e7cc6d42ba82013167cdf0fa3cca49498d2484949eea7c2c90ed73a65a`，limits原样1800/1800/86400/1M，scratch官方重算10256。Health/Settlement/Outcome三个完整program原像逐字不变，registry schema不变；双端plan SHA=`7f01d3ca18895bb2ae72ac67a8916de7ce87f594f61c3d16c17e26fbfe7896ee`。完整源码、program原像、summary与4次生成args保存于 `v14-fire-matched-03-*`；generation JSON SHA=`ef0ad72f2e2f9ce6a1d05c142ec4fd45f128e3749590c7779b4dedc2bf801ead`。旧359-file freeze、旧失败源、所有旧原像/日志保持；没有C#build、Native或fullSchema，heavy已经再次明确交回Root，等待真正diag03。

合法语义依据：官方SettleOne每admitted instant slip只走Applied或Reject单支路，Complete为它Append一次Initial并附该slip.Fact；10110为instant，不产生period/control结果，完整handle不可再发行同generation。新结构不缩短结果枚举，在异常重复匹配结果时选最末status，仍由真实Claim.ValidateResult检查完整Handle/Type/Target/Source/AppliedTick/Ordinal/Tick/Kind/Outcome与捕获列。若损坏重复full row跨Participant，ResultFacts关联持有真实Owner/Index，Claim.Capture拒绝不属该Owner的candidate，错误owner不会SetAt；未声称失败自动回滚之前其他合法owner已经完成的写入，官方Run只有finally释放storage。

Settlement完整Handle三字段扫描的只读评估：发行器live排重并为每复用Instance递增generation，restore保留sorted unique、nonzero的generation map及next边界，不合法重复发行同World/Instance/Generation。真实SubmitDamage合法历史的full三元组因此唯一，旧已settled行和跨Tick新行可同Instance但generation不同。把Target移到matched后并保留原完整Target/Hit身份检查，对合法历史可等价。边界仍是Game OnHydrate没有单独检查损坏快照复制即时历史fulltuple，Runtime恢复也不替Game扫描该事实历史；若坏tuple重复且Target不同，末candidate可能使正确结果保持pending。不能声称坏hydrate已经被拒绝。此方案未实施，仍需Root独立授权。

### 真结构费用后的两处作者预算修正 fresh04

Root build08零warning/error、child0，actual diag03 `official-plan-validation-99f64755c36a4244a77c511f71ce49de.json` SHA=`68c0ba01c6dcd2ecdd31ac5d8b56b5197451488a16344215a39e8403837d64dc`：Fire rawWork538305在1M内、indexed16、bytes63936在限内，唯一预算失败writes1816>1800。Root据该actual structural allocation授权仅Fire MaxWrites1816与Outcome MaxWrites423；Outcome423来自官方结构计费，仍不假称16人业务可达最坏值已完成。Root同时独占修改Config总writes7999、indexed7576、bytes382260，work4M/fact72/scratch保持。

capacity按授权只改两个EffectReducer的MaxWrites属性。fresh04四次官方06生成固定Fire/Outcome/Config源身份，每次校验输入未变化：双端official成功、独立proof112files drift0，四个program body/locals/字段身份/registry schema逐字不变，Health与Settlement完整program原像不变。Fire自动生成限额1816/1816/87168/1M/10256，image SHA=`66794f12f82f3668690ab0da7c6fbf8a4e4ee51db2d8eb0088211a7bcd756298`；Outcome423/0/18612/1M/22576，image SHA=`a32b1742f23877d2fe64db6faa97289e2b9da2ef6a56238c7aaf55ca39d3f8d1`。双端plan SHA=`489e84b699cb72e68bc291790ad084aa4012c0e99e30b1671239c1d65f98ee40`；声明预算合计7999/7576/382260/4M/max22576与Root配置精确一致，不手改生成限额。

author source hashes：Fire=`e349302fed8f2c2a1fa0f4975851d640d943cb40269125398e6e1d2009018511`；Outcome=`835653fcd7f543bf498506edfdd1379103141809c154453e9339a63bb0076fbd`；Root Config=`5c4766732c035e91196115b6ed3574f3bbad6f9321bc426d5d25f850081e6c25`。完整source、program、summary、生成args与proof在`v14-fire-matched-04-*`，generation JSON SHA=`a309c027f0192629c9f3915d28b38efdf40d8d92b83fbfca0d6e6c1bb71ab221`。旧359-file freeze未动；capacity没有build/Native/fullSchema，已明确释放heavy给Root，源再次fence。Settlement仍未改，1M问题保持真实未解决。

Target-first只读核实：Bomb.ValidateStorage的RequireIdentity只检查full身份local和generation>0，nested去重只比较HitParticipants，没有HitLives去重。DamageFacts.Validate只检查列数，没有nondefault Target去重或与HitLives逐行对应校验。已有BoundedObjectSnapshotTests明确允许把HitLives[0]改为Lives[1]，构造本有row1对应Lives[1]，然后Validate/Capture/Restore成功；但该fixture没有SubmitDamage，DamageFacts.Target两行仍default，不能把它冒称admitted Target重复的真实Native证据。真实ReserveDamage沿同一个player的单值Participant写入Target/HitLives，TryReserveHit按Participant去重，合法producer历史可使同Bomb完整Target唯一；此保证没有被当前任意snapshot/hydrate交叉验证。DestroyedTarget可直接比较stored full NetEntityId，无需访问它的livebody。Target-first方案未实施，也没有把Handle/Generation/Participant检查移除；损坏nondefault Target的拒绝规则与真实RED须另行授权验证。

### Settlement Target-first 狭域实验 fresh05

Root build09零warning/error、child0；actual官方diag04 `official-plan-validation-0ceda96c6c4948dfa68b576b6c32eaa7.json` 中Fire/Health/Outcome Validate通过，Settlement仍rawWork1248844>1M，其余结构费用限内。于是Root授权仅Settlement Target-first实验，不改公共作者面或1M上限。

Settlement现在在每真实10101结果中缓存完整r.Target，不Has或Read其livebody；扫描仅比较DamageFacts.Target的完整NetEntityId，记录matched和duplicate。matched后保留原DamageFacts完整Handle World/Instance/Generation，以及HitHandle World/Instance/Generation、HitLives完整Target、HitParticipant与facts.Participant、HitLifeGeneration与facts.Generation的一致检查，再真实Claim/SetAt。duplicate即使最后候选Handle不匹配也进入拒绝分支：claimOwner=default，真实Claim因不可匹配association.Owner确定effect_access_violation，先于status写入。正常唯一路径仍用完整原身份和真实Claim，并按Applied=1/其他=2写status。Bubble/Freeze/Immunity等后续分支逐字未改。

这是明确的内部语义变化：先前按完整Handle+Target挑行，现在同一Bomb事实中对当前非default结果Target存在两个候选时，结算直接拒绝歧义，而不挑某个完整Handle匹配行继续。该拒绝只加在结算路径；没有修改hydrate准入或旧HitLives-only支持fixture，没有声称坏快照已在Restore拒绝、没有声称actual Native已经证明新拒绝。合法producer由实际player的单值Participant以及TryReserveHit参与者去重保证同Bomb Target唯一；完整旧身体ID销毁后仍可比较。

fresh05官方06双端及独立proof112files drift0，Fire/Health/Outcome完整program原像逐字不变，canonical registry schema=`5ca0f1e5bcfe651ed57ced6d292cdaf24a9319ab3bafc2e02e35f34a8e1efc3f`保持。Settlement source SHA=`e3eb5e0238dc120da819ed1baea1c44317064920f6942953a24b03698b6de172`，new image SHA=`cdc78513c4b3e472ee7e85b2877335b6d01ff7a572412168dbe12d5b9a17a0d8`。声明3600/3600/172800/1M未变，scratch由官方重算17928；总预算仍7999/7576/382260/4M/max22576。双端plan SHA=`8a43a3088a757267aca85ce29deef58544e23aa9daeb4d9c3c5db3f6268dbe62`。

private summary首次错误地要求Settlement local program binding列表原順序不变，因Target先用而在Target/HandleInstance/Generation的局部token排列上失败；官方生成未失败。原审计脚本与`v14-settlement-target-05-summary-precondition-01.json`保留。随后按完整绑定身份/权限集合比较、canonical global schema与其他3完整program原像比较，全部通过。未删除验证或放宽声明，仅区分局部program token排序与固定registry身份；所有33绑定逐项不变。

完整new source/program/summary/4次GEN args与proof在`v14-settlement-target-05-*`，generation JSON SHA=`7c244140f642b2151e6fc372e79121ed874136d465bcb0b93d7a70da4c1ea39e`。旧359-file freeze以及所有旧原像/RED/前置失败日志完整保留。capacity没有build/Native/fullSchema，已明确释放heavy给Root；source fence恢复，actual新Work与Native歧义拒绝仍待验证，不假定通过。
