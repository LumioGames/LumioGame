# 正式12单格预测 trace 跨桥只读调查

裁决：`READ_ONLY_MECHANISM_CONFIRMED_TESTS_AND_PERFORMANCE_NOT_RUN`。单格工作读取最多产生1条访问记录，可在所属 Client 按该操作实际需求缩小临时跨桥缓冲；不能据此宣布它是浏览器卡顿根因。当前另有 V2 输出头版本不匹配的源级正确性问题，应先取得真实调用 RED，再分别验证功能和性能候选。

证据目录：`C:/Work/LumioGames/LumioGame/.run/wasm-single-cell-trace-readonly-01/`。`result.json`记录正式12四仓 HEAD、干净状态和28份原始源/发行资格文件的独立字节副本及 SHA；没有编辑生产、测试、pins，没有编译、运行 Native/浏览器或控制服务。

## 单格真实访问上限

正式12 VoxelEngine `crates/lumio-voxel-world/src/prediction/selective.rs:182` 的 `SelectiveSource.read`，先读取权威单格、按显式 retained keys 选择覆盖值，随后在唯一汇合点调用一次 `visit(CellAccess)`。Ready，包括空气，记录 `read_kind=1`、真实 section revision、供值的 journal key；未加载/没有 payload/缺少版本戳记录 Unavailable、revision0、source0，不会造空气。错误返回不额外访问其它格。

Engine `engine/native/modules/sdk-native/src/voxel/prediction/selective.rs:434` 的 `voxel_prediction_working_read_cell` 只把 `|s,_| s.read(c)` 交给 `traced`。`traced` 第一遍只计数，第二遍重新读同一 owner gate 的同一 cut 并填输出；两遍计数不累计进最终数组。因此有效单格遍历 `AccessesRequired=1`，完整成功或单格缺失 status26 时 `AccessesWritten=1/TraceComplete=1`。身份、token、keys、selected-record drift、非法坐标等在遍历前拒绝，不能假定它们也有一条有效 trace。

`capacity=0` 仍应调用 Native：合法单格第一遍计出1，返回 `BufferTooSmall=5/required1/written0/complete0`，不写数据或访问数组。不能补造 complete 或代替 Native 成功。现有真实 Native 测试 `all_five_selectors_trace_misses_negative_binding_and_atomic_capacity`（同文件454起）已有成功 written1、零容量拒绝并保留 block sentinel、selected key 和 authority key0断言；`real_live_loss_returns_26_drift_returns_23_and_reset_reports_reason_union`（同文件710起）已有真实数据丢失 status26 的 complete1/written1/Unavailable 与真实 drift23断言。本轮只读这些既有用例，未重跑。

Binding 的 `SelectiveSource.binding` 会先 `read` 再记录 binding，真实需要2条；Raycast/Sweep/Overlap按实际遍历记录，不能一起缩为1。Public `voxel_prediction_read_cell` 无 trace，更新打开时保留既有 Pending gate，不能替代执行中必须带活 token/keys 的工作读取。

## 10240字节如何往返

Client `Client/Engine/Wasm/EngineWasmPrediction.Selective.cs:24` 的 `ReadSelected` 对调用方整个 `accesses.Length` 分配输出并把同长度作为 Native capacity，返回后 `Copy`整个数组。Runtime `GasJointPrediction.Selective.cs:52` 从 `WorldIngressBudget.PredictionTraceCapacity` 分配 `_traceScratch`，默认256；Game `SpectatorReplicaHost.cs:52`没有覆盖该参数。因此本局单格 trace 输出是256×40=10240字节。

`EngineWasmCall.Invoke`把所有 buffer 的完整内容写入 request；Engine `sdk-wasm/bridge.mjs`对每份 buffer 分别复制 packet片段、分配八字节对齐 Native memory、复制入 WASM，调用后再把所有完整 buffer 放入返回包；Client再完整复制每份返回 buffer，最后复制进调用方 trace span。缩最后一次 C# copy不会缩小前面的完整 request/response。桥返回固定长度是现有契约，不需要为了单格优化改变通用桥格式。

当前在每个方向有10240字节 trace 内容。若仅此操作使用 `min(accesses.Length,1)` 项的缓冲，真实 Native capacity 同样传0或1，非空场景每方向变为40字节，差10200字节；keys、身份、结果、trace POD、调用次数和其它 buffer 保持原样。这是字节机制，不是实际耗时或总 allocation 节省的测量。

零长度输出仍可由现桥处理：`sdk-wasm/src/lib.rs:39` 分配 `length.max(1)`、八字节对齐，free用同一 layout；ABI允许零 count/extent。不能把40字节实际缓冲与原256容量一起传，否则声明的可写 extent超出实际内存。

## V2版本前置问题

正式12 `EngineWasmCall.Versioned<T>`硬写 `Version=1`。Selective里的 `PredictionQueryTraceResultV2` 五处和 `PredictionCorrectionResultV2` 一处沿用该方法。Engine `header_v2`（selective.rs:250）先检查真实 POD size，随后明确要求 `version==2`，否则返回 `UnsupportedVersion=2`；正式 desktop `VoxelPredictionSelectiveFacade`显式填 `Version=2`。所以这条正式 Client packet在正常 world下会先于单格遍历被该 guard拒绝。调用方的 initialized V2 trace仍可能保留 version1和零进度，不能把这些值解释为真实完成 trace。

ABI JSON通用 `validationOrder`中的 version1文字没有区分后续 V2；本报告以具体 V2 guard、V2结果字段和正式 V2 facade作为源级判断，并保留文档不一致。之前即时消息误写数值4已更正，实际枚举是2。本轮未实际运行该 Client或浏览器调用，不能将源级判断称为已经观测的用户故障。

最小正确性候选应给调用者显式选择输出 POD版本、仅上述6个V2出口用2，保留原V1版本1和所有 Native guards。不能全局把 `Versioned<T>`的默认值变成2。Native/ABI/WASM generic bridge不需要放宽版本要求。

## 最小回归计划及修复边界

1. 所属 Client 新窄测试复用 `Client/UI/Spectator/tests/EngineWasmBindingReadTests.cs` 已有正式 `EngineWasmTransport` packet解析接缝；`Lumio.Client.Engine.Wasm.csproj`已有该测试程序集的内部访问资格。通过真实 `EngineWasmVoxel.OpenPrediction`创建适配器，检查它输出的 trace/correction POD header，旧源 V2 version1应真实断言失败，V1 Begin/Stage/Complete/Stats/Public gate仍为1。该 codec接缝只验证生产 packet形状，不能代替 Native或DS联机验收。
2. 对单格 operation记录实际 packet 的 access buffer长度和与之对应 capacity；调用方仍传256项。旧源10240/256对候选40/1期望产生RED；返回真实单条高位 journal key、section revision、负 section坐标，完整 bytes必须保持。调用方其它255项预置 sentinel应保持，零 written和 BufferTooSmall也不覆盖访问 span。读取 trace后仅复制 `AccessesWritten×40`；先严格检查 written不大于实际 capacity/caller span，不得 clamp 或截断坏 trace。
3. 用已发行完整12实际 WASM和 `engine/native/modules/sdk-wasm/bridge.test.mjs`真实 `call` packet接缝新案，按正式 context/world/catalog/section delivery/prediction open/begin生成真实状态：header1返回2且不写；header2分别 Ready block/air、selected overlay、Unavailable26、zero capacity5、stale token24、unsorted/unknown keys1、drift23。比较容量1与256的结果/trace/source/revision/publication逐字段相同，并验证请求/返回实际 access buffer仅40字节。不得用手造 Native成功回复替代此项。
4. 原 Native selector/capacity/缺失数据/坏借用案例和 Client当前相关 WASM suite按所改范围跑一次；Binding的两条trace、physics多格访问与容量拒绝、V1 Pending gate保持原规则。若版本修复开放了以前拒绝的实际 prediction路径，再走 Runtime普通确认/回放/覆盖/对因果 trace 的测试，并经新官方完整包消费。不能拿 codec GREEN宣称真实移动可玩。
5. 在无重构建干扰的两个独立真实浏览器、2Human+6Bot同房间同配置中，用相同小探针比较：Native working_read_cell次数/耗时、bridge request/response bytes、outerTick/JS和rAF长帧分布；确认权威继续、输入 accepted/ack、位置/放弹同步及关闭新页重进。功能版本修复与缓冲缩小尽量分阶段作对照，避免把新开放的实际预测负载和减复制收益混为一因。

最窄优化生产范围是所属 Client的 `EngineWasmPrediction.Selective.cs`，另外 header修复可能需要 `EngineWasmCall.cs`的显式 version参数。新测试可放独立 `EngineWasmSelectiveReadTests.cs`，不改现有公共 helper。Runtime `_traceScratch`的256容量、`Reserve(256+keys*24+traces*40)`预算、`RecordTrace`按实际 written/required保留完整访问证据、session额度和唯一权威世界均保持。Native最大单格1的源事实不是 permission to减少其它查询容量。
