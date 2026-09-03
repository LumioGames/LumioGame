---
name: entity-chat-harness
description: 101-entity rust-host acceptance harness——查 lumio-entity-chat-replay 11 场景、客户端 chat.event 与落盘
metadata:
  type: doc
  status: 已交付
---

# Entity-chat 101-entity harness

简介：LumioGame 集成验收面。Bot01–Bot100 加 Browser PlayerEntity 共 101 个实体，在 `lumio-entity-chat-replay` 上跑 11 场景；证据来自客户端收到的 `chat.event` 与落盘快照。

## 背景 / 目标

- 消费冻结契约 C-1/C-2/C-3/C-4，不扩展 hello-wire-v1，不改归档 Hello 对象。
- 证明账号、绑定、查询、ChatComponent、重连/过期、隔离与 last-message 快照，并跑两轮、两包对比。

## 设计

- **Gameplay 宿主**：只能是 sibling `lumio-entity-chat-replay`。`GameRoomHost` 与 `lumio-mvp-host` 都不是 SUCCESS 路径。
- **浏览器**：Playwright 页面必须接 Room 网线；`__lumioChat.window.lines` 由收到的 `chat.event` 填充。`receivedFromNetwork` 表示至少收到一条 `chat.event`，不是账号服登录成功。
- **证据**：`eventOrder` / `appliedTicks` 来自 Node 客户端与 Playwright 实际收到的 `chat.event`；`restoredWindow` / `windowBeforeSnapshot` 是实测窗口长度。禁止由发送计数或字面量合成。`verify-evidence.mjs` 自身 sha256 写入 `evidence.oracleSha256`。
- **S6**：Client Timer Manager 触发，`tickSource` 必须为 `native-kernel/tickFrame`，Client trace 含 Tick 5,10,15；窗口 101 条且 `roomSequence` 严格递增。
- **S7**：宿主进程 A 落盘 → 进程 B 读回；`lastMessageText` 逐实体相等；`historyCount` 0；聊天窗不回填。
- **S8**：旧连接先收到 `ConnectionSuperseded`，再重绑同一 Runtime `NetEntityId`。
- **BLOCKED**：缺 `lumio-entity-chat-replay` / Account Server / Playwright / NativeCore 时写 `blocked.json`，退出码 1，不得把 not-ok 标 SUCCESS。

## 待解决

- Playwright Chromium 缺失时 Browser 场景必须失败，不得注入事件后标 ok。
- 客户端 Timer Manager 与跨进程快照读回依赖 sibling Client/Runtime/Server 产物；缺失时 BLOCKED。

## 相关

- 代码：`integration/entity-chat/`
- 组件：[`chat-component.md`](./chat-component.md)
