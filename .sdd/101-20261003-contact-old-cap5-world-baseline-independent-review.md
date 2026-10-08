# Old cap5 World baseline：独立审查

2026-10-03，client_correlation_review，非该测试/helper作者。Spec PASS / Quality PASS / 本基线执行 PASS，无 actionable finding。精确范围是当前 cap5 声明下真实 ECS 容器、原始 World CaptureSnapshot、RuntimeOnly 恢复及逐字再捕获。不是 Native 箱发行、真实资源箱产品债务、扩容333、旧快照新声明迁移或整局验收；Goal101未完成。

本轮只读测试、作者私稿、Root 发布前像/机械修复、原始构建/测试日志与永久 artifact；仅写本报告与独立低内存 Node proof。未执行构建、GEN、C#/Native/测试、配表编译，未修改任何生产、测试、旧 freeze/artifact 或 index。

## 实际源码与窄发布差异

当前 `games/101-bomber/Server/Tests/Gameplay/BomberContactOldWorldSnapshotTests.cs` SHA256 **f6ae21120da18be7424453e65a1b0772e70aafeb1f6f261d7f5f912d785dd3d5**，唯一 Fact /1 case。完整读取 capacity 原私稿 `.run/resource-chest-budget-bounded-candidate-01/BomberContactWorldSnapshotTests.cs.draft`、Root `.run/resource-contact-old-world-publish-01/{prepare.ps1,publish.json,compile14.before.cs,verify.mjs,verified.json}`。Root只提取 old5 class 和共享只读证据 helper；candidate333 class 未进入本编译文件。

Root原发布SHA26272a63141261f4ffadbb27e9b171c880153bc87c6d687160baeb522a8202be与保存compile14.before物理一致。compile14→当前diff仅删除unused System.Globalization using及把错误转义的字符literal替换为 `Path.DirectorySeparatorChar`。Windows目录枚举的真实相对路径转为 `/` 与原意相同，Linux上正斜杠替换为自身也成立；没有改case、容量/计数/恢复逐字断言。旧编译失败证据保留。

测试25–47行使用真实官方 authoring compiler 的两处允许输入：再生 max_mirror_orbits0及 central_supply_enabled=false，保留正式 Game 默认容量。真正 Commands.Create出版一枚bomb与5个chest，正常 WorldManager.Tick后调用当前 InitializeHitBudget/TryObserveChest 给存储容器登记5个真实完整本地ID；检查 MaxCapacity5和每次Added。此步骤是明确的结构/存储 fixture，没有 Native地形binding、箱出生/消耗生产者、Original或库存资格证明。没有制造成功Effect/receipt/Claim、手写Native材料或伪迁移 payload。

`ContactSnapshotEvidence.ReadFields`仅读取原bytes，不修改它。完整key前检查长度前缀与 blob kind4，再验证payload SyncList/maxCapacity/fullEntries；原 snapshot直接传真实 Capture/Restore，再要求整个byte[]逐字相等。首个原blob239字节与21,487字节完整World不是模拟放大，也未借局部字段JSON大小声称完整高容量世界可恢复。

## RuntimeOnly 与持久原件

直接读现有 `BomberWiringTests.cs:89–97`，Restore使用 WorldCreationOptions.RuntimeOnlySnapshot，原 Source无 withMap/paired checkpoint。现有注释明确这是ECS序列化cut，coupled voxel恢复另测。测试没有调用RestorePaired，也没有将单ECS切面包装成Native箱生产或 active paired恢复。

`BomberObjectBudgetTests.cs:398–464` AuthoredFixture.Dispose实为no-op，保留compiler输入/输出/失败。先前“Dispose会删除”摘要并不成立。本轮不据此猜测；Root永久copy仍有价值，使artifact与原authoring临时路径解耦且自包含。Save复制目录下全部文件，逐文件先读源bytes、断言副本逐字相同，记录相对路径及SHA256，并把metadata Export指向副本；没有转换导出内容。

永久目录：`games/101-bomber/.artifacts/resource-contact-world/old-world-cap5-0bb1c9bca38e454fb187e5874ec84c44`。物理核验：

| 原件 | SHA256/数量 |
| --- | --- |
| original.lwm | **6a0e5a671cdb89a003c4567ccefa9534481c0fcd48e147b10c583d8aabd755a8**，21,487bytes |
| actual.json | d9512037e1f85c11775ced7271a31ceb970e6947bcf67b9789b00060d25fb573 |
| copied config export | 31个唯一相对路径；各副本、原SourceExport、metadata记录SHA均一致，drift0 |
| contactedChests原blob | 唯一字段，SyncList容量5/entry5，5个序列化entry互异，blob239bytes |

artifact metadata当前Limits仍用 PersistenceLimits.Default，MaxBlobBytes1,048,576、MaxRecordBytes67,108,864；未提高上限。metadata Game/Runtime SHA与真正 test-run末尾程序集身份一致。

## 实际执行证据

逐读 `games/101-bomber/.run/v14-fullpack07-native-20261003/{build14-old-contact-world,build15-old-contact-world,contact-old-cap5-world-baseline-01}.{json,log,exit}`。三组372源且SourceChanges空，所有物理log SHA与JSON一致、raw exit与JSON一致。

| Run | 实际结果 | log SHA256 |
| --- | --- | --- |
| build14-old-contact-world | raw1 /0W /6C#errors，仅新helper字符转义语法错误；不是业务RED | e12970e4340eede3d4ccd4d351c60d27a1fc1d890d179658dd18447c5f9d7e9b |
| build15-old-contact-world | raw0 /0W /0E | ef143914f06bf8c71de8ec3753fa162b8861cd14c640e843da897e360a3acbb6 |
| contact-old-cap5-world-baseline-01 | **1/1pass、0fail、0skip、raw0**，5.055秒 | 8c8d4b4fa053be3f638582c7ca0e6dd1b3dcef2a6fb9c04c90c99b96f99eefdb |

build15与该test的结束六项程序集身份逐项完全相等：Tests ba5f5137d17aa48d5e3b7529ae29058fb19c4c42c611987ad72060ed2891ebef；Game78b1a0ec5ad12867da0e78757db7414d70c61e8e9fc72e48e7a60d4ea803626e；Ecs aa5520f37e22eb6337d4e9e5c33008684bb7fd51e598dad38ef404351dddbd49；Gas09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc；Native c01599b8c31ea72185f2a206dbcc5c4ff8fb432c68bb61ea3dabab5e6d4ddb12；build-info f9752593b0d802b76996a5bcaa8fdda4a75d2f9449fd160d268e793029f3570d。官方07运行身份是历史结束记录，未假设以后滚动artifacts永久相同。

Root发布前的BombState声明fd871…356ea、Servercf1e…0ff1、ObjectBudgets2b228…cad94a、ResourceRewardRulesadc70…1feac及object_budgets.txt1823d…b290d均当前物理匹配；没有333/GEN或production变更借入本基线。

独立 `.run/resource-contact-old-world-independent-review-01/verify.mjs` 低内存Node raw0，未复跑Root测试。保存verification.json SHA **0bd00efa6dd09591e0c19a295c510465b3694a890261f3d4035cfb05a43ce931**，核所有上述artifact/metadata/source/hash/31副本与原件、真实field形状、原始exit/log以及两组DLL一致。它不模拟运行，也不对Root测试结果另造成功。

本基线可作为后续独立扩容/迁移工作的不可改写旧原件。未来须真正消费这一old cap5原始World并沿官方新声明 Restore/迁移政策验收，不通过改blob maxCapacity、提高Default limits、局部payload换装或仅导出配表来制造迁移PASS。当前没有此迁移执行结论，也没有完整Native资源箱发行或较大cohort预算执行结论。
