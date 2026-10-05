# 101 traversal revision03 容量修订 · 非作者复审

2026-10-03。结论：**STATIC PASS，原 TRAVERSAL-REVIEW-01 P1 在本次精确私有稿中静态关闭，没有发现新增或剩余P1。** 这不是physical修复完成、编译通过或actual Native GREEN。实际声明仍cap5，合法6接触仍是独立实际RED，52未选择。

本次仅复审revision03容量/重复/full-source/cohort写序修订。父仓/101 core、nav、testing和架构边界沿用上一轮已读内容；完整读取本次report、manifest、三份完整变更稿及其revision02完整delta、新companion5，重查所有contact Add/TryCountBomb、End staging及whole Original写入路径。其它五份生产稿和旧Reset4/companion22逐字节与上一轮身份一致，沿用已完成的静态判读。未修改物理production/test/schema/generated/Table/Reader/Runtime/Engine；无.NET、Native、GEN、readObservation、configCLI、format、stage或commit。仅运行独立轻量Node文件/哈希/差异检查，没有执行规则替身。

## 精确输入与三文件变化

报告实际SHA256 `629d800a02bd7afc2de756b2d0b2e75bee680cd553675150ad6a073e001a32ad`，manifest实际SHA256 `fae6a3f08cb09885a6d7526ba32be4e959d6b0415a90f30ae299be7de051be0d`，均与指定身份完全相等。manifest全部输出哈希/字节与31项sourceFence逐一相等；revision02全部27项输出、原manifest和原report原地保持字节身份。

| 完整生产文件 | revision03 SHA256 | 相对revision02变化 |
|---|---|---|
| BomberBombState.Server.cs.draft | `e82428b3b203a1758754b0884a928580e805cba2426f52c3e86b87a9f11091e5` | 真正单枚admission/storage容量 |
| BomberBombState.Traversal.Server.cs.draft | `adaa009f19029344cf4b6a029777b6de6d5557039b9b578c063232c0509e40ca` | 纯完整cohort容量与full-ID/source预检 |
| BomberTerrainTransactions.Server.cs.draft | `506843ab4635fce4cadd896515875b49befbe36041e6217148d13f9075e9bc8d` | candidate/frame/pending三处完整cohort调用与reservation聚合 |

其余五份完整生产稿原样。四个append Persist和packed四臂没有追加其它字段，ContactedChests仍5；Fire lifecycle原084552基线及permanent skill ID修复保留。Root的c1 calculator与其它profile/table/测试期望工作未被覆盖。

## P1关闭的独立静态证明

`BomberBombState.Server.cs.draft:113` 的 `ChestContactLimit()` 使用实际 `ContactedChests.MaxCapacity`，逐次要求配置 `PerBombContactLimit` 与声明相等。`InspectChest:108` 与 `ValidateStorage:187` 共享该事实，不再把全局发行 `ChestLimit245` 当单枚存储容量。旧geometry-free Fuse/storage探针继续先返回Duplicate再检查真实新增slot，因此旧storage authority未换成隐藏记录。

令C为当前公开contact历史，L为实际声明容量，W为本批未来新增contact，O为已经观察、只转移的strong contact。`PreflightChestContactCohort:125` 先验证storage和expected完整Participant/Life/Generation，再要求W全full-ID唯一且与C无交集，O全full-ID唯一且都存在于C，W∪O无重复，以long检查 `|C| + |W| <= L`。O不增加additional。由此同一顺序执行中逐条Add的任一前缀都不会因超过真实声明容量而失败；这个证明不依赖每行都独立读取同一个旧Count。

`PreflightChestContactReservations:760` 按实际SourceBomb full-ID分组，分组前匹配live exact bomb、Participant/Life/Generation、chain、family及Occurred。header存在时只算durable pending；无header且frame属于当前tick时才算未stage frame，避免同一Native obligation双算。candidate加入同一cohort，再集中检查所有源的完整未来义务。它不把不同bomb的信用混在一起，不把HitFamily当作单枚来源ID。历史SourceLife仍只校验完整身份，不要求它live。

逐写入点已复核：

| 路径 | 预检保证 |
|---|---|
| ordinary/Gold/Iron非终结 | `TryDestroy:304` 的candidate+existing reservations预检在325行TryCountBomb、326行contact Add和327行Finished之前。实际capacity拒绝抛明确异常，不能返回false让Ray静默seal。上一轮“先减RemainingHits再容量Add失败”的新增窗口关闭。 |
| strong非终结 | 同一304行预检在314行计数、315行Add和316行Finished之前；原InspectBomb和编码检查也保留。 |
| strong终结preobserve | 同一预检在343行计数、344行Add及351行Pending/frame acquire之前。随后该frame行被归为Observed，当前C已有同一ID，不再要求第二个slot。 |
| ordinary终结 | candidate预检在frame acquisition之前；End对整frame重新检查。真正Add只在已确认Original后的190行发生，前置整pending容量预检已经覆盖所有未来Adds。 |
| End/Native staging | 392行完整frame预检在Game header/details/reservation/chest pending发布及408–410行Native staging之前。完整义务继续先于可能Unknown/异常的Native调用持久化。 |
| whole Original | 109行完整pending预检仅在旧Status/Applied/Original/token、receipt bytes/section/revision检查成功后发生，位于contact/reward/stat/arm/header写之前。旧强箱必须Duplicate、普通箱必须Added以及整批source/progress预检继续保留。 |
| Aborted/Rejected/Unknown/duplicate | delta没有改变实际known-refusal清理或Unknown/no matching receipt/duplicate消费者分支；本次预检没有清空、重建或转移未确认Pending。 |

unchecked `CommitPreparedChestContact`仍存在，但它全部四处生产调用（Original190、非终结315/326、strong terminal344）都由同一同步Gameplay路径上的上述完整真实容量预检保护。capacity与duplicate问题没有改成Native后再检查，没有引入测试专用生产入口、第二terrain/位置真值或本地规则模拟。

静态关闭的是写入前真实容量与exactcohort安全，**不是承诺cap5能容纳合法第6条**。因此本次允许Root继续正式发布/GEN及实际验证这一防止部分写入的修订；完整产品需求仍必须保留contact6实际RED，待正式capacity选择和Native/persistence证明，不能把安全拒绝或丢记录标为需求GREEN。

## companion5范围和实际证据

新 `BomberChestContactCapacityNativeTests.cs.draft` 实际SHA256 `5caddc973aad613d82ff2380959e39ea594dcc02798ae979c0e7cbf3bd791e9e`，Theory5，UNRUN。完整方法先让真实Native强箱三次不同bomb命中，检查终结preobserve、Applied/Original/token/原receipt bytes、Native绑定退役，继而officialpaired positive恢复并验证exactsource/arm/contact。额外futureID来自真实ECS chest entity创建；接下来的overflow、future重复、observed重复、source generation不符、未观察transfer明确直接调用实际productioncohort API。

positive的“一个真实observed+L−1 future”是纯预检饱和边界；没有将这L−1未来行提交Native，也没有声称五个已完成contact历史。negative要求完整source snapshot、公开contact/arm/header、Native cell/binding和原真实receipt字节不变。没有合成Owned receipt、Outcome或canonical/checksum，也没有自造Native成功事实。这个用例范围陈述准确，可作为API边界保护；不能单凭它证明TryDestroy第6箱的完整写序、整批实际Native future rows或正式存档大小。actual end-to-end仍是Root依赖。

旧Reset4901和companion22的39de完整身份原样保留，上一轮对旧五组借用方法Assert语句的保留证据继续适用；原Frontier2/Continuation11/Pending6和所有本域physical source fences也相等。Root的Reset4 actual0pass/4fail/raw2及5组真实packet哈希证据沿用原独立报告，不被本稿刷新为GREEN。

最新Root实际 `resource-formula-complete-current-48.log/.json/.exit` 已只读核对：9pass/1fail/0skip、raw2、10.304sec，第6次SyncList.Add仍为 `exceeds_max_capacity`。日志hash与JSON记录相等。这属于当前旧physical生产的actualRED，不能转嫁为本私有稿的actual执行结果；新增27个companion（22+5）均未编译或Native运行。

## 审计保存和状态

本次证据在 `.run/per-bomb-traversal-capacity-fix-independent-review-01/`：before/after完整哈希围栏、独立整文件正向与逆向delta、static-checks、preservation和findings。未应用任何patch到production。上一轮原独立报告和findings先按原字节复制到 `revision02-review.md.before`（df4ff687…）和 `revision02-findings.json.before`（1f769fa4…），再仅追加本轮closure；上一轮REQUEST_CHANGES事实与原P1文字保留。

| 项目 | 本次结论 |
|---|---|
| revision03精确私有容量修订 | STATIC PASS；原P1静态关闭；新/剩余P1为0 |
| physical publication/schema15/GEN | 未执行，Root所有 |
| build/Native/configCLI/readObservation | 本审查全部UNRUN |
| actualReset4/companion22/companion5 GREEN | 未证明 |
| legalcontact6实际验收 | 当前RED，9/1/0/raw2；仍开放 |
| Contact52 | 未选择 |

正式schema15/history/GEN/newrelease、旧cap5 fixture不可改、原19及相关multiarm/Barrel/Strong完整回归、officialpaired实际大小和未来tight contact bound证明继续由Root串行承担。恢复完整性仍限可信writer/局部列一致性；全世界owner completeness仍在下一正常Begin，不认证任意协调改写snapshot。上述边界不因P1静态关闭而放宽。

**复审完成，STOP。** 不接管Root的物理发布或重验证。
