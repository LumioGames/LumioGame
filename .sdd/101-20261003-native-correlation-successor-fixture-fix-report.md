# Native13 MultiFire successor fixture 修正 · 作者交回

2026-10-03。Root授权仅改新增 NativeCorrelation 类的一项 fixture。按 receiving-code-review 先核实际首 RED 与资格守卫，再核完整路径/期限，最后只改该方法。已于本报告写作前向Root发送 **SOURCE STOP-WRITE FENCE**；不再写源码。Root统一fresh build14和真实执行，本轮没有build/test/GEN/Native/format、生产或其他测试/fixture写入，没有stage/commit。

## 身份与先前失败保留

修改文件 `games/101-bomber/Server/Tests/Gameplay/BomberReducerNativeCorrelationReviewTests.cs` 最终SHA **`c320d14323216f4c56e14c64b16175418cc0447740ffc0fb7a0abf905090cd1f`**。

原真实13 run的SHA `23e8b7369e054dc3b95fcb90d3c718dfd7f25cf018b042d58771aa91ef012a26`，实际12PASS/1FAIL/0skip/raw2；sole failure旁路10106在第200行Actual Rejected/effect_target_ineligible，两10110此前已真实Applied。旧证据保留在 `.run/v14-native-production-20261003/native-correlation-review-01.*`（相对games/101-bomber），不重标成最终候选结果。

Root前次仅initial admission profile+PreparedRevision assert的候选SHA `7f5eb46bb80ab908bb30a092b4d85e54dfdd73e8f0da12dd969950d85254b007` 为独审HOLD：initial admission不创建dormant successor revision。这个候选尚未真实执行，不能声称该新assert已实际RED。本次完整preimage保存 Root `.run/native-correlation-fixture-fix-01/before.cs`；最终after.cs与proof.json同目录。

机械以before中的唯一MultiFire完整方法替换after对应方法，即逐字还原整个before文件，证明**仅该方法变动；其余12case、using、ReceiptProbe及所有helper逐字相同**。StageInventory中Root所加PreparedRevision非零断言保留。Inventory生产资格 `9fdb58ced0b66a051ba7bf71ecf541d370390130153918348d99fd2837c97d6d` 本轮未写，不放宽守卫。

## 完整实施计划与实际改动

1. 改用现成 `BomberTerrainProductionTests.Scene(0, controlled:true)`。它经真实Native world/admission、三正常Tick、初始投影实际DrainOutbox和bounded writer/ack/settlement，取得八个连接life。clone其Lives仅用于本方法current目标索引；共享fixture未改。
2. 用真实Scene.Write将3..11内部格打开，其余life移到15.5/15.5，旁路两旧life分别5.5/5.5与11.5/11.5，避免Power2互伤。各三个真实ECS bomb以同一实际source life1发起，正常Tick走Native HFSM→actual10101 settlement→6HP归零→死亡结构。核old life已destroyed、participant AwaitingRespawn；没有赋Health0、死亡phase、PreparedRevision或任何receipt。
3. 通过现有 `scene.TickControlled()` 消费/转送actual SuccessorRequests。它发送带原request的真实 TransferSuccessorConnectionMessage；不是替代成功结果。等待有界 RespawnTicks+32，结束条件同时包括new current live、RestorePending=false、DormantLife清空（已land）。逐两人核generation2、full participant/life association、Protected phase、非零actualPreparedRevision、真实controlled binding、各一个 actual Applied transfer/result newBinding、恢复health6，更新本方法lives[5]/[6]。
4. 不清journal。保留六 actual prelude damage为基线，逐条核目标为两旧life、sourceLife/Participant准确、entityID为六实际bomb之一；每旧life恰三条。后续StageFire两target仍0/2，StageInventory两实际successor仍5/6；原10106 Applied、完整handle顺序、两个Fire actual/full facts、health、其他FireStatus为空、下一空结果窗全部保留。
5. 原“damage journal空”变为完整六条基线原bytes不变；下一正常Tick原final2变为baseline+2，原基线prefix逐字不变，两个增量均由该唯一sourceBomb/sourceLife/sourceParticipant且cause burn，target0/2各一个。这不扣掉真实旧记录或以仅计数掩盖错源。

严格保持10106类型及Applied预期；没有把它换成别的unrelated effect、没有手填revision、伪造EffectResult/Claim/actual association或清生产frame。

## 时钟、期限与边界

真实默认Tick20、respawn3000ms即60Tick，等待最多92Tick；三deathTick加后续IdleBomb一轮与目标两轮小于PresentationJournal RetentionTicks200，六条基线不会自然过期。默认match duration420000ms为8400Tick，controlled Scene设剩余完整match时间，该prelude远早于FinalCircle/round deadline。测试没有延长任何这些deadline或改配置；若实际恢复/landing超过明确窗口，会真实失败而不是无限等或伪造完成。

IdleBomb在prelude后才创建，Fuse+1000Tick，不会在两次相关Tick间自然爆炸；source与被测两Firetarget仍不同。两successor可保持真实重生保护，Inventory资格不拒绝Protected，但health6、RestorePending=false与full current-life关联照常约束；Fire目标0/2是原未死亡life，保持既有Vulnerable前置。

本fixture仍是Runtime owner集成驱动，不是完整Host/Platform或八Bot验收。所有actual Damage/Successor/Inventory/Fire断言须经Root统一实际执行；本报告只有源码和字节验证，没有声称修复后13绿。新增Split4/FireCut4文件仍原SHA3d1286…819ae/9760c4…e3d0，未改、未跑。

## 作者角色与后续独审

我此前是这两4+4与Native13 narrow fixture问题的独审；本次接受授权成为MultiFire fixture修正作者，**不对自己的新方法出独立PASS**。旧独审报告不回抹，HOLD与旧run身份保留。Root应让另一agent核真实successor资格、六条journal严格基线及其他12case byte-exact，再绑定最终source与fresh DLL跑完整13零skip、raw0。若首失败在death/landing/transfer/schema，不将其包装成已成功的旁路10106资格。
