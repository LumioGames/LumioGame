# 101 Native HFSM 偶发失败调查

状态：根因未证实。执行者先调查、证据与假设验证，再做拥有仓最小修复和 TDD；禁止把一次绿测当修好。

## 所有权与精确输入

- 独立 Engine worktree：`C:/Work/LumioGames/LumioGameEngine-101-hfsm-evaluate-audit`，branch `codex/101-hfsm-evaluate-audit`，HEAD `0e2fc74783f9f186d59909b38d4ee70887a21137`，从包06实际来源新建。先读拥有仓 AGENTS / .spec 入口。
- Core 包06实际来源 `C:/Work/LumioGames/.101-pack05/LumioNativeCore` HEAD `81b2501a621db2657bd087db2afa808ecfb9e846`。不得修改此清洁冻结源。若 Core 证实缺陷先通知 Root 取得独立 owning worktree。
- 只读 Game：`C:/Work/LumioGames/LumioGame/games/101-bomber`。其声明/生产者归 Root/capacity_schema，不能编辑或生成。
- 官方包06：Game `.run/20261003-controlled-game/complete-release-06`，manifest `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`。
- 原冻结测试 DLL：`.run/player-bots/seed-authority-green06/artifacts/bin/Lumio.Bomber.Gameplay.Tests/release/Lumio.Bomber.Gameplay.Tests.dll`，SHA256 `6ed9e47174e80f128cee0c472f0f550bf34157064454d11ed554dcd0704fc52d`。ModuleInitializer 从该 AppContext Native 取件，不会靠环境变量换另一 Engine。

## 实际证据

Game `.run/terrain-warmup-resume-01` 保留：

- terrain-01：31/31，0fail/skip，exit0；750ms进程/系统内存采样 `memory.ndjson`，峰private约135MiB、workingset234MiB。
- corrective-01：28/28，0fail/skip，exit0。
- terrain-2：31total / 26pass / 5fail / 0skip，exit2。首 BOMBER_EXECUTE_FAULT Tick6：`NativeHfsmDefinition.Start -> BomberBombLifecycle.Ensure`，`hfsm_evaluate native status1`，后 Dispose Send 同1掩盖早失败，随后多个新 WorldLifetime/World foundation 同1。
- gold-isolated-01：同首 BoundGoldTerminalDebt 测试1/1，exit0。
- terrain-3：31/31，exit0。
- 更早 `.run/player-bots/seed-authority-green06/terrain-green-01.log`31/31失败，首 MakeGenericType/ObserveComparerDefault OutOfMemory，而当时 schema Node full01巨大diff也 OOM。仅有时间关联，未证明同根因，不能写成修复。

主机当前job/进程内存是否限制未调查。系统commit约30–32GiB/45GiB、physical曾2.8GiB后8GiB；Node/.NET GC限制环境变量当时null。用户应用内存不能擅自杀。Server rust首次1.2MiB allocation failed，再次原源构建成功，也只有关联。

## 已读代码与候选假设（不是裁决）

- Engine `engine/native/modules/sdk-native/src/hfsm_adapter.rs`：FFI顶层及嵌套输入/输出 alignment，snapshot lifecycle / kind，live_definition；`evaluate_batch`任何 Err 当前统映 InvalidArgument1，无法由status区分ScratchAllocationFailed。
- Engine `engine/native/modules/ffi-boundary/src/lib.rs` owns FFI validation（不是Core）。
- Engine managed HfsmFacade Evaluate pin数组+AllocHGlobal，NativeKernelContext.ContextHfsmAbi uses in-handle delegate。
- Core lumio-hfsm Scratch(default)在每次单项ABI evaluate按DEFAULT `max_batch1024,max_depth32,max_actions128,max_scratch64MiB`预分配；资源失败可能被错误映为1，但尚无实证，不能直接改。
- Game BomberWorldSerialDefinition禁并行，同collection单Engine；BoundGold测试内部Runtime-only restore用同Engine另World然后Dispose。测试排列、GC移动、资源/句柄、顶层或嵌套alignment、Core scratch资源失败都需区分。

## 交付与限制

先用小且可信的诊断/拥有仓测试定位具体返回分支，原失败完整保留。若需要重Native build、官方重包或高内存测试，先通知Root协调窗口（capacity_schema当前正在Remote builds）；不并行重型构建。不得在Game复制兄弟源码或覆盖旧官方DLL。诊断构建仅作为调查证据，正式Game只走新完整官方包。

最终报告 `.sdd/101-20261003-hfsm-evaluate-investigation-report.md`：根因/非证实假设、精确source hashes和范围、真实RED→GREEN、相关回归total/pass/fail/skip/exit与未执行。没有证实根因就诚实列未关闭，不反复跑绿洗掉失败。实施后由不同 reviewer 独审。
