# 普通浏览器 UI 循环与现有 v6 观测能力

结论范围：**STATIC_CHAIN_CONFIRMED / LIVE_ROOT_CAUSE_UNPROVEN**。只读完整 12 当前普通发布和相应源，不改共享代码，不启服务，不运行 Native 或宽测。独立冻结目录为 `C:/Work/LumioGames/LumioGame/.run/browser-ui-loop-readonly-12-01`。普通 main SHA256 `25765c149ee6f2f51e12ce2a26f0884506a691688b8e217a63e938067f170f3c`，v6 generator SHA256 `0f9927196556e6bd7c6d1a9db7510a7449be2f857b2a37d7b29775cdd67ee7ef`。已核当前 main、game-view、player-controls 与实际普通发布逐字节相等，fresh dist/presentation.js 与发布相等，发布 replica-voxel-grid 与完整 12 Client clean source 相等。没有将旧现场性能值当当前包测量。

## 三条真实调用链

**同步与投影**：`games/101-bomber/Client/UI/Spectator/main.js:691` 每轮同步执行 C# Tick → SessionState/JSON.parse → refreshVoxelWorld → mapDimensions → DumpPositions/parse → PlayerState/parse、状态 DOM → PresentationState/parse → game-view.update → terrain 两层读取 → adapter.project/events → view.push。Registry 声明 20Hz，period=50ms。末尾累计 deadline；工作时间计入周期，长帧跳过过期 deadline，不追赶补 Tick。JS 主线程尚在做这一轮工作时，rAF、输入事件和其他 timer 不能穿插运行。

正式 `GAME_VIEW` 的 `main.js:207–215` 只记录位置即早退，**不会绘制隐藏 classic canvas，也不会多做其体素 ReadBox**。game-view 的地形读每次先读 ground、再读 obstacle；ReplicaTerrain 即使返回相同 cached rendering bytes，也已经完成两次 ReadBox、转换与比较。每层 19×19 产生 361 个格，共 722 格；这里是只读表现投影，不是另一个地形玩法真值。`SpectatorReplicaHost.ReadBox` 把实际 Native read cells/sections 序列化为 JSON，再由 JS grid 解析和转换 typed arrays。数量来自当前正式地图尺寸与真实调用形状，成本尚未量测。

**画面**：`Client/Presentation/src/index.ts:createPresentation` 另起 rAF。每次 feed.sample → view.update → hud.update → touch 更新 → audio.update，然后预约下一 rAF。view/runtime.ts 更新玩偶、炸弹、地形表现、粒子、相机和 labels，调用 Three WebGLRenderer.render。世界输入/同步 20Hz **不等于**画面 20FPS。RendererHost 的现有自适应像素比根据调用间隔而非纯 renderer GPU 耗时调整；index 先把 dt 截到 100ms，不能从该内部 dt 还原更长停顿。

**输入**：`player-controls.mjs` 首次按键/触摸方向立即调用 move(turn=true)，Map 保留当前 held 方向；系统 key repeat 不重复插入 held。独立 `setInterval(50)` 每次再次请求 Move，同时保留炸弹 begin/held/end/cancel 边沿。释放移动只删除 held 并停 timer，没有发 neutral Move；正式 MoveAbility 每次 GAS Execute 处理一拍距离，未另起本地 held 玩法循环。普通 UI readiness、遮罩、focus 和 document.hidden 会阻止或清空输入，blur/hidden 会取消炸弹 held。touch-controls 只在方向变化时向这套 player-controls 交付方向，连续 held 仍由上述 timer 执行。

C# SendMove → AbilityComponent.Activate 发布正式请求，ClientSession 下一 owner Tick drain、编码、绑定序列、经唯一 manager 的 joint prediction 入队，然后 transport TrySend。输入不是 keydown 当拍直接写 World。`ClientSession.DrainReplicaOutbound` 用同一 InputCommand.Sequence 关联预测 ledger 和 outbound；权威 AppliedInputSequence 提交后转入 prediction ConfirmedSeq，`PlayerState.appliedInputSequence` 是该已提交客户端确认值。

## 插值与位置来源

PresentationFeed 缓存最近两帧；新 authority Tick 来时 a=旧 b、b=新帧，alpha=(当前时间−最新接收时间)/50ms，截在 0..1，不外推。同 tick 的投影替换 b，保留原 recvAt，不重新启动插值；这是原来的体素同 tick 补发行为。teleport/换 life 时 interpolateXZ 直接取新位置，不跨旧生命插值。hitstop 冻结表现 sample，slowMo 缩放动画时钟；不冻结规则或输入。

当前本机 Self pose 来自同一 confirmed manager 的**已完成** PredictedWorld，仅唯一 Self 的玩家 Transform 可以取该已发布位置；remote 和玩法字段仍从 confirmed World。frame.tick 则来自 confirmed visibility 的 `_tick=change.Tick`，不是预测世界 Tick。Runtime QueryAttribute 使用 visibility.ObservedTick；不能将 phase 值未变化误当 authority Tick 不增长。

因此有两个待现场检验的条件假说：新 authority 间隔超过 50ms 时，alpha 提前到 1 后画面会等待，下一大跨度在固定 50ms 内走完；若本机预测位置变化而 authority Tick 不变，同 tick branch 保留 recvAt，可能直接替换插值终点。**未证明当前真实场景出现哪一种，也未建议改变插值或预测规则。**

## 有界、可否证的瓶颈假说

| 假说 | 当前可用的区分证据 | 不足与下一项最小证据 |
|---|---|---|
| C# owner Tick 本身耗时高，挤占 rAF 与 held timer | v6 tickNative.duration、calls.tick、tickGaps、longTasks；Native invoke 分项与 tick 总时长的比例 | Native invoke 包含 JS ABI 调用边界，不是纯 Rust CPU；残差不能直接等于 GAS 某方法。先量当前包分位值与同步重建尖峰。 |
| Tick 后的 dump/JSON/ReadBox/terrain/adapter/feed clone 使整个 pump 超时 | v6 各 C# export 耗时、readBox 调用、Native 外层样本；tick 很短但 tickGaps 长 | v6 没有整个 pump span，也没拆 JS JSON.parse/adapter/structuredClone。先以当前导出耗时和 render callback 排除大项，必要时再加窄观测。 |
| 同步到达稀疏造成位置停等，即使 rAF 正常 | socket gaps、presentation frame.tick/pose、actualRenderFrames 稳定但 dump 坐标间隔变长 | recv gaps 含 Welcome/authorization/体素分片等所有消息，不是 DS Tick。需要 DS 实际 host/applied Tick 与 send 帧日志同窗口对齐。alpha 和实际绘制坐标未被 v6 保存。 |
| 渲染/UI CPU 成本高 | 实际 game draw callback 的 duration、间隔、drawCalls，tick/export 较低时仍出现长 render callback | callback 汇总 view/HUD/audio/touch/Three render，不能拆 scene 与 DOM。GPU/compositor/scanout、draw triangle 数、renderer pixel ratio 没被记录。 |
| 输入事件/held timer与 owner Tick 相位或主线程阻塞造成延迟 | sendMove 等真实 export 调用时刻、sent sequence 时刻、对应 confirmedSeq 首次增长及 own published pose | v6 没有 keydown/keyup 时间、事件队列延迟或被 readiness 挡住的尝试；accepted export 到 wire 可按批次推断，不能逐事件精确归因。 |
| 隐藏标签、focus/遮罩或表现 hitstop影响观感 | visibility 变化与分段 tick/render/输入数据；PlayerState inputOpen/lifePhase；故意前台与后台窗口对比 | v6 不记 focus activeElement、HUD blocked、feed.frozen/timeScale。hidden 的实际 browser timer 频率必须现场测，不宣称一律 1Hz，也不把 hidden 样本混入前台 FPS。 |
| 测量器自身造成周期性长任务 | observer.exportProjection、serialization.stringifyMs/pass、drawObserver 时间、sample.at 与长任务窗口 | 500ms observer 的 TextEncoder、修剪、DOM textContent 与其他 bookkeeping 不全计入 stringifyMs。外层 tick/render 保留扰动；需要相同普通 bundle 的真实无测量对照。 |

## v6 的量测边界与现场读取方法

`actualRenderFrames` 只计成功返回且 game-stage 内至少有一次正常返回 GL draw 的 rAF callback；用它的 timestamp/at 间隔量**实际 CPU draw callback cadence**。独立 `renders` 只是 rAF heartbeat，不能叫游戏 FPS。正常返回不是 GPU 完成、GL error 无错或已显示像素。callback duration 包含其整个 CPU 回调；drawObserver 自身只记录 draw 包装 bookkeeping。

Tick 样本量 `tickNative.duration`；Native 分项只计经过 engineInvoke 包装的调用。C# export 返回后 observer 额外 JSON.parse/压缩投影另记录，不改结果，仍占 JS 主线程。socket message 回调时间是浏览器交付事件时刻，不能当网卡到达或 DS 发送时刻。字符串 received `bytes` 用 string.length，不能无条件当 UTF-8 精确网络字节数。Fetch timing 到 response 返回，不含后续 body 解析。

量 input ack 时，先按 page、socket、connectionGeneration、Self/life 段分组，序列用整数字符串/BigInt。对每个实际 sent InputCommand.Sequence 取同代首次 states 中 confirmedSeq≥该值的时刻，报浏览器 send→客户端已观察确认延迟；不要跨换生命/连接把 sequence 相连。该值含客户端下一 pump 才观察的量化延迟，不是裸 RTT。C# export accepted 不等于 authority 接受，更不等于已渲染。

现有 tail 上限：一般 600 条，state/pose/presentation 80 条，longTasks/visibility 等 80 条，DOM 1MiB 超限还会再修剪。20Hz 的 80 行约 4 秒；60Hz 的 600 render 行约 10 秒，实际受丢弃/预算影响。累计 count、firstIdentity/firstWorld 等不等于全程完整时间线。每个输入/重进窗口需及时另存现有真实 payload，保留 dropped 字段；不能用结束时一份短 tail 计算整局或十次重进的全程分位值。

前台/后台机制引用官方浏览器 API 文档：rAF 通常跟随显示器刷新，多数浏览器暂停隐藏页 callback；timer 可因后台策略或忙主线程延迟，focus 与 visibility 也不同。具体本机 policy/豁免以实际 visibility 与 cadence 为准，不据一般政策直接归因。[requestAnimationFrame 文档](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)、[Page Visibility 文档](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)、[setTimeout 文档](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout)。

等待 Root 真实现场日志后，优先在同一有效 controlled life、前台、持续移动窗口报告 DS host/applied/send cadence、浏览器 received cadence、C# Tick 分位/长帧、game draw callback cadence、confirmed input 延迟和 position delta；不把这些静态假说先写成根因。
