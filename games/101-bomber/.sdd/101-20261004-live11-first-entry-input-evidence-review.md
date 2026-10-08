# Official11 live11 首入、首次输入与服务退出只读证据审计

2026-10-04，作者：reentry_trace。仅消费现场已保存数据；未操作浏览器、服务、生产源码或构建。结论：首次双端进入八参与者房间成立；本组输入尚不能证明双向实际位移、双方共同看到用户新放的炸弹或连续持键。重进只有五条完成记录，第六条因预览服务退出失败；十次体验门未通过。第2–5条虽恢复 active/权威帧，但 A 仍 AwaitingRespawn/inputOpen=false，不等于可继续游玩。

## 冻结边界

输入目录：[analysis-reentry-trace-01](C:/Work/LumioGames/LumioGame/games/101-bomber/.run/browser-experience-repair-01/live-11/analysis-reentry-trace-01/frozen-inputs.json)。原九份首次进入/输入 JSON 逐字复制，当前 hash 均与冻结记录一致。DS 全行 prefix 12,979,942 bytes 后经 final freeze 与停机后的原日志核对完全相同，SHA256 `14f4a17e564c5aa5f255293c3f0ded39e68e3a70cc99d08ae4f5b337d6f70b62`。另保存最终日志、重进 ledger/各采样、服务失败采样：[final manifest](C:/Work/LumioGames/LumioGame/games/101-bomber/.run/browser-experience-repair-01/live-11/analysis-reentry-trace-01/final-freeze-01/manifest.json)。未复制含票据的 boot 配置。

统计程序及完整计算结果：[analyze.mjs](C:/Work/LumioGames/LumioGame/games/101-bomber/.run/browser-experience-repair-01/live-11/analysis-reentry-trace-01/analyze.mjs)、[analysis-02.json](C:/Work/LumioGames/LumioGame/games/101-bomber/.run/browser-experience-repair-01/live-11/analysis-reentry-trace-01/analysis-02.json)。`analysis.json` 为保留的初版派生稿：其 B 后期文件把后来 active 覆盖首次 active，产生错误 58,327.1ms；不作为首入结论。02版按状态第一次出现取值修正。原 raw 文件未变。

## 首次进入实际可测阶段

| 指标，ms | A | B |
|---|---:|---:|
| Platform launch fetch | 110.1 | 131.5 |
| catalog fetch | 5.4 | 3.4 |
| negotiating → 首次 active | 733.1 | 616.0 |
| websocket create → open | 5.6 | 3.8 |
| websocket open → 首次 self export | 716.1 | 601.7 |
| 第一大初始化 Tick / 内嵌 Native 操作合计 | 650.0 / 12.7 | 582.3 / 11.8 |

初次 self export 分别在 performance.now 11998.7/11473.0，worldId 同为 `0000000000000001`。A life `0000000000000001000000000000000e`、participant `0000000000000001000000000000000f`；B life `00000000000000010000000000000010`、participant `00000000000000010000000000000011`。首个状态都是 WaitingForWorldReady、Protected、authorityTick=0、inputOpen=false。早期文件最终已在 Running/Vulnerable，A authority778、B788，双方都有八 participants 与八 live players。首次 playable、DS admission/分片/Self/Native恢复各精确边界未被独立记录；不能把 active=self 可交互。

selecting 至 negotiating 的约10秒包含人工选角/点击，不能计为协商服务耗时。首个长 Tick 已发生 voxel world create/destroy、section delivery、prediction session open；Native 合计只占十余ms。随后 A Tick537.3ms包含15次 begin/complete update，B Tick506.5ms包含13次。这些计数仅说明一次浏览器 Tick 消费多组更新，不能直接把所有耗时归某个 managed 方法。

## 输入、位移与放弹

所有时间来自真实 CS API 入口及 websocket send 记录；它们不是 DOM keydown 时间。`sendMove(...,true)` 是正常移动的 turn 参数，不是“只转向”。

| 动作 | 实际身份与发送 | 权威位置证据 | 裁决 |
|---|---|---|---|
| B 首次移动 | life `000000000000000100000000000000cd`，lifeGeneration6，participant11；两次 `[4,0,true]`，InputCommand1/2，connectionGeneration11 | 输入前 authority3188 `(1.5,17.5)` facing3；采样后 authority3388 同坐标 facing4，ACK4 | 朝左边界；未证 displacement |
| A 首次移动 | life `00000000000000010000000000000139`，lifeGeneration8，participant0f；两次 `[2,0,true]`，InputCommand1/2，connectionGeneration15 | 同一 after 文件保留 authority4120 `(17.5,7.5)` facing3 → 4127 同坐标 facing2，ACK2 | 朝右边界；未证 displacement |

A 的单独 before 文件仍是旧 life `000000000000000100000000000000f3` `(11.5,13.5)`，不能跨 respawn 把其位置变化算玩家移动。A 输入后与 B-after-A 输入后在共同 authority4127 对 A139、Bcd 的 life/participant/lifeGeneration、坐标和 facing 一致，证明这帧双端投影一致；不能把零位移一致叫双向走路同步。

A send seq1→首个 ACK1 采样188.5ms，前一未ACK采样间距113.5ms；seq2→首个 ACK2 采样141.4ms，前一未ACK间距45.9ms。这些是有采样间隔的上界，包含网络/排队/浏览器调度；不能称准确输入确认延迟。B 的最早保留 after ACK 已为4，采样窗口从输入后约4.7秒才开始，缺准确 ACK 转换时间。

B bombButton Down/Up 已发送 seq3/4 且最终 ACK4，但保存 after 时距动作约9秒、近动作80帧已滚出；A Down/Up seq3/4 已发，但 immediate 状态还只 ACK2。这些窗口里双方参与者0f/11的新炸弹完整 ID 共同交集为空。其他 Bot 炸弹双方可见不能代替用户放弹验收。公开 ScopeNone 的 sourceLifeId 是 null，不能补写推测归属。须在动作后及时补齐两个页面的同一 bomb fullID、owner participant、当前 life/gen、ACK 与坐标/权威tick；本轮服务退出后未再操作。

离散两次 pressKey 不能证明按住持续走路。当前工具没有 keyDown/duration；未保存真实长按持续时间。

## Tick、收帧与 rAF 尾窗

DS 9016次 commit 从22:26:27.311874Z至22:33:58.118989Z，tick连续1..9016，均 appliedTick=hostTick，无 `frames=0 && pendingInputs>0`。commit间距均值50.006ms/p50=48/p95=64/max137ms，仅一次>100ms；首次进入12秒窗240次、均值50.038/p95=63/max70ms；B/A首次输入附近分别60/80次，均值49.780/49.987ms，最大68/69ms。该场景未见原先的 host前进、applied停止的协商 hold，结算前实际DS维持约20Hz。

| 真实记录窗口 | Tick n，p50/p95/max ms | Native 调用合计均值 ms | Tick间隔均值/p95/max ms | rAF独立回调 p95/max ms |
|---|---|---:|---|---|
| 首入 A，n122 | 25.9 / 144.3 / 650.0 | 0.657 | 93.8 / 203.8 / 791.9 | 56.3 / 635.8 |
| 首入 B，n114 | 35.2 / 239.5 / 582.3 | 0.699 | 104.0 / 297.7 / 883.0 | 56.1 / 692.6 |
| A immediate尾600，154895.7..190145.0 | 16.4 / 47.6 / 246.6 | 0.295 | 58.7 / 99.8 / 592.8 | 37.5 / 335.6 |
| B after-A尾600，155087.9..189588.0 | 17.8 / 49.0 / 92.5 | 0.227 | 57.5 / 100.9 / 162.2 | 37.6 / 74.8 |

尾600Native begin_update分别704/691次，Native elapsed没有包含其后 profiler 记账；Tick也包含这一观察开销。500ms一次的有界 JSON stringify 尾均值3.99/4.47ms、max7.6/8.1ms，payload约0.77MiB，不能当完全无测量成本。faultCount=0指CS探针故障计数，不能覆盖后来DS fatal。

rAF是独立诊断 heartbeat，未钩真实 canvas renderer。其尾600等效回调率约42.3/47.7Hz，只能说明回调间隔；不能宣称产品画面FPS。这些 Numeric tail窗口独立、没有每个rAF样本时间，不能把它们与600个Tick当一一配对。可证明客户端仍有长帧及收帧/消费间歇，而Native调用elapsed通常很小；仅据此不足以归 managed 某阶段、GC或渲染根因。

## 重进与最后退出时序

ledger实际完成 A40→42→43→44→45→46 五次真实关闭/新建页面，旧页面均 absent。各次 negotiating→active 668.2、742.8、700.7、479.8、467.5ms，authority6352/6678/6770/7850/7929。同 participant0f/world1 被保留；第2–5条仍旧 life202 AwaitingRespawn/inputOpen=false。第6条46→47创建时 connection refused，completed=false，不能补造关闭/打开时间或第6次通过。

1. 22:33:58.118989Z：最后成功 commit9016。
2. 22:33:58.188338Z：Runtime tick9017 报 Result winner or survivor count disagrees with rows；Game输出标 `BOMBER_EXECUTE_FAULT tick=9016`（Game逻辑tick与host tick不同，不混写）。.190099Z host sealed runtime_failure。
3. Bot1 .195668Z tick_exception/1011，.197091Z peer_close_frame 1011；.203008Z Active→Faulted；.239007Z bot host finished。
4. .256929Z process_supervisor ds_fatal/watchdog。
5. launcher只有无时间的 `Process 6876 exited ... code=0`、raw1和VERIFICATION_STATUS=FAIL，无法单独证明其发现退出的准确顺序。bot scenario.finished/passed=true无ts，也不能代替联机通过。

有时间原记录支持服务端结算拒绝先于Bot结束。结算一致性错误及A生命周期停滞由其他所属作者独立调查，本报告不提出未实证修法。

现场实际完整包11 manifest `f058833a218241c49b5f35078fd839dbc130ef5d3bcf5b57dbbaf3419e241867`；DS日志加载Gameplay0.0.5.0、MVID `879f11c7-738b-4132-a69c-24a3fd5ceda3`（路径日志截断）。Platform/DS launch仍写 `bomber-0.0.4-main.ecece8a`，发布身份差异未闭合；不能凭本轮性能数据把它称卡顿根因。
