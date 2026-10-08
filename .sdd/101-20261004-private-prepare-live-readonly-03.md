# 私有 Prepare 真机场景：三窗口最终只读交回

截至最后冻结前缀 `2026-10-04T06:16:45.892182Z / committed19868 / frames8 / pending_inputs0`，只记录两条真实 V2，均为 `Connected=False / binding_not_found`。没有在线 `Connected=True` 拒码，也没有 `BOMBER_EXECUTE_FAULT` 或 `DS_FATAL`。这是诊断场景事实，不是正式性能或体验验收；Root 的十次真实 close/new-page 浏览器结果独立保存在 `C:/Work/LumioGames/LumioGame/.run/live14-online-prepare-refusal-01/browser-actual-01`，本报告没有代行或重复该浏览器操作。

首条原样、首个恢复链及前两窗口详见不可变报告 `C:/Work/LumioGames/LumioGame/.sdd/101-20261004-private-prepare-live-readonly-01.md`，SHA `d0401df312c63a6e9ecc45d0211e3e4f10f45a1851dfd7b2412cd58027972120`。首死亡 life72/gen4 的断开拒绝后来已恢复；第二局中 A 在实际检查点完成 gen18→19、29→30，死亡意图清除并产生新生命。

## 第二条实际 V2 与恢复

冻结 managed stderr `lumio-ds-prefix.log:36`：

```text
BOMBER_SUCCESSOR_PREPARE_REFUSAL_V2 tick=19556 participant=0000000000000001000000000000000f life=000000000000000100000000000004d3 generation=33 connected=False observerGeneration=72 lifePhase=2 deathTick=19555 lastLife=000000000000000100000000000004d3 intent=33 nextLife=34 eligible=True code=binding_not_found
```

准确实际时序：旧 conn-81677a05c7890bc89cc85848bc14b920 在 `06:16:28.791334Z` 收 peer1001；death19555 提交在 `06:16:30.249241Z`，Prepare19556 提交在 `06:16:30.295744Z`；同账号新 conn-e90fe2eefc8f29e51cb81d3762637da1 signed reconnect 在 `06:16:31.241700Z / tick19574`。Host egress `observer_id=17` 与 V2 的 attachment `observerGeneration=72` 是不同列，不能互换。

实际 checkpoint19795 的 A participant `0000000000000001000000000000000f` 显示：旧完整 life4d3/gen33 的 `TerminalCaptureTick=TerminalDestructionTick=19574`，与本次新准入 Tick 相同；真实恢复结算 `settlementTick=19616`；新完整 Life=`000000000000000100000000000004ea`、gen34、lifePhase1、deathStructurePending=false、successorPending=false、reservationSlot0。这证明该离线死亡意图在本次新准入后确已消费，不能称仍永久卡在旧4d3。

## 第三局事实

结构化冻结行120873：`2026-10-04T06:15:38.557394Z / Host tick18521 / gameTick18520 / event=next_match_started / matchId=3`。checkpoint19196 和19795 的 World `BomberMatchState.matchId=3 / phase2`，A 分别 life4af/gen32 与 life4ea/gen34，B分别 life4bb/gen31 与 life4d8/gen32；这些切点的死亡/后继待办均 false。没有将缺失的中间步骤推断成逐项验收。

## 最终证据及限制

场景：`C:/Work/LumioGames/LumioGame/.run/live14-online-prepare-refusal-01/live-private-prepare-01`。

- window03 result：`C:/Work/LumioGames/LumioGame/.run/live14-private-prepare-monitor-01/window-03/result.json`，SHA `67baf47044c342ba2a98aa55876be9facd4cabde857c278a557de8aff59e381f`。
- window03 manifest：同目录 `manifest.json`，SHA `22223976bf0c73f69bc8bf381630bd3488778099367035c4cd07f0cbf4649fdd`。
- 窗口01/02与新窗口03均保持原字节。六份 checkpoint 外层及内层 world/voxel/delivery SHA 校验通过；解码仅为 LWM1 ECS 持久实体字段，没有调用 Native restore/SDK/Game API，没有重建私有当前 route、publication credit 或非持久 Observer。

不能用本场景两个离线拒码解释旧 live14 已证活跃连接区间内的 death13560。该在线原故障仍需其自身时序或新的具体可观测证据。健康正常链和恢复日志不能替代根因 RED，也不允许据此修改 owner guard。本场景只读任务已收尾，不继续无限相同轮询；后续转向旧14特定窗口调查。
