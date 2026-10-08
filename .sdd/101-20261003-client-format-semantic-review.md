# Client 全 formatter 独立语义审查

审查时点：2026-10-03 05:29 UTC 左右。结论：**严格 token/字面量不变门有两处未通过，不能将479文件统称为语义不变的 whitespace。** correlation 原十个交回文件保持逐字节一致，其既有 spec/quality 裁定不变；Runtime、Engine 没有本 formatter 引入的 tracked source 越界变化。

仅运行 PowerShell 和只读 git、加载现成 Roslyn4.14；未编译、format、test、Native、Rust、pip、暂存、提交或修改任何 owning source。新增本报告和 Root `.run/client-format-semantic-review-01/` 的只读核验脚本/结果。读取 Client core/nav、code-style、repository-architecture、.gitattributes/.editorconfig及此前 correlation 独审。没有运行 Add-Type 或编译另一个 verifier。

## 精确输入与核验方法

- Client owning HEAD `69b848f064ca44082f833894fd686eac0797cd24`，Runtime owning HEAD `23356eafc365c753b6e8d9987fd069815ff067ce`，Engine freeze0e HEAD `0e2fc74783f9f186d59909b38d4ee70887a21137`；没有移动 refs。
- Root 前像 `.run/client-correlation-full-20261003/format-input-01/manifest.json` SHA256 `fbc86bf36ebba6a0d5711dddfc8f67bf7adca4593ba275be89522795ee35b0e2`。1520 C# 全部原件 SHA 独立复算匹配：Client514、Runtime901、Engine105。
- Root formatter `.run/client-correlation-full-20261003/solution-format-fix-01.json` SHA256 `7f5f49372de0bb535da03d09d9eab8bcae3083281d75977f814b11a03207b435`，实际 argv `dotnet format whitespace LumioClient.slnx --no-restore --verbosity diagnostic`、child0；原 verify01 child2、17 WHITESPACE 诊断、drift0，原件保留。formatter的479 drift是从 sourceAtStart 过滤出的**前像 SHA**，不是 afterSHA。
- 核验加载 Client `.run/correlation-full-20261003/artifacts/bin/Lumio.Tools.GenDeclarations/debug/Microsoft.CodeAnalysis.dll`（4.14.0.0，SHA256 `395736b2d0e02be77bedc3847b269da7a93bf8e49cd3431a4a8e68d2c52d5846`）及 Microsoft.CodeAnalysis.CSharp.dll（4.14.0.0，SHA256 `53302acca07700e9bb10dcf21034435d6e0454c8eebf2481164ec13e520004c9`）。PowerShell reflection选择 SyntaxTree.GetRoot 明确重载；没有 dotnet 进程。
- 每个changed文件比较 ordered token RawKind、Text、ValueText，均不正规化字符串内 EOL；指令结构 token、IsActive 单独比较，disabled/skipped/unknown trivia除CRLF正规化外保持精确；注释只准空白不同。实际inactive代码的15块集中于10文件，唯一涉及的条件符号为 LUMIO_NATIVE_LOADER，分别在未定义和已定义两个profile复核全部479文件，覆盖正反分支；不是只看默认未定义的支路。
- 实际完整2834个 formatter sourceAtStart tracked/fixture输入再逐hash比较，正好479个 Client路径漂移，Runtime/Engine漂移均0；没有依靠 git忽略空白来断言字面量安全。

| 比较结果 | 数量 |
| --- | ---: |
| 原件已验证 | 1520 |
| 物理未变 | 1041 |
| changed，仅Client | 479 |
| 文件物理只含CRLF→LF | 474 |
| EOL以外仍只含合法排版空白 | 5 |
| 两profile下 token Text/ValueText 均精确不变 | 477 |
| 指令/受保护trivia比较失败 | 0 |
| multiline raw literal值发生变化 | 2 |

474个“物理只含EOL”包括下面两项字面量变化；不能把 pureEol 标志等同于 token/运行时字节不变。

## 两处 actionable finding

**[P2] 多行raw JSON里的EOL也是字符串值，当前“不得改字面量”范围未闭合。**

1. [FoundationNativeHfsmIsolationTests.cs:82](C:/Work/LumioGames/LumioClient-101-successor-correlation/Bot/Tests/Unit/FoundationNativeHfsmIsolationTests.cs:82)，raw literal截至92行。文件 beforeSHA `be98d3a8714977a8da6f1933a91cfc36d6d8c72376dc2c1cab3b5ac92e19cf50`，afterSHA `22d5bb1f43ce2be4eaed085c72983536479310680df800eff5628531e242339b`。Roslyn multiline raw token Text长313→303，ValueText长183→175；值UTF8 SHA `b7d310374e7cf19a0e7544861304240feb2c370396549c7a7b71a659723cf469` → `9a47ffe5e648f52be0f1c8b473e69ad8b33d80a0545bdd88b805f113ef465a58`。
2. [BotKernelConfigTests.cs:20](C:/Work/LumioGames/LumioClient-101-successor-correlation/Tools/Tests/BotKernelConfigTests.cs:20)，raw literal截至30行，处于 `#if LUMIO_NATIVE_LOADER`。Text长311→301，ValueText长181→173；值UTF8 SHA `f40b3e071fd7a8a40f089d53f4108083e100f718e3c65bd1f2473ed132bf4ccd` → `1de78379e32b4b631dd54c9fab8b5a63b9268006562773a2d357697fff5384f4`。默认symbol解析会漏掉此值变化，已定义符号后真实检出。

两处 File.WriteAllText 将写出不同字节。独立用已加载.NET JsonDocument解析前后值，两段均是合法JSON，七个键与对应数值逐项完全相同；没有字段/预算值变化。两个文件当前均无相对 Git HEAD 的内容hunk，LF回到提交本来表示的形式，但与已build/test的物理前像仍不同。这是fixture字节与验证身份的事实，不声称发现实际Native业务错误。

最小关闭路径：若保持本任务严格“strings/raw literal不改”范围，Root先保留或恢复前像 literal值，再核实际formatter能否接受；不能由审查者扩大范围或忽略 Token.ValueText。若Root依据既有授权明确接受两份测试JSON的canonical LF，则须将这两处列为明确fixture字节变化并补新物理身份的format verify、fresh build/test闭环，之后可单独作限定acceptance；不能倒写原1260已有结果覆盖新值。本审查没有选择或实施任何源码修法。

## 五处非EOL排版和Git实际差异

下面五个文件 token Text/ValueText、指令与其余非空白trivia一致；已读实际diff：

- `Client/Gameplay/ECS/tests/Unit/ReplicaOwnedCandidateTests.cs`：对象初始化器布局。
- `Client/Gameplay/Session/tests/Fault/AuthorityCommitRegressionTests.cs`：行尾空白。
- `Client/Gameplay/Session/tests/Unit/SessionDeadlineAndDiagnosticsTests.cs`：行尾空白。
- `Client/Network/Connection/tests/Transport/LinkDiagnosticsHarness.cs`：Thread对象初始化器换行。
- `Client/Tests/NativeHfsm/NativeHfsmTestContext.cs`：既有budget成员分行，全部数值不变。

Git实际有内容hunk的11个tracked路径 = 原correlation五个existing路径 + 上述五个排版路径 + `Client/Gameplay/ECS/src/Internal/ReplicaStageLedger.cs` 的 UTF8 BOM移除。BOM项在本formatter的冻结前像中已经与当前一致，并非本次479增量；差异只有首行BOM，源码token无新声明/调用。`git diff --ignore-all-space --numstat`仍显示9路径，因为新行布局/BOM会出现在diff计数，不可仅用ignore-space统计推断代码语义。

原correlation真正生产diff仍只有 SuccessorAdmission 的 `next.CorrelationId == current.CorrelationId` 额外拒绝项删除，complete previous/sequence/完整绑定/eligibility revision等clauses均同此前独审。没有formatter引入的production clause更改。

## 原十文件和已有全量证据范围

owning `.run/successor-correlation/freeze-01/manifest.json` SHA256 `c7e23b9915b52ce817481b5e49889fdc377cdfcf31cfb1e0b274a6e931275ddf` 中十个 after原件独立核hash，当前十个文件 **10/10物理byte与SHA相等**，包括四C#、一csproj、五JSON fixture。精确结果 `.run/client-format-semantic-review-01/original-correlation-ten.json`，不把 normalLF 相同冒充此处的物理相同：

| 原C# / 工程 | 当前SHA256（仍等于freeze after） |
| --- | --- |
| SuccessorAdmission.cs | `d71f0bf4499f2d43ced08d2215d9231ae8c3c132be312ee18aaa8fea1380a1b1` |
| SuccessorAdmissionTests.cs | `64bcdeb0ebc286c98d1e0081320c344bc1b3ed5abe30a580eed4578f3241e800` |
| SuccessorWebSocketSessionTests.cs | `8679ec3e333ebbddee5502f4d58d59ab5ed4f0a91832e1834c0d3e7a49cbb78e` |
| SuccessorFrameFixture.cs | `242cbbc13b4004db3c4da846e29dd5bdd703963cb323390517c21355ad21845d` |
| Session.Tests.csproj | `9bb3fc1853c990e0ad372ef4245da7a0814eae8dfe1b9b710130945e537c6291` |

Root build03日志真实0warning/0error、JSON child0/drift0；Tests02十二TRX各读取 counters，合计1260/1260，failed0/notExecuted0，JSON child0/drift0。这些是**format前**全Client实际输入的证据，不是现在479文件新物理身份的freshbuild/test。Native是测试专用 `d69b728b2b90954655bbad157f19e1e1000fcefc0183dd4f660576a410ea6806`，BuildId98f0b5cc.../hfsm-test-support，不进入production发行身份。

| 执行原件 | SHA256 |
| --- | --- |
| solution-build-03.json | `84eaaecc64cb1296c31f69fd257b1b8410295568c002cd75ee0808a77500989a` |
| solution-tests-02.json | `59f96fcd04b434703c883d50c6f47b792039a1299e026b8c6d505d0a9ba9883e` |
| solution-format-01.json | `c446e993d18e1702d7f5bb343442c40ef4f84fce29dfb67c1a419170a255992f` |
| 独立12TRX counts归档 | `45e29ef84d83198a9ced8d840328e3c7a83228f7742d97ab90d2fcf869bec24b` |

## 独立核验可追溯性

Root私有证据目录 `.run/client-format-semantic-review-01/`：

- `verify.ps1` SHA256 `3059ecad14bed356d9ce0b7b877993c2bed1a0383735a79f12271244f4252642`；实际PowerShell调用仅加载现成程序集，默认profile和 `-Profile native-loader -ResultName result-native-loader.json` 两次最终比较 child1，真实未通过原因分别为1/2个raw string值变化。
- `result.json`（默认profile）SHA256 `2e8440a980702025c4187dde7eff3c032041d2e78f25e62b17724c2797e3de26`；`result-native-loader.json` SHA256 `8faf1bb984435d6195294f25f62d982d316308bc5ee63b427e2fa2612cf546df`。每个changed路径记录前后source/token/protected hash、raw一致性、前像drift SHA匹配，479集合精确对应Root记录。
- `literal-differences.json` SHA256 `a517b17d5e355cc79aa71a5eb6aa664b8a7e0af1f597ebf5caefa04a50584216`，含两个token位置/长度/值hash与JSON七字段相同。
- `original-correlation-ten.json` SHA256 `68b4a07472d5322f18957491919a0f47810c886af8abe480b715176a1bdbe233`。

第一次核验把runner漂移记录误当afterSHA导致479 identity不匹配，结果原件保存在 `result-initial-record-sha-interpretation.json`；回读runner明确它保存sourceAtStart后已修正，仅留真实字面量finding。最早GetRoot重载探针也真实失败后选明确reflection方法，未当业务RED。没有据工具退出码名称猜验收结果。

本报告不裁定全format verify已绿、fresh build/test已完成、CI或production包已通过。Root随后实际闭环应关联新的物理sourceHash与全量执行结果；此前原whole1260及独审correlation原件均保留，不回抹。
