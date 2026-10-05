# 101 Frenzy 迟到 Original 与真实后继生命：只读时序调查

日期：2026-10-03。作者：capacity_schema。范围：只读实际失败、当前 Game 源码和 official06 Runtime API；本轮仅新增此报告，未改生产/测试/声明/配置/生成物，未 build、GEN、format 或执行测试。

结论：旧用例的 Ready 是错误的 fixture 前置。它把已关联但仍 Dormant 的新 Life 当成了已经落地且保护结束的 Life；被扣留的唯一地形 Original 恰好阻塞出生选择。不能靠延长等待或施放技能让该 Life 在扣留期间落地。Root 提出的私有 UGC `frenzy_fuse_ms=10000`、先真实死亡/落地/保护结束，再由旧弹自然到期产生并扣留 Original 的顺序，得到当前作者 schema 和生产校验的支持。调查时未执行的门保持在第5/6节历史记录；随后 Root 实际单方法 GREEN 已独立核实，第7节闭合该私有 UGC 场景。它不证明正式默认1.2秒跨复活时序。

还有一个必须避免的 fixture 陷阱：杀旧 Life 的三颗辅助炸弹放在 target 的当前位置。若把死亡提前但仍在旧 Frenzy 弹的 `(5,5)` 原点杀它，将通过真实连锁提前引爆旧弹，并可能提前毁掉 `(6,5)` 砖，破坏 10 秒时序。杀弹位置必须与保留弹隔离，并使杀弹射线没有可破坏物，不产生阻塞出生的 pending 地形事务。

## 1. 保留的实际 RED 与身份

实际方法：`BomberFrenzyProductionTests.ActualDelayedNativeOriginalFromOldFrenzyLifeCanDamageItsRealSuccessorLife`。

证据目录：`C:/Work/LumioGames/LumioGame/games/101-bomber/.run/v14-native-production-20261003/`。

| 证据 | SHA256 |
|---|---|
| frenzy-delayed-observe-01.log | `695d96b9dfe42c620e7bd7f69011683709ed89bd84cf324eac038c40ba72a1e3` |
| frenzy-delayed-observe-01.json | `22cc718c9fe71ff24ae00ee47d52ed3bd4e34813925b41853d7a654e06db2a8b` |
| 失败前像 BomberFrenzyProductionTests.cs | `7ef4bfc5bfe6e91ad29f2068f33cad35cbb6cfe28546b75438987809bfd4d041` |

JSON 实际 started=`2026-10-03T05:53:38.7985984Z`、ended=`2026-10-03T05:53:44.5167331Z`、raw child exit=2。日志 total=1/pass=0/fail=1/skip=0；原第543行仍为 expected Health4 / actual6。官方 manifest SHA=`8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`。

实际 Tests DLL SHA=`3ef591c202edf1faba6eac5225f9b2177c2fa8c9cad9c7a2f0e7d02f3b276910`；Gameplay DLL=`9043262095be360d48921a114d9fa2f41b1d1c6795b423bc41dd01f43e8ce685`；Ecs DLL=`74da7fff23e1aa72b8e8b7d0fd93c8164447c636de47700e254d8404c0648def`；Gas DLL=`09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`。

原只读观察没有修改 Ready、增加 Tick 或改变断言。关键实际状态：

| 边界 | Tick | 新 Life / generation | SuccessorPending | player phase / protection | 位置 | pending | 保留弹 |
|---|---:|---|---|---|---|---:|---|
| ready-exit | 97 | `00000000000000650000000000000017` / 2 | true | AwaitingRespawn(2) / 0 | (1.5,1.5,1.5) | 1 | live Danger；无 Hit |
| accepted-before | 97 | 同上 | true | AwaitingRespawn(2) / 0 | fixture 移到 (6.5,1.5,5.5) | 1 | live Danger；无 Hit |
| accepted-after-1 | 98 | 同上 | false | Protected(0) / 157 | 真正出生到 (11.5,1.5,5.5) | 0 | 已退役 |
| accepted-after-2/3 | 99/100 | 同上 | false | Protected(0) / 157 | 同上 | 0 | 已退役；Health6 |

旧 SourceLife=`00000000000000650000000000000002` / generation1；源弹=`00000000000000650000000000000013`。Tick97 pending token=`bomber-terrain:0000000000000065:0000000000000001:0000000000000001`；当时 RightReach=0，Up/Down/LeftReach=2，continuations 和 hit rows 都为空。

## 2. 精确根因与不能使用的补救

以下路径均相对 `C:/Work/LumioGames/LumioGame/games/101-bomber/`：

- `Server/Tests/Gameplay/BomberFrenzyProductionTests.cs:511-525` 先等旧弹破砖，捕获/扣留 Original，再创建三颗杀弹。Ready 只看新 full Life live、`!RestorePending` 与 `ProtectedUntilTick<=Tick`，遗漏 `!SuccessorPending` 和实际 Vulnerable phase。Dormant 的 protection 默认0，因此误通过。
- `Gameplay/BomberTerrainRead.Server.cs:16-22` 任一 `PendingVoxelTransactionIds` 都使 authoritative terrain read 不可用；`Gameplay/BomberSpawnSelection.Server.cs:17-22` 在该 read 不可用时拒绝出生。
- `Gameplay/BomberSuccessorLifecycle.Server.cs:65-76` 实际 Applied transfer 立即更新 participant.CurrentLife/gen，随后尝试落地。因此关联已切换不等于已经出生。`:149-161` 配置 Dormant 时 phase=AwaitingRespawn。
- 同文件 `:129-141` 只在真实 SpawnSelect 成功时写出生位置、清 SuccessorPending 并设真实出生保护。它覆盖测试提前写入的 `(6.5,1.5,5.5)`。
- `Gameplay/BombSystem.Server.cs:49-55` 先接受地形 Original，再推进 successor/更新玩家，最后处理炸弹。Tick98 因此先把新生命落地并加保护，再处理旧弹的 accepted continuation。`:349-357` 正确过滤 AwaitingRespawn、出生保护和 exact Frenzy self immunity；没有错误伤害一个尚未出生的 body。
- `Gameplay/BomberTerrainTransactions.Server.cs:164-181` 仅在真实 Applied/Original 后生成原来源 continuation；`Gameplay/BombSystem.Server.cs:250-277` 随后处理并提交原接触。失效路径不是漏掉 SourceLife，而是接触发生时 target 尚受正确保护。

延长 sleep/Tick 无法解除被扣留的 pending 地形 read，故旧顺序不能变成合法已落地 target。`UseActiveSkillAbility` 也不能替代真实出生：`Gameplay/BomberMatchRules.cs:16-22` 关闭 Dormant 输入；`Abilities/UseActiveSkillAbility.Server.cs:18-32,79-86` 的 Blink/FlyKick 要求真实可用 terrain，pending 时拒绝。现 `ExecuteAuthoritative:36-76` 未解除出生保护；Bubble 反而提供伤害屏障。不能伪造 phase/protection，也不能用技能假设绕过这个前置。

## 3. Root 的 10 秒 UGC 提议：静态准入与来源存活

只改私有 author fixture 中 `game.default.frenzy_fuse_ms=10000`，保留 duration6000、concurrent6、minimum placement5、Life respawn3000/protection3000。20Hz 下 fuse=200Ticks，复活加保护名义120Ticks，给真实 transfer/health pipeline 留余量。8000 也是同一静态准入，但160Ticks 较紧，优先10000；不能假定异步 successor 一定在固定 Tick 完成，必须断言真实完成先于原 fuse。

| 核查点 | 实际源码与结论 |
|---|---|
| 作者 schema | `Gameplay/Tables/schemas/game.json:238-246` 为 required u32/minimum0，没有1200定值或8000/10000上限。未发现 repository/registry 的额外 fuse 定值规则。 |
| Game 参数准入 | `Gameplay/Config/BomberObjectBudgets.cs:144-158` 对 duration/fuse 检查有效 Tick>0，对并发/间隔保持6/5边界，没有 fuse<=duration 或 fuse==1200 条件。本项只是读取准入，不是对本人预算作者工作的独立审查。 |
| 真实初次生产 | `Abilities/PlaceBombAbility.cs:109-132` 从实际 Reader 读取 FrenzyFuseMs，计算真实 FuseEnd，走 Frenzy Create。`BomberFrenzy.Server.cs:23-51` qualification 来自实际 Applied health fact，完整 current Life/gen、cadence和并发检查都保留。一次 Place 不触发5Tick间隔或6并发拒绝。 |
| Promise/fuse 恢复约束 | `BomberFrenzy.Server.cs:288-305` 要求原 FuseEnd 精确等于 Reader Due(placed)，不要求 fuse在狂暴6秒内结束。`:175-202` 不许修改原始 fuse/chain，除真实已爆连锁来源；候选必须保证无提前 chain。 |
| 旧生命死亡后的弹 | `BomberFrenzy.Server.cs:155-172` 拒绝 future source generation，允许旧 generation；`:321-325` 校验完整 local Source ID，没有 IsLive 条件。`Components/Bomber/BomberBombState.Server.cs:202-214` 同样明确历史 Life 可以销毁，仅要求完整本 World 身份及正generation。 |
| Native fuse | `BomberBombLifecycle.Server.cs:13-40` 固定 Native HFSM Fuse 投影，未硬编码1.2秒 timer；`BombSystem.Server.cs:244-261` 在实际 FuseEnd<=Tick 时才发真实 FuseElapsed。旧 Source 死亡或狂暴停止生产不会缩短已发行弹的 fuse。 |
| 新 Life 无旧自免 | `BomberFrenzy.cs:14-16` 仅 bomb.SourceLife==player.Entity 且 SourceGeneration==player.Generation 时自免。真正 successor full ID/gen不同，可被旧来源命中。没有把 participant 相同当成自免。 |

`Server/Tests/Gameplay/BomberObjectBudgetTests.cs:398-460` 的 AuthoredFixture 已提供可审计真实路径：复制作者 schemas/tables/registry/repository到独立保留目录，修改该单列，再由真实 `LUMIO_CONFIG_ROOT/tools/lumio_config.py export` 产生双端输出；`BomberTerrainProductionTests.Scene:37-44` 接受这个实际 configDirectory，并使用真实 Native owner/adapter。候选应使用 Root runner 中已经固定的官方作者 CLI 环境，不手造 reader或表输出。本轮没有执行导出，静态 schema 支持不等于已经得到 export PASS。

产品边界：`.spec/decisions/0048-bomber-m2-map-packages-and-interaction-boundaries.md:55` 的正式默认是1.2秒；现作者默认表也保持1200。这个 case 必须标明私有 UGC long-fuse correlation 场景，不得作为“正式1.2秒旧弹能跨复活等待迟到”证明。仍保留其他1.2秒实际资格/fuse/cadence/self-immunity tests；新 case 验证已发行旧 full source与真实 successor不共享自免及迟到 Original 接触，不修改正式参数设计。

## 4. 可实施的真实顺序（仅后续 fixture 授权后写）

1. AuthoredFixture 仅导出 `frenzy_fuse_ms=10000` 的私有 UGC，创建 controlled Scene，仍保留 `(6,5)` 的1025 Native砖。断言 Reader为10000/defaultLife为3000+3000，当前无 pending地形。
2. 预备远离 `(5,5)` 的杀旧生命区域，例如 `(13,13)` 的 power2十字九格。以 Scene.Write 的真实 `Native.ReadCell.SectionRevision -> PrepareWriteV2 -> CommitV3(Status0)` 清 obstacle格，并确认实际 ground为陆地；如需设置 ground也走同一真实写接口。只写 fixture地形，不编造 SectionRevision、cell receipt或游戏 phase；保留右砖完整。几何与辅助杀弹均属于已有 integration fixture输入，不声称是完整 Host/client input验收。
3. 按现 TakeFrenzy 实际 Pickup/10102 Applied 激活资格，再真实 Activate Place 在 `(5,5)`，原下一 Tick 发布。记录 full sourceLife/sourceGen/sourceParticipant/bombID、PlacedAtTick、originalFuseEnd、originalChain、PromiseToken、Frenzy=true；断言 due=placed+200。
4. 将仍真实存活旧 Life的 fixture位置放到 `(13.5,1.5,13.5)`，再按现三颗 `BomberEffectIntegrationTests.Bomb` 产生真实10101伤害杀旧 Life。该 helper `:53-66` 在 target当前位置建 Power2/nextTick炸弹，因此需要步骤2与隔离距离。不得改旧 Source tuple/fuse或手改 targetHealth/phase 来代替三次实际结算。
5. 正常 `TickControlled` 推进实际 ingress/outbox/transfer，要求每个 pre-fuse Tick没有 runtime pending地形、旧 Frenzy仍 Fuse、原fuse/chain不变，右砖未破；任何违反立即报 fixture precondition，不重设时间或放宽断言。杀弹退场后只剩保留源弹。
6. Ready要求：participant.CurrentLife 是非default、不同于旧Life且真实live；participantGeneration>oldGeneration；新player full Participant/gen与participant匹配；`!RestorePending && !SuccessorPending`；player和participant实际phase均Vulnerable；`ProtectedUntilTick<=world.Tick`；Health6；真实受控 binding已指向该 successor。只读这些生产状态，不能赋值。
7. 以**原due作为上限**推进，必须证明上述Ready在 `world.Tick < originalFuseEnd` 已成立；如到期仍未完成，明确失败，不能延长候选fuse或sleep猜过。取真实 respawn journal/Applied successor结果证明 landing，而不是只看已经关联的 CurrentLife。
8. 继续正常 Tick直到处理原due（和现用例一样 `while Tick<=originalFuseEnd && pendingCount==0`），断言旧弹仍原full source，Native真实把 `(6,1,5)` 砖变为空；恰好1个 runtime pending、sourceBomb等于保留ID。确认该 pending 来自它实际 ExplosionTick，非辅助杀弹。
9. 从当时 Scene.Adapter.CaptureResultCheckpoint 复制实际 Original。断言对应 txn是 Applied/Original/Status0、TokenConsumed及原始receipt字节/section身份完备；不能造 Voxel结果或替换来源。绑定一个新且未恢复结果的真实 adapter，仅扣留这条实际 Original。如新life已Ready，其落地不再依赖被扣留前的 SpawnSelect。
10. 继续以正常Tick越过**这颗源弹实际 DangerUntilTick**，断言源弹仍live、pending仍指向它、新life仍Vulnerable/保护结束、Health6。`TerrainTransactions.HoldsSource:197-203` 与 `BombSystem:282-285` 会保留原来源义务，不用人为延寿phase；若有状态不满足应明确失败。
11. 在 Native已挖空且 late窗口成立后，沿现有 fixture Position helper把已经实际落地的 successor放在 `(6.5,1.5,5.5)`。这是测试目标几何，保留完整实际Life/gen/health/phase/protection，不声称 pending时通过MoveAbility的玩家输入移动（它也需要terrain）。确认当前位置和无Bubble。
12. 在另一个 fresh adapter上唯一一次 RestoreResultCheckpoint实际前像，再绑定同真实 Native handle/world的Prepare/Commit，保留原3次Tick以及全部原断言。`official06 .../Voxel/HostVoxelWorldAdapter.Checkpoint.cs:15-26,30-53` 支持复制quiescent实际结果、只恢复fresh候选，不支持在旧候选重复restore。
13. 必须仍 expected4、恰好1条源bombID与新Life匹配的 `damage_applied`、原fullSourceLife、原SourceGeneration及新LifeGeneration不同。保留原爆弹FuseEnd、Frenzy=true、旧Life destroyed断言。新增证据可观察实际10101 fullhandle、Ready/Status/Actual2与Hit targetparticipant/gen，但不得伪造EffectResult/Claim或替换这些既有断言。

为何步骤12仍可在 danger结束后结算：`BomberBlastTerrain.Server.cs:34-66` 校验原family/explodedTick，用实际 Native空格恢复原接触格 `(6,5)`；标准弹 Remaining0仍将该销毁格加入cells，只是不继续穿透。`BombSystem:330-335` 明确 accepted continuation晚于Danger仍欠原接触；`:250-277` 对真实cells提交Damage；pending Hit进一步保留源，不允许它在Applied前退役。它不会重新开启正常 danger接触窗口。这是所需Native late分支，不能用新炸弹或伪结果代替。

## 5. 本轮身份、待执行门与风险

当前读取源码SHA（相对上文 Game根）：

| 源码 | SHA256 |
|---|---|
| Gameplay/BomberFrenzy.Server.cs | `cec4553ae25cef58d4a916a0b08333c78a8cd6db7c144cfe7935dcd5f21dc25a` |
| Gameplay/BomberFrenzy.cs | `5f36baaabf43d30b80482beb234df9ce93e81aa8c9e75f94107095815cf25385` |
| Gameplay/BombSystem.Server.cs | `542af1c6a65bb93a91b8f836387814878ed3b5ef5502b3007dd904fdfbe68382` |
| Gameplay/BomberSuccessorLifecycle.Server.cs | `97f275969a8a8826a13007c1b315b5e7a258821853e6329013fc7b66dbc2f0de` |
| Gameplay/BomberTerrainRead.Server.cs | `23fa0155ee3eff1843e6a844833be2ed30c4ed71ec290fc8265d47523e89bafa` |
| Gameplay/BomberBlastTerrain.Server.cs | `681f14ad9420df3b0c4b1934172780e6f907fe5ebd42a43e4b0d58927d7660b8` |
| Gameplay/Components/Bomber/BomberBombState.Server.cs | `cf1e28598ba270d816a3d1e89b60c799c3c683946f20116d933714549efa0ff1` |
| Gameplay/Tables/schemas/game.json | `e5d408b675e95b6ec082aa61d2899daefba20de9c8d3f675e004557a9727402a` |
| Gameplay/Config/BomberObjectBudgets.cs | `2b2285078879efd035bfe4fd70840fadf60cb1034c860ded9fd76b4701cad94a` |
| Server/Tests/Gameplay/BomberEffectIntegrationTests.cs | `02a1b2b2102f31303bc77d343f41ab59b62492c0976f581290fa9454eeaca4a9` |
| Server/Tests/Gameplay/BomberTerrainProductionTests.cs | `6db06fe7ab2e1948a5269159e8a7d50ca684de8c0612c2c190f837c8c8b3c299` |
| Server/Tests/Gameplay/BomberObjectBudgetTests.cs | `935511ee1e140dbc9a73516285314d1b164328d29169bce43ffdcbba63390787` |

读取的 official06 API根：`C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233/modules/`，实际运行DLL身份见第1节；没有改该仓。

未执行：10秒私有author export、修改后的fixture编译、真实Native long-fuse/cut/late contact实跑、相关回归。Root需要在单一fresh build中保留旧RED前像，先核CLI实际输出和case前置，再读取实际fullsource/respawn/Original/10101证据及原expected4。10秒只是名义窗口；如果真实transfer比这个还晚，候选应以明确前置失败收尾，不把它写成已证产品bug或通过。

本报告支持最小fixture参数/事件顺序修正。没有证据要求生产生命周期、Source校验、出生保护或terrain guard修改；也没有证明默认1.2秒下“先爆破hold，再自然复活到可伤状态”可行。

## 6. Root 后续单方法 fixture 修改的独立源码审查

Root 在本轮调查后只修改此方法。capacity_schema不是这个 fixture 修改作者；收到after冻结消息后读取实际物理前后像和当前源码。

证据目录：`C:/Work/LumioGames/LumioGame/games/101-bomber/.run/v14-native-production-20261003/frenzy-delayed-successor-fixture-fix-01/`。

| 原件 | SHA256 |
|---|---|
| BomberFrenzyProductionTests.cs.before | `7ef4bfc5bfe6e91ad29f2068f33cad35cbb6cfe28546b75438987809bfd4d041` |
| BomberFrenzyProductionTests.cs.after = 当前整文件 | `145ce5bfce9257ed94962219475cd457e735362ad605db3950484b0de45aebce` |
| source-fix.json | `bfd9b781ab83f1ec1ede33d596229d1df657f74a93495433a38f1c6181c37ec3` |
| before.json | `c25eca8845730c7c7ae76fe0da023ad7574c2b76177638bc0b8ce95a9d48d9dd` |

独立复核不仅采信source-fix.json：读取完整actual diff（git no-index raw1表示确有差异），以该方法签名至下一Theory为边界，前缀和后缀逐字符均相等；当前文件逐byte等于after。已有chain `while (world.Tick <= firstDue)` 字符仍保留，未修改其他29case输入或断言。

after `BomberFrenzyProductionTests.cs:457-478` 实际使用AuthoredFixture官方CLI10000、原TakeFrenzy/ActivatePlace、真实Power2杀弹；新增十字清格调用的仍是Scene.Write真实NativeExpectedRevision提交，没有写phase/protection/source/fuse。`:480-498` 更强Ready明确拒绝SuccessorPending和非Vulnerable，仍有原Ready、旧Life destroyed、Frenzy、原FuseEnd、Health6断言，并追加before-original-due、pending0、旧弹live/Fuse/fullSourceGen证据。等待上限仍由默认Life3000+3000+64Ticks确定，若没有完成就失败，没有重设引信。

`:501-515` 先把已真实落地target停放在源弹十字外，再让旧弹原fuse真正破右砖；capture真实checkpoint、绑定fresh无结果adapter扣留；以原DangerUntil+2推进并确认target仍Ready/Health6、源仍live和pending1。`:516-528` 沿原helper设目标几何，fresh adapter原样恢复checkpoint，保留原3次controlled Tick、expected4、exact源bombID/新Life journal单条、旧fullSourceLife/SourceGeneration和新generation不同的断言。被删除的是诊断Console函数及调用；其实际RED日志和before源仍留原件。没有Fake EffectResult/Claim或伪造receipt。

源码审查结论：0 actionable finding；fixture职责及UGC10000身份明确，原行为期待未放松。它证明的是候选路径质量；修改后的官方export/build/Native实际执行仍pending，不能从source-fix.json的actualExecutionPending或此审查反推GREEN。Root后续运行若出现真实Native资源/出生超时或原Health4仍失败，应保留实际新失败并按它的边界继续调查。

## 7. Root 实际私有 UGC 单方法 GREEN 的独立闭合

第5/6节的 pending 属于当时调查/源码审查状态。Root 随后运行真实 build18 及此方法；capacity_schema 没有构建、执行测试或改 fixture。读取实际 `.exit`、JSON、日志、当前测试字节和四个实际 DLL，未只采信消息中的通过计数。

| 原件（均在第1节证据目录） | SHA256 / 实际结果 |
|---|---|
| build-18.json | `df7f3c353f098e066dbb7e4f24e9beb7f857d595713fba997e66b5666a6dbcd7`；child0 |
| build-18.log | `05f488bbc8e8a4c33e6a186e1431be04c6f1cd0f8e2b65a12804305ce9803dd6`；0 warnings / 0 errors |
| frenzy-delayed-successor-green-candidate-01.json | `44d92d372c3450bbf164b04278e2ba5d99bc9ff8065c34541a2371447f1b3d70`；child0 |
| frenzy-delayed-successor-green-candidate-01.log | `d12ed3dbff19447eaae4031369c79f0e6b8cb721aeeb0212fc8591b289e2ec0f`；total1/pass1/fail0/skip0，6s371ms |

实际命令过滤原完整方法 `*ActualDelayedNativeOriginalFromOldFrenzyLifeCanDamageItsRealSuccessorLife*`，minimum expected1；started=`2026-10-03T06:20:15.7705145Z`、ended=`2026-10-03T06:20:23.5474788Z`。build/run `sourceSha256AtStart` 中此测试均为 `145ce5bfce9257ed94962219475cd457e735362ad605db3950484b0de45aebce`，当前字节仍相等于第6节after。实际 Tests DLL 为 `373a0adeb6446b1353ccd014a453476ba13940c395399a967df2c4b091bdea7c`；Gameplay DLL 仍是旧失败中的 `9043262095be360d48921a114d9fa2f41b1d1c6795b423bc41dd01f43e8ce685`，Ecs/Gas 四库身份与第1节匹配，逐文件实际 SHA 同 JSON `assembliesAtEnd`，official manifest 同第1节。

该单方法实际通过包含源码中真实 AuthoredFixture CLI export 成功检查、10000 Reader/fuse、先发生真实 successor 落地与保护结束、due前 pending0/Fuse/fullSource、实际 Native Original 扣留/恢复、原3Ticks后的 Health4及完整旧SourceLife/gen journal断言。日志没有逐帧明细，故不另发明新Life/receipt具体数值；成功只闭合这些实际执行断言。原 `frenzy-delayed-observe-01` expected4/actual6 RED、其源码前像与观察日志完整保留。

最终独审结论：该 Root 单方法 fixture 修正质量与实际运行身份闭合，0 actionable finding。场景明确为私有 UGC 10秒 fuse；默认表1200、正式参数与生产生命周期没有因本次修正改变。不是默认1.2秒跨复活迟到证明，也不是整类29cases、整局或新发布包的通过证据。

## 8. 随后真实 Frenzy 全29项回归闭合

Root 又执行 `frenzy-production-full-green-candidate-02`，capacity_schema 仅读取原件。真实 `.exit`0与JSON exitCode0一致；日志 **total29/pass29/fail0/skip0，1m44s974ms**。command过滤 `*BomberFrenzyProductionTests`、minimum expected1，没有method限制；started=`2026-10-03T06:23:02.805454Z`、ended=`2026-10-03T06:24:48.4405863Z`。

- JSON SHA256：`e525478fa92b186e3e4d1cf7eb29716cfc056e21f62f65235a9c8d6cba80e401`。
- 原log SHA256：`b80973cae12da1803cad17c8df44aecb2b5aad52fc5da40f0e8374b7835b1305`，等于JSON logSha256。
- run源测试145ce…aebce与当前字节相同；四DLL记录仍为第7节Tests373a…dea7c、Game904…e685及同Ecs/Gas身份。

这是原类全部29项的实际候选回归通过，包含默认1.2秒生产资格/fuse/cadence等既有cases和明确私有UGC10秒的迟到Original case。第7节“不是整类29通过”的表述仅针对当时单方法证据；现在本节补齐整类门，不改变各case的参数身份。旧RED、前后像继续保留。全类GREEN仍不能把10秒case升级为默认1.2秒跨复活证明，也不等于整局、30分钟、全部Gameplay或正式新包验收。
