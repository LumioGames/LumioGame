# Runtime私有Tick诊断独立审查

裁决：**ACCEPT_PRIVATE_DIAGNOSTIC_ONLY**。四个指定源码与作者封存SHA逐项一致，基准为Runtime `d8ae3da3793d5d95785606be319668a4318af85a`。未发现本诊断范围内的P1/P2阻断。此裁决允许Root将精确四文件用于明确标记的私有诊断完整包；不认可性能收益、体验验收或最终正式包。

独审只读生产源码、差分、作者报告与局部编译记录，没有构建、运行测试、改源码或消费局部DLL。证据目录：`C:/Work/LumioGames/LumioGame/.run/runtime-private-tick-diagnostic-independent-review-01`。

## 身份

| 文件（相对Diagnostic Runtime） | SHA256 |
|---|---|
| modules/ecs/src/Lumio.GameRuntime.Ecs/World/WorldManager.cs | `263266deec76053d3675d666338f56ea8d794a39afc33f8847595984e9bfaedf` |
| modules/ecs/src/Lumio.GameRuntime.Ecs/Prediction/WorldManager.JointPrediction.cs | `2198212eecd67fbb08b5687412a47e989ef7a56be3aaf7c40333d55cd1897d47` |
| modules/gas/src/Lumio.GameRuntime.Gas/Prediction/GasJointPrediction.Selective.cs | `7f4c1cb28e80db1e776226fc6e2542d35dbc977638c22754c1bda21fbd4c2611` |
| 新 modules/ecs/src/Lumio.GameRuntime.Ecs/Diagnostics/BrowserTickCostProbe.cs | `03275a7fab3806e4820a83ee073955dad4857288c814e83b29296988417ff3f1` |

Git差分仅三处既有文件和新helper；`.run/`是作者独立证据。`git diff --check`实际退出0。作者窄构建记录为GAS netstandard2.1及其managed依赖编译退出0、0 warnings、0 errors；该文件明确是工具结果摘要，没有伪装为保存的完整原始stdout。独审未重复编译，net10、完整包、真实浏览器尚未由本审查验证。

## 保持的语义与边界

`WorldManager.World`、`World.IsServer`、`World.CreationOrder`都是普通getter/字段访问，不调用owner检查、不进入用户回调。新增Scope参数求值没有提前引入owner异常。GAS Rebuild probe放在原`Check()`、config scope和`_applyingAuthority`早退之后；Publish原本由已验证owner的联合流程调用。

原Ingress返回和业务catch保持；Fingerprint、Stage调用位置和次数保持；完整Clone创建、hydration及失败cleanup保持。TypedAuthority中的旧foreach仅被capture scope包围：Record、Adopt/Attach、generated CaptureSync/CapturePersist/Copy、Observer复制以及scratch dispose先后未变。新增component/field/transform计数只读既有结果，不再扫描世界。GAS原覆盖、project、authority refresh、witness、execute、native Complete、publication/correction重试、catch/finally和返回值保持。没有World/输入/Native状态的新写入、替代driver、协议/额度调整或新玩法世界。

Scope是值类型，现有using路径各Dispose一次；成功、早期业务异常和原cleanup异常都被计时，诊断自己的Stopwatch/格式化/Console异常只记fault，不取代业务异常。capture发生业务异常时仅时间可计入，尚未调用CaptureCounts的部分计数不会补记，因此不把计数当完整异常路径工作量。

## 测量解释

八桶均为inclusive；作者报告和实际输出都明确`typed>capture`、`joint>typed+publish`。不能把所有sum相加当总Tick，桶差也不等于未插桩的Client/Runtime全部剩余耗时。Fingerprint包含Encode/SHA/ToHex；capture包含实体结构、所有生成capture与copy、observer复制及scratch释放，不能命名为纯JSON耗时。clone_init/fallback分类仅计调用次数，clone时间桶仍合并。单位为入口CreationOrder.Count或入口_inputs.Count，后者可含即将被权威覆盖的记录。

固定四个8项累加数组和固定标量，不保留payload/身份/字段值；每64次Clone或实际JointRebuild结束请求报告，等全部嵌套scope退出才输出。每行最多1024字符，超长则固定短错误行，未满64的尾窗不会输出。报告时才分配StringBuilder/string；Console和probe bookkeeping仍可能包含在外层Tick或scope耗时中，没有“消除测量开销”的保证。

`NETSTANDARD2_1`且client才计时；net10的Begin返回default，不启动Stopwatch或Console。正式Server和Bot的net10域因此不输出该probe，但foreach新增local计数与Fields.Count读取仍存在，不能称机器指令层面完全no-op。服务实际域仍需Root完整包身份核对。

静态累加器不提供多线程隔离。当前Game浏览器配置没有WasmEnableThreads，Session/Tick及联合预测按同一managed owner线程调用；审查只接受这一浏览器诊断用途。TryEnqueue本身是允许跨线程的Runtime通用接口，该helper不可扩充解释为通用并发tracer，也不把多个World的全局窗口解释成某单独World指标。

## 结论限度

允许Root精确四文件封存后经官方完整包工具产生私有诊断候选，随后用真实八人浏览器采样验证输出与开销。此处没有实际Console频率/浏览器诊断运行证据，没有节省毫秒的结论。正式修复仍需根因、独立审核和真实验收；最终正式候选应移除这份诊断差分。

独立证据生成第一次PowerShell检查清单使用了错误的裸`true/false`值，故首次`verification.json`只有null，原文件保留；最终`verification-final.json`重新核对四份current/copy/base hash及范围，才是本裁决的核验记录。该证据脚本错误未改动生产源码，也不被计为诊断构建或测试失败。
