# Diagnostic09身份独立审核

裁决：**ACCEPT_PRIVATE_DIAGNOSTIC_IDENTITY_ONLY**。诊断09完整包、正常Game消费和v4测量副本的身份核验通过。此包仅用于私有性能定位，不能作为正式发布候选、性能修复或浏览器体验验收。

审核只读生产、冻结源码与产物；没有改源码、替换DLL、启动服务、重构建或运行广泛测试。独立证据：`C:/Work/LumioGames/LumioGame/.run/candidate09-diagnostic-identity-audit-01`，最终记录为`input-verification.json`、`package-verification-final.json`、`game-verification-final.json`和`end-fence.json`。

## 完整包与来源

完整包目录：`games/101-bomber/.run/20261004-browser-experience/complete-release-09-diagnostic`。manifest SHA256：`6de6e91240457ed90ed7edcc0140bedb41724fabeaa5d9c93faa8ca3c78ba29b`。manifest的305个payload文件全部逐项匹配；磁盘没有额外文件（manifest自身除外）。官方完整builder原始退出记录0，result.manifest与实际manifest一致。

Runtime冻结树是`.101-pack07/LumioGameRuntime09Diagnostic`，clean提交`0053ea4d2b9b9743f2871156e725e13a842e0d6a`；相对Runtime08 `d8ae3da3793d5d95785606be319668a4318af85a`仅已独审的四文件，其当前SHA依次为：

- WorldManager.cs：`263266deec76053d3675d666338f56ea8d794a39afc33f8847595984e9bfaedf`
- WorldManager.JointPrediction.cs：`2198212eecd67fbb08b5687412a47e989ef7a56be3aaf7c40333d55cd1897d47`
- GasJointPrediction.Selective.cs：`7f4c1cb28e80db1e776226fc6e2542d35dbc977638c22754c1bda21fbd4c2611`
- BrowserTickCostProbe.cs：`03275a7fab3806e4820a83ee073955dad4857288c814e83b29296988417ff3f1`

其他七仓root/commit与08输入完全相同且clean：Engine `0e2fc747…`、NativeCore `81b2501a…`、Voxel `2ba61e43…`、Server `15418fc1…`、Client `a6071a2a…`、Platform `3a2ef1a7…`、Config `a991a517…`。Config artifact和baseVersion没有变化。输入链接到精确独审报告SHA `59ca4f580c7ef9439d270b8a08bd8504f1abf3238e561ff2cfe5f9b4648a6ddb`。

实际builder经同一`pack-reviewed-composition.mjs`调用冻结Engine的官方`packFromMain/defaultBuilders.sdk`，没有局部DLL导入。版本文本仍是`0.0.5-main.0e2fc74`，诊断身份依赖不同目录、Runtime source commit及精确manifest hash，不能仅用版本文本判断与08相同。SDK最终archive的SHA512与sdk-identity一致；`payloadSha256`按官方工具定义来自neutral版本包，不能与最后explicit版本archive的SHA256混同。

## 真实托管域与PDB限制

直接读取PE/CLI metadata和ECS `BrowserTickCostProbe.Begin`实际IL，没有加载或运行这些程序集：

| 域 | ECS SHA256 | 实际TFM/Begin |
|---|---|---|
| Server SDK/Managed | `04b901dc610906374c4ccce2e11dfa933c9647ce73df0d4892d79d7333006cab` | net10；精确default-Scope-only IL，无调用 |
| Bot | `586ea3c8576da824b642d8610f44c790da0531364e840735ed484abdbe7759f4` | net10；精确default-Scope-only IL，无调用 |
| Browser replica | `9ed47eb84270e5bc868b2cbe2d958762b637a8f689206de17b3a2509be7a1a4a` | netstandard2.1；编译为启用probe路径 |

GAS各实际域TFM同样核对，hash见机器证据。Server/Bot的Begin为no-op；之前独审已说明capture循环额外local计数仍有开销，因此不宣称整个诊断差分在net10机器指令层面无开销。

官方SDK和Bot/browser采用不同managed identity及Description构建属性，DLL可以不同。`pack-release.mjs:360–425`明确为Bot补构net10并协调摊平输出；browser `defaultReplica`固定managed compatibility 0.1和空Description。不能要求三个域与SDK DLL全体字节相等。Server SDK DLL及SDK lib对应档与冻结Runtime实际SDK构建DLL字节相同；各最终域通过官方构建链、精确manifest和实际TFM/probe IL绑定。

官方工具固定`--no-incremental`、PathMap、`DebugType=none`、`DebugSymbols=false`，禁止携带PDB。Runtime的PE仍可有deterministic Reproducible debug type16；ECS实际没有CodeView type2/EmbeddedPortablePDB type17。没有Runtime source↔PDB Document checksum证明，审查没有借用局部编译PDB冒充官方产物。这里的Runtime来源证明强度是clean exact source/官方builder输入与退出/manifest及实际域IL闭包，不是独立源码重编译证明。

## Game正常消费与发布

`candidate09-diagnostic-build-01`的server、client、browser构建及browser publish四步JSON退出0；各JSON固定manifest6de6…，实际log SHA与记录一致。四步输出0 warnings/0 errors。独审没有重复执行这些步骤。

| 本轮文件 | SHA256 |
|---|---|
| server Gameplay | `306730e729125a474dc5be33e14909a6526e3e765ce1f59f69060b52c630427a` |
| client Gameplay | `8fae75f726fd61851df107540363ea5bb350a50a0dd7893bea419f4a9215a572` |
| Bot | `8f2eca716e38cf9e35dda943d296a4897cbfc7bfd7d36a611ce2651a4ee17434` |
| browser Gameplay | `136d7448e9a59b66181aafa67fcc431148881c242e93bc517f222074bfdb11b5` |
| browser Host | `46b4825e012103690cfddd86f5040e20726d67a0e116554ee0214bacd5677529` |

release.props选诊断09；startup及实际live09 CLR配置选新server Gameplay。Game Host的实际portable PDB与DLL CodeView GUID一致；`SpectatorDump.cs` Document checksum精确为已审`599609920469e0ba2eec906ba7425c678d6b128556cb6a548f2fefaf18ae25c9`。

发布Host目录的22个Lumio程序集逐份与完整09 web闭包或本轮Game/Host DLL字节一致；每份完整CLI metadata又在相应published WebCIL中逐字找到。此证明包含实际assembly/module identity，但不声称独立重建所有IL转换语义。实际发布ECS仍是启用诊断的netstandard2.1档。

## 测量副本及保护集合

official publish和`measured09-diagnostic-wwwroot`均835条相对路径，无缺失/额外文件。仅main.js不同，834个非main文件逐字节相同。官方main精确为已审`25765c149ee6f2f51e12ce2a26f0884506a691688b8e217a63e938067f170f3c`；测量main为已审`3d16f749d8cebc5c20351b659f0e1b098ab49442941a484e480f3df230d07a25`，并与08d测量main字节相同。v4 generator仍是`76ea337dd8c4c757621027a6b4d7f68044a356bb55b103f9c231e4455dd4f466`，实际syntax记录0。没有再丢失attached engine属性。

53 author+44 generated pins共97项全部与已审pin一致；110项生成物/lock保护集合全部与前序冻结证据一致。当前pin模块`aa880ac3…`保持。这里只做hash漂移核查，没有运行广泛测试或重新打开schema门。

实际只读观察到live09 DS PID34684，进程可执行路径为本完整09 `server/win-x64/lumio-ds.exe`，命令引用live09的server.boot-1.json；启动脚本没有`--ds-exe`替代。具体进程/CLR file hash及末端核查见独立证据。该观察不证明Tick、联机输入或重进体验。

## 保留的审核纠正与未闭合事项

首次package验证把neutral payload hash当最终archive hash、要求不同官方managed域DLL相同，并把任何debug directory当作PDB；首次Game验证把JSON正斜杠与path.join反斜杠字符串直接比较。原REFUSE记录完整保留，随后读取官方构建代码、实际SHA512、实际IL/debug类型和绝对路径后纠正；没有改产品或旧证据来“通过”。最终记录与报告对应这些修正。

Platform仍签`bomber-0.0.4-main.ecece8a`，发布身份差异没有闭合。诊断09和v4都具有测量成本、窗口/线程限制；本审核不证明任何节省毫秒、运动同步、十次关闭重进或双人同房移动放弹通过。后续正式候选必须去除诊断差分，并完成独立审核及用户要求的真实浏览器验收。
