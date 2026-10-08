# 官方完整13包作者交回

裁决：`ACCEPT_COMPLETE13_OFFICIAL_PACKAGE_AND_DEFAULT_CLR_CONSUMER_BROWSER_PENDING`。官方完整打包 raw0，305项实际payload均符合本轮 manifest、无额外文件，八仓起止源码均为明确干净提交，五组实际CLR依赖闭包无版本错配；新SDK从本轮独立feed/cache恢复并在默认CLR完成真实Hosting/Native HFSM构造。此资格不包含Game编译/发布/WebCIL或真实浏览器体验。

不可变正式输出：`C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-13`。本次按官方源码正常构建 Native、SDK、Server、Bot、WASM、Platform及authoring tools，没有以旧包DLL替换或使用诊断产物。没有启动浏览器、修改服务或共享Game/pins。

| 身份 | SHA256 |
|---|---|
| 本轮 `manifest.json` | `9a3289d2720efacee59e6f762b49771a6729fde53a9a5033e8fd9c016b1ff2c5` |
| 本轮SDK nupkg | `f0ef1b6722f98e971a5eec9882061fb3b0f271810582eaeb7c79ed0fdb539e66` |
| 本轮官方Native（Server/Bot/SDK归档三域同字节） | `9f31f10938d4a3c856ea8d4bfccea0da2681fe606640402e4a18f65e42cfb2d2` |
| 本轮WASM | `edd992f1b06a82e98934450ed72fcd38a320cede29153380f9fe9eed4b3af242` |
| final seal | `e4c718413b487494b9c5d3e62cb71a37f13800d90cccad0e007ba98e2044f413` |

final seal绝对路径：`C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/full-pack-13-driver-01/final-seal.json`；同目录保存prepare/构建/qualification脚本、原始 `build.log/build.exit/build-result.json`、305项完整文件表、PE读取、official verify及真实CLR消费材料。官方runner仍是原 `pack-reviewed-composition.mjs`，实际完整SHA `6702dd187c3fa6b57e63c291396d68164cbb0faba9670a3cc369307d03708bb7`。

## 源码与提交边界

Root非作者75项审查实际 raw0，裁决 `ACCEPT_EXACT_SOURCE_FOR_WHITELIST_COMMIT_AND_OFFICIAL_COMPLETE_PACKAGING_BROWSER_PENDING`，结果 SHA `8b46987895e802822f2e76d09cafde9a35c818fcbcce74bab3d2dea4b76b39b6`。随后先确认index空和当前三个源的已审SHA，只显式stage以下三个文件，再检查cached名单和与当前源码LF归一字节相同后提交：

- `Client/Engine/Wasm/EngineWasmCall.cs`
- `Client/Engine/Wasm/EngineWasmPrediction.Selective.cs`
- `Client/UI/Spectator/tests/EngineWasmPredictionHeaderTests.cs`

提交 `b9c2d415e09520c7946cc5eed8aec8a6c59244b1`，没有 `.run`、依赖或其它源码。由该提交创建全新干净 `C:/Work/LumioGames/.101-pack07/LumioClient13Composition`；三个源与已审核作者源仅允许Git检出换行差异，LF归一完整字节一致。

本轮新 `full-pack-13-input.json` SHA `9c2ad8f2bc02ace800cbce02961f66589b98490e7179a73b68f194d61749966b`。对实际冻结12输入逆向还原四个字段后完整结构相同：只改 `sources.LumioClient.root/commit` 和输出/evidence路径，另外七仓、Config官方artifact、baseVersion均不变。起止八仓均再次核HEAD和包括untracked的干净状态。

| 仓 | 实际提交 |
|---|---|
| Engine | `523c3d39f8f29b2dccd7d6451fe5a5e8c968c5c0` |
| NativeCore | `81b2501a621db2657bd087db2afa808ecfb9e846` |
| Voxel | `2ba61e431d8080ff6450a07e6ee447e3f0994e0b` |
| Runtime | `520ffe482e1c48fb6e48187925eecec986cdb9c8` |
| Server | `008861074a2d3c9da1b0407325ede6f851704fd5` |
| Client | `b9c2d415e09520c7946cc5eed8aec8a6c59244b1` |
| Platform | `3a2ef1a7c3d57128bdaafd5efeea5080f9cdbc89` |
| Config | `a991a517f9dbae255321c25d65fea0bfdfdca42f` |

Client12已有七处修复源与干净12检出仍逐字相同，143条真实Host UTF8帧内容也保留，不能通过本轮header修复丢失已审next-match revision/Host失败语义。原包/原作者RED和私有证据全部保留。

## 已执行资格及限度

官方打包 raw0后，实际package inventory为305payload、磁盘306文件（唯一额外是manifest自身）；SDK实际SHA512与builder identity一致。Server、Bot、SDK中的Native均吻合本轮官方 `BINARY_SHA256`及sidecar。WASM真实hash/ABI和新Native sidecar匹配，全部发行可读payload未发现已知私有诊断标记。`tools/verify-release.mjs --root <本轮13> --rid win-x64 --json` raw0，校验305项及authoring工具。

独立 `System.Reflection.Metadata.PEReader`直接读取本轮五组DLL，不加载/重绑定程序集：SDK net10=13、SDK ns21=10、Server=13、Bot=28、Web replica=20，各组所有Lumio引用均与该组真实四段AssemblyVersion一致，零错配。PE证据 SHA `14b17df4d41fb4f661d2933582842f83acdf6e6df60866f740916dab02b24a00`。

本轮SDK CtorProbe使用全新私有feed/cache/lock/artifacts、正常NuGet和默认CLR；build0/0警告、run0，真实 `ContextHfsmAbi`可用并要求Default ALC。实际project.assets只有本轮SDK，恢复的实际nupkg SHA512匹配本轮包，输出13个Lumio SDK DLL逐字匹配本轮归档，不借版本忽略/ALC替身/deps修改。见 `full-pack-13-driver-01/sdk-default-clr-consumer-01/`。

V2修复作者原Codec RED六处expected2/actual1，GREEN整个Spectator92项已封在先前作者报告。本轮源提交前，Reentry另以匹配私有依赖图将真实候选C#生产packet送入正式12真实WASM，未经transport重写直接成功，packet恰等于旧RED的仅version反事实对照；独立报告 `.sdd/101-20261004-wasm-v2-output-header-candidate-real-green.md` SHA `20c3778d29cb1e86f3867c7d43057331bba1989ca0a8b8f0fb8fa94e018396d3`。这是源码候选功能资格，不能冒称本轮13真实浏览器验收。

Engine HEAD未变，完整13版本仍为 `0.0.5-main.523c3d3`；必须用本轮manifest、SDK hash及Client提交识别，不能按同名版本复用旧缓存或宣称公共发布身份闭合。官方既有Native编译/linker警告与WSL localhost提示在原始日志保留，未加NoWarn/改guard处理；最终官方exit0。

当前没有Game新发布/最终WebCIL/PDB源闭合、V16新包pins启用、首次真实移动/连续输入/两端放弹及十次可玩关闭重进、性能改善结论。上述验收由Root后续实际消费执行；本轮完整13输出自封存后不再写入。
