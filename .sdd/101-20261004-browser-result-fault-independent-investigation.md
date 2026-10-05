# 101 live11 Result fatal：独立只读调查

结论：第六次关闭重开暴露的是已退出的服务。直接终止链为 Game 结算发布被原严格校验拒绝，随后 DS fault/1011，Bot 自然结束，launcher 收到 Bot exit0 后执行清理。尚未完成 Native 延续复现，不能把本报告称作修复或体验验收。

## 冻结输入与时序

证据目录：`C:/Work/LumioGames/LumioGame/.run/browser-result-fault-independent-investigation-01`。`complete-input-manifest.json` SHA256 `740e943d1bb8afaadf6ac3e230a7106e3c52be746f6d5c7cb2ff6918e228fa1b`，44 文件，14,759,635 bytes。所有冻结件在复制时与原件逐字节一致，没有修改生产、原测试、pins、DLL、浏览器或服务。

DS 原日志完整 12,979,942 bytes，SHA256 `14f4a17e564c5aa5f255293c3f0ded39e68e3a70cc99d08ae4f5b337d6f70b62`；这里是退出后的完整文件，不能与早先运行中的 prefix 混称。

| UTC | 实际记录 |
|---|---|
| 22:33:58.070124 | Host commit9015，8 frames |
| 22:33:58.118989 | Host commit9016，8 frames，pending inputs0 |
| 22:33:58.188338 | Host attempted9017 的 ProcessorPlan 异常 |
| 22:33:58.190094—190108 | runtime_failure、serving→faulted |
| 22:33:58.190488—195197 | host_abort，8 sockets以1011关闭 |
| 22:33:58.2030584 | PID6876 Bot最后带时刻记录：input_disabled；其后同文件为 scenario.finished |
| 22:33:58.256929 | process_supervisor ds_fatal |
| 22:34:32 | 第六次关闭前浏览器证据文件落地；已晚于 DS fault约34秒 |

`lumio-ds.log` 的完整堆栈使用 `BOMBER_EXECUTE_FAULT tick=9016`，这是 Execute 读取的 `World.Tick`；Host尝试9017，最后正常commit9016。三个时钟不可混写。Bot finished/OS exit缺少独立墙钟时刻，不能断言 exact exit 时间。launcher末尾的“Process6876 exited... code0”是捕获的子进程结束条件，不能据此推翻较早的 Game/DS fault；`launcher.mjs` 的 catch记录失败，finally关闭网页并清理自有 children。这里没有我们触发的停止动作。

## 八人状态与确定的构造路径

正式 checkpoint15 的 paired cut为8999，配置 identity仍是旧签名 `bomber-0.0.4-main.ecece8a`，不能称发布身份闭合。完整包11实际源码/DLL身份已在独立 identity审计封存。checkpoint runtime SHA `4d93a4d89f384f7a6feb4d1599de9d392773cdd12ce44ac967f6e49040403063`，voxel SHA `5bdef1b87c65be52d678be4fa8cea238a2be56c121845314634c780740229f99`。

私有 `read-frozen-facts.mjs` 独立复核外部长度/hash、LRC1三个内层digest、LWM1 v6身份与tick并只读解码ECS字段；inner runtime SHA `ff6e83c4b54bc13debb97803e5e6b996f1077deac9a11ac52bf4d0ebe39e3a24`。`independent-facts.json` SHA `70780937351d17e244326ec579d58f580d7789a9b4fe64320ce8d62e08a81d0e`。未语义解码Effect、reservation与delivery尾部，未恢复World、未运行Tick。

8999 的实际 match为FinalCircle、phaseEndTick9015、EndTick0、OutcomePending=false。八个参与者均完整身份前缀 `0000000000000001`：

| Participant suffix | 8999实际LifePhase | 8999实际EliminatedTick | 源码确定推导的9015结果行EliminatedTick |
|---|---|---:|---:|
| 0003 | Eliminated | 7077 | 7077 |
| 0005 | Eliminated | 6940 | 6940 |
| 0007 | Eliminated | 6762 | 6762 |
| 0009 | Eliminated | 7242 | 7242 |
| 000b | Eliminated | 7242 | 7242 |
| 000d | Eliminated | 6869 | 6869 |
| 000f（A） | AwaitingRespawn | 0 | 9015 |
| 0011（B） | Eliminated | 6808 | 6808 |

A 的完整 current/last life为`00000000000000010000000000000202`，generation13，death6513、respawn6573、DeathStructurePending=true、SuccessorPending=false；8999时只有这一具 player body，仍AwaitingRespawn。它尚未通过PrepareDeath/Destroy，而不是已创建的未来生命。

关闭前 raw浏览器最后 presentation确实为 tick9015、Podium、match.EndTick9015，八participant均Eliminated而该player仍AwaitingRespawn。浏览器投影没有输出精确EndReason/Winner/SurvivorCount及所有EliminatedTicks，因此表最后列、下面header均是冻结源+实际状态的确定性推导，**不是捕获到的最后结果表wire payload**。没有把推导冒充实际Native复现。

`BomberOutcomeReducer.Server.cs` 在FinalCircle遍历当前生成字段/health，A phase2使pendingRespawns=1且不计alive。其他七人已淘汰；截止前没有新伤害事件。到9015的timecap分支将A participant phase改3、EliminatedTick改9015、eligible=false；写match.Podium、EndTick9015、alive0、winner=default、EndReason2、OutcomePending=true。

下一 ProcessorPlan 的 `BomberEffectBusiness.Consume` 才调用 `BombSystem.PublishResults`。它按当前player phase构造Survived=false，淘汰参与者的时间优先取participant.EliminatedTick；rows survivorCount=0。header直接使用同一rows/count变量，故不存在这里凭空猜测的header-versus-row count漂移。EndReason用0→SimultaneousElimination，Winner=default。最后一批仅A一人，正好违反 `BomberResults.ValidateMatch` 对SimultaneousElimination的“EndTick至少两行淘汰”要求，落在235的复用错误文本。

`Publish`先Validate再写任何持久结果列。不能据日志错误文本称“写了一半结果”；异常出在严格结果发布前。唯一存活赢家的Full-ID/帽数tie可能另有覆盖需求，本次没有幸存者，不把它作为这次根因。

## 规则与最小合法修复范围

内核合同141要求最终≤1在致死同Tick权威结束；196保留入圈前预排一次重生。现有 `SingletonFinalEliminationIsRejectedBeforePublishAndAfterRestore` 明确拒绝最后只淘汰一人的全灭，客户端也拒绝不匹配reason/count。`DeadlineClosesAnAppliedButUnlandedSuccessorWithoutLaterReopeningIt`覆盖deadline关闭pending，但其余七人存活，不覆盖本次“只剩一个未完成旧死亡”的组合。

因此不能把TimeLimit允许0、修改singleton负控、给A旧尸体标Survived、重写七人历史EliminatedTick、取消入圈前合法重生或延长timecap当最小修复。单把results改成读取已提交match.EndReason/count/winner仍不能让这个已提交非法header变合法；“同提交快照一致”是必要的发布规则，不能代替生命周期根因。

当前有证据支持的最小合法方向是首先修复PrepareDeath不能完成的实际Owner/route拒绝根因，使原定合法后继恢复；保留Resultvalidator和额度/相序/协议。只有证实独立的Outcome生成缺陷后，才在其生成接缝修正确的同Tick settled state，不能在下一业务帧推导一个不同的胜负来遮住故障。该生命周期调查由另一代理进行，本报告不裁定拒码。

## 意义明确的Native复现建议

新增专用测试可用完整11官方Native/SDK/当前冻结Game源，正式paired checkpoint15通过官方LRC容器解码取得Runtime+Voxel，再用正式 `WorldCreationOptions`/`DualCutCheckpointPayload` 或既有 `BomberTestWorld.RestorePaired` 恢复同cut8999。不可直接把LRC runtime.bin当作LWM Snapshot，也不能改快照字节制造临界状态。

逐次真实Tick记录完整match、八participant/currentlife/EliminatedTicks、OutcomePending/Resultgeneration，直到9015权威转换并抓取下一拍原始异常、快照和TRX/退出码。恢复不含Host route/_successors，在这一测试中只能证明结果生成与发布异常，不能声称找到了重进Owner根因。若官方恢复API要求的initial关联不能由同cut重建，保留INVALID/API失败，不能以手造body/退化RuntimeOnly snapshot补齐。

随后修复回归必须加入真实旧死亡→合法Prepare/Destroy/transfer→最终结束的端到端正控，至少覆盖正常一存活、同Tick双末死、多人存活timecap、原定pending跨FinalCircle及负向singleton/赢家矛盾不发布。原严格反例、Native/默认budget、真实复用snapshot和历史row身份均保留。本调查阶段没有运行这些测试或宣称GREEN。

## 封存说明

第一冻结脚本因误写不存在的BomberTestWorld文件名，在14份成功复制后停止；修正脚本使用实际 `BomberWiringTests.cs`并校验保留件，不覆盖成功输入。旧脚本/部分清单保留。complete manifest行政描述误称“15成功/42+3”，实际 inventory是41原输入+3paired files=44，以其逐文件44条与本报告为准；没有源/test/hash证据漂移。报告完成时Root已授权另一个候选修改Lifecycle为默认关闭诊断，本调查及后续原始RED只消费被冻结原 `97f275969a8a8826a13007c1b315b5e7a258821853e6329013fc7b66dbc2f0de`，不会混称新的诊断1542b源为原始生产。
