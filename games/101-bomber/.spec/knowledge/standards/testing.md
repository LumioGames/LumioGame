---
name: testing
description: 测试与验收——101 发布物构建、真实 Native 测试、八 Bot 与完整局证据；验证改动时查
metadata:
  type: doc
  status: 已交付
---

# 101 测试与验收

测试工程消费本工作区的只读 Engine/ 发布物，不引用同级 Runtime 源码或引擎 tests/fixtures。玩法测试源码在 Server/Tests/Gameplay/，Host 测试源码在 Server/Tests/Host/，工程在 Tools/；客户端和旁观测试在 Client/Tests/、Client/UI/Spectator/。

## 本地入口

在 games/101-bomber/ 执行：

```text
dotnet build LumioBomber.slnx
dotnet test LumioBomber.slnx -- --minimum-expected-tests 1
node --test Tools/*.test.mjs
node eng/spec-lint.mjs
```

测试计数必须大于零，报告实际通过、失败、跳过数。Server/Tests/EngineRelease.cs 为真 Native 测试绑定发布物；缺失即失败，不能换成托管模拟。DS 玩法输出中的 Lumio.GameRuntime.Simulation.dll 必须包含 DedicatedServerHostBinding，不得把浏览器 netstandard2.1 产物拷进 DS 目录。

浏览器复制侧另编译 `dotnet build Gameplay/Lumio.Bomber.Gameplay.csproj -c Release -p:LumioEcsSide=client -p:LumioBrowserReplica=true`。具体旁观页启动和测试入口以 Client/UI/Spectator/README.md 为准。

Node 工具测试验证参数、证据解析、配置与底图，不执行或模拟正式游戏规则。新增规则测试通过真实 WorldManager.Tick() 驱动；不能手调提交相或以调用次数代替规则结果。小型声明、文档或删除改动使用既有相关验证，不为凑数量新增测试。

## 真实集成与证据

正式整局入口为 `node Tools/launcher.mjs --bots 8 --seed <n> --scenario-dll <Lumio.Bomber.Bots.dll>`。Platform 实际签票，真实 DS Restore 生产底图，八个独立客户端只读复制并提交 Ability 输入。证据来自实际 DS 日志和 Bot 的 result.ndjson；缺环境报 BLOCKED_ENV / exit 2，缺失、空、截断或冲突证据不能通过。

准入只证明进房与所声明的准入断言。完整局还须覆盖十四步、结算与自动下一局；同种子同输入逐 Tick StateHash 一致、八 Bot 30 分钟、技能开关、规则矩阵、指标和真实浏览器旁观均须独立证据。本轮不含100人压测与存档重启。

四轮顺序与门槛以父仓[开工提示词](../../../../../.spec/plans/2026-09-27-101-bomber-engine-build-prompt.md)为准：前三轮不看不等 CI；第一轮例外要求本地编译和真实八 Bot 准入。第四轮在合入后的 main 完成本地全部门，再触发 CI。当前断点见[执行账本](../../plans/2026-09-27-engine-build-progress.md)，不得将已知红门写成通过。
