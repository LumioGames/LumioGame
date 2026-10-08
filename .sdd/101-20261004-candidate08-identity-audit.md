# Candidate08 独立身份核验

结论：**ACCEPT_IDENTITY_ONLY**。正式 complete08、candidate08-build-01 的四步构建证据、已审核的两个浏览器源码及最新 `measured08b-wwwroot` 的身份关系一致。生产源、pins、生成物、包和发布文件均只读；本次没有构建、测试、进程操作或生产写入。实际体验验收及正式发布身份闭合由 Root 另行判断。

审计证据目录：[candidate08-identity-audit-01](C:/Work/LumioGames/LumioGame/.run/candidate08-identity-audit-01/)。最终机器结论是 [verification-final.json](C:/Work/LumioGames/LumioGame/.run/candidate08-identity-audit-01/verification-final.json)，SHA256 `e7616f4f0a1012ee7275d5cf60c06e6700810c83f02266efceef329e964809d4`；其余文件、冻结输入及本报告由该目录 `manifest.json` 封存。

## 完整包与修复源

正式包为 `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-08`，版本 `0.0.5-main.0e2fc74`、RID `win-x64`、manifest SHA256 `98102e190ceec5fbe4beedcc0e3dbd6f9220d55db98a2c9174ebeeb4b06d2ffc`。独立重算 manifest 列出的全部 **305 个文件**：零缺失、零哈希漂移、零未列文件（manifest 自身另计）。Root 官方完整包构建的原始退出文件与 verify-08 的原始退出文件均为 **0**，没有用局部 DLL 替换作为包验证证据。

输入八个所属仓当前 HEAD 均等于声明提交，`git status --porcelain` 均为空：

| 所属源 | 完整提交 |
|---|---|
| Engine | `0e2fc74783f9f186d59909b38d4ee70887a21137` |
| NativeCore | `81b2501a621db2657bd087db2afa808ecfb9e846` |
| Voxel | `2ba61e431d8080ff6450a07e6ee447e3f0994e0b` |
| Runtime | `d8ae3da3793d5d95785606be319668a4318af85a` |
| Server | `15418fc104a97fc30f7de45fd0f0c7c93309777c` |
| Client | `a6071a2a28c3cfda78400254654d6da1fef25b92` |
| Platform | `3a2ef1a7c3d57128bdaafd5efeea5080f9cdbc89` |
| Config | `a991a517f9dbae255321c25d65fea0bfdfdca42f` |

Server 构建源 `C:/Work/LumioGames/.101-pack07/LumioServer08` 相对原 07 Server `448c90b57fa2e071a224b58b0ef1acfb4189a355` 仅变更独审接受的三个文件，字节分别仍为：

| 文件 | SHA256 |
|---|---|
| `Engine/src/owner.rs` | `86ba0843ea6a27873846c45c6448ca5778f5333982e14d14c8c261871e363021` |
| `Tests/tests/browser_reentry_real_clr.rs` | `5452e67fe00c5e358efadc4e86116263f75d6db4cc7c9c6eac6f5a89c41ef159` |
| `Tests/fixtures/successor_runtime/SuccessorScenario.cs` | `6c2671e40aeef1356d3d4aa7934ec72f63e965ab1dc8eafe419a284e2940822e` |

因此此次构建身份关闭了此前作者 Cargo 旁仓 `c93b5c62…` 与固定 NativeCore `81b2501…` 的组合差异。原作者测试及其限制保留在 [Server 独审](C:/Work/LumioGames/LumioGame/.sdd/101-20261004-server-browser-reentry-independent-review.md)；本报告没有把那些测试宣称为此次重新执行。

## Game 消费与已审源码

新构建根为 `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/browser-experience-repair-01/candidate08-build-01`。`release.props` 指定上述 complete08 的完整包候选，四个步骤 `build-server`、`build-client`、`build-browser`、`publish-browser` 的实际退出码均 **0**；每份步骤 JSON 引用同一 manifest，保存的日志 SHA 与当前完整日志一致。命令保留正常 Gameplay 生成和官方引擎消费，私有产物、NuGet 与 lock 目录分离；`RestoreLockedMode=false` 的原始设置照实保留，本报告不宣称锁定还原通过。

已审源码在核验开始与结束均无漂移：

| 源码 | 已审及当前 SHA256 | 发布对应 |
|---|---|---|
| `Client/UI/Spectator/main.js` | `25765c149ee6f2f51e12ce2a26f0884506a691688b8e217a63e938067f170f3c` | 正式 `browser-publish/wwwroot/main.js` 与源逐字节相同 |
| `Client/UI/Spectator/SpectatorDump.cs` | `599609920469e0ba2eec906ba7425c678d6b128556cb6a548f2fefaf18ae25c9` | 实际发布构建 DLL 的 PortablePDB Document SHA256 为同值 |

对应前审：[scheduler 独审](C:/Work/LumioGames/LumioGame/.sdd/101-20261004-browser-pump-independent-review.md)、[Participant Self 独审](C:/Work/LumioGames/LumioGame/.sdd/101-20261004-browser-participant-self-independent-review.md)。本次直接读取已生成的 `Lumio.Bomber.Client.Spectator.pdb`，校验其内容 ID 与 DLL 的 CodeView GUID 一致，并读取该编译单元的文档校验和，未重新编译。进一步检查发布后的 Spectator 与 Gameplay WebCIL：其完整 CLI metadata 分别与实际新建 DLL 字节相同，记录了发布 `_framework` 文件的 SHA。此项证明编译、发布的程序集身份关系，不扩张为独立重建所有 IL 或编译器等价证明。

新产物在上述构建根下的精确相对路径及 SHA256 为：

| 产物路径 | SHA256 |
|---|---|
| `artifacts-server/bin/Lumio.Bomber.Gameplay/Release/Lumio.Bomber.Gameplay.dll` | `c59babde7ad31f4c0c0041017f0f53f803671f6c1b4492b34ece5de5f8958fb2` |
| `artifacts-client/bin/Lumio.Bomber.Gameplay/Release_client/Lumio.Bomber.Gameplay.dll` | `777d2be81e10b4d0b124206fc91909901abfee4fde51c4189fcb39250f4044d8` |
| `artifacts-client/bin/Lumio.Bomber.Bots/release/Lumio.Bomber.Bots.dll` | `1a5439528e1188b30a791902ce72d4fc4b198c5a9c7fbdffd60086bb6ef5efa3` |
| `artifacts-browser/bin/Lumio.Bomber.Gameplay/Release_browser/Lumio.Bomber.Gameplay.dll` | `56c2c6dffe9ee923ab1eedcb3e1262081d2eb99edb403781cdcaedc45c363431` |
| `artifacts-browser-host/bin/Lumio.Bomber.Client.Spectator/release/Lumio.Bomber.Client.Spectator.dll` | `08c643fc54d316b26b7c5d820469afad9dd97cd0c1adfab23eba94305d60b85e` |

browser-host 目录中的 Gameplay 副本仍为 `56c2c6df…`。新 launcher 明确消费上述新 client Gameplay 与 Bots；实际 live06 `clr.registry_assembly` 指向上述新 server Gameplay。

## 测量副本与首次测量错误

正式发布 `candidate08-build-01/browser-publish/wwwroot`、旧 `measured08-wwwroot`、新 `measured08b-wwwroot` 各有 **835 个文件**。两份测量副本的全部相对路径与大小集合已逐项比较：无新增、无缺失；**834 个文件逐字节相同，唯一内容变化是 `main.js`**。`_framework`、Engine WASM、引擎模块、`Assets/`、`RHI/`、`Render/`、Game 资源的命名和字节均完整保留，三个全量文件 SHA 清单已封存。

| 入口 | SHA256 |
|---|---|
| 正式 main | `25765c149ee6f2f51e12ce2a26f0884506a691688b8e217a63e938067f170f3c` |
| 旧测量 main | `dd184cd2eddf6bbff3b16d9cc0205c938f1e297877506be45d6e9a26d3f7954d` |
| 新测量 main | `a757d40fa5fb464c518e43c7b3b8fe1eadd4924a7c62198ab0341c991744cecd` |

旧与新测量脚本的原始 main 后缀都可用正式已审 main 加三处测量调用精确重建；两个测量前缀仅 native 调用包装的属性保留修复不同。官方 `engine-wasm.mjs` 把 `createVoxelPresentation` 作为 callable `call` 的可枚举自身属性赋值。旧 `attachEngineProfiler` 返回新的裸函数，丢失该属性；**live05 首次 A 在建立 socket 前失败，原记录 socket 数为 0，17:11:32.376Z/377Z 两条错误均为 `formal_voxel_world_unavailable`**。这是首次测量包装错误，不能归为官方包回归或重进问题。旧文件、console、probe、停止 launcher 子树的记录均保留。

新包装返回 `Object.assign(measuredInvoke, invoke)`，保留上述属性；仍在 `try/finally` 中仅委托一次实际 operation。审核的是该副本身份及包装差异，不把测量运行自身的观测开销视作正式性能验收。新 `launch-candidate08b.ps1` 使用 fresh `measured08b-wwwroot` 与 `live-06`，没有覆盖旧目录。

本独审第一次自动检查也有一个已纠正的命名假设：查验脚本误搜 `invoke.createVoxelPresentation`，而正式赋值对象名为 `call`。第一次 `verification.json` 的唯一 REFUSE 原样保留；`property-and-pdb-correction.json` 记录准确赋值和更正，最终 `verification-final.json` 与 `measurement-comparison-final.json` 才是本审裁决输入。这不是生产源漂移。

## 实际启动与保护集合

读取 live06 启动命令及只读进程快照确认 PID **3364** 的 `ExecutablePath`、`CommandLine` 均指向正式包 `server/win-x64/lumio-ds.exe`，文件 SHA256 `b9fa0515a0658cd2988f2ff33da0ae5206778815d8c0e481c6b4f039600e5460` 与 manifest 相同。启动命令没有私有 `dsExe` 替换，CLR 引擎 Native、HostEntry、runtime config、Replication、Ecs 路径均在 complete08 内，哈希也已保存。只冻结启动/DS_READY 行，未把仍增长的日志整文件作为不可变封存对象。

只读逐项重算固定 97 pins：**53 author + 44 generated，零漂移**，调用未改动的严格 `requireV15Review` 读取门通过。pins 模块 SHA 仍为 `aa880ac3839ced140386d2a17c974077a763a4e9c27a220f234725a72a9e8a6e`；先前两处独审修正及证据链保持。此前 Participant Self 独审封存的 **110 个生成/lock 文件亦零漂移**。没有更新 pin、增加宽松路径、降低门槛或重复宽泛测试。

Platform 实际分配与 DS_READY 仍声明 `gameReleaseId=bomber-0.0.4-main.ecece8a`。complete08 的引擎版本和新 schema15 游戏消费并不能关闭这项签名发布身份差异。本审不判断该差异是体验问题根因，也不宣称发布身份闭合。

**范围限制：** 此结论仅接受包、源码、编译产物、测量副本和实际启动路径的身份链。两独立玩家的双向移动、放弹、十次真正关闭重进、真实时序及性能记录须以 Root 的 live06 或后续实际验收报告为准；本报告没有用 SERVING、构建通过或旧画面代替该验收。
