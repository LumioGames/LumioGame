---
name: entity-chat-harness
description: 101-entity C# MVP acceptance harness——查 Bot01–Bot100 启动、Account Server 登录与两轮对比
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

- **Gameplay 宿主**：`GameRoomHost` 只接受 C-3 已验证准入载荷，从不收用户名/口令。
- **Bot 启动器**：`Lumio.Game.EntityChat.Suite` 持有 Bot 工具私钥，向 Account Server 提交 `123456` 测试口令与工具凭证。
- **证据**：每轮 `evidence.json` 含 11 个场景、census、eventOrder、appliedTick；`integration/entity-chat/launcher.mjs` 跑两轮并对比。
- **BLOCKED**：Account Server 进程起不来时写 blocked 日志，不伪造 101 实体。

## 待解决

- 运行中 `lumio-mvp-host` 仍未把 Admission 登记接到 `HostComposition`；本切片用 Game 仓 C# MVP Room 宿主承接联调。
- 真实 Chromium 聊天窗是证据回放面；权威实体与事件来自 Suite + Account Server。

## 相关

- 代码：`modules/server-gameplay/src/Lumio.Game.EntityChat.Suite/`、`integration/entity-chat/`
- 组件：[`chat-component.md`](./chat-component.md)
