# 101 traversal 私有完整实现 · 非作者独立审查

2026-10-03。结论：**REQUEST_CHANGES，1 个 P1。** 四臂单调进度、真实爆炸冻结事实和主要调用点的静态结构成立；真实单枚接触存储容量没有进入预检，因此不能批准当前稿件的“整批写前已完全预检”承诺。此结论是独立静态审查，不是实际 GREEN。

本审查只写本报告和 `.run/per-bomb-traversal-implementation-independent-review-01/`。没有修改物理 Gameplay、Server Tests、generated、schema、Table、Reader、Runtime 或 SDK；没有 build、Native、GEN、配置编译、format、commit，也没有新建 agent。

## 输入与独立性

按顺序读取父仓 core/nav、repository-architecture、101 core/nav、两端 testing/code-style；完整读取 brief、候选计划、实现报告以及全部八份 production 私有文件、Reset4、companion22，核对原生产调用者、胸箱存储 API、Barrel promise、Kick/HFSM 与 Runtime 实际逐行 hydrate 顺序。所有生产检查均只读。

- 实现报告实际 SHA256：`67df29af24eab632414caf8022ec061641f0dab4e33f972885dad48034de4f07`，与指定身份相同。
- manifest 实际 SHA256：`53c4a581fb9649d50dfe738f54d1f2797f5b78d0dd714e1f79be3af4e110cd21`，与指定身份相同。
- manifest 列出的全部私有文件哈希和字节数逐一相等；全部 sourceFence 当前身份相等。
- 生命周期基线 `084552b027ce7c0819d5ddfc83df2803e868caf0986361ff9bb187477eb98e9c` 的 Fire permanent ID 修复保留：稿件仍以 `SkillLevel(fireSkill.Id, 1).DurationMs` 获取残火时长。
- `BomberObjectBudgets.cs` 的 c1 当前基线只读，未回写旧值。Root 的 profile table1607 和105c0e 独立工作不由本审查改写；Root 明确确认105c0e 只改测试期望1114→1361，没有修正本报告中的 consumer guard。

## P1：真实单枚容量未进入接触预检，普通非终结计数新增部分写入窗口

位置：`BomberBombState.Server.cs.draft:108,178`，`BomberBombState.Traversal.Server.cs.draft:127`，`BomberTerrainTransactions.Server.cs.draft:323,189`。

当前 `ContactedChests` 的声明容量仍为5，而 `InspectChest` 与 `ValidateStorage` 使用 `ObjectBudgets.ChestLimit`，其当前语义是整局箱子发行容量245。c1 calculator 已分别提供 `PerBombContactLimit = new BomberBombState().ContactedChests.MaxCapacity`，草案未消费这个单枚事实。故已有5个记录时，第6个 full-ID 的 admission 仍返回 Added，后面的无条件 `CommitPreparedChestContact` 才在实际 SyncList.Add 上失败。几何距离单调并不保证接触次数≤5：不同臂或同一穿透臂上的多个正向距离都可以合法推进。

这里包含两个不同来源的问题：

1. **既有基础容量缺口**：原物理 `TryObserveChest` 也使用发行上限，Root 实际 `resource-formula-first-35.log` 已证明合法6存储正例9pass/1fail/0skip，第6次 `SyncList.Add` 抛 `exceeds_max_capacity`。该日志已只读核对，未重跑。终结 Original 消费仍先接受实际 Native 破坏/绑定退役，再 Add；当前稿件不能保证所承诺的接触写、Pending→Ready 和 header 清除完整完成。这个 Native 后失败风险不能以新单调列自动关闭。
2. **本草案新增的普通非终结原子性回退**：旧普通多击箱路径先 `bomb.TryObserveChest` 再 `chest.TryCountBomb`；稿件323行先 `TryCountBomb` 再324行无条件 Add。已有5条时，该 ordinary/Gold/Iron 非终结路径会先减少箱子 RemainingHits，随后容量异常使 source contact 与 arm 进度尚未提交。精确 before/draft delta 足以定位这个新增写序窗口；此窗口本审查未运行 Native。

修订要求：在全部 hit/contact/frame acquire/Native staging 前，让 admission 与 storage validation 使用实际单枚 `PerBombContactLimit` 和声明 `MaxCapacity`，并对本 cohort 的完整接触写义务完成纯预检。若继续使用无检查 commit helper，必须在同一执行路径先证明它的真实存储容量，不能依赖全局245。修正 guard 只保障失败发生在业务写与 Native 变更之前，**不等于完成合法6的需求**：合法6正例必须保持其实际 RED 直到正式容量经证明、schema与生成发布后满足。不得通过拒绝合法6、丢弃历史、放大公共限额或自动选52关闭正例。

## 其它完整调用点的静态判定

| 检查面 | 静态结果与边界 |
|---|---|
| 四个 append Persist | DECL 只新增 OriginX/OriginZ/Power（默认−1）和 cap4 packed arms。原字段顺序和 ContactedChests cap5 保留，无新 terrain store、位置写权或 Native slot。 |
| 真实 Native 爆炸 | `Lifecycle.Send:53` 在 StorePlan/各 action 之前纯预检；实际 EnterDanger 才发布四个 Ready0，再写 Phase/Occurred。Fuse Kick 最终 LogicTransform 是冻结来源；冻结事实只比对当前位置，未写回当前位置。 |
| 独立臂与冻结几何 | Ready/Pending/Finished 编码与每臂距离使用实际原点、Power、map boundary及long差值。无 contacts!=0/Reach!=0 的全局 Unstarted禁令；别的臂已有真实接触时本臂Ready0仍可合法启动。无P6、B1、333、概率或任意UGC域假设。 |
| Trace/Resume | Trace 要求真实初次Ready0；visible Reach重置不重置进度。Resume 整体校验原始Family/Occurred/方向/remaining与durableReady，再清continuations。已接受cursor上的替代障碍 seal；retry保持旧cursor。普通remaining0可在distance<Power时Finished。 |
| TryDestroy | 几何/source/strict advance preflight在hit/contact/arm写前。竞争retry不推进；非终结contact结束该臂。真实存储容量遗漏为上面P1。 |
| End/header | `DestroySoft` 与Barrel完整header、details、reservation和chest pending在Native staging前发布；Unknown或staging异常保留ordinaryGame header所有权。sequence溢出已在Preview纯检查。 |
| Original整批 | 现有Status/Applied/Original/token、section/receipt bytes、revision推进条件保留；整批source/cell/progress/continuation预检在stats/rewards/arm转移前。强箱terminal已观察同full-ID，Original要求Duplicate并只转一次，不再Observe。单枚真实Add容量缺口使整体判定不能PASS。 |
| Known refusal/Unknown/duplicate | actualAborted+None+CleanupStatus0及stageRejected完成exactPending→Finished；不要求Abort token未消费。Unknown、不匹配receipt和Duplicate不重建/释放Pending；完全settle后无header的重复Original被忽略。 |
| Barrel | 纯Stage编码与容量预演、原exact promise/Native binding retirement检查保留；RequirePending纳入原preflight；actualOriginal只Finished该臂，未增加原规则没有的continuation。原Barrel生命周期回归仍需Root实际运行。 |
| historical SourceLife | 使用完整participant/life/generation/locality事实，未要求历史life仍live。Native Original允许原SourceLife已死，不能重指当前新life；source bomb自身仍须被existingHoldsSource保留。 |
| hydrate/全row所有权 | 局部OnHydrate frozen/continuation拒绝只读。全世界Pending恰好一个exactheader、Ready恰好一个continuation、Finished两者皆无，在正常Begin且producer前检查；没有塞进半构造ProcessorPlan。Runtime AttachHydrated在单row恢复后立即OnHydrate，故不能宣称已在CreateWorld返回前检查所有跨实体missing-owner情形。下一正常Begin拒绝的承诺与文档一致。 |
| 所有权边界 | 没有本地terrain规则替身、第二tick、第二位置写者、手动Native receipt、Runtime/生成物修补。packed frontier是义务事实，无逐tile历史。 |

这张表是逐调用路径静态判读；没有由字符串计数或作者 audit 代替规则证明。公开契约使用保持原样，本审查未发明新公开API。

## Native证据与原测试保留

Root 的 actual `terrain-traversal-reset-first-44.log/.json/.exit` 已直接核对：**0pass/4fail/0skip，raw exit2，5.636sec**。storage131、runtime140、paired152均为NoException；native194为回退已接受prefix后新full-ID A′被毁。四个未损坏officialpaired positive先成功后才进入corruption，各真实Native Original、binding/full-generation及history前置断言先成功；没有把旧runtime-only gate或broad terrain异常当monotonic RED。

日志的5组真实cut packets逐个重新计算SHA256，与日志RuntimeSha256/VoxelSha256全部相等。四个positive与一个corrupted paired cut均真实存在。准确目录是 `games/101-bomber/.run/terrain-reset-cut-artifacts/`。详见私有 `actual-red-artifacts.json`。这些是Root的原代码实际RED证据，不是本草案的GREEN，也不是本审查新跑测。

Reset4物理源码与原901私有稿字节相同。Frontier2、Continuation11、Pending6整文件当前哈希分别保持4d25/e91d/d97a，故原body/assertions/fixture没有被改写；其完整SHA见before/after证据。原production、journal、pending、multiarm、split生命周期也在独立哈希围栏内。

companion确实是22行用例（Fact6 + InlineData16），全部UNRUN。方法体使用已有真实场景、WorldManager.Tick、publicUseActiveSkillAbility/NativeHFSM、actualAdapter stage/query/capture结果和official Engine paired恢复；保留实际checkpoint再官方RestoreResultCheckpoint是延迟真实delivery，没有合成Owned receipt或替换Outcome。源组件的单列损坏只用于负例，先有未损坏paired positive；没有patch canonical/checksum或Native包。

从三份production原方法与两份journal原方法借用的5个方法，其旧完整Assert语句（仅归一空白及journal helper资格名）按原顺序全部保留，分别25/35/17/21/10条。新增Assert分别后变为26/39/21/30/13条，详见独立 `assertion-preservation.json`。这只是静态原断言保留，不证明新22能编译或实际通过。

## 私有可恢复交回与实际状态

`before.json` / `after.json` 保存各物理源和所有精确私有输入的完整哈希/字节数。`proposal.diff` / `proposal.inverse.diff` 覆盖7个完整before/draft替换和1个新增partial；逆向delta使新增partial回到零字节，未实际应用任何patch。`static-checks.json`、`preservation.json`、`findings.json`保存独立检查与裁决。审查期间围栏内物理和输入变化为0；该说法仅针对本域围栏，不声称Root所有并行域都没变化。

| 项目 | 状态 |
|---|---|
| 输入身份、所有私有哈希/字节、原断言与cutpacket校验 | 静态核对通过 |
| 当前完整private稿的spec/quality裁决 | REQUEST_CHANGES，P1容量预检缺口 |
| 本审查build/Native/GEN/configCLI | 全部UNRUN |
| Root Reset4原代码actualRED | 已读取证据：0pass/4fail/0skip/raw2 |
| private生产稿、companion22实际GREEN | UNRUN，未证明 |
| schema15/新release/正式GEN | 未发布，Root依赖 |
| Contact52容量选择 | 未选择 |

Root需先修订并复核上述P1，再按正式schema15/history/生成流程发布精确身份，运行Reset4、companion22、原Frontier2/Continuation11/Pending6和相关multiarm/Barrel/Strong全量回归。接触6及未来候选边界、旧cap5不可改fixture、officialpaired快照实际大小与共同驻留预算仍是独立门，不能由本报告代替。

四列约束可信writer的单列/局部恢复一致性，不认证任意协调改写source/progress/history/provenance的快照。没有逐接触坐标ledger或外部真实性签名；52的条件几何证明与restore完整性策略限制必须继续明确保留。

**审查结束，STOP。** 没有自审作者修改，没有发布physical修复，也没有接管Root的重执行或容量选择。

## 2026-10-03 revision03 非作者复审追加关闭记录

原报告df4ff68729301e383071c105451fc195a6c6ed750cc8ab9bee92336014e2e19f与原findings1f769fa4277166334ab55b732895debb86be34357692947a8144a81318790b29的字节原件，先分别保存在 `.run/per-bomb-traversal-capacity-fix-independent-review-01/revision02-review.md.before` 和 `revision02-findings.json.before`，原REQUEST_CHANGES裁决和P1正文不改写。

已对revision03报告629d800a…及manifestfae6a3f0…的三份完整生产修订进行同一非作者复审：**STATIC PASS，TRAVERSAL-REVIEW-01在精确私有稿中静态关闭，没有发现新增/剩余P1。** 实际MaxCapacity与PerBombContactLimit对账、完整distinct full-ID future/observed cohort、exactsource聚合，以及count/contact/arm/Native stage/Original前置调用均已检查。完整结论见 [revision03非作者复审](101-20261003-traversal-capacity-fix-independent-review.md)。

physical修复/GEN/Native仍未执行；旧cap5、legalcontact6实际9pass/1fail/raw2继续开放，52未选择。新增companion5只证明真实productioncohort API边界的授权测试结构，不是端到端第6箱或五contact历史。不能用这条静态关闭记录宣称actualGREEN。
