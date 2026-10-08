# live11 Game 下一生命准备停滞：只读现场证据

2026-10-04，`/root/browser_perf_trace`。仅复制现场日志前缀、核验持久化检查点及阅读源码；未操作浏览器、服务、构建、Game/Runtime 生产或测试、schema pins。新诊断源由 Root 作者写入，本代理仅独立审查并保存原/后字节。

判定：**ACTUAL_STAGE_CONFIRMED_BEFORE_PREPARE_SUCCESS / EXACT_REFUSAL_CODE_UNPROVEN**。A 的这次死亡未完成 PrepareSuccessor，因此没有进入新生命创建、restoration witness 或 Ready/transfer grant 阶段。后来的结算异常是另一条真实故障链，不能替代准备失败根因。

## 冻结边界与解码资格

证据目录为 [game-life-readonly-01](C:/Work/LumioGames/LumioGame/games/101-bomber/.run/browser-experience-repair-01/live-11/game-life-readonly-01/prefix-manifest.json)。DS 日志从 offset 0 读取当时长度 12,979,942 bytes；读取起止长度一致，读取时间为 `2026-10-03T22:38:12.155Z` 至 `.165Z`，冻结 SHA256 `14f4a17e564c5aa5f255293c3f0ded39e68e3a70cc99d08ae4f5b337d6f70b62`。这证明该前缀，不声称后来原文件仍未增长。Launcher 原日志另行复制。

checkpoint13/14/15 的 manifest、runtime.bin 和 voxel.bin 均原字节复制。检查每个 manifest digest、LRC1v1 runtime/voxel/delivery 三 digest、长度与 cut tick 后，依据真实 Runtime11 `WorldSnapshotCodec.cs` 的 LWM1v6 读取持久实体字段；u64 保留字符串、NetEntityId 保留完整 32 位十六进制，无 JavaScript 数值截断。没有恢复 World、创建虚构 owner、调用自定义加载器或将检查点当另一个权威世界。输出为 [cut-boundary-facts.json](C:/Work/LumioGames/LumioGame/games/101-bomber/.run/browser-experience-repair-01/live-11/game-life-readonly-01/cut-boundary-facts.json)。

实体段后按官方格式继续读取 partition/cut/GAS section。三 cut 的 GAS version1、nextIdentity10、identity count9、finite row count0，row count 后剩余 bytes0。该尾部不是隐藏 owner registry。`CaptureSnapshot→WorldSnapshotCodec.Capture` 只序列化持久实体、partition、cut 和 `IWorldEffectPersistence`；GAS 实现写 generation/finite effect rows，LRC 另包 voxel result delivery。ObserverComponent 明确不 Persist，因此实际解码中没有 Observer 字段；`_successors`、connection map、current attachment、grant、credit flags 均不在此检查点。公开恢复会重建归属，不能恢复原现场 socket/registry 或推出某拒码。

## 完整身份与三个稳定检查点

A participant 是 `0000000000000001000000000000000f`，current/last life 是 `00000000000000010000000000000202`，LifeGeneration13。tick7799、8399、8999 三检查点全部相同：

| 字段 | 实际值 |
|---|---|
| LifePhase / DeathTick / RespawnAtTick | AwaitingRespawn(2) / 6513 / 6573 |
| EliminatedTick | 0 |
| DeathStructurePending / Life / Tick | true / 完整 life202 / 6513 |
| SuccessorPending | false |
| intentGeneration / Eligible / NextLifeGeneration | 13 / true / 14 |
| ReservationSlot / DormantLife / TransferRequest | 0 / default完整ID / 0 |
| 旧预约 allocation generation / 旧恢复 target | 12 / 完整 life202 |

旧 reservationWorld/generation、已完成 restore outcome/target 留存是前一生命转移历史；ReservationSlot0 不能拿这些旧列构造“当前 pending grant”。旧 life202 仍有正式持久实体记录，phase2/gen13/preparedRevision1。tick8999 距死亡 2486 tick，距预定复活 2426 tick；按配置20Hz分别相当于124.3/121.3秒 tick 区间，未将此换算冒充独立墙钟测量。

B participant `00000000000000010000000000000011` 的 current/last life `00000000000000010000000000000203`、generation12，phase3/EliminatedTick6808、DeathStructurePendingfalse、SuccessorPendingfalse、Eligiblefalse。B 的合法终局观察与 A 未完成普通复活不能混成同一拒绝原因。

## 实际重开与死亡顺序

原 A40 首关前 probe 为 observing Self=participant0f、AwaitingRespawn、authority6270。ledger 第一次 actual close 40→新42：`22:31:41.707Z` 关，`22:31:42.178Z` 新开，旧 tab absent=true。Server 记录旧连接 `conn-c81057bc2bc21b7a81f94fbfcad8cbb5` peer close `22:31:41.760052Z`；新连接 `conn-5f3403a924b13ad1c7458e43c9c9fade` 在 `22:31:43.756958Z` reconnected、Host tick6328。其 admission 日志 generation0 是该记录元数据，不能替代 Runtime current attachment epoch。

A42 新 probe 已是 controlled完整 life202、Protected、authority6352、inputOpen=true；第二次关闭前已为同 life202 AwaitingRespawn、authority6601。因此现场序列是观察态关闭→新路由重开→实际新 life transfer→这条新 life 下一次死亡。

DS prefix line40003：`22:31:53.062577Z`、Host tick6515、Game damage_applied gameTick6513/eventSequence1737/source `0000000000000001000000000000020a`→target完整 life202/cause0，与持久 DeathTick6513一致。A42 下一次真实 peer close 在 `22:31:57.973562Z`，晚于该记录约4.911秒。因此第13生命死亡在首次新页在线期间、第二次关页之前。Host tick6513 commit 的 UTC 不能冒称 Game death 的精确 UTC；这两种时钟分别保留。

## 源码闭环及尚未观测的拒绝出口

`BomberOutcomeReducer` 接受死亡后写 DeathStructurePending=true、life/generation/tick。`BombSystem.ExecuteCore` 在每个 ProcessorPlan 首段调用 `BomberEffectBusiness.Consume`；Consume 对历史 tick 的待处理死亡要求原 life 身份仍 live，再调用 `PrepareDeath`。只有返回 true 才 capture carry、置 SuccessorPending、清 DeathStructurePending、Commands.Destroy。Headless gen0 或非零 ReservationSlot 会直接成功。因此真实 pending/slot0/live-oldbody 三个 cut 与持续提交共同定位于 PrepareDeath 非 null error 返回 false 的出口；不是只由 AwaitingRespawn HUD 猜测。

Game `PrepareDeath` 每 tick 重试 Prepare，没有记录 error。Runtime Prepare155–217 仍严格核 scope、声明/完整 association、真实 binding capture、profile、epoch、身份、participant observer、Logic/bounds、已有 owner/credit 和正常预算。具体 `binding_not_found`、`successor_reservation_invalid` 或 `successor_capacity` 当前都 **UNPROVEN**，不授权删除 guard 或额度。

旧 consumed owner 允许满足 participant/current ControlledLife/cleanup/无credit 后被下一 Prepare 原子替换；保留 current tuple 本身是正式语义。实际 credit 的 ResultDrained/GameConsumed/PublicationDrained/Abandoned 无日志，不能凭 socket close 声称归零。普通 Admit 私有方法虽未直接存 profile，但 accepted 的 TryHandle 包装确实调用 `RememberAdmissionProfile`；不能以局部函数归因 profile 缺失。

实际 Game `Advance` 对 transfer 结果会清 TransferRequest，并按 Pending/Eligible/restore witness 重新请求；这条机制不证明本场景到达它。这里 ReservationSlot0/DormantLife0/SuccessorPendingfalse，优先应观测 Prepare 首拒码，不应先改 Ready retry 或 frozen grant。

## 后来的独立结算故障

checkpoint8999 match：phase3、phaseEndTick9015、endTick0、outcomePendingfalse。全8participant淘汰 tick：0003=7077、0005=6940、0007=6762、0009=7242、000b=7242、000d=6869、0011=6808，唯一000f仍phase2/EliminatedTick0。

到 time cap，OutcomeReducer 对唯一 pending participant 写 phase3/EliminatedTick=currentTick，alive0选择 SimultaneousElimination。正式 BomberResults 校验该结束语义要求至少两人 EliminatedTick==EndTick；这些历史淘汰不能自动算作同 tick。Results 同源构造 header survivor count 与 rows，不能简化为随机计数漂移。末尾实际 presentation9015 由另一代理独立核验；本报告持久证据只到8999。

Launcher 明确 `BOMBER_EXECUTE_FAULT tick=9016: Result winner or survivor count disagrees with rows`，ValidateMatch235→Publish122→BombSystem.PublishResults629→EffectBusiness.Consume161。DS 最后提交 Host9016/applied9016/frames8，下一 Host9017 在 ProcessorPlan fault，随后 host_abort/DS_FATAL。服务退出足以解释后续第六次无法重进，不能倒推为此前 Prepare 停滞根因。

## 交回与限制

下一步真实诊断应保留 observing close→reattach→新 life transfer→下一 death/Prepare 的实际序列，先捕获原拒码，再建立所属仓窄行为 RED。已审窄日志源默认关闭，单首 attempt、不查额外 owner；其资格见独立诊断报告。不能把构建通过、schema子集合门通过、页面active或八人 roster 替代可玩复活/十次重进。

source-seal SHA256 `b8bc7b9a3f91da31a47dc47eb134cee18c52a40e88e0ee1d6d2b12017c632342` 保存26个相关源、原/后诊断、ledger与分析脚本/输出。只读脚本首尝试的路径错误及混合换行假设错误是分析工具错误，未运行测试，未形成行为 RED；更正后 exact inverse 与 tail 完整边界断言通过，原现场和私有已复制字节均未覆盖。
