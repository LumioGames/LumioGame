# entity-chat 集成验收

Formal ECS entity-chat 端到端验收：Account Server + `lumio-entity-chat-replay`，100 Bot + 1 Browser，两轮日志逐位对比。契约真值在架构仓 `engine/wire/`（C-1′..C-4）。本目录不复制协议语义，只实现执行与对账。

- Node ESM；Node >= 24。Playwright 仅 Browser 场景需要（可复用 `integration/hello/node_modules`）。
- `node --test verify-evidence.mjs web/chat-window.test.mjs` 是 oracle 单测；空日志必须 FAIL。
- 不扩展 `hello-wire-v1`。`GameRoomHost` 与 `lumio-mvp-host` 不是 SUCCESS 路径。

## 文件

| 文件 | 职责 |
|------|------|
| `launcher.mjs` | 总指挥（R4-09 收口跑真实进程） |
| `verify-evidence.mjs` | 唯一尺子：只读服务器 / 客户端日志，`compareRuns` 逐位比较 |
| `bot-credential.mjs` | 按 account-server TestHarness 同形签发 Bot-tool credential（测试密钥） |
| `account-client.mjs` | `lumio-account-v1` login-or-register |
| `game-client.mjs` | 遗留 mvp-host 客户端（不再是 SUCCESS 路径） |
| `scenarios.mjs` | 场景脚本（R4-08 拥有，本卡不改） |
| `static-server.mjs` | web 资产静态服务 |
| `web/` | Playwright 用的 Browser 聊天页（sender 按两段 u64 / 32-hex 解码） |
| `logs/` | 收口日志目录（约定见 `logs/README.md`） |
| `fixtures/oracle-min/` | 标注为 fixture 的最小日志样本，不是收口目录 |

## 前置（sibling 构建产物）

| 参数 | 来源 |
|------|------|
| `LUMIO_ENTITY_CHAT_REPLAY` / `LUMIO_SERVER_ROOT` | LumioServer `lumio-entity-chat-replay` |
| `LumioRuntimeRoot` / `LUMIO_RUNTIME_ROOT` | LumioGameRuntime pin（Username.Server） |
| `--dir` | 日志目录（`logs/<日期-六仓短SHA>/` 或 fixture） |

密钥只走环境变量 / 本轮生成的测试密钥；不入库。不硬编码开发机绝对路径。

## 运行

```bash
node --test verify-evidence.mjs web/chat-window.test.mjs
node verify-evidence.mjs --dir fixtures/oracle-min
node verify-evidence.mjs --dir logs/<YYYY-MM-DD>-<arch>-<runtime>-<server>-<client>-<game>-<nativecore>
```

退出码：0 SUCCESS（两轮 eventOrder / appliedTicks 逐位相等），1 FAILED。不得合成 `eventOrder` / `appliedTicks` / 窗口行。

## 对账

- 101 = 服务器日志 `entity_admitted` 的 32-hex NetEntityId（instanceId \|\| counter）。
- `compareRuns` 比较 `(messageId, roomSequence, senderNetEntityId, appliedTick)` 与 `appliedTicks` 逐值；无多重集、无只比长度。
- 101 窗口行来自客户端日志。`oracleSha256` 先把 `\r\n` 归一为 `\n`。
- Snapshot 只保留 last-message，不恢复聊天历史。
