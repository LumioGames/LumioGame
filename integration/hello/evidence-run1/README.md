# MS-00002 Hello World 端到端验收证据（2026-08-31）

本目录是 Hello World 里程碑（MS-00002 / RM-00010）在 Windows x64 本机的真实两轮验收证据，
由 `integration/hello/launcher.mjs` 产出，结论 SUCCESS。这是最终验收留档，不是可再生产物；
复现方式见 `integration/hello/README.md`。

## 运行拓扑（每轮全部为独立真实进程）

- Rust Server：`lumio-server.exe`（LumioServer `feat/ms-00002-hello-world`，动态端口）
- CoreEngine SDK Native DLL：`.run/ab12bf280961a39632022f7c6f3be78f/win-x64/lumio_engine_native.dll`
- CoreCLR 10.0.11（hostfxr 直载）+ C# Runtime `Lumio.GameRuntime.HelloEntry.dll`（authoritative Tick）
- 静态 HTTP Server（node）+ 真实 Chromium（Playwright channel=chrome，headless）
- 独立 Headless Bot：`Lumio.Client.HelloBot.dll`（.NET 进程）

## 身份与哈希

- BUILD_ID：`ab12bf280961a39632022f7c6f3be78f`
- ABI Hash：`1dfc86dad1ebbd8d6196d16946a9eb8542e951c83fa5e6163f696abee831fb8e`
- Native Binary SHA-256：`b34ab90a4825c5a53d914cf11ce7a46e65a08c2f931cc01c7e9c837aee8cfa05`
- 全部工件哈希见 `release-manifest.json`

## 两轮结果

| 项 | Round 1 | Round 2 |
|---|---|---|
| server / static 端口 | 58687 / 58688 | 49911 / 49912 |
| Browser→Bot：sender / revision / payloadSha256 | browser / 1 / a591a6d4…f146e | browser / 1 / a591a6d4…f146e |
| Bot→Browser：sender / revision / payloadSha256 | bot / 2 / a591a6d4…f146e | bot / 2 / a591a6d4…f146e |
| tickId | 1,2 | 1,2 |
| 端到端延迟（bot 收 / browser 收） | 12ms / 1ms | 10ms / 2ms |
| 进程退出码 | server 0, static 0, bot 0 | server 0, static 0, bot 0 |
| 非 Echo 链 | ingress→tick_committed→delta_routed ×2 | 同 |

两轮方向、sender、revision、payloadSha256、tickId 完全一致；延迟均 <1000ms；无残留进程
（launcher 残留检查 failures=0）。

## 目录内容

- `manifest.json`：launcher 总结论（SUCCESS）与两轮摘要
- `release-manifest.json`：全部工件路径 + SHA-256 + buildId/abiHash/binarySha256
- `round-N/server-audit.ndjson`：Server 权威审计（非 Echo 证明：每条 delta_routed 均由
  ingress_received → tick_committed（Runtime 分配 tickId/revision）先行）
- `round-N/bot-trace.ndjson` / `bot-result.json`：Bot 侧 trace 与结果
- `round-N/browser-result.json` / `browser-console.ndjson`：页面 `window.__lumioResult` 与
  console/network 错误采集（pageErrors=0，requestFailed=0）
- `round-N/hello-received.png`：浏览器收到反向 Hello 后的截图
- `round-N/trace.zip`：Playwright trace
- `round-N/verify-report.json`：三方对账（audit/bot/browser 数值一致、词表必填字段核对）

## 环境版本

- Windows 11 Pro 10.0.26200（x64）；Rust 1.98.0；.NET SDK 10.0.111（runtime 10.0.11）；
  Node 24.18.0；Playwright 1.62.1（channel=chrome，本机 Chrome）
- 各仓 commit 见 `release-manifest.json` 与 Workflow R-00335~R-00343 证据评论
