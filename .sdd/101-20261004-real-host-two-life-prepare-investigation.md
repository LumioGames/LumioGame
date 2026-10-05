# 观察重连后下一次死亡：真实 Host/Native 实施结果

判定：**REAL_FLOW_GREEN / NO_BEHAVIOR_RED / NO_PRODUCTION_FIX**。该实际流程未复现旧 live11 A life202/gen13 的 Prepare 停滞，不支持修改 Runtime 或 Server 所有权 guard。源码所有者隔离树为 C:\Work\LumioGames\.101-pack07\LumioServerTwoLifeReentry，branch codex/101-two-life-observer-reentry，基线正式 Server008861。没有改变 Game、官方包、现场、pins、生产预算或协议。

新增测试 C:\Work\LumioGames\.101-pack07\LumioServerTwoLifeReentry/Tests/tests/two_life_observer_reentry_real_clr.rs；仅在该新树 SuccessorScenario.cs 加独立测试mode、命令等待点和有界诊断；真实关系始终来自官方成对准入、Runtime Prepare/Create/Restore/Ready/Applied/Consume。没有预填binding、owner/history、fake witness或影子World。正式11 SDK0.0.5-main.523c3d3，manifest f058833a218241c49b5f35078fd839dbc130ef5d3bcf5b57dbbaf3419e241867；Native ac8afd5bf861d6818468434c51c22e94ef78863962d2a47e975046cb943767ff；HostEntry/Runtime/Native全图从完整11 consumer-freeze-01读取，新strictlock/缓存/fixture输出。Cargo Native sibling81b2501，Engine523c。

实际执行：

- two-life-baseline-02：raw0，1PASS/0ignored；Prepare 2次全部null；真实消费Applied 2次，末lifeGeneration3，world tick185。原始绝对目录 C:\Work\LumioGames\.101-pack07\LumioServerTwoLifeReentry\.run\two-life-reentry-01\two-life-baseline-02。Original structural-death chain; not a settled lethal-effect claim
- before-create-native-baseline-01：raw0，1PASS/0ignored；Prepare 2次全部null；真实消费Applied 2次，末lifeGeneration3，world tick188。原始绝对目录 C:\Work\LumioGames\.101-pack07\LumioServerTwoLifeReentry\.run\two-life-reentry-02\before-create-native-baseline-01。Actual lethal GAS settlement before each next Prepare; official Native/CLR signed Host chain
- thirteen-life-native-baseline-01：raw0，1PASS/0ignored；Prepare 13次全部null；真实消费Applied 13次，末lifeGeneration14，world tick1045。原始绝对目录 C:\Work\LumioGames\.101-pack07\LumioServerTwoLifeReentry\.run\two-life-reentry-03\thirteen-life-native-baseline-01。Actual lethal GAS settlement before each next Prepare; official Native/CLR signed Host chain

最早拒码：**没有拒绝，所有已执行 Prepare 返回 null**。第二案的观察者确实在 Created=null/oldLifeDestroyed 后关闭1001，再以新签名同account/room恢复观察基线；后续实际恢复效果生成witness，Host转为controlled新life。第二次及十三轮每次都先使用真实 EliminateLifeEffect，并在下拍 Prepare 记录oldHealth0。首案为之前的结构性Destroy链，单列保留，不冒充致死效果结算。十三案是13次死亡/转移，最终到生命代14，含第一次观察close/reattach。它覆盖consumed successor重复Prepare，仍没有覆盖八人world、跨match、真实Client授权消费或旧现场同一内存route。

每案独立fixtureDLL PortablePDB的Scenario校验和等于该案inputs记录源hash，CodeView匹配；实际Native/HostEntry/Ecs/Replication/hostfxr与输入hash一致。原生产3源仍a936/a4b6/7ad7。共享publication debt由原harness shutdown断言0，所有Host帧从真实认证socket采集。parts/receipts沿用此前审核的64frame/8MiB显式harness限额，没有改变生产默认或用它替代真实八人验收。

首compile01 raw101来自新文件复制了4个不使用的测试helper触dead_code；已保留原源/日志/exit。删除这4个闲置helper之后实际执行通过；该compile拒绝不是语义RED。各阶段新DLL/锁/缓存和旧raw均保留，17个generated CRLF副作用未restore/stage。没有生产fix、commit、包消费更新或浏览器操作。

已只读核新诊断局DS冻结前缀：23:15:16.509–16.600多个slot为eligibility revision2；23:15:26.152578出现slot5 revision1，其后若干peer1008。这可能只是正常新reservation revision1，日志不含授权payload，不能判断Host授权序列或认定Client根因；已交Perf只读联查，不把slot或session attempt generation当attachment实体证明。

本报告列示实际通过与未复现，不改变旧现场问题仍未解决的判定。当前可继续针对新的bad_envelope或八人跨match事实构造真实失败，而不能为制造RED放宽/增设虚构行为。
