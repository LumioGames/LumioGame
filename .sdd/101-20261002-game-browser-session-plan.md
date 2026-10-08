# 101 正式浏览器 Session 接线计划

2026-10-02；Client composition 所有。父任务已明确授予 `SpectatorReplicaHost.cs`、`host/Program.cs`、`host/Lumio.Bomber.Client.Spectator.csproj` 和 `main.js` 中启动/连接/输入/体素读取区；现有表现、HUD、材质、相机和渲染逻辑保留。原始4文件与SHA记录于 `games/101-bomber/.run/20261002-client-session-integration/before/`。

1. 对现有旧宿主写真实会话入口回归：收到未完成权威组时不能发布，未经认证的Welcome不能打开输入，输入由Session发送，close/new admission可释放并重建。测试消费候选完整SDK/发布物，禁止引用上游源码；已通过的输入业务断言迁移到新真实会话夹具。
2. 浏览器加载正式 full Engine WASM，唯一 `LumioEngine` 使用显式预算启动；Bomber Registry/Config 经 `CreateWorld` 和标准Replica子系统创建每个Manager。普通ClientSession持有认证BrowserWebSocket连接、复制authority ledger、真实GAS joint prediction与唯一体素world。
3. 保留Game生成Ability输入，仅发布到Session拥有的outbound队列；主循环用owner Tick推进Session，不在JS解码/重组/提交权威。Platform launch/renewal是正常endpoint provider，每代凭据、房间、profile固定验证。
4. 将游戏视图surface查询接到同一个Rust世界的只读结果，不保留旧JS独立Voxel world。旧blocks工具视图对raw mesher ABI的依赖先核实上游可用性，不能用第二状态真值或删功能解围。
5. 通过正式release selection props回接候选发布闭包；执行受影响C#/JS、浏览器真实Platform/DS整链、控制台/网络/截图，以及父任务要求的完整回归。任何上游缺口在归属仓修复、重新发布后验证。

当前Client候选冻结 `95a4545041277fbdf0ccf100c96f65b1b9ea5593`，完整1233+66通过，等待父任务独审及组合新Runtime/Server正式发布；Game生产入口尚未改动。Voxel-only既有release导出正在独立owning树恢复，不在Game装单独二进制。
