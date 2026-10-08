# Old14 当前对象状态私有读取器准备

本封件只准备取证工具，未执行 snapshot、debugger attach、诊断 pipe 连接或进程暂停。旧 DS PID29216 的 CLR 实际为10.0.11；Windows 诊断管道 `dotnet-diagnostic-29216` 存在。它不自动提供任意私有字段读取接口。[微软诊断端口文档](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/diagnostic-port)

唯一建议的取证路径是 Root 审核后单次 Windows PSS 内存快照，再在独立进程中的 clone 读取白名单。快照会短暂停 DS，并复制其地址空间视图，尽管本工具不把 whole dump 写入磁盘。`AttachToProcess(suspend:false)` 不能提供官方支持的运行中 GC 堆一致性。[ClrMD 入门文档](https://github.com/microsoft/clrmd/blob/main/doc/GettingStarted.md)

私有目录：`C:/Work/LumioGames/LumioGame/.run/live14-clr-diagnostic-feasibility-01`。共享生产、旧 RuntimeOfflineDeath 七源、Runtime controlled-readmission 控制案、服务和冻结发行文件均未修改。

## 实际可用工具与通道

已安装 dotnet-dump10.0.745401、dotnet-stack10.0.745401、ilspycmd9.1.0.7988。dump 工具中实际 ClrMD 包4.0.743101，DLL fileVersion4.0.14.43101，SHA53bb16544e52b244d6f16741b977c7478f6f8b4eabd005a575cc973645a0057a；DiagnosticsClient fileVersion0.2.14.45401。匹配 DAC 位于 `C:/Users/g923/.dotnet/shared/Microsoft.NETCore.App/10.0.11/mscordaccore.dll`，本机 Authenticode 检查为 Valid。

工具 help 初试因子 shell 缺 DOTNET_ROOT 未启动；设置本机已有根后 stack help 正常。ilspycmd 要求 net8，机器只有 net10；仅给离线反编译子进程设置 roll-forward Major 后读取了已安装 ClrMD 的类型定义。没有安装运行时/工具，也没有对 DS 设置环境。行政启动失败保留在会话工具记录，不计行为 RED。

dotnet-stack 的实际实现启用短 EventPipe SampleProfiler trace 并 rundown，得到调用栈，不能得到 Prepare 的返回值、对象字段或 credits 状态。它也有采样开销和临时 trace，故未针对 DS 执行。[实际 dotnet-stack 实现](https://github.com/dotnet/diagnostics/blob/main/src/Tools/dotnet-stack/ReportCommand.cs)

已安装 ClrMD 的离线反编译核实：CreateSnapshotAndAttach 在 Windows 使用 WindowsProcessDataReaderMode.Snapshot；它调用 PssCaptureSnapshot 的 PSS_CAPTURE_VA_CLONE，取 clone handle，Dispose 调用 PssFreeSnapshot。没有 dump 文件写入分支。本文没有把这些静态 API 核对称为实际 snapshot 成功。[DataTarget 官方实现](https://github.com/microsoft/clrmd/blob/main/src/Microsoft.Diagnostics.Runtime/DataTarget.cs)、[Windows PssCaptureSnapshot API](https://learn.microsoft.com/en-us/windows/win32/api/processsnapshot/nf-processsnapshot-psscapturesnapshot)

## 实际绑定身份

OS-only inventory 为 `availability.json`；执行 guard 为 `tool/guard.json`。PID固定29216，启动UTC固定2026-10-04T04:06:28.3138207Z，执行路径固定旧14 profile 的 complete14-runtime-copy/server/win-x64/lumio-ds.exe；收集前后都验证 startTime、路径、EXE、DAC 和七个实际模块的字节 hash。

| 模块 | 实际 SHA256 |
|---|---|
| Native | e15c2b124d339a000b5348d47cdf4ef7571e55ff8447637386795e0cf0034c89 |
| HostEntry | dc498450d6f48058c0d136d6b9eef2c54b7ac576e27366b8a465394a6be830fb |
| Runtime Ecs | ab5da26d1329e2e7671a1ad4c01a85bcf28a4ccee7b58e9e53cc149382b393e9 |
| Runtime Replication | d1747079aebb82cbade1407c125b89782d080045c2f316080c9e474876687f43 |
| Game | 7fd2785122ef064a1234ee7193893fcd3d835dbb03f609fab5cb970a56aeb184 |

其余 CoreCLR/hostfxr/EXE/DAC 路径和哈希在 guard；没有读取 boot、launch、environment、command line 或票据。

## 白名单与读取根

入口是 Server008861 `Application/HostEntry/src/Lumio.Server.HostEntry/HostEntry.cs:147` 的 static ActiveWorld，然后 ActiveWorldContext 的 Manager/Bindings。只对该已挂载 root 读字段，无须遍历全堆寻找可能未 rooted 的旧 Manager。必须匹配 Manager/Binding 的双向引用、唯一 static root、World.InstanceId=1、server 和未 disposed。

Runtime 源基准为正式14使用的520ffe482e1c48fb6e48187925eecec986cdb9c8。无 SDK/Game/Native API、getter、ToString、方法反射调用或消息入队。

| 来源 | 允许数据 |
|---|---|
| World/Manager | tick、incarnation公共ID、planning/fault/disposed、result/reservation/publication债与原限额 |
| World._idToSlot/_slots | 仅 participant0f、life3a2 两条，Record.IsLive/LogicTransform有无/controlled attachment revision/admission generation |
| 两条 record 的 ObserverComponent | 原 raw `_connected`、`_connectionGeneration`，不调用属性 |
| Binding._connectionToEntity/_profiles | value=3a2 的 route 存在性、同 key 对象引用的 profile 整数，最多4条；不读 key 文本 |
| Manager._successors | Participant=0f 的最多16条；非认证 reservationToken三个数字/ID、Original.Binding.NetEntityId/Generation、profile整数、Connection引用编号、Connected、Consumed、OrderAttached、ProofRetired、cleanup/order/witness/request/grant/Welcome有无、Attachment/creationLifeGeneration/bytes |
| Manager._successorPublicationCredits | Entry.Participant=0f 的最多32条，包含不再位于当前reservation数组的旧 entry；key.Token/RequestId/固定Operation、entryToken/是否仍在数组、Bytes、Result有无及其固定Operation/RequestId/NewAttachment.Generation、drained/complete/consumed标志、abandoned、BaselineClosedTick；不按当前epoch过滤 |
| Host ActiveWorldContext | ParkedRevision、ParkedCut/PendingDrain有无、PendingDrainTerminalIndex；这些只是当前 Host 字段，不能冒称实际 writer ACK |
| World._spatialIndex._committedBoxes | 只 life3a2 的 managed 原 resident-book 条目，有无、Aabb3六个double值、finite/ordered；非finiteJSON记null并finite=false；不访问Native指针或查询 |

唯一下游字符串读取是原固定 credit key和Result 的 Operation 字段：observe/transfer/reattach/expire_attachment/supersede_eligibility，长度上限24且必须完全命中白名单。其它字符串内容一律不读取，包括 AccountId、RoomId、EntityType、Connection、profile文本、Auth、ticket 和 session；连接只能用 reader 本地引用编号。引用相同证明同一 string 对象，引用不同不证明 ordinal 文本不同；profile 若不能按引用匹配必须输出 unresolved，而不是冒称 Baseline。

## 界限和停机条件

默认 --plan 不获取目标；--self-test 只测本进程 JSON 上限和固定 Operation 白名单。只有 `--collect-approved <绝对新输出路径>` 才进入单次 snapshot。现阶段未执行这个选项。

所有数组/字典迭代有容量上限和 elapsed 检查；目标 reservations/credits/route 达界则拒输出，不截断伪装为完整。最终 UTF8 JSON 必须≤65536bytes；输出文件 CreateNew 防覆盖。异常只打印异常类型，禁止输出 message/stack/原字段。using 管理 DataTarget、ClrRuntime、输出文件和原进程对象；没有 FailFast 或刻意崩溃。

**准确时限限制：**总 traversal deadline12秒，包含前后检查并在 capture/DAC后立刻检查；PSS/DAC同步 API没有 CancellationToken，因而工具不能保证阻断尚未返回的 OS调用，不能宣称整个采集有硬12秒上限。此边界须 Root 明确接受后才执行；源没有借 timeout 擅自 kill/pause/resume DS。后续如需独立 helper watchdog，要单独审其 handle清理与中断语义，不默认启用。

即便读取成功，它只反映当前 snapshot；不能代替 death13560 现场返回码、历史 Prepare 调用栈或原 receipt/fence 时序。当前状态若与源码某 guard 前置相符，只能生成可再验证的根因假说。

## 构建与待审状态

生产修复为零。正常工具只引用已有 ClrMD，清空 NuGet feed，并复制既有工具完整 managed dependency closure。没有引用 Runtime/Game 项目、手改 DLL、修改 Version、安装 package 或运行 Native 构建。build01 是 PowerShell 将 ArtifactsPath 参数拆成两个 MSBuild 项目的行政 MSB1008（raw1），未编译也未获取目标，原记录保留。build02正常0/0warning/0error；Root最后 bounds/Result两项补充后 final build03正常0/0warning/0error、1.99秒。final --plan/--self-test 均 raw0，本进程检查没有 Process.GetProcessById/target获取。

最终源SHA：Program3ca620fdcf44089cd10fd74a6dbf35e8f207063b5fa3d8e71321ec12ae7f030e；CaptureReader174d7966909e216739c52de888505c80648d93ca3eedcfecfe64b97f134c36fb；FieldReader58b3d6e0574be3f275148ec6abef6a050c2dcb85022143d63dd0be7bcda765b6；Guarddb62aa43f9dff0ee2526e377c1b75fc5850bc4fb15cb5f06c69c8d1655b7a3bd；csproj2d2c75e43ba99f73dd331bae13d184261ea0fbf83750026e49236c97df475ce7；guardJSON8dcc3ea139eda638ff86792c02497c66f033b98c52901afd165c1b811ab48271。

最终裁决为 **PREPARED_BUILD_VERIFIED_COLLECTION_NOT_RUN_PENDING_ROOT_SOURCE_REVIEW**。不是 author自批，也不是根因/生产修复/浏览器通过。源码停止写入；seal-01 独立冻结源码、正常工具全输出和原日志，PDB检查将绑定四个真实源。Root可以只读审封件，不需要再次编译。
