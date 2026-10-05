# 单案：观察重准入后转移新生命，再受控重准入后的死亡准备

结果为 **真实 Native 控制案 PASS，未复现旧14在线死亡故障**。仅新增一个正常 replication partial 测试，没有生产修复，没有扩大矩阵或运行原类全套。原先四案源码与冻结 bin/log/seal 原样保留。该结果不能否定旧现场故障，也不代替签名 Host、实际 socket 或浏览器体验验收。

所属隔离树：`C:/Work/LumioGames/.101-pack07/LumioGameRuntimeControlledReadmissionDeath`，HEAD `520ffe482e1c48fb6e48187925eecec986cdb9c8`，与正式14使用的 Runtime 源基准一致；没有引入 RuntimeOfflineDeath 七源或 Engine DRAFT。实际 Native 来自正式完整14，SHA `e15c2b124d339a000b5348d47cdf4ef7571e55ff8447637386795e0cf0034c89`；正式14 manifest 在新封件中逐字保存。托管测试来自原正常项目图的新独立 artifacts/nuget，并非正式发布 DLL 替换。

## 新增范围和正常前置

仅新增 `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeControlledReadmissionDeath/modules/replication/tests/Lumio.GameRuntime.Replication.Tests/ObservingThenControlledReadmissionDeathTests.cs`，SHA `a08a047893a8bcf08ebab0d69c9233c2f0efc819e25db93792d6e525870fce9d`。沿用同一正常 partial class 的原 private Harness/HostedAdmissionFixture，不跨编译测试源码，也不更改 fixture。

初始C1使用既有正常 Native immutable admission plan，完整 Acquire/Reserve/Enqueue/Read逐帧ACK/Settle；真正 lethal Effect 后 Prepare/Destroy，实际观察 Self=participant。C1随后真实 Disconnect。C2使用原生产 `ReattachObservationConnectionMessage`，得到 Applied、真实participant Self的Welcome及匹配WorldChange baseline，再Create/Restore真实Native witness/Ready/Transfer至新Life。该观察重附着本身不是Rust签名socket；它是正常Runtime实际控制缝。

随后实际Gameplay transfer consume、原完整drain结清；C2 Disconnect；C3使用原HostedAdmissionFixture的真正ordinary admit、冻结初始帧读取/逐帧ACK与debt reconcile，controlled Self落同一新Life；最后真实lethal与再次Prepare/Destroy。没有人为改Observer、binding、Connected、profile、附着generation或额度；只使用既有fixture与本来需要的Gameplay LastLife/NextLife/Intent写入。正常drain/ACK不省略，不以期望RED为理由制造非法前置。

## 实际日志事实

以下Tick为日志中的执行后 `World.Tick` 计数，不能当作未投影的CommitTick。完整实体字符串和原JSON行均保留。

| 阶段 | 实际结果 |
|---|---|
| C2观察重附着，Tick5 | Welcome Self=`f123456789abcdef0000000000000003`、epoch3、previous2；Applied；credits0/publication0/reservation1008 |
| C2新生命transfer，Tick9 | Welcome Self=`f123456789abcdef0000000000000004`、epoch4、previous3；Applied；未Gameplay消费前credits1/publication143085/reservation1008 |
| Gameplay消费后，Tick10 | 当前/last新Life4、lifeGeneration2、真实C2 controlled binding epoch4；credits0/publication0，原reservation1008仍保留 |
| C3受控普通admit，Tick12 | 真实binding C3→同新Life4/epoch5；完整初始ACK与settle，Debt无retained obligations；credits0/publication0/reservation1008 |
| 再死亡Prepare，Tick14 | error=null；新Life4真正被Destroy；原slot1 allocation1→2，最终Applied观察Welcome C3/epoch6；发布前credits1/publication142705 |

Native immutable初始Welcome JSON不包含Host路由连接，解码对象该项Connection=null；测试依据实际C3绑定与计划context断言连接，未假称JSON自身携带C3或原生Rustsocket已验证。C2观察与transfer阶段则由实际Runtime路由消息记录C2。

## 验证与封存

严格正常图build：raw0，0warning/0error，86.38秒；独立artifact路径，锁定restore，无Native重建。唯一目标方法测试：raw0，**total1/pass1/fail0/skip0**，5.983秒测试时间；没有把历史四案计入本次总数。原四案源码SHA仍 `c3e9a13cd540a44a9cddf62f7694d5668c5588dbefe9a1177c32ec4383ef5dff`。

冻结整个正常 runtime-bin，含 **16个实际 Fixtures Content文件**，总封件152条；PE CodeView与Portable PDB ID匹配，新/原两份测试Document checksum分别匹配精确源码。Native输入、完整release manifest、sidecar、实际build/test命令/开始结束/原始退出与日志都在封件。不替换原发布DLL，也不改源码pins。

- result：`C:/Work/LumioGames/.101-pack07/LumioGameRuntimeControlledReadmissionDeath/.run/observing-control-readmission-01/seal-01/result.json` SHA `dd9e2b1e7ee817187d09ae9edfc790b52865e862284337d607ec5d8cd92f5d3a`。
- manifest：同目录 `manifest.json` SHA `2fb6605899bbe971e05517d86be8196677c68865fedfec4b6d391c804ee346b7`。
- 原测试log SHA `579eb7adf7bb2e5cd3f5957b8a4a884292477e9891597b1799a58fbcf77051d8`；buildlog SHA `bf5ec0425aaa9ee37b59895ac220ca5c49152fabfe5fbb346df48fded476de36`。
- NEW字节补充：`C:/Work/LumioGames/.101-pack07/LumioGameRuntimeControlledReadmissionDeath/.run/observing-control-readmission-01/source-byte-supplement-01.json` SHA `069161e47d9ea07ce0cca00f0408f7887ebe4de5f3d05620ce6a8a3cb88a4f3f`。原seal不改。

字节补充明确：原seal的trackedPhysicalChanges选择自Git clean-filter后的diff名字，不能作为完整物理EOL字节证明。直接核原38个generated路径后，它们仍有38项相对HEAD的字节差异，但全为行尾、规范化语义0；11个build前源输入全部build后精确未变。没有reset/restore/clean/stage/commit操作。原生成副作用保留，非业务源码漂移。

## 未闭合边界

此案保留合法initial协议ACK及Runtime正常drain，因而不复现Host初始publication实际writer-fence延迟/尚未结清的Runtime publication，也不是8人真实Game负载。正常路径PASS不证明旧线上私有owner/credit状态正确。旧14实际epoch61→62→63、death13560的Prepare返回码仍未投影；没有根因RED，生产源码保持原样。授权单案已完成并停止，不继续扩案求RED。
