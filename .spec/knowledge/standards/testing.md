---
name: testing
description: 测试与验收——测试分层政策、TDD 时机、验收 DoD 与验证证据;实现功能/修 bug 时查
metadata:
  type: doc
  status: 已交付
---

# 测试与验收（含 TDD 政策）

> 本文定**政策**（测什么、何时测、怎么算过）；“先写失败测试再实现”的**方法**在技能 [`skills/test-driven-development`](../../skills/test-driven-development/SKILL.md)。

## 测试分层（通用政策）

- **单元测试**：默认层，随项目验证命令（`AGENTS.md`「收口门槛」）每次跑，快、无外部依赖。
- **集成测试**（真库 / 真服务）：显式触发，不进默认验证命令，保持收口快。
- **端到端 / E2E**：显式触发；关键主链路至少一条。

## 何时走 TDD

- 必须走：新功能、修 bug（先写能复现的失败测试，修完留作回归测试）、改无测试保护的关键逻辑。
- 可不走：纯文档改动、一次性脚本。豁免在交回物里声明。
- 写测试、加 mock、想给生产类加 test-only 方法前，先查反模式清单：[`testing-anti-patterns.md`](../../skills/test-driven-development/testing-anti-patterns.md)——测 mock 行为、test-only 方法入生产、不理解依赖就 mock、不完整 mock，一律禁止。

## 验证证据

形式要求以 `AGENTS.md`「交回物格式」为单一权威——「已通过」三个字不是证据。

## 验收标准（Definition of Done）

- [ ] 收口门槛命令全绿（见 `AGENTS.md`「收口门槛」：spec-lint 与 Server Gameplay 单元测试）。
- [ ] 新增 / 修改行为有测试覆盖；bug 修复留有回归测试。
- [ ] 无 lint / 类型错误、无调试残留。
- [ ] 相关知识文档已更新（见 [`workflow.md`](./workflow.md)）。

## 项目测试栈与命令

默认验证为 spec-lint 加上 Server Gameplay 单元测试：

```text
node .spec/tools/spec-lint.mjs
node --test .spec/tools/spec-lint.test.mjs
dotnet build modules/server-gameplay/src/Lumio.Game.ServerGameplay/Lumio.Game.ServerGameplay.csproj --nologo
dotnet test --project modules/server-gameplay/tests/Lumio.Game.ServerGameplay.Tests/Lumio.Game.ServerGameplay.Tests.csproj --nologo
```

测试栈：xunit.v3 4.0.0 + Microsoft.Testing.Platform 2.3.3（`global.json` `test.runner` = MTP）。生产程序集双 TFM `net10.0;netstandard2.1`，测试单 TFM `net10.0`。xUnit v3 要求 apphost；user-local SDK（无 HKLM `InstallLocation`）下 `dotnet test --project` 可能以退出码 5 跑 0 个测试。此时把 `DOTNET_ROOT` 设为 `dotnet.exe` 所在目录，或对已构建 dll 使用 `dotnet exec`。不得把「运行了零个测试」当成通过。

101-entity 端到端（显式触发，不进默认收口）：

```text
node --test integration/entity-chat/verify-evidence.mjs
node integration/entity-chat/launcher.mjs --out <evidenceDir>
```

两轮对比实体数 / event order / applied Tick。SUCCESS 仅当 sibling `lumio-mvp-host` 实际准入 101 路活连接（HTTP 101 之后完成 `lumio.mvp.v0` Handshake，host-audit 有非空 sessionId / admit effect）且两轮场景证据一致。容量 503、Admission 未入 FullGraph、origin/main Account Server / mvp-host 产物缺失必须记 BLOCKED（`blocked.json` + 文件:行 + 实测错误），不得回退 r-00344，不得用 `GameRoomHost` 伪造 SUCCESS。ChatComponent/C-2 缺口场景必须 `ok: false` + `blockedReason`。FullGraph 生产常量是 `MaxConnections = 128` / `MaxSessions = 128`。

公共契约变更必须在架构源 `LumioGameEngineArchitecture` 通过其契约闸门（见 `AGENTS.md`「收口门槛」）；本仓只消费冻结 JSON，不另写协议。Scenario/Headless 与 formatter 命令随后续模块补进收口门槛。

## 本仓 Headless / 契约测试面

- Component/Mapping/权限、GAS Content、Scenario 初始状态和业务断言。
- PlaceVoxel 的成功、资源不足、Chunk 未加载、Revision 冲突、重复命令、断线重连和预测回滚。
- Fake/Reference Voxel 与 Native Differential、Replay 首差异、Save/Load/Migration Golden。
- Config Schema/优先级/快照、Content Hash、ReleaseManifest/Catalog 和握手拒绝。
- 日志/审计关联、Failure Bundle、100 Bot Workload、Tick/事务/复制/内存指标。
- 新增或修改公共 Schema 时，在架构源同时提交至少一份正向 Fixture 和一份失败 Fixture；保存或迁移变更必须覆盖旧版本、失败保留和可回放证据。
