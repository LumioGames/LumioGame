# server-gameplay 模块

> 权威 Gameplay Component、Processor 与 Command 应用语义。

**优先级**：P0
**架构基线**：`LGE-V1.4-2026-08-27`
**契约消费**：`lumio.gameplay-envelope.v1`（架构源 `engine/wire/gameplay-command-envelope-v1.json`，origin/main `935a8a9`）

## 负责什么

- 声明 `ChatComponent` 字段（`lastMessageText` / `lastMessageTick`）及其 persist-only、不上客户端属性同步流的维度。
- 在 Simulation Owner Thread 上经命令/提交路径执行 `SetMessage`：同一权威 Tick 更新发送者组件并产生一条 `ChatMessageEvent`。
- 执行 C-1 冻结的有界输入策略（UTF-8 512 字节上限、每发送者每 Tick 至多 1 条，单一行为 reject）。

## 明确不负责什么

- 不拥有传输、复制调度、Hello-wire 扩展或第二套协议。
- 不实现连接绑定、Account Server、聊天历史、审核、私聊或独立持久化子系统。
- 不做网络 I/O、文件 I/O 或直连账号服务。快照往返由 Runtime `R-00353` 验证。

## 状态所有权

- 权威 last-message 字段只存在于本模块的发送者 `ChatComponent`。
- `ChatMessageEvent` 是提交后的即时通知，不在本模块保留历史列表。

## 依赖方向

- 消费架构源冻结映射，不反向修改公共契约。
- 不引用 `Lumio.Gen.*`（generated 适配点尚未落地；本切片手写类型面对齐 JSON）。
- 不引用 `LumioServer` / `LumioClient` 实现，不引用 NativeCore / VoxelEngine 源码。
