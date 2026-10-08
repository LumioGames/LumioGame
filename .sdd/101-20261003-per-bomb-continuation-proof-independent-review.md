# Per-bomb continuation 11例先行测试独审

2026-10-03，registry_bounds_review，非测试作者。结论：**spec/quality PASS，可交真实执行；无阻断 finding**。这里核验源码与入口，不把作者预计2 PASS/9 RED写成执行结果，不决定ContactedChests声明容量。

私稿 `.run/per-bomb-continuation-proof-test-draft-01/BomberTerrainContinuationProofTests.cs.draft` SHA `e91d296cffec03164f772e95390dea9d5dea5532d9ab0e88b444cdc9171736de`；作者报告 SHA `7c97ed2734983dc8b938ea2b479f818792446813e30e9484a0785bfdf2e196fe`。核对时Root已发布的 `games/101-bomber/Server/Tests/Gameplay/BomberTerrainContinuationProofTests.cs` 与私稿物理字节完全相等；本审查没有发布或编辑它。1 Fact + 2 Theory/10 InlineData，共11例。

真实前像不是手造accepted row。`AcceptedFrontier.Create` 复用既有 `BomberTerrainCorrectiveTests.AcceptedContinuationSurvivesRealUnavailableSectionAndReadRecovery` 的真实Scene、两个正常Tick、Native soft破坏与实际Adapter的Original结果。它逐项断言Applied/Original/status0/tokenConsumed/原receipt bytes/sectionCount/revision进展，以及pending bomb、participant、life、generation、chain和match。接着真实SDK `OpenSectionExport -> Acquire -> Read -> ApplyDurabilityAck -> UnloadSection`，确认无权威材料读；下一正常Tick接收实际Original，才得到非Unstarted `(6,5,right,remaining3)`。原Power4、origin `(5,5)`、family和occurred均保留。Scene.Bomb的birth条件是明确既有fixture；它不冒充公开Place或自然物品资格。

八个负控只改一个持久化列，原真实full-source前像不变。Z5→4仍在map内但离原轴；right1→left3仍是合法方向编码但cursor在右侧；remaining3→4仍≤Power4却令已走1+余4超过4；X6→10仍在map内却已走5>Power4。它们目前都满足 `ValidateStorage` 已有的方向范围/唯一性、remaining自身范围、family、occurred和map范围，因此不会靠无关shape错误伪装缺失几何校验。

每项分别走直接 `BomberBombState.ValidateStorage` 与官方 `BomberTestWorld.Restore`。后者真实传递 `RuntimeOnlySnapshot` 至Engine owner，组件 `OnHydrate` 调用同一校验；`AssertOwnerFailure` 同时要求真实WorldInitializationFailed及精确InvalidOperationException内因，消息必须含continuation。每个负控先恢复合法前像并逐字recapture，再捕获实际corrupted快照；拒绝后还要求源快照不变。若合法前置或错误包装发生变化，实际执行必须记为前置失败，不能记作目标RED。该slice是Runtime-only hydration，不继续Tick恢复后的Native空世界，也不声称paired续射恢复已闭合。

Power7/8用例使用现 `AuthoredFixture` 真实compiler export和Reader，私有输入仅设置BombPower initial/maximum，真实World属性须相等。现schema两列均i64/minimum0，无maximum6；故不能把pending硬编码6解释成公共作者限制。Pierce held-slot是与既有 `SpecialBombProductionTests` 相同的标明资格fixture，真正炸弹来自公开Ability Activate的wire RPC，经生产Place设置Power、full source、chain、fuse、phase和库存扣减。测试只移动玩家，未补写炸弹字段，也未调用Trace/Resume/Observe代替Tick。

Fuse等待没有多走一个接收Tick：`WorldManager.PublishEgress` 在Tick末递增World.Tick，`while (Tick <= due)` 处理due这一Tick后退出。该Tick留下真实首砖Original和pending remaining6/7；测试先核Native首砖变air、下一砖仍soft及所有tuple，随后 `Record.Exception(Manager.Tick)` 才覆盖下一Tick的 `BomberTerrainTransactions.Begin -> Validate -> DrainResults` 顺序。因此Power8预计在remaining7硬上限失效，Power7是同路径正控。真实运行仍须核对失败行与CLI/tool identity，不能从静态审查断言实际已到该层。

最小后续生产方向仅供真实RED后授权：组件续射校验应以原origin、direction、Power核同轴/正向/距离与remaining关系，并保留所有现full-source/family/occurred/唯一性guard；普通pending row的remaining应关联实际源Power而非固定6，继续checked运算与来源验证。不要强制所有accepted arm满足距离+remaining==Power（普通非Pierce终止remaining0可能合法），也不能仅凭别的臂已有contact历史拒绝原点Unstarted。当前持久化数据没有按臂不可逆接受记忆；这11例不证明所有replay恢复攻击、任意大Power、per-bomb distinctChest上界或UGC声明cap。

轻量证据 `.run/per-bomb-continuation-proof-independent-review-01/verification.json` SHA `e82d88bf5e0da0164335ab1b9ea91856a3b598b197cdac34f1dcd950972f9a79`，真实命令 `node .run/per-bomb-continuation-proof-independent-review-01/audit.mjs`，exit0。它核精确两稿身份、当前物理类相等、11case静态计数、schema边界和17份实际输入身份；完整输入hash/tool路径在JSON。本审查仅写该独审报告及私有静态证据，无源码/index/GEN/构建/测试/Native动作；完整执行、paired recovery、UGC容量认证和正式M2准入仍未关闭。

## 真实先行RED复核

Root真实 `build22-ice-fixture-and-continuation` log/JSON/raw均child0、0warnings/0errors；`terrain-continuation-proof-red-01` 实际11total/2succeeded/9failed/0skipped，8.851seconds，JSON和独立 `.exit` raw child均2。所有记录的source start/end完全相等，sourceChanges为空，test仍精确 `e91d296cffec03164f772e95390dea9d5dea5532d9ab0e88b444cdc9171736de`。这里确认真正业务RED，不是编译、作者CLI或Native fixture错误。

八项axis/direction/remaining/distance × Validate/Restore各自在目标Assert.Throws失败，原始log明确均为“No exception was thrown”。直接校验四项未抛InvalidOperationException；官方恢复四项未抛EngineHostException。它们此前每例真实Original、Unload、accepted frontier、合法Validate/Restore/recapture的前置均已越过。负控未拒绝，所以其后断言未执行；不得把拒绝后源不变或错误消息验证称为已过。

Power7正常通过。Power8真实日志先记录occurred45、remaining7、实际完整bomb/life/participant/generation/chain tuple以及Original receipt SHA `b93a24468bc18784410ab2cf77f9165feb431a2f27750dc0195feca115a4965c`；首Native破砖断言已经过。下一Tick46真实 `BomberTerrainTransactions.Validate` line645的“Invalid terrain continuation or reservation”经Begin line58到ProcessorPlan fault，再使test line171的Assert.Null失败。Power7同路径的remaining6与Original SHA `ef033875bcccc4ed28f0c718194b25fcc93a2757ce5325c81824fc0e1d2f0326`作为正控。Power8的后续第二砖成功和pending接续断言尚未执行，不能假称已证。

本次读完完整raw log、JSON与exit后，另外逐字读取log引用的17份 `.lwm`（9份合法accepted原像+8份corrupted像）和9个独立actual-original.receipt文件；所有实际SHA与日志逐项吻合。独审轻量证据 `.run/per-bomb-continuation-proof-independent-review-01/execution-red.json` SHA `5391497a6f30e12a7b41b01bfb5ee991b69f27d084fd202e8ee7c53753510438`，真实Node verifier child0，保留所有实际artifact路径/hash/full tuples、raw/log/JSON SHA和构建/运行argv。

运行记录Tests DLL `1a18d1b1e5ed779ff9ade7be356cb1385201e530f875928c80e9ad5c4a340a57`、Gameplay DLL `532cd6d2caf08f78ee6d022d4fcd595b367d00c460cb23da912821ce07d0172a`；Ecs `aa5520f37e22eb6337d4e9e5c33008684bb7fd51e598dad38ef404351dddbd49`、Gas `09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`；Native `c01599b8c31ea72185f2a206dbcc5c4ff8fb432c68bb61ea3dabab5e6d4ddb12`及build-info `f9752593b0d802b76996a5bcaa8fdda4a75d2f9449fd160d268e793029f3570d`。包manifest `652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`、Config commit `a991a517f9dbae255321c25d65fea0bfdfdca42f`。这些是当时记录身份，未用重用输出目录中的当前DLL覆盖历史身份。

## 普通pending源生存与最小Power校验建议

以下只读分析以本次RED的Terrain `4d9d2767e2fa2250a345b25a76d429e0178edc4427bc3585f499bdc14afc05c5`、Blast `701769cac2b57d5be3fb10bd39d387b1b13b8a35f0c089ff8c65b08cf6d8c843`及历史BombState `cf1e28598ba270d816a3d1e89b60c799c3c683946f20116d933714549efa0ff1`为准。后续读取时Root的BombState已出现新 `392b919fc6db7002b793be019681d0b46544ca8b56b2ffef0e7858a06ef8e59b`；本段不把该在写候选混为RED源或候选独审结论。

**合法未结算DestroySoft的源炸弹必须仍是同一live BomberBombEntity。** TryDestroy只能由实际bomb的Trace/Resume调用，frame与detail捕获bomb full identity/source/chain；同帧 `HoldsSource` 检查frame.cells，后续检查PendingSourceBombs和TerrainContinuations。BombSystem在Danger/Burn/Expired退休入口先检查这三类债。只有收到确切Original或拒绝才清pending；Unknown/no result保留债及live源。即使Danger时钟已过，它也不因此退休。RoundTransition.Prepare在任意pending或continuation存在时关闭清场/rollover，ResetForNextMatch的整批销毁在该准入之后；水熄灭/Bridge Occupants以及Kick只处理Fuse，普通破坏源在Danger，不能走这些Fuse销毁/移动分支。现Original消费预检已显式要求live/type，并对Owner、SourceLife、SourceLifeGeneration、ChainId、Family和ExplodedAtTick==Occurred全tuple比较，然后才接受reward/写续射。把同一纯事实前提前移到普通pending Validate属于现有不变量校验，不需要Native读取或新truth。

最小修改位置是所有专用kind分支continue之后的普通DestroySoft部分：先显式确认该kind；取PendingSourceBombs[i]，要求live且TypeOf为BomberBombEntity，再逐列比较既有Original guard中的完整tuple。据这个经过认证的源Power替换固定6，并保留remaining非负/map范围/方向唯一、cell/revision、reward预留与全部原校验。不得只对一个任意Get到的bomb读Power而省略身份匹配，也不得把source失踪当作“读不到就放过”。旧SourceLife可已死或已换代，它是不可变因果身份；不要新增“旧Life必须live/等于Participant.CurrentLife”的错误要求。已经接受的TerrainRewards也允许旧match债及source退休，不能把这个live规则套进ValidateReward。

非普通分支必须保留各自规则：Initialize；Regenerate；Clear；CircleClear；SpawnClear；StrongChest（这里是非bomb的强力箱生成，源bomb默认）；DestroyBarrel（真实bomb来源，但专属promise验证且remaining0，不续射）；FreezeBridge/MeltBridge（专属owner/完整receipt规则）。这九kind均已在普通guard之前处理，故不应全局要求每个pending有live bomb，也不应移除其分支guard。实际资源箱/强力箱的**炸弹破坏**仍是DestroySoft，属于live/full-source核验；不要因名字含Chest误绕过。

关于Root拟议几何分支：当前Ray只在step>=1破坏，普通源爆炸后不再Kick移动，故false accepted row应sameaxis、signed distance>0且<=Power。PierceLayers>0的producer从首次Power-step，到续射cursor/remaining、competition retry均保持distance+remaining==Power，且当前生产没有递减PierceLayers写点；可据此checked/long验证等式。非Pierce显式传remaining0，即使distance<Power也合法，应要求remaining0而不能套等式。Unstarted只允许原cell/fullPower。新增全source/几何pure校验不应引入Native单格读、重写source或重新确定来源。这只是源码不变量论证；新候选仍需非作者delta审查和同11例真实GREEN，并保留普通非Pierce及pending/Unknown/round历史回归。
