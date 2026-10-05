# live11 paired checkpoint15：真实Native结算延续RED

**QUALIFIED_REAL_NATIVE_RESULT_RED_ONLY。** 正式同cut8999配对恢复成功，17次真实Tick正常推进到World9016；随后ProcessorPlan在原BomberResults.ValidateMatch:235抛出与现场相同的结果校验异常。MTP原始退出2，1项失败、0通过、0跳过。本报告不宣称修复、重连根因或浏览器体验通过。

## 精确输入

唯一新增测试源位于父仓 `.run/browser-result-fault-independent-investigation-01/native-paired-01/Live11PairedDeadlineContinuationTests.cs`，SHA256 `47a632fe3b2f8c99943733127d66629aab58c25462e2df0ea9b06b07db0f0cd9`。没有改共享原测试、负控、Gameplay、reducer、validator、pins或服务。

Game编译输入2063文件独立复制；input-source-manifest SHA `06dd408d3cce03e13c714131b945c9979b5f9bf8b1666abff0b753d1ef122b2d`。唯一选择边界是Lifecycle采用原冻结 `97f275969a8a8826a13007c1b315b5e7a258821853e6329013fc7b66dbc2f0de`，没有混用Root新1542b默认关闭诊断。最终封存再次核2063输入，**物理hash漂移0**，包括私有生成物；官方SDK生成只在私有copy运行，不改共享generated。

完整11旧原包在故障时生成了额外hostentry_fault.log，严格selector会拒绝；未删除/移动该现场文件或绕严格selector。实际消费Root的新完整305 payload consumer-freeze：

`games/101-bomber/.run/20261004-browser-experience/complete-release-11-consumer-freeze-01`。

manifest仍 `f058833a218241c49b5f35078fd839dbc130ef5d3bcf5b57dbbaf3419e241867`，版本0.0.5-main.523c3d3；strict official selector实际0。privateNuGet feed只从此完整包获取Lumio.Engine.SDK，新的cache与两个锁文件；第二构建采用RestoreLockedMode=true。

真实加载SDK输出Native `ac8afd5bf861d6818468434c51c22e94ef78863962d2a47e975046cb943767ff`，由原EngineRelease模块初始化统一绑定。没有换单个旧DLL。使用原Native fixture的KernelConfigurationFixture与正式World默认预算，未修改生产限额或校验。

private编译0、0warning/error。Game/Test PortablePDB CodeView绑定核验通过，Lifecycle Document sourceSHA确实97f275，测试Document确实47a632；没有只凭文件名宣称编译选择。11项实际compiled身份记录在seal。

因existing EngineRelease依AppContext祖先找LumioBomber.slnx，私有artifacts位于game-input之外：给私有proof根补了solution marker及1555份Server配置/地图精确data副本，全部从已冻结game-input复制并独立manifest记录，没有复制二进制或改源。运行正式Map/Config读取这些相同字节。

## 正式API与正常段

测试读取现场配对 runtime.bin/voxel.bin 原字节并核外层hash。调用公开 `RuntimeCheckpointEnvelope.Decode(runtime, voxel, WorldIngressBudget.Default, out receipts, out tick)` 核同cut8999、非空回执与inner runtime hash；随后构造正式 `DualCutCheckpointPayload`，把**未修改的LRC runtime及opaque voxel**传给既有 `BomberTestWorld.RestorePaired`。

正式LumioEngine.CreateWorld内部再次decode LRC、恢复ECS+NativeVoxel+VoxelResultCheckpoint并启动真实Native World/HFSM/Tick。不是RuntimeOnly恢复、假引擎或手工生成BomberResultRow调用Validate。成功恢复后实际读到Instance1、8位participant、FinalCircle、phaseEnd9015、唯一AwaitingRespawn；Native空间索引正式绑定。正常8999→9016共18份只读观测，证明API/Native恢复成功后才遇到产品路径异常，而不是用初始化失败冒充RED。

## 实际截止头及八人字段

最后一份成功观测为World.Tick9016，实际match字段：MatchId1、Phase4、EndTick9015、PhaseEndTick9215、EndReason2（SimultaneousElimination）、Winner完整空ID、SurvivorCount0、OutcomePending=true、PublishedGeneration0。

实际八participant全部Eliminated，完整身份前缀`0000000000000001`：

| suffix | Current/Last Life suffix | LifeGeneration | 实际EliminatedTick |
|---|---|---:|---:|
| 0003 | 0222/0222 | 15 | 7077 |
| 0005 | 0225/0225 | 14 | 6940 |
| 0007 | 020d/020d | 13 | 6762 |
| 0009 | 0224/0224 | 13 | 7242 |
| 000b | 0218/0218 | 14 | 7242 |
| 000d | 0209/0209 | 13 | 6869 |
| 000f（A） | 空/0202 | 13 | 9015 |
| 0011（B） | 0203/0203 | 12 | 6808 |

这次实际观测没有任何liveplayer，publisher对应所有Survived=false，末批只有A一人。表是实际World的participant/currentlife字段；测试附加rowSurvived/rowEliminatedTick仅是原publisher读取这些字段的只读投影，**不是已发布结果行**。原Publish在Validate之后才写持久列，本次PublishedGeneration始终0。因此不能声称已捕获成功发布的8个ResultRow、排名或统计表。

下一 `manager.Tick()` 真正执行原BombSystem.Execute→EffectBusiness.Consume→PublishResults→BomberResults.Publish→ValidateMatch，出现 `Tick faulted at ProcessorPlan: Result winner or survivor count disagrees with rows.`。测试最后 `Assert.Null(failure)` 将此产品异常报告为1FAIL，不是直接Assert.Throws产生的伪通过。原堆栈/日志/退出/TRX全保留。

## 恢复边界必须保留

ObserverComponent明确不持久化，Host route与Runtime `_successors`也没有由这份paired cut恢复。8999恢复后的A Observer.ConnectionGeneration实际0；9000原PrepareDeath进入headless分支成功，A被真实销毁，CurrentLife空、DeathStructurePending=false、SuccessorPending=true。现场live11则A旧身体202一直存活、DeathStructurePending=true，准备被拒。

因此本测试**复现的是相同历史参与者/原deadline下的singleton cap非法结算，不是现场的controlled Prepare拒码或同一连接生命周期**。没有写Observer.Generation、补route、伪造reservation或还原旧连接来抹掉区别。实际9000差异和9016 final A字段完整写入seal manifest。若上游lifecycle修复后的真实八人局正常结束，不能据此自动宣称此配对恢复/结果语义缺口已闭合。

## 正负范围与后续GREEN标准

正向已实证：严格完整11选择、fresh官方SDK/Native、正式双cut关联与receipt解码、Native配对恢复、8位历史完整身份、17个正常Tick到截止转换。负向已实证：最后一批只有A、header声明Simultaneous，原严格Validator拒绝并使实际Tick失败。

根因资格止于结果生成/发布，不覆盖Host重新准入、旧route清理、Prepared/Ready转移、浏览器A/B输入或十次重开。单项恢复RED不是这些门的替代物。

相同测试source47a632的GREEN应保留原相序、9015 deadline、8位完整身份与七人的历史死亡Tick，并在真实Native推进期间没有产品Tick异常；9015对应结果应通过未放宽的ReadRetained/validator完整发布。不得改成跳过deadline、不运行Tick、吞掉异常或删除singleton/矛盾赢家原反例。

当前原合同不支持“0存活但唯一末死”作为合法Simultaneous结果，TimeLimit也要求至少2存活。本测试没有预先发明新的结束reason、让旧尸体Survived或重写历史淘汰时间。后续修法需明确合法Outcome生成/生命周期契约并经独审；若此冻结headless恢复场景在保持原契约下不能成立为完成对局，必须留下未闭合或明确正式拒绝边界，不能拿另一live GREEN冲掉本项RED。真实Prepare拒码及最终用户体验仍由独立真实诊断局与后续回归验证。

## 原始证据与行政失败

`native-paired-01/seal-01/manifest.json` SHA `0c0e671ff6f563201df659f894c9c571d56b52aa28714e0e9dcc3d7b1171bd2c`。38项原始文件有保留副本及hash，11项compiled身份，2063输入0漂移；封存自身输出没有纳入自引用inventory。

实际资格只认 `actual-03`：raw exit2，TRX1FAIL/0PASS/0skip；原log SHA `e5a9be7a52b99fe52032bbc67cfdfa752e2c2057d148d6a02c27e818e87d505c`；continuation SHA `913e2cbb89de0adf41460b9147226502702df4d00f1cc156bdd7d15ceb36b4e3`；raw result、日志和TRX互相关联。测试自有continuation文件在运行中逐步更新，终止后冻结副本为最终证据。

初始私有build1失败为移除MTP Main及新测试CA1869，保存原源码/targets/log，不是Game行为RED。actual01/02使用错误console参数、退出5、没有执行测试；第二次私有字符串替换还保留了错误参数。两次原帮助/退出/脚本保留，不归资格。actual03才用MTP公开filter/minimum/fail-skips/TRX参数实际运行；测试源码未因CLI纠正发生变化。没有压warning或放宽原门。
