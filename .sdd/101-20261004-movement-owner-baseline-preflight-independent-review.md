# 101 movement owner baseline — independent preflight

2026-10-04。非作者只读审查，审查者 `/root/browser_perf_trace`。裁决：**ACCEPT_FOR_ACTUAL_COMPLETE11_RUN_WITH_EARLIER_GATE_QUALIFICATION**。这认可两条测试可以尝试捕获真实投影缺口；没有执行行为测试，没有新增行为 RED，更没有认可移动预测或浏览器体验交付。生产、测试、生成物、pins 均未改；未操作浏览器/服务，未占构建槽。

Exact NEW test：`games/101-bomber/Client/UI/Spectator/tests/MovementOwnerBaselineTests.cs`，SHA256 `abdbba0434ce4785dfb55ae77479f08f0ee6e7b25af7bad6f194f412667b4eed`。最新计划 `.sdd/101-20261004-browser-movement-red-plan.md`，SHA256 `75ba44cf70a0c4b32feda9a8f76bac5aecc78040e2845f4ffa2856545b927c7f`。Runtime11 inspected HEAD `520ffe482e1c48fb6e48187925eecec986cdb9c8`；Client inspected HEAD `a6071a2a28c3cfda78400254654d6da1fef25b92`。这些是本次源码资格边界，完整11正式包及测试运行闭包仍由 Root 独立核验。

## 夹具是否接到真实投影

接受当前源的基本路径。`BrowserSessionOwner` 从明确指定的官方 Native 启动 `LumioEngine`，真实 `HttpListener`/WebSocket 接受连接；`SpectatorReplicaHost` 通过正式 `ClientSession`、握手、WorldChangeRuntimePort、ClientReplicaFactory、Native voxel sink 装配。它提供显式测试 authority envelopes，不能证明真实 DS/Platform 准入、签名、房间身份或最终浏览器验收。

新 `ProjectionRegistry` 复用既有 `LateSpectatorCensusOfHundredPlayerRoomAppliesAsFullSnapshot` 的 wrapper 形状。真实 server Gameplay GeneratedRegistry 提供实体声明、components、config binding、world services、字段与 reducer schema；只省略 Game systems（EcsRegistry.Systems 默认空），使这个测试固定于投影而不运行完整对局。Server world 仍由公开 `WorldManager.Tick()` 与 Native owner 执行，不手调提交相、不制造客户端投影。新 test 不建第二种位置字段。

实体步骤已修正：先创建 participant/player，Tick 结构提交，再断言真实 AssignedId 非默认，通过服务器实际 live component 写 Sync.Value；没有使用失效 draft 的 Entity ID。随后公开 transform controller 写 actual LogicTransform，真实 player Observer 连接。第3次 Tick 的普通 projector 对新 observer 生成实际 Welcome 与 WorldChange。`WorldManager.Visibility.cs` 新 census 遍历真实创建序，world、participant、life 都是普通 CS 实体；Self 有首包优先规则。wrapper 不注册 block-entity/subsystem 部分，因此它是普通实体投影测试，不覆盖地图 Section 初始订阅。

反射仅用于隔离 Server Gameplay ALC 的真实服务器 component；没有写 client memory、没有改 WorldChange create/field 正文。`Set` 写在结构提交后，baseline 由真实 `IGeneratedComponent.CaptureSync` 和 Runtime `Visible` 生成。真实服务器 memory/gen 非零断言在传输前执行，避免默认0==0假绿。客户端还须达到 Active/InputEnabled，且实际 LogicTransform 完整向量等于服务器值，随后才到目标断言。

## 身份与两个目标缺口

新 local Authorize 使用 **实际 participant.AssignedId、实际 welcome.Self、实际 welcome.ConnectionGeneration、实际 InstanceId**，Attachment participant/currentLife/viewEntity 完整一致，ControlledLife=Self，controlled mode。它没有复用公共 helper 中 `(world,4)` 的固定 participant。Authority world/socket/account/incarnation 是清楚标注的测试 carrier 元数据，不得当作真实 DS 证据。

第一事实到达客户端后检查7个既有 memory 非零值。`BomberPlayerState` 的 InputMemoryMatchId、PendingTurnDirection、PendingTurnUntilTick、LastMoveDirection、LastMoveTick、LastAssistTick、AssistToleranceMilli 当前全为 Scope.None。Runtime11 `WorldManager.cs:1239` 的 Visible 只准 Room/Aoi、实体本身 Owner 或合法 Claim；Scope.None 不会进入 Create 或 delta。因此在正确的生成源/构建闭包及 baseline 应用后，源码预期第一断言会见 InputMemoryMatchId=0、expected55。实际失败及后续6值仍需真实运行逐字段证据，不能用源码推断代替 RED。

第二事实先断言 actual participant.CurrentLife==life、player.Participant==participant、player.LifeGeneration==3，再调用真实 `MoveAbility.CanActivate`。Running+Vulnerable 满足 `BomberMatchRules.IsPlayerInputOpen`；真实 PlayerEntity 声明包含 AbilityComponent/BomberSkillState；没有设置冻结，client FrozenUntilTick 默认0。PrimaryDirection=Right 排除了“没有方向/没有缓冲”门。`BomberInputMemory.IsCurrent` 的准确比较为：player 真实且可输入、participant 非默认且 live、player generation 非0、participant.CurrentLife==player.Entity、participant generation==player generation、participant.MatchId==world match。它 **不比较 InputMemoryMatchId**。参与者 CurrentLife/MatchId 为 Room，player Participant/Generation 为 Aoi；参与者 LifeGeneration 为 None，预期投影后仍0，因而真实能力应返回 `move_source_invalid`。这是当前精确首门，不能归因“InputMemoryMatchId 不匹配”。

Scope.Owner 的真实普通 projector 与 EntityBindingQuery 同为 **entityId==observerId**。本夹具 Self 是 controlled life，participant 是另一个实际 Entity，因此只把 participant generation 改 Owner 仍不足。计划中的将该现有参与者身份代次与其 Room CurrentLife/MatchId 同可见，只能作为后续 Game schema 候选，须实际 RED、独立设计/源码审查、新 release/generation/migration/pins 闭合；本审查没有授权改字段或 Runtime visibility/IsCurrent。

## 较早门槛和最小 test-only 处理

1. 完整11 selected SDK、Native+sidecar、client replica 与 Server/Client Gameplay 必须精确匹配。现有 `LoadServerRegistry` 使用 collectible ALC 隔离 Game 两端，在 Resolving 中按程序集名称返回 Default 已加载 Runtime；这是既有夹具路径，不能改成忽略版本的修复。它本身不能证明 exact CLR identity。Root 应记录实际 PE reference/version 与加载闭包；不匹配就 INVALID_ENV，不用 resolver 掩盖、不复制 DLL、不改 deps。当前 tests csproj SHA `9895c7454ab21a037e11e13e5274dd51e3656d090fee38a8967914feeb5f46d4`，原临时额外 HFSM Reference 已撤回；不是正式修复。项目本地 LumioEcsGenerate=false 不应作为全局参数传播关闭 Gameplay GEN。
2. 条件性分片代次风险：NEW local Authorize 未更新公共 helper 私有 `_generation`，其初值仍9；实际新服务器 observer/Welcome 为1。现有 Apply 在 encoded baseline <=65536 时直接发送正文，不读取该值；仅 >65536 时构造 WorldChangePart 使用gen9，可能比目标断言先失败。本次只读没有实际 baseline length，不能宣称已触发。最小处理是只在 NEW test 记录并断言真实 WireCodec.EncodePack(baseline,owner.WireProfile).Length <=65536，再沿原 Apply；若超限，保留前置失败，不记 visibility RED。若需要正常 parts 路径，可只把 NEW test 的真实 server Observer.ConnectionGeneration 设为9，与现有公开 Authorize 默认代次/初始化 carrier9一致；local identity仍全部来自 actual Welcome。更泛化的 local Apply 方法可用公开 Send/PumpUntil 和现有合同形 parts 封装，显式传 actual welcome generation，保持实际 baseline 正文不变。不要改公共 helper 或注入客户端字段。
3. 新 baseline 要实际包含 world/participant/self，Match phase delivered，真实 Welcome/Authorization 到达，client active/position preconditions成立。源码遍历及只有3个普通实体支持可达性，但 Native config、effects budget、typed schemas、census 等真实运行门仍须留原结果。任何较早失败都不是两条目标断言 RED。
4. `owner.Apply` 等待 Host PlayerState 的 authorityTick>=change.Tick。该 Host 字段来自正式 ReadField(match.phase).ObservedTick，不是 gameplay phase自己变化的Tick。当前 Client DeliveredFields.Commit 给 **每个已完成实际 WorldChange** 更新全局 `_tick=change.Tick`；match phase 真实 Room 字段在首包存在，且 completed published baseline 可观察后这里预期不会因 phase未变化而卡住。若缺字段/可见性guard/发布失败则真实返回0或抛错，要作为首包门另记，不能替换为伪造 world clock。

Server/Client config 当前根 manifest inputHash、contentFingerprint 和 sharedPrediction fingerprint 三项一致，证据 manifest保存两端原字节。sharedPrediction fingerprint `53cef613347fa329ec4d085e74012c9889f8b758010384aac512e2490537ebc5`。真正 consumed generated binding/嵌入 config 与运行产物还需 Root 新构建资格，单凭磁盘配置相同不能证明已加载 DLL 相同。

## 历史失败与验收范围

| Attempt | 原始退出 | 实际阶段 | 裁定 |
|---|---:|---|---|
| baseline01 |5|MTP参数/0 tests|INVALID_RUNNER，无行为RED|
| baseline02 |3|direct runner unknown --filter-class/0 tests|INVALID_RUNNER，无行为RED|
| baseline03 |1|2 tests发现且均在 BrowserSessionOwner ctor HFSM1.0加载失败|INVALID_ENV，无目标断言|
| baseline04 |build1|缺 Lumio.Wire using 和 Welcome class with 误用编译失败|INVALID_COMPILE，无行为运行|
| baseline05 |1|exact abdb test；2FAIL/0skip，均 ctor HFSM1.0加载失败|INVALID_ENV，无目标断言|

本审查不新跑测试；以上原 log/result/source 原字节保存至新独立证据。03与05的2FAIL不是本缺口TDD红例。即使完整11得到准确 memory/gen RED，它仍只是后续真实预测接缝的必要前置，不证明连续移动/本地完成结果/Model发布/碰撞/Section可用/纠正、双玩家连续位移或10次真实关闭重进。

当前 test 没有给 client Native voxel 投送 Section，没发送实际持续 move(false)，没执行并观察 completed GAS/presentation result；它不会证明空 Client ExecuteMovement 修复，也不能借 confirmed pose 增加影子玩法状态。计划下一阶段仍应逐接缝验证真实 Section/read-only collision、原唯一权威 LogicTransform、原实体完成 Model结果及 covered input/correction；本轮保持窄 Scope/identity 门，不扩成全面 Model 实现。

独立证据：`games/101-bomber/.run/movement-owner-baseline-independent-review-01/manifest.json`，包含本次 exact source snapshots、Runtime/Client identity、config对照、01–05分类及必要原日志。审查脚本只复制到新证据目录并哈希，未写生产/测试源。任何后续 NEW test 修改都要保存 abdb 原字节、重新记录 hash 与 actual run，不能把本次 source-only verdict沿用为新版本行为通过。
