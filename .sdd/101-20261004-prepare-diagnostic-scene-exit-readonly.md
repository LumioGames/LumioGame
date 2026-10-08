---
type: evidence
status: captured
scope: real-browser-scene-readonly
---

# 实际诊断局自行退出：只读取证

实际局为 `games/101-bomber/.run/browser-experience-repair-01/live-11-prepare-diagnostic-02`，Root launcher PID25008，Node45320；完整11及仅 Game 首 Prepare 拒码诊断。六真实 Bot 全部启动及准入。Root 未停止该局；18085 Platform 保持原进程。此报告没有操作浏览器、输入、服务、生产源或 pins。

## 封存及观测范围

完整有序 DS 不可变前缀：11,325,255 bytes，SHA256 `4797baee29fdc26c5481ac838720467da1448dead0f2fbeeae98dcfd9010746c`。launcher stdout 前缀1,056 bytes，SHA256 `050d1af564d0f50cd2265c07448a52d0d26e06a828a66e1f0124aee51d3b6819`。首次读取23:08:52.682Z，最终读取23:17:01.325Z，全部增量原字节已保留；源已停止后才封件。

前缀及源读取 manifest：`games/101-bomber/.run/browser-experience-repair-01/prepare-live-monitor-01/window-01/manifest.json`，SHA256 `61dbfd0389fcad06c04410a6ba394efaa04f189da7262660645a3780fc32593a`。各 Bot 原日志/结果/准入记录封件 `exit-evidence/manifest-and-summary.json`，SHA256 `e5555705ec58f2c559fbe24cb2ec7959618375abc96912600dd2236af97d62c9`。固定无凭据摘要 `exit-path-facts-02.json`，SHA256 `f3b390cfbfa05e96be7673be12b080091147e2d2e70b22aeb45029e3eb111027`。

原分析器 `exit-path-facts-01.json` 的事件匹配使用 tick 而实际字段是 gameTick，故该文件生命周期数组空且不作为生命周期证据；保留原件，02只修解析器字段，不改 raw。最初 Root 的200KB传输截断 `first-entry-A.json` 保留 INVALID，不用于验收。

## 真实顺序

| 事件 | UTC日志时刻 | 实际 tick / 状态 |
| --- | --- | --- |
| match_started | 23:09:30.410812Z | Game948 / Host949 |
| Root 第一次实际 A48关闭 | 约23:13:54Z | 后续新A50加入；DS旧连接1001于23:13:54.666167Z |
| final_circle_started | 23:14:38.407139Z | Game7108 |
| match_ended | 23:15:00.409548Z | Game7547 |
| next_match_started | 23:15:16.404784Z | Game7868 / Host7869 |
| Bot5 首个已记录协议拒绝 | 23:15:26.1406515Z | protocol_rejected / txn=successor / bad_envelope |
| Bot2 / Bot5 / Bot1 终局状态 | 23:15:26.1457839Z / .1474967Z / .1609209Z | Active→Faulted |
| 最后 DS commit | 23:15:26.311797Z | Host8067 / applied8067 / frames3 |

DS首批三个 peer_close1008于23:15:26.139496Z、.139684Z、.155102Z；Client `FailSuccessor` 的 RequestClose 在 RejectProtocol 日志之前，因此异步 Sink 时间不应被当作精确指令执行时刻。其后另三个连接 peer_reset1008，对应 launcher 最终清理，但仅这些固定日志不能证明每个关闭调用者。

## 退出触发与误判

`verification.json` 精确错误为 `Process 16268 exited before proof completed: code=0, signal=null`。实际 Bot1 `admission-events.ndjson` started PID=16268；因此该 PID 是 launcher 首先发现的退出 Bot，不能把它称为最先故障的 Bot。六 PID 对应1=16268、2=47480、3=24964、4=31204、5=13840、6=38200，来自每个进程自己的 started 记录。

Bot1/2/5实际日志先报告 `reason=protocol_rejected phase=protocol generation=1 txn=successor exception=bad_envelope`，随后本地 WS1008，再 Active→Faulted。generation=1 是 Client session attempt generation，不是 attachment epoch。Bot1/2/5随即写 `scenario.finished passed=true` 和 `run passed=true`，进程退出0；另外3/4/6没有 finished/result。

Game `BomberPlayScenario.Step` 每个分支均 Continue，没有 Complete；player launcher没有显式 ticks，其 resident scenario budget为0（unbounded）。故“Bot默认时间或帧预算到期”被实际记录否定。Client Host原 `BotHostResidentLoop` 将 Faulted/Superseded 设为 scenarioComplete，FinishScenarios只依赖场景 Assert；长驻场景默认空 Assert，最终错误报告通过。这个误判应单独修，不能吞退出、让场内缺 Bot。

实际导致场景失败的更上游是 successor 消费协议拒绝，原日志不足以给出具体 guard 或完整授权顺序。实际 Bot participant ID与 opaque Host账号没有充分闭合映射，不能按序号猜。父任务安排真实 Native Host后继链，并在所属 Client进行消费 RED；详见后续作者报告与 Host证据。

完整前缀中 `BOMBER_SUCCESSOR_PREPARE_REFUSAL` 为0。这只证明该局没有记录命中首失败时刻的拒码；不证明所有 Prepare成功，也不排除后续或恢复切面后的拒绝。Prepare零日志不是退出根因结论。

## 体验验收状态

两端末屏 active/inputOpen与旧 Running不能代表健康：Root记录 UI failed、authority8066，场景自行退出，六 Bot完整在场及可玩重进未完成。此局不用于十次重进通过或性能通过。没有改变频率、体素、人数、额度、协议校验或唯一权威世界。
