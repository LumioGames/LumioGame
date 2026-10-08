# 私有 PrepareDeath 首拒码诊断消费独立审查

裁决：**ACCEPT_PRIVATE_PREPARE_DIAGNOSTIC_CONSUMPTION_ONLY**。仅允许 Root 在新场景启用默认关闭的首拒码日志诊断；不计入正式发布、性能或八人体验验收。审查只读取文件，未构建、运行测试、操作浏览器或服务，未修改生产源码、pins、旧证据。

实际完整11消费冻结包含305项正式 manifest payload，全部逐字节一致，没有额外文件。manifest SHA256：f058833a218241c49b5f35078fd839dbc130ef5d3bcf5b57dbbaf3419e241867；Native：ac8afd5bf861d6818468434c51c22e94ef78863962d2a47e975046cb943767ff。失败 candidate01 和原包额外 hostentry_fault.log 原样保留；本审查未删除或消费该额外日志。

实际服务端 Gameplay DLL SHA256：c14f72e4b2dd4e4d8fa5217664ff0233eaffc9fe093c56bdc7893d453565d83f。五个实际 DLL/PDB 的 CodeView 与 Portable PDB identity 均匹配。与原生产11比较，服务端246、客户端165、Bot9、浏览器 Gameplay167、Host6个源码文档，共593项文档比较，唯一差异为服务端 BomberSuccessorLifecycle.Server.cs 的私有诊断，SHA256 1542b811bd763486659b1766c017747881b1859d277bbe685a85b29bf294f493；其原 PDB 校验和与冻结 before 源一致。其余592项比较及各域文档成员相同；编译生成的 .run 文档单列，不作为生产源。诊断不进入 Client/Bots/Browser/Host 编译域。

三个 Gameplay 域实际四项 SDK restore 使用同一个官方0.0.5-main.523c3d3 archive，archive SHA256 与 NuGet SHA512 均核对。Host22个 Lumio DLL 等于选定完整11 replica 或本次对应 Gameplay/Host，22个 WebCIL 含该实际 DLL 的完整 CLI metadata。服务端 HostEntry/SDK、SDK13、完整 Bot28、浏览器 replica20、三边 Gameplay 及 browser Host 共8个实际 PE/deps 图均没有引用或侧车版本差异。补充的实际 Bot宿主+新插件30个 PE 引用也全部匹配。

补充 PE 检查工具原始退出1及 pe-deps-verification.json 原字节保留。它把插件编译片段 Lumio.Bomber.Bots.deps.json 当成 BotHost 应用入口，产生 SDK/NativeLoader/Hfsm 三项0.1与1.0差异。这是**非适用补充检查**，不是实际宿主加载矛盾：完整 BotHost28个 DLL 与上次已审生产11逐字相同；宿主实际侧车符合定义；插件 PE 仅引用 Client.Bot、Client.Gameplay.ECS、Bomber.Gameplay、Runtime.Ecs/Coordination，均匹配选定图。BotAssemblyLoader.cs137–138 创建 collectible ALC 并登记既有 resolver；293–337 优先共享 Default 上下文并以 Default.LoadFromAssemblyPath 探测，未读取插件 deps 或使用 AssemblyDependencyResolver。没有放宽版本检查、替换程序集或重写旧 raw1。此为源码和静态身份结论，未宣称新进程 ALC 已实测。

普通页面与测量副本各835个文件，无缺失或新增，只有 main.js 不同；其余834个文件逐字相同。普通 main SHA256 25765c149ee6f2f51e12ce2a26f0884506a691688b8e217a63e938067f170f3c；原已审 v4 generator 76ea337dd8c4c757621027a6b4d7f68044a356bb55b103f9c231e4455dd4f466；测量 main 3d16f749d8cebc5c20351b659f0e1b098ab49442941a484e480f3df230d07a25。普通 UI JS/CSS 与当前 dist 和原生产11相同；Native Wasm 与 wrapper 与完整11相同。测量开销没有扣除，此诊断场景不用于性能验收。

closed97每项仍与原审核 pins 相同，实际诊断 Lifecycle 不在97闭集合，97PASS不证明无诊断。Default Env 关闭与日志源语义另由 Perf 非作者审查，本审查只证明该批准诊断进入实际 Server DLL。CLR registry 指向本次服务端 DLL，HostEntry/runtimeconfig/deps/Ecs/Replication/Native 默认文件与完整11相同。尚未启动新 DS，因此没有新进程 hostfxr/成功路径 ALC 枚举或首拒码事实。

最后712项实际源码/包/编译输出/页面身份栅栏无漂移，冻结 inspection input 同样无漂移。结论仅允许私有诊断消费，后续 actual refusal 与体验回归仍须真实运行采证。

证据目录：C:\Work\LumioGames\LumioGame\.run\candidate11-prepare-diagnostic-consumption-audit-01。primary verification SHA256 ba2ebe39bd26e24a4ce87a00e9c27f5e2ae18f8595c6e4237a75fa21b1e06a6d；原补充 PE/deps SHA256 cc5cb77079c99973fa6c29c3a486f90e4c7bbac3ce73ede700575f5db82f96b2；最终 qualification SHA256 29ca0292a1b3568c3fa4143e7174863d0d6025d6dd2b9d658bf7feb97af7be53。
