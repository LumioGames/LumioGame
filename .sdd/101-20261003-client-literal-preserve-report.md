# Client 两处 raw JSON 字节保留 — 作者交回

按 Root 明确授权，仅修改 owning `C:/Work/LumioGames/LumioClient-101-successor-correlation` 的两个测试文件，每处各插入一次 `.ReplaceLineEndings("\r\n")`，使传给 File.WriteAllText 的 JSON 字符串保持 format-input-01 实际前像字节。不修改原 raw literal、断言、预算值、formatter、其他 source、index 或 refs；未运行 build/test/format/GEN/Native/Rust/pip。本报告是作者验证，后续独审必须由另一个 agent 完成；此前独立格式语义报告保留原结论，不回抹。

## 原值核实与最终身份

先使用现成 Roslyn4.14、定义 LUMIO_NATIVE_LOADER，从 Root `format-input-01/client/` 原件读 Token.ValueText。两处均正好八个 CRLF，无 bareLF、bareCR；值未混合。再解析新AST确认转换是原raw literal上的实例调用、唯一参数的ValueText为确切CRLF、结果作为File.WriteAllText第二实参；用当前.NET真实 String.ReplaceLineEndings 方法计算，得到与原值完全相等的UTF8字节。

| 文件 | format前原值SHA = 新表达式实际值SHA | 新文件SHA256 |
| --- | --- | --- |
| [FoundationNativeHfsmIsolationTests.cs:92](C:/Work/LumioGames/LumioClient-101-successor-correlation/Bot/Tests/Unit/FoundationNativeHfsmIsolationTests.cs:92) | `b7d310374e7cf19a0e7544861304240feb2c370396549c7a7b71a659723cf469` | `1d8ad0ea00951c8b401c0bc15f5357e3897685f2f96ce141c4fbf72838eae66e` |
| [BotKernelConfigTests.cs:30](C:/Work/LumioGames/LumioClient-101-successor-correlation/Tools/Tests/BotKernelConfigTests.cs:30) | `f40b3e071fd7a8a40f089d53f4108083e100f718e3c65bd1f2473ed132bf4ccd` | `d78afaca4178d74014e94b8fa1c2c59bc5352a1b09730f53d487027b8ab22673` |

完整source文本比较证明各文件只在原token终点插入27字符转换表达式，raw Text/ValueText本身与formatter后的原件相等、全部assert保持原字节。修前保存2834个tracked/fixture输入身份，最终仅以上两文件漂移，其他2832逐SHA相等。第一次文件级验证发现工具额外去掉Tools文件末尾空白行，立即按私有前像精确恢复该LF；最终差异只剩两个表达式插入，不把初次失败当通过。

小diff：

```diff
--- Bot/Tests/Unit/FoundationNativeHfsmIsolationTests.cs
+++ Bot/Tests/Unit/FoundationNativeHfsmIsolationTests.cs
@@ -92 +92 @@
-            """);
+            """.ReplaceLineEndings("\r\n"));
--- Tools/Tests/BotKernelConfigTests.cs
+++ Tools/Tests/BotKernelConfigTests.cs
@@ -30 +30 @@
-            """);
+            """.ReplaceLineEndings("\r\n"));
```

证据位于 Root `.run/client-literal-preserve-01/`，有真实修前/修后完整二文件、source-before.json、只读 PowerShell/Roslyn verifier 和小patch。最终verifier真实 child0：

- `verify.ps1` SHA256 `17e4b69809be0aec53f13367875dd76f1e3acea1897d247cd6945d72c708a084`。
- `proof.json` SHA256 `a5f83866754de2766c9532a2ac3cb833e6726ea9fe1de2cd7b08d16fe3a213f8`，载各literal原值/计算值SHA、无混合EOL、源码两路径范围与全部断言不变。
- `literal-fix.patch` SHA256 `f319e4daa8afad42d474ef78ca5509fe40443c2bef21afc9c060f079fa8621d7`。两次git no-index diff子退出均1（真实存在差异的正常语义），不是build/test结果。

这证明计算出的File.WriteAllText字符串字节保持原值，不是编译后测试执行证据。Root统一完成新格式verify、freshbuild/test，不能将旧1260结果直接改记为新表达式已跑；独审者应另查此两源和实际后续日志。

## 官方CI额外 spectator / browserReplica 入口

只读实际 `.github/workflows/dotnet-test.yml`，SHA256 `c5c74579307b7536538df25373c11e31f6d32ea9a493b1b1ae76c913ff7730f3`。CI build job在solution编译后还有以下两个**额外构建**；Spectator未登记在LumioClient.slnx，当前solution十二TRX不代表它执行过。

从owning Client根运行的官方原argv：

```text
dotnet build Client/UI/Spectator/tests/Lumio.Client.Spectator.Tests.csproj -c Release
dotnet build Client/Gameplay/ECS/src/Lumio.Client.Gameplay.ECS.csproj -c Release -p:LumioBrowserReplica=true
```

第一条把Spectator `src/Lumio.Client.Spectator.csproj`（netstandard2.1）及其独立tests（net10.0）实际编译。Spectator/Directory.Build.props停止repo-root属性上行，明确非生产、C#14、非CPM、RestorePackagesWithLockFile=false；不能将solution默认restore状态假定也适用这里。第二条设置真实browser开关，ECS自身为netstandard2.1，Runtime Coordination/Gas/Hosting/Ecs/Replication/Simulation ProjectReference由SetTargetFramework固定netstandard2.1，避免desktop NativeLoader进入browser依赖闭包，不要求WASM workload。

本地Root重现必须保留实际环境路径：`LumioRuntimeRoot=C:/Work/LumioGames/LumioGameRuntime-101-successor-capacity`、`LumioArchRoot/LUMIO_ENGINE_ROOT/LUMIO_ENGINE_SDK_ROOT=C:/Work/LumioGames/LumioGameEngine-101-release-freeze0e`、`LUMIO_CONTRACT_REQUIRED=1`。可追加Root已有隔离ArtifactsPath、单进程/no-incremental等参数并记录完整真实argv，不改冻结Engine的Directory文件。CI在自己的fresh checkout中隔离Engine CPM/props，是环境准备，不授权改本地冻结来源。

CI现行test/test-windows只执行solution `dotnet test LumioClient.slnx ...`，并不额外执行Spectator csproj。若本次需要该独立测试面闭环，Root另明确运行实际工程（这是推荐补证，不能声称它已经由CI test job跑到）：

```text
dotnet test Client/UI/Spectator/tests/Lumio.Client.Spectator.Tests.csproj -c Release --nologo --logger "console;verbosity=detailed" --logger trx --results-directory <新的私有Spectator证据目录>
node eng/assert-no-skipped-tests.mjs <该实际TRX目录>
```

实际Native需要时继续使用Root已核hfsm-test-support映像与sidecar身份，不产生/替换production Native。不应在尚未完成对应restore/build时机械加--no-build/--no-restore。

两个CI test job的Web入口准确相同，solution成败不遮蔽这一档（always，无continue-on-error）：

```text
node eng/generate-ds-close-codes.mjs --check
node eng/generate-not-serving-retry.mjs --check
node eng/sync-voxel-world-generated.mjs --check
node --test eng/refresh-checkout.test.mjs eng/ds-close-contract.test.mjs eng/assert-no-skipped-tests.test.mjs Client/UI/Spectator/connect-ds.test.mjs Client/UI/Spectator/voxel-grid.test.mjs Client/UI/Spectator/dev-hot-reload.test.mjs Client/RHI/*.test.mjs Client/Render/*.test.mjs Client/Assets/*.test.mjs
```

上述都是待执行入口，本任务未执行。另有 `Client/UI/Spectator/browser/tests/host/Lumio.Client.Spectator.Browser.Tests.Host.csproj` 和 `eng/run-browser-tests.mjs <wwwroot> <evidence.json> [mode]`；前者是真WASM host，要求已构建portable EngineWasmManagedDir且禁止desktop NativeLoader，后者要求显式 LUMIO_PLAYWRIGHT_MODULE/LUMIO_CHROMIUM_PATH。当前CI没有调用它们，不能把netstandard build或Node模型测试当作真实browser/WASM跑测。完整新包、游戏页、浏览器实跑仍另属Root闭环。
