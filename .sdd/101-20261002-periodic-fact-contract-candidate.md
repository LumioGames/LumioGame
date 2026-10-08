# 周期结算事实：待 Owner 裁定的最小候选

状态：提案，未获批准，不是已生效契约或可用 SDK 功能。冻结/免控继续使用已批准 finite-ta。本提案只补 Game 实际需要的周期数值事实，不开启另一套计时或结算循环，不把首版 instant-only guard 删除后直接放行。

现有依据与真实缺口：Engine ADR-126 的 D1-D7 工程裁决明确“首次 instant-only fact 不覆盖 finite/period/control”；当前 `engine/wire/effect-lifecycle-v1.json` 同义。43a59 原包生成器执行 `resume7-period-fact-generator-red` 退出 1，准确报错 `facts require instant lifetime`。最小变换、原源码及包 hash 位于 GTCG `.artifacts/resume-20261002/period-fact-probe/manifest.json`。Runtime ed5 的 `FiniteEffectSettlement` 在 period 回调后只发行通用 Result，ResultFacts 为 null。读最终 HP 无法还原同 Tick 多次伤害的各次 before/after/actual。

Game 必需用例是 ADR0047 的毒：一次原始来源、2 秒与 4 秒两跳、可致死、重复直击不续期、解毒当 Tick 抑制未来跳、A 的旧结果不得改归属到 B；以及兔回春：每 20 秒连续未掉血实际回 1 点，按实际回复量触发集束最爱。同 Tick 其他伤害/治疗不能让统计、死亡和最爱从最终 HP 倒推。

## 建议裁定范围

仅允许带既有 finite-ta Duration+Period 的生成声明声明 **Period 专用事实**。Initial/Control/Terminal 仍不产生该周期事实；已有 instant fact 保持现有字节、语义和拒绝路径。周期 Apply/Period 不得再入 `Effects.Apply`，不另发瞬时请求绕过已预留的 period 工作；周期回调对声明的 Base 属性写入并调用一次 CompleteFact，由原 Runtime period 相执行并发行其真实结果。Game 回调仍只表达该次数值规则；生命周期、due、排序、抑制/移除和身份全归 Runtime。

机器契约、生成器、Runtime 与包身份必须一起更新为明确的新声明能力/版本，旧消费者拒绝新声明；是否升 fact-plan revision 或增加独立 period-fact tuple，由 Engine owning ADR 定稿，不由 Game 分配版本或错误编号。本提案不将任何新标志伪装成已批准 v1。

## 每次事实及真实行选择

每个 Period 事实必须携带完整原 EffectHandle(WorldId/InstanceId/Generation)、TypeId、原 Target、原 Source、AppliedTick/ordinal、DueTick、ResultKind=Period、执行 Tick/ordinal。保留全部不可变 typed payload，因此 Game 可取得原 Participant、Life、LifeGeneration、MatchId、BombId、ChainId 与来源 Life。Source 销毁不改写原值；Target 当前代际不匹配不会重定向。before/after/actual 是该次回调原子读写的真实值，不是 F 后重新读取属性。CrossedZero 仍由 Runtime 检测，与同一 occurrence 绑定。回春满血时 actual=0；不得据请求 Magnitude 生成“已回血”。

复用现有 row schema、owner 字段 ID 与 index 字段 ID 的显式选择。Game 在有限有界的真实 ECS 容器中分配行，将 owner 的 NetEntityId 和真实 i32 行索引放入 typed payload；Runtime 首次准入解析并锁定该物理行的 layout/slot/ordinal、owner generation、列数/容量、字段 codec 与绑定版本。没有扫描找空行、反射字段、Game 回调索引、自动扩容或模运算猜槽。

建议一条活跃有限 Effect 独占一条周期行直到 owner 完成该 Effect 的最后结果保留期；每 Tick 至多一跳，同一行可跨 Tick 复用。Game 的毒与回春不能与原瞬时 `bomber.health` 单行共用；建议分别声明有界周期行组，并放在稳定 Participant 上，行内明确旧目标 Life。为 A 已终止待消费与 B 新生命并存预留不同真实槽。槽满时新有限实例准入拒绝，不能挤占已承诺的旧周期或覆盖旧事实。新槽/旧槽释放规则须由 Runtime 的完整 association 与结果借用期证明，不能只看“Effect 不再 active”。

## 同 Tick 多结果与保留

完整 occurrence key 为 `(full EffectHandle, Period, DueTick)`；不能仅用 Handle、当前 Life、TypeId 或 result 数组索引。每次执行在修改属性前取得独立的 invocation certificate；该次 CompleteFact 恰好一次、Ready 唯一且最后写。F 的 Claim 必须同时匹配 occurrence、已绑定物理行和该次 certificate。每个 certificate 的 captured/output 列不可由 F 改写；F 仍只写声明 status。跨 Tick 的旧 certificate 不因相同行索引被再次使用而重新有效。

同 Tick 多个 Effect 的事实分别占有各自行/证书；同实例最后 Period 与 Terminal 共存时，只有 Period 带该证书，Terminal 不覆盖 Ready 或 before/after。结果数组的排序与借用期沿现有合同。Game 在借用期内通过 F 将必要事实记入有界业务行，之后可延迟执行业务统计，但必须保留旧 occurrence 身份。不得长期保留借用对象，也不得为了 B 新实例清掉未消费 A 的业务事实。行的复用必须发生在旧证书退役和必需的业务复制完成之后；未满足的复用为 invariant fault 或新请求准入拒绝，绝不能悄悄丢掉到期周期。

建议对周期 association 的一次准入就冻结容量与生命周期 pin。每次 due 先验证原 binding 和可用证书/写预算，再读写；列 resize、owner/generation 更换、非法 Ready/status 改写不能被降格为正常 Rejected。Game 对实际已执行 A 的记账不能借新 B 的 Handle；当前状态清理只能在完整身份一致时进行。

## 预算、恢复与故障

令 Q 为待准入请求上限，L 为已准入有限行上限，D 为任一 Tick 最多 due 的已准入周期行（D≤L），M/I/B/S 为真实生成 period fact 的最大写数/索引写数/写字节/证书 scratch。保留现有 Q+C+2L 结果、live/pending 字节、Native HFSM、F、传输和物理帧全部不等式。事实附加预算至少覆盖 Q 的 instant/initial 义务和 D 的 period 义务（保守 Q+L），按实际最大列与 codec 推导；不能只按当前观察到的 due 数配置长期额度。首次有限准入预留其 recurring due/fact 能力，新请求、控制、同 Tick initial fact 不得耗尽旧 due 行的额度。拒绝新请求为 default Handle 且无后续结果；已准入的周期不得因后来负载延后/跳过/重播。未知来源或 overflow 在准入前拒绝。

F 计划须对同 Tick 实际多类结果和各类声明写集合重新生成证书；无论逻辑类别是否互斥，都由闭合程序和绑定证明，而非手填“validated”。新增周期 fact 字段、索引复制、Ready-last、所有状态 hooks、证书与 work/scratch 均计账。scope.None 不产生网络字段，但不免除事实或复制旧/新本地容器快照的实际成本。不能为本提案提高固定物理帧限或删减已有验证。

只接受完整 paired checkpoint：保存 effect 的 A/D/P、下一 due/cursor、该有限行 association 的具体物理身份和不可变 payload、已完成 occurrence 与仍需保留的证书/业务事实。WorldId 冷恢复重绑定须由 owner 同时转换完整 Handle 引用，不改原来源 Life/代际。恢复后只执行 cut 后尚未执行的 due，不补跑过去抑制/已执行的跳；同 cut 的 final Period+Terminal 恢复不得再扣一次。Raw RuntimeOnly 不得宣称完整活动局恢复。

错误保持闭集：未知 tuple/revision/列类型/索引选择/非法 finite+fact 组合归 declaration/registration 拒绝；请求空间、live/due/fact 预留不足归既有 admission capacity；时间计算溢出归 timing overflow；错 World/句柄归既有身份拒绝；回调缺少/重复 CompleteFact、非法访问、列绑定被换、已承诺预算不足与原始回调异常保持 ADR095 fault，不吞成正常 Rejected。需要新增错误时由 Engine 定稿，Game 不自造公开错误码。

## 批准后必测

两个同时 due 的不同实例逐次 before/after/actual；同 Target 毒+回春+瞬时伤害的确定性次序；最后 Period+Terminal；满血 actual0；致死与后续尸体请求；原 Source 先销毁；应跳 Tick 解毒；同 Tick A/B 首次命中；A 延迟业务消费与 B 重施加/新生命；真实行索引非零与复用错代；Q 压满不能挤旧 due；每项容量 exact/one-short；complete-fact 缺失/重复/非法写；paired cut 前后逐 Tick 回放、不重跳；真正客户端复制及 Host 下整局。

Owner 只需裁定是否批准这项受限的 Period 专用 typed fact 能力及上述身份、保留与容量原则。具体机器 tuple、声明语法及 release lineage 仍在 Engine/Runtime owner 侧实现与独审，Game 等正式包回接，不以本提案自行开启功能。
