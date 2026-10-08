# 完整12真浏览器性能只读分析

结论：保存的同时段数据确证 DS 仍约20Hz逐拍提交，而浏览器 completed game draw 约46–49FPS、C# Tick约17–18Hz；A 首次移动前包含生命周期重绑定的独立窗口下降为34.813FPS/13.250Hz，并有238.1ms Tick及393.6ms画面间隔。数据支持客户端长帧与更新中断已发生，尚不能判定单一根因。A 首次Right在客户端返回accepted后68.6ms变failed，未产生第二条网络InputCommand，因而没有可测的成功移动输入确认延迟。

范围为 ACTUAL_LIVE12_RETAINED_SAMPLES_ONLY_NOT_BROWSER_ACCEPTANCE。只读分析01/03保存快照与首次定长DS日志前缀；未运行浏览器/Native/构建/服务，未修改生产或pins。原始文件与脚本、逐样本统计在 [证据目录](C:/Work/LumioGames/LumioGame/.run/live12-experience-analysis-01)。当前服务最终失败与重进未通过，不能用早期B活跃画面验收。Root报告的新Tick10783 Fatal位于本次前缀之后，未借本次前缀声称独立验证其异常。

## 时间范围与来源

performance.timeOrigin + performance.now 转换到同UTC，A origin1791076713102.2、B1791076713880，相差777.8ms；不能直接比较两页relative at。所有所选窗口保存visibility为visible，保留列表中没有hidden转换；该事实不等于排除浏览器全部后台调度策略。

1. 两页实际渲染尾段重叠：2026-10-04T01:19:14.178Z–2026-10-04T01:19:26.332Z，12.1537秒。
2. 两页state/presentation尾段重叠：2026-10-04T01:19:21.479Z–2026-10-04T01:19:26.323Z，4.8449秒。
3. A首移动前自有state/presentation尾段：2026-10-04T01:22:03.858Z–2026-10-04T01:22:09.833Z，5.9752秒。
4. B后续自有state/presentation尾段：2026-10-04T01:22:28.733Z–2026-10-04T01:22:32.936Z，4.2034秒。

03两页渲染尾段无重叠：B起点2026-10-04T01:22:19.242Z已经晚于A终点2026-10-04T01:22:09.870Z。窗口3与4不能作同时段A/B对照，也不能将4补回A故障时的同房间画面。01根at=2026-10-04T01:19:26.591Z、03根at=2026-10-04T01:22:33.238Z；每页probe.sample具有独立采样时间，统计采用实际事件时间。

浏览器01 SHA256 c95463b649da0a63d6c4c26a70b833acfb7f65bc04818041806abf030b295603（3,020,779 bytes）；03 SHA256 4da41560488452187d965778c88bbf7ca5dbf9c640159b8889d1f9cf18d2205c（3,278,225 bytes）。DS首次read起点01:26:56.672Z，固定14,694,481 bytes SHA256 cfa1b3b30d406f078eb742c41d948bc0395e422ffb2b66d71e8d99cd4496c5de，完整行68,132；最后解析Host10517/applied10517/frames7 at01:26:56.656394Z。它是当时日志的前缀，绝不是后续完整日志最终hash。stdout也是1,166 bytes前缀；复制前后长度/mtime/readUTC详见input-manifest.json。

## 实际画面与客户端Tick

下表量纲为ms，FPS按唯一rAF timestamp的(N−1)/span，不用所有rAF心跳或DS20Hz代替游戏画面。只计完整结束、visible、active且执行game draw的回调；各窗口duplicate timestamp均0。CPU回调已结束不证明GPU呈现/屏幕扫描完成。Tick只计at/end完整落在窗口内的C#导出调用。分位数为nearest rank。

| 窗口/页 | 唯一draw数 / FPS | draw间隔p95 / max | Tick数 / Hz | Tick mean / p95 / max | Tick间隔p95 / max | 长任务数 / 窗口覆盖 |
|---|---:|---:|---:|---:|---:|---:|
| 1/A | 565 / 46.255 | 37.5 / 284.8 | 205 / 17.001 | 25.329 / 54.2 / 265.6 | 104.1 / 299.4 | 30 / 17.2% |
| 1/B | 594 / 48.862 | 37.2 / 74.9 | 217 / 17.913 | 22.938 / 48.2 / 78.7 | 99.9 / 114.7 | 21 / 10.6% |
| 2/A | 221 / 46.051 | 38.3 / 74.9 | 79 / 16.456 | 27.07 / 58.7 / 84.4 | 104.4 / 110.2 | 19 / 24.5% |
| 2/B | 227 / 46.936 | 37.9 / 74.9 | 76 / 16.147 | 26.862 / 59.5 / 78.7 | 109.6 / 114.7 | 18 / 21.9% |
| 3/A | 209 / 34.813 | 75.9 / 393.6 | 79 / 13.25 | 33.314 / 163.3 / 238.1 | 242 / 572.5 | 14 / 36.3% |
| 4/B | 208 / 49.335 | 36.2 / 94.2 | 79 / 18.8 | 20.981 / 38.3 / 99.7 | 90.5 / 140.2 | 3 / 6.6% |

窗口1 A/B draw CPU平均1.555/1.422ms，p95=2.2/2.0ms；窗口3 A平均2.568ms、p95=2.7ms、max109.3ms。窗口1 A/B画面间隔>50ms各16/9，窗口3 A=12且>100ms=10。longTasks表为保留>50ms条目与窗口重叠时间之和，首保留条目均早于所选窗口；不等于全部CPU工作分解。

A窗口3当前Self132/Vulnerable→132/AwaitingRespawn→participant0f/AwaitingRespawn→153/AwaitingRespawn→153/Protected，包含两次权威0观测。原始跨段authorityTick最小差−4744应保留为跨生命周期事实，不能解释为同generation权威回滚或平均同步率。所有state缺connectionGeneration，故只列相邻观测life/phase边界，不伪造generation分段。

## 同UTC服务端提交与收帧

| 窗口 | Host / applied范围 | 冻结DS行范围 | 提交行数 / Hz | 提交间隔p95 / max | 非committed / applied未推进 |
|---|---:|---:|---:|---:|---:|
| 1 | 1268–1510 | 3319–4857 | 243 / 19.998 | 64 / 71 | 0 / 0 |
| 2 | 1414–1510 | 4245–4857 | 97 / 20.029 | 64 / 68 | 0 / 0 |
| 3 | 4662–4780 | 26278–27124 | 119 / 19.997 | 64 / 74 | 0 / 0 |
| 4 | 5159–5242 | 29698–30218 | 84 / 20.029 | 64 / 72 | 0 / 0 |

这些行的Host和applied每拍都增1，pending_inputs全部0；窗口1–3常规frames8、含少数14，窗口4frames7。frames是Host发出的world frame总量，未记录每位玩家物理WebSocket.send时刻，不能据此声称每页每50ms准确收到一帧。A首Right附近同样继续提交，详见A-first-move-ds-context-prefix-lines.log。

同一物理socket两次快照之间，A从01:19:26.333Z到01:22:09.927Z关闭累计新增3380条/163.5936秒=20.661条秒；B从01:19:26.452Z到01:22:32.955Z新增3862条/186.5037秒=20.707条秒。这是包含authorization/section/life流量的所有WebSocket message速率，非游戏同步Hz。socket.gaps没有事件at或最后接收anchor，不能把末600个gap强行放进上述同时段窗口；下方单独列其untimed尾段。socket.bytes中字符串按length计，不能用作UTF8精确带宽。

## 原Tick顺序中的投影与Native

已冻结普通main的真实pump顺序为Tick→SessionState→体素/World和dump/player投影→PresentationState→ReadBox两层→JS adapter/feed→下一deadline。现有probe没有整个pump的开始/结束；以下projection按导出开始时间选样，后续导出/ReadBox返回可能跨窗口末端，绝不将它与完整内窗Tick数作一一相加。成功presentation/call累计数相等、ReadBox累计数严格为2倍，fault0，允许将末80/160个无at时长按实际序号对齐；详细逐样本值保存statistics.json。

| 窗口/页 | 选样数 | Presentation C# mean / p95 | 两次ReadBox C# mean / p95 | Tick.end→Presentation.start mean / p95 |
|---|---:|---:|---:|---:|
| 2/A | 78 | 2.844 / 3.9 | 3.751 / 5.3 | 1.272 / 2 |
| 2/B | 77 | 2.952 / 4.1 | 4.075 / 5.6 | 1.375 / 1.9 |
| 3/A | 79 | 2.424 / 3.5 | 3.562 / 5.4 | 1.586 / 2.1 |
| 4/B | 79 | 2.373 / 3.1 | 3.43 / 4.9 | 1.044 / 1.6 |

ReadBox是正式19×19×2渲染读取；不能用任何Native计数÷722推导预测replay。以下只按真实STRING操作名合计Tick包围内包装调用时间，包含JS→Native入口周围测量，受0.1ms计时粒度影响；未测包装bookkeeping全部成本，也不能将Tick减此数直接命名纯managed耗时。

| 窗口/页 | Native calls/tick mean / max | Native包装mean / p95 / max | 包装总ms/Tick总ms | begin_update / complete_update总数 |
|---|---:|---:|---:|---:|
| 1/A | 39.863 / 452 | 0.299 / 0.7 / 2.5 | 1.2% | 254 / 254 |
| 1/B | 36.018 / 66 | 0.255 / 0.6 / 1 | 1.1% | 243 / 243 |
| 2/A | 39.506 / 66 | 0.316 / 0.7 / 0.9 | 1.2% | 97 / 97 |
| 2/B | 40.211 / 66 | 0.279 / 0.7 / 0.9 | 1.0% | 95 / 95 |
| 3/A | 51.519 / 386 | 0.506 / 1.7 / 6.4 | 1.5% | 118 / 118 |
| 4/B | 34.203 / 96 | 0.232 / 0.5 / 1.1 | 1.1% | 84 / 84 |

A最长238.1ms Tick at01:22:08.918Z含begin/complete各12、clock_now348，包装合计2.4ms；186.3ms Tick at01:22:05.728Z各11、clock_now319，包装1.7ms。另163.3/164.5ms Tick各有world_create2、section_delivery4等。多事务、重新建world与长Tick相邻是确证的相关性，不据这些调用数裁定输入replay次数或性能根因。

## 观察成本及不带时间的保留尾段

| 页快照 | projection observer n / mean / p95 | JSON.stringify n / mean / p95 | 最后body / DOM bytes | 无at收帧gap p95 / max |
|---|---:|---:|---:|---:|
| 01A | 55 / 0.207 / 0.3 | 103 / 1.94 / 6.8 | 836994 / 831716 | 85.9 / 644.5 |
| 01B | 55 / 0.227 / 0.4 | 103 / 0.952 / 2.4 | 864868 / 859425 | 86.3 / 148.8 |
| 03A | 54 / 0.18 / 0.3 | 471 / 4.951 / 7.7 | 903318 / 911328 | 99.5 / 519.6 |
| 03B | 55 / 0.187 / 0.3 | 476 / 4.845 / 7.7 | 912504 / 914481 | 82.2 / 523.8 |

以上observer列只计PresentationState结果解析/compact projection；stringify只计序列化，未包含TextEncoder、DOM写入或整个每400ms发布任务，不能认定instrumentation成本已消除或用此表扣除长帧。03A/B stringify平均约4.9ms、p95=7.7ms，发布body约0.9MiB，对实际浏览器有扰动可能；缺时间戳不能独立归因某个长帧。drawObserver另有累积hook测量52.9/43.5/312.4/292.5ms（01A/01B/03A/03B），包含所有底层draw hook而非完成画面数；不能跨观察区间或同C#开销相加。

## A首输入失败与确认边界

A sendMove(2,0,true) at216741.79999995232ms，即2026-10-04T01:22:09.844Z，原C#返回true；failed stage at216810.39999997616ms，即2026-10-04T01:22:09.912Z，相隔68.6ms；normal_logout/code1000 socketclose at216824.9ms，即01:22:09.927Z。选角seq1 at20283.1ms、generation1、server.rpc、observedSelf0e是唯一实际wire InputCommand，未trim sent列表、dropped.sent=0。不存在移动seq2，因此成功send→confirm延迟=不可测，绝不是0ms。

最终Tick at216770→216810ms duration40ms，Native包装31调用约1ms，含voxel_prediction_begin_update1、voxel_prediction_working_read_cell1、随后session_close/world_destroy等；该Tick没有complete_update。probe.faultCount=0、faults=[]、console-errors=[]，公开fault-detail仅statusfailed而无异常码。观察说明失败发生在首输入已接受、下一wire输入尚未发出的区间；不能凭此断言working_read返回特定错误或归因quota。Root正在独立取内部异常，当前报告无修复裁决。

01B选角seq1在同Self10末80样本都已confirmed1，最早保留样本距send27,507.9ms；这是左截断上界而非真实ACK延迟，且state没有generation。01A/03A/03B当时Self与seq1 observedSelf不同，不能把新life的confirmed0/1跨代当作旧输入ACK。当前真实移动/放弹双向同步与十次close/reopen验收均未由这些样本证明。

## 后续必要证据与结论限度

最小下一步是定位首Right对应内部失败码，并在修复后保留新同life/socket/generation的timestamped send/authority确认窗口；实际长帧可先对齐多事务/World重绑定的exact Tick阶段。需要新的可见同UTC数据才能评估双页性能变化。whole pump span、原始keydown到export、实际feed alpha/frozen、已画pose、GPU完成、逐页DS物理send尚无观测；不因当前Native包装比例小就宣布另一个层的根因。晚期Bot、DS和launcher退出是独立完整失败，未被本次早期near20Hz抹去。

首轮独立重算以 window − timeOrigin 反推 relative 边界，浮点抵消使边界回调少1，sanity assertion退出1；它是私有算术检查错误，非游戏行为RED。保留finish-review.mjs与finish-review-01-failed.json；NEW02改按原始timeOrigin + at事件UTC比较，未更改任何原始样本或statistics.json。

来源/封存链：input-manifest.json→statistics.json→scope-sanity-and-lifecycle.json→最终manifest.json。manifest列所有raw/script/source/report的实际完整SHA；自身及命令重定向的行政输出不递归入表。
