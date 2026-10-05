# 101 资源预算 profile 集成私稿交回

状态 **UNRUN**。只写父仓 `.run/budget-profile-integration-draft-01/` 和本报告；没有修改 Gameplay、物理测试、Tables、Reader、export、registry、tombstones、schema，也没有执行 .NET、Config CLI、GEN、Native、stage 或 commit。静态作者核验不等于运行证据，不作自审结论。Root 必须先在真实新公式下运行原 105，再按实际达到的失败决定发表此候选；原 Resource10、第六个触碰的 schema 缺口完整保留。

## 可发表候选与身份

| 物理目标 | 原 SHA256 | 私稿 SHA256 |
| --- | --- | --- |
| `games/101-bomber/Server/Tests/Gameplay/BomberObjectBudgetTests.cs` | `935511ee1e140dbc9a73516285314d1b164328d29169bce43ffdcbba63390787` | `15a2240b0d8dbbc775994b560351f68294898346f4d97bd3404efaa8f5c8deb2` |
| `games/101-bomber/Gameplay/Tables/tables/object_budgets.txt` | `1823d185c2d1916720d0cde7f185bfde6a9393d1a9c34c2d8ce97863f54b290d` | `8a47f7accdcbba16ba6e93b604cad248f1a927183fd246c6b58f42a6935cd7a7` |
| `games/101-bomber/Tools/bomber-config.test.mjs`（配表全量检查所需附带提案） | `f57008fdf64fe7a97387c60c824d23b8c162ca8ab857b313ee9169a5d63d4c42` | `bb2d3a9fafac5a25b8af1311f7e61080a9c9da876ae681a626a42b7d6b9aef1f` |

三个完整私稿分别为 `BomberObjectBudgetTests.cs.draft`、`object_budgets.txt.draft`、`bomber-config.test.mjs.draft`，对应 before 原件保留。第三项只把既有 Node 表投影测试的 `max_pickup_entities: 703` 改成 1607；其余字节不变。这是执行 Tables README 原检查命令所需的同步提案，不是新增用例或发布授权。

`composite-480000-final90000-object_budgets.txt.draft` 是现有行的最小 product overlay，明确提供 1703；SHA `b60798bf9edebba799f15cf90b787967ae4733e9bc42d2665d4adefe932143e1`。它应与 480000 match、90000 final 和匹配阶段缩放共同应用；不登记新 named profile，不修改默认或 `profiles.json` 来暗中收下组合。

作者默认表只改一个 numeric cell：703→1607。2784 bombs、336 walls、默认 Fire/Split disabled、M2 的六个 authoring/room profile closed，以及 provenance/行身份保持。本私稿不擅自提高 bomb provision；`fuse-2400` 自己的作者 overlay 仍 2912。

## 原 105 的限定期待迁移

机械统计仍为 105（Fact + InlineData），全部原方法和 case 保留。`changes.json` 列出 26 个唯一 before/after 替换及理由；`verify.mjs` 从候选逆序执行每项唯一逆变换，逐字还原原件和 SHA `935511…0787`。除这些明确清单外，所有断言、fixture、负控和源码字节未变。新增一条实际物理 container 容量断言属于 Root 明确追加授权。

| 原 profile case | required pickup 新值 | global ChestLimit 新值 |
| --- | ---: | ---: |
| default / skills-on / fuse-1800 / danger-300 / danger-500 | 1351 | 245 |
| match-360000 | 1127 | 189 |
| match-480000 | 1607 | 309 |
| final-circle-90000 | 1447 | 269 |
| final-circle-140000 | 1255 | 221 |
| skills-off | 1106 | 245 |

这十个 case 增加明确 `chests` 输入；原 participant8 / hit3 仍同一 tuple 断言。原固定 global5 与整局发行语义不一致，Root 追加允许修正，同时用 `PerBombContactLimit == new BomberBombState().ContactedChests.MaxCapacity` 保留每弹 storage 目的；现实际声明仍5，不能伪称已52。没有把所有 profile 的5统一换成245。

默认不足边界638→1350，精确最小639→1351；composite727→1703。Supply 原完整发行数不变：skills-off 开9为1115，on 开11为1362；关 frenzy source 后 off 开8为1114；两顺序 frenzy source 的 pickup 仍1115。原 bombs2648/2672/2888、very-large-window9448928369、wall336、溢出和一切来源负控未动。`1114/1115` 一低一等边界代替原642/643，并保留拒绝和精确接受两个 case。

唯一 enabled Fire 负控保留 `enabled=true` 原输入和 `Assert.Throws`，diagnostic 从 dormant 改为完整 `object_budgets.max_bomb_entities: required=4064, provisioned=2784`。精确理由：真实 producer 支持后，默认普通2624加 Burn30ticks×8participants×6placements = 1440，仍必须拒绝；它不是被删除的 guard。Fire effect_key、skill slot/code、Remote、Split、M2 等其他 guard 全保留。Root 给出的 integrated 生产私稿 SHA `1e334fa9909037648af90a4a24969b56ba142fbc48a4671c022fa632dc6258a8` 含该义务；其合法 level rename 的独审 P2 尚由 Root 单独修复，本私稿没有以新测试期待掩盖它。

原 Resource10 当前仍 SHA `2d84fa9f0cb161c9e74a2ccd37ecec828f9a947be1cf5b6ca12b4d709ac0aa8b`；245/109/5 和原第六次触碰断言没有改。

## 42 个作者 profile 的静态数值核验

`manifest.json.profileProof` 从实际 base txt + 各 profile `layers/product/*.txt` 合并读值。48 个注册 profile 中42个 Legacy，另6个明确 `runtimeEligible=false`；未把默认算进42，也未删除6个 closed profile。逐项记录真实 M/C/L/F/R/O、tick20、SpawnChest stage数5、发行1，以及 Soft/资源/Strong reward maximum。没有假设 profile name 就等于所有有效值。

这42个实际输入的最大 required pickup 是 `match-480000` 的1607；默认 on/off1351/1106。480/115 on/off1607/1298；480/90 on/off1703/1370，组合超出1607必须匹配override。非零 Drop/Special/Gold 概率只决定奖励是否可能，不折扣最坏完整输出。F0、短 interval、UGC Soft 奖励变化继续经真正 checked formula 计算，不用1607作合法 UGC硬上限；低于真实 required 的作者 provision 仍拒绝。

132个完整作者输入逐文件 SHA fence 位于 manifest/proof。按 manifest 的既有分组顺序将 `absolutePath + TAB + SHA + LF` 拼接计算组合（不是全路径排序）：before `76f66efcaad58e7f6325651000402d7714f8bb539350f749f5e3386c15641134`；只发表 default cell 的 after `e5b2b9611419938c5f305d01dc6551cd7133ba150c48428130cca6d8377546cd`。registry、tombstones、所有27 schemas、profile清单和overlay原件均不变。Root 据独审 P2 更正此描述；原逐文件哈希与组合字节没有改动。

## 实际声明与消费边界：703 不能直接与1607等同

`BomberWorldRuntime.cs:36` 的 `TerrainRewards` 703 是已结算但未落地的持久输出队列，**不是存活 pickup 全集**。真实实体/held/death debts/unpublished reserve 的共同 credit 在 `BomberTerrainTransactions.Server.cs:500–515` 累加；新增破坏准入:306只比较共享 `PickupCapacity`。增加 table provision 不增加该队列的物理槽，也不能证明所有允许输入均可表示。

单批输出的精确局部约束比 `64×6=384` 更窄：`:239` 最多64 cells；`:277` 绑定 chest 只能在空 frame 接受，随后普通格看到已绑定 chest 会拒绝混批。默认未绑定 Soft 每格至多1，普通64；合法 UGC Soft最大4，普通最多256；单个 Strong最多6；单个 Gold最多4。`End:350` 用 `cellIndex*4+i` 发真实 ordinal，普通最后槽至255；绑定6奖励的 ordinal0..5合法。这些都是新增一批约束，不是累计队列上界。

`Begin:183` 在真实 Original 上把 rewards逐个 Add 到已有队列，`:208` Clear只清 transaction/details/reserved，然后才 PlaceRewards。`BeginFrame:48–51` 只清 transient集合。`:520–548` 会因 transition gate、无安全位置、满credit或 `CanMaterialize=false` 保留行；没有 End 自动清空持久奖励的路径。

有具体跨局静态反例：`BomberResourceRewards.Server.cs:57` 永久保留 GoldenHeart/KickQualification，`:48` 的真实 Strong gold非零概率200允许每局5次各出1颗 gold；不按概率折扣。`RoundTransition.Prepare` 没有 TerrainRewards空门，`StartNextGeneration`不清它；accepted row校验在TerrainTransactions:713允许原 `Match <= currentMatch`。141局可有705颗累计 gold（其他奖励正常落地），在旧gold703时下一次 Strong full reserve6得到共享709，仍小于1607，真实 Original执行第704次 Add即超703。还可累积 disabled Fire/Split candy 或 Kick。该路径尚未用真实 Native 跑到141局，**不是已复现结论**；但它明确否定「单批≤384就已经证明队列703足够」的推理。

建议独立私稿负控计划：使用真实 Legacy default或skills-off配置（1607），通过正常强Chest/三次独立bomb/Native Original持续发行，按真实 RNG结果收集 gold，全tuple记录并走真实 round cleanup；确认旧债跨局、非gold正常消费，直到队列703，然后再开一个Strong。要求观察共享credit仍≤1607与真实SyncList拒绝位置，不能直接注入704 synthetic reward当生产证明。可先用现有 `BomberRoundRolloverTests` 的真实累计/来源检查方式验证几局不清债；该旧测试是M2场景，不能声称它已证明默认Legacy141局。若运行过长，可用合法 `gold_heart_permille=1000` 作者变体（Maximum不变）每局确定5输出缩短发现成本，但仍保留默认200的数学可能性。Root应先选真实 queue admission/backpressure或新Release队列预算，并验证完整Original保持；不要求将703盲扩为1607，也不在本私稿实现。

`BomberRespawnCarry.cs:59` 的 `DeferredDeathDebts`703是 **participant-owned旧life非空财富债行数**，非pickup实体数。`DeathDrops.Partition:20–23` 先按完整death tuple防重复，再仅在current Pending>0时移入旧债；每行至少1credit（`DeathDebt.Validate:50`拒deferred empty）。`:86–93`计当前+全部旧债，`:104`在CarryPresent时只读继承账、不会重复计 dormant seed；同一继承转移不mint财富。`:139–145`逐旧债先落地、完成Remove，再当前；真正 materialize gate、地格、bomb、空位与共享容量保留余债。`RespawnCarry.OnHydrate:25`比较total pending与共享1607；没有单独703credit上界。`SuccessorLifecycle.Advance/TryLand`要求真实reservation/transfer/eligibility/landing，但没有DeathDropPending==false gate；RoundTransition.ResetParticipant只清spendable inheritance，注释明确保留非spendable旧债。

因此不能据703<1607直接裁定必须扩 DeferredDeathDebts；目前查到的保守证明仅 `deferred.Count <= totalPendingCredits <= sharedCapacity`（还须在正常生产而非只hydrate证明）。尚未证明同一 owner703非空旧life债真实可达，亦未证明始终≤703。新测试计划应以真实pickup→base/skill/gold→死亡capture/partition→successor transfer逐轮积压，保留一行一新fullLifeTuple，观察旧债先消费与继承守恒是否给出更强界；既不能用重复死亡tuple，也不能用手改carry制造704行来替代producer证据。若无法保证空间/债优先次序仍让新credit进入，同owner704反例就尚未成立。声明不在本稿改动，这一点与上面TerrainGold的具体跨局路径区分。

其他实际上限：object budget三项是schema i32且minimum0、无声明maximum；Calculator仅Positive/RequireCapacity及checked整数拒绝，不能从schema推导物理容器可增。`BomberBombState.ContactedChests`目前5、`BomberChestState.HitBombs`3、pending terrain列722、placement格361、participant roster16各有自己的语义；Legacy准入仍8/19，不能以roster16推出M2或公共 ReservedSlot16已获准。Native实体数由host `EffectiveMaxLiveEntitiesBudget`和各真实producer准入共同限制，不能用table1607直接保证整局所有对象与1MiB blob/64MiB World记录可容纳。contact/finite fire regions/schema15/完整bytes由Root另外交付。

## 官方同步与 Root 的窄验证序列

官方入口来自 `Gameplay/Tables/README.md`、`Tools/sync-config-readers.mjs`、`Tools/sync-config-export.mjs`。固定 complete07：

`C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261003-controlled-game/complete-release-07`

manifest SHA `652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`；packaged config metadata SHA `5c0fcbc2c63bfcb750254446d2fd44bdabcf139e035335b71ff24057ab979631`；它的真实 `config-compiler.exe` SHA `de8c796b2ce3069d774e18d5fd686635dbf6158806e1f85e9f3d316751bb3263`。wrapper和authoring源码也有输入fence。入口执行官方 release校验再选择packaged binary，不能换到本机任意Python/compiler来声称complete07 export。

1. Root先真实跑新公式 + **原105**，保存actual discovery105、各失败定位、child/log/JSON/exits和 fresh assemblies。作者源/测试发表前校验原件hash和候选hash，重新核132source fences；只发表已真实到达的窄旧期待变更，不把前置编译/CLI/配置错误算期待RED。
2. Root在源窗口分别发表所选 test/table/附带Node期待；表作者变化只cell。声明703积压问题独立处理，不借export自动解决。composite1703仅匹配显式author overlay，不改变48profile registry。为正式同步进程设置 `LUMIO_CONFIG_ROOT` 与 `LUMIO_ENGINE_CANDIDATE_ROOT` 都为上面complete07，校验manifest+metadata+exe+wrapper输入SHA。
3. 从game root串行执行 `node Tools/sync-config-readers.mjs`，再 `node Tools/sync-config-export.mjs`。第二条工具本身对default+全部48profile分别创建**两份全新临时输出**，client/server/csharp集合与每字节相等才写回；不是仅double default。export profile Reader必须等default Reader。
4. 保存真实命令、child退出码、完整logs、source before/after fences及输出hash。Reader实际输出54个（两端各27），adapter `Gameplay/Config/BomberTypedTables.cs`；schema未变这些应与 `proof.json.readerOutputBaseline/adapterOutputBaseline`字节相同。内容输出default `Server/Config/Tables/{server,voxel,manifest.json,origins.json}`、`Client/Config/Tables/{client,manifest.json}`；profiles为 `Server/Config/Profiles/<48name>` 和 `Client/Config/Tables/profiles/<48name>`。两端每个object_budgets行应1607，fuse-2400仍独立bomb2912；所有manifest/content变化从官方输出来，不手改JSON。
5. 确认源仍等发表后的fence，执行 `node Tools/sync-config-readers.mjs --check`、`node Tools/sync-config-export.mjs --check`；再按README `node --test Tools/bomber-config.test.mjs Tools/sync-config-readers.test.mjs Tools/config-side-isolation.test.mjs`。新export仍包含6个M2作者profile，但真实配置准入必须继续按原105明确拒绝map.layout_kind。42Legacy逐项读官方Reader并核真实 required/provision与manifest记录；单独验证480/90无override拒1703、对应override1703接受。
6. 新表和限定test发表后，Root fresh build真实跑完整105、原Resource10及相应producer/restore负控；记录真实到达结果。Resource10第六contact若仍原schema5继续是合法RED，不改测试掩盖。所有检验以Root实际窗口为准，非作者先行宣称GREEN。

注意实际原105的 `AuthoredFixture.Compile()` 直接找 `LUMIO_CONFIG_ROOT/tools/lumio_config.py`；complete07只带packaged `.exe`/Node wrapper，不带该文件。上述sync命令使用complete07官方route正确，但不能把其环境直接交给原105并称其已跑配置行为。Root对原105应继续使用锁定 `LumioConfig` checkout（既有运行记录config source `a991a517f9dbae255321c25d65fea0bfdfdca42f`），与complete07 metadata来源核对后另存CLI执行身份；改fixture为packagedroute需独立授权/实现，本候选保留原fixture逐字不改。这两条authoring route的证据不可混称。

## 机械证据与停止

`prepare.mjs` 仅私有拼接与作者txt静态计算；`verify.mjs`仅hash/逆变换，不加载C#、不导出Tables。一次静态核验曾把manifest的config metadata SHA误当exe SHA而触发断言；已根据官方metadata分别核metadata与exe，现proof记录二者正确身份。这是机械脚本前置失误，不是Native/test RED。

manifest SHA `d75ad37b79beacdc93d13b2cea61bca3f652996bcdf5be278b03943e043c69f9`；完整 `proof.json` 记录全部source/current fences、54Reader与adapter baseline、官方compiler身份和inverse证据。期间Root自己的physical Calculator `2b228…94a`→`1e334…58a8`、Reward `adc70…feac`→`1958…5c06`变动在proof单列；本作者未写这些路径，不能说全部仓域0drift。原105、Resource10、132table作者输入和三个提案物理目标在核验时保持原件。

所有C#和export/profiles验证 **UNRUN**。交回Root指定非作者独审，本作者到此停止。

## Root 实测更正（2026-10-03 11:05 UTC）

以上作者静态交回原文保留；下列真实结果取代其相应假设。合法 kind5 的实际 LedgerMode 为 `GoldenHeartOwnership`，不是生产拒绝分支中的 `GoldenHeart`。`BomberResourceRewards.Server.cs` 未改。原完整 Golden Native 两例实际2/2、零skip、raw0，证明公开强箱经过三种独立炸弹和 Native Original 后金心落为实体且不留该奖励队列；`strong-golden-native-red-43` 的文件名不代表失败。因此撤回上文“Gold永久保留”和141局705颗的反例及由此提出的Gold P1。KickQualification与disabled Fire/Split/Remote特殊糖的长期队列仍缺实际累计证明；DeferredDeathDebts703的真实可达界也仍未证明，不据表额度1607盲扩两容器。

原105在新公式真正跑出76pass/29fail后，Root发行独审认可的26项限定迁移。完整跑测104pass/1fail揭示 `SupplyFrenzyDisabledConsumerCannotBeAnEnabledCandySource` fixture 没有关闭skills；继承默认skills=true，其精确1351+5+2+0+2+1=1361，所以上文将此例描述成skills-off/1114不成立。Root仅修此一个期待为1361，保留fixture和全部case；target1/1后完整105/105、零fail/skip、raw0，证据 `games/101-bomber/.run/v14-fullpack07-native-20261003/object-budget-resource-migration-green-45.*`（Game61ffd/Testsaffd，build40）。

完整 Strong11 首次10pass/1fail仅默认required639期待已过时。Root仅迁639→1351，精确逆变换还原原件；build41完整11/11、零skip、raw0，证据同根 `strong-complete-budget-migration-green-47.*`（Game61ffd/Testsdcb164）。原Resource10源2d84不改；其build35实际9pass/1fail仍保留第六contact的声明缺口。

官方07 compiler已实际同步default+48profile，各两份fresh导出，共98次、147集合逐字一致；54Readers+adapter不变，2940两端输出及132作者输入已核哈希。Root证据父仓 `.run/resource-profile-root-publication-01/official-export-proof.json`；check-only及Node工具验证另记实际结果，不用本作者UNRUN状态替代。上述Gold/Supply更正已经非作者审查，报告 `.sdd/101-20261003-resource-profile-runtime-corrections-review.md` SHA `e808b78e54e5717f0be9b257505ad4840e62803e50d6756282761fcf2c9b1f06`。
