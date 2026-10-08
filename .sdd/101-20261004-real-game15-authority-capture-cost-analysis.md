# 101 真八人 Game15 authority capture 成本：开启诊断窗口

本报告只读分析 Root 冻结的真实浏览器原件。结论是该 Running 窗口仍有低客户端 Tick 频率和长帧；诊断开启的 sampled typed-authority capture 显示生成字段采集、字段接收与写回值得继续定位。探针时钟及记账成本明显，尚不能把这些数值称为普通默认关闭版本的净成本或把候选代码热点称为已确认性能根因。下一步使用同一正式 Game15、同一真实八人世界的 default-off + V9 对照；此报告没有性能修复或体验通过声明。

## 原件与分析边界

- 原件：`C:/Work/LumioGames/LumioGame/.run/browser-authority-capture-scene15-01/browser-freeze-root-01/manifest.json`，SHA256 `e7869718d2cd7a161c62986ad16155e5f09a6b867cb3fd53f508e93b387e22b6`。39 文件为 Root 的不可变捕获；本轮不重新进行包、PDB 或来源资格审核。
- 当前严格统计：`C:/Work/LumioGames/LumioGame/.run/browser-authority-capture-live15-analysis-01/core-window-03.json`、`core-summary-03.json`，只取十个 `03-quiet-00..09`。脚本 `analyze-core-window-03.mjs` 使用各页面真实 `timeOrigin + at`，去重相邻 cut 的同一条记录。Tick Hz 用实际首末 Tick 时间差，未用 count / 18.497s。
- 请求窗口为 07:55:15.806Z–07:55:34.303Z，共 18.497s。共同状态证据止于 07:55:33.536Z，所以本报告严格 core 为 **17.7308s**，尾部 **766.2ms 未被这些状态 cut 覆盖**。
- A/B 的 session 均为 active，phase 为实际 `Running`（BomberMatchPhase 数值 2），world `0000000000000001`、match `1`。两端各自 participant 是 `0000000000000001000000000000000f` 与 `00000000000000010000000000000011`；正式八人/六 Bot 的准入身份来自 Root 原场景证据，本统计没有以位置数代替人数。
- A 的 Self 依次为 life `00000000000000010000000000000053`、观察 participant `0000000000000001000000000000000f`、新 life `00000000000000010000000000000072`；B 保持 life `00000000000000010000000000000054`。两端可见。quiet core 记录零 human input exports。
- 初版 `actual-result-01/02.json`、`actual-brief-01/02.json` 保留为较宽请求时间窗的分析尝试，它们含后续 cut 中仍保留的 buffered rows。数值 2 的 Running 映射在 02 更正。它们不冒充本次严格 03-only 共同状态 core。

## 真实 Tick 与绘制回调

| 观察项 | A | B |
| --- | ---: | ---: |
| timestamped C# Tick exports | 179 | 200 |
| 首 Tick UTC | 07:55:15.825Z | 07:55:15.839Z |
| 末 Tick UTC | 07:55:33.480Z | 07:55:33.441Z |
| 首末 gap 得到的 Tick Hz | 10.0820 | 11.3059 |
| Tick mean / p50 / p95 / max ms | 56.245 / 38.0 / 192.8 / 466.2 | 48.017 / 46.1 / 100.9 / 135.1 |
| Tick start-gap mean / p95 / max ms | 99.187 / 247.6 / 892.7 | 88.449 / 151.1 / 166.7 |
| Tick 内 Native 调用数 mean / max | 64.75 / 513 | 56.93 / 162 |
| Tick 内 Native elapsed mean / p95 / max ms | 0.754 / 1.9 / 20.2 | 0.537 / 1.1 / 1.6 |
| 已完成 Game draw callbacks | 497 | 618 |
| 首末已完成回调 gap 得到的 Hz | 28.0722 | 34.8090 |
| draw CPU mean / p95 / max ms | 2.535 / 2.8 / 120.6 | 1.765 / 2.5 / 5.3 |
| draw-gap mean / p95 / max ms | 35.622 / 112.7 / 766.5 | 28.728 / 98.5 / 154.7 |

draw 回调是 CPU 侧真实完成的绘制调用，不是 GPU FPS；其 gap 与 Tick gap 均为这些已记录事件之间的间距。Native elapsed 是 Tick 内桥委托计时，不包含包装器自身全部成本，也不能从 outer Tick 相减推出剩余的唯一所属层。`tickNative` 的边界也不包含后续 UI projection、DOM 和完整页面渲染。

A 最大几个 outer Tick 出现在生命切换附近：07:55:21.927Z 为 365.4ms（旧 53 AwaitingRespawn → observing 0f 的邻近状态），07:55:23.024Z 为 374.4ms（观察态仍存在），07:55:25.025Z 为 407.6ms（观察态 → 新 72 Protected），07:55:26.274Z 为 466.2ms（72 Protected → 72 Protected）。这是邻近采样关联，不是某一生命周期操作耗时的隔离证明。B 的 135.1ms 最大 Tick 在相同 54/Vulnerable 生命内，说明长 Tick 并不只出现在生命切换。

## inclusive 桶与探针成本

B 的真实 console 保留 quiet 内 6 个 sampled groups，window 15–20、group 960/1024/1088/1152/1216/1280。每组只采样一次 refresh；entity 18–22、component 134–169、transform 9–13。A 的 bounded console 留存是更晚的 window 59–64，所以 A quiet 的桶资格为 **UNPROVEN**，没有用更晚样本补齐。

| B quiet sampled bucket | mean ms | 每样本相对 refresh 的比例均值 |
| --- | ---: | ---: |
| refresh | 52.867 | 100% |
| structure | 0.817 | 1.533% |
| generatedCapture | 29.617 | 56.113% |
| fieldSink | 21.500 | 40.684% |
| accounting | 7.067 | 13.322% |
| copyFields | 19.000 | 35.851% |
| writeDispatch | 13.117 | 24.645% |
| finalize | 0.250 | 0.491% |

这八桶是 inclusive，彼此包含，不能相加；也不能用 total 差值解释未测层。每组 generatedCapture/copyFields count 117–148、fieldSink count 2330–2770、accounting count 5209–6296、writeDispatch count 2463–2976、finalize count 2。字段计数是实际 typed delegate 调用次数，不是 JSON 解析次数。

探针自身的部分成本同样真实且需要保留：每组 `clock_calls` 82,208–99,088（均值 91,885.33）；`clock_pair_ticks` 换算 10.000–13.700ms（均值 **11.850ms**）；`bookkeeping_ticks_partial` 11.800–15.600ms（均值 **13.367ms**）。format mean 0.033ms/max 0.100ms；首个 Console 行写入 mean **0.383ms**（0.300–0.500ms），第二个成本行的写入未计时。clock 与 book 是部分测量且存在重叠，不能相加、净减，不能用 sampled on 数值宣称 ordinary core 已经精确等于 56ms。WASM 时钟约 0.1ms 量化，零或小桶值也受量化影响。

## 输入只有部分事实资格

`05-input` 请求及原 action records 保留，但 14 次真实 native down/up 请求是离散请求，首次请求 start 到末次 complete 为 15.410s；cut 有 4.533/5.136/4.081s gap。它们不符合连续 15s 移动验收要求。两次 body/AX focus 操作失败没有输入证据，也没有把失败补为成功。

捕获到 A 7 个 accepted move exports、6 个 InputCommand 实发；B 3 个 accepted move exports、3 个实发。`sessionGeneration=1` 是 session attempt，不是 attachment epoch。只有 wire 的真实 Welcome generation 可与同 socket 的 wire sequence 对齐。下面是 send → **received WorldChange header appliedInputSequence**，不是客户端已应用 ACK，也不是 end-to-end input latency：

- A generation 25：seq 1/2/3/4 分别为 611.9/120.7/1751.2/3180.3ms；generation 27 seq 1/2 在 bounded rows 内无合格对应 header，记为 UNPROVEN。
- B generation 23：seq 1/2 为 1079.8/326.8ms；generation 25 seq 1 为 29.8ms。

实发 `mappingIds=["server.rpc"]` 未解码 RPC payload；多个 accepted 输入与一个 batch 邻近时不能唯一归因。state 的 appliedInputSequence 未带可用 attachment epoch，所以本轮不能把这些 state 行升级为已应用 ACK 证明。相同完整 life 的小位移可以单独观察；不同 life 的 dormant → spawn 坐标变化不算走路跳变。此窗口没有要求或捕获两个人类的放弹命令，因此未作双向放弹通过声明。

## 下一最小性能候选，尚未授权实现

先取得 default-off + 同一 V9 的真正 Running 对照。开启诊断造成的上述 clock/book 成本是需控制的混淆因素；不能仅凭 on 桶排行动生产代码。

源码确证当前 refresh 已用 `IPredictionFieldWriter`、`IGeneratedComponent.CaptureSync/CapturePersist` 和 typed silent `WriteField`，没有全 JSON/全反射采集链。`RefreshTypedAuthorityCore` 对每个实际组件采集，`AuthorityFields.WritePredictionField` 验证已声明同步字段并按原规则计账，`World.CopyCapturedFields` 保留容器 boxed snapshot 与 silent 写回。即使 inputs 为空也必须更新实际 typed authority world，不能跳过整个 refresh。

一个可限定的候选接缝在所属 Runtime 的 `tools/gen-declarations/CodeEmitter.cs`：当前 `IGeneratedComponent.WriteField` 与 `IGeneratedSyncMetadata.TryGetSyncField` 生成逐字段 `string.Equals(..., StringComparison.Ordinal)` 链。实际 BomberPlayerState 声明有 27 个字段，调用每次重复派发。可以先在新隔离测试中比较保持 ordinal 名字语义的生成 `switch(fieldId)` 与旧链，生产范围最多这两个 emitter 方法及其正常回归；不改 field ids、scope、native ABI、snapshot 内容、scratch 计账、silent 行为或 GAS 规则。当前只有源码机制及 inclusive 桶证据，**还没有证明该派发成本是主要 ordinary 性能瓶颈**。

有意义的前置用例应覆盖首末字段、未知/null/大小写或相近名字、container 与 scalar、silent 回调行为、错误类型及原拒绝语义；旧/候选的实际 generated fields、typed authority 配对输出必须全等。之后以同正式 Native/WASM、default-off、同人数及 Running 工作量的实际浏览器比较验证收益，GEN body 改动必须经过独立精确 pin 审核。缓存/池化或跳过未变字段涉及寿命与复制契约，本轮没有资格扩大这些边界，也没有实现候选。

本报告没有操作浏览器、服务、源码、pins 或额度；所有真实体验交付缺口继续保留。
