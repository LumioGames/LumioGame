# 单格trace候选：codec RED与真实13接缝准备

裁决：`CODEC_RED_CONFIRMED_PRODUCTION_UNCHANGED_ACTUAL13_NATIVE_HARNESS_PREPARED_NOT_RUN`。

NEW所属Client树：`C:/Work/LumioGames/.101-pack07/LumioClientSingleCellTraceRepair`，分支`codex/101-single-cell-trace`，基准正式13 commit `b9c2d415e09520c7946cc5eed8aec8a6c59244b1`。唯一新增源码为`Client/UI/Spectator/tests/EngineWasmSelectiveReadTests.cs`；原生产、原header测试和clean13逐字相同，tracked diff与index均空。没有提交，也没有改正式13包、Game、Runtime、Native、GAS、ABI、pins或额度。

最新封件：`.run/single-cell-trace-repair-01/red-seal-02/manifest.json` SHA256 `415930ba116833480138691d46ca403f0dfc68e24fc6172e4ee6b7c0bb92549b`，冻结26份源、DLL/PDB、原日志/XML/退出值及未执行的Native夹具。原`red-seal-01`保留，其manifest `c0a35c1b41a108fc83e7bd66591333a4aff8f96030927991dcd628f03540e65b`。

## 实际测试

严格正常源码图，以官方13的clean Runtime520ffe/Engine523c引用构建；独立Artifacts、NuGet和locks，单并行、禁止编译服务器。首次`red-01`仅NEW测试的VoxelPresence两个同名类型产生3处歧义：build1、0case，`INVALID_COMPILE`，不是行为RED。原完整测试源与log保存；只加入Coordination类型别名后跑新label。

`red-02`实际build0/0warn，新18用例=7FAIL/11PASS/0skip/0error/0notrun，测试raw1；原header16用例=16PASS/0skip，raw0。失败准确为：caller2和256的声明capacity仍是2/256；written0和1时原完整Copy覆盖未写尾部sentinel；故意坏reply的written2、uint.MaxValue、zero caller但written1没有拒绝。原header通过同时实读working_read_cell的256/10240字节缓冲；新目标是1/40，不把capacity断言先失败后的下一条buffer断言冒称已到达。

11个新通过项覆盖caller1原本合法、完整cell与trace字段保留、高64位token/key、负section坐标、零容量实际生成Native调用、status5/24/26的codec原样传递、其它四种query仍10240/256并用V2、通用桥拒绝截短reply。原16个header用例验证10个V1出口和6个V2出口不变。这些都是生产codec通过recording transport的真实调用；回复含故意腐败计数，并不声称真实Native会生成坏trace或已经真实执行zero5，更不证明浏览器因果或性能。

## 未执行的真实13接缝

`native-harness-01`已准备真实生产C#→官方完整13 WASM管道，source使用当前private构建的整个匹配DLL闭包，默认CLR装载、不改deps、不做ALC版本忽略。DynamicMethod只访问原内部构造器，输入owner来自真实Native context；生产构造器实际创建world，正式catalog和真实section delivery41，然后生产Open/Begin获得live token。没有手填private字段或假造world/DS。

同一world与同一个实际Begin token，依次生产ReadSelected caller256、caller1、caller0。Node直接调用官方bridge，冻结每个原packet/reply，不改写；比较前两者完整payload、trace和唯一access字段，第三者须实际Native BufferTooSmall5/required1/written0/complete0。正常Stats/Complete/Close/world/context释放全部成功后才断言目标buffer1/40和tail未写保持，以使正确功能基线与codec RED明确分开。caller容量变化只属于此测试的输出借用，不改product session64MiB/512或Runtime默认256预算。

准备脚本只做NEW私有文件复制/改路径和manifest固定身份，没有导入实际WASM或运行夹具。静态复核发现单独fixture在Client树会继承业务Directory.Build；`run-native.ps1`在任何执行前改为沿用前次独立BCL fixture的正常隔离flags `ImportDirectoryBuildProps/Targets=false`。原未执行脚本已在seal01保存，新脚本在seal02保存；它不是生产或测试图的NoWarn/guard变更，fixture本身仍TreatWarningsAsErrors。该harness现在仍`NOT_RUN`，不能宣称其源码已经编译或Native zero5已经通过。

## 下一步边界

Root启动13场景后，本代理停止heavy构建与Native，当前仅封存。在Root完成至少15秒真实移动/ACK/trace/帧耗时窗口并给出生产授权后，先跑旧生产方法的actual13 Native对照及目标RED，再只改`EngineWasmPrediction.Selective.cs`的ReadSelected实际单格输出extent和written前缀copy。capacity与实际内存必须同为0或1；坏written先严格拒绝，不能clamp、补complete、造空气或绕Public Pending gate。其它四query、通用桥、Runtime256 scratch及Reserve/因果trace全保持。

随后必须保留原header版本断言，并仅把原`EngineWasmPredictionHeaderTests`中working_read_cell的容量期望改为1/40，其余query仍256/10240；此一处正常回归期望更新需进入最终精确源白名单和非作者审查，不能忽略该旧测试。新codec GREEN、真实13 Native生产packet GREEN及必要原回归后才提精确候选；实际性能改善仍需Root同条件浏览器测量。当前没有生产GREEN、没有性能结论，也未恢复原正式交付验收。
