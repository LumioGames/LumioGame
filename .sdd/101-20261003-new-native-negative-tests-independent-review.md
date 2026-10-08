# 两组 Native 负控独立源码审查

2026-10-03。非作者，先 spec 后 quality。已读 Root/101 core、knowledge 导航及 testing 标准；只读两新类、关联生产/fixture、旧独审与作者交回、exact official06 实现和公开机器合同。唯一写入本报告。没有改 test、生产、generated、预算、index；没有 build/test/Native/GEN/format。

**Spec：两组测试的目标与故障边界 PASS。Quality：源码审查 PASS，实际执行待 Root fresh build 与原始结果；没有发现需先修 fixture 的静态问题。** 当前生产的两处旧 P2 尚未关闭；不能将预期 RED 算成真实 RED，也不能宣布 Native 全 producer、16人整局或 Goal101 完成。

## 身份与计数

| 相对 games/101-bomber 路径 | SHA256 |
|---|---|
| Server/Tests/Gameplay/BomberSplitPromiseLifecycleWitnessTests.cs | 3d1286547cfbc112241880f0a9be343e631b8ea531f02b38e99785fd903819ae |
| Server/Tests/Gameplay/BomberFireExposureCutBoundaryReviewTests.cs | 9760c40382ae7119b0c099f53183653d715706fcc89d04978c58d5b50450e3d0 |
| Gameplay/BomberBombAdmissions.Server.cs | dd77b4a4c2a015f9e9d2bc2ca6333473454a9437abe6de80f43a7d22d4c4cd72 |
| Gameplay/BomberSplitBombs.Server.cs | 15e9f03bcd1608116f8c4427c0b13e2d78d0ca42f8ea81dbe30da5c0d0bc711f |
| Gameplay/BomberFireExposure.Server.cs | d406113b06eea2c9d492817ee49f1f8aef8bfba126e2daa81e42a76ec61d3d77 |
| Server/Tests/Gameplay/BomberReducerNativeCorrelationReviewTests.cs | 23e8b7369e054dc3b95fcb90d3c718dfd7f25cf018b042d58771aa91ef012a26 |

Split 为4 Facts / 4 cases；FireCut 为2 Theories、4 InlineData / 4 cases。Split 作者报告 `.sdd/101-20261003-split-promise-lifecycle-test-red-source-report.md` 的源身份相符。FireCut 作者仅经 Root 消息交回，本轮没有另一个作者 `.sdd` 报告；实际文件与 Root 给定 SHA 相符，不补造交回物。

两新文件均为 untracked，窄 git diff --check 无输出；该命令不检查 untracked 内容，因此不把它作为新文件完整格式证明。本轮实际完整读了两文件。没有执行构建，不保证编译或 analyzer 成功。

## Split：实际 owner 生命周期被钉住的 callback 负控

负控先正常 Tick 发布 ReservedSplit 母弹并经真实 Native HFSM 进入 Danger。右臂 soft cell 通过真实 Scene.Write 设置；两次 Tick 后明确核 PendingVoxelTransactionIds 一项、对应 adapter checkpoint 的 Original/Applied/TokenConsumed、真实 Native 单元为空，以及四 future 信用、零 submitted/resolved。它没有设置假的 Original 回执，也没有用本地 terrain DTO 决定业务。terrain obligation 暂时保留四信用，所以可在真实 owner 的未提交方向0进入原子入口。

callback 仅故障注入 DangerUntil+1 与所选 submitted bit=true。当前 Split witness 不含 DangerUntil/BurnUntil，所选 bit 被规范化，故源码预计入口不拒绝：目标失败是 Assert.Throws 无异常。最小修复为同一 canonical witness 加入这两项实际生命周期期限；不新增 phase eligibility，不把合法 kick、chain 缩短 fuse 变成禁例。

成功拒绝后测试不要求撤回 callback 已写字段，符合入口保守持久 true 语义；future4、live census、无 child、成功 CaptureSnapshot 共同检查没有进入真实 pending create。official06 Capture 的 EnsurePersistenceQuiescence 拒 pending creates/destroys，所以仅检查 live 数量不足的空隙由 capture 补上。再次 callback 不执行且 snapshot 相同，检查 durable submitted 不会重投。**这不是实际 Commands.Create 之后的 Unknown 结果，不是可捕获的 structural Unknown checkpoint。** 没有测试回滚非法 callback 对 owner 的变更，当前设计也不承诺这种回滚。

三个正控经正常 Manager.Tick 走完整生产 Advance 与 Native 相变：自然爆炸/四臂 publication、真实 bound UseActiveSkillAbility kick 后爆炸、另一真实炸弹 blast chain 缩短母弹 fuse。初始化阶段设 Fuse 是 fixture 输入；后续没有手写 Phase、生产 Tick 或 Native plan。实际 kick leaf、移动、source/fuse/chain 保持/变化、四子完整 source/chain/Frenzy/shape/power/fuse/token、信用和 masks 均有断言。原 Native CanBurn 仅 ReservedFire，Split 没有合法 Burn 路径，测试核 BurnUntil=0 是正确约束。

源码预期 Split 3 pass / 1 fail / 0 skip；此为预期，不是执行结果。实际运行若先停在 Native 初始化、terrain receipt、kick bound 或正控 family assertion，应先保留那个失败边界，不归类为 P2 已复现。

## FireCut：真实捕获 cut 的严格过去时间

公开 Engine0e `engine/wire/effect-lifecycle-v1.json:558` 定义 BeforeTick 的 ResumeTick=CaptureTick，AfterSettlement 仅 Save 在 phase9 与固定 reducer window 之后捕获，ResumeTick=CaptureTick+1，首次正常 Tick 执行 ResumeTick。测试遵守该规则：Before 调用实际 CaptureSnapshot，After 通过真实 WorldSaveComponent.Save + Manager.Tick + ISnapshotSink 观察捕获，不手造 cut。

exact Runtime06 `WorldSnapshotCodec.Read` 的5参数签名、SnapshotHeader.Cut、SnapshotEntity.Counter/Fields、FieldBlob.Tag=2/Bytes8 与反射 observer 完全一致。原始 entity scalar 没有附加整图 checksum；测试只替换8字节 unsigned Last，不改 Effect section/schema digest、cut、其它字段或来源图像。完整目标 entity 解码、唯一匹配 offset、前后字节相等、新值复解码共同避免误改其它 life。不是只靠字符串偶然搜索确定目标。

fixture 从同一真实 Scene 创建 ReservedFire bomb，正常 Tick 至 DangerUntil 后再4 Tick；目标移动进覆盖，明确核实际 Burn、非空来源、唯一非空 exposure、Last=World.Tick-1、health6、FireStatus空。现默认 tick_rate_hz20、danger_ms400；四轮及 Save 一轮低于满秒20轮，未完成 pulse 的 health/fact 前置一致。其它 lives 被 Open 移远，不制造第二条 exposure。最小源级核查未发现互斥前置或未执行 Native 相变造成的假负控。

负控变为 Last=真实 ResumeTick，其余完整来源保留；通过真实 owner RuntimeOnlySnapshot 恢复，并要求 EngineHost WorldInitializationFailed 包裹的精确 InvalidOperationException/message。官方恢复先赋 World.Tick=ResumeTick，再 HydrateRows；所有实体字段先填完后统一 OnHydrate。当前 ValidateExposure 仅拒 Last>world.Tick，所以 equality 静态预计被接受：两 cut 都应停在 AssertOwnerFailure 未抛，而非 codec 错误或别的初始化错误。

正控保留 Last=ResumeTick-1，实际恢复核 RestoredCut、World.Tick、完整12字段 exposure tuple、Burn source、health、空间绑定与 source/capture bytes 不变。After Save sink 内 Last=当前 CaptureTick 合法；在恢复时才必须严格早于 ResumeTick。最小修复仅将当前 **OnHydrate 使用** 的时间上界从 `>` 改为 `>=`；不要把 Save 阶段的等号误禁，不修改 CaptureTick/ResumeTick、interval 或原断言。新增 helper 若未来在 Tick 内调用应另审调用语义。

两负控为保存标量 corruption 故障注入；两个正控覆盖官方 ECS runtime-only cut，**没有恢复配对 voxel checkpoint 或推进恢复后的完整 gameplay**。后者继续由原 paired 集成测证明。源码预期 FireCut 2 pass / 2 fail / 0 skip，不是实际 RED。

## 原断言、fixture 与 Native13 cleanup

原 Replay、BarrelReview、FrenzyBarrelIntegration 物理 SHA 仍逐一等于此前 atomic 独审冻结：`9216255e…0ef1b`、`e7bba071…9544`、`eeb9c7b0…dc19`。新两类未改它们。四个共享 fixture 文件对当前 Git HEAD 无 diff：SplitProduction `36b6f532cb76f090a21268081d9f2109a7281202ae7b36b40690953c5329dd49`；TerrainProduction `6db06fe7ab2e1948a5269159e8a7d50ca684de8c0612c2c190f837c8c8b3c299`；EffectIntegration `02a1b2b2102f31303bc77d343f41ab59b62492c0976f581290fa9454eeaca4a9`；Wiring `3c192cec1185011b973a9b70d33c0709a46104e534bcdb948e9159cb7c717949`。FireExposureReview 当前 SHA `583bd280d79d7b5ff580ea437d43d15327aed5a2d7572a9d882d48d0d27eb5d4` 本轮只读，未重新给旧运行绑定新 binary。

窄看 Native13 ReceiptProbe：所有8个创建点是 using var；Dispose 首先 FirstChanceException -= ObserveRefusal，再恢复 previous observer。C# using 保证作用域异常和 assert 失败时经编译后的 finally 调用 Dispose。**源码没有字面显式 try/finally**；此处准确修正旧 Fire/Aura 独审中“finally 解订阅”的宽泛措辞，不回抹旧报告。本轮未重复宽审13项，不宣称已经执行或对新源码绿。observer 仅读真实 Results/ResultFacts，FirstChance 仍限定同 world/线程/Tick 的原 Capture access violation；没有伪造 receipt/Claim 或覆盖真实异常。

## 官方输入与待执行证据

Runtime06 checkout HEAD `23356eafc365c753b6e8d9987fd069815ff067ce`；WorldSnapshotCodec SHA `a79e6a2af4758c88f96b1575d4cc6b4733e1b956a40f93e142740b3598c5a5ef`；PersistenceCut SHA `54b7740bbdcdf104522a5733680e63a3de9e3cf98d7cbd0bb04d17e38d6823f2`。公开 Engine0e HEAD `0e2fc74783f9f186d59909b38d4ee70887a21137`，effect-lifecycle-v1.json SHA `2d44e039770920de13a8dd335278bcc34e2792dac9c9ff707731185009083102`。

运行必须从 fresh build 的真实 Test/Game DLL 加当前两文件源码身份，保留官方06 Ecs/Gas/Native identity、四+四逐例结果、零skip及 raw child exit；源级预期合计5 pass / 3 fail / 0 skip。修生产前先确认三个负控达到各自目标守卫，修后同 test SHA 全8 GREEN并保留原 RED；相关原 promise、Fire/Aura、Native13 仍分别跟踪，不借新8项替代旧断言或完整业务。Root正在处理的预算生产与21/22项真实 RED 不在此审查范围，本轮没有碰它们。

## 追加：Native13 首真实执行与 Root fixture 修正独审

本段独立于上述新4+4静态PASS；新4+4两SHA再次核仍相同，尚未收到其实际执行结果。本段没有修改test或生产。

`native-correlation-review-01` 实际 **13 total / 12 succeeded / 1 failed / 0 skipped / raw child2**，JSON exitCode2相符。log SHA独立重算 `4fbface2576490cc2d50775bf9ca9f0e260d4bc9a26d25f4beffc2069796b424` 等于记录；JSON SHA `8647d2e96abae43425b22a99377940ab87c2666c73fb71a2926d4b079884727a`。固定旧13源码23e8…a26，TestDLL `22073913aac3a930a9b0d0e6ae7478e98a0478471e5b254713669efadf74968c`、GameDLL `7365a0ff8d2870766ffec05623acf6cc60f4a1b5ac175065935dd04c7183c18e`，Ecs/Gas仍上述official06身份。

唯一失败为 MultiFire 第200行旁路10106 Expected Applied/Actual Rejected；实际日志在该失败前已有两条10110 Initial Applied、各completed=True、实际Participant owner/row0，旁路10106错误 `effect_target_ineligible`，owner default/row−1/completed=False。不能把它说成两Fire关联失败，也不能把未执行的下一empty-window断言记为已通过。

Root随后只改该方法Start为 `WireProfile.SuccessorBindingReceiptsPartsV1`，并在其唯一调用的StageInventory增加PreparedRevision非零断言。新13文件 SHA `7f5eb46bb80ab908bb30a092b4d85e54dfdd73e8f0da12dd969950d85254b007`。在内存逐一撤回这两个唯一文本片段即还原原SHA `23e8b7369e054dc3b95fcb90d3c718dfd7f25cf018b042d58771aa91ef012a26`；其余12case及所有旧Applied/health/order/window/assert确证逐字不变。Inventory生产 CanSettle 当前SHA `9fdb58ced0b66a051ba7bf71ecf541d370390130153918348d99fd2837c97d6d` 与本run的sourceSha256AtStart一致，守卫没有放宽。

**该fixture修正源码质量 HOLD：profile 单改不足以满足 PreparedRevision。** BomberInventoryEffect.CanSettle:18要求非零PreparedRevision。BomberSuccessorLife声明初始化Sync默认0，文档明确是Runtime dormant successor创建时的revision；generated绑定/restore没有为initial life另造非零默认。全非生成Gameplay唯一非零写入是 BomberSuccessorLifecycle.ConfigureDormant:163，其调用仅来自Advance中真实reservation/eligibility/revision路径:88。Start(profile)使用真实admission八连接、三次正常Tick、DrainOutbox及真实bounded writer读取/acknowledge/settlement，是正确initial admission路径；但它没有死亡/PrepareSuccessor/ConfigureDormant/transfer，不能据此获得非零PreparedRevision。因此当前 StageInventory 新assert静态预计先失败，这只是fixture修正未完，不是生产guard缺陷；尚未执行新SHA，不冒充已见此断言RED。

保留旁路10106 Applied覆盖时，可靠fixture须复用已有真实successor preparation/transfer流程，为这两旁路目标建立实际current successor并核非零revision/full current life关联，再发10106。不能手填revision=1或改生产资格来凑绿。若改用其他真实可准入unrelated Effect，需由Root明确重新界定此项覆盖与新SHA，不能称原10106覆盖未变。原12PASS保留为旧binary证据，待新的完整13同新源码身份重新跑；不能重标为候选13已绿。
