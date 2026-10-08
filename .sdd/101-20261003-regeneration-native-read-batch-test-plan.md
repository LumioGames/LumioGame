# Regeneration Native 读照片第五例私有交回

2026-10-03，registry_bounds_review。Root授权的先行测试草稿；未发行到Game测试目录，未编译、执行、GEN、改生产或index。前置独审为`101-20261003-regeneration-first-wave-production-independent-review.md`（SHA `32faf83f3e63d868bd7724a672e6214cf63b88a2107bd92ad065dba99bda81e7`）；已证实P2仍HOLD。

## 草稿与原四例保留

私有目录为根`.run/regeneration-native-batch-test-draft-01/`。`before.cs`为原测试物理副本；`BomberRegenerationProductionTests.cs.draft`只加两个using、一项Fact和真实转发装饰器。移除精确addition fragment和两个using可逐字恢复原四例及全部helpers；恢复后的物理SHA与当前原件一致。

| 工件 | SHA256 |
|---|---|
| Game原测试 / before / reconstructed-original | `1430ca00bfdf3c792b97e5ca5a89d570ccc000be4cfa6a26d9d3403400ca4b1f` |
| 完整私有五例draft | `71fb110606ce99e15e18d8b4a359195ed620738bdbe6cdb7d6741536058f9a59` |
| addition.cs.fragment | `63522562101227caea49e2589da137b93ab9ee3d004cbce1bb6891ee38816bf0` |
| manifest.json | `71b26b6758f09c44f2d2d0ea52873e07688f0de33532e9596fb7ec9ec71dd88e` |

原四例为2 Fact + 1 Theory/2 Inline；私有draft为3 Fact + 1 Theory/2 Inline，共5例。新增名为`ActualFirstWaveOriginalConsumesOneCompleteNativePhotoWithoutRepeatingCellReads`。预测当前P2失败不是实际RED：现候选4/8-cell波会有726/730个请求，而合法两层19×19×2为722。没有执行结果可报告。

## 真Native观测入口与限制

已核`NativeWorldVoxelResources.Adapter.Abi`是现SDK的真实`VoxelFacadeNativeAbi`，借用现世界`NativeHandle`；`HostVoxelWorldAdapter.Abi`公开只读，`INativeVoxelAbi`公开允许调用方提供ABI。草稿以同一个真实ABI包一层`NativeReadWitness`，所有方法、out参数与结果原样转发，无字典地形、fake receipt、手填revision或自行Apply结果。用公开`VoxelGameplayBinding.Bind`把观测Host绑定到同一confirmed World，复制现`BindingPolicy`，用真实Prepare/Commit跑现Gameplay与Native。没有调用Regen生产helper作为替代发行。

草稿复用原Scene：真实Legacy地形+64 census、实际角色入局Running、安全orbit、Native授权删除soft input。到绝对首8秒真实Tick提交后，先要求唯一pending transaction与真实checkpoint为Status0/Applied/Original/TokenConsumed、有原始receipt bytes与sections；只开启下一次真实Manager.Tick的read记录。该Tick实际消费Original，须清exact pending/promise并产生同数4/8实际新增格。

记录真实`INativeVoxelAbi.Read`调用的完整地址序列，要求ground后obstacle的全部722地址、顺序精确、每地址仅一次。由此同时捕获先前逐pending行探测和后续普通规则重复照片；测试结束的观察读在Recording关闭后，不混入计数。SDK的`Host.Read(IReadOnlyList)`自身在内部循环调用ABI单格Read（当前Host代码538–549），所以此公开缝隙**不能直接观测Host列表调用边界或证明一个Native FFI batch**；能证明该实际消费Tick仅一次完整两层请求序列、无额外逐格往返。上层“唯一列表读取”的接口结构仍需对实际修复源码独审，不能把722 ABI调用说成一个FFI调用。

观测Host替换测试的Gameplay绑定及voxel tick callbacks；实际Native世界、ECS、receipt与transaction路径仍真转发。测试不声称验证NativeWorldVoxelResources私有`VoxelCommitSession`的Authority section物理观测/failure projection；ABI公开转发入口没有读取原callback的API。finally解除本次binding并恢复原Adapter的Gameplay绑定与Prepare/Commit，之后不再Tick而Scene.Dispose；没有把此fixture当Authority捕获闭环。这项限制不改变P2的真实Gameplay read行为观测范围。

## P2最小生产方案，待实际RED授权

不改变Native/Runtime公共合同、binding或普通pending gate。候选写域仅`BomberTerrainRead.Server.cs`、`BomberTerrainTransactions.Server.cs`、`BomberRegeneration.Server.cs`，必须另获Root生产授权后实现。

1. Terrain唯一consumer仍先验证matching complete Original与full receipt、cohort shape/provenance。既有tuple/section/revision/bytes/status/disposition/token guards一条不减。
2. 在现TerrainRead增加窄内部settlement入口，例如`ForCommittedSettlement(World, HostVoxelWorldAdapter)`，只在这个已提交合法消费上下文取得当前Tick两层照片，仍执行Ready/Unchanged和完整长度验证。普通`For(World)`的pending gate保留。共享既有adapter+tick cache，不能另建grid truth或另调用一次全图read。
3. `ValidatePending(applied:true)`接收该完整照片或与现map对齐的纯索引参数；逐行从照片取obstacle值/revision验证，取消每行`adapter.Read(oneAddress)`。绑定事实仍真实Native读/既有binding检查，不创造receipt或revision。
4. 所有行先验成功才Accept/Clear债务；照片已在cache，清pending后同帧普通For复用。任一异常/缺pin保留既有fail/hold语义，不部分释放。

原先For遇pending返回null，当前Terrain.Begin只读receipt section分组，没有完整两层材料照片，故不能声称直接已有可复用照片。不能只把单格循环搬到新helper，也不能先读cohort再全图重复读冒称一帧一次。

## Root后续运行顺序与停写

Root给发行窗口时先核原件仍为1430及draft71fb，再仅复制完整draft到原测试路径，记录前后hash与原四例逆向重建。fresh build后真实运行同class `--filter-class *BomberRegenerationProductionTests --minimum-expected-tests 5`；首个真实RED须确认唯一新例失败在722读计数/地址断言而不是fixture/namespace/API。若报编译或fixture错误如实HOLD，机械修正必须单独freeze，不能将它记成业务RED。原四例仍要真实4PASS/0skip。后获授权最小生产fix，再fresh同5例GREEN，保存源码/所有DLL/Native/官方pack/raw child/count身份。无需在本次准备窗口跑这些命令。

本次source fence见私有manifest六路径。Regen新类86130、Terrain0299、WorldRuntime838b、Round7603保留；BombSystem current220764来自Root独立Aura保护一行修复，不能误计入Regen作者修复。本计划与私有draft不是完整Regen/Authority/Native全部/Game通过的证据。源码写STOP；Game物理测试仍原四例。

## 后续真实RED与作者机械审计

以上保留草稿交回时点事实。Root随后窄发行71fb草稿。build05发现NativeLoader与SDK重名导入6个编译错误；这只是编译失败，不是业务RED，原日志保留。Root仅将新增`using Lumio.Engine.NativeLoader;`替为`using KernelHandle = Lumio.Engine.NativeLoader.KernelHandle;`，实际test SHA变为`09afc215d0e7bd3c7dac1fd7e35ae42d587e5d8aeae2e5ef51fae43ac1e3f08d`。作者只读比较完整draft与现件，精确此替换后逐字相等；原四例和helpers未改。此为作者审计，不代替非作者第五测试审查。

Root fresh build06后真实`games/101-bomber/.run/v14-fullpack07-native-20261003/regeneration-native-batch-red-01`：5 total / 4 succeeded / 1 failed / 0 skipped，14.886秒；唯一第五例失败在实际forwarded ABI Reads.Count的191行，Expected722 / Actual730。JSON及`.exit`均真实child2，外层工具exec1不是child1。源码两端09af、sourceChanges0。原四例实PASS而非fixture前置错误。未由我重跑任何过程。

RED JSON SHA `5a4a0d98eadde681ad4b5b7ab595ac9a012d2f42f3ba942f34a4c9c8e5bb3b59`；log SHA `a28a153bdf2073d6bb404b1673e07097a8bfcc2ac65c51a3d57bf77bdd028304`。执行Tests DLL `c0fc3df1065183740b3b8025d2aa2235cf37d6058d18f5f5d1de6f87cd25db07`，Gameplay DLL `339d719c19c2beb52d31ee3e534fcb73afd3cf09640e8e9a6bcd58f6eb70e018`；官方pack `652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`；Native `c01599b8c31ea72185f2a206dbcc5c4ff8fb432c68bb61ea3dabab5e6d4ddb12`，build-info `f9752593b0d802b76996a5bcaa8fdda4a75d2f9449fd160d268e793029f3570d`。材料/revision额外8格请求P2实证成立；binding/API全部无单格、Authority捕获或完整producer不在此断言范围。生产三域修正仍待Root候选及独审/同源五例GREEN。
