# server-gameplay 模块

> 权威 Gameplay 消费面：信封解码、Bot 名规则、以及 Runtime ChatComponent 的 Admit / SetMessage 入口。

**优先级**：P0
**架构基线**：`LGE-V1.4-2026-08-27`
**契约消费**：`lumio.gameplay-envelope.v1`（架构源 `engine/wire/gameplay-command-envelope-v1.json`）

## 负责什么

- 引用 Runtime `Lumio.GameRuntime.Samples.Username.Server` 的唯一 `[EcsComponent] ChatComponent`（Game 不声明第二份类）。
- `ChatSetMessageSystem` 将 C-1 `chat.input` 信封送进 `WorldManager.Enqueue`，或在 Owner Thread 调用 Runtime `ChatComponent.SendMessage`。
- 执行 C-1 冻结的输入 UTF-8 512 字节上限（政策 reject：`chat_text_too_long`）。

## 明确不负责什么

- 不拥有传输、复制调度、Hello-wire 扩展或第二套协议。
- 不实现连接绑定、Account Server、聊天历史、审核、私聊或独立持久化子系统。
- 不做网络 I/O、文件 I/O 或直连账号服务。快照往返由 Runtime World Manager 验证。

## 状态所有权

- 权威 last-message 字段存在于 Runtime World Manager 世界上的发送者 `ChatComponent`。
- `OnChatMessage` 是提交后的即时通知，不在本模块保留历史列表。

## 依赖方向

- 消费架构源冻结映射，不反向修改公共契约。
- 引用 `Lumio.GameRuntime.Ecs` 与 `Lumio.GameRuntime.Samples.Username.Server`（路径经 `LumioRuntimeRoot` / `LUMIO_RUNTIME_ROOT` 或仓根相对 sibling 发现）。
- 不引用 `LumioServer` / `LumioClient` 实现，不引用 NativeCore / VoxelEngine 源码。
