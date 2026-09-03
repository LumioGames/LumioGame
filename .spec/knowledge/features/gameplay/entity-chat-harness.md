---
name: entity-chat-harness
description: 101-entity 验收 oracle——查日志目录、compareRuns 逐位比较与 --dir 行尾归一化
metadata:
  type: doc
  status: 已交付
---

# Entity-chat 101-entity harness

简介：LumioGame 集成验收面。Bot01–Bot100 加 Browser PlayerEntity 共 101 个实体。证据 = 服务器日志 + 客户端日志；`verify-evidence.mjs` 是唯一尺子。

## 背景 / 目标

- 消费冻结契约 C-1′/C-2′/C-3/C-4，不扩展 hello-wire-v1。
- 证明账号、绑定、查询、ChatComponent、重连/过期、隔离与 last-message 快照，并跑两轮逐位对比。

## 设计

- **Gameplay 宿主**：只能是 sibling `lumio-entity-chat-replay`。`GameRoomHost` 与 `lumio-mvp-host` 都不是 SUCCESS 路径。
- **证据**：只读 `round-N/server` 与 `round-N/client` 日志。禁止读 harness `evidence.json` / `timer-trace.json`。`oracleSha256()` 先把 `\r\n` 归一为 `\n`。
- **compareRuns**：`eventOrder` 四元组 `(messageId, roomSequence, senderNetEntityId, appliedTick)` 与 `appliedTicks` 逐值逐位相等。无多重集、无只比长度。
- **sender**：32-hex 或 `senderNetEntityIdInstanceId` + `senderNetEntityIdCounter` 两段 u64。不用 `type: u128`。
- **窗口**：101 条来自客户端日志 `chat.window`（或收到的 `chat.event`），`roomSequence` 严格递增。
- **目录**：收口入库 `integration/entity-chat/logs/<YYYY-MM-DD>-<arch>-<runtime>-<server>-<client>-<game>-<nativecore>/`。单测 fixture 在 `integration/entity-chat/fixtures/`，不是收口目录。
- **S10**：按 ADR-058 §11 记 `deferred`，不伪造 pass。

## 待解决

- R-00388 / R-00389 日志字段名对齐后，以交回物「五」的待对齐项收口。
- Playwright Chromium 缺失时 Browser 场景必须失败，不得注入事件后标 ok。

## 相关

- 代码：`integration/entity-chat/`
- 组件：[`chat-component.md`](./chat-component.md)
