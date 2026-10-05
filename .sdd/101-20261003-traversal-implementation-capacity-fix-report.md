# traversal P1 私有容量修订交回（revision03）

2026-10-03。**PRIVATE ONLY / UNRUN / STOP，等待原非作者 reviewer 对本次身份复审。** 本作者只写入 `.run/per-bomb-traversal-implementation-draft-03/` 与本报告，没有物理 production/test/schema/GEN/Table/Reader/Runtime/Engine 写入，没有 build、C# compile、Native、xUnit、GEN、format、commit。Node 只执行私有文本编排、哈希与作者静态调用点审计。

## 核实的请求与边界

完整读取独立报告 SHA256 `df4ff68729301e383071c105451fc195a6c6ed750cc8ab9bee92336014e2e19f` 与 findings SHA256 `1f769fa4277166334ab55b732895debb86be34357692947a8144a81318790b29` 后核对实际 revision02 完整稿件，确认 TRAVERSAL-REVIEW-01 的 P1 成立：原 InspectChest/ValidateStorage 误用整局 ChestLimit245，实际 ContactedChests SyncList cap5；普通非终结路径先 TryCountBomb，再 unchecked Add，Add 容量失败可留下 hit 的部分写；Original 没有按同一源全批未来写义务预检实际容量。本次只修这项容量/重复/精确 source 原子性问题。

已读取并遵循父仓/101 必读文档与候选计划；此次接收反馈使用 workflow:receiving-code-review，先核实后修。原 candidate plan `44a253ded1fb3af0ebdca14777e5c2930360d4f5a498f6aa8f05b78c21c4c1f1` 与原 candidate manifest `c98a905fcd9d091bf384b2e30fee9b55e83eddfb92f8874ace3ed4898e31cf56` 不变。

**声明仍 cap5，contact6 真实正例继续 RED。** 拒绝第六个接触只关闭部分写窗口，不满足合法六接触需求；没有选择52、没有把245改成单枚上限、没有约束 arbitrary UGC 或降低真实用例数。正式 tight capacity、Native/paired 实测和 schema15/GEN/newrelease 仍由 Root 后续正式选择/发布。

## 旧交回不变与完整替换稿

原 revision02 manifest SHA256 `53c4a581fb9649d50dfe738f54d1f2797f5b78d0dd714e1f79be3af4e110cd21` 与原报告 SHA256 `67df29af24eab632414caf8022ec061641f0dab4e33f972885dad48034de4f07` 原地字节不变；27 个旧 manifest 文件逐项重新哈希全部相等。新目录另有原 manifest/report 的 `.before` 副本，以及每个完整旧 `.draft.revision02.before` 副本。新版八个完整生产目标文件如下；唯一生产 delta 是 Server storage、Traversal partial、Terrain transactions 三个文件。

| 完整文件 | revision02 SHA256 | revision03 SHA256 | 本次变化 |
|---|---|---|---|
| BomberBombState.cs | `1a2ee493e5ca68438863792467954db04bc9a9b28b6a2c226077eb7379a3684f` | `1a2ee493e5ca68438863792467954db04bc9a9b28b6a2c226077eb7379a3684f` | 原样 |
| BomberBombState.Server.cs | `c9001d587d634fd0e0ae443d33811bf91c7eb97a35d138ce3c3bcf43de552789` | `e82428b3b203a1758754b0884a928580e805cba2426f52c3e86b87a9f11091e5` | P1 容量修订 |
| BomberBombState.Traversal.Server.cs | `e5ec957ab63019d8daf4a9ec6489732f663c73007c6ed33fea517ae696706327` | `adaa009f19029344cf4b6a029777b6de6d5557039b9b578c063232c0509e40ca` | P1 容量修订 |
| BomberBombLifecycle.Server.cs | `997217d757939c35dd6e11741b5d6c0af639a1be19cfd14dd39a7e95d21642e7` | `997217d757939c35dd6e11741b5d6c0af639a1be19cfd14dd39a7e95d21642e7` | 原样 |
| BomberBlastTerrain.Server.cs | `05905abebe97fe2ee36f8354190d883165fae078fd3e04d276f1d2b8cfdebece` | `05905abebe97fe2ee36f8354190d883165fae078fd3e04d276f1d2b8cfdebece` | 原样 |
| BomberTerrainTransactions.Server.cs | `cdbf184e1bf263637388d2aa30cad1f5f0d5eafa325303e8bbe54f97fbd2be63` | `506843ab4635fce4cadd896515875b49befbe36041e6217148d13f9075e9bc8d` | P1 容量修订 |
| BomberBarrelBombPromises.Server.cs | `93f366f9799ef16d9f9b2d76805e74302c823d2fc9410e7e3e81460a82524bf9` | `93f366f9799ef16d9f9b2d76805e74302c823d2fc9410e7e3e81460a82524bf9` | 原样 |
| BomberWorldRuntime.Server.cs | `d4d37c8c1578c156578ff8aeb88b5cab6c20a60ac5e3ccec7763df22c7e97e0a` | `d4d37c8c1578c156578ff8aeb88b5cab6c20a60ac5e3ccec7763df22c7e97e0a` | 原样 |

有限 delta：`capacity-fix-vs-revision02.diff` SHA256 `5372e4fa5da7e8b927947f59e1396690ca051c1d577e53a0d2e92fa668b6a17b`。完整 manifest SHA256 `fae6a3f08cb09885a6d7526ba32be4e959d6b0415a90f30ae299be7de051be0d`，逐输出 SHA/bytes、旧稿副本、全部物理/输入 source fences 在该 JSON 中。

## 容量、精确源与全批承诺

1. `ChestContactLimit()` 读取实际 `ContactedChests.MaxCapacity`，与 `ObjectBudgets.PerBombContactLimit` 逐次核对相等；配置与实际声明不符即拒绝。InspectChest 先检查 full-ID 重复，再按实际单枚容量 admission，ValidateStorage 也用同一真实声明。
2. `PreflightChestContactCohort` 是纯 Game 预检：ValidateStorage、完整 Participant/Life/Generation 精确相等、每个 full-ID 本地合法和全 cohort 唯一。new writes 已存在于公开 contacts 时拒绝；observed transfers 缺失于公开 contacts 时拒绝。用 HashSet 计算所有**不同未来 new contacts**，以 long 做 currentCount+additional；不做每行相同 currentCount 的伪预检。
3. `PreflightChestContactReservations` 按 SourceBomb full-ID 分组完整 staged runtime cohort 或当 tick 未 staged frame（同一 frame/header 不双算）。每行在分组前核对实际 live bomb、完整 source、chain、family、Occurred；不同源独立算账。同一源可同时拥有的未来终结接触也占信用，后来的非终结接触不能抢掉它。
4. TryDestroy 在任何 TryCountBomb / contact Add / arm / frame acquisition 写之前预检 candidate 加既存 reservation cohort，容量/精确源/重复失败直接抛具体异常，不返回 false 让 Ray 把 arm seal。ordinary 非终结、strong 非终结、strong 终结的全部 unchecked contact Add 均由此预检保障。
5. End 在写 Game pending/header/chest pending/reserved 等持久义务与调用 Native staging 前预检**整 frame**。实际 Original 仅在 receipt/token/section/revision 等全部旧证据满足后，在 contacts/rewards/stats/progress 写之前再次纯预检**整 pending cohort**。非 strong 终结 Add 也有同一全批容量保障。
6. strong terminal 的已经观察同一 full-ID 在 Writes 之外作为 Observed 核对，消耗零个新增 slot，Original 不追加第二次 contact；当前 cap 满也不能要求同一 identity 再拿一个信用。多行重复的同一 full-ID 作为错误拒绝，而不是让以后 unchecked Add 重复。
7. Unknown/duplicate/no matching receipt 路径不调用 settlement transfer、不清/重建 Pending；header 依旧持有原责任。known Aborted/Rejected 清理顺序及 strong 已观察历史保留逻辑原样。没有新增全局容量治理或 Native 限制。

## 测试原样保留与新 companion 的准确范围

Reset4 完整稿 SHA256 `901761a3afb9e56fcf45b73969e1221fc390e20275c8e5233cc013ec05beb5a6` 与原版一致；companion22 完整稿 SHA256 `39de6c9fff8127babe671794b4adfbfe0b4a9c728e56e350ecfff9d1f75d78d5` 与 revision02 一致，不删 assertion、不改 fixture、不降 case 数。原物理19例文件 fence：

| 原物理文件 | before SHA256 | after SHA256 |
|---|---|---|
| BomberTerrainFrontierRetryTests.cs | `4d25deea747123af962db28fac8e8e9b219cf1afbd9455ff4c3688b710014a2e` | `4d25deea747123af962db28fac8e8e9b219cf1afbd9455ff4c3688b710014a2e` |
| BomberTerrainContinuationProofTests.cs | `e91d296cffec03164f772e95390dea9d5dea5532d9ab0e88b444cdc9171736de` | `e91d296cffec03164f772e95390dea9d5dea5532d9ab0e88b444cdc9171736de` |
| BomberPendingTerrainGeometryTests.cs | `d97a3e5e700e72179923ed23be95687797d2e7f78cdc1b8bba66520a07e7cf03` | `d97a3e5e700e72179923ed23be95687797d2e7f78cdc1b8bba66520a07e7cf03` |

新增独立 `BomberChestContactCapacityNativeTests.cs.draft` SHA256 `5caddc973aad613d82ff2380959e39ea594dcc02798ae979c0e7cbf3bd791e9e`，Theory5，**UNRUN**。实际 Native 强箱三次不同 Game bomb 命中、终结预观察、真实 Applied/Original/token/bytes 和真实 Native 绑定退役先成立；先官方 paired positive 恢复完整未坏切面，再直接调用实际 Game cohort API 测 overflow / future duplicate / observed duplicate / source generation mismatch / unobserved transfer。positive 以一个真实 preobserved contact+actualLimit−1 个不同未来 full-ID 填满容量，同一 observed terminal transfer 不再消耗 slot。negative 要求具体诊断、完整 source snapshot 字节、Native cell/binding、Pending header、arm、公开 contacts 及原真实 receipt 字节全部不变。

额外未来 full-ID 来自真实创建的 Game chest entities，但未绑定/提交为 Native destruction；这是对**实际 preflight API**的完整 cohort 边界 companion，不伪称 Native 提交了五个 future rows，不伪造五个已完成 contact 历史，不声称替代端到端第六箱 TryDestroy/Original 的真实验证。实际六 contact 正例继续保留 RED；Root 应在正式容量/GEN窗口运行它及本 companion、全部保留旧测试和 companion22。

## Fence 与运行证据

`source-fence.json` SHA256 `ade708d0ccb0c14f1739107be87eaa214f07710063880f7a18f078718a603bd7`，31 个本域物理 source/旧交回/审查输入 before=after，作者观察漂移为0。Root Fire lifecycle 物理基线继续 `084552b027ce7c0819d5ddfc83df2803e868caf0986361ff9bb187477eb98e9c`，只读 budget 继续 `c1b3b0bfa543bc440044cfdcb842e313df91ab7eaefbcc952c132922ed2a28ec`；新的 lifecycle 完整稿原样保留 fireSkill.Id/SkillLevel 的已实际验证修复。

Root 独立拥有的当前测试仅只读观察，以下哈希不是作者 before/after 证据：

- `games/101-bomber/Server/Tests/Gameplay/BomberObjectBudgetTests.cs` SHA256 `c0e7148a86070c240a570b0126f8b434e0ff10e28638ba8c1bdc63e6ae847b5c`。
- `games/101-bomber/Server/Tests/Gameplay/BomberStrongChestProductionTests.cs` SHA256 `dddf75632b9f91492d64633f0ee37bea247b5516d917d6bc61a1cfb29f6408c5`。

作者 static audit `author-static-preflight.json` SHA256 `f13f83d39c552b6e929d28dcbbe2730d53f2738f67a58221972055717fa7ac8d`，仅核对文本调用点、三文件 limited delta、旧输出/断言整文件身份、实际声明引用及源字节。**它不是编译或 Native GREEN。** 本作者 C# build/Native/xUnit/GEN/table compile/正式容量选择全部 UNRUN。

原独立 review 已核验 Root build40 原样 Reset4 `terrain-traversal-reset-first-44` 为0pass/4fail/0skip/raw2、四个真实 paired positive 成功，实际三处 NoException 与 Native 替代胸箱被毁构成真实 RED；本作者未跑或改写该证据。Root 当前另回报 build41 Strong11 全通过，属于 Root 旧生产测试窗口结果，不能给本草稿标 GREEN。`resource-formula-first-35` 的9pass/1fail/0skip，第六 Add exceeds_max_capacity 继续开放。

本修订不扩原快照完整性承诺：可信 writer/局部列一致性，不认证可任意协调重写 source/history/progress 的快照；全世界 owner completeness 仍在恢复后下一正常 Begin，逐实体 OnHydrate 仍只做局部校验。原 schema15/newrelease、正式 tight contact capacity、public blob/relevant Section 限制不变的实际大小及旧release兼容证明均仍是 Root 的后续依赖。

**STOP：先由同一非作者 reviewer 复审上述 revision03 身份，再由 Root 决定正式发布/GEN/实际 RED→GREEN；本作者不继续写物理代码或跑重流程。**
