# 浏览器选定配置接线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 正式浏览器在选角和准入前读取本次 launcher 选定的客户端配置，与 DS 配对导出保持同源。

**Architecture:** Game 局部 HTTP host 固定读取选定 C export 的原始字节，提供仅客户端文件的不可变启动包。C# 经既有 IConfigArtifactBytes / LumioConfigLoader 验证并生成一个 ConfigSnapshot；选角、显示、每个新 replica world 都消费该 snapshot。入口在取得真实 launch 前完成配置加载，失败、取消不连接。

**Tech Stack:** Node HTTP、浏览器 JavaScript、C# net10/browser、正式 Lumio.Engine.SDK 06。

## Global Constraints

- 不修改 Engine 公共语义、不引入配置影子规则或手改生成物。
- 保留完整 ClientSession、owner 授权、首次选角和 Warmup 规则。
- 真实服务显式接收 launcher 的 configSelection.clientDirectory；不向浏览器提供 server export。
- 保留现有未提交成果；launcher 由 root 应用所提供的最小 patch。
- 当前四个 agent 槽已占满；本子代理执行实现，root 独立审查，不能把静态/fixture 验证称整局验收。

## Task 1: 固定客户端原始配置文件服务

Files: Tools/client-config-host.mjs（新增）、Tools/player-host.mjs/.test.mjs；launcher 接缝由 root 合入。
Interface: createClientConfigResponse(configDir) 返回处理 /api/game/config 的函数；configDir 是实际 C export 根目录。

- [ ] 写实际 HTTP 选定目录、原 bytes、server 文件不外露、启动后文件变更不改变本次配置、缺失目录失败测试并保存 RED。
- [ ] 最小实现固定原始文件 bundle；Node 测试 GREEN；给 root spectator/launcher 调用 patch。

## Task 2: 一个已验证 snapshot 贯穿客户端生命周期

Files: Client/UI/Spectator/BomberClientConfig.cs（新增）、SpectatorDump.cs、PresentationDump.cs、SpectatorReplicaHost.cs、host/Program.cs、两个 csproj、tests。
Interfaces: BomberClientConfig.Load(IConfigArtifactBytes)、FromBundle(string)、CreateWorldBinding()、Display；Configure JS export 必须先于 Boot/SelectionConfig。

- [ ] 写实际正式 export 的配置差异/校验失败/两个真实 Native world 同 snapshot 的 RED。
- [ ] 经正式 loader 一次验证和绑定；embedded 仅保留既有独立测试默认入口。
- [ ] 正式 SDK 06 私有缓存、锁与 artifacts 编译，实际 Native 回归；不混 05 同版本旧包。

## Task 3: 选角前加载、失败与取消

Files: main.js/main.test.mjs、host publish。
- [ ] RED 证明配置完成前没有选角或 launch；配置失败零准入；取消不会迟到 Configure；重试成功后复用同配置。
- [ ] 实现并跑 Node/UI/C# 回归，正式 host publish。
- [ ] 真实浏览器用 launcher 选定 export 检查配置、选角、真实 world 表现一致；冻结文件 SHA 与证据交 root 独审。
