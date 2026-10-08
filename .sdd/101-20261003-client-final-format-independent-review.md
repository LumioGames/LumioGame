# Client 最终格式独立审查

2026-10-03。结论：**imports02 与两处 literal 保留独审通过，零 actionable finding；Root随后执行的format03/build04/test03已独立读回通过，12份TRX共1260/1260/0skip，源码/DLL身份闭合。** 此处使用新的test03原件，没有把此前1260结果改记为当前源码已运行。

本 agent 不是这两处 Client literal 的作者。收到 Root 明确 formatter 已结束的通知后才读取 after；只运行 PowerShell 读取/hash、现成 Roslyn4.14 解析、只读 git diff。没有 build/test/format/GEN/Native/Rust、编译新 verifier、修改 owning Client/Runtime/Engine/Game source、index 或 refs。本轮只持久化本报告和 Root 私有证据。

## imports02 实际输入与结果

Root 官方 formatter argv 为 `dotnet format LumioClient.slnx --no-restore --verbosity diagnostic`，2026-10-03 05:47:28–05:48:05 UTC，实际 child0。原 fullformat02 verify 的 raw2、59 IMPORTS 诊断与 sourceDrift0 保留；本审查没有将此前失败回抹，也没有运行新的 format verify。

| 原件 | SHA256 |
| --- | --- |
| [.run/client-correlation-full-20261003/format-input-02/manifest.json](C:/Work/LumioGames/LumioGame/.run/client-correlation-full-20261003/format-input-02/manifest.json) | `a03291c9497def290500a2242b34f3a250d1f96b3f6617f9283c5f6f826b390d` |
| [.run/client-correlation-full-20261003/solution-format-imports-fix-01.json](C:/Work/LumioGames/LumioGame/.run/client-correlation-full-20261003/solution-format-imports-fix-01.json) | `0412e6c7181715aaf76841424d95dc60dea50642bf117f67aae0ddf6aeca8f6c` |
| [.run/client-correlation-full-20261003/solution-format-imports-fix-01.log](C:/Work/LumioGames/LumioGame/.run/client-correlation-full-20261003/solution-format-imports-fix-01.log) | `4a84d9006d6be8e32f44819ef649e996c6a830627e0275ec82b3f7bdc17a1071` |

独立复算1521份 frozen 原件全部匹配 manifest：Client514、Runtime902、Engine105。Runtime 比01多一份已 local-commit 的测试，已纳入02前像；没有借用旧1520的计数。

actual after 正好59处 Client变化、1462份未变，变化集合和 formatter runner59项完全一致。Runtime902和Engine105逐SHA零漂移；没有用忽略空白的 git diff 代替这个身份检查。

核验加载现成 Client `.run/correlation-full-20261003/artifacts/bin/Lumio.Tools.GenDeclarations/debug/` 的：

- Microsoft.CodeAnalysis.dll 4.14，SHA `395736b2d0e02be77bedc3847b269da7a93bf8e49cd3431a4a8e68d2c52d5846`。
- Microsoft.CodeAnalysis.CSharp.dll 4.14，SHA `53302acca07700e9bb10dcf21034435d6e0454c8eebf2481164ec13e520004c9`。

实际执行60个 profile 检查：58文件各一 profile，FoundationHostCommand.cs 的 `LUMIO_NATIVE_LOADER` 未定义/已定义各一 profile，覆盖实际改变文件的全部条件分支。每个 profile：

1. using 完整 token 多重集合相等，包含 alias、static、global 及完整名称；namespace 归属与所有前置 directive 作用域相等。
2. 非using ordered token 的 RawKind、Text、ValueText 精确相等；字符串/数字没有被去空白正规化。
3. 全部 directive token 与 active 状态相等；注释内容只准空白差异。

60项均通过，失败集合为空。移除 using Span 后57个 profile 的其余源码字符直接相等；另3文件 BotJointPredictionTests.cs、joint-prediction-host-tests.cs、voxel-ownership-tests.cs 的完整 actual diff 已人工读回，仅 alias 排序和 using 组内一空行去除，body 其余原字不变。所有59份完整 diff 和前后SHA已归档。

## 两处 literal 的独立字节核验

保留原独审 [client-format-semantic-review](C:/Work/LumioGames/LumioGame/.sdd/101-20261003-client-format-semantic-review.md) 的两处 raw EOL finding。再独立核对作者 [literal-preserve-report](C:/Work/LumioGames/LumioGame/.sdd/101-20261003-client-literal-preserve-report.md)，报告 SHA `c8d870e19b4690971d8525ee5960031d76bba77025e75e3b913d31d70794d8a2`。

使用 Roslyn 实际 Token.ValueText：从 format-input-01 读原值，从 literal-preserve before 读插入前源码，从当前源码读表达式；确认唯一实例调用是原 raw literal 上的 `.ReplaceLineEndings("\r\n")`，唯一参数 ValueText 为确切 CRLF，调用就是 File.WriteAllText 的第二实参。完整 source 对比仅各插入27字符，raw literal Text/ValueText、全部断言及剩余源码保持原字。当前.NET实际 String.ReplaceLineEndings 的结果与原值精确相等。

| 文件 | 原值 = 当前表达式实际值 UTF8 SHA256 | 当前文件 = imports02 frozen SHA256 |
| --- | --- | --- |
| [FoundationNativeHfsmIsolationTests.cs:92](C:/Work/LumioGames/LumioClient-101-successor-correlation/Bot/Tests/Unit/FoundationNativeHfsmIsolationTests.cs:92) | `b7d310374e7cf19a0e7544861304240feb2c370396549c7a7b71a659723cf469` | `1d8ad0ea00951c8b401c0bc15f5357e3897685f2f96ce141c4fbf72838eae66e` |
| [BotKernelConfigTests.cs:30](C:/Work/LumioGames/LumioClient-101-successor-correlation/Tools/Tests/BotKernelConfigTests.cs:30) | `f40b3e071fd7a8a40f089d53f4108083e100f718e3c65bd1f2473ed132bf4ccd` | `d78afaca4178d74014e94b8fa1c2c59bc5352a1b09730f53d487027b8ab22673` |

二者原值均8 CRLF、0 bareLF、0 bareCR。imports02 没有改变这两个整文件，新增调用的实际值继续保持 format-input-01 原字节。作者 proof SHA `a5f83866754de2766c9532a2ac3cb833e6726ea9fe1de2cd7b08d16fe3a213f8`、patch SHA `f319e4daa8afad42d474ef78ca5509fe40443c2bef21afc9c060f079fa8621d7` 已只读核实；独立结果另存，没有运行会覆盖作者原件的 verify 脚本。

## 私有核验归档

目录：[client-final-format-independent-review-01](C:/Work/LumioGames/LumioGame/.run/client-final-format-independent-review-01)。归档时重跑上述轻量检查，两个核验器实际 child0；不是构建或测试通过。

| 证据 | SHA256 |
| --- | --- |
| [verify.ps1](C:/Work/LumioGames/LumioGame/.run/client-final-format-independent-review-01/verify.ps1) | `4543fdfe59a1d5c60a3b8b51874e54ca19c79c2305b33d08e546dd8723947bfc` |
| [result.json](C:/Work/LumioGames/LumioGame/.run/client-final-format-independent-review-01/result.json) | `a8503a4e86fdeab89ee41bec92c8af69b7cea5afcd05e8b4448ad8d684b5289e` |
| [literal-verify.ps1](C:/Work/LumioGames/LumioGame/.run/client-final-format-independent-review-01/literal-verify.ps1) | `0e9a65545ec6a8f9c09a72330a3bdc66c2d7366b227c6af91964c8e79cc83b03` |
| [literal-result.json](C:/Work/LumioGames/LumioGame/.run/client-final-format-independent-review-01/literal-result.json) | `dcb7c154b44b64b0e8739ac883dfcb590947763f5145fa284ea76fc455689f38` |
| [imports59.patch](C:/Work/LumioGames/LumioGame/.run/client-final-format-independent-review-01/imports59.patch) | `9adb4edc5693d9d8903c5a6667e5bf4a553e551f7e76348cb5d1741dc02577f9` |
| [diff-exits.json](C:/Work/LumioGames/LumioGame/.run/client-final-format-independent-review-01/diff-exits.json) | `dc879236eec8e4ee1b349eb52f1dca20a3a2f30c638b54dac89e9881cf959d5c` |

result.json 保存59条实际前后SHA、每文件条件符号/profile数、完整边界计数和空失败集合。59次 git no-index diff 的 actual raw exit 均1，表示确有预期差异，不能记为测试失败或测试通过。导出 diff 前再次核对 actual source SHA 与核验后像一致。

## Root 后续实际三 gate 的独立读回

本报告初次冻结时完整格式verify/fresh build/test仍pending，原证据已留；收到Root执行完成消息后增加本节。capacity_schema没有执行heavy，只读JSON/raw exit/log、2835份source字节和实际DLL、TRX原件，轻量核验器实际child0。Root运行窗口分别为06:03:25–06:04:00、06:04:37–06:06:44、06:07:32–06:09:08 UTC。

| 实际 gate | raw child / 实际日志 | JSON SHA256 | log SHA256 |
| --- | --- | --- | --- |
| solution-format-03 | 0；verify-no-changes/no-restore；0formatted/1541 | `c7fa36ea9d69f219b52e7a559a44976cf1b0c78183800d676fca7749ae767489` | `19fa3e11caf6fc011917726e411087ff2e1f1dc59f0ae6eb87343306ca17a4f0` |
| solution-build-04 | 0；Release solution；0warning/0error | `b69b2c6467f3e590a005bba4450c547ff1df847bc6d390a387398c45e70676a0` | `396de937e734fa306e058b545a961d0ae7776b24ca5943b6eb24c3060522fbb8` |
| solution-test-03 | 0；Release/no-build/no-restore；1260pass/0fail/0skip | `94a55c8eb9d730bfd93f31f1e0d40c64d77900e357be24a9e6a3f1eacd571edc` | `a9e28086cd72b67acb7a854fc8ab314d605b0231547f1e34523ffda88ab05fdd` |

每gate `.exit`均确切0，JSON exitCode0，日志真实字节SHA均等于JSON logSha256，sourceDriftAtEnd均空。独立重算3份sourceAtStart各2835项为同一集合/同一SHA，2835份当前文件也逐SHA匹配。再将原1521份C#frozen映射到imports02后像（仅59条已审改变、其余原SHA），3gate与当前源全匹配：Client514、Runtime902、Engine105，Runtime/Engine零漂移。两处literal整文件继续为上文固定SHA，既有60profile/Roslyn值证明因此仍适用于实际执行源码；没有再次修改Client任何表达式。

独立解析12份完整TRX，不只信总日志：每份total=executed=passed、failed/notExecuted/error全0；1260个实际UnitTestResult全部Passed，12个不同test storage均定位到真实Release测试DLL。每个DLL实际SHA同时匹配build04与test03 assembliesAtEnd；不会把旧build DLL当fresh结果。Bot.Tests289项中，FoundationNativeHfsmIsolationTests六项与BotKernelConfigTests五项实际Passed，覆盖两处literal所在类的当前执行。

| 实际测试DLL/TRX分组 | total=pass |
| --- | ---: |
| Bot.Tests | 289 |
| Gameplay.Ecs.Tests | 352 |
| Gameplay.Gas.Tests | 28 |
| Gameplay.Input.Tests | 13 |
| Gameplay.Session.Tests | 262 |
| Log.Tests | 26 |
| Network.Connection.Tests | 167 |
| Network.Handshake.Tests | 10 |
| Sdk.Tests | 56 |
| Storage.Tests | 2 |
| ArchitectureTests | 44 |
| IntegrationTests | 11 |

actual Native path=`C:/Work/LumioGames/LumioGameEngine-101-release-freeze0e/.run/98f0b5cc59921aee988143d9c99b26ba/win-x64/run-lefheR/lumio_engine_native.dll`，3gate记录和当前DLL的SHA均=`d69b728b2b90954655bbad157f19e1e1000fcefc0183dd4f660576a410ea6806`，ABI=`c5f276c855bcb71fd9b04dcd546d1dd925ac408fd6303d56e30a2c044946a2f3`，testSupport=`hfsm-test-support`。实际build/test固定Engine freeze0e、Runtime successor-capacity、Client私有artifacts，单并发命令已在上述JSON保留；未重建Native。

新增轻量证据仍落原私有核验目录：`verify-final-gates.ps1` SHA=`e2c23c56681521e9251cc16d5f2d6b73f746883a850597e61ca339d593b2dd9a`；`final-gates-result.json` SHA=`a42c6e21a431e2763a51d82936e6244e8af693425f404b13801888ed08748f58`，保存三gate身份、12个实际TRX/DLL的逐项SHA和空Failures。其HeavyExecuted/OwningSourceWritten均false；actual child0只代表该只读核验执行。

## solution 外的三 gate 与官方 no-skip 门

Root已经补齐独立工程面，不从solution结果推断它们通过。三项实际命令JSON中的sourceAtStart各2835项与上节三gate完全相同，sourceDriftAtEnd均空，实际current源码也逐SHA对应。各raw exit文件和JSON均0，logSHA、Native实际SHA也逐项闭合；两个build日志均0warning/0error。

| 额外 gate | JSON SHA256 | log SHA256 |
| --- | --- | --- |
| spectator-build-01 | `a37a2c5135d62f4ea849dcd117824b931baf46400a8f6c42989aaa64cd52f78d` | `b1a74e82ba1fbceac6d2481b1be296e7ba7b2f026fcaa1aedf8211b7050e5043` |
| spectator-test-01 | `dc227a214ddaa68045a830bf691afd973c0f8f25fa18f2108e3dd6860a902bae` | `ef672208a5fd87b949b347aa8917a9bba271b92c2671de74cfee0886671def27` |
| browser-replica-build-01 | `b795972cdc59bfcbdf7348c6c909050d186d76f4435892b7f75f2de08bbb3c02` | `2697d7df69cdba060bd2c673af47a5db5995873f44842d84cefb5ada973d34aa` |

原件目录=`C:/Work/LumioGames/LumioGame/.run/client-extra-gates-20261003-01/`。Spectator的唯一TRX SHA=`4ba478952d56d2f5e740bb8915a92a53a6216a3a437a45dca33d3f70fdb0e0e4`，实际76个UnitTestResult全部Passed，total/executed/pass76、failed/notExecuted0。actual Spectator.Tests DLL SHA=`b08f38435260fbb0e9e1bb91ac445b5282f37d893fde0688dc1716da344b5ff1`，同时匹配build与test的assembliesAtEnd。Root随后持久化并真实重跑官方 `eng/assert-no-skipped-tests.mjs`，`spectator-no-skip-01.json` SHA=`27c73bb69024bee69dd21c2584331b3ae6fd893d3c78f15f7615e9f59a10cd50`，log SHA=`c48c3c871b18d048b5f1f50a01a47f9a973a763531b850f9ecd7ade427aab9fe`；raw0，日志确切1TRX/76Passed/0skip。此前口头tool输出不作为本独审的持久原件。

browserReplica的actual argv明确`-p:LumioBrowserReplica=true`且使用独立browser-replica/artifacts。实际ECS deps runtimeTarget为`.NETStandard,Version=v2.1/`，depsSHA=`d4a8a3fb9253fa30852afad8a582c356abb456a7329a79d40f2b7194a1422a07`。对该ECS release目录13个实际DLL用PEReader读取真正TargetFrameworkAttribute（核其constructor type及原blob），全部为`.NETStandard,Version=v2.1`，实际SHA都匹配该build的assembliesAtEnd。包括ECS、Client Log/Connection、Runtime Config/Coordination/Ecs/Gas/Hosting/Persistence/Primitives/Replication/Simulation和portable `Lumio.Engine.NativeLoader.Hfsm`；该闭包没有desktop `Lumio.Engine.NativeLoader.dll`。不能把名字含NativeLoader的portable Hfsm误判为desktop依赖。

只读核验器`verify-extra-and-scope.ps1` SHA=`79b2f62ad08989d4f3af56fe8bfb41b50d0f5ed0d194d142595f24d965f1d615`；实际child0；`extra-and-scope-result.json` SHA=`bb7f8ad042d7f13034adf2bff80837f23b8d44f9d9b0125993b16501ba239a0d`保存13 DLL元数据/SHA、Spectator TRX和三gate/Node原件身份，Failures为空。首版核验把460份私有.run/.sdd untracked错误归入source，实际child1和原result/script另留initial-private-classification原件；修的是核验分类，不改任何source或门，也没有把它当产品RED。

## Client 窄提交范围的逐路径核验

owning Client HEAD仍=`69b848f064ca44082f833894fd686eac0797cd24`，本审查未stage/commit/move refs。实际git status（包括all untracked）得到484项dirty tracked：483C#和1csproj。逐路径严格分类为：

- 5项既有correlation文件，全部byte/SHA仍等原freeze-01 after；它们的HEAD与原freeze before在EOL/BOM规范化后相等，原生产/测试独审仍适用。
- 479项机械C#格式/literal-preserve，逐项属于此前完整whitespace独审的479路径，当前byte与六gate的后像一致。逐一读取实际HEAD blob和format-input-01物理前像，除EOL/BOM规范化外源码字符完全相同，未混入其他更早body改动。59项imports和两个literal调用已另独审，追加后current identity也完全闭合。
- 非private untracked只有原correlation五份JSON；全部byte/SHA仍等原freeze-01 after。另460份`.run/`或`.sdd/`私有untracked逐项列在ExcludedPrivateUntracked，不属于上述源范围，不能stage。

原10文件的最终范围（5existing+5new）为：

1. `Client/Gameplay/ECS/src/Public/SuccessorAdmission.cs`
2. `Client/Gameplay/ECS/tests/Unit/SuccessorAdmissionTests.cs`
3. `Client/Gameplay/Session/tests/Unit/SuccessorWebSocketSessionTests.cs`
4. `Client/Tests/GameplayFixture/SuccessorFrameFixture.cs`
5. `Client/Gameplay/Session/tests/Lumio.Client.Gameplay.Session.Tests.csproj`
6. `Client/Gameplay/Session/tests/Fixtures/successor-correlation-collision/capture-manifest.json`
7. 同目录`initial-authorization.json`
8. 同目录`initial-welcome.json`
9. 同目录`observe-authorization.json`
10. 同目录`observe-welcome.json`

当前Session.Tests.csproj严格等原freeze after SHA=`9bb3fc1853c990e0ad372ef4245da7a0814eae8dfe1b9b710130945e537c6291`；保留的before和after均以`3c50726f6a65`(`<Proje`)开头而无BOM，没有额外未审csproj/BOM差异需要加入另一组。历史中间BOM修正不能被当成第11个待提交source变更。

可供Root精确两组本地窄提交的现成逐路径清单已保存于上文私有独审目录（只保存名单，本agent未stage）：

| 清单 | 路径数 | SHA256 |
| --- | ---: | --- |
| correlation-commit-paths.txt | 10 | `33097bfe9e57dd1cd090dfa0d6a1481bac3b09f2f34cb98e7695893ef56932dc` |
| mechanical-commit-paths.txt | 479 | `db6ff825519d6aefde91c94ea335e95b60b5895c21b1562e321832307e8cb1ed` |

两清单互斥、并集489个实际源路径，恰好覆盖484tracked+5非private new source；不含.run/.sdd、Runtime或Engine，也没有目录通配符。extra-and-scope-result.json逐项保存484source SHA和原10冻结SHA。这支持Root按这两组做Client本地窄提交；若stage后另有差异，须以新的实际清单核，不用此结论授权任何全部暂存。

未涵盖门仍明确保留：真实browser/WASM host运行、完整新的Release包组合、Game Remote/全局tour、production Native发行与线上验收。Node模型检查、netstandard编译不能代替真browser/WASM；测试专用hfsm-test-support映像不能算production Native发行。本审查不据Client通过宣布Goal101完成。
