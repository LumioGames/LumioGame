# server-gameplay 模块

> 权威 Gameplay 消费面：信封解码、Bot 名规则、以及本仓自有 ChatComponent 的声明与 Admit / SetMessage 入口。

**优先级**：P0

## 负责什么

- 拥有 `ChatComponent`、`IdentityComponent` 与 `PlayerEntity` 的唯一 `[EcsComponent]` / `[EntityType]` 声明（聊天是玩法语义，组件归本仓，架构仓 ADR-117）；注册表、实体模板与同步表由 Runtime `gen-declarations` 在构建时生成到 `generated/server/`，生成物不手改。
- `ChatSetMessageSystem` 将 C-1 输入交给 Runtime `WireCodec` 校验并把 typed `InputCommandMessage` 送进 `WorldManager.Enqueue`，或在 Owner Thread 调用 `ChatComponent.SendMessage`。
- `RuntimeDrainConsumer` 只消费 Runtime `Drain` 的 `Frames` 与 `drain.queries`，并通过 Runtime owner-thread controls 提交绑定查询和过期请求；Game 不维护本地绑定、查询结果或 tombstone。
- 执行 C-1 冻结的输入 UTF-8 512 字节上限（政策 reject：`chat_text_too_long`）。

## 明确不负责什么

- 不拥有传输、复制调度、Hello-wire 扩展或第二套协议。
- 不实现连接绑定、Account Server、聊天历史、审核、私聊或独立持久化子系统。
- 不做网络 I/O、文件 I/O 或直连账号服务。快照往返由 Runtime World Manager 验证。

## 状态所有权

- 权威 last-message 字段存在于 Runtime World Manager 世界上的发送者 `ChatComponent`（组件类型归本仓，世界归 Runtime）。
- `OnChatMessage` 是提交后的即时通知，不在本模块保留历史列表。

## 依赖方向

- 消费架构仓 `LumioGameEngine` 的公共契约，不反向修改，也不在本仓复述其字段。
- 只引用 Runtime 的生产工程：`Lumio.GameRuntime.Ecs`、`Lumio.GameRuntime.Replication`，以及构建期的声明生成器（路径经仓根 `Directory.Build.targets` 由 `LumioRuntimeRoot` / `LUMIO_RUNTIME_ROOT` 或 sibling 发现）。
- 不得编译期引用引擎仓 `tests/`、`fixtures/`、`samples/` 下的任何工程或产物（ADR-117）；测试工程的 `EngineTestAssetReferenceGuardTests` 守这条线，测试世界的启动与准入在测试工程的 `ServerWorldBoot` 里自建。
- 不引用 `LumioServer` / `LumioClient` 实现，不引用 NativeCore / VoxelEngine 源码。
