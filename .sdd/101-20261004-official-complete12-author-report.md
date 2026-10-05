# 正式完整包 12 作者封存

结论：`ACCEPT_COMPLETE12_OFFICIAL_PACKAGE_AND_DEFAULT_CLR_CONSUMER_BROWSER_PENDING`。本轮只有所属 Client 已审核的七路径提交；正式完整包从八个干净、精确固定的源仓经官方完整构建生成。Game 的最终浏览器发布与真实体验仍待 Root 消费、独立核验及实测。

## 已审核 Client 提交

- 提交：`38ead5ff3656b3b3fed8a0edbdbf07c34801cd2a`，基线 `a6071a2a28c3cfda78400254654d6da1fef25b92`。
- 作者树：`C:/Work/LumioGames/.101-pack07/LumioClientSuccessorRevisionRepair`；原 `.run`、RED、诊断树全部保留。
- 新干净检出：`C:/Work/LumioGames/.101-pack07/LumioClient12Composition`。
- 提交前 index 为空；仅显式暂存已审核的七路径，`git diff --cached --check` 通过。提交范围为两生产、四测试/工程接线和一份真实 Host 原始帧夹具，不含 `.run` 或依赖源码。
- Root 的非作者审查：`C:/Work/LumioGames/LumioGame/.run/client-successor-repair-independent-review-01/result.json`，65 项检查、相关 87 测试，裁决 `ACCEPTED_EXACT_CLIENT_OWNER_REPAIR_FOR_WHITELIST_COMMIT_AND_OFFICIAL_COMPLETE_PACKAGING`。
- 新干净检出可能依 Git 配置改变 CRLF；最终封件逐个比对七路径规范化字节，并验证 143 个真实 Host `utf8` 原字符串全部逐字相同。没有重造授权包或变更业务字段。

两生产修复分别是：观察开始新 reservation 时允许其 revision 正式重起为 1，同 reservation transfer/reattach 的 revision 下降仍拒绝；Bot 会话 Faulted/Superseded 时最终检查明确失败，避免正常退出误报完成。完整 guard、历史、身份、额度与 Runtime 操作顺序保留；正式候选无私有诊断增量。两处真实 RED/GREEN 与精确源封件继续引用原作者报告 `101-20261004-client-successor-reservation-revision-author-report.md`，不以完整包构建覆盖旧失败记录。

## 正式构建与身份

输入：`games/101-bomber/.run/20261004-browser-experience/full-pack-12-input.json`，SHA256 `0b50d4fedc7885e96d6c2a88a2d664ec73a21033ebd57689bbe502ab3e9c8573`。正常 runner 原文件：`games/101-bomber/.run/20261003-controlled-game/pack-reviewed-composition.mjs`，SHA256 `6702dd187c3fa6b57e63c291396d68164cbb0faba9670a3cc369307d03708bb7`。相对完整 11，仅 Client root/commit 与新的 output/evidence 路径改变，其余七仓固定源不变。

八仓 preflight raw exit `0`；官方 `packFromMain` 全图构建 raw exit `0`。构建开始 `2026-10-04T00:16:01Z` 左右，结束 `2026-10-04T00:22:16Z` 左右，精确时刻以 driver 的 `build-start.utc` / `build-end.utc` 原文件为准。构建完成后的八仓 HEAD、manifest 来源及无未提交状态再次核对通过。

| 归属 | 精确提交 |
| --- | --- |
| Engine | `523c3d39f8f29b2dccd7d6451fe5a5e8c968c5c0` |
| NativeCore | `81b2501a621db2657bd087db2afa808ecfb9e846` |
| VoxelEngine | `2ba61e431d8080ff6450a07e6ee447e3f0994e0b` |
| Runtime | `520ffe482e1c48fb6e48187925eecec986cdb9c8` |
| Client | `38ead5ff3656b3b3fed8a0edbdbf07c34801cd2a` |
| Server | `008861074a2d3c9da1b0407325ede6f851704fd5` |
| Platform | `3a2ef1a7c3d57128bdaafd5efeea5080f9cdbc89` |
| Config | `a991a517f9dbae255321c25d65fea0bfdfdca42f` |

产物：`games/101-bomber/.run/20261004-browser-experience/complete-release-12`。版本仍为 `0.0.5-main.523c3d3`，因为 Engine HEAD 没有改变；完整 12 以新的 manifest 与 Client 提交识别，不宣称版本字符串能唯一标识这次组合。

- Manifest SHA256：`704b455b06a359c177ffff35ff2c076febc61b6340b777f7e4f9088d1ef6c766`。
- 305 个 manifest payload 全部逐文件实读 hash 一致；磁盘为这些 payload 加 manifest，共 306 文件，无额外文件。包内官方 `tools/verify-release.mjs` 实际 raw exit `0`。
- 本次官方 Native 构建实际 DLL SHA256：`122671a87d37cc34d8d28f11e5194a5eb38e11cc68b58086b88a99cb05d02ff5`。官方构建 log、Server 与 Bot DLL、各 sidecar、SDK 内 Native 均一致。BuildId `256deae04b8e439924c0694f8a61ebc5` 是现有构建标识，不据其相同值推断复用了旧 DLL；本次 raw build 与新二进制 hash 均有实证。
- 新 SDK SHA512：`I8EF6XMIYIoj4qDIN0hsrdespgAYoEkZWrozRnO1gMtDvtqWs/1R/CKkMYTEoqNEG2a5IC+WobSmfzA73qoh8A==`，与官方 sdk-identity、新 archive、fresh consumer assets 及恢复缓存实际 archive 一致。
- 五组实际 PEReader 闭包为 SDK net10 `13`、SDK netstandard `10`、Server Managed `13`、Bot `28`、Web replica `20`；所有 Lumio CLR 四段 AssemblyReference 与实发同名 AssemblyDefinition 精确吻合，各组 mismatch `0`。无 ALC 绕过或版本放宽。
- 新 SDK 通过独立 fresh NuGet/lock/artifacts 的真实默认 CLR consumer 构建和运行，均 raw `0`、构建零 warning；实际 Hosting 初始化取得 Native HFSM。13 个 consumer Lumio DLL 均与新 SDK net10 entry 字节相同，程序明确要求默认 ALC。
- Runtime net10/netstandard 三模块的各域真实 PE/TFM 和元数据身份已读；Engine Wasm 实际 SHA/ABI 与新 sidecar 一致；扫描未发现所列私有 Client/Runtime/Game 诊断标识。

## 封件及边界

正式 builder 的冻结输入、SDK 身份、Platform 构建 raw、result 位于 `games/101-bomber/.run/20261004-browser-experience/full-pack-12`。八仓 preflight、全图 raw build、305 逐项身份、PEReader 闭包、默认 CLR consumer 及最终封件位于新的 `full-pack-12-driver-01`。

- 最终封件：`full-pack-12-driver-01/final-seal.json`，SHA256 `24b73190cb4fed7d65a6aa13e68586716be5df3f1dda990f4d3b386afbcba517`。
- 包身份：`package-identity.json`，SHA256 `376714f004af128c4a2aaf8f87d93844e8f15f64e8701376df74b845cd4bba8e`。
- 五闭包：`pe-closures.json`，SHA256 `7919a0d78e8817a88bedf1432a7303365fb113e7ba333962c5c7155f6dc3c59f`。

一次私有分析器校验调用把 `--check` 放在脚本文件名之后，因打包当时尚未结束而读取缺失 `build.exit`；没有执行包验收或生成验收结果。该调用是 `INVALID_PRIVATE_TOOL_INVOCATION`，最终封件保留说明；随后正确 syntax check、打包完成后的真实检查均通过。不是生产或行为 RED。

正式包内 Web replica 是 20 个 netstandard PE DLL，Game 最终发布才转换 WebCIL；本任务没有执行 Game publish、浏览器、Platform 服务操作或真实输入。官方发布程序集没有 PDB，因此不冒称生产 DLL 的源 PDB 校验；来源资格由精确 clean commits 与官方真实构建图，以及实际域文件 hash 建立。新 Game 消费时仍需实读新 SDK restore、新 Host/WebCIL 与实际完整 12 字节。浏览器八人体验、十次重进、双向连续移动、跨 match successor 仍应由 Root 按实际现场验收。

其他正式交付缺口与 Platform 签旧发布身份问题全部保留。本次没有改 Shared Game、pins、锁文件或服务，也未覆盖旧完整包/失败文件。
