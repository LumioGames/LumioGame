---
name: entity-chat-harness
description: 101-entity C# MVP acceptance harness——查 mvp-host 101 活连接、BLOCKED 证据与 Bot 启动
metadata:
  type: doc
  status: 已交付
---

# Entity-chat 101-entity harness

简介：LumioGame 集成验收面。Bot 启动器循环 `Bot01`–`Bot100`，经独立 Account Server login-or-register 进入同一 Room，加上一个 Browser PlayerEntity，构成 101 个 Game ECS Entity。

## 背景 / 目标

- 消费冻结契约 C-1/C-2/C-3/C-4，不扩展 hello-wire-v1，不改归档 Hello 对象。
- 证明账号、绑定、查询、ChatComponent、重连/过期、隔离与 last-message 快照，并跑两轮对比。

## 设计

- **Gameplay 宿主**：sibling `lumio-mvp-host`（LumioServer origin/main）。`GameRoomHost` 只作单元测试 double，不是 SUCCESS 路径。单元 double 只接受 C-3 已验证准入载荷，从不收用户名/口令；其 Chat 上行必须是冻结 `InputCommand`（`mappingId=chat.input` + LumioBinV1 `payload` + `payloadSha256`），解码后再交给 text-only `ChatInput`。
- **Bot 启动器**：`Lumio.Game.EntityChat.Suite` 可对 Account Server 发 `123456` 测试口令与工具凭证；启动器主路径先对 mvp-host 做 101 路活升级。
- **证据**：census 必须来自 mvp-host 进程 audit；Browser 必须有 Playwright 实跑；无历史快照必须有可含历史的材料。
- **BLOCKED**：容量 503 / Admission 未入 FullGraph / origin/main dll 缺失时写 `blocked.json`（`FullGraphComposition.cs` MaxConnections/MaxSessions + 实测错误），退出码 1，不回退 r-00344，不伪造 SUCCESS。
- **census**：必须来自 Handshake/Admit 绑定（host-audit 非空 `sessionId` / admit·bind effect，或 admit-trace binding ids）。HTTP 101 的 launcher 循环下标 `"1"`..`"101"` 不是 NetEntityId。不得要求发明 `entity_admitted`，也不得接受无列表的 `{total:101}`。
- **ChatComponent / C-2 缺口**：Attribute Query、Chat persist、expiry、isolation、event-order 在 mvp-host `ReferenceWorldSimulation` 上不可执行时，S5/S7/S9/S10/S11 必须 `ok: false` + `blockedReason`（与 S6 Timer 相同诚实口径）；不得把 `GameRoomHost` 自评分写成 SUCCESS。

## 待解决

- FullGraph `MaxConnections = 128` / `MaxSessions = 128` 可承载 101 路活连接（Server origin/main / `LUMIO_SERVER_ROOT`）。
- Client Timer Manager 未接到本启动器时，chat 只能记 tick-batched，不得把 cadence 标 ok。
- Playwright Chromium 缺失时 Browser 场景必须失败，不得注入事件后标 ok。

## 相关

- 代码：`modules/server-gameplay/src/Lumio.Game.EntityChat.Suite/`、`integration/entity-chat/`
- 组件：[`chat-component.md`](./chat-component.md)
