# 官方完整14作者封存

裁决：`ACCEPT_COMPLETE14_OFFICIAL_PACKAGE_AND_DEFAULT_CLR_CONSUMER_BROWSER_PENDING`。本轮只建立干净Client组合并调用官方完整发行流程，构建与检查均结束，作者停止源码和包写入。没有操作浏览器、Platform服务或Game共享源/pins。

完整包：`C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-14`。原12/13包保留原样；新14不作为Game消费、WebCIL或体验验收通过。

| 精确身份 | SHA256 |
| --- | --- |
| final-seal（`full-pack-14-driver-01/final-seal.json`） | `617a00e2187fe1389a7ecff0fe58557e53fc9bdc5a43273b17d510c7f44fa801` |
| 实际manifest | `65bcedda784e3a99ac5f0ff55d9f1fb20bfeaef14313f28001b25e741270a9c9` |
| 实际SDK nupkg | `d7c97107620696669d8657e590d19d085cc2112243783ce48ac2d912bbdb21d0` |
| 本次官方Native | `e15c2b124d339a000b5348d47cdf4ef7571e55ff8447637386795e0cf0034c89` |
| 本次官方WASM | `668197d048c8c76fe7030c3907b5ec84acd5d05e330b41227258d7c9bd43dee6` |
| 新输入 `full-pack-14-input.json` | `7eba969815fc1f6d2507d71136b664de4ff22d3715b9c7fbb12ff5c73ef23fb0` |
| 官方runner | `6702dd187c3fa6b57e63c291396d68164cbb0faba9670a3cc369307d03708bb7` |

Platform image是 `lumio-platform-local:0.0.5-main.523c3d3@sha256:fab3933b5a4f4c931097f787a451c1f3d73813ad44c8e0dddec44044cc3943b0`，不同于旧13 image；不能把正在运行的18087旧image视为14。未重启或改其服务。

## 源与流程

NEW `C:/Work/LumioGames/.101-pack07/LumioClient14Composition`，detached HEAD `862f3ed231bdd0d8b9f9e953291222b2e07a67f7`，干净且index空，没有带作者私有`.run`。相对b9c2d415仅审核后的3路径提交：单格ReadSelected生产方法、原header两处容量断言、新codec测试。三源LF归一hash均匹配Root非作者340项审核（result SHA `73a6ef6002bd8f273474aa3ce1afdd00a428accddeca1b6dbb9ba11567db541d`）。完整13其余tracked代码和143帧正式Host原UTF8 fixture保持原字节。

新输入对实际完整13输入做whole inverse，只改Client root/commit和14输出/evidence；其余七源和Config artifact不变。8源前置`--check-only`成功，官方6702 runner通过原`packFromMain`/defaultBuilders产出新Native、SDK、Server、Bot、WASM和Platform；没有DRAFT、RuntimeOffline、ServerOffline、旧DLL替换或自制Native builder。

官方wholepack实际raw0，2026-10-04T03:26:28.6883639Z→03:34:05.9187881Z。原Native编译/链接warning和WSL localhost advisory完整保留，未添加源码抑制或把日志修漂亮。

| 固定源 | 起止HEAD（均clean） |
| --- | --- |
| LumioGameEngine | `523c3d39f8f29b2dccd7d6451fe5a5e8c968c5c0` |
| LumioNativeCore | `81b2501a621db2657bd087db2afa808ecfb9e846` |
| LumioVoxelEngine | `2ba61e431d8080ff6450a07e6ee447e3f0994e0b` |
| LumioGameRuntime | `520ffe482e1c48fb6e48187925eecec986cdb9c8` |
| LumioClient | `862f3ed231bdd0d8b9f9e953291222b2e07a67f7` |
| LumioServer | `008861074a2d3c9da1b0407325ede6f851704fd5` |
| LumioPlatform | `3a2ef1a7c3d57128bdaafd5efeea5080f9cdbc89` |
| LumioConfig | `a991a517f9dbae255321c25d65fea0bfdfdca42f` |

## 实际产物与正常消费者

305项payload全部逐byte/hash对manifest，磁盘306项（另含manifest）、无extra；构建结果manifest与磁盘manifest一致。SDK真实SHA512、Native所有官方副本/sidecar和WASM ABI/hash闭合；已知私有诊断marker未发行。官方`verify-release --rid win-x64` raw0/files305。

使用BCL System.Reflection.Metadata直接读五组真实PE引用闭包，13/10/13/28/20项，全部0 mismatch；PE result SHA `8b804bf50cf7ee6b8d7bd1ad6d3b9c956048ff638b55f3f0cc8b0ead5cbab784`。没有加载程序集去忽略版本或手改deps。

新独立SDK feed/cache `.nclr-complete14-01`正常restore+build raw0，新SDK/Native实际Default CLR构造run raw0，返回真实`ContextHfsmAbi`接口；assets与restore archive的真实SHA512匹配本次SDK，实际消费者13个net10 DLL逐字匹配本次SDK archive。没有ALC放宽、bot DLL覆盖或旧SDK缓存替代。

完整包仍版本`0.0.5-main.523c3d3`（Engine HEAD未改），必须用本表manifest/SDK/Client commit识别14，不以显示版本串区分完整12/13/14。官方包中的web replica是PE netstandard DLL；Game浏览器Host的publish/WebCIL转换、835文件普通页与测量页身份、Platform签发身份、schema ledger/package pin更新和实际体验回归由Root另外独立验证。本轮不声明这些已通过。
