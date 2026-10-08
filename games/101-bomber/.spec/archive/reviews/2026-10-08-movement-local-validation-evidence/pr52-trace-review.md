# PR52 movement trace 窄范围 Review

审查提交：Game `40556477683e46a9e248812119fb3e6bd76c07c1`（PR52 merge）。使用 `git show` 读取该精确 SHA，未把旧工作树当新版本；没有运行分析器、实验、测试、浏览器、Native 或构建，没有修改生产。范围仅限新增 recorder/analyzer、main.js 的标记接线，以及为核对 accepted 含义所必需的现有 SendMove 桥接短段。

结论：这套 trace 能提供 JS 请求、pump 耗时与**屏幕已采样**的 owner pose 线索，但目前不能直接作为真实 GAS 准入/执行次数、本地执行 tick cadence 或混合场景下回拉/朝向根因的结案证据。以下为 3 项影响本地验证解释的关键限制，均是源码 Review，并非本次运行结果。

## 1. movesPerHeldPump 是请求发布计数的时间归组，不是真实准入或成功执行数

位置：`Client/UI/Spectator/main.js:879–899,930–933`；`movement-trace.mjs:22–25`；`Tools/movement-trace-analyze.mjs:55–70,133–138`。

`accepted` 来自 `publishRequest() === true`，对 Move 即 `api.SendMove` 返回值。实际桥接 `host/Program.cs:88–89` → `SpectatorReplicaHost.cs:160–165,196–207`：它发布 Ability 请求，随后返回 true；源码也明确 Session 要在下一 owner Tick 才 drain/stamp/encode/send。此处没有返回该输入在 predicted world 的 Admit 2 冷却结果，也没有服务器执行结果。

分析器仅把所有 accepted 输入按 `input.t <= pump.tickAt` 归给下一个记录到的 pump，不读取 input sequence、实际 dequeue/admission、GAS result、execution attempt 或 pending-authority 状态。recorder 的“Inputs … are admitted by this pump”注释与输出层级 `admission.movesPerHeldPump` 因而强于实际证据。main.js 还在 faulted/closed/superseded 分支提前返回（753–756），以及异常路径不写 pump 事件；单凭时间分桶不能证明每条已归组请求实际经过那次 Tick。

**验证影响：** 直方图出现 2，只证明本桶有两次返回 true 的 Move 请求；不能据此宣布两次 GAS 准入或两步移动。它也不能单独证明第二条被冷却拒绝。直方图为 1 同样不证明该条执行成功。

**当前结果的正确叫法：** “按可见 JS pump 起点推定的请求发布批次”。若要用于 F2 因果判断，需在实际 Session/GAS 边界按同一 input sequence 增补 drain、admission、ExecutionTick、attempt/replay 与完整 activation result，再与该计数并列；DS 结果另对齐。无需运行此分析器即可确认上述证据缺口。

## 2. executionTickAdvance 是 rAF 观测差分，无法区分真正跳步与漏采 publication

位置：`movement-trace.mjs:27–37`；`main.js:479,740–768`；`movement-trace-analyze.mjs:72–84,138`。

Owner publicationSequence / executionTick 仅从 `frame(localPose)` 写入。分析器按相邻帧可见 publicationSequence 去重，再对这些帧的 executionTick 做差。pump 事件本身没有 publication 序列或执行 tick 序列，也没有逐输入/逐次发布事件。

同一同步 Session Tick 内可执行和发布多条输入，但 rAF 无法插入每次中间发布；长帧或标签节流还能使一个画面采样跨过多个 pump。源码注释“as observed by render frames”虽准确，输出名 `executionTickAdvance` 若被当作完整执行频率仍会误导。

**验证影响：** 差值 >1 不能单独证明本地模拟跳过了中间 tick；可能只是中间 publication 未被 rAF 采到。差值为 1 不能排除同 pump 曾有多个同 tick 输入/发布；差值为 0 也不能单独证明两个 Move 均执行，因为 clock/authority 等发布同样可能不推进该字段。

**当前结果的正确叫法：** “相邻渲染观测到的 publication executionTick 差”。完整频率应由 Session 的 step-before/after 与逐次 publication/input execution 事件确认；rAF 采样保留为用户实际看见的表现证据。不要用提高 rAF 采样率宣称覆盖了同一 JS 任务中的所有中间状态。

## 3. 全文件汇总未按身份、可见性或输入方向分段，会混入正常状态变化

位置：`movement-trace.mjs:21–37`；`movement-trace-analyze.mjs:37–60,74–121,124–154`。

recorder 没保存 frame 的 sessionGeneration、entity、connectionGeneration；分析器只用 publicationSequence 去重并跨全文件计算差分。`vis` 虽写入 key/pump/frame，hiddenFrames/hiddenPumps 只是输出计数，没有过滤或切段；前后台切换的长 rAF 间隔仍进入总体 timing/pose 统计。

所谓 held window 也不是 keydown 到 keyup：它只把相隔不超过 150ms 的 accepted Move 请求串起来。key 事件与 input.args 的方向/TurnPressed 没被用于分析，cause 也没有用于排除 correction/TP。于是短暂停键/改方向可能被合成一个窗口；持续按键中的一次 >150ms 卡顿则可能被拆成“停止”。方向来自最新 Target 差值，会受转向、权威纠偏、TP 或换生命位置跳变影响；不能自动充当玩法 Facing 或稳定持续 W 的方向。

**验证影响：** 跨重连/复活可能混淆序号和位移；隐藏页节流可能被计作游戏卡顿；合法转向/侧向滑动可能被计作 facing deviation；恢复供输入前的 long task 可能被当作 stop overshoot。`stopOvershootM` 还会取窗口结束后 300ms 内最后一个 target，未确保期间没有新持键/转向或身份变化。这些指标在未经分段的多场景 trace 上不能直接比较好坏或判根因。

**当前可用范围：** 用户手工截取同一 session/同一生命、始终 visible、持续单一方向、无 TP/重生/纠偏事件干扰的短段，并对停步边界另作标注。要自动分析，至少补齐身份、焦点/visibility 转换、明确 input hold/方向边界及 publication cause 分段；没有记录的身份不能仅靠事后统计可靠恢复。原始 key、args、vis 数据应保留，用于重新分析。

## 精确输入身份

| 文件 | Git blob |
| --- | --- |
| `games/101-bomber/Client/UI/Spectator/movement-trace.mjs` | `1ced96a00536fc5a0584d47c7bb9b83af8bb5fc9` |
| `games/101-bomber/Tools/movement-trace-analyze.mjs` | `9ed218ea4b32834380c7c400c2e77d6dcea6ff68` |
| `games/101-bomber/Client/UI/Spectator/main.js` | `8676462cb41df486efc019b4374f38e3d2efeeb0` |

固定源码入口：[recorder](https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/movement-trace.mjs)、[analyzer](https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Tools/movement-trace-analyze.mjs)、[main](https://github.com/LumioGames/LumioGame/blob/40556477683e46a9e248812119fb3e6bd76c07c1/games/101-bomber/Client/UI/Spectator/main.js)。

本报告不声称 PR52 已在用户页面部署或这些误判已实际发生；它限定这三个新统计面的证据能力，供用户本地验证时正确解释结果。
