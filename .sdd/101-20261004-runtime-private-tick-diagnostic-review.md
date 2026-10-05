# 101浏览器管理Tick私有诊断：作者交回，待独立审查

状态：**DIAGNOSTIC_SOURCE_ONLY**；局部编译通过，未运行诊断包，没有性能修复或体验验收结论。此前AOT两次私有实验均失败，已经停止，没有采用其配置或产物。

新树`C:/Work/LumioGames/.101-pack07/LumioGameRuntimeDiagnostic`，分支`codex/101-browser-tick-diagnostic`，基准`d8ae3da3793d5d95785606be319668a4318af85a`。Root明确授权此隔离诊断，原Runtime冻结树和Engine冻结树仍clean且HEAD分别d8ae3da/0e2fc747。没有reset/clean、stage或commit。Game源未在此任务修改。先读Runtime核心、知识导航、workflow、style、testing、architecture及ECS/GAS模块入口；实际规范从Engine release-freeze0e读取，`.101-pack07/LumioGameEngine`并不存在，其错误只读查询已记录，未错误绑定构建。

## 唯一四文件及SHA256

| 文件（相对新Runtime根） | SHA256 |
|---|---|
| modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.cs | `263266deec76053d3675d666338f56ea8d794a39afc33f8847595984e9bfaedf` |
| modules/ecs/src/Lumio.GameRuntime.Ecs/Prediction/WorldManager.JointPrediction.cs | `2198212eecd67fbb08b5687412a47e989ef7a56be3aaf7c40333d55cd1897d47` |
| modules/gas/src/Lumio.GameRuntime.Gas/Prediction/GasJointPrediction.Selective.cs | `7f4c1cb28e80db1e776226fc6e2542d35dbc977638c22754c1bda21fbd4c2611` |
| 新 modules/ecs/src/Lumio.GameRuntime.Ecs/Diagnostics/BrowserTickCostProbe.cs | `03275a7fab3806e4820a83ee073955dad4857288c814e83b29296988417ff3f1` |

## 精确方法边界与包含关系

八个桶记录`count/sum_ms/max_ms/units`，全部为**inclusive**时间，不能直接把八桶sum相加当总Tick。

| 桶 | 精确范围 | units/关系 |
|---|---|---|
| ingress | WorldManager.TryEnqueue中WorldIngressSnapshot.Capture整个调用，含冻结及Encode计费；不含队列/plan登记 | units0；保留原catch/返回值 |
| fingerprint | ValidateWorldChange中ToHex(FingerprintWorldChange(change))，含EncodePack+SHA+ToHex | units0；不含后续身份/倒退校验 |
| stage | ApplyValidatedWorldChange中的StageFieldValues调用 | units0；不含后续World apply/BeforeAuthority |
| clone | CloneConfirmedForPrediction完整方法，从new World前到成功return或原cleanup异常路径结束 | units为源CreationOrder.Count；init/fallback为克隆调用次数分类，未单独分类耗时 |
| typed | RefreshTypedAuthority完整方法，含Project0、删除/扫描、capture桶、parents/终态、最终Project及account index | units为CreationOrder.Count；包含capture |
| capture | RefreshTypedAuthority当前CreationOrder的**完整foreach**，含Record/Adopt/Attach、prediction IDs、全部generated capture/persist/Copy、observer projection和field scratch释放 | units为CreationOrder.Count；仅此桶额外累计components/Fields.Count/LogicTransform组件数，不能称纯JSON时间 |
| joint | RebuildSelective的_applyingAuthority早退之后，BeforeAuthority到原try/catch/finally完结 | units为入口_inputs.Count；包含typed/publish及其他覆盖、Project、witness、执行；早退不计 |
| publish | PublishSelective整个调用，含PrepareJointPublication、Native Complete、Publish/telemetry以及原correct/retry流程 | units为入口_inputs.Count；被joint包含，必要时重试也在桶内 |

helper用固定四个8项long数组，没有payload历史/动态采样队列。净剩余`typed-capture`包括投影/结构修整；`joint-typed-publish`包括其他GAS步骤，均只是桶边界差，不可叫全Tick exclusive值，未覆盖的Runtime/Client工作仍存在。重试可改变调用次数，按真实count评估，不预设一桶一组。

## 诊断语义与开销边界

- 编译条件`NETSTANDARD2_1`且每个callsite明确`!World.IsServer`，才启动Stopwatch。net10.0的Begin直接default，正式DS及六个Bot不启动计时或输出；还需正式09 runtime真机确认，不凭编译宣称实测。
- 所有状态仅helper static计时数组/标量；不写World、IRuntime状态、Native状态、输入、RPC、Hash、budget、Schema或准入。没有Native SDK clock调用，使用Stopwatch.GetTimestamp/Frequency墙钟诊断。
- 每64次clone或实际外层joint结束构成报告边界；嵌套scope未全部关闭时延后输出，避免把完整joint与半个typed混在两份报告。每报告最多1024字符；只含有限数值与固定方法名。无ID、票据、密码、payload或字段值。
- 报告格式`LUMIO_RUNTIME_PRIVATE_TICK_V1`，包含inclusive/nested声明、clock/frequency、报告ordinal、累计pulse、窗口clone_init/clone_fallback、窗口capture component/field/transform数和入口pending_max。pending_max包括本次权威已覆盖但尚未移除的输入，不能直接称“未确认输入数”。
- Scope为值类型，正常测量无scope对象分配；每64报告才分配有限StringBuilder/string。capture计数仅在既有foreach累加整数及读Fields.Count，不多扫描/复制玩法对象。
- helper内部计时/输出异常只增长probe_faults，不能覆盖原World/GAS异常；原业务捕获和cleanup顺序不变。未引入锁、线程、Task、世界副本、抽象模拟driver或预测绕过。
- 未满64的尾窗不输出，因此关闭时可能有未报告指标；不能把缺尾窗称零成本。global计数以每个WASM模块/浏览器进程为单位，非按房间或World身份建字典。

## 已执行验证

仅作者局部构建：`dotnet build modules/gas/src/Lumio.GameRuntime.Gas/Lumio.GameRuntime.Gas.csproj -c Release -f netstandard2.1 -p:LumioArchRoot=C:/Work/LumioGames/LumioGameEngine-101-release-freeze0e -p:ArtifactsPath=C:/Work/LumioGames/.101-pack07/LumioGameRuntimeDiagnostic/.run/browser-tick-cost-diagnostic/compile-01 -p:RestoreLockedMode=true -p:UseSharedCompilation=false -m:1 -nodeReuse:false --nologo`。

工具原始结果chunk`98908a`，exit0，显示0 warnings/0 errors、构建时间8.00s；未额外重跑只为产出log。它构建GAS netstandard2.1及正常managed依赖ECS/Coordination/Config/Primitives/Hfsm，输出全进本新树独立ArtifactsPath，没有Rust Native编译/旧DLL覆盖，没有消费该局部DLL。冻结Engine的restore只写独立artifact，事后git status仍clean。git diff --check通过，git status只上述3修改+1新helper；未跑全解/test/format，未执行NET10构建、helper实际报告或浏览器诊断，因此相应部分**NOT_RUN**。

## 后续与撤销边界

Root及非作者独审以exact4source diff/哈希核对，必要窄修后重封存；Root显式四文件commit、经相同官方完整包工具产生明确标记diagnostic的完整09，再由Game正常完整消费。不得替换旧包DLL。真实八人scene测initial/死亡观察/重生Baseline和稳定多组窗口，先看各bucket占比及init/fallback clone count，再准备所属生产修复的根因RED。最终正式候选必须完全移除这四文件诊断差分，重新独审与正式完整包；本包和本报告不作为体验验收。
