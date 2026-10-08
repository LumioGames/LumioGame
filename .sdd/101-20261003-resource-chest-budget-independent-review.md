# ResourceChest预算10项与计划独立审查

2026-10-03，capacity_schema，非这10项测试/资源预算计划作者。本轮只读源、已执行原件、SDK和实际retained导出，并写独审文档/私有核验结果。没有生产/旧测试/声明/配置/生成/index修改，没有build/test/GEN/format/Native或提交。

**结论：10项测试的范围与质量通过，实际8失败/2通过的RED成立；它是有效的计算器/真实ECS存储RED，不是Native资源箱生产验收。** 计划的默认及105秒计算成立，但physical245不是可直接批准的通用上界；有一项明确P2例子错误与既有档位兼容决策，见§4。Root可另行授权最小计算实现；发放新源前必须同步决定source迁移、物理列表/历史迁移、结构owner及实际字节门，不能只调计算数值宣布资源箱安全。

## 1. 精确输入与原始执行

| 输入/证据 | SHA256 |
|---|---|
| `games/101-bomber/Server/Tests/Gameplay/BomberResourceChestBudgetTests.cs`，2 Facts+4两行Theories=10cases | `2d84fa9f0cb161c9e74a2ccd37ecec828f9a947be1cf5b6ca12b4d709ac0aa8b` |
| `docs/plans/2026-10-03-bomber-resource-chest-budgets.md` | `a2270f45532479df2e616a61f9aabbcb252b200ebe5b27bee84d80f2536c7fa6` |
| 当前`Gameplay/Config/BomberObjectBudgets.cs` | `2b2285078879efd035bfe4fd70840fadf60cb1034c860ded9fd76b4701cad94a` |
| 当前BombState ContactedChests cap5源 | `fd871eb03ccd4f1e5737ec0a9e671943283b3d5a522d049c6cb4dd376ca356ea` |
| complete07 `build-02.json` / `.log` | `015e4a0a1fefbd2f5b7734fd52dabfbf53f63f288b9cdba9d8bd78c3798c46ec` / `dad37b2b30d1b171e5e74a65fd93e043d57e0895ba2a079cfdba15679a01a2e5` |
| `resource-chest-budget-red-01.json` / `.log` | `cd6166e39b157d42e906ab36dffc0c6f8d26d01e6da43b409e9533858311119a` / `3cfc4ef41c50524dcb270a59f6cca6c874b930d66601e10abb0d3f7de972eb2c` |

运行原件相对101根 `.run/v14-fullpack07-native-20261003/`。build02 rawchild0/0warnings/0errors、sourceChanges=[]，11s310ms。RED时间06:51:17.7111779Z–06:51:27.7438933Z，日志实际**total10/pass2/fail8/skip0，8s866ms**；JSON和`.exit`均raw2，所有日志hash匹配原记录，minimum10。实际命令为该fresh Tests DLL加`--filter-class *BomberResourceChestBudgetTests --minimum-expected-tests 10`。

run start/end记录相同2d84测试源和2b228生产计算器，当前物理源亦相同；只声明指定输入核验，不扩大成全repository无漂移。selection真实complete-release07/SDK`0.0.5-main.0e2fc74`；物理manifest等于run `652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`，Config commit记录`a991a517f9dbae255321c25d65fea0bfdfdca42f`。

独审开始时实际物理六项SHA均等于run assembliesAtEnd：Tests=`ef9942a7edd6b35fe6a78905840bb2e1187c7e1e3b9967cb923e1109fcceb4d6`、Game=`1aecabdd234725ab826c1b23aca093d2a70f8a2a3f369a50153abf626cd01068`、Ecs=`aa5520f37e22eb6337d4e9e5c33008684bb7fd51e598dad38ef404351dddbd49`、Gas=`09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`、Native=`c01599b8c31ea72185f2a206dbcc5c4ff8fb432c68bb61ea3dabab5e6d4ddb12`、build-info=`f9752593b0d802b76996a5bcaa8fdda4a75d2f9449fd160d268e793029f3570d`。随后Root合法fresh构建覆盖同一输出Tests/Game为8961a57…/3300423…；本报告没有把新两库算成原RED输入。私有proof分别保存较早实际匹配观察与较晚物理替换观察；原JSON/log仍是上述旧身份，后续验绿必须另留fresh身份。

## 2. 实际失败分类与10项质量

| 实际case | 数量 | 首失败/已到达边界 |
|---|---:|---|
| 默认全部可能箱/奖励 |2| line40：skills on期望1351实际639，off期望1106实际634。所有Legacy19/8、first/interval8000、match420000/final115000/lead60000、denominator6及Gold4/3与strong6/5前置已通过。ChestLimit245之后的断言尚未到达。 |
|105秒exclusive窗口 |2| line62：807实际503、698实际498。实际240000/115000/20000导出。后段ChestLimit109尚未到达。 |
|精确one-below |2| line78：1350/1105实际未拒绝。是真正Reader/计算器admission缺口；schema/export成功，不是改expectation或parser失败。 |
|明确maxMirrorOrbits0 |2| 实际通过；391/386、ChestLimit5、ordinary2624、walls336全保留。 |
|first==exclusive stop |1| line113：期望391实际639；真实first245000被Reader正确读出，生产算法忽略FirstTrigger。 |
|真实第六个箱身份 |1| line138：期望Added实际CapacityExceeded。前五个实际ECS完整identity/Tier/generation准入已通过，第六个被当前effective ChestLimit5拒绝。物理SyncList仍cap5是另一个静态确认门；此RED没有独立执行到“logical245而physical5 Add抛错”的分支。 |

全类没有编译/fixture异常或skip。实体case使用真实WorldManager.Tick、真实ECS发布的bomb/chest full NetEntityId和实际TryObserveChest/ValidateStorage，明确标为存储witness。它没有Native箱绑定/真实ray/6次破坏回执，不能称这些完成。Calculator cases通过原AuthoredFixture复制真实schema/registry/tables、真正Config CLI export和实际Reader；不造tables替身、不改旧83或新22断言。

实际导出证据在 `.artifacts/authored-config/` 原十目录：`041bde17d64b47839c00c65277f47d9a`、`0c0cb9102fd840219a50be69f97ecddc`、`2635516a12044b89bf0d762b2c941d3c`、`2e838797383e42ffb085de39d9070929`、`3350f895f7564972b482e9105adf94de`、`45307583da134ce28932453712d4d71a`、`4a4ff926feb949f8a4530ba784d75424`、`d1ae2cc573234259a711c6dd838fac0a`、`e982d60c5efb4200a10cf5397d004c94`、`eb8e1418979940bf8b4dcf07779e0263`。原目录的UTC时间窗和实际参数覆盖本10项；没有伪造每case→GUID映射。

十份compile.log均`export (split-export/1): OK (27 table(s))`，保留的Python prefix诊断未使export/Reader中断。server/client实际object_budgets rows逐字符同值；所有compilerHash=`96fb8aaf2a33a79cad4496962081162b245ecd2442db419fc31ffff83f728301`，object_budgets schema SHA=`21481667f9f701cb3fa5aae0f833a12726597cc62cffec2f1adf5c145d0ee24f`。其中确有maxPickup1105/1106/1350/1351/807/698/391/386、first245000和orbits0两份，不假设shipped703已被修改。每目录实际参数/五表物理hash/两端比较/compile log hash均保存在proof。AuthoredFixture.cs398–464保留失败effective输入且通过LUMIO_CONFIG_ROOT真实compiler启动；审查不自行重跑它。

## 3. 算术与producer准入含义

计划使用Tick换算的`first < stop ? 1+(stop-1-first)/interval : 0`正确表达first-inclusive/stop-exclusive。checked stop必须先checked(final+lead)，不能Unsigned先减；interval>0、orbits≥0仍验证，O0发放0。默认Stop245s gives30waves（8..240）×8cells=240；105s gives13（8..104）×8=104；first245==stop给0。所有箱roll、special/heart和drop采用最坏成功，没有1/6或百分比折扣。

真实shared ResourceRewardRules.Maximum给Gold4/3和strong6/5，Wood1/Iron2/1；计划的Legacy initial upper361、strong30/25是保守历史上界，实际初始Legacy没有M2箱，initial ResourceChestIssuances=0。故默认pick1351/1106与ChestLimit245、105s807/698与109、closed391/386与5成立。所谓245是whole-match发行安全上界，**不是**一颗power6在一次trace必定触达245个箱的可达性证明；不能据4个arm删完整旧ID历史。Native unresolved/Unstarted continuation可能延长来源，需真实Ray/替代代数/拒绝与恢复矩阵，不能以8s fuse强行释放未知义务。

未来M2初始资源箱16/24/32和13波时总身份125/185/245及保守初始reward150/218/315、off142/206/299与配置布局上界相符。但新计算器仍Legacy/P8 guard，这10项没有准入M2。shared reward helper现在接受IBomberConfig，而Settings先调用Calculate(tables)再TerrainBudget(this)；最小实现应添加共享的tables/flag校验入口或等价窄委托，不能在Calculate内递归构造Settings，也不能复制一份未经共享验证的Gold常数。

live+未发布+submitted/Unknown chest promises必须在完整四格birth前总计，Strong/initial/regen并发共享实际信用；概率不折扣，binding census不涵盖未知birth。真正Native accepted reward/death/terrain pending仍占Pickup容量直到真实转移，不能因为GoldHeart/特殊糖暂未实现而删除其义务。ordinary2624含terrain128、walls336与Supply/Frenzy附加项继续独立checked；实际当前默认CentralSupplyEnabled=false，默认不是1362。只有enabled central时默认skills-on额外11给1362，bombs额外24给2648；不能误把父计划中的条件值当当前默认源。

## 4. Finding与具体默认迁移前置

**[P2] 计划将checked-in `regen-5000`误当terrain5秒间隔；它实际只改回血技能。** 原计划Task2和author handoff把“existing regen5000/default→389箱”作为例子；真实 `Gameplay/Tables/profiles/regen-5000/layers/product/skill_levels.txt:6` 是`regen_lv1.interval_ms=5000`，profiles.json335–338也明确只列此技能字段。389的数学计算对**另一个UGC terrain interval5000输入**成立，但不是该现有profile。更直接的真实既有例子是`match-480000/layers/product/game.txt:6`：480s−115s−60s=305s、38waves×8+5=309箱，已经超过245；现有composite test `BomberObjectBudgetTests.cs129–147` 的480/90/60窗口给41waves与333箱。因此保持全部既有named/composite有效组合时245不足；选择只覆盖默认/105秒而拒绝更大组合会改变已支持的准入范围，必须Root明确裁定。此finding不否定10项实际RED。审查没有改计划/旧测试来隐藏它。

默认source同步迁移的具体必要项：

1. 当前`Tables/tables/object_budgets.txt:6`为2784/703/336，`game.txt:6`为skills-on、centralfalse、420s；在资源源orbits2继续开启时，真实新默认必须至少provision pickups1351，而非703。若未来显式关orbits0可仍391，但不能为验绿悄悄关闭产品。Root唯一作者应通过正式authoring patch/validate/export，更新source_status/ref并对全部effective profiles重新算完整required值，不手改导出。现buffer-100/150只调movement.txt的输入缓冲，不是对象预算倍率，不能猜把1351按该名字乘1.5。
2. 默认703、旧639/634、match/final组合727等历史assert会随enabled resource语义改变；必须保存旧实际源/断言/RED并逐类审定迁移。新10项及新增22既有力道保持；不能一次replace数字或关闭条件掩盖旧source含义。若245选定导致309/333组合拒绝，独立记录其产品范围决定与对应测试变更，不能称全部旧profile回归“保持不变”。
3. 当前BombState.cs38声明`SyncList<NetEntityId>(Scope.None,5,Server)`，InspectChest.Server.cs100–108按effective ChestLimit预检，但Add还执行physical MaxCapacity；必须保证effective≤批准的physical上界，且prepublication拒绝，不允许第六项Add才炸。拟议245或其它literal需要Root另批 exact声明/GEN，不属于当前计算授权。
4. structural chest owner应由已有真实regen/Strong/initial持久字段与合法发布转移实现；这10项没有证明部分四格、Unknown/rejected/accepted未消费、Gold奖励、跨代数Native/round回执。新增发行准入不能等这些义务产生后才容量失败；接明生产guard前还需共享预算和真实Native矩阵。

## 5. physical列表、schema8MiB与实际snapshot字节门

官方SourceModel.cs405–430要求positive int literal，SyncTypes.cs355–362 constructor也只验证positive；Add/Insert及decode在434/448/520落实actual MaxCapacity。因此245在语法/构造上可表示，**这不是245已获批准、正式GEN成功或内存通过**。

当前actual ledger shape明确container key=`BomberBombState.contactedChests`、ordinal35、persistent/Scope.None/Server、maxCapacity5；两端generated serializer在308 CapturePersist、455 RestorePersist保持该字段。当前ledger schema=`bomber-v14-m2-bounded-producers-candidate`，765 active/8423 retired/36 pages，main input1004662 bytes。改变5→245会改变存储形状，即使Scope.None亦需Root新schema裁定：保存v14完整before与旧5原snapshot；官方双端GEN/proof/drift，精确观察35/capacity/serializer，保留全部旧retirement页并追加确切旧shape。`schema-identity-model.mjs:compareHistory`拒同schema shape漂移，不能直接改现v14 shape或手写生成元数据。

`Tools/schema-identity-storage.mjs:6–7`固定input/index各8388608 bytes；main manifest、各retirement page及每次comparison index都要过真实门，512字节/条预扣与intern字符串仍按官方算法。新候选需全schema、历史一致/原RED、byte-for-byte旧页、独立drift与provider pin，不能加大8MiB或flatten历史来让新容量过。当前小manifest不等于下一retirement comparison必过。

**snapshot与schema audit是不同字节域。** 官方`Snapshot/WorldSnapshotCodec.cs225` WriteContainer使用UTF8 **完整ContainerText**，不是245×16二进制NetEntityId裸数组；`SyncTypes.WireWriter.cs10–13`含containerType/maxCapacity/fullEntries，`WireCodec.WindowValues.cs56–87`将每个NetEntityId编码为quoted32hex。仅按这些真实源码推导，245项一列表UTF88637 bytes，persist blob长度前缀后8641，2784炸弹该payload分量24056544 bytes；scalar245×16=3920、aggregate10913280仅是更小的裸身份下界。前述数值是明确标注的**源码推导，不是已执行Capture实测**，还未包含field key/entity/framing、其它Bomb/24fact列、HFSM、continuations、World pending/accepted cohorts、pickup和Gas。

官方`PersistenceLimits.cs`实际默认whole record64MiB、单blob1MiB、string65536、Effect section8MiB；不得把schema input8MiB当whole snapshot上限，也不得因8637<1MiB宣布全snapshot已通过。发布前需Root授权真实measurement source：在合法full-ID/Source/Phase/事实与bounded producer组合下，调用官方CaptureSnapshot/CapturePaired保存真实byte length/hash/allocated内存和Restore结果。至少单炸弹exactcap/oneover、旧ID退休后重复、多个最多合法并存炸弹、其它最大必要列及World/Gas pending overlap；pending creates的公开capture拒绝须作为真实前置，不造可捕获cut。还需旧5 snapshot在新245 decoder的兼容行为：`WireCodec.ContainerDelta.cs78`要求encoded maxCapacity==实际capacity，原5 full envelope不能无证明直接Restore到245。保存原拒绝与正式迁移选择，不能重写旧maxCapacity掩盖break。

物理列表边界的Source/ECS存储10项、官方schema/GEN门、实际snapshot/decode/Native及完整producer预算应分别闭合。Root在这些证据前继续原M2/producer guard；本独审没有放宽公共Reserved slots或任何Runtime合同。

## 6. 持久核验与交回

根 `.run/resource-chest-budget-independent-review-01/proof.json`记录三run原件/命令/raw、指定source比较、早期6库实际匹配及Root后续替换、actualmanifest、原十effective导出/两端预算行/各hash及明确derived-byte标签。当前proof SHA=`2509d073ada58d9d73078cbe26e8368d23e3daec23c2d605254cfa4fde0fede4`。没有重新执行测试或给未实施生产写验收结论。

Aura8同pack原件亦已补到 `.sdd/101-20261003-public-aura-independent-review.md`§6：实际8/8入口RED；真实Protected successor354之前前置全部通过，Applied之后的P2phase断言尚未到达。资源10的代码与期望未变。等待Root窄授权/真实fresh验绿；当前独审任务已STOP源写。
