# 普通完整16真实浏览器有限分析

2026-10-04；仅读取父任务指定的 V9 JSON 与动作记录，未操作浏览器、服务、源码、包、pins，也未运行构建。脚本及两个派生结果位于父仓 `.run/live16-experience-analysis-01/`。本报告不能代替完整体验验收。

## 首次准入与十次关闭重进

03/04实际首次准入：A negotiating→active 695.8ms，B 829.6ms。A/B首 Welcome 的真实 connectionGeneration 为6/4；同world `0000000000000001`，独立participant分别 `0000000000000001000000000000000f`、`00000000000000010000000000000011`。协商→Welcome为59.2/63.5ms，Welcome→firstIdentity为626.7/757.4ms。首identity导出的authorityTick0原样保留；选择页中人为等待不能算系统准入耗时。分片首消息分别80364/89818 bytes、2片；received不等于Native已应用。

reentry-01…10实际记录均为关闭旧页、使用不同新tab，两端重新收到Welcome、绑定上述各自participant、同world、active，并出现新页实际完成的draw callback、fault尾0。A协商耗时均826.81ms（555.9–1269.8），B均724.68ms（449.8–1389）。记录中没有额外旧tab缺席inventory字段，旧页关闭事实来源为Root真实动作记录。末截图A#3与B#5–9 inputOpen=false，A#2末authorityTick0；因此结论是十轮恢复连接与新绘制已有证据，不能说十轮均立即可控。authority继续由其他末截图及后续Match2静默帧递增佐证，不将A#2的0改成猜测值。

## 位移、输入和双方放弹

05离散方向动作中，A旧life `000000000000000100000000000000d4` 的上下0.175步进及B旧life `000000000000000100000000000000ca` 的左步，在自身和peer正式pose均有对应变化。出生位置大跳也保留在数据，不能当输入移动。

06五round中，A新life `00000000000000010000000000000114` 的z=9.5→9.67500019→9.5→9.67500019在两端都出现；B新life `000000000000000100000000000000e5` x=15.5→15.3249998在两端出现，回右x=15.5只B保留尾明确看到，peer该反向步未证明。before/after实际authorityTick可跨多个tick，并有死亡换绑；不是同tick两指令或持续15秒双人移动证据。

双方共同看到两个完整人类炸弹身份与相同归属：

| bombId | ownerId | 正式projection实际sourceLifeId |
| --- | --- | --- |
| `00000000000000010000000000000116` | `00000000000000010000000000000011` | `000000000000000100000000000000e5` |
| `0000000000000001000000000000011a` | `0000000000000001000000000000000f` | `00000000000000010000000000000114` |

这里sourceLifeId在本轮真实正式dump字段存在，因此可报告；SourceGeneration没有观测值，未推断。Root实际Space动作及这些出现顺序提供双方放弹功能证据；缺失的具体accepted/button与发送尾不补造。

03–07合并保留A/B accepted export12/6、sent12/6，其中早组同实际Welcome epoch的WorldChange累计确认头可关联6/3条，send→received范围9–1244.8ms。它是收到带累计appliedInputSequence的权威头，尚不能称客户端已应用ACK。sessionGeneration1完全不用于epoch匹配。这段Host重编译曾运行，不作为性能基准。

## 无重构建静默窗口

09:58:14.892Z→09:58:44.932Z请求跨度30.040秒；V9不同尾容量导致不能全量重建30秒：共同结束Tick尾21.6979s、WorldChange头尾20.4368s、draw尾12.9461s、完整state尾5.8600s。开始/结束Tick尾之间存在7.197/8.297s未保留跨度。按每类自己的实际时间戳统计，不按600条或整段30秒除。共同state尾两端为Match2/Running；生命周期自然切代、authorityTick0保留。父任务报告仅1DS+6Bot+2人页、bothvisible、此窗口无heavy构建；分析器没有另查询进程。

| 实际共同尾指标 | A | B |
| --- | ---: | ---: |
| Tick完整样本数 / 实际开始Hz | 330 / 15.231 | 330 / 15.197 |
| Tick均值 / p95 / max ms | 28.711 / 60.7 / 457 | 29.239 / 62.7 / 441 |
| Tick ≥100ms / ≥200ms | 7 / 4 | 7 / 5 |
| Tick内Native均值 ms | 0.350 | 0.350 |
| WorldChange接收头Hz | 19.968 | 19.991 |
| 真实完成draw CPU callback Hz | 37.185 | 37.638 |
| draw开始gap p95 / max ms | 70.4 / 598 | 68.7 / 567.4 |

Tick45–50ms的10/10个样本，其下次Tick开始gap均101.62/102.44ms、Tick结束到下一开始均54.42/54.37ms；Tick50–60ms的9/8个样本分别为104.90/101.92ms、50.12/47.95ms。结合现有main.js 715–717把过期deadline推进到下一未来50ms格，支持存在调度量化空档的最小修复候选。残余间隔还包含sessionState、voxel、dump/presentation、JS bookkeeping与事件循环，不能全称纯timer睡眠，现有数据也不证明这是一切长帧的根因。

V9成本未净化；Native计时不含全部包装工作，不能用0.350ms从外Tick相减声称managed净耗时。draw是CPU callback而非GPU FPS。长Task保留尾71/63条（累计端点变化另存派生JSON），不把cap尾当全部longTask计数。双端静默窗口没有observed human exports或sent。

## 精确派生结果

- `quiet-analysis-01.json` SHA256 `f80add46e2c508389fa64609d20ae4b20c4825c93a8644bffd23979fd603c15b`。
- `functional-analysis-01.json` SHA256 `b1dd74b3f8f779b05932adb6bbb5b57fbaa5ff673859cc469a6f75569ed8bdef`。

每个JSON仅记录指定原件的路径、长度与hash，保留所有限定。没有重扫包/PDB/835矩阵，也没有把功能、静默、生命周期或未采样区间混成整体PASS。
