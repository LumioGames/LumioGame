# 完整14实际结算停滞：只读证据

结论：**MATCH2_RESULTS_PUBLISHED_WITH_A_DEATH_STRUCTURE_PENDING；PrepareSuccessor 最早拒绝阶段仍未观测**。这不是 DS Tick 冻结，也不是仅旧画面。没有修改源码、运行测试、控制浏览器或改变服务。

新只读结果：C:/Work/LumioGames/LumioGame/.run/live14-results-readonly-01/analysis-03/result.json，SHA256 `4974931e5831165b27c8172978ff14043548aa91c8e61a7685bc0c433800b340`；清单 C:/Work/LumioGames/LumioGame/.run/live14-results-readonly-01/analysis-03/manifest.json，SHA256 `bbb59ca42d429505bac848b599b587e165a6f624ab90db63c5513093116d9e22`。

原 DS 诊断日志通过实际 fd/fstat 固定读取了 46,365,143 字节，尾拍 35392，SHA256 `048503af00fca2f1afe2ab1175938eb0613ebd64bf29f93bc83c0a2a110e673c`。它与只有启动信息的 2,495 字节 lumio-ds.log 分开保存，未把 Win32 缓存长度当空日志。17 个浏览器原 JSON 已冻结；V9 第14项另存 analysis-03。完整原清单 C:/Work/LumioGames/LumioGame/.run/live14-results-readonly-01/manifest.json，SHA256 `f9745c1ae323df094f05900bbc256deacf96093b3d2fe284269498d190c029fe`。

两份实际完整 checkpoint 71/72（Tick42599/43199）的 manifest、runtime.bin、voxel.bin 已复制到 C:/Work/LumioGames/LumioGame/.run/live14-results-readonly-01/checkpoints-02，所有外层 SHA、LRC1 的 runtime/voxel/delivery 内层 SHA 及三处 Tick 均相等。实体字段按正式 LWM1 v6 只读解码，不称 Native Restore，也没有解码内存 connection indexes 或 successor credits。checkpoint 清单 SHA256 `32aa5a878b3c4fdf7f60fe633681c68e2081261c79970127f93d8ec2d49be922`。首次 read-cuts.mjs 请求已被正常留存策略退休的 checkpoint22 而 ENOENT，属于行政读取失败；未生成任何结果，原脚本保留，新02先枚举实际存在 cut 再读取。

两 cut 逐字一致的关键字段：

- A participant `0000000000000001000000000000000f`，CurrentLife/LastLife `000000000000000100000000000003a2`，LifeGeneration27，LifePhase2/AwaitingRespawn。
- DeathTick/DeathStructureTick13560，DeathStructureLife3a2/Generation27，DeathStructurePending=true；DeathConsumedCount12，TerminalLife仍前身383/Generation26，TerminalCapture/DestructionTick13258。
- SuccessorPending=false；ReservationSlot0，ReservationGeneration26；DormantLife0，TransferRequest0；IntentGeneration27，NextLifeGeneration28，Eligible=true，ObservationParticipant0f。
- A body3a2仍有持久实体记录、健康基础值0；另有 live player44e。完整账号 `acct_5f77fba54c7da3f6733068e6bf1cdb62` 来自该 body 的 Identity 持久字段。这里没有票据或密码。
- World matchId/index2，Results5，StartTick9411，EndTick17811，PhaseEndTick18131，OutcomePending=false，Winner participant05、SurvivorCount1。Results PublishedGeneration2、RetainedMatchIds[1,2]；本局 A 行 Life3a2/gen27、rank2、survived=false、eliminatedTick17811 已发布。

真实时间链：

| 证据 | UTC | Tick/身份 |
|---|---|---|
| 第2局开始日志 | 04:14:22.165804Z | occurred9351，输出9352 |
| A 新 life 上次恢复结算 | checkpoint持久字段 | settlement13318，life3a2/gen27 |
| A 旧连接真实 peer1001 | 04:17:46.405174Z | conn-e2bf…，随后给3a2排原 expiry |
| A72 fresh account reconnected | 04:17:48.447849Z | actual admission tick13477、conn-d12da… |
| A72 Welcome63 到达 | 约04:17:48.474Z | Self3a2；是浏览器收到头，不是服务端 Observer 快照 |
| 致死拍实际提交 | 04:17:52.553000Z |13560；3b1→3a2 damage_applied 同 occurred13560，cause0 |
| 第2局结算日志 | 04:21:25.207590Z | occurred17811，输出17813 |
| 预定下一局时刻持续提交 | 04:21:41.105694Z |18131、frames8、pendingInputs0 |
| cut11 双端 Results | 04:33:47Z |32649/32651，A仍3a2 AwaitingRespawn |
| A72 真正关闭 | 04:35:47.339777Z |conn-d12da… lifetime1,078,900ms，107/107 ping/pong |
| A73 fresh reconnected | 04:35:58.889074Z |35286、conn-ddf1… |
| V9 双端实际 Welcome |约04:35:58.927/59.161Z | A73 epoch64/Self3a2；B74 epoch55/Self participant11 |
| V9 cut14 |04:36:21.367Z |两端authority35729，A active/InputEnabledtrue/InputOpenfalse |

故致死13560发生在同账号 fresh 准入之后、持续活跃旧 socket 区间里。仅用“离线 Prepare binding_not_found”不能解释此证据。浏览器 origin+performance 时刻用于算头的到达 UTC；它不补造 authoritative Observer 状态。A sessionGeneration1 是本次 client attempt，不能当 connectionGeneration64。

现行阻塞链有确定源码依据：C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberEffectBusiness.Server.cs:130–155 每拍只在 PrepareDeath 成功后清 DeathStructurePending 并 Destroy；C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberSuccessorLifecycle.Server.cs:17–36，ReservationSlot0 时调用 PrepareSuccessor，非空 error 直接 false，不打印。它按 AwaitingRespawn 写 Eligible=true，即使 match 是 Results。C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberRoundTransition.Server.cs:34，任何 DeathStructurePending 必定拒绝 Prepare；C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BombSystem.Server.cs:412–415，Results到期后 Prepare=false 返回，所以此 A intent 足以阻止自动下一局。其他 guard 可能并存，不能据此排除。

不可观测边界：ObserverComponent 明确不 persist/replicate（C:/Work/LumioGames/.101-pack07/LumioGameRuntime11Composition/modules/ecs/src/Lumio.GameRuntime.Ecs/World/ObserverComponent.cs:3–7），LWM1 A fields 没有 Connected/ConnectionGeneration；原日志没有 PrepareSuccessor、binding_not_found、successor_reservation_invalid 或首拒日志，也没有 fatal。不能把 Welcome epoch 填回服务端字段，不能从 Slot0判断具体为何 reserve 前拒绝。正式520 Prepare 先校验 association、current binding/profile/epoch/participant Observer，再检查 consumed owner reuse/credit/budget；任何非空 return 都留下同样 Game 持久状态。

下一步 Root 已授权在 NEW C:/Work/LumioGames/.101-pack07/LumioGameRuntimeControlledReadmissionDeath（纯正式520ffe）复用 normal replication 的 HostedAdmissionFixture/SuccessorBindingTests partial：真实初准入→实际致死/Prepare/Create/Restore/Ready/Transfer/GameConsume→普通 controlled Disconnect→同account fresh controlled publication完整读取/ACK/结清→新 life 在线致死→Prepare。先打印实际 error/当前真实 binding/债务并保留 baseline；这是新实验而非现有现场完整内存恢复。原13生命绿色链只含 Observing reattach，不能替代此 controlled re-admission 情形。现有 RuntimeOfflineDeath 七源及 Engine DRAFT 保持封存、Owner答复仍 Pending；新实验不夹入该本地语义。
