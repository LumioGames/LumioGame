---
name: chat-component
description: ChatComponent 唯一真源在 Runtime Username.Server——查 Game 无第二份类、SendMessage 与 persist last-message
metadata:
  type: doc
  status: 已交付
---

# ChatComponent

简介：PlayerEntity/BotEntity 上的权威 last-message 组件。唯一 `[EcsComponent]` 源是 Runtime `Lumio.GameRuntime.Samples.Username.Server`。Game 不声明第二份 ChatComponent。

## 背景 / 目标

- 消费冻结契约 `lumio.gameplay-envelope.v1`（`chat.input` / `chat.event` / `chat.component`）。
- 不拥有传输、账号服务、聊天历史或独立持久化。

## 设计

- **真源**：Runtime `Components/Chat/ChatComponent*.cs`。`[ServerRpc] SendMessage` 处理体在 `.Server.cs`；Game `ChatSetMessageSystem` 只 Admit 信封到 `WorldManager.Enqueue` 或在 Owner Thread 调 `SendMessage`。
- **入口**：服务器玩法从 `ServerBootstrap.Boot(instanceId)` 建 World Manager（R-00385）。
- **输入**：`ChatInput` 只有 `text`。发送者由宿主会话注入为 128 位 `NetEntityId`（instanceId + counter，32-hex），客户端不能自选。
- **状态**：`LastMessageText` + `LastMessageTick`（契约字段 `lastMessageText` / `lastMessageTick`），服务器私有、`[Persist]`、不同步。
- **事件**：`OnChatMessage` ClientRpc；`chat.event` sender 编码为 `senderNetEntityIdInstanceId` + `senderNetEntityIdCounter`（u64 LE ×2）。世界不保留历史列表。
- **有界输入**：C-1 `chat.input` UTF-8 512 字节在 Game Admit 层 `reject`（`chat_text_too_long`）；Runtime 另按拼好的「名字: 内容」行卡 512。

## 待解决

- 101-entity SUCCESS 路径是 sibling `lumio-entity-chat-replay` 上日志入库后 `verify-evidence.mjs --dir` exit 0；`GameRoomHost` 与 `lumio-mvp-host` 不是 SUCCESS 路径。见 [`entity-chat-harness.md`](./entity-chat-harness.md)。

## 相关

- 代码：`modules/server-gameplay/`（引用 Runtime Username.Server）
- 契约：架构源 `engine/wire/gameplay-command-envelope-v1.json`
- 测试：`modules/server-gameplay/tests/Lumio.Game.ServerGameplay.Tests/`
