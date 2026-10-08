# 101 Resource profile 独立审查

**规格符合性：限定候选静态 PASS。代码质量：三个 profile 迁移私稿可交 Root 按真实失败窗口发表；P2 证据排序描述需更正。生产完整交付仍有下述 P1 未关闭项，不能据本审查宣称通过。STOP。**

本人为非作者审查者，依序读取父仓及 101 核心入口、测试与代码规范、brief、作者报告、完整三份 before/draft 差异和实际作者输入。只写本报告与 `.run/resource-profile-independent-review-01/`，没有修改物理 Gameplay、测试、Tables、生成物、索引或 Git 状态；没有执行 build、C#、Native、GEN、配置编译或 export。下文实际测试结果是独立核验 Root 已有日志，不是审查者新跑测。

## 被审查身份与保持范围

| 文件 | 原 SHA256 | 候选 SHA256 |
| --- | --- | --- |
| BomberObjectBudgetTests.cs | `935511ee1e140dbc9a73516285314d1b164328d29169bce43ffdcbba63390787` | `15a2240b0d8dbbc775994b560351f68294898346f4d97bd3404efaa8f5c8deb2` |
| object_budgets.txt | `1823d185c2d1916720d0cde7f185bfde6a9393d1a9c34c2d8ce97863f54b290d` | `8a47f7accdcbba16ba6e93b604cad248f1a927183fd246c6b58f42a6935cd7a7` |
| bomber-config.test.mjs | `f57008fdf64fe7a97387c60c824d23b8c162ca8ab857b313ee9169a5d63d4c42` | `bb2d3a9fafac5a25b8af1311f7e61080a9c9da876ae681a626a42b7d6b9aef1f` |

独立检查原件、私稿与物理目标 hash；核验时三份物理目标仍原件。审查者脚本对 26 项唯一 inverse 逐项还原，最终源码逐字等原件；105 个 Fact/InlineData 用例、原方法、所有未列举断言/fixture/负控字节保留。完整差异保存在独审 evidence 下三个 `.diff` 文件。`BomberObjectBudgetTests.cs.draft:46–66` 保留十个 case，新增 chests 参数区分全局发行；同时以实际 ContactedChests.MaxCapacity 对比 PerBombContactLimit，没有把每弹容量伪装成全局 245。实际声明 `BomberBombState.cs:38` 仍 5，`BomberChestState.cs:16` 仍 3。

`BomberObjectBudgetTests.cs.draft:165–171` 保留 enabled Fire 的 true 输入与拒绝 guard；新诊断 required4064/provisioned2784 与默认2624加30 Burn ticks×8×6=1440一致。Split enabled/effect/skill/slot、Remote参数、M2地图与溢出负控全部仍在。Supply边界 1114拒绝/1115精确接受及原 bomb2648/2672/2888、9448928369大窗口断言保留。作者表只有703→1607；bomb2784、wall336与来源/provenance字节均保持。Node也只同步这一个期待。fuse-2400原作者覆盖仍2912。

## 实际作者输入的独立算术核验

独立读取 132 个实际 Tables 输入并哈希，包含 registry、tombstones、27 schemas、48 profile清单、各原overlay。它们全部匹配作者 fence；48中42 Legacy、6个runtimeEligible=false，没有新增/删除 profile。审查者重新合并 base与每个 product overlay，用 BigInt 按有效tick与exclusive stop重算，而非调用作者 prepare/verify 脚本或把 profile名当实际值。

推导式与生产 `BomberObjectBudgets.cs:95–125`、`BomberResourceRewardRules.cs:30–47`一致：初始area×Soft最大输出 + 波数×4×orbits×资源最大输出 + SpawnChest数×每stage发行×Strong最大输出。概率非零即完整最坏输出；不按permille折扣。42项逐字段匹配作者proof，最大值是match-480000的1607。默认on/off1351/1106；match360000 1127，final90000 1447，final140000 1255；global ChestLimit分别245/189/269/221，match480000为309。各自 per-bomb仍独立5。

独立组合480000/90000得on1703、off1370、global333；默认1607不够组合on，保留组合拒绝和显式1703匹配override。private composite overlay SHA `b60798bf9edebba799f15cf90b787967ae4733e9bc42d2665d4adefe932143e1`不登记新profile。独立有限UGC数学探针first0/interval50得到超过1607的required；生产仍checked推导再RequireCapacity，未加入1607硬上限。该探针只是算术检查，未声称配置/Native已经接受。

## 实际已有执行证据

已逐项读取以下原始JSON、日志与raw exit，重新哈希日志等JSON记录，计数从完整summary提取；完整命令、输入源码、程序集、config source、JSON及日志hash保存在独审 `verification.json.runs`。

| Root运行 | total/pass/fail/skip | raw exit | log SHA256 |
| --- | --- | --- | --- |
| object-budget-current-baseline-34 | 105/105/0/0 | 0 | `76c8f68a889f6474b5903aa3ad825ddb8cc5cc3be111f5c6c5ef25f8a9e9fe99` |
| object-budget-resource-pre-migration-35 | 105/76/29/0 | 2 | `d789a5ed24be7b5153c75d46da270c857076c948895b4e66b4e9a3fd1e7383dd` |
| resource-formula-first-35 | 10/9/1/0 | 2 | `0d05cb28b8959e186bb015c3d86abecda1d726840c3b706997a2cd5aea0ea721` |

34绑定原105与Calculator2b228…94a；35绑定同原105、Calculator `1e334fa9909037648af90a4a24969b56ba142fbc48a4671c022fa632dc6258a8`、Reward `1958df1566fac9d399ab3a5371f4cea5635e76502671be02e2a5a010e4b85c06`。Resource10源仍 `2d84fa9f0cb161c9e74a2ccd37ecec828f9a947be1cf5b6ca12b4d709ac0aa8b`；唯一失败实际到达 SyncList.Add→TryObserveChest第六个contact，不能当作期待可删。尚没有迁移后的105 GREEN、42 Reader实际准入、官方双端export/check或队列Native证据。

## Root追加的 Fire level身份修复窄审查

当前Calculator SHA `c1b3b0bfa543bc440044cfdcb842e313df91ab7eaefbcc952c132922ed2a28ec`，相对1e334仅将level显示Name查询改成已ValidateProducers核过的fireSkill.Id+Level1；审查者精确inverse再次还原1e334，无资源公式漂移。当前生命周期 `BomberBombLifecycle.Server.cs:74–79` SHA `084552b027ce7c0819d5ddfc83df2803e868caf0986361ff9bb187477eb98e9c` 用同一SkillId/Level1经Config.SkillLevel取真实Duration，再走Native EnterBurn。没有改为固定1500或手动绕过Native。

同一重命名测试源码 `4dce485d63f285ed034eb7ad591d68961f1129cbaedf398da4b55571ff3895d2` 的真实序列已独立核验：budget-red36为0/1/raw2，落在Calculator旧Name；native-burn-red37为0/1/raw2，落在Send旧Name；native-green38为1/1/raw0，绑定当前c1b3与0845。green日志SHA `911157ad531a5bb213f1f4b383632c87a24861ec2a184fcfbb091555a1b403f4`，JSON SHA `e248ba52ed95ffdca46255ab183bccdfc46df28f1006069e80124eb38618b45b`。测试通过官方patch validate/apply/registry verify保留permanent116032、实际Pickup→PlaceBomb→Native Fuse/Danger/Burn/退休及完整归属断言，未改phase/clock伪造成功。窄修复静态与此实际场景PASS；生命周期旧源码全文未作为before交付，本审查不宣称其整文件字节inverse，也不从1条GREEN外推整个资源/Fire交付。

## 未关闭发现

**P1 — 持久TerrainRewards703缺实际队列准入与跨局上界证明。** `BomberWorldRuntime.cs:36`声明703；`TerrainTransactions.Server.cs:306–307`只检查共享PickupCapacity，`:183`在Original后逐条Add，`:208–221`Clear仅清transaction/reserve；`:520–548`不能落地则保留。`ResourceRewards.Server.cs:57`永久拒绝gold/kick；`RoundTransition.Server.cs:25–94,137–161`允许保留债进入下一局，`:713`accepted奖励允许旧Match。不是单批最多64或64×6就能证明累计703。default每局5个Strong、gold200permille非零，静态允许逐局积压；合法gold1000变体可确定生产。在703旧gold时下个Strong共享预留709≤1607，却会在真实Original尝试第704个queue Add。没有真实Native复现141局，本报告明确只给静态反例路径；Root需真实producer/backpressure或可证明的新Release预算及Native完整Original证据，不能盲扩为1607了事。

**P1 — 黄金心脏真实消费已存在，但地形奖励一律拒绝发布。** `ResourceRewards.Server.cs:48,57`可选择gold却始终CanMaterialize=false；`Abilities/PickupAbility.cs:81–85`已有真实goldcap消费准入，`BomberDeathDrops.Server.cs:56–66,163`也有真实gold转移。既有consumer存在仍被无限延期，既会使Strong实际输出行为不完整，也参与上面queue风险。Root下一步应跑两条真实Strong gold Native测试并核地形→item→consumer，明确准入理由，不能据本次profile数值PASS关闭。

**⚠️ DeferredDeathDebts703仍未证明。** `BomberRespawnCarry.cs:59`是非空旧life债行数；`DeathDrops.Server.cs:20–23`排除重复tuple、仅非空加入；`:86–93,139–145`累计credit且旧债优先消费。只能保守得到行数≤pending credits，未证明同owner≤703，也未证明真实同owner704可达。不得由703<1607直接裁定扩容或虚构704行。Root须以真实死亡capture/partition/successor和守恒证明上界或反例。

**P2 — 作者组合SHA的排序描述不精确。** 作者报告`:46`声称按排序路径计算，但作者verify`:24`直接按manifest分组顺序join。给出的before `76f66efcaad58e7f6325651000402d7714f8bb539350f749f5e3386c15641134`在manifest顺序可复算；真正全路径排序为 `e9222c59a53b94cff04956f4b2e2295e1d1e03e9a69d6a2f0d8cdafec4ec9559`。逐文件132fence均正确，不阻止窄迁移；请把报告排序描述改成manifest顺序或统一排序后更新两组SHA。

## 证据与停止

独立脚本 `node .run/resource-profile-independent-review-01/verify.mjs`最终raw0，记录private输出hash、105精确inverse、132源fence、42项BigInt重算、组合、旧执行日志身份、当前生产源码hash。`verification.json` SHA `d6542c864c9bcf81f93e07f96a60cbfcc431d06e60ea1212312ce14c501ce5d9`。初次轻量校验发现排序描述差异，随后适配已有日志UTF16/BOM及源码LF；这些均是证据解析/审查脚本前置修正，绝不作C#/Native RED。

当前manifest原fence的Calculator2b228→c1b3与Rewardadc70→1958属于Root已通知的生产窗口，独审证据单列；不能声称全仓零漂移。作者132Tables输入和三份物理发表目标保持原hash。完整官方Reader/export、Resourcecontact声明15/bytes、Strong Native和队列收口均仍由Root串行执行。本独审到此STOP。

## 后续运行更正（2026-10-03，以此段为准）

原文与旧evidence已逐字保存在 `.run/resource-profile-runtime-corrections-review-01/*.before`，不删除历史。详细更正与新执行证据见 `.sdd/101-20261003-resource-profile-runtime-corrections-review.md`。

**撤回黄金心脏阻断P1与黄金心脏141局静态反例。** 我先前把奖励Name与实际ledger_mode混同：实际pickup_kinds GoldenHeart kind5的ledger_mode是`GoldenHeartOwnership`，不是CanMaterialize分支中的literal `GoldenHeart`。该行没有被该分支拒绝；非Skill随后return true。Root未改材料化生产源码或Strong测试，真实`strong-golden-native-red-43`虽标签含red，结果为2pass/0fail/0skip/raw0，skills true/false均实际Native Original后落地一个gold且无gold queue。原文“黄金心脏一律拒绝发布”和以此推出141局gold队列溢出的结论错误，不再成立，不能以本旧P1要求生产改动。

**703队列仍是STATIC未证明的安全边界，换用实际尚未消费的来源分析。** 只保留真实KickQualification以及Strong特殊pool可选而作者disabled的Fire/Split等路径：实际literal可阻断Kick，实际skill检查可阻断disabled kind。队列持久、跨局保留、共享credit准入与物理703边界没有因gold正常落地而自动完成证明。尚无真实Native累积704的证据；不得继续沿用gold141局数字、声称已经复现或盲扩703→1607。原DeferredDeathDebts703未证明项保持。

**更正Supply期待审查漏项。** 原文把`SupplyFrenzyDisabledConsumerCannotBeAnEnabledCandySource`误称skills-off并批准649→1114，是漏读fixture；该方法只设置supply=true/frenzy=false，继承default skills=true。随后frenzy count0，真实剩余发行5+2+2+1=10；新base1351，所以应1361，旧base639+10=649解释原期待。Root104pass/1fail的migration42实际暴露此唯一错误。Root在相同条件和断言目的下把该一项1114→1361是合法修正；其他真实skills-off1114/1115边界不变。此前26项inverse证明仍说明原私稿保持范围，不代表其中每个数值语义都已正确验证；该数值PASS判断由此撤回并更新。

修后Root `object-budget-supply-flag-corrected-44`实际1/1/0fail/0skip/raw0，`object-budget-resource-migration-green-45`实际105/105/0fail/0skip/raw0；已独立验证完整源码/日志/JSON/程序集身份。这关闭本项Supply数值与完整ObjectBudget105执行pending，包含实际42 Legacy Reader准入与6 M2拒绝，仍不关闭Resource10/contact、703队列或Favorite区域。先前组合SHA排序P2已按manifest顺序更正文字、原数值fence不变，亦已关闭。
