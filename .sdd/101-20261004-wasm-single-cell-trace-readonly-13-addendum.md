# 完整13单格trace优化边界与实际Native验收计划

本补充保留原正式12只读调查，不重写旧报告。当前裁决是`READ_ONLY_FORMAL13_TRACE_OPERATION_BOUND_CONFIRMED_OPTIMIZATION_AND_PERFORMANCE_NOT_RUN`。没有生产/test/pins写入，没有编译或运行Native、浏览器、服务；正式13输出与clean sources不改。新证据位于`C:/Work/LumioGames/LumioGame/.run/wasm-single-cell-trace-readonly-13-01/`。

## 当前前置身份

Client13 clean commit `b9c2d415e09520c7946cc5eed8aec8a6c59244b1`仅合入已独审的V2输出头修复：五个query trace和一个correction显式version2，通用默认V1仍为1。正式13manifest `9a3289d2720efacee59e6f762b49771a6729fde53a9a5033e8fd9c016b1ff2c5`，新官方Native `9f31f10938d4a3c856ea8d4bfccea0da2681fe606640402e4a18f65e42cfb2d2`，新WASM `edd992f1b06a82e98934450ed72fcd38a320cede29153380f9fe9eed4b3af242`。完整包与默认CLR资格已封，浏览器资格仍由Root实际测量。

旧完整12原Client真实C#→原实际WASM已证明version1返回UnsupportedVersion2；独立候选真实生产C#直接输出version2、无packet改写，返回Ready/fulltrace1。原功能RED是实际dotnet `-532462766`、外层PowerShell1，不能改称dotnet1。该证据为历史实际12Native资格，不虚构成此只读任务新跑过13Native。13的功能修复没有夹带缓冲或quota优化。

## 可改的最窄操作

现在正式13 `Client/Engine/Wasm/EngineWasmPrediction.Selective.cs:24`仍按`accesses.Length`分配/发送/copy整个数组。其Native与Voxel来源同正式12且逐hash不变：`SelectiveSource.read`在一次单格权威/retained-key读取的唯一出口只记录一次visit；`voxel_prediction_working_read_cell`只调用该read。Native两遍先计数再写入，最终written不是两遍相加。因此单格最多写1条；Binding实际需要2条，physics按遍历变化，不在这个最窄候选范围。

候选只改所属Client此方法：单格实际缓冲capacity设为`min(accesses.Length,1)`，分配同capacity×40字节，传同真实capacity。读取原Native trace后，严格验证written不超过实际缓冲及调用方span，再仅复制written×40字节。不能clamp坏count，不能把40字节缓冲仍声明为256条。其余result/status/trace字段原样保留，失败不能补造complete、Ready或空气。

零容量仍传0并实际调用Native，保留BufferTooSmall5/required1/written0/complete0及不写payload语义。Unavailable26的真实complete1/written1仍要复制唯一Unavailable记录，保留revision0/source0。token、keys、header、drift等前置拒绝可没有完整trace，不以status0替代。Public read保持更新中Pending gate，不能用它绕过working read的token/keys。

Runtime `IVoxelSelectivePredictionSession`借用调用方有界输出；desktop adapter直接借用span交给Native，不清空未写部分。`GasJointPrediction.RecordTrace`只读实际written前缀，验证written==required，按每条真实地址/revision/presence/source保留96字节因果证据。这支持仅copy有效前缀，不建立新的Gameplay状态。保持Runtime默认256 scratch、Reserve(256+keys×24+traces×40)、累计visits、保留证据预算、所有session/世界额度不变。

## 字节事实与限度

旧实际生产packet实读request10532/reply10376，10args/7buffers、其中trace数组10240字节。10240→40会在request和reply各缩10200；相同空keys及其他buffer情况下，算术候选332/176字节。此数字没有新候选packet或执行测量资格。只改最后copy不能缩小通用桥的fullbuffer序列化、JS切片、WASM分配/拷贝和reply；最窄候选不改通用桥格式或Native ABI。

## 后续TDD与验收

1. 新隔离Client树，只有上述方法与NEW窄测试写权限。生产codec真实构造ReadSelected packet，调用方仍256条；冻结旧10240/256的实际RED，候选40/1的GREEN。验证非空和零容量、64位token/key、负section坐标、结果所有字段、written前缀及255条sentinel不变。合成transport只证明codec，不替代Native。恶意written>actual capacity必须严格拒，不截断；所有其它query仍原容量，V1与六个V2版本不变。
2. 用完整13实际WASM和生产候选C#桥，复用已成功的真实context/world/catalog/delivery41/open/begin夹具，不能手填worldhandle或client私有状态。正式13原方法与候选在同一真实cut分别验证block、air、retained overlay、Unavailable26、zero5、stale token24、keys无序/无记录1和真实drift23；比较完整status/result/trace/SourceJournalKey/PublicationVersion，session stats/complete/close/world/context全部正常释放。真实数据准备不足时明确NOT_RUN，不能靠合成成功回复填补。
3. 只针对修改范围运行现有Client packet及Native selector/atomic capacity/缺失数据/坏借用回归一次。先给非作者exact diff/source/RED/GREEN/实际packet、Native归属与无其它guard变化，再由官方完整包消费。不要把此单格优化扩为Binding/physics/GAS实现或改全局256 quota。
4. 由Root在无重构建干扰的同配置2Human+6Bot、体素和频率不变、相同小观测器/可见性窗口中，对照working_read_cell次数与耗时、桥请求/返回bytes、outerTick/rAF长帧、输入send/ack与连续真实位移。Root先测13功能修复后的基线，再测新候选，避免将刚开放的预测负载与减少复制混成一个原因。保留probe自身成本，不净相减假造Engine成本。只有实际改进和正常双向移动/放弹/重进数据齐备才给体验结论。

这里证明的是单操作访问上限和可审查的测试接缝，尚未证明trace复制是当前真实浏览器主要瓶颈，也未实现或承诺性能改善。
