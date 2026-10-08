# live11 A 第13生命死亡 PrepareSuccessor 所有权只读边界

2026-10-04，reentry_trace。范围仅实际完整11对应 Runtime `520ffe482e1c48fb6e48187925eecec986cdb9c8`、Server `008861074a2d3c9da1b0407325ede6f851704fd5` 源码及已冻结 live11 数据。未操作现场、写生产源、构建或测试。具体 Prepare 拒绝码尚未记录；此报告不裁定根因、不提出放宽所有权或额度。

## 真实现场

同组首次关闭前 A40 的 before sample 是 observing self=participant `0000000000000001000000000000000f`、AwaitingRespawn、authority6270。首个新页面 A42 已被权威转为 controlled life `00000000000000010000000000000202`、lifeGeneration13、Protected、authority6352。其后第二次关闭前 sample 已是同 life202、AwaitingRespawn、authority6601。因此第13生命死亡并不是第二次关闭之后才首次发生；必须保留观察重连→真实transfer→下一次死亡这条链。

Perf 作者由成对 checkpoint13/14/15解码得到 tick7799/8399/8999：A current/lastLife202、lifeGeneration13、death6513、respawn6573、DeathStructurePending=true、SuccessorPending=false、ReservationSlot=0、DormantLife=0、TransferRequest=0。独立读取 checkpoint15 的 Game tuple 还确认 intentGeneration13、nextLifeGeneration14、Eligible=true、ObservationParticipant0f；restore旧成功目标202/lifeGeneration13/restoreIntent12/settlement6326，slot归零但旧 reservation generation12字段仍保留。

这些字段符合 Game PrepareDeath未成功、Destroy之前的阶段；没有公开 Runtime route、reservation credit 或具体 error 值，不能据此认定 binding_not_found 或旧credit泄漏。

## 所属 Runtime 真实拒绝出口

[WorldManager.Successor.cs](C:/Work/LumioGames/.101-pack07/LumioGameRuntime11Composition/modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.Successor.cs:155) 的 PrepareSuccessor155–217是 managed 所有权函数，没有直接的 Native successor ABI 调用。真实 Native involvement 是第177行读取 World 最近提交的实体空间 bounds；bounds账簿在 [NativeEntitySpatialIndex.cs](C:/Work/LumioGames/.101-pack07/LumioGameRuntime11Composition/modules/ecs/src/Lumio.GameRuntime.Ecs/Spatial/NativeEntitySpatialIndex.cs:84)，不是第二权威World。

| 顺序 | 拒绝条件/return |
|---|---|
| 159 | 非Server/非ProcessorPlan/无control adapter：scope_violation |
| 161–169 | 无旧life或participant、声明/完整Game association不一致：successor_target_invalid / invalid_binding_shape / successor_binding_mismatch |
| 170 | adapter无法捕获真实旧life连接：binding_not_found |
| 171–175 | profile不支持、epoch耗尽、身份超界：successor_profile_required / binding_epoch_exhausted / invalid_binding_shape |
| 176–179 | participant Observer不为disconnected、旧life无LogicTransform/无提交bounds、anchor非法：successor_target_invalid |
| 184–194 | 同participant/account/旧life保留条目不能合法替换：successor_reservation_invalid |
| 198–205 | slot/result/correlation/event或正常projection/reservation预算不足：successor_capacity |

[EntityBindingQuery.Successor.cs](C:/Work/LumioGames/.101-pack07/LumioGameRuntime11Composition/modules/replication/src/Lumio.GameRuntime.Replication/Binding/EntityBindingQuery.Successor.cs:11) `TryCaptureSuccessorBinding` 先通过 TryResolveConnection，再从真实entity account、room和Observer epoch/Profile构造binding。`TryResolveConnection` 第215行同步pending，观察者route只认 Connected+Observing reservation，否则从 `_connectionToEntity` 查旧life。正常控制断线在 Query.Disconnect324–337删除route/profile但保留生命；普通准入/重连后重建route。

## 旧 consumed owner 不可直接判错

Prepare185–191明确允许旧记录满足 `Consumed && Participant==new participant && Attachment.ControlledLife==oldLife && Cleanup==null && !HasSuccessorCredits(token)` 时作为 priorOwner 被本次原子替换。第206行仅在完整新预算校验后将其ProofRetired并释放。ReleaseSuccessorReservation658–667有意保留已消费且OrderAttached的当前tuple，代码注释写明下一Prepare可替换，持久Game字段不能重建它。

因此“13次循环仍保留旧owner”本身不是错误；要证明旧条目阻塞，至少需要实际error=successor_reservation_invalid及当时 consumed/current ControlledLife/cleanup/credits状态。若存在credits，需辨别 GameConsumed、ResultDrained、PublicationDrained/Abandoned，不得清空credit或绕过实际fence。

RecordSuccessorPublicationDrain692–709以真实Welcome/完整WorldChange drain标记，ReleaseDrainedSuccessorCredits640–657要求ResultDrained+GameConsumed及真实publication结算。断线只标记对应epoch PublicationAbandoned，仍经过正常drain释放；不能凭socket close宣布债务归零。

普通新controlled准入通过 accepted包装的 RememberAdmissionProfile，在 Query.cs154–168及 [EntityBindingQuery.Admission.cs](C:/Work/LumioGames/.101-pack07/LumioGameRuntime11Composition/modules/replication/src/Lumio.GameRuntime.Replication/Binding/EntityBindingQuery.Admission.cs:60)。观察reattach/transfer则通过 CommitSuccessorRoute把entry真实Profile写入新route。仅看到private Admit函数内没写profile不足以归 successor_profile_required。

## checkpoint无法提供的事实

[WorldSnapshotCodec.cs](C:/Work/LumioGames/.101-pack07/LumioGameRuntime11Composition/modules/ecs/src/Lumio.GameRuntime.Ecs/Snapshot/WorldSnapshotCodec.cs:19) LWM1v6 Capture只有Persist实体、partition登记、cut与effect section；tail不是 `_successors`/route/credits 序列化。ObserverComponent在 [ObserverComponent.cs](C:/Work/LumioGames/.101-pack07/LumioGameRuntime11Composition/modules/ecs/src/Lumio.GameRuntime.Ecs/World/ObserverComponent.cs:3) 明确不Persist。checkpoint8999的Game状态无法复原原内存Owner树或错误码。真实恢复8999用来复现结算错误，可独立成立，但不能顺带声称恢复了原socket/route/Native ownership。

## 后续实证边界

Root正在准备新Scene的Game首拒码诊断；它是诊断场景，非正式体验验收。首attempt error只证明首拒因，若后续出现另一error不能直接把首码归整段停滞。收到真实error后再分配所属Runtime或Server真实Native/签名Host窄RED；最有价值的生命周期应保留观察态close/reattach、实际新life transfer、同life下一death、再次Prepare以及后续普通controlled close/reconnect对照。现有Prepared+Witness/Ready重连GREEN只到一次reattach，不覆盖下一次死亡。

当前判定：`ACTUAL_REFUSAL_CODE_UNOBSERVED / NO_PRODUCTION_FIX_AUTHORIZED_BY_THIS_REPORT`。
