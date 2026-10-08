# Online Prepare refusal 私有诊断计划独立审查

裁决：`ACCEPT_PLAN_FOR_PRIVATE_ONLINE_PREPARE_REFUSAL_DIAGNOSTIC_PREPARATION_ONLY`。

审查对象为 Root 作者的 `C:/Work/LumioGames/LumioGame/docs/plans/2026-10-04-bomber-online-prepare-refusal-diagnostic.md`，实际已读修订 SHA256 `4235db08197bc5e423f6eb42a1555d86504eda22c518ad99ea150f9a077edcfb`。允许下一步在 NEW 私有输入中构造、验证 inverse、正常构建和执行配对资格；尚未审 source/artifacts，也不授权作为生产体验验收。

## 静态核对

普通 `C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberSuccessorLifecycle.Server.cs` 仍为 `97f275969a8a8826a13007c1b315b5e7a258821853e6329013fc7b66dbc2f0de`。只有原 inline Observer read 绑定为局部变量、原非 null error 分支增加 stderr、副本类增加 private static metadata；原 Prepare 调用、失败 false、成功 reservation 三字段赋值及其他 guards/returns 必须原样。

原 Runtime520 `ObserverComponent` 确有 public `Connected: bool` 和 `ConnectionGeneration: ulong`。Game 的 Participant Entity/LastLife 是完整 NetEntityId，LifeGeneration/DeathStructureTick 是 ulong，LifePhase 是 int；Successor Intent/NextLife 是 ulong、Eligible 是 bool。计划的字段表达式均与真实类型一致。日志不含 account、ticket、connection payload、token 或授权数据。日志值中的部分 Game Sync getter 是附加诊断读取，不是新增 Runtime/native query。

静态环境 flag 只有字符串恰为 `1` 时开启。HashSet 在 enabled 且 error 非 null 时才懒建，类型 key 保留完整 Participant/Life、Observer generation、Connected、原 error 字符串；先 `Count < 16` 再 `Add`，成功首次 Add 才格式化输出，最多16项/16行。同一离线重试不能刷满该上限，后来连接状态/epoch变化能有独立记录。既有 World 单 owner 同步执行下该 metadata 不选 gameplay 行为、不增加模拟副本或第二调度路径。诊断默认关/无 error 不建 set。

没有新增公开语义、Native API、World查询、输入、pending清理、额度或协议例外。原 OfflineDeath DRAFT 与此任务完全分开；旧四案 controlled readmission PASS 仍不能解释 live14 的真实在线 pending。

## 实际 fixture 与执行条件

逐字 fixture：`C:/Work/LumioGames/LumioGame/.run/offline-controlled-death-reproducer-01/candidate-game-02/OfflineControlledDeathExpiryTests.cs`，实 SHA256 `223fe1f28cef3246721796e7ace29ebf07d5ce432cc8e97312968e271eb6afdc`。

正常项目实际是 `C:/Work/LumioGames/LumioGame/games/101-bomber/Tools/Lumio.Bomber.Gameplay.Tests/Lumio.Bomber.Gameplay.Tests.csproj`，net10.0 executable/MicrosoftTestingPlatform。来源在 Server/Tests/Gameplay 的正常 Compile 输入；额外冻结 fixture 须通过私有正常项目 Compile 纳入并用 PE/PDB document checksum 核实。

实际过滤为 `--filter-class Lumio.Bomber.Gameplay.Tests.OfflineControlledDeathExpiryTests --minimum-expected-tests 2 --fail-skips on`，两案是 `OfflineLethalDeathIsConsumedBeforeOriginalBodyExpiryAndWorldKeepsTicking` 与 `ConnectedLethalDeathConsumesTheSameFullTupleAndOriginalBodyExpiryIsHarmless`。它们有八次真实准入、真实 canonical lethal bomb 和原 Expire/Game消费；没有 successor Restore/再次 controlled re-admission 覆盖，不将此配对叫 restoration 或在线现场根因验证。

fixture 原有 test-only `PrepareRefusalProbe` 在 Game失败后再调用一次公开 Prepare。必须全版本保留原字节；仅要求新增生产诊断 query 数0，不能说整个测试没有额外查询。

每个 baseline、diagnostic-off、diagnostic-on 的独立进程，必须在启动之前设置独立 NEW `BOMBER_OFFLINE_DEATH_EVIDENCE` 目录；否则 WriteEvidence 会行政失败。flag 分别 unset/off 和 `1`，因为 private type 只在首次加载时读环境。原 `EngineRelease.FindRepoRoot` 从 apphost/bin 祖先找 `LumioBomber.slnx`；执行输出必须在各自 `game-input` 下，不能放到该祖先链以外再使用原测试。正常内容/Fixtures/Server assets 一并保留。

`EngineRelease.UseReleaseNative` ModuleInitializer 会将 Native 路径置为各自执行 bin 的 `runtimes/win-x64/native` 包输出；外部 shell 的 Native env 不能代替此身份检查。实际输出 Native/sidecar 必须绑定正式14 `e15c2b124d339a000b5348d47cdf4ef7571e55ff8447637386795e0cf0034c89`，正式14 manifest `65bcedda784e3a99ac5f0ff55d9f1fb20bfeaef14313f28001b25e741270a9c9`，整图正常 SDK闭包，不换旧DLL。

按正式14的未改 Runtime520规则，预期 connected 案 PASS，offline 案先 `binding_not_found`、原 Expire 后下一 Tick 保留 full old-body guard FAIL：两案1PASS/1FAIL/0skip。此为新资格的预期，尚未实际重跑正式14，不能将旧正式12 raw 或私有 SDK2 的2PASS移植为新结果。旧正式12原 dotnet rawExit2（outer wrapper1）的行政口径差异已保留，不再硬钉 wrapper 到同一数字。

配对新 raw 必须核每案 outcome、实际 death fullID/generation、health/pending/expiry，而不是独立随机 WorldIncarnation/token 逐字相等。Off零诊断行、On真实非 null error 行，原错误与 return unchanged。启用 HashSet 的去重/16界另以私有源码/行政单元级验证证明，不靠只有一个错误的 fixture 假称容量全位。

## 消费边界

新的场景完整使用同一已审输入/官方14复制/正常 signed Platform两玩家六Bots，原 DS18316 与 A73/B74、旧17/14现场及其他服务只读保护。计划所列新18089/18317/18104必须先核实际未占；诊断只在新 Scene显式开启。正式验收依然要求去掉私有 probe 的生产输出、双向移动/炸弹与十次真实关闭重入。

本审查未构建、运行测试、启动服务或操作浏览器，未写任何 production/source/pins/DRAFT。Root source 与实际消费者输出准备后还需分别独立审查；本裁决不能代替它们。
