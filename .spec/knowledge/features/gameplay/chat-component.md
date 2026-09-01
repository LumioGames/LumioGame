---
name: chat-component
description: ChatComponent 字段声明与 SetMessage——查 persist-only last-message、下一 Tick 提交与有界输入 reject
metadata:
  type: doc
  status: 已交付
---

# ChatComponent

简介：PlayerEntity/BotEntity 上的权威 last-message 组件。`SetMessage` 只在 Simulation Owner Thread 经命令/提交路径写入，并在同一 Tick 发出一条 `ChatMessageEvent`。

## 背景 / 目标

- 消费冻结契约 `lumio.gameplay-envelope.v1`（`chat.input` / `chat.event` / `chat.component`）。
- 不拥有传输、账号服务、聊天历史或独立持久化。

## 设计

- **输入**：`ChatInput` 只有 `text`。发送者由宿主从连接绑定注入为 `NetEntityId`，客户端不能自选。
- **提交**：`ChatRoomWorld.AdmitChatInput` 可从网络线程入队（不写组件）；`RunTick` 在 Owner Thread 推进固定 Tick 并调用 `SetMessage`。
- **状态**：`LastMessageText` + `LastMessageTick`（契约字段 `lastMessageText` / `lastMessageTick`）。维度 persist-only / replication none / server-only，不进客户端属性同步流。快照往返归 Runtime R-00353。
- **事件**：提交后发出 `ChatMessageEvent`（`messageId`、`roomSequence`、`senderNetEntityId`、`text`、`appliedTick`），与组件共用 applied Tick。世界不保留历史列表。
- **有界输入**：UTF-8 512 字节、每发送者每 Tick 1 条，政策 `reject`（`chat_text_too_long` / `chat_rate_exceeded`）。
- **Fail-stop**：网络线程直接 `SetMessage` 使世界 Faulted 且零写入；实体销毁后拒绝且不复活 NetEntityId。

## 待解决

- 接入 GameRuntime `EcsWorld` / Ingress 13 相（本切片用 Room 内权威宿主，不阻塞平行开发）。
- 101-entity SUCCESS 路径是 sibling `lumio-mvp-host` Handshake/Admit；`GameRoomHost` 只作单元 double。ChatComponent/C-2 未接入 mvp-host 时对应场景记 sibling-gap，见 [`entity-chat-harness.md`](./entity-chat-harness.md)。

## 相关

- 代码：`modules/server-gameplay/`
- 契约：架构源 `engine/wire/gameplay-command-envelope-v1.json`
- 测试：`modules/server-gameplay/tests/Lumio.Game.ServerGameplay.Tests/`
