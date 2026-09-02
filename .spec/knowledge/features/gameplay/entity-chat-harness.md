---
name: entity-chat-harness
description: 101-entity C# MVP acceptance harness——查 mvp-host/rust 11 场景活 traces、nent census 与 Bot 启动
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

- **Gameplay 宿主**：sibling `lumio-mvp-host` 或 `lumio-entity-chat-replay`（同一 11 场景套件）。`GameRoomHost` 只作单元测试 double，不是 SUCCESS 路径。单元 double 只接受 C-3 已验证准入载荷，从不收用户名/口令；其 Chat 上行必须是冻结 `InputCommand`（`mappingId=chat.input` + LumioBinV1 `payload` + `payloadSha256`），解码后再交给 text-only `ChatInput`。
- **Bot 启动器**：`Lumio.Game.EntityChat.Suite` 可对 Account Server 发 `123456` 测试口令与工具凭证；启动器主路径先对 mvp-host 做 101 路活升级，再经 loopback `test-control` 跑 S4–S11。
- **证据**：census 必须来自 bindings + 17-key host-audit 的 `netEntityId`（`nent_*`）；Browser 必须有 Playwright 实跑且 `injected:false`；无历史快照必须有可含历史的材料。
- **BLOCKED**：容量 503 / Admission 未入 FullGraph / origin/main dll 缺失时写 `blocked.json`（`FullGraphComposition.cs` MaxConnections/MaxSessions + 实测错误），退出码 1，不回退 r-00344，不伪造 SUCCESS。
- **census**：必须来自 `GET /test-control/bindings` 与 17-key audit 的 `nent_*`，不是 `hs.sessionId`、不是 login `accountId`、不是 launcher 循环下标 `"1"`..`"101"`。不得要求发明 `entity_admitted`，也不得接受无列表的 `{total:101}`。
- **S8 reconnect**：重连重绑 Entity A 当且仅当两侧都有宿主 `NetEntityId`（`nent_*` / `nent-*`）且相等。`sessionId` 相等不是 rebind；Account-Server login `accountId` 单独也不是（那是 S9 Entity B）。不得把 `sessionId` 写成 `netEntityId`，也不得把 login `accountId` 塞进 host binding。诚实 `ok: false` 不得标 SUCCESS。Handshake 缺 session / SessionMismatch 时重试一次。
- **S5–S11**：必须在 mvp-host test-control（bindings/query/chat/tick/expire/snapshot/restore/room-admit）或 rust replay 上留下独立 traces，且 1–11 全部 `ok: true`。sibling-gap / S8 nent-gap 的 `ok: false` 使证据包 FAIL。S5 `ok: true` 且带 unauthorized/invisible/stale 真查询 traces 不是 GameRoomHost suite-double。S6 `timerManagerInvoked` 仅当 tick 走宿主 timer / `POST /test-control/tick`，禁止 for-loop。

## 待解决

- FullGraph `MaxConnections = 128` / `MaxSessions = 128` 可承载 101 路活连接（Server origin/main / `LUMIO_SERVER_ROOT`）。
- Playwright Chromium 缺失时 Browser 场景必须失败，不得注入事件后标 ok。

## 相关

- 代码：`modules/server-gameplay/src/Lumio.Game.EntityChat.Suite/`、`integration/entity-chat/`
- 组件：[`chat-component.md`](./chat-component.md)
