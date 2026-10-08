# Server-side tests

ADR-115 决策 1：游戏侧 `Server/` **只放数据，不含源码工程**。所以本目录只有用例
源码，`.csproj` 在 `Tools/` 下：

| 用例源码 | 工程文件 | 进哪条命令 |
|---|---|---|
| [`Gameplay/`](Gameplay/) | [`Tools/Lumio.Bomber.Gameplay.Tests`](../../Tools/Lumio.Bomber.Gameplay.Tests/) | `dotnet test LumioBomber.slnx` |
| [`Host/`](Host/) | [`Tools/Lumio.Bomber.Server.HostTests`](../../Tools/Lumio.Bomber.Server.HostTests/) | `node Tools/test-server-host.mjs <results-dir>` |

## `Gameplay/`

玩法用例。它们编译并驱动 **服务端侧** 的 Gameplay 构建（`LumioEcsSide` 默认
`server`），所以落在 Server 端。工程离仓根仍是两级，用例里
`AppContext.BaseDirectory` 上溯五级得到仓根的算法不变。

## `Host/`

从 LumioServer 移来的两条准入/落生用例（ADR-115 §3 / R-00692，上游 R-00687 交出）：
`AdmitOnBomberRegistryRuntimeOnly` 与 `AdmitOnBomberRegistryWithVoxel`。
它们守的是**引擎**的保证，不是玩法的——防御性拷贝的 catalog 字节、坏 voxel 半边
被拒且 `Manager` 身份不变、restore 后 `IngressBudget` 身份保持而 `Manager` 换新、
`ActivationContextFactory` 的三条答案、`runtime-only` 快照不带 `voxelBase64`、
`Physics` 随 voxel 模式有无。

`Lumio.Server.HostEntry` 是**进程级单例托管上下文**：两个 registry 同进程会互相
污染。所以这两条各自独立进程跑，清单在
[`Tools/test-server-host.mjs`](../../Tools/test-server-host.mjs)（口径抄自
LumioServer `Tools/test-host-entry.mjs` 的 `isolatedCases`）。

本工程**不在 `LumioBomber.slnx` 里**：它驱动发布物里的 HostEntry，和 `Client/Bots`
需要发布物里的 Bot.Host 同理；`dotnet test LumioBomber.slnx` 的用例集不因它变化。游戏工作区
不对 LumioServer 取编译期引用，HostEntry 全程经反射调用。引擎一半只来自子模块 `Engine/`
（ADR-123）：`Engine/server/<rid>/Application/Lumio.Server.HostEntry.dll`（就是
`Server/Config/Startup/server.json` 里 `clr.entry_type` 点名的那一个）、`SDK/Managed/` 的
Runtime 三路径，由 [`EngineRelease.cs`](EngineRelease.cs) 统一定位，没有变量能指到别处。

游戏侧输入是「点名的新鲜输入」，缺任何一个都按名字报错，不跳过：

| 变量 | 是什么 |
|---|---|
| `LUMIO_BOMBER_GAMEPLAY_DLL` | 本次构建的 `Lumio.Bomber.Gameplay.dll`（服务端侧，对着 `Engine/sdk` 的 SDK 编） |
| `LUMIO_CONFIG_DIR` | `Server/Config/Tables`（服务端那一份分端导出） |
| `LUMIO_TEST_VOXEL_FIXTURE_DIR` | 本仓在发布物 native 上自己造的 catalog world（`Gameplay/CatalogWorld.cs`，`--voxel-fixture` 给目录），须与发布物 native 同源 |

这三个值由 [`Tools/prepare-server-host-inputs.mjs`](../../Tools/prepare-server-host-inputs.mjs)
核对并点名，本机与 CI 走同一个入口。缺任何一个都是 `MISSING_INPUT: <名字>`：
按 ADR-113 决策 2，缺产物是失败，不是 skip，也不再报 `BLOCKED_ENV`。

`Server/Tests/Gameplay/` 里要 native 的用例（GAS 移动扫掠、冷恢复）同样经 `EngineRelease.cs`
取发布物 native：它的模块初始化器在任何用例之前把 `LUMIO_ENGINE_NATIVE_PATH` 指到
`Engine/server/<rid>/SDK/Native/<rid>/`（`<rid>` 是 .NET 的 `RuntimeInformation.RuntimeIdentifier`），
Runtime 的空间索引、GAS hfsm 与 Tick 时钟因此和直接装载的用例用同一份 native；缺了是
`ENGINE_RELEASE_INPUT_MISSING` 失败。冷恢复的墙景（catalog world）由 `Gameplay/CatalogWorld.cs`
在同一份 native 上从本仓底图现造，不取任何引擎夹具（ADR-117）。

## 在 CI 的哪里跑（R-00702）

R-00692 把这两条接了进来并实跑通过，但没进任何流水线——八项引擎级断言只在一台机器上
被跑过一次。现在它们在 [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
的 `server-host` 作业里：检出时带上 `Engine/` 子模块，对着它构建服务端侧 Gameplay，核对发布物
输入，然后逐条独立进程跑这两条，并 grep 断言 `HOST_SUITE cases=2 total=2 passed=2 failed=0 skipped=0`。
不检出任何私有仓，也不再现编 HostEntry（ADR-123）；voxel fixture 由本仓 `CatalogWorldTests` 在发布物 native 上现造（R-00785）。

触发面按 ADR-113 决策 6：`push` 到 main 与每日作业，PR 不跑（ADR-088 不给 PR 设必绿门）。
跳过计数为 0 是决策 1 的度量口径，所以断言的是那一行而不是退出码。

