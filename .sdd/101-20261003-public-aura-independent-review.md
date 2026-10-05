# 101 Public Aura 测试、实际 RED 与最小生产计划独立审查

2026-10-03，审查者 capacity_schema，非 Public Aura 测试/计划作者。范围为当前新类、计划、Root实际 build18/RED 原件及 exact official06 API。只写本报告与私有核验输出；未改源码、旧断言、配置、预算、声明、生成目录、index/refs，未 build/test/GEN/Native，未 spawn。

结论：7个新 case 的实际 RED 成立，均在真实公开 CanActivate 的 skill4白名单拒绝处失败，选角资格前置已通过。计划可支持 Root 仅授权三个生产文件接通普通 Aura；不授权 Favorite、改变现有资格或用假结果代替结算。有1项明确覆盖缺口：保护测试只给现有 Vulnerable fixture设置未来deadline，不能据此宣布实际出生 Protected 阶段转换验收。实际 GREEN 与相关回归仍待 Root。

## 1. 源码与运行身份

| 输入/证据 | SHA256 |
|---|---|
| Server/Tests/Gameplay/BomberPublicAuraProductionTests.cs，7 Facts/7cases | `10dbffd421d67cbf1b989a19605ad4e2972bace6521bab4d9d64f2667237cbd5` |
| .sdd/101-20261003-public-aura-producer-plan.md | `4ca0cad21d97408b824c2424a0477a1db50557c3d50b0df5a299a5b27514373d` |
| public-aura-production-red-01.json | `50d6b4bd40c6d42a5585f4d1188486879fccfd9fa04002edf72e11ea3fa89e5b` |
| public-aura-production-red-01.log | `6942a896aa9e83198a1ca337fa5358f9122eec656781a2aec71e4754f1b59fc2` |
| build-18.json | `df7f3c353f098e066dbb7e4f24e9beb7f857d595713fba997e66b5666a6dbcd7` |
| build-18.log | `05f488bbc8e8a4c33e6a186e1431be04c6f1cd0f8e2b65a12804305ce9803dd6` |

源码路径相对 `C:/Work/LumioGames/LumioGame/games/101-bomber/`；运行原件均在其 `.run/v14-native-production-20261003/`。计划在仓根。机械 import 修正的物理原件为仓根 `.run/public-aura-namespace-fix-01/before.cs` / `after.cs`：before715a00…9f58；after10db…cbd5。实际 after删除唯一 `using Lumio.Wire;` LF行逐字符恢复before，当前文件逐字节等于after；7cases/全部调用/断言未因编译修复改变。

build18实际child0、0 warnings/errors。RED实际child2（外层runner1不能替代child）、total7/pass0/fail7/skip0，5s460ms；started=`2026-10-03T06:20:37.9609636Z`、ended=`2026-10-03T06:20:44.4413779Z`。command为真实测试DLL，`--filter-class *BomberPublicAuraProductionTests --minimum-expected-tests 1`。七项日志首错都是新类330行 `active_skill_unavailable`，没有 fixture/observer/compiler错误或skip。build18及RED保存的该源SHA与当前10db完全相同。

| 实际 DLL（读取真实文件SHA等于RED JSON assembliesAtEnd） | SHA256 |
|---|---|
| Lumio.Bomber.Gameplay.Tests.dll | `373a0adeb6446b1353ccd014a453476ba13940c395399a967df2c4b091bdea7c` |
| Lumio.Bomber.Gameplay.dll | `9043262095be360d48921a114d9fa2f41b1d1c6795b423bc41dd01f43e8ce685` |
| Lumio.GameRuntime.Ecs.dll | `74da7fff23e1aa72b8e8b7d0fd93c8164447c636de47700e254d8404c0648def` |
| Lumio.GameRuntime.Gas.dll | `09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc` |

official manifest=`8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`。这里只核指定测试及运行四库身份，不把它扩大成全source无漂移声明。

## 2. 夹具与7项期待的质量

新类285–318在既有真实 Native Scene中明确布置初次Warmup选角槽与位置，再实际 `SelectCharacterAbility.CanActivate/Activate`。309–314验证118004、选定槽、skill4、level1、Boundtrue、普通Bomb槽0；没有直接赋ActiveSkill4或Aura成功状态。300/315设置比赛阶段是标明的测试场景输入，不是完整进房/UI验收。327–342实际公开 `UseActiveSkillAbility.CanActivate/Activate`，仅之后读pending关联；目前正是在这个真实入口得到业务RED。

| case范围 | 期待与实际来源 |
|---|---|
| 21–60，普通施放 | 接受时无CD/保护/cast副作用；Tick后实际10111有限行及Initial Applied完整receipt，配置duration/CD、一次cast/stat、自然到期与CD保留。当前只执行到入口RED。 |
| 62–100，重复/pending | 相同sequence和独立pending请求均拒绝，不增加handle/chain/AbilityCD/保护/cast/stat；真正Initial只一次。 |
| 102–161，连续暴露 | 配置整秒前无10110，整秒后真实Target减2；actual fullhandle26列事实/status/Ready、原Life/gen/Participant/Match/chain/sourcekind与日志完整对齐；自身不伤。 |
| 163–183，砖 | Scene.Write真实Native砖；持续超过暴露间隔仍无伤，原Native块/revision不变，无额外地形业务写。 |
| 185–216，移动 | source移动实际走公开MoveAbility Activate+Tick；旧覆盖断开、新覆盖继承同一个真实Aura handle。target初始位置仍是明确fixture几何。 |
| 218–242，死亡 | 三颗既有真实ECS bomb→10101 actual Applied杀source；验证实际死亡/旧finite行消失/后续目标无火伤，不手设死亡phase或Health结果。 |
| 244–283，paired | 从公开施放真正Applied行 Capture/RestorePaired，保存allocation/generation/lifetime/CD/一条cast，使用真实新WorldId重绑，旧handle操作被拒绝，无重复Initial。它是paired耦合恢复门。 |

344–371同时验证真实Finite row/codec payload与actual EffectResult，不用投影独自宣称Applied。完整身份为World/Instance/Generation/Type/Target/Source，以及Participant/Life/gen/Match/chain、AppliedTick、Tick、Ordinal、Kind/Outcome。392–418 reflection只借用官方内部观察入口，复制实际batch.At值；原observer必须null，using Dispose恢复，未写frame/result/claim，未Apply10111或重放业务。official06 `EffectSettlement.cs:47–54` 正式Reducers.Run后在借用窗调用此observer并Expire，与测试使用一致。

## 3. 计划与最小授权范围

现 `UseActiveSkillAbility.cs:20–50` 完整资格顺序为owner/player输入阶段、SkillsEnabled、freeze、非空技能、pending/CD、配置Active/Activate、有效level、白名单、角色BoundSlot/BoundSkill/BoundLevel，再Server准入。当前40–41只允许2/3/13，真实skill4恰好被拒绝；Server else目前会落SubmitBubble。计划仅增加Aura pending、白名单4与明确4分支，不删除其余资格。

计划限定三个生产文件：

- `Gameplay/Abilities/UseActiveSkillAbility.cs`：Aura pending + whitelist4。
- `Gameplay/Abilities/UseActiveSkillAbility.Server.cs`：4的有效duration/CD检查及Favorite guard，4独立Execute分支。
- `Gameplay/BomberFiniteAura.Server.cs`：新增SubmitAura，不改变原Matches/Consume职责。

`BomberSpecialBombResolver.cs:28–32` 的空Bomb槽实际返回true且kind0，计划不会误拒测试的普通118004角色。配置火焰槽或无效槽在admission前拒绝，不默默把Favorite退化为普通施放。Skill13/其它既有路径保留。

official06 `Effects.cs:14–108` 对真实payload/finite timing/capacity作admission，仅Issue handle、Attach/Enqueue；`EffectSettlement.cs:91–98` 在phase9才调用CanSettle。因此计划先checked全部时间/chain并提交真实Effect，只有admitted后写pending完整关联，符合官方调用顺序；失败无chain/CD/保护/cast副作用。`BomberFireAuraEffect.Server.cs:11–29` 仍拒绝非live/fullLife、错误Participant类型、非currentLife/gen/Match、死亡/RestorePending、非bound4、错误Outcome/CD或fullhandle及已有active10111。`BomberFiniteAura.Server.cs:11–38` 的fulltuple/actual codec/paired验证不删。没有绕过Claim/reducer权限、槽、预算、Native规则或扩大公开Runtime接口。

当前三个文件SHA依次为 `d2677fb79bb7451adede2b439b92fac33a80c43f70cd5b805c5271b7120a6583`、`9f4f02098200ae0b4054b13cdb1969b66db02e0cecfdacb31c05b201abfce844`、`cdc00d1794a39163d02ec28322abd5d097f93deda6288bc99d00b541e0d32def`。该段是计划审查，不是已实现的生产审查；Root可据真实RED作上述窄授权，改后需要重新核源和实际GREEN。

## 4. Finding、保留门与非验收范围

**[P2] 实际出生保护阶段转换未被新公开case覆盖，当前候选有明确静态缺口。** 新类31/71直接给Vulnerable fixture写future ProtectedUntilTick；48只断言实际Applied后deadline0，没有证明由实际出生来的Protected Life及participant阶段转为Vulnerable。沿全部当前写路径追踪：

- `BomberSuccessorLifecycle.Server.cs:138–141` 真实landing使participant/player都为Protected并设真实未来deadline。
- `BomberFireReducer.Server.cs:56–66` 的真实Initial Applied只清deadline0；不写player或participant LifePhase。
- `BomberFiniteAura.Server.cs:11–38` Matches函数只验证身份；effect `CanSettle:20–29` 接受Protected/Vulnerable的正常生命但不改变phase。`ConsumeAura:40–70` 处理真实有限行、死亡、paired、cast/outcome/until，没有阶段转换。
- `BombSystem.Server.cs:202–204` 的自然到期转换要求deadline非0；Aura置0后这个条件永久不成立。`:205–214` 会将仍Protected的player阶段同步回真实current participant。`BomberMatchRules.cs:65–71` SyncDerived只更新Hat/Maximum，也不补阶段。
- Native `BomberHfsmDefinitions.Server.cs:87–103` PlayerLife图确有ProtectionEnded/Broken到Vulnerable，但需要外部事件，未声明自动到期timer。当前Game nongenerated Gameplay源码中这些事件仅在图定义出现，没有对应PlayerLife Send/Start驱动；当前UpdatePlayers也不发送。NativeBomb驱动的Fuse/Danger事件不是PlayerLife替代路径。不能把存在图声明当成运行时已经补转换。

因此静态代码预示真实born-Protected Life施放后会出现deadline0而阶段仍Protected，participant投影亦保留Protected；伤害准入另读deadline，不能把deadline清除等同phase转换已完成。本审查未运行此额外分支，不声称其实际Native RED已经取得。它不否定普通公开入口7项RED，但必须补Root要求的第8项：实际选Bear旧Life真实死亡→transfer/landing/carry→真实Protected successor公开施放→actual10111 Applied后同时断言player/participant Vulnerable、deadline0及既有CD/cast身份。保持原7，不手写phase/protection制造此正控。Root已明确要求作者先取得该新增case真实RED，再授权对应最小生产修正；本审查没有提前写source。

没有发现测试用Fake EffectResult、降低选角资格或删除fulltuple的阻断问题。计划明确旧 `SkillAuthorityTests.cs:146–157` 仍把4期望为unavailable；Root应另行审定仅该已批准新功能历史期待的窄更新，不能隐蔽松旧断言，不包含在本审查三个生产文件授权里。

尚无新公开AuraGREEN。Root需新同source7实际GREEN，再回归原Fire/Aura26、NativeCorrelation13和相关技能门。Favorite留火、public特殊弹、Supply17、全部Native/整局、正式新pack/Browser实跑没有因这次RED或审查完成。duration/CD均保持配置与ADR0048设计，不以硬编码20Hz/墙钟绕资格。

轻量独立核验输出保存于仓根 `.run/public-aura-independent-review-01/proof.json`，记录实际run原件hash、源码与run记录比较、四DLL实际比较和import物理前后像比较；此输出不执行测试或生成，不代替原始Native运行证据。

## 5. 实际出生 Protected successor 第8项源码独审

Root按上述P2追加的新方法 `ActualProtectedSuccessorPublicAuraEndsBothLifePhasesBeforeNaturalProtectionExpiry` 位于当前测试285–384。当前完整8 Facts源码 SHA256=`4bbbdb1cd9e9f433c6e9ca43ee697a48f00aa95e04605f7f969b1cbfcde39fa1`；作者不是本审查者。本轮只读源码，未编译/执行、未改方法或旧断言。当前文件删除这一新方法块后，与保存的原7项10db源码逐字符完全相等；没有旧7项或import漂移。核验输出为 `.run/public-aura-independent-review-01/actual-protected-successor-source-proof.json`。

新方法沿真实路径建立被测阶段：Open真实选Bear118004并保留其绑定资格；三颗实际Bomb产生3条10101 Initial Applied receipt杀旧Life，真实death一次。随后用原Scene的WorldManager.Tick和鉴权transfer驱动，等待实际新Life live/RestorePending=false/DormantLife=default；并断言Participant generation准确+1、SuccessorPending=false、PreparedRevision>0、真实新连接绑定、transfer CommitFact Applied及10105恢复Initial Applied的旧Life Source/非零fullHandle。继承角色、skill4/level1/Bound及普通Bomb槽0均有实际断言，未手改successor资格。

第340–374行明确断言真实landing后的player与participant都是Protected，并保存原未来deadline；受测公开施放前后没有phase/protection赋值。公开CanActivate/Activate之后先断言pending尚不改变保护/CD/cast；真实10111 Applied观察后检查deadline0，下一真实Tick仍严格小于原出生deadline时检查两者Vulnerable。最后通过真实10101 damageProbe Applied再次证明该新Life可伤、Health6→4、只一次cast。deadline比较防止等到自然保护到期制造假正控；fullTarget/Source、恢复/施放receipt与原observer路径均保留，没有假EffectResult/Claim、假Phase或跳过Guard。

静态结论：新增方法直接覆盖原P2所缺的真实出生Protected分支，未发现阻断fixture问题。它仍是**待Root实际运行的候选测试**；不能将本节源码审查称为Protected转换已通过，也不能把原7项已成立的公开入口RED扩大成第8项业务RED。若当前missing public producer仍在CanActivate先失败，实际phase缺口尚不会执行到；Root后续须在接通入口后保留新期望并取得其真实阶段结果。

## 6. complete07 实际8项公开入口RED（更新§5的运行状态）

Root随后在真正complete07 package上fresh build02成功，0warning/0error/rawchild0、记录sourceDrift0，11s310ms。原件为 `games/101-bomber/.run/v14-fullpack07-native-20261003/build-02.{json,log,exit}`，JSON SHA=`015e4a0a1fefbd2f5b7734fd52dabfbf53f63f288b9cdba9d8bd78c3798c46ec`，log SHA=`dad37b2b30d1b171e5e74a65fd93e043d57e0895ba2a079cfdba15679a01a2e5`。本审查轻量重读原件，未自行build/test。

同目录 `public-aura-red-01` 的实际过滤`*BomberPublicAuraProductionTests`、minimum8；raw.exit/JSON exit均2，**8 total/0pass/8fail/0skip**，7s217ms。实际日志SHA=`53ea8e99e600e3b6b29f1cc67c1b5b1e95d1859cca2606778cf26f9d3652d5e4`，JSON SHA=`b4bd4c12a58c729b117873318bafa04e32b30d9c8790ed518288b532c1d93405`；两者匹配记录。时间06:49:59.2469989Z–06:50:08.1922379Z；source start/end都记录4bbb完整8项，run sourceChanges=[]。真实complete07 manifest物理SHA等于记录`652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`，官方SDK selection为0.0.5-main.0e2fc74；不复用旧06 DLL身份。

全部实际首错仍是`active_skill_unavailable`；原7项在SubmitPublic432，新增真实Protected successor在354。因此第8项**实际执行通过**了354之前的旧Life死亡、三条真实10101、鉴权transfer/10105恢复、successor落地/fullgeneration/carry、真实Protected双phase/未来deadline等前置，入口RED质量成立。354之后未执行，原P2的施放后Vulnerable阶段仍只是已定位的静态缺口，不能称实际phaseRED或GREEN。它足以支持Root已明确的三文件公开producer窄授权；阶段修复必须保留新8项并在真实Applied后验绿。

审查当时物理重hash六项文件，均等于这次run assembliesAtEnd：Tests=`ef9942a7edd6b35fe6a78905840bb2e1187c7e1e3b9967cb923e1109fcceb4d6`，Game=`1aecabdd234725ab826c1b23aca093d2a70f8a2a3f369a50153abf626cd01068`，Ecs=`aa5520f37e22eb6337d4e9e5c33008684bb7fd51e598dad38ef404351dddbd49`，Gas=`09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`，Native=`c01599b8c31ea72185f2a206dbcc5c4ff8fb432c68bb61ea3dabab5e6d4ddb12`，build-info=`f9752593b0d802b76996a5bcaa8fdda4a75d2f9449fd160d268e793029f3570d`。完整物理核验输出随资源预算独审保存于根 `.run/resource-chest-budget-independent-review-01/proof.json`；这是核验时的原件身份，后续Root freshbuild需新的身份。没有任何公开AuraGREEN、Favorite或全局验收被本节提前关闭。
