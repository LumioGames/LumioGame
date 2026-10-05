# 私有在线 Prepare 拒码场景：只读事实窗口 01–02

这是默认关闭诊断源的私有场景观察记录，仅用于定位；不构成正式性能或浏览器体验验收。作者没有操作浏览器、服务、游戏 API、输入或生产源码，没有编译或扩大 Native 健康测试。

场景绝对路径：`C:/Work/LumioGames/LumioGame/.run/live14-online-prepare-refusal-01/live-private-prepare-01`。读取 `lumio-ds.log` 的 managed stderr 与 `ds-boot-1/2026-10-04_000.log` 的结构化日志；前者承载 V2 记录，不能只搜索后者。活日志通过新打开文件描述符 `fstat/read` 保存捕获时完整前缀，原文件此后追加不属于封件。没有采用可能陈旧的 Win32 `FileInfo.Length` 判断空日志。

## 唯一实际拒码

截至窗口 02 的结构化提交尾端 `2026-10-04T06:13:13.794478Z / applied_tick=15626`，managed stderr 仅有一条 V2，且没有 `BOMBER_EXECUTE_FAULT` 或 `DS_FATAL`：

```text
BOMBER_SUCCESSOR_PREPARE_REFUSAL_V2 tick=2643 participant=0000000000000001000000000000000f life=00000000000000010000000000000072 generation=4 connected=False observerGeneration=7 lifePhase=2 deathTick=2642 lastLife=00000000000000010000000000000072 intent=4 nextLife=5 eligible=True code=binding_not_found
```

该行自身不含墙钟。结构化日志对应的实际提交时间为：death tick2642 在 `06:02:24.512693Z`，Prepare tick2643 在 `06:02:24.551041Z`。此前旧 conn-8fd3abb48975c33f7ef848d21fc8a691 于 `06:02:21.844981Z` 收到真实 peer close1001，observer7；此后同账号 conn-19fb1dbb71902dfa6602c22d4180a838 的实际 signed reconnect 日志为 `06:02:41.544413Z / tick2982`。因此此次拒绝发生在断开期间，不是 `Connected=True` 的在线拒绝。

不能据此认定旧 live14 在线 death13560 与它同因；旧场景记录的活跃连接区间仍有效。也不能从当前记录宣布 publication credit 假说成立。本次确切失败码不是 `successor_reservation_invalid`。

## 后续已提交生命周期事实

日志实际 `next_match_started / matchId=2 / gameTick=9739` 在 `06:08:19.491869Z`（Host日志 tick9740）。窗口 01、02 保存了四个完整检查点：各外层 payload SHA 与 LRC1 内层 world/voxel/delivery 三个 SHA 均核对通过。

| 检查点 Tick | A participant0f 当前完整 Life | Generation | 最近旧体死亡 → 捕获/销毁 → 恢复结算 | DeathPending / SuccessorPending / Slot |
|---|---|---:|---|---|
| 10195 | `00000000000000010000000000000268` | 18 | 10058 → 10059 → 10119 | false / false / 0 |
| 10795 | `00000000000000010000000000000288` | 19 | 10418 → 10419 → 10479 | false / false / 0 |
| 14996 | `000000000000000100000000000003ce` | 29 | 14325 → 14326 → 14386 | false / false / 0 |
| 15596 | `0000000000000001000000000000042f` | 30 | 15470 → 15471 → 15531 | false / false / 0 |

四个切点 A 的 `matchId=2`、`lifePhase=1`、`currentLife==lastLife`；原完整 life72 实体均已不存在。B participant11 在窗口 02 的两个切点也为 match2、lifePhase1，gen27→29，death pending=false。故本次原 life72 的断开死亡意图后来确已跨过销毁和新生命恢复，不能称旧72永久卡住。此表只证明切点及其真实持久字段，不把所有中间 generation 推断为逐一验收完成。

同账号后续真实 close/reconnect 日志包括 `06:04:24.653126Z→06:04:26.944448Z`、`06:07:11.408972Z→06:07:13.675777Z`、`06:10:47.195697Z→06:10:49.396853Z`、`06:12:22.549991Z→06:12:25.102946Z`、`06:12:30.815981Z→06:12:33.316444Z`。这些服务端准入记录不能替代浏览器 Active、首屏及动作验收。

## 冻结证据

- 窗口 01：`C:/Work/LumioGames/LumioGame/.run/live14-private-prepare-monitor-01/window-01/result.json` SHA `ff420350a3101b7f1e84ac9125ceeaf187d397096cb04296f73336ae1edfabb4`；manifest SHA `ed3375d4b2c1c7f89f4be9290684fff1859afe1cfea3a1b6a05ec95b79ec71ef`。managed 前缀1545 bytes，结构化前缀16639598 bytes；冻结 checkpoint17/18。
- 窗口 02：`C:/Work/LumioGames/LumioGame/.run/live14-private-prepare-monitor-01/window-02/result.json` SHA `87df9f545415b8055bdf3eeabc64065e68a00c3aff96860a0f01ccfe8ee8fe86`；manifest SHA `dbaa8fa35b236020cddbd980adc13f0330e3d05e26bc27573907bdaebf25b926`。冻结 checkpoint25/26 与后续日志前缀；原窗口01不改。

解码只覆盖现有公开 LWM1 ECS 持久实体字段，复用已封存只读 decoder 并保留源码/函数 hash。没有 Native restore、运行游戏模拟、读取私有 Runtime current attachment/credits 或补造 Observer 字段。Observer Connected/epoch 只引用实际 V2 记录；后续检查点不提供该非持久组件。原完整 IDs 使用精确字符串，不从超过 2^53 的 JS Number 重建。

继续观察目标是 fresh reconnect 后的新的实际 `(participant,life,observerGeneration,Connected,code)`，尤其 Connected=True；出现之前不扩同一健康链测试，不修改任何 owner guard。
