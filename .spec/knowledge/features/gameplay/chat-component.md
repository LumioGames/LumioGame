---
name: chat-component
description: ChatComponent 与 IdentityComponent 归本仓——声明、声明生成、SendMessage 与 persist last-message、测试世界启动
metadata:
  type: doc
  status: 已交付
---

# ChatComponent

简介：`PlayerEntity` 上的权威 last-message 组件。聊天是玩法语义，`ChatComponent`、`IdentityComponent` 与 `PlayerEntity` 的唯一 `[EcsComponent]` / `[EntityType]` 源在本仓 `Lumio.Game.ServerGameplay`（架构仓 ADR-117 决策 4）。引擎测试夹具里的同名组件只服务引擎自己的测试，两份互不依赖；本仓不得编译期引用它。

## 背景 / 目标

- 消费公共契约 `lumio.gameplay-envelope.v1` 的 `chat.input`；`chat.event` / `chat.component` 已被架构仓 ADR-060 / R5-01 从信封删除，如今是本仓自有标识（见 ADR [0023](../../../decisions/0023-wire-contract-pinned-in-tests.md)）。
- 不拥有传输、账号服务、聊天历史或独立持久化。

## 设计

- **声明**：`Chat/ChatComponent.cs`（`[ServerRpc("chat.input")] SendMessage`、`[ClientRpc(Scope.Room)] OnChatMessage`）+ `Chat/ChatComponent.Server.cs`（last-message 字段与处理体）；`Identity/IdentityComponent.cs`（`Name`：房间公开、只由服务器写）+ `.Server.cs`（`AccountId`：服务器私有，线名 `accountId` 是 Runtime 准入绑定认账号组件的约定）；`EntityTypes/PlayerEntity.cs`（Observer + Identity + Chat，线名 `player` 落在 Runtime 准入闭集 player | bot 内）。
- **声明生成**：注册表、实体模板与同步表由 Runtime 的 `gen-declarations` 在构建时生成到 `generated/server/`（接线在仓根 `Directory.Build.targets`，照 LumioSample 的 sibling 接法），生成物入库、不手改。本程序集只有一份注册表：炸弹人 Stage 0 契约实体与聊天玩家同表，世界实体是 `BomberWorldEntity`。
- **写入口**：`ChatComponent.SendMessage` 是 last-message 的唯一写入口——取同实体 `IdentityComponent.Name` 拼「名字: 内容」，空文本或行超过 UTF-8 512 字节即拒绝（不写、不发事件）；`ChatSetMessageSystem` 只 Admit 信封到 `WorldManager.Enqueue` 或在 Owner Thread 调 `SendMessage`。
- **查询 / 过期**：Game 通过 `WorldManager.Enqueue` 提交 Runtime owner-thread controls，并从 `Drain` 的 `queries` 集合消费结果；不建立第二份绑定、查询、tombstone 或 expiry authority。
- **世界启动**：测试世界由测试工程的 `ServerWorldBoot` 按 Runtime 生产 API 启动——`WorldManager.Create` → `Start` → `TryBindNativeSpatialIndex(KernelConfig)`（绑不上即失败）→ `WorldTickBinding.Bind`。注册表不声明玩法配置契约，Runtime 此时要求不传 `WorldConfigBinding`；`ChatComponentSchemaTests` 钉住这一点，哪天声明了契约必须补真实绑定。
- **输入**：`ChatInput` 只有 `text`。发送者由宿主会话注入为 128 位 `NetEntityId`（instanceId + counter，32-hex），客户端不能自选。
- **状态**：`LastMessageText` + `LastMessageTick`（契约字段 `lastMessageText` / `lastMessageTick`），服务器私有、`[Persist]`、不同步。
- **事件**：`OnChatMessage` ClientRpc（信封侧即 `WorldChange.rpcs` 的 `ClientRpcRecord`）；本仓自有的 `chat.event` 是它的本地投影，sender 编码为 `senderNetEntityIdInstanceId` + `senderNetEntityIdCounter`（u64 LE ×2，对应记录里的 128 位 `sender`）。世界不保留历史列表。
- **有界输入**：C-1 `chat.input` UTF-8 512 字节在 Game Admit 层 `reject`（`chat_text_too_long`）；`SendMessage` 另按拼好的「名字: 内容」行卡同一上限。

## 待解决

- 101-entity 端到端 oracle 已随 entity-chat harness 退役（见 ADR [0022](../../../decisions/0022-retire-entity-chat-harness.md)）；ChatComponent 的验收面现在只有 `Lumio.Game.ServerGameplay.Tests` 的契约与有界输入用例，端到端由 Sample 侧的 11 场景链承接。
- 聊天玩家 `PlayerEntity` 与炸弹人契约的 `BomberPlayerEntity` 目前是两类实体；合并属炸弹人契约新版本的决策，不在本组件范围。

## 相关

- 代码：`modules/server-gameplay/src/Lumio.Game.ServerGameplay/`（`Chat/`、`Identity/`、`EntityTypes/`、`generated/server/`）
- 契约：架构源 `engine/wire/gameplay-command-envelope-v1.json`
- 测试：`modules/server-gameplay/tests/Lumio.Game.ServerGameplay.Tests/`——`ChatComponentSchemaTests` 钉「组件与注册表归本仓、映射常量 == Runtime 真源」，`ChatWireContractTests` 钉「== 架构仓 wire 契约」（需 `LumioGameEngine` 检出，见 ADR [0023](../../../decisions/0023-wire-contract-pinned-in-tests.md)），`EngineTestAssetReferenceGuardTests` 钉「不引用引擎仓 tests/fixtures/samples」
