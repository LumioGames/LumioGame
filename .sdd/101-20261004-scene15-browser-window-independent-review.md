# Game15 真实浏览器窗口有限独审

裁决：`ACCEPT_FINITE_SCENE15_QUIET_WINDOW_AND_REJECT_CONTINUOUS_INPUT_ACCEPTANCE`。本次只审实际冻结的 39 件浏览器截图、时序 cut、anchor、console；没有重新审核 Game/SDK/PE/PDB/835，也没有编译、运行测试、操作浏览器或服务。

输入为 `C:/Work/LumioGames/LumioGame/.run/browser-authority-capture-scene15-01/browser-freeze-root-01/manifest.json`，SHA256 `e7869718d2cd7a161c62986ad16155e5f09a6b867cb3fd53f508e93b387e22b6`。39 件冻结文件的字节长度和 SHA256 全部与此 manifest 一致。可复核结果为 `C:/Work/LumioGames/LumioGame/.run/scene15-window-independent-review-01/result.json`，SHA256 `76d5fe969b9c1e86ae2dc5b78e015c0f0337f6377624cdffc16b27ae101d99d4`；实际选定的去重时序行保存在同目录 `window-rows.json`，输入清单保存在 `source-inventory.json`。

Quiet anchor 请求 `07:55:15.806–07:55:34.303Z`，持续 18.497 秒、零人工输入请求。十个 03 cut 的获取时间跨度为 17.837 秒；最后 A/B state 尾分别止于 `07:55:33.536/33.631Z`。因此共同有连续状态证据的统计窗口限定为 `07:55:15.806–07:55:33.536Z`，17.7308 秒，anchor 最后约 766.2ms 没有这些 03 cut 的 state 样本。页面相对时间均加各自 timeOrigin 后才比较，不直接比较两个标签的裸 performance 时间。

共同窗口内，A91/B92 的 PlayerState 和 SessionState 均为 active、Running，同 match1、session generation1、lastError 空。十个 cut 的 state、presentation、session、Tick export、render、wire 保留尾时间范围相互重叠，没有捕获范围间隙。179 个 A state、200 个 B state 及所有已采 presentation 都保留同一八 participant 集合 `03/05/07/09/0b/0d/0f/11`。A 对应 `0f`，B 对应 `11`；其余六 participant 与 freeze 的 six real Bots 声明相符，但这 39 件浏览器文件没有独立 Bot 进程日志，不能单凭它们证明六个进程各自的运行或 Tick 节奏。生存玩家实体数随死亡、复活变化，不能把八 participant 等同于每个增量 presentation 都有八个 live body。

A 的 current life 从 `...53`/generation3 经 AwaitingRespawn、观察投影转为 `...72`/generation4，再从 Protected 到 Vulnerable；B 的 `...54`/generation3 在该窗口保持。这里证明客户端观察到了真实生命周期变化，不把逐次投影时间当成服务器提交时刻。A 的两行 authorityTick 为 0 出现在生命换代附近，也不能据此称 Server Tick 停止或回到零。`firstIdentity` 属于更早的 WaitingForWorldReady 首次历史，未用于判定这个 Running 窗口。

| 共同已采窗口 | A | B |
|---|---:|---:|
| 完成的 CPU render callback / 秒 | 497 / 28.03 | 618 / 34.85 |
| callback 起始间隔 P95 / 最大，ms | 111.7 / 766.5 | 98.4 / 154.7 |
| callback 执行时间 P95 / 最大，ms | 2.8 / 120.6 | 2.5 / 5.3 |
| Tick export 次数 / 秒 | 179 / 10.10 | 200 / 11.28 |
| Tick export 执行时间 P95 / 最大，ms | 191.5 / 466.2 | 100.9 / 135.1 |
| Tick export 起始间隔 P95 / 最大，ms | 237.9 / 892.7 | 150.0 / 166.7 |

这些数字支持“该诊断场景中的客户端调用及呈现节奏存在长间隔”的有限事实。CPU callback 不是 GPU FPS，Tick export 次数不是 Server 的权威模拟频率，也不保证每次 export 都推进了玩法 Tick；采样包含诊断和包装开销。Native operations 按真实 string key 累计，原始调用数 A11590/B11385；没有用总数除以 722 推断 replay 次数。socket 的收包及 header sequence 是被观察到的 receipt，不是 Client applied ACK，更不是输入已改变权威位置的证明。

B console 留下 quiet 时间范围的六条真实诊断组，`inclusive=1`、`faults=0`，refresh 单次 inclusive 41.4–65.5ms，clock pair 10.0–13.7ms，bookkeeping partial 11.8–15.6ms；它们明示诊断本身有成本。八个桶有嵌套，不能相加或用相减求独占耗时，也不能把 on 场景的 refresh 数字称为未诊断核心成本。console 时间是采集侧观察时间，未与精确 World Tick 建立映射。A console 的 quiet 部分已经被保留尾覆盖，未假造零组、零成本。两份保留 console 中没有 error 级记录；这不证明进程全历史无错误。

输入窗口裁决为 `INVALID_FOR_CONTINUOUS_15_SECOND_MOVEMENT_ACCEPTANCE`。input00 到 input-end 的 cut 获取时间跨度 20.111 秒；anchor 总跨度 26.259 秒。实际 14 次 native down/up 请求的首次开始到末次完成跨度 15.410 秒，各玩家只有七次离散请求，而非持续按住。input cut 间隔依次 2.576、2.403、4.533、5.136、4.081 秒。B 在 input00 为 AwaitingRespawn、inputOpen=false；之后两人的 life 和输入资格继续变化。已捕获到 A7/B3 个 accepted sendMove API 调用和 A6/B3 个发包记录，不能把 14 请求逐一视为 14 已接受、已发送或已权威应用的输入；也不能用不连续、跨 life 的位置差求持续移动或确认延迟结论。

冻结记录中的 body.locator.press 和 accessibility element0 失败发生在焦点准备，没有相应 B 输入。它们是自动操作前提失败，不是游戏行为 RED。本次没有连续 15 秒双向移动资格，没有普通页面最终体验验收，没有性能改善结论，也没有按此数据提出删护栏或降低玩法负载的修法。需要另外采集合格的 default-off 对照和同 life 的连续输入窗口后，才能进一步归因。
