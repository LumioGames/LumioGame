# Native13 MultiFire successor fixture 独立审查

2026-10-03。本 reviewer 不是本次 fixture 作者。按 Root 指定范围先 spec 再 quality，完整读取作者报告、before/after/proof、被改方法及其真实调用链，核对原运行证据。只读源码、运行记录与轻量 hash；本轮唯一写入本报告，没有修改测试、生产、生成物或 index，没有运行 build/test/Native/GEN/format。本人先前 Supply17 source fence 保持 SHA `aef1278753d2b5a42988285f25dc189cfc343a8e535360db81132675e92ef29f`。

**Spec PASS，限定源码 Quality PASS；没有 actionable finding。当前 Native13 实际执行仍 pending，不能判 GREEN。** Root 通知 fresh build15 已通过，本轮没有自行执行或重新审计该构建；构建通过不能替代本类 13 项的实际结果。

## 身份与字节范围

当前 `games/101-bomber/Server/Tests/Gameplay/BomberReducerNativeCorrelationReviewTests.cs` 与 `.run/native-correlation-fixture-fix-01/after.cs` 均 SHA256 `c320d14323216f4c56e14c64b16175418cc0447740ffc0fb7a0abf905090cd1f`。before SHA256 `7f5eb46bb80ab908bb30a092b4d85e54dfdd73e8f0da12dd969950d85254b007`；proof.json SHA256 `cf450e4b9eb97b01eca90ea3be27d38f7be8b9fb94da7d80851e82b9ef05e8e0`。

独立在内存用 before 的唯一 `MultipleFireOwnersMatchActualFullFactsAcrossUnrelatedAndEmptyResultWindows` 方法替换 after 对应区段，结果全文逐字等于 before，SHA 精确恢复 `7f5eb4…007`，不是只相信 proof 的布尔字段。方法外 using、另外 12 cases、ReceiptProbe、辅助方法均未改。相对实际首 RED 源 `23e8b7369e054dc3b95fcb90d3c718dfd7f25cf018b042d58771aa91ef012a26`，before 还包含此前 Root 的两项未运行尝试：初始化 profile 参数和 StageInventory 的 PreparedRevision 非零断言。独立在内存只删除这两处，SHA 精确恢复原 RED。故不能将“helper 字节未变”误读成相对原首 RED 没有此前增加的资格断言；本次 fixture 修正保留该断言。

类静态数量仍 6 Facts + 2 Theories / 7 InlineData = 13 cases。原 log SHA256 `4fbface2576490cc2d50775bf9ca9f0e260d4bc9a26d25f4beffc2069796b424`，JSON SHA256 `8647d2e96abae43425b22a99377940ab87c2666c73fb71a2926d4b079884727a`，原 `.exit` 为 2。实际原 13 为 12 pass / 1 fail / 0 skip；唯一失败日志清楚显示两 10110 Applied，而旁路 10106 Rejected / `effect_target_ineligible`。JSON sourceSha256AtStart 对应原 `23e8…a26`，official manifest 为 `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`。这些旧证据没有被覆盖为新候选结果。

## Spec：真实资格修正

`BomberInventoryEffect.Server.cs:14–20` 严格要求 context/source/target=current life、完整 participant/match/life generation、非 AwaitingRespawn、非 RestorePending、正 health、相同 current capacity/Available，并特别要求非零 PreparedRevision。当前 production SHA `9fdb58ced0b66a051ba7bf71ecf541d370390130153918348d99fd2837c97d6d` 与作者所列相同。initial admission profile 自身不会配置 dormant successor 的 PreparedRevision，原夹具对 initial life 强求 10106 Applied 的前置错误确实存在。新方法修前置而不放宽资格或更换效果。

新方法 :175–225 使用现有 controlled Scene。该 helper 经真实 BomberTestWorld/NativeVoxelWorld、admission、三次正常 WorldManager.Tick、actual 初始投影 DrainOutbox、真实 bounded writer/ack/settlement 取得连接；源码原样不改。六个实际 ECS bomb（真实 source life1，三颗各命中 old life5/6）在打开的真实体素格中以正常 Tick 经爆炸/10101 health settlement/死亡进入 AwaitingRespawn。没有赋 health0、死亡 phase、PreparedRevision 或成功 receipt 来完成新前置。

`scene.TickControlled` 只转送 DrainOutbox 的原 SuccessorTransferRequest，再 Enqueue 带该完整 request 与原 authenticated account/room/connection/profile 的 TransferSuccessorConnectionMessage。核对的是 exact official06 Runtime 源 `C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233` 的 `WorldManager.Successor.cs:422–440,495–530` 和 `SuccessorMessages.cs:43–50`：原 request、attachment、身份、restoration、eligible Tick、connection epoch、publication capacity 都仍由 Runtime 校验，Applied/result/newBinding 由 owner commit 产生。fixture 没有构造 SuccessorResult。

Game 的 `BomberSuccessorLifecycle.Server.cs` 正常路径先从 Runtime eligibility revision ConfigureDormant，再实际 Apply10120 恢复 health，消费真实 transfer，更新 full current life/generation，最后 TryLand 清 DormantLife。新测试等待上述完成，并检查 actual controlled binding、唯一真实 transfer Applied/newBinding、generation2、participant 关联、Protected、RestorePending=false、health6、PreparedRevision>0 和无待转送请求。这足以建立本 10106 correlation test 的资格前置；不宣称 Host/Platform 网络端验收。

## Quality：原断言与时序仍严格

- :241–267 保留两个 10110 Applied、原 full fact/health 断言、两个 **10106 Applied**、full receipt correlation、原 handle interleaving 顺序及无 refused result；没有仅要求提交成功或接受 Rejected。
- :229–240 新增六条真实 damage baseline：目标限于两个 old full life、真实 prelude SourceLife/SourceParticipant、六实际 bomb IDs；每个 old life 恰三条。日志没有清空。
- :271 与 :282 的 raw JSON prefix 必须逐字保留 baseline；:279–288 必须恰新增两条，并核唯一 source bomb/source life/source participant/cause=burn，两个原 Fire target 各一条。原 journal 空/最终2条断言因真实 prelude 有合法历史改成严格 baseline 与 +2，未把错源或额外 damage 隐藏在一个总数内。
- 原 FireStage/AssertFireFact/RequireReceipt/ReceiptProbe 未改。StageFire 是现有明确的 10110 correlation row fixture，Effects.Apply 与实际 Native result/association/CompleteFact 仍是真实路径；它不证明完整 guarded FireExposure producer。ReceiptProbe 只观察真实批次与 owner associations，没有写 Result/Claim、吞掉异常或重投。
- 默认 20Hz、respawn3000ms=60 Tick，等待上限 60+32=92；前三 death ticks、随后 IdleBomb 一 Tick 与两 result ticks 总计仍小于 journal `RetentionTicks=200`。MaxEntries128 对这少量 damage/death/respawn 也无压力。Scene 既有 phaseEnd 使用完整420000ms=8400 Tick，未延长配置或倒拨时钟。
- Prelude old life 间距6格、bomb power2、其他 life移到15.5/15.5，隔离其 blast。后续 IdleBomb 在恢复后创建并保留 Fuse+1000 Tick，两个相关 Tick 不会自然爆炸。10106 对 Protected successor 合法；Fire targets0/2保持原 Vulnerable/health6，与被死亡的5/6不同。

源码上没有剩余需要先改的具体问题。下一步应对 SHA `c320…d1f` 绑定 Root fresh DLL 跑本完整13，保存实际 13/pass/fail/skip/raw child exit；若前置死亡、restoration、transfer 或 landing 失败，应保留真实失败，不能手填资格绕过。本轮没有新运行证据，原 12/13 不能自动升级为13/13，也不能扩大为整局、16人、全 Client 或完整 Native producer 验收。Goal101 未完成。

## 实际执行关闭补记

随后 Root 交回 `games/101-bomber/.run/v14-native-production-20261003/native-correlation-review-02.{log,json,exit}`。本 reviewer 只读核验：log 实际 **13 total / 13 pass / 0 fail / 0 skip，raw child exit 0**；本类运行待验证项现关闭。旧 review-01 首失败仍保留。新 sourceSha256AtStart 与当前源/after 完全相同 `c320d14323216f4c56e14c64b16175418cc0447740ffc0fb7a0abf905090cd1f`。

新 log SHA256 `c15299693a9379d165c9c76037c2f3fa87d8f4ab15e5dcfbf5a22277d60f12bb`，JSON SHA256 `8a8d5e8e4592921d64c001c90c0bd9c56df8aa546ac9a93412a9956341fa5c60`，JSON exitCode 与 `.exit` 均为0。JSON assembliesAtEnd 与当前实际文件 hash 逐项核对：Gameplay `9043262095be360d48921a114d9fa2f41b1d1c6795b423bc41dd01f43e8ce685`；Tests `3ef591c202edf1faba6eac5225f9b2177c2fa8c9cad9c7a2f0e7d02f3b276910`。official manifest 仍 `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`，Ecs `74da7fff23e1aa72b8e8b7d0fd93c8164447c636de47700e254d8404c0648def`、Gas `09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc` 在运行 JSON 中保持原 official06 身份。

MultiFire 的新 actual 窗口在 Tick70：10110 / 10106 / 10110 / 10106 顺序的四个 full handles 均 Applied，两个 Fire association Completed=true，两个旁路 Inventory 没有 owner fact association（default/-1/false），与源码原期待一致。不能将本类13/13扩大为其他测试、完整 Fire producer、整局或全 Client 验收；Goal101 仍未完成。
