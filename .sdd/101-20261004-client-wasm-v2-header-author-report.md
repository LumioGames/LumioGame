# Client WASM V2输出头最小修复作者交回

裁决：`AUTHOR_CANDIDATE_V2_HEADERS_GREEN_PENDING_INDEPENDENT_REVIEW_AND_COMPLETE_PACKAGE_BROWSER_VALIDATION`。真实正式12原客户端工作单格读取因输出 trace 的 version1 被 Native V2 guard拒绝；候选只让六个 V2输出调用显式初始化 version2，现有 V1默认保持1，单格/其它查询仍保留原256项缓冲与额度。没有把缓冲优化、Game/pins修改或体验结论夹进本修复。

候选独立树：`C:/Work/LumioGames/.101-pack07/LumioClientWasmV2HeaderRepair`，分支 `codex/101-wasm-v2-header`，基线正式12 Client `38ead5ff3656b3b3fed8a0edbdbf07c34801cd2a`。没有修改 `LumioClient12Composition`、正式12完整包或共享 Game；没有 stage/commit。

精确封件：`C:/Work/LumioGames/.101-pack07/LumioClientWasmV2HeaderRepair/.run/wasm-v2-header-repair-01/seal-01/manifest.json`，SHA `9b9636d0be6abd0863ca37ef9d9166fda039f4dab0780d9e040ab7e095468d79`。封件 result SHA `95fca7a869d31eca2a12eb7a8155b975474259000d93c91c82bc7144fc3afe3d`。包括原/后完整源码、精确两个生产 diff、新测试 diff、RED/GREEN原日志/XML/results和各真实DLL/PDB、Native/ABI/生成类型出处与正式12原始生产 packet对照；不是只有源码成功声明。

## 根因与真实RED

原 `EngineWasmCall.Versioned<T>()`统一写 version1。`EngineWasmPrediction.Selective.cs` 使用该方法创建 `PredictionCorrectionResultV2` 一处和五处 `PredictionQueryTraceResultV2`。Engine `sdk-native/src/voxel/prediction/selective.rs:250` 的 `header_v2`明确要求正确 struct_size且 version2，否则返回 `UnsupportedVersion=2`，不写 payload/access；正式 desktop V2 facade同样明确填2。这六处是同一编码错误，没有修改 Native guard或通用ABI。

非作者真实 Native资格来自 Reentry的 `C:/Work/LumioGames/LumioGame/.run/wasm-v2-output-header-qualification-01/`。`native-header-03/result.json` SHA `fc57f3cf8259ae67acbd0665abd028c85ba8e99d2bca2c009da7f56a61846910`：正式12实际 WASM、真实 context/world、正式 section delivery revision41、64MiB/512正式 session、活 Begin token，header1返回2且 sentinel不变；header2成功 Ready/block65536/rev41/written=required=1/complete1/真实address/source0；zero capacity返回5/required1/written0/complete0，不写数据。health、complete/close/world/context释放均成功。首次两次 Node断言对 ABI offset/BufferTooSmall数值的行政误判另保留，不能计入产品RED。

`production-packet-01/result.json` SHA `03bb0f9254c068321762bcb41cbcd36fde2a56a0016a2d73c903f0ad2a1c76cd`进一步由正式12原 `Lumio.Client.Engine.Wasm.dll` 的生产 Open/Begin/ReadSelected实际生成 packet，原 Client→原正式 WASM直接得到 expected0/actual2。原 packet SHA `67a95faa8071a4cdf00900025aa92f6bd8939248eb3f62f5dbd8d4477821b423`；仅将这份真实 packet的 trace版本字节1改2的独立反事实对照 SHA `a621fb49331ee1295aa1689bb1e1cbf967daa3354a4c2bcc43778833480a79ca`得到 Native实际成功与完整单格 trace。原包/原DLL未改。真实 dotnet故意抛功能断言的原退出码为 `-532462766`，外层 PowerShell退出1，二者在封件分别保留；不能把环境异常或包装1冒称原程序raw1。原 runner01的输出路径误写只属INVALID行政尝试。

本候选 TDD的 `red-01`在未改两个生产源前构建 raw0、0警告；16例实际执行，6个 V2编码断言 Expected2/Actual1、10个 V1负控通过、0skip、测试 raw1。原测试源与后测试源相同 SHA，失败不是编译/环境/fixture错误。

## 最小变更与GREEN

仅三个源路径：

| 路径 | 当前 SHA256 | 行为 |
|---|---|---|
| `Client/Engine/Wasm/EngineWasmCall.cs` | `f625b6300c0d15d088aa2687f439b381aade2db25ddc12b9d0e38df644abdfdf` | `Versioned<T>(uint version=1)`；仅头 version的写入改为显式参数 |
| `Client/Engine/Wasm/EngineWasmPrediction.Selective.cs` | `97530c17ae99cb842931100739e1e013c4067e2815fcd6381fe374b0336d50f6` | 一处 Correction V2、五处 QueryTrace V2显式传2 |
| `Client/UI/Spectator/tests/EngineWasmPredictionHeaderTests.cs` | `d8a79c8753f33f3715a46e3164c7c5691a5632f71601a24b7f63360c1618f919` | 新增6个 V2调用、10个 V1调用生产 packet编码回归 |

全文 LF归一逆向去除上述两个 helper改动和六个 `(2)`，两个完整生产源均逐字等于 before，其他 body、调用/返回顺序、身份/token/keys/容量/拷贝及所有 V1调用保持原样。原/后物理字节和哈希各自封存，未以EOL归一伪称原始哈希相同。

`green-01`窄增量构建 raw0、0警告；整个既有 Spectator C# suite实际92PASS/0FAIL/0skip/0notrun、raw0（包含新16例）。新例同时校验 V2原始 size、高位 token/key保留以及五个 query仍传256容量和10240字节 buffer；V1 Open/Begin/Stage/Undo/ReleaseCovered/Complete/Stats/Binding/Public physics输出头仍为1。测试 transport只观察生产 codec，明确不实现 Native查询或DS世界；真正 Native guard资格由上述正式12真实 packet/WASM链给出，不能把92例当作联机体验通过。

独立 artifacts内候选 `Lumio.Client.Engine.Wasm.dll` SHA `d3c94a2e0e0de4fc5708afa8e4ad9c16ea5c7bf2c029ff9b633cab85dc2feabc`、private source-build AssemblyVersion1.0.0.0；正式12原该DLL为0.1.0.0。测试使用完整匹配的独立源构建依赖图，无ALC忽略版本、无替换发行DLL或deps改写。这份私有候选不是新正式包，后续须按官方打包版本规则消费；原正式包不动。

## 尚待资格

Root非作者独审通过前不提交。通过后仅显式三个源码路径提交，再建立干净组合并走官方完整包：不能将 `.run`、NuGet、锁或其它依赖源纳入提交。实际新客户端 packet→真实 WASM候选对照、新官方包的编译/消费字节闭合、首次真实移动不再故障、两个独立玩家位置/放弹与十次真实关闭新页重进、性能数据均仍需实际验证。

单cell10KB跨桥报告另存 `.sdd/101-20261004-wasm-single-cell-trace-readonly.md`；其优化仍未实现。V2修复可能开放以前被版本拒绝的真正预测路径，不能把修复后更大/更小 Native工作量直接当作缓冲优化的性能结论。ABI JSON通用 version1文字与具体 V2 guard的说明不一致保留为文档边界，本修复未改变架构契约源。
