# R-00354 101-Entity entity-chat 集成启动器

Formal ECS entity-chat 端到端验收:Account Server + C# MVP Game host,100 Bot + 1 Browser,两轮确定性对比。契约真值在架构仓 `engine/wire/`(C-1..C-4),本目录不复制协议语义,只实现执行与对账。

- Node ESM;Node >= 24。Playwright 仅 Browser 场景需要(可复用 `integration/hello/node_modules`)。
- `npm test` / `node --test verify-evidence.mjs` 是收口证据面;空证据包必须 FAIL。
- 不扩展 `hello-wire-v1`,不启动 R-00359。

## 文件

| 文件 | 职责 |
|------|------|
| `launcher.mjs` | 总指挥:启动 sibling lumio-mvp-host → 101 活升级 → SUCCESS 或 blocked.json |
| `verify-evidence.mjs` | 11 场景对账器(census 必须来自 mvp-host 进程 audit;suite-only GameRoomHost 必须 FAIL) |
| `bot-credential.mjs` | 按 account-server TestHarness 同形签发 Bot-tool credential(测试密钥) |
| `account-client.mjs` | `lumio-account-v1` login-or-register |
| `game-client.mjs` | `lumio.mvp.v0` 升级;记录 FullGraph 64 连接预算 |
| `scenarios.mjs` | Bot01–Bot100 + Browser 驱动 |
| `static-server.mjs` | web 资产静态服务 |
| `web/` | Playwright 用的 Browser 聊天页 |

## 前置(sibling 构建产物)

| 参数 | 来源 |
|------|------|
| `--account-exe` | LumioServer `account-server/.../lumio-account-server.exe` |
| `--host-exe` | LumioServer `mvp-host/.../lumio-mvp-host.exe` |
| `--contract-dir` | 架构仓 `engine/wire`(C-1..C-4 blob 见卡片) |
| `--out` | 证据目录(已被 gitignore:`evidence/`) |

密钥只走环境变量 / 本轮生成的测试密钥(`LUMIO_ACCOUNT_ADMISSION_PRIVATE_KEY_HEX`,`LUMIO_ACCOUNT_BOT_TOOL_PUBLIC_KEY_HEX`);不入库。

Account Server:

```text
lumio-account-server.exe --store-path <round>/account-store --listen 127.0.0.1:0
```

C# MVP host:

```text
lumio-mvp-host.exe --listen ws://127.0.0.1:0 --allow-insecure-loopback \
  --shared-secret-file <generated> --reconnect-window-seconds 300 \
  --enable-test-control --test-control-listen http://127.0.0.1:0 \
  --audit-trace-file <round>/host-audit.ndjson
```

## 运行

101-entity SUCCESS 路径是 sibling `lumio-mvp-host` 101 路活连接。`GameRoomHost` 只作单元测试 double。FullGraph `MaxConnections=64` 不能承载 101 路时必须 BLOCKED（`blocked.json` + `FullGraphComposition.cs:30` + 实测错误），不得收缩场景、不得回退 `wt-server/r-00344`。

构建 sibling host（LumioServer origin/main，本仓不改 Server 仓）：

```bash
dotnet build --project <LumioServer>/mvp-host/src/Lumio.Server.MvpHost.App/Lumio.Server.MvpHost.App.csproj -c Release --nologo
```

```bash
node --test verify-evidence.mjs bot-credential.mjs
node launcher.mjs --out <evidenceDir>
```

退出码:0 SUCCESS（仅 101 路 mvp-host 实连且 11 场景有独立 traces）,1 BLOCKED/FAILED。缺 origin/main Account Server dll 且已取得 101 路时退出 2。不伪造 101 实体。

## 对账

- 101 = mvp-host 进程 audit 里带 `process: lumio-mvp-host` 的 per-entity 事件去重;禁止 `{total:101}` 常数,禁止 GameRoomHost census dump。
- 两轮对比 entity counts、event order、applied Tick。
- 失败矩阵:unauthorized / invisible / stale_generation / tombstoned,不得 alias。
- Snapshot 只保留 last-message,不恢复聊天历史。
