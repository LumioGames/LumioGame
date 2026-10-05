# 私有 AOT attempt2 独立只读核验

结论：**BUILD_BLOCKED**。配置与原发布输入的狭窄审查一致；实际 `publish-browser.json` 退出码 **1**，九处 `IL2026` 在 C# 编译阶段拒绝。没有到达链接及 AOT，没有可接受的 AOT 发布物、体验结果或正式门关闭结论。本次只读，没有构建、测试、生产源码/包/私有作者稿写入。

报告证据位于 [aot-comparison08-02-independent-audit-01](C:/Work/LumioGames/LumioGame/.run/aot-comparison08-02-independent-audit-01/)，`verification.json` 记录精确输入、命令、诊断及未执行项；本报告与冻结输入由该目录 `manifest.json` 封存。

## 配置与依赖身份

私有入口根 `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/browser-experience-repair-01`：

| 输入 | SHA256 |
|---|---|
| `build-aot-comparison08-02.ps1` | `65934057432df01ce6e137fe53a1b8ccc25a7f45b9dda1bea33c134ae5581d47` |
| `aot-preserve-closure08.targets` | `7f10e660d77b52275f80d48ae77e1073ce9561ab8eef209cc0ae10a123734333` |

`aot-comparison08-build-02/selection.props` 导入原 `candidate08-build-01/release.props` 与上述私有 target。complete08 manifest 仍为 `98102e190ceec5fbe4beedcc0e3dbd6f9220d55db98a2c9174ebeeb4b06d2ffc`；实际命令明确引用 `candidate08-build-01/artifacts-browser/bin/Lumio.Bomber.Gameplay/Release_browser/`。游戏 DLL 为此前独审的 `56c2c6dffe9ee923ab1eedcb3e1262081d2eb99edb403781cdcaedc45c363431`。

脚本没有选择其他 Engine、重编浏览器 Game DLL、更改输入协议、DS Tick、额度或世界配置。执行模式只在隔离 publish 参数中改为 `RunAOTCompilation=true`、`PublishTrimmed=true`；另显式保留 `JsonSerializerIsReflectionEnabledByDefault=true`、`WasmStripILAfterAOT=false`、`SuppressTrimAnalysisWarnings=false`。原 Host source 的 `RunAOTCompilation=false`、`PublishTrimmed=false` 没有写改，source/project 当前字节与先前独审冻结值一致；本审没有接受 AOT 为新的产品默认。

检查脚本、实际 command 与 target，没有 `NoWarn`、`WarningsNotAsErrors`、关闭 trim analyzer、关闭 warnings-as-errors 或 `ILLinkTreatWarningsAsErrors` 的覆盖。Spectator 所属 `Directory.Build.props` 保持 `TreatWarningsAsErrors=true`。本机 SDK 有 AOT 必须 `PublishTrimmed=true` 的硬门，ILLink 对 `SuppressTrimAnalysisWarnings=true` 才加入 `--notrimwarn`；本命令显式 false，错误日志也实际保留诊断，没有通过消除诊断取得成功。

## 22 个程序集：静态配置与真实执行必须区分

target 的 expected set/count 是 **22 项且无重复**，与正常 candidate08 browser host 输出中全部 `Lumio.*.dll` 名称集合完全相同。独立重算正常 baseline 的 22 DLL：20 个 Engine Client/Runtime/Hfsm portable DLL 与正式 complete08 manifest 对应文件哈希相同；另两个为新 browser Gameplay 及已审 browser Host，哈希也与上一身份审计一致。这个集合包含 Hfsm，保留正常浏览器禁止 desktop NativeLoader 的边界。

target 设计在 `PrepareForILLink` 后、`_RunILLink` 前给既有 `ManagedAssemblyToLink` 的全部 `Lumio.*` 元数据设 `TrimMode=copy`，22 个 root 设 `RootMode=all`，验证缺失/额外/count，然后写 prelink SHA 证明。在 `_RunILLink` 后，将 source SHA 与 linked 文件逐项比较，缺文件或哈希不等会报错。

这些是**待执行的检查**。本次实际构建在 CoreCompile 已失败，独立遍历 attempt2 目录没有：

- `lumio-aot-comparison-closure-input.txt` 或 `...-linked.txt`；
- 私有新建 managed DLL；
- AOT browser publish `_framework`；
- 两个 `LUMIO_PRIVATE_AOT_CLOSURE`/`COPIED_INPUTS_VERIFIED` 成功消息。

因此本次 **22 个链接前后原字节相等验证为 NOT_RUN**。`GetFileHash` 返回 item metadata、转换路径的 `SourceFileHash` 关联、MSBuild 实际 batching 及 after-link 断言也尚未执行，不能根据源码设计宣称实际 join/count 已通过。未来若这些逻辑出现 metadata/batching 错误，属于构建工具配置失败，不是玩法行为 RED。也尚无 ILLink response file 来独立验证实际 22 个 `--action copy`/`root all` 已交给 linker。

本机 `Microsoft.NET.ILLink.targets` 中的实际扩展点、`ManagedAssemblyToLink` 数据流和 `IntermediateLinkDir` 处理已只读核对；SDK 与 target 输入作为证据保存。完整 BCL trimming、泛型/JSON/互操作兼容性及 AOT 实际运行仍没有证明。

## 真实失败记录

本次运行时间 `2026-10-03T17:46:01.9062996Z` → `17:46:09.8725791Z`。完整日志 SHA256 为 `c70f78895d8df139a52ced4480f654655bba3b29d7708f7762cc354595db9004`，与步骤 JSON 声明相同。九条诊断都是 `error IL2026`，针对 `JsonSerializer.Serialize<TValue>(TValue, JsonSerializerOptions)` 的 `RequiresUnreferencedCodeAttribute`：

| source 相对 `Client/UI/Spectator/` | 行:列 |
|---|---|
| `PresentationDump.cs` | `23:47`、`24:67`、`28:35`、`139:16` |
| `SpectatorReplicaHost.cs` | `117:37`、`146:16` |
| `SpectatorDump.cs` | `202:16`、`322:21` |
| `host/Program.cs` | `102:59` |

这些诊断指出匿名/反射 JSON 序列化的类型不能由裁剪分析静态完整判定。私有 target 尚未到其执行阶段，planned `copy/root all` 不能消除或冒充这些真实 compiler 错误已经解决。本审没有改源码、加压制或降低当前检查。

该失败是实际 **编译拒绝**，没有行为测试运行，不能标为 TDD 的功能 RED。更不能把上一解释器构建 raw0 或现在脚本本身可读当作此 AOT 构建通过。

## 后续验收范围

如继续使用新的私有稿，须保留 attempt2 和本证据，不覆盖原失败。需要实际成功构建、完整 22 输入/链接后 SHA 与最终 closure 身份、未弱化的诊断、两个真实玩家在同官方08及同游戏输入下的性能/功能对照，才能讨论 AOT 的产品采用。当前 Root 仍负责正式体验验收，本报告没有关闭 Tick、移动、同步、十次关闭重进或发布身份门。
