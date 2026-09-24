---
name: testing
description: 测试与验收——测试分层政策、TDD 时机、验收 DoD 与验证证据;实现功能/修 bug 时查
metadata:
  type: doc
  status: 已交付
---

# 测试与验收（含 TDD 政策）

> 本文定**政策**（测什么、何时测、怎么算过）；“先写失败测试再实现”的**方法**在插件技能 `test-driven-development`。

## 测试分层（通用政策）

- **单元测试**：默认层，随项目验证命令（`AGENTS.md`「本仓验证入口」）每次跑，快、无外部依赖。
- **集成测试**（真库 / 真服务）：显式触发，不进默认验证命令，保持收口快。
- **端到端 / E2E**：显式触发；关键主链路至少一条。

## 何时走 TDD

- 必须走：新功能、修 bug（先写能复现的失败测试，修完留作回归测试）、改无测试保护的关键逻辑。
- 可不走：纯文档改动、一次性脚本。豁免在交回物里声明。
- 写测试、加 mock、想给生产类加 test-only 方法前，先查插件技能 `test-driven-development` 的反模式清单（`testing-anti-patterns.md`）——测 mock 行为、test-only 方法入生产、不理解依赖就 mock、不完整 mock，一律禁止。

## 验证证据

形式要求以Workflow 插件的常驻规则的「交回物格式」为单一权威——「已通过」三个字不是证据。

## 验收标准（Definition of Done）

- [ ] 验证命令全绿（见 `AGENTS.md`「本仓验证入口」：lint-extensions 与 Server Gameplay 单元测试）。
- [ ] 新增 / 修改行为有测试覆盖；bug 修复留有回归测试。
- [ ] 无 lint / 类型错误、无调试残留。
- [ ] 相关知识文档已更新（见 [`workflow.md`](./workflow.md)）。

## 项目测试栈与命令

默认验证为 lint-extensions 加上 Server Gameplay 单元测试：

```text
node .spec/tools/lint-extensions.mjs
node --test .spec/tools/lint-extensions.test.mjs
node --test clone-all.test.mjs
dotnet build modules/server-gameplay/src/Lumio.Game.ServerGameplay/Lumio.Game.ServerGameplay.csproj --nologo
dotnet test --project modules/server-gameplay/tests/Lumio.Game.ServerGameplay.Tests/Lumio.Game.ServerGameplay.Tests.csproj --nologo
```

测试栈：xunit.v3 4.0.0 + Microsoft.Testing.Platform 2.3.3（`global.json` `test.runner` = MTP）。生产程序集双 TFM `net10.0;netstandard2.1`，测试单 TFM `net10.0`。xUnit v3 要求 apphost。

`dotnet test` 可能以退出码 5 报 `Zero tests ran`（user-local SDK 无 HKLM `InstallLocation`；Apple Silicon 上跑 x86_64 SDK 时 apphost 找不到运行时）。**不得把「运行了零个测试」当成通过**，改用下面两条之一，且必须核对 total 数：

- `DOTNET_ROOT=<SDK 根> <测试项目>/bin/Debug/net10.0/<Assembly>` —— 直接跑 apphost，测试的真实入口。`<SDK 根>` 是**含 `shared/Microsoft.NETCore.App/` 的目录**，不是 `dotnet` 可执行文件所在目录：Homebrew 装的是 `/usr/local/Cellar/dotnet/<版本>/libexec`（`bin/` 里只有 wrapper 脚本，设成它无效）；`dotnet --list-runtimes` 打印的路径去掉末尾 `shared/...` 即是。
- `dotnet exec <测试项目>/bin/Debug/net10.0/<Assembly>.dll` —— 经 `dotnet` muxer 启动，自行解析运行时，**不需要** `DOTNET_ROOT`。

注意设了 `DOTNET_ROOT` 后 `dotnet test` 本身仍可能报 `Zero tests ran`（发现阶段拿到空 UID 列表），这是宿主侧问题，不是测试真的为零。

公共契约变更必须在架构仓 `LumioGameEngine` 完成（见 `AGENTS.md`「本仓验证入口」）；本仓只消费 `engine/wire/*.json`，不另写协议。消费口径由 `ChatWireContractTests` 之类的一致性用例钉住：它们在测试期直接打开架构仓的契约文件比对，因此跑 `dotnet test` 需要同级 `LumioGameEngine` 检出或 `LUMIO_ENGINE_ROOT` 指路，缺检出即失败（见 [`repository-architecture.md`](./repository-architecture.md)「跨仓检出」）。`dotnet build` 同样需要这份检出：Runtime net10.0 编译绑定 NativeLoader（目录名 `LumioGameEngine` 或 `LumioArchRoot`）。`dotnet test` 还要 `LUMIO_ENGINE_NATIVE_PATH` 指向现打的 native：测试世界由本仓的 `ServerWorldBoot` 启动，空间索引与 lumio-hfsm 都挂在 Native Context 上，缺 native 即 `LUMIO_ENGINE_NATIVE_MISSING` 失败——形态像代码红，先查环境（见 [`repository-architecture.md`](./repository-architecture.md)「跨仓检出」）。Scenario/Headless 与 formatter 命令随后续模块补进验证入口。

**CI 与本地的分工（ADR-114 豁免）。** 本仓是公开仓，CI 在 GitHub 托管机上造不出 native（ADR-080；Owner 2026-09-23 裁定不扩大 `LUMIO_CI_PAT` 去检出私有的 NativeCore / VoxelEngine）。所以经 `ServerWorldBoot` 启动服务端世界的用例都带 `[RequiresEngineNative]` 标记，CI 用 `--filter-not-trait "RequiresEngineNative=true" --fail-skips on` 排除它们，其余用例真跑、跳过即失败。本地照常全量跑：有 native 时带标记的用例一起执行，没有 native 照旧 `LUMIO_ENGINE_NATIVE_MISSING` 失败——标记不是跳过。

带标记的集合必须与架构仓 `standards/development-verification.md`「真 Native 覆盖豁免登记册」的 LumioGame 行**逐条相等**，由 `node eng/native-exemption-guard.mjs` 对账（CI 同一条命令，本地可复现）：多标、漏标、登记册多一行或少一行都红。排除条件只有一份：CI 工作流 `id: dotnet-test` 那一步的 `dotnet test` 命令。守卫直接读这一行，用它的全部参数列用例，再拿不带过滤的全量列表减去它算「未执行」——测试步骤里多加的任何排除（再加一个过滤器或过滤值、缩小测试目标）都会落进「未执行」并要求登记；这一行写成守卫无法静态确定参数的形式（变量或表达式展开、管道、多条命令、多行），守卫直接报错。列表只反映过滤器与测试目标，所以让用例不执行、作业却可能照样绿、而列表反映不出来的写法，守卫同样直接报错（退出码 2），不去重、不忽略：只列不跑或不执行的选项（`--list-tests`、`--xunit-list`、`--help` / `-h`、`--info`、`--explicit`、`--debug`），把非成功退出码当成功的 `--ignore-exit-code` 及其环境变量形式 `TESTINGPLATFORM_EXITCODE_IGNORE`（工作流任何位置出现都算），守卫看不到内容的 `--config-file`、`--xunit-config-filename` 与 `@` 响应文件，能给测试宿主加启动参数的 MSBuild 属性开关 `-p` / `--property`，以及没有恰好一个 `--fail-skips on`（缺、写成 off 或重复）。选项名不分大小写，`-x`、`/x`、`=值`、`:值` 写法都认；逐项依据与实测见守卫的 `NON_EXECUTING_OPTIONS`。命令行之外的同类写法守卫也直接报错（退出码 2），不解析内容：仓内任何位置（含 bin/obj 输出目录）出现 `xunit.runner.json`、`testconfig.json`（及带程序集名前缀的同名文件）、`launchSettings.json`、`<项目>.run.json`、`Directory.Build.rsp`（清单与实测见 `EXECUTION_CONFIG_FILES`）；仓内 MSBuild 文件或工作流任何位置出现给测试宿主加启动参数的属性 `TestingPlatformCommandLineArguments`、`RunArguments`、`StartArguments`、`RunCommand`、`StartProgram` 或目标 `ComputeRunArguments`（MSBuild 把同名环境变量当属性读，见 `RUN_ARGUMENT_PROPERTIES`）。xunit 显式用例（`[Fact(Explicit = true)]` 之类）缺省不执行，却照样出现在 `--list-tests` 列表里、`--fail-skips on` 也不把它算失败，所以同样直接报错、不计入「未执行」也不允许登记——它不是 ADR-114 的豁免手段：守卫扫仓内 `.cs`（不含 bin/obj）里的 `Explicit`、`ExplicitAsNullable`、`ExplicitOption…`、`WithExplicit` 标识符（区分大小写，注释里出现也算），再用 xunit 自己的发现清单（`--xunit-list full`，与 CI 测试步骤同一组参数，清单须与 CI 列表逐条对上）核对有没有 `Explicit: true`。单程序集与多程序集的 `--list-tests` 摘要行都能对账。守卫的纯逻辑单测 `node --test eng/native-exemption-guard.test.mjs` 同在 CI 里跑。**新增一条需要 native 的用例，必须同批做三件事**：加标记、在架构仓登记册加一行、在单里附带 native 的全量计数；只做其一 CI 就红。改 `modules/server-gameplay` 或其测试的单，按登记册的替代复核方式附一次带 native 的全量 `dotnet test` 计数。解除卡 R-00712（前置 R-00519 SDK 公开包）落地后，标记、过滤器、守卫与登记行一并删除。

## 本仓 Headless / 契约测试面

- Component/Mapping/权限、GAS Content、Scenario 初始状态和业务断言。
- PlaceVoxel 的成功、资源不足、Chunk 未加载、Revision 冲突、重复命令、断线重连和预测回滚。
- Fake/Reference Voxel 与 Native Differential、Replay 首差异、Save/Load/Migration Golden。
- Config Schema/优先级/快照、Content Hash、ReleaseManifest/Catalog 和握手拒绝。
- 日志/审计关联、Failure Bundle、100 Bot Workload、Tick/事务/复制/内存指标。
- 新增或修改公共 Schema 时，在架构源同时提交至少一份正向 Fixture 和一份失败 Fixture；保存或迁移变更必须覆盖旧版本、失败保留和可回放证据。
