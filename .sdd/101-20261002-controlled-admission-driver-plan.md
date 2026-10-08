# 正式 Host 准入驱动接线

这是当前执行设计与断点，不是已通过的验收证据。公共语义仍直接以 Engine 的 `successor-binding-v1.json` controlledAdmission 为准；不在 Game 引入规则或准入替身。

## 已核实的缺口

- Server `Inner::decide_admission` 已先登记 controlled PendingAdmission；实际 authenticated writer 也已在调用前进入 pending_egress。Owner 原回归144通过/1旧忽略。完整attempt尚待接入，不能将顺序修复等同准入完成。
- CLR现有不可复制ValidatedAdmissionBind接 exact plan/capacity，原窗口在未知响应时保留并禁止重入。旧 selected successor入口无plan明确拒绝；Owner新driver必须使用该能力。
- `accept_successor_initials` 当前依赖普通 Tick 中的 Welcome，并在它前面另插 authorization。新 Runtime 的唯一冻结初始发布必须由 cursor 读取，不能再依赖重复普通 Welcome。
- `clear_pending_admission` 目前直接删 pending；新增 plan/window/远端 grant 后必须先进入原 executor 的 Cancel/Release/terminal/cleanup 对账，未退清不得丢 owner。
- 实际 sender 的 slot/byte capability 已实现并通过独审110项；它证明一帧窗口，不能代替完整 Room/Section/parts 预留或最终 write fence。

## 实施顺序与唯一 owner

1. 在真实 authenticated transport 分支完成原 verifier 与 socket 检查，将原 Egress 放入 pending owner。通过原容量检查后先登记 PendingAdmission，再开始 Acquire。重复同 account 和同 connection 不产生第二次新建。
2. 新私有 AdmissionAttempt 由 PendingAdmission 持有，包含 verified session、原 Acquire/Control/Read 预扣窗口、原 snapshot grant、实际 publication reservation。公开 DTO 或从外部反序列化的数据不能构造该 owner。
3. Acquire 从冻结响应中借用 exact plan 字节；比较完整 Context、capacity 与私有 receipt。未知响应保留原请求原窗口；不得重新分配 requestId/grant 或按改变后的世界重采。
4. 按返回实际 plan 对 Room/Section logical records/bytes 和单帧 parts window 做真实预留，再送 Reserve，核对 private reservation receipt，随后 Validate。失败只从原 plan Release；仍 Pending 的释放进入原 executor 的清理通道。
5. 给 ClrGameplay 转交不可复制的已验证普通绑定控制窗口。现有 selected Admit/Rebind 只消费它一次；Deferred 不丢窗口。普通入口携带原 plan/capacity，不重建 target、attachment 或角色状态。
6. Tick 返回 actual InitialOwnerProjection 与独立 CurrentOwnerAttachment 后，以原 verified session/socket 做 issuer 比较。cursor0的冻结 authorization 必须与实际 issuer 字节一致；cursor1 Welcome 必须匹配当前真实 attachment。比较通过前不向 Socket 发 sizing bytes。
7. 每次 Read 前已有真实单帧 sender/window credit。沿唯一 cursor 读取、检查长度/摘要/顺序、复制到实际 queued output，然后 ACK。这仅转移字节责任，不能当作 socket 已写完。
8. 把 plan 实际 Sections 登记到既有 Room/Connection Section ledger；不能另造订阅或把不可用key当空地形。初始输出期间后续普通 delta 必须保持相同 socket/generation 顺序，不能穿越 baseline。
9. 最后一个 frame ACK 后排入真实 write fence；只有 Written 或有证据的原 socket Undeliverable 才发 private publication settlement。TerminalAcknowledged、snapshot/Native release、旧 incarnation Retire 分别取实际回执，不能互相代替。
10. connection close、World fault/restore、Host shutdown 共用原 owned attempt；禁止普通游戏推进来清理关闭世界，禁止下一 incarnation 认领旧 plan。只有所有真实资源/metadata义务退休才删除记录。

## 预算与验证

原 1 MiB/connection、65536B frame、4096 authorization、现有 records/parts/Native arena上限保持。完整窗口还需计算 CLR DOM/token/DTO 瞬时占用；Read 的 CLR encoded response 已在原 snapshot grant 的 bridge extent 中，只能通过 exact grant/plan 的私有借用能力避免重复预扣，不能信任 public DTO 宣称已付。

每步保留真实失败回归。先跑 Rust实际预算/故障窗口，再用当前 frozen Host/Runtime/Native 跑签票→真实 Socket→Acquire/Reserve/Validate→Tick→逐cursor→write fence→清理。确认该接线后才恢复101正式Platform/DS整局、同房间下一局及多地图/多profile/技能矩阵。

## 并行边界

- Root：Server Owner、Rust grant/windows/transport、整合与最终真实链路。
- capacity_resume：Runtime admission provider 与 HostEntry.Admission.cs，包含唯一初始投影、稀疏实际Ready订阅集合、所有实际回归与SDK冻结。
- client_composition：先收口 entry05实际重试/输入诊断，再接 ClrGameplay staging 独立文件；接口转交需明确窗口和capability所有权。
- gameplay_resume：Resume8圈/资源/重生与强箱，冻结后Root整合；空档独立审查。

## 2026-10-03恢复点

Root新增Engine/src/owner/admission.rs与admission/prebind.rs。实际队列token持Room records/bytes与Section真实requeue额度，metadata预付，原socket fence Written/真实close才能开闸；DROP不自动完成。4个Owner边界和1个Section测试通过。Prebind已编译，原Acquire→Reserve→Validate→bind窗口移交与拒绝cleanup持有已写，尚未挂入PendingAdmission或真实跑全链；不可冒称已接线。

client_composition当前独占admission_attempt、publication、cleanup、grant/window、CLRbind、successor issuer/terminal解析。capacity_resume独占Runtime provider与Host Admission部分，真实Unknown接收owner仍在补。Root拥有Owner/Section ledger/总集成。

Root独立Host终结15/15通过，报告101-20261003-host-terminal-independent-review.md；Game Resume9已合入679/679，98生成一致。全量正式交付门仍未完成。

## 2026-10-03 Owner接线恢复点

Root新增 `Engine/src/owner/admission/lifecycle.rs`，受控driver已挂PendingAdmission；原egress由admission_retained保护至真实协议退休，关闭/普通legacy deadline不丢原capability。Core Owner145通过/1原有忽略、新7通过；日志admission-lifecycle-owner-02/new-01，全部WIP诊断，不是正式CLR链路。client_composition新增cfg(test) ProtocolRuntime透传原AdmissionCallWindow，目前独占`owner/admission/flow_tests.rs`补完整生产owner流程。Root拥有lifecycle/owner/section；不要覆盖agent测试文件。

初始Runtime帧真实顺序是auth、Welcome、N个Section、WorldChange或parts；不是cursor2就是WorldChange。Root累计实际Section Ready，期间原RuntimeFrame组由actualbudget预付后存入ControlledAdmission.deferred，同时计入同ObserverEgress records/bytes；全部初始Section可达后按组路由，仍不得穿fence。该路径和whole-owner shutdown清理尚需真实验证。退出时旧finish_retained_cleanup只poll Runtime，缺Root publication/Unknown transfer推进，需要保留整个Inner并在原executor Retry时共同推进。

ActiveRuntime作者2824全绿后发现Validate再借已退款Acquire余额，继续修。BindingContext Root独审发现容量B预检之前按C分配容器，真实3.37MB RED，gameplay修复中，旧pack-01不交付。三项公共契约裁定仍待用户，无擅改。
