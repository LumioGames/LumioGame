# 101 Native HFSM 偶发失败调查报告

状态：**原 `terrain-2` 的 5 个失败未关闭；没有生产修复，没有 RED→GREEN 修复证据。** 一次诊断 Terrain 全绿和独立 ABI 探针全绿均不替代原失败。已用受控 allocator 拒绝准确捕获 `ScratchAllocationFailed → InvalidArgument(1)` 分支，但尚不能把它认定为原偶发失败的根因。

## 范围与所有权

- 拥有仓独立 worktree：`C:/Work/LumioGames/LumioGameEngine-101-hfsm-evaluate-audit`，branch `codex/101-hfsm-evaluate-audit`，HEAD `0e2fc74783f9f186d59909b38d4ee70887a21137`。
- 精确 NativeCore：`C:/Work/LumioGames/.101-pack05/LumioNativeCore`，HEAD `81b2501a621db2657bd087db2afa808ecfb9e846`。
- 精确 Voxel：`C:/Work/LumioGames/.101-pack05/LumioVoxelEngine`，HEAD `2ba61e431d8080ff6450a07e6ee447e3f0994e0b`。
- Game 与两个冻结 provider 均未修改、未构建、未生成。临时日志只加入 owning Engine 的 `hfsm_adapter.rs` / `context.rs`，构建后保留完整 diff 与源文件，再恢复这两文件；最后 Engine `git status --short` 为空，Core/Voxel 也为空。
- 使用 `systematic-debugging` 分阶段取证。没有证实原根因，因此未进入生产实现阶段；未用受控资源限制的撤销冒充 TDD GREEN。
- 不读取 Workflow 凭证、不杀用户应用、不更改全局系统限制。

## 精确冻结输入

官方包06 manifest SHA256：`8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`。

原测试闭包路径：`C:/Work/LumioGames/LumioGame/games/101-bomber/.run/player-bots/seed-authority-green06/artifacts/bin/Lumio.Bomber.Gameplay.Tests/release`。

| 冻结件 | SHA256 |
| --- | --- |
| `Lumio.Bomber.Gameplay.Tests.dll` | `6ed9e47174e80f128cee0c472f0f550bf34157064454d11ed554dcd0704fc52d` |
| `Lumio.Engine.NativeLoader.dll` | `078eebb5214f838de91a02fc1d22f83da7f3850f0ae6a97fcdd2e7303db05d70` |
| `Lumio.Engine.NativeLoader.Hfsm.dll` | `63c8decb42bc8d2c9471bd802cf4884620eb1e31e1b9d2e96e1511df44ab87c9` |
| 原 Native DLL | `419b74c7b5eac0f85a02ab58eda8485240194060dfd319e816ab35f501bfbfed` |

原 Native sidecar BuildId `11c2e285c29d498379df4a05261819ac`；ABI hash `c5f276c855bcb71fd9b04dcd546d1dd925ac408fd6303d56e30a2c044946a2f3`。

诊断复制上述整个测试输出闭包到 owning Engine `.run/hfsm-evaluate-audit/diagnostic-game-root/tests`，另复制游戏的 `LumioBomber.slnx`、`Server/Config/Tables`、`Server/Assets/Maps` 以满足原测试路径解析。所有复制输入的路径/字节数/SHA256 记录在 `diagnostic-input-before-native.json`。测试 DLL 哈希复制后再次核对一致。只替换诊断副本的 `runtimes/win-x64/native/` 两件；原闭包和旧官方包不覆盖。副本仍由原 ModuleInitializer 按自身 AppContext 路径选择 Native。

## 原证据完整保留

原目录：`C:/Work/LumioGames/LumioGame/games/101-bomber/.run/terrain-warmup-resume-01`。

| 证据 | total | pass | fail | skip | exit |
| --- | ---: | ---: | ---: | ---: | ---: |
| `terrain-01` | 31 | 31 | 0 | 0 | 0 |
| `corrective-01` | 28 | 28 | 0 | 0 | 0 |
| `terrain-2` | 31 | 26 | 5 | 0 | 2 |
| `gold-isolated-01` | 1 | 1 | 0 | 0 | 0 |
| `terrain-3` | 31 | 31 | 0 | 0 | 0 |

首故障是 Tick6 `NativeHfsmDefinition.Start → BomberBombLifecycle.Ensure` 的 native status1。随后 `Scene.Dispose → WorldLifetime.Stop → Send` 同1覆盖测试表层异常；之后新 WorldLifetime Start/Send 与新 World foundation Start 也同1。首 Start 没有 snapshot/guards，故单个旧快照 lifecycle 或 guard 值不是这次首故障的充分解释。输入/definition handle/输出指针/Native scratch 等分支尚不能从原 status1 区分。

原 `terrain-2.log` SHA256：`f2c6df81b16fc2593d943b3e88bdefbdbce892087317c25641f84b85d8a84d8f`。其余原日志哈希也记录于 ledger。

原 `memory.ndjson` 是 `terrain-01` 的采样，**不是失败 `terrain-2` 的采样**。核对14个样本，private peak `177,414,144 B`（约169.2 MiB），working set peak `263,958,528 B`（约251.7 MiB）；brief 的约135/234 MiB不是全样本峰值，可能来自尾样本，不能用于失败进程的 OOM 判定。

更早 `terrain-green-01` 的 `MakeGenericType/ObserveComparerDefault OutOfMemory`、Node 大 diff OOM 和 Rust 单次 allocation failed 是分别记录的异常；没有证明其与本次 status1 同根因。

## 诊断构建

经 Root 协调后单线程构建，实际命令：

```powershell
$env:CARGO_BUILD_JOBS='1'
node eng/dev-build.mjs --native-core-root C:/Work/LumioGames/.101-pack05/LumioNativeCore --voxel-root C:/Work/LumioGames/.101-pack05/LumioVoxelEngine --configuration release
```

官方脚本在私有 `.build/native-workspace-K9Dq99` 重写 Engine/Voxel 的依赖到相同精确 Core，未直接选用默认 sibling。exit0，release 编译约1m09s；窗口归还 Root。

- BuildId：`5d595eb6bc9485d2e5d30c6e2d3f53ed`。
- sourceSha256：`be4a11321086216741e0b8e534c2f91105926624696f1e2af2ce220a2bc94699`（包含临时诊断改动）。
- Native SHA256：`80fd0fb73da7414e7a3634eecfc4e991786d89b56ed20579ae19d563617e9be4`。
- Native：`.run/5d595eb6bc9485d2e5d30c6e2d3f53ed/win-x64/run-j049uf/lumio_engine_native.dll`。
- ABI hash 与原冻结件相同；Rust/Cargo 1.98.0、`x86_64-pc-windows-msvc`，features为空。原有60条 Native warnings 如实保留于构建日志。

临时改动只打印错误分支，不改变 status 值或迁移算法：顶层 FFI POD 区域校验；本适配器 `invalid()` 调用位置；Context/definition resolve/lease 错误；`evaluate_batch` 的原始 `HfsmError`。`diagnostic-only.diff` SHA256 `54a9a25e86315c096968fa6394d59d3737b0ad3854178a9bdb3cce40b3966a49`。

## 实际实验与结论边界

### 1. 原冻结31例的一次分支诊断

运行原 DLL 诊断副本，过滤 `BomberTerrainProductionTests`，要求至少31例，并开启 stdout/stderr、保存 CTRF。`terrain-diagnostic-01`：**31 total /31 pass /0 fail /0 skip /exit0**，10.701s，无 `HFSM_AUDIT` 错误分支输出。

这次未复现原 status1，所以无法从它裁决原根因，也不能声明已修好。没有反复跑31例以累积绿测。

### 2. 独立托管 ABI 往返与压缩 GC

`.run/hfsm-evaluate-audit/abi-probe` 是独立一次性诊断程序；引用冻结托管 DLL，不引用/构建 Game/Runtime/Engine 生产工程。直接装载诊断 Native，以两层状态定义执行2,000轮 Start/guarded Send/Stop，强制 generation2 压缩GC100次。

`abi-probe-01`：6,000/6,000合法调用 status0、2,000完整轮、0失败、0观察到的顶层/嵌套不对齐、exit0，115ms。只观察本探针的 `definition`/item/io 与 snapshot/path/guards/output缓冲；不据此排除全部 Game 时序，也未把 inner ABI 的 owner 字段地址声称为已独立采样。

### 3. 分支日志的非法输入负控

`abi-controls-01` 在相同合法轮后，分别注入一个非法 kind、顶层 item地址+1、输出 active_path地址+1、definition.Generation=0。四次均预期返回1；日志分别明确报告 kind分支、顶层item校验false、输出校验分支、`resolve Handle(InvalidHandle)`。程序 exit0，四个负控符合预期；不是四个生产失败。

stdout/stderr 经 PowerShell 合并时可能交错，负控判定以标签及 Native 分支内容为准，不把合并文本行顺序当严格时序。

### 4. 原始 ScratchAllocationFailed 的受控复现

`allocator-probe.rs` 直接链接本次已构建的 release `liblumio_engine_native.rlib`；仅编译小诊断 host（0.6s），**未重编 Native**。host 的 allocator 只在指定一次 ABI evaluate 内拒绝 ≥1 MiB 的申请，不改操作系统/用户进程限制。定义是1个叶状态、1个 entry/exit action；输入、输出和句柄全部有效且缓冲够用。

| 受控试验 | status | 最大单块申请 | 总申请字节 | 输出 |
| --- | ---: | ---: | ---: | --- |
| 正常 allocator | 0 | 4,194,304 B | 4,805,248 B | Started，path state1 |
| 仅拒绝 ≥1 MiB | 1 | 4,194,304 B | 4,796,928 B | outcome77 /path state123 哨兵保持 |
| 撤销拒绝 | 0 | 4,194,304 B | 4,805,248 B | Started，path state1 |

确切失败日志：`HFSM_AUDIT evaluate_batch ScratchAllocationFailed { requested: 4800640 } kind=0 key=1 epoch=1 guards=0 snapshot=0x0 path_in=0 path_cap=1 action_cap=1`，随后诊断源码行500 `invalid()` 返回1（原源码 `hfsm_adapter.rs:466` 的 evaluate_batch Err 分支）。失败未污染 Context，后续同 Context 能正常计算。

已证实：单项适配器当前用 `Scratch::default()` +完整 `owner.hfsm.limits()`；Core DEFAULT `max_batch=1024`，因此每次单项 evaluate 为1024项最坏路径/action容量预留约4.8MB。受控大块拒绝能走 `ScratchAllocationFailed` 并表现为同一 status1。

**未证实：原 `terrain-2` 实际走了该分支。** 本实验证明机制可行，不是历史原故障的回放；撤销注入后绿也不是修复 RED→GREEN。

此外，公共 `engine/abi/native-abi.json → errorMappings.HfsmError` 本来就把 `ScratchAllocationFailed` / `ScratchBytesExceeded` 映为 `InvalidArgument`；`error_mapping_generated.rs` 与此一致。不能在没有契约决策的情况下只手改生成物或擅改公开 status。

### 5. 当前宿主 Job/内存探针

2026-10-03T01:10:47Z 的执行器 PowerShell 子进程：`IsProcessInJob=true`；最近一层 Job 的 ExtendedLimitInformation flags `0x2800`，processMemoryLimit/jobMemoryLimit均0。OS free physical约3.47 GiB、free virtual约12.16 GiB。信息保存在 `host-memory-job.json`。

只证明当前最近一层 Job，没有原 `terrain-2` 进程或其所有祖先 Job 的历史采样；不能据此排除原失败时的资源限制。未终止高内存应用。

## 未关闭与下一步

- 原 status1 的实际分支仍缺证据。需要在再次发生的相同消费链上保留本次分支诊断、原始输入/句柄与当时进程/系统/Job内存采样，才能决定 alignment、handle/lifecycle或scratch资源中的实际根因。
- 已有诊断 Native 和完整输入 ledger 可复用；它是调查件，不能混入正式Game。正式验证仍需新完整官方包。
- 若后续要修单项ABI的1024批次预留，可在 owning Engine 中另起真实 failing allocator/resource回归，限定单项scratch预算后观察RED→GREEN，并验证正常/拒绝/输出不写入等行为；该资源改进的交付说明必须与“原偶发已关闭”分开。当前未实施、未把它推成未经证实的修复。
- 未执行：Engine完整Native/managed回归、Core全测试、Game生产构建/声明生成/正式新包、Host/Bot验证、生产修复的独立reviewer（无生产diff可审）。
- 文档沉淀豁免：本报告是指定调查过程物；没有新的生产模式/决策，不修改 `.spec/knowledge`。

## 交回材料

除本报告外，所有新材料位于 `C:/Work/LumioGames/LumioGameEngine-101-hfsm-evaluate-audit/.run/hfsm-evaluate-audit/`：

- `source-and-evidence-ledger.json`：原件/原日志/诊断源hash与原内存峰值。
- `diagnostic-input-before-native.json`：复制的测试闭包、配置和地图全量hash。
- `diagnostic-only.diff`、`context.diagnostic.rs`、`hfsm_adapter.diagnostic.rs`：可恢复的分支仪器化。
- `diagnostic-native-build.log/.exit`：实际官方单线程构建。
- `terrain-diagnostic-01.log/.exit` 与副本 `tests/TestResults/terrain-diagnostic-01.json`：31例诊断证据。
- `abi-probe/`、`abi-probe-build.log/.exit`、`abi-probe-01.log/.exit`、`abi-controls-01.log/.exit`：独立managed诊断与负控。
- `allocator-probe.rs/.exe`、`allocator-probe-build.log/.exit`、`allocator-probe-01.log/.exit`：准确Scratch错误分支受控验证。
- `host-memory-job.json`：有范围边界的当前Job/内存探针。

无生产提交；Engine拥有分支仍在原HEAD且clean。冻结源、旧包、旧DLL和原失败日志保持原hash。
