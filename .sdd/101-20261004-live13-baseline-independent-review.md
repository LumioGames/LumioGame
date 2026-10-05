# 完整13真实浏览器基线：只读非作者核验

裁决：**ACCEPT_EXACT_FROZEN13_BASELINE_FACTS_WITH_EXPLICIT_BOUNDED_SCOPE_NOT_FULL_EXPERIENCE_ACCEPTANCE**。Root 的原始数据和限定窗口统计可引用；不授权把它们写成双向连续移动、双向真人放弹、ACK延迟、不卡顿或十次可玩重进全部通过。

NEW结果 `C:/Work/LumioGames/LumioGame/.run/live13-baseline-independent-review-01/result.json`，SHA256 `04fdb39fb14eecc32e84e3475fa5e88e13f93781c33141b192f3683d42f5feb0`，559项实际检查 raw0。没有改作者 analyzer、analysis、freeze、原始数据、Game或服务。作者 freeze SHA256 `4f798aff4f282e757eb6abac7731f7e58b1f471cf07478cdb5d8525f836029fe`，analysis SHA256 `78c8fa3689410071dad2029e0b2a2a0a7722a479ba75c869295a47dae966d05a`。

## 核验范围与实数

全部69份冻结输入的真实长度/hash吻合。mutable log是明确不可变读取前缀，不是最终退出日志。14个原始双页cut始终绑定A54/B55；独立重算4个共同时间窗的双页完成绘制callback、完整Tick、Native操作、保留长帧尾部与DS时钟，得到原8行相同数字。所取性能窗口均早于02:47:45Z GREEN build授权截止；10–14仅作输入/状态证据。

| 窗口 | A / B CPU完成绘制 Hz | A / B 泵 Hz | A / B Tick均值 ms | A / B Tick p95 ms | DS Hz |
| --- | --- | --- | --- | --- | --- |
| 02，15.955秒 | 35.47 / 37.54 | 12.60 / 13.35 | 39.40 / 34.33 | 112.90 / 79.60 | 20.010 |
| 03，13.857秒 | 43.30 / 40.13 | 16.31 / 14.00 | 24.30 / 28.33 | 48.00 / 55.90 | 20.013 |
| 04，15.503秒 | 38.70 / 31.22 | 14.51 / 11.22 | 31.64 / 37.55 | 100.60 / 100.50 | 19.990 |
| 09，13.064秒 | 40.34 / 45.70 | 15.00 / 16.07 | 28.72 / 25.51 | 75.20 / 59.80 | 20.012 |

上述DS窗口实际 applied tick严格推进、无重复/倒退，不仅是没有holding关键词。浏览器Tick慢于20Hz且存在长帧是实际观察；它们不能证明所有开销属于NativeCPU。单格工作读取的实际重放次数和原逐操作inclusive wrapper数值吻合；保留的最坏例B一次Tick1902.5ms/单格12274次、wrapper272.70ms，也是真实原cut事件。但某些最坏例跨共同窗口边界，未纳入该窗口的完整Tick均值，不能混成同一范围的最大值。

首入A negotiating→active596.90ms，B632.50ms；此前selecting等待与negotiating不能合并成DS准入耗时。两个participant完整ID不同（0f/11），world同为`0000000000000001`，真实首Identity/World时序保留。这里没有把session计数1当成实际attachment epoch。

## 同步与输入证据边界

唯一双方共同捕获的真人炸弹是完整ID `00000000000000010000000000000177`，owner `0000000000000001000000000000000f`，sourceLife `00000000000000010000000000000160`，在A两次/B五次原权威状态采样中逐项找到。当前schema16 SourceLife声明为Aoi，原数据有实际该字段；不能套用旧schema15 Scope.None解释这些实数。compact状态没有sourceLifeGeneration，因此更强完整generation链仍UNPROVEN。当前保留结果没有B所属双方共同炸弹，不能写双向真人放弹已经通过。

五个选定完整life ID的双端presentation位置范围、participant归属和样本逐项吻合。范围变化可证，但缺完整逐输入阻挡/确认时间链，不能据range或文件名`continuous`宣称双向持续走动、输入因果或预测延迟闭合。0样本路径维持缺证据，不能补造。

19组inputBounds的实际accepted调用和后续原InputCommand都在raw中，差值算术吻合，包括237.7/298.4/951.4ms。其算法只是“按顺序找下一条尚未使用的outgoing packet”；未解码每条packet内具体RPC，也未建立唯一input→sequence，因此这不是该输入自身发送延迟的因果证明或严格上界。更不是服务器ACK延迟。真实wire epoch5/15/17/19/45/63等不能与V7合成state.generation1匹配；ACK延迟保持UNPROVEN。

## 测量限制

CPU绘制完成callback不是GPU scanout帧率；保留visible条件和原visibility事件，不能推广成未测前后台环境。原observer仍有开销：serialization统计是累积保留尾部，不是相同per-window串行化净扣除；DOM接近1MiB也不等于零成本。Native wrapper包括桥及transport边界，不能相加/相减成纯NativeCPU或Managed净值。LongTask尾cap不作为整个会话总数。

本次没有未测页对照，也没有新trace候选浏览器消费，不能声称性能修复有效。A54真关/新56空画面是另一组真实首屏失败证据，已在独立UI报告审核最小候选；它同样阻止把重进写成体验验收通过。所有原数据与作者分析保持原字节。
