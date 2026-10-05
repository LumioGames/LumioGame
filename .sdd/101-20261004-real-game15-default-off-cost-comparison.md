# Game15 默认关闭诊断的真实窗口与受限对比

这次默认关闭 Runtime 诊断的真实 Running 窗口仍然有约 10–12Hz 的客户端 Tick，以及生命切换附近最高 500.2ms 的 outer Tick。开启诊断的部分时钟/记账成本是测量混淆因素，但不能解释全部现象。两次窗口并未精确配对，尚不能据它们给出普通核心的净耗时、某处优化收益或流畅通过结论。

## 原件与口径

Root 真关闭 on 页 91/92 后打开新 off 页 93/94，仍连接同一 DS18318/world `0000000000000001` 和原六个实际 Bot。Root 冻结的 37 文件 manifest 为 `C:/Work/LumioGames/LumioGame/.run/browser-authority-capture-off-v9-focus-01/browser-freeze-root-01/manifest.json`，SHA256 `0bc9816efcb5d982dacd4613e1c4b5203b5ffb854229e918cc37ece6a1c0a5a4`。这里只分析该封件，没有读取活日志或重新核包/PDB。

有限分析输出位于 `C:/Work/LumioGames/LumioGame/.run/browser-authority-capture-off-v9-focus-analysis-01/actual-off-result-01.json`、`actual-off-brief-01.json`；复用原 `analyze-core.mjs`，只新增 manifest 字段/文件命名 adapter。第一次 inspect 猜原 manifest 的 `frozen` 属性导致行政 TypeError，随后读实际 `path/name` 结构修正；没有改原件或当作产品失败。

请求 quiet 为 08:21:49.470Z–08:22:07.630Z，18.160s。十个 `03-quiet` 的共同末状态止于 **08:22:07.038Z**，因此共同状态 core 是 **17.5684s**，尾 **591.6ms 未覆盖**。本统计与 on 03 的相同口径是「开始 timestamp 落在 core 的真实 Tick exports」，Hz 用首末开始间距；其中 B 末个 301.3ms Tick 在 08:22:06.945Z 开始、跨过共同末状态边界，其实际 duration 来自已捕获完成事件，不能因此声称 cutoff 后两端状态仍完整。所有事件 duration 都保留，没有裁掉真实长帧。

两端 phase 均为实际 Running，match 5，可见。A participant `0000000000000001000000000000000f` 的 Self 一直为 life `00000000000000010000000000000903`、AwaitingRespawn、inputOpen=false；B participant `00000000000000010000000000000011` 从 life `00000000000000010000000000000946` Vulnerable，经该生命 AwaitingRespawn 与 observing participant，绑定新 life `00000000000000010000000000000965` Protected。合法观察/新生命初期 authorityTick=0 的实际片段未剔除，也没有将该 UI 字段强行替换为世界时钟。quiet 没有 human input exports。

## default-off 真实成本

| 项目 | A93 | B94 |
| --- | ---: | ---: |
| 开始 timestamp 落窗的真实 Tick | 213 | 178 |
| matched Tick Hz | 12.1805 | 10.1454 |
| Tick mean / p50 / p95 / max ms | 43.324 / 45.0 / 83.9 / 123.0 | 54.944 / 37.5 / 217.8 / 500.2 |
| Tick 内 Native elapsed mean / p95 / max ms | 0.495 / 1.0 / 1.9 | 0.712 / 2.9 / 10.6 |
| Tick 内 Native calls mean / max | 52.84 / 98 | 64.37 / 545 |
| 完成 Game draw callbacks | 629 | 498 |
| matched completed callback Hz | 36.0274 | 28.4571 |
| draw CPU mean / p95 / max ms | 1.597 / 2.3 / 3.3 | 2.657 / 2.8 / 161.7 |
| draw-gap mean / p95 / max ms | 27.757 / 87.3 / 152.0 | 35.141 / 100.5 / 1001.0 |
| Tick >=100ms 条数 | 4 | 11 |

这仍是 V9 被动观察包装下的 CPU 回调测量，不是纯 ordinary 无观察器性能或 GPU FPS。Native 委托计时、wire decoder+scan、JSON stringify 都只量各自部分，不能将不同边界的均值相减解释剩余唯一层。

B 的长 Tick 包括：08:22:02.044Z 500.2ms，邻近状态为 946 AwaitingRespawn → observing 11（Native10.6ms/197calls）；08:22:04.052Z 459.0ms 时 observing 11 仍存在（Native5.4ms/514calls）；08:22:05.145Z 364.3ms 邻近 observing 11 → 965 Protected（Native9.6ms/161calls）；08:22:06.470Z 422.8ms 时新 965 Protected 未换生命（Native4.5ms/545calls）。这些是邻近实际状态关系，不是精确隔离某业务操作的耗时。A 同一待重生生命里仍有 110–123ms Tick。

实际 console A81/B78条，`LUMIO_RUNTIME_AUTHORITY_CAPTURE_DIAG_V1` 均 **0 行/0 组**。没有以缺失诊断重新构造桶。on 桶与 off outer Tick 是不同边界/工作量，不能得到所谓「普通 capture=on capture减clock再减book」。

## 新页准入阶段

真实关闭原页完成于 08:21:02.726Z；新页 openA/openB 观测为 08:21:05.271Z/06.156Z。选择开始 A20.776Z/B21.371Z、实际 click 完成 A21.072Z/B21.666Z，所以 selecting 的约 15s 包含 Root 的人为等待，不能记为系统卡在 negotiating。

| 被实际记录的阶段 | A | B |
| --- | --- | --- |
| starting → wasm-ready | 780.3ms | 711.5ms |
| wasm-ready → selecting | 477.1ms | 279.0ms |
| selecting → negotiating，含人为选角停留 | 15,424.6ms | 15,271.9ms |
| Platform launch start/end，实际200 | 08:21:20.848Z /21.178Z，329.8ms | 08:21:21.437Z /21.621Z，183.6ms |
| negotiating | 08:21:21.731Z | 08:21:22.243Z |
| socket open，相对 negotiating | +30.2ms | +26.7ms |
| 首收到 SuccessorAuthorization header | 08:21:21.815Z | 08:21:22.327Z |
| 首收到 Welcome header | 08:21:21.818Z，generation123/self0f | 08:21:22.332Z，generation104/life8ea |
| 首收到世界 header | 08:21:21.820Z，直接 WorldChange/tick34140 | 08:21:22.335Z，WorldChangePart，2片/87854bytes；22.341Z直接 WorldChange 属于后续 generation105/observer11 |
| C# firstWorld | 08:21:22.393Z | 08:21:23.539Z |
| firstIdentity | 08:21:22.393Z，observing0f/charNull/inputfalse | 08:21:23.539Z，observing11/charNull/inputfalse |
| active | 08:21:22.394Z | 08:21:23.540Z |
| negotiating → active | **663.3ms** | **1297.2ms** |

最早留存的非空 match/participant presentation 是 A at17532.5、B at17868.3（页面 timeOrigin 相对毫秒），不宣称 bounded80 中的最早留存项等于所有先前未保留回调的绝对首次。收到 header 也不等于 Client 已 applied。真实 welcome 的变化保留；没有以 session attempt generation=1 替代 attachment epoch。

## 输入仅有限事实

实际 30 次 native UI down/up 请求从 08:23:40.609Z 到末次完成 08:23:58.149Z；请求窗口 end08:23:59.625Z，总 19.016s。七个 cut 间最长 gap4.260s，且 A 已 inputClosed。A 无 C# move exports、无发送命令，同完整生命903的224个位置采样无变化。B 有14个 accepted move exports、13个 InputCommand 实发，两个生命9e3与a15里观察到约0.175单位的步进；它们只证明实际小范围位置变化，不能宣称双人持续移动15s通过。

B 同 socket 且真实 Welcome epoch 匹配的 send → received WorldChange header appliedInputSequence：

- generation120 / 完整 life `000000000000000100000000000009e3`：seq1–5分别12.0、639.8、833.2、1469.9、223.6ms；seq6为 UNPROVEN。
- generation122 / 完整 life `00000000000000010000000000000a15`：seq1–5分别567.9、134.8、656.3、708.4、697.8ms；seq6/7为 UNPROVEN。

这是发包到收到正式权威 header 的区间，不是本地 state 已应用 ACK/RTT/键盘端到端延迟；没有解析 RPC payload。state 仍缺真实 attachment epoch 关联，所以 client applied ACK 资格继续 UNPROVEN。离散输入之间的稀疏采样与自然生命切换没有被补成连续轨迹，也未作本窗口人类放弹同步通过声明。

## 受限 on/off 对比与下一接缝

on03共同 core17.7308s/match1：A自然生命切换，mean56.245ms/max466.2ms；B稳定生命54，mean48.017/max135.1ms。off03共同 core17.5684s/match5：A待重生903，mean43.324/max123.0ms；B自然生命切换，mean54.944/max500.2ms。两次均真实 Running/八人/同世界，发生时间、生命、实体规模及负载不同，不能逐 Tick 配对；变化不能归因于关闭探针，也不能称已性能改善。

现场资源也限制外推：Root 记录同机为16 logical CPU，旧14世界29216与六Bot、旧73/74 Results浏览器仍在，另有新15世界42292与六Bot及93/94。多场景并行的额外负荷不代表产品单场景常态。quiet期间没有重 dotnet build；Root在08:24:11之后才开始 NativeTest build，未将之后构建倒算为 quiet 期间负载。本代理没有停止任一服务或页。

default-off 中长帧仍实际存在，支持继续调查 typed authority 采集/复制及生命周期全量工作，但仅低 Native 时间不证明 managed 独占。前一 on 报告的 inclusive6组只把 typed generatedCapture/fieldSink/copyFields 列为可测候选，不作主要根因裁定。下一步只读核正式0247源的逐 Tick CapturePersist过滤、容器 clone、CreationOrder访问规模与 generated string dispatch；任何候选都必须保留真实 authority typed 更新、预算、容器隔离复制、silent写回与未知字段拒绝。没有 production 写入或性能修复授权。
