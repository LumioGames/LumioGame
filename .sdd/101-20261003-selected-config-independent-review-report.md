# 101 选定客户端配置独立审查报告

审查日期：2026-10-03。审查者：独立 reviewer `selected_config_review`。

## 裁决与批准范围

- **Spec：PASS（配置源码范围）。**
- **Quality：PASS（配置源码范围）。** 未发现应阻断这份选定配置实现的源码缺陷。
- **真实浏览器入局验收：未通过。** `browser-entry-failed01.json` 记录页面 `failed`、Reconnect 与 `MONO_WASM: WebSocket error`。配置源码通过不能代替这项验收；现有证据也不能把 WebSocket 错误归因为配置错误。

本次批准对象仅为下述 freeze-01 中的 14 份选定客户端配置源码及其测试。它证明正式 player/spectator 配置读取、验证、固定、选角/表现/World 供给及准入前失败处理的实现可接受；不批准 Server successor 源码、后继改动、重新打包或最终产品交付。Root-owned launcher/seeded-config 只作为接线参考。后续源码变更须另立 freeze 并重新审查。

全角色视觉、音效、响应式、实机成功入局与重连、整局及下一局、M2、全特殊弹、稳定性和最终产品验收均仍需各自证据，不由本报告替代。

## 审查输入与身份核验

已按仓入口顺序阅读 `.spec/AGENTS.md`、`.spec/knowledge/README.md`，并阅读仓库边界规范及 `.sdd/101-20261003-selected-config-independent-review-brief.md`。此次只读源码与既有证据；未构建、未运行测试、未生成声明、未修改生产源码或共享生成物。只新增本报告。

冻结根：`games/101-bomber/.run/browser-selected-config/resume-20261003/freeze-01/`。下文源码行号均指其 `source/` 下文件。

- `manifest.json` SHA256 实读为 `9ab7009dba323510e7241f15bff1fc8270c35e95d95355eb6628a2b014bdf735`，与指定值相同。
- 14 份冻结源码逐一 SHA256 与长度匹配 manifest；复核时工作树对应 14 份文件也全部匹配该 freeze。
- 两个只读 Root 参考文件匹配：`Tools/launcher.mjs` = `74d67d46e5b9af12ed930544f3b6548a7ce8c6ab7147b03b42e77560abbb36c7`；`Tools/seeded-config.mjs` = `6b7aeb3f6d5fe3447df7956e874bc1e2857ae77d636c538ce6627696c3046d2d`。
- manifest 中 22 个旧证据文件的 SHA256 全部匹配。它们为历史证据，不能与本轮重复计成额外用例。

## Spec 核对

| 要求 | 源码与证据 | 结论 |
|---|---|---|
| 正式 player 与 spectator 读取本次选定 C export 原 bytes，仅 C 文件 | `Tools/client-config-host.mjs:6` 启动时读 root manifest 与 `client/*.json`，用 base64 传原 bytes；真实路径限制阻止出根。`Tools/player-host.mjs:13` 接同一 carrier。Root 参考 `launcher.mjs:1272,1344,1534,1571` 将同一次选择的 clientDirectory 同时供 Bot、player、spectator。`config-http01.json` 为实际 HTTP 原字节比对证据。 | PASS |
| 启动后固定 | carrier 在 host 创建时形成唯一 body；文件随后变化不会重新读盘。`BomberClientConfig.cs:70` 复制 loader 实际读取的 bytes，`Seal` 后移除原 source。 | PASS |
| Runtime 正式 loader 校验 manifest、fingerprint 与 typed tables | `BomberClientConfig.cs:27` 调 `LumioConfigLoader.Load(..., ConfigTarget.Client, requiredTables: entry.RequiredTables, typedTableFactory: entry.CreateTypedTables)`，失败抛错，成功才创建 snapshot 与投影。没有在 JS 或 carrier 自行解析/镜像表值。已有真实 Native 选定配置测试覆盖两个官方 profile、缺失和篡改文件。 | PASS |
| 同一个不可变 snapshot 供准入前选角、表现和每个 Client World | `BomberClientConfig.cs:22,40` 的 Display 和逐 World binding 都来自 `_snapshot`；每 World 另建 ConfigModule。`host/Program.cs:96` 的 SelectionConfig 明确用选定 Display；`SpectatorReplicaHost.cs:43,48` 闭包捕获同一 config，所有 replica World 使用 `CreateWorldBinding()`；`PresentationDump.cs:138` 与 `SpectatorDump.cs:283` 从当前 World binding 投影。测试在加载后清空 source，仍能给两份真实 Native World 一致配置。 | PASS |
| 取得 launch 前完成配置 | `main.js:764` 先 await `loadSelectedConfig`，之后选角，至 `main.js:774` 才取得 launch。`main.js:741` 检查响应与 abort 后调用 ConfigureConfig；`host/Program.cs:36` 未配置则 Boot 抛 `selected_client_config_required`，且此时尚未启动 Engine/连接。 | PASS |
| 配置失败、关闭零新准入，无 embedded 回落 | `main.js:783` 失败进入 finish；`main.js:674` 取消配置/launch 和选角；`main.js:746` 在 ConfigureConfig 前检查 abort；start 每阶段检查 attempt/terminal。`host/Program.cs:25` 只在完整加载成功时赋值，Boot 必须取得它。Node 证据覆盖加载失败零 Boot、关闭后晚响应零 ConfigureConfig/Boot。 | PASS |
| 成功加载后重连保持同配置 | `main.js:740` 只配置一次；`host/Program.cs:62` Close 保留 `s_configuration`；后续 Boot 始终将该对象传入 Host。Host endpoint renewal 只更新 launch，不重新读取配置。Node 测试覆盖两次 boot 仅一次 configure；Native 测试证明源文件变化不影响后继 World。实机成功重连未获证据，见验收边界。 | PASS（源码/已有分层证据） |
| 不用本地模拟或权威规则替代 | Config 只消费导出与生成 binding；Host 使用正式 ClientSession、Engine World 与 GAS 输入；BrowserSessionOwner 明确是 Native/WebSocket 测试 carrier，其授权帧不是 DS 全局验收。 | PASS |

`SpectatorReplicaHost.cs:43` 的可选 configuration 与 `SpectatorDump.cs:81` embedded 帮助入口用于既有不传参数测试。正式 `host/Program.cs:36,50` 始终要求并显式传入选定配置；正式 csproj 未新增 embedded config 资源。不能据测试辅助入口推断生产回落。

## Quality 核对与证据

配置读取、字节传递、Runtime 验证、UI 投影与 World 绑定职责清楚。carrier 不解释配置语义；包路径与重复文件检查在 `BomberClientConfig.cs:53`；one-shot 配置约束在 `host/Program.cs:27`。关闭在新 Boot 前完成，退出过程中迟到响应不会重新取得准入。测试覆盖了 profile 差异、冻结 source、两份 Native World、缺失/篡改、非法 server 路径/重复文件，以及 JS 加载失败/关闭/重连时序。未发现此审查范围内需要修复的 quality finding。

本报告复核既有证据的内容、计数与文件身份，没有把它们称为 reviewer 新执行的测试：

| 证据 | 实读结果与可证明范围 |
|---|---|
| `resume-20261003/js-review02.log/.exit` | 59 tests、59 pass、0 fail、0 skipped、exit 0。包含 host/main 配置与关闭时序测试；JS exports/浏览器为测试替身，不等于真实 WASM 入局。 |
| `resume-20261003/native-full05.json/.xml/.log/.exit` | JSON/XML/log 三者一致：53 total、53 pass、0 fail、0 skipped、0 not-run、exit 0。XML 中 SelectedConfigTests 为 5/5；其真实 Native、WebSocket 与 Runtime World 证据支持配置和分层复制路径，不替代 DS 整局。 |
| `resume-20261003/config-http01.json` | 实际 HTTP200、application/json、no-store；29 文件无 server 路径，原 bytes 全匹配官方 seed101/skills-off 选定 C export；本次再逐文件计算磁盘 SHA，29/29 与记录匹配。记录的重复响应相同。选定 map 19、playerCount 8。 |
| `resume-20261003/player06/verification.json` | 7 Bot admitted、8 个票据包含预留 browser account，player URL 无 credential；status 为 SERVING，步骤05–14显式 NOT_RUN。它没有证明 browser 已获准入。 |
| `resume-20261003/platform06-image.log` 与 health log | imageId `sha256:bf4b07cbd134061c4b9c6292e4c09b044427dea3b1794f37e06730a4a0fc661e` 与 06 release manifest 的 platformImage 一致；health 实际 JSON status/database 均 ok。平台健康不等于浏览器会话成功。 |
| 旧 red/green | host 6/6、main 53/53、native-selected 5/5、native-full02 53/53、publish01 exit0 可作为既有验证；native-full01 为52/53而非通过。 |

实读 `native-full05.json` 后再次计算三个输入文件 SHA256，均匹配：

- 测试 DLL：`85ece6c28dcf8b42ddca031050a7e0ff950ef0e08f53a6281198c66c7cbffe5a`。
- Server Gameplay DLL：`217901031a9bcf8f5386cd4ff2e56baeaf94942220ad976adfed4bbf97cae1ee`（仅测试输入身份，不构成 Server 源码独审批准）。
- 官方 06 Native：`419b74c7b5eac0f85a02ab58eda8485240194060dfd319e816ab35f501bfbfed`。

06 release manifest 实读 SHA256 `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4` 与 freeze 记录一致。HTTP 选择的 client root manifest = `52bcccf3353d2fe965d5298b5f73c1e2731918b60209ae6db7822d41eb530904`，对应 server root manifest 记录为 `88e48e0597d5800e3cdee3fcfe3e220437ec1d03843bba13217220ed45b618f6`。

本轮 `js-review01` 为失败尝试；`native-full03` 是 runner 不支持 `--minimum-expected-tests` 的参数失败，`native-full04` 缺少 Native 输入导致 49 failed。它们完整保留并被排除，不计为通过。未用之后成功证据改写这些失败事实。

## Findings 与验收边界

**配置源码 finding：无（Spec/Quality 均无阻断项）。**

**A1 — 实际 browser entry 尚未通过（验收项，不归因配置源码）。** 精确路径：`games/101-bomber/.run/browser-selected-config/resume-20261003/browser-entry-failed01.json` 与同名 `.png`。Root 报告已选泡泡鸭并点击开始；JSON 于 `2026-10-03T00:57:26.065Z` 捕获 player URL `http://127.0.0.1:60269/play/` 的 `failed` 页面和 `MONO_WASM: WebSocket error`。已查看截图，其画面没有成功游戏世界。当前只能认定真实入局失败/未完成，不能判定是配置故障，也不能声明成功启动、成功重连或整局可玩。Root 需继续定位连接失败并补真实浏览器证据；本报告不执行或批准这项修复。

## 冻结文件核验清单

下列 14 项均已按 manifest 的 SHA256 与 bytes 核验，不存在缺项或不匹配：

| source 相对路径 | bytes | SHA256 |
|---|---:|---|
| `Tools/client-config-host.mjs` | 1550 | `c9ecd2245f7aacef45c33c39c732c205888ddad9d1f871bbaa09f891ae83b9c6` |
| `Tools/player-host.mjs` | 5109 | `c8a967477cea9e5866de95613fcb6ff78d07986578343ef60140d188b574e183` |
| `Tools/player-host.test.mjs` | 8696 | `dae7e709811c2207c85f78de0b4134909a6b449fbe55b918c97797f6994160e6` |
| `Client/UI/Spectator/BomberClientConfig.cs` | 3768 | `d7c7efe567dd884d2e91a2d4440a126247ffda9cbffe5beaf40dc6af45347863` |
| `Client/UI/Spectator/SpectatorDump.cs` | 13969 | `d57333020eae1c3968d84b8183fefd0171e585dd0ceafed8970732bb639c3967` |
| `Client/UI/Spectator/PresentationDump.cs` | 15700 | `7689fb57bfdc9aa1acc293f2fd39722ee1f750ed9c91d395955abceeb936bf59` |
| `Client/UI/Spectator/SpectatorReplicaHost.cs` | 15329 | `e46d2970012e2980fd5cf74aa80803affcaefff59fae26dba3b38da750973b03` |
| `Client/UI/Spectator/main.js` | 36670 | `79a74b6f796e0fc51e56784afeb2aa75841ddae88b650d95376c3306ece39974` |
| `Client/UI/Spectator/main.test.mjs` | 31925 | `050fc54b1ad044f2daad6843e11234c79a3eed11348afba199b8090c66b61896` |
| `Client/UI/Spectator/host/Program.cs` | 6085 | `d6cd42736e856a11b9f83c8c1fcd80e48628aebebf84d90e171b82ee6f888feb` |
| `Client/UI/Spectator/host/Lumio.Bomber.Client.Spectator.csproj` | 11881 | `9e940e8cde616525c248944c93a59dc30b977041dba9a5dd2958a738d3cc0964` |
| `Client/UI/Spectator/tests/BrowserSessionOwner.cs` | 13569 | `f9b5cb7006f08ae2fd5575182b4c571e9874e5ad7cb9c293574fea6fdc792859` |
| `Client/UI/Spectator/tests/SelectedConfigTests.cs` | 3793 | `75fd7ef933a2f8a7ce914fc9e36464ef8e877dae9a125b2e3b7261f59b04fe4b` |
| `Client/UI/Spectator/tests/Lumio.Bomber.Client.Spectator.Tests.csproj` | 2625 | `9895c7454ab21a037e11e13e5274dd51e3656d090fee38a8967914feeb5f46d4` |
