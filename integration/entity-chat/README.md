# R-00376 101-Entity entity-chat 集成启动器

Formal ECS entity-chat 端到端验收：Account Server + `lumio-entity-chat-replay`，100 Bot + 1 Browser，两包两轮确定性对比。契约真值在架构仓 `engine/wire/`（C-1..C-4）。本目录不复制协议语义，只实现执行与对账。

- Node ESM；Node >= 24。Playwright 仅 Browser 场景需要（可复用 `integration/hello/node_modules`）。
- `npm test` / `node --test verify-evidence.mjs` 是收口证据面；空证据包必须 FAIL。
- 不扩展 `hello-wire-v1`。`GameRoomHost` 与 `lumio-mvp-host` 不是 SUCCESS 路径。

## 文件

| 文件 | 职责 |
|------|------|
| `launcher.mjs` | 总指挥：启动 sibling lumio-entity-chat-replay → 两包两轮 → SUCCESS 或 blocked.json |
| `verify-evidence.mjs` | 11 场景对账器（census 来自 rust host-audit；oracle sha256 钉死） |
| `bot-credential.mjs` | 按 account-server TestHarness 同形签发 Bot-tool credential（测试密钥） |
| `account-client.mjs` | `lumio-account-v1` login-or-register |
| `game-client.mjs` | 遗留 mvp-host 客户端（不再是 SUCCESS 路径） |
| `scenarios.mjs` | Room 网线观察、Playwright、Bot 驱动 |
| `static-server.mjs` | web 资产静态服务 |
| `web/` | Playwright 用的 Browser 聊天页（接 Room，填充 `__lumioChat.window.lines`） |

## 前置（sibling 构建产物）

| 参数 | 来源 |
|------|------|
| `LUMIO_ENTITY_CHAT_REPLAY` / `LUMIO_SERVER_ROOT` | LumioServer `lumio-entity-chat-replay` |
| `LUMIO_GAME_ROOT` | 本仓根（rust replay 调 Playwright helper） |
| `--out` | 证据目录（已被 gitignore：`evidence/`） |

密钥只走环境变量 / 本轮生成的测试密钥；不入库。不硬编码开发机绝对路径。

## 运行

```bash
node --test verify-evidence.mjs scenarios.mjs web/chat-window.test.mjs
node launcher.mjs --out <evidenceDir>
```

退出码：0 SUCCESS（仅 rust replay 实连且 11 场景有客户端观测 traces），1 BLOCKED/FAILED。缺 replay 二进制时写 `blocked.json`。不伪造 101 实体，不合成 `eventOrder` / `appliedTicks` / `restoredWindow`。

## 对账

- 101 = rust host-audit 的 `nent_*`。
- SUCCESS 要求场景 1–11 `ok: true`，Playwright 收到 `chat.event`，S6 `tickSource=native-kernel/tickFrame`，S7 跨进程落盘，S8 旧连接收到 `ConnectionSuperseded`。
- `verify-evidence.mjs` 自身 sha256 必须写入 `evidence.oracleSha256`。
- Snapshot 只保留 last-message，不恢复聊天历史。
