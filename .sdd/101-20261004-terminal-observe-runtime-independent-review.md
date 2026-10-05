---
name: 101-terminal-observe-runtime-independent-review
description: 独立审查Runtime已提交终局观察归属事实最小出口修复、真实RED/GREEN和保留的资格/身份守卫；完整包组合前查
metadata:
  type: report
  status: 独审通过待完整包真机验证
---

# Terminal observe Runtime 独立审查

裁决：**ACCEPT_EXACT_OWNER_FIX_PENDING_COMPLETE_PACKAGE_BROWSER_VERIFICATION**。非作者reentry_trace审查browser_perf_trace的精确候选，没有发现仍待修复的P1/P2；仅接受下面两个文件。最初提出的“captured false/revision1永远只走terminal判定”已被独审拒绝，最终候选保留原合法资格恢复行为。本裁决不是浏览器体验、最终发布身份或正式交付验收。

Reviewer没有构建、执行测试、改生产、暂存、提交或重启live09。读取原日志/实际退出码、原source与candidate source、合同及源码调用链；独立复制原RED和最终候选证据，校验作者封存中75个文件元数据的当前实际bytes/hash。Root可只显式提交这两个源文件，再在干净组合工作树消费完整包。

## 精确来源与封存

- owning工作树：`C:/Work/LumioGames/.101-pack07/LumioGameRuntimeTerminalObserve`，分支`codex/101-terminal-observe-owner-facts`，基准/当前HEAD为正式Runtime `d8ae3da3793d5d95785606be319668a4318af85a`，不是诊断0053；审查时未提交。
- 生产只改 `modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.SuccessorProjection.cs`：24新增/1删除，当前SHA256 `ad40a93b5c49d2d24cc34707451b064c12d4d9b4b4d35ffb03a368797b5fabe9`；原d8 SHA `dc38067a7f9c25187343751e8d0f8a2de086e9df22df458a34ed6e42579e80fb`。
- 新测试 `modules/replication/tests/Lumio.GameRuntime.Replication.Tests/TerminalObservationOwnerFactsTests.cs`：SHA `825727c9325330e8588b35cb523ad6b1a455fac92d5de040bc50688f2937e13d`，RED06与最终GREEN逐字相同。
- 作者seal `.run/terminal-observe/candidate-seal-01.json`，69,075bytes，SHA `66c0a6151e935c9ff96c05cc78c3b9a3fa21443adc130a4dc3604b57543589ab`；作者当前source、candidate副本、各实际test输入hash与reviewer副本均匹配。
- 独立最终seal：父Game `.run/terminal-observe-independent-review-01/final-01/manifest.json`，63,515bytes，SHA `a8b35c59f637eb9e43031a84202b9b131b668fa3bec3228dbf81a3aa89e7105b`。同目录复制两个candidate source、未改未来源码、原日志/输入/结果、production patch、作者seal及实际GREEN test/ECS DLL。仅为审查证据，未执行/放入宿主或发布包。
- 预审拒绝变体报告保留 `.run/terminal-observe-independent-review-01/contract-boundary-preflight.md` SHA `2b420424aae48610bf7bd179791ace724a3a9af1697ac4af2c4492f5cd8b040b`，不以最终接受覆盖旧finding。

## 根因与出口语义

原PrepareSuccessor在普通ProcessorPlan允许捕获Eligible=false的真实旧生命关联。BeforeSuccessorDestruction在实际结构销毁前验证完整原认证binding和原registered association；CommitSuccessorObservation记录实际Destroyed事件，在Connected/LiveBindingValidated成功时提交新观察route/epoch，标记Observing并产生Applied observe、Welcome与捕获owner facts。PublishSuccessorResult把result/facts保留在原charged credit。

DrainOutbox和TryDequeueSuccessorResult在交付前仍调用ReadResultOwnerFacts→ValidateCurrentSuccessorOwner。该current-owner检查原来误借未来复活的MatchesCurrentEligibility→policy.Eligible，导致已实际切换为观察者的终局false资格丢失owner facts。此次只把该owner读口的拒绝式变为：原严格future matcher不通过时，再尝试精确terminal观察matcher。未来创建、readiness、restoration、transfer全部仍走原严格资格函数。

原RED02真实2case/1FAIL/1PASS/0skip，owner facts第66行null；在该断言前，实际原account/room/epoch、reservation、事件chronology、old life tombstone、live participant、观察mode、Applied result、实际Welcome/WorldChange均已通过。第一次测试中的scope_violation是测试在planning外调用Create，不是本次根因；原失败和改用Scenario.Stage2的正常fixture修订均保留。

## 终局出口逐guard审查

新增MatchesTerminalObservation192仅允许以下事实同时成立，并仍进入原其余current-owner检查：

| 边界 | 实际保留/新增校验 |
|---|---|
| 已提交观察而非未来control | Observing、LiveBindingValidated、未Consumed、ControlMode.Observing；Destroyed实际事件存在且sequence晚于capture，原old life已非live |
| 没有prepared未来资源 | Order/Created/Witness/Request/Grant均空，原captured association Eligible=false，owner revision1 |
| 当前token/instance/ref | FindSuccessor完整incarnation/slot/allocation token且当前slot entry引用相同；原disposed/fault/proof-retired/cleanup检查全部保留 |
| 当前generated来源 | participant live；registered声明Id匹配、access对象引用相同；ObservationParticipant精确为participant |
| 当前政策与原证明 | 当前policy完整值等于captured Match/Life/Intent/eligibleTick/false/NextLife；当前owner四列Match/Intent/NextLife/eligibleTick也精确匹配 |
| 当前life关联 | 原ValidateCurrentSuccessorOwner中的CurrentLife/LastLife/LifeGeneration与captured pending association完整比较，未删 |
| observer/route/epoch | 原viewEntity必须live及实际Observer Connected/current generation检查；view=participant、controlledLife=null；当前socket availability与profile检查保留；不把epoch写死为original+1 |
| GAS/结果 | 原EffectAuthorityWorldId非零且同真实当前GAS World；ReadResultOwnerFacts仍需要同credit result引用、当前attachment等于result.NewAttachment、owner revision和GAS authority相同 |
| account/room与历史归属 | 原BeforeDestruction完整authenticated original binding与association比较；reauth控制仍检查原account/room/profile/socket/current attachment；fact构造仍取原不可变Original、Association、Captured及实际Destroyed事件；Host现有独立Session/result/provenance关联校验不变 |

新guard不输出新字段、不变wire合同、不变quota、不注入Tick或影子World、不把观察者赋予控制。已认证terminal观察可以正常读取公开CurrentOwnerAttachment/只读CurrentOwnerSnapshot，也可真实断线后重附着新socket/epoch3；旧socket不可读。future CurrentLife的恢复仍需原生成来源、target/witness、真实GAS恢复和当前Eligibility=true。

## 原四资格函数保持逐字不变

Reviewer对git d8原blob逐字节比较以下全文，全部相等；这比仅比较编译结果更明确：

| 未改全文 | SHA256 |
|---|---|
| WorldManager.SuccessorEligibility.cs | `bf01107ebf196168a17f5959fb641665d9bcd5d97a8ed13e9fa07d0cd393211f` |
| WorldManager.Successor.cs | `18013d7e0ff369d1de55b054da4768f275292e317cd52dc1539297dadd21dca0` |
| WorldManager.cs | `4891bf8110dc14473e60c89a937c3dee2afbf2f224f365b67ab66a6d9faefcbe` |

因此TryCurrentSuccessorPolicy、MatchesCurrentEligibility、CreateSuccessor、ValidateSuccessorReady四个未来资格函数未变；CorrelatesSuccessorTarget、declared恢复/关联、owner drain/额度/事件生成等亦未变。Production diff仅Projection文件，其它tracked生成变化38个由既有generator写CRLF产生，reviewer逐一规范化后与d8 blob相同，无文本语义差异，不纳入候选commit。作者seal记录34个locks未改；审查未修改任何lock或产物。

## 拒绝错误的同tuple bool恢复限制

公共冻结Engine `0e2fc74783f9f186d59909b38d4ee70887a21137` 的successor-binding-v1 association176/currentEligibility638规定owner-issued revision target tuple为matchId/intentGeneration/nextLifeGeneration/eligibleTick，不含bool Eligible；当前合同SHA `148fe1d1f21ead99b748f079595c3bc27239bc998995be1654f0554a71213331`。TryReadSuccessorEligibilityChange比较这四列。

RED03 case0曾期望capturedfalse后只把当前bool变true就必须丢facts，缺乏既有合同依据。若将capturedfalse/revision1永久限为“无Order/Consumed的terminal”，随后合法同tuple Create→Restore→Transfer会被拒绝current controlled facts。作者接受review finding：错误期望与临时未经接受的ternary retained evidence保留，最终生产使用OR保持原true资格路径。

新增正常基线TerminalObservationReadinessCanResumeCurrentDeclaredPolicy在**原d8实际通过**：同tuple false→true后，真实Create、Effect恢复、Request、Host转移控制、实际controlled result/facts/connection和公开只读snapshot全部成功，Game消费后仍可读current owner。最终GREEN继续通过。没有通过新增测试制造生产权限限制。

Bomber当前静态路径也成立：PrepareDeath17-37根据AwaitingRespawn决定Eligible，仅Prepare/reservation；BomberEffectBusiness随后普通Destroy，不提前建立Order/Witness/Request/Grant。BeginNextMatch40-48同时改变Intent/NextLife和Eligible，属真正tuple变更，仍必须原supersede。该产品路径证明现场terminal guard合理，但不被用于缩减Runtime通用合法恢复。

## 已有真实结果与无效尝试

| 结果 | 原始解释 |
|---|---|
| red-02 | 2total/1facts FAIL/1future-create guard PASS/0skip，exit2，真实首次根因 |
| red-03 | 16total/2FAIL/14PASS/0skip，exit2；第二FAIL是后来被拒绝的新错误bool期望，不能算第二根因 |
| red-04-test | rawexit0、16显示PASS，但与并行build争用/旧未经接受ternary DLL身份不符，**INVALID，绝不计验收或GREEN** |
| red-05 | 原d8和原ECS DLL，16total/1facts FAIL/15PASS/0skip，exit2；合法bool恢复完整transfer基线实际通过 |
| red-06 | 最终同一测试source，原d8，17total/2facts FAIL/15PASS/0skip，exit2；初observe与真实terminal reconnect c2/gen3各因ownerfacts null失败 |
| red-green-02 | strict构建0warning/error、raw0；精确OR候选17/17PASS/0skip，raw0 |
| red-green-class-01 | 原完整SuccessorBindingTests类**172/172PASS/0fail/0skip，raw0**，包含上述17，不叠加成189 |

新13个拒绝变异验证当前Match/Intent/eligibleTick/NextLife/LifeGeneration/ObservationParticipant/current/lastlife、Observer connected/epoch、control adapter、GAS World和断线发生变化时facts及公开owner读口拒绝。原全类覆盖受控owner10变异、account/room/incarnation/current attachment CAS、actualrestoration/target、disposed/fault/unknown/debt和readonly不推进pendingroute等，原断言未改。

GREEN17 log SHA `2e6a853aef945e40e1dd89c790f867b568da173bd84deb58b59fd2496f7ccfe9`，完整172 log SHA `13d6437bbdfe1eb5bba3fe06d58011b2ee7319d030d568482b5352b3f2588fc8`。Native调用使用官方完整09公开Native DLL `.../complete-release-09-diagnostic/server/win-x64/SDK/Native/win-x64/lumio_engine_native.dll`，SHA `030046d7563efd8cfe01e127bd719470eaba06ef81c7f808b640d97efea78ba8`，buildId `d595e2c77e6943ecbbf43ea3994b8367`、abiHash `c5f276c855bcb71fd9b04dcd546d1dd925ac408fd6303d56e30a2c044946a2f3`、sidecar匹配；Native源码来源81b2501。真实NativeWorldTestBinding经NativeEngineLease/context/spatial/HFSM/clock/Base64绑定，不是原型driver；既有测试限额未改，也不冒充真实8人room。

Reviewer原RED保存的test DLL SHA `b49dc6e3dabfe2a5392a66a1bee7d4c02a02ded7a43eb6e42adc23177ce509ba`、ECS `b2ec0b19bf8519eed9e7302edb43be707ceed9c049b647899ccf6da60dfbeefd`；最终当前GREEN test DLL SHA `efce131a90e9387678c27053ea216fe223ed89b1f8811a5d731d4061c62c2e23`、ECS `9a62a94f412e9cb1881790fd8dce203266b949f0e24e14f208763513986426d4`，均与作者actual结果JSON及reviewer复制一致。没有使用待构建或前一轮程序集冒认本次source验证。

## 完成边界

接受精确ad40/825两个源，允许Root显式commit并组合官方完整生产包；不夹带4个私有诊断源、生成副作用、旧DLL或其他工作树修改。新完整包与真实Game重建之后，还须实际8人A/B、长期生命/终局/同房新局、当前停提交与至少十次关闭重进的浏览器时序/同步体验证据。现有live09 late-life token对应Runtime具体drain尚未被新包实测，本独审不能把它宣称已修复。现场进程和18081/18082/18084均由Root保持，reviewer未操作。
