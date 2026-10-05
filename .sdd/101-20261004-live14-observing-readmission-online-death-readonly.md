# 旧14：观察重准入、生命转移、再次受控重准入后的在线死亡

结论：旧场景实际存在 **fresh observing 准入 epoch61 → 新生命 transfer Welcome epoch62 → 同新生命再次 controlled 准入 epoch63 → death13560** 的具体前置。没有对应 Prepare 错误码或私有 credit/drain 记录，不能把本次新诊断局的离线 `binding_not_found` 当作旧故障根因。

这是日志、原浏览器 JSON 与已封检查点的只读调查：不调用 SDK/Native/Game 查询、不操作浏览器或服务、不改任何源码。原日志前缀从真实原文件描述符重新读取46365143 bytes，与旧封件 SHA `048503af00fca2f1afe2ab1175938eb0613ebd64bf29f93bc83c0a2a110e673c` 逐字相同；没有用陈旧的 Win32 Length。50秒完整原日志窗口另封，6738行，不打印整日志。

## 实际前置链

A 完整 participant=`0000000000000001000000000000000f`，account=`acct_5f77fba54c7da3f6733068e6bf1cdb62`；旧生命383/gen26，新生命3a2/gen27。所有实体 ID 的上述缩写只用于叙述，原件保留完整32位 ID。

| 事件 | 实际证据 |
|---|---|
| A70 受控旧383 | reentry09-before-close：Welcome epoch59 Self=`00000000000000010000000000000383`，04:17:35.269Z；Active/Vulnerable，authority13238 |
| 旧383致命与销毁 | Gameplay damage gameTick13257；已封checkpoint42599/43199同时保留 terminal383/gen26，capture/destruction13258 |
| A70真实关闭 | 04:17:39.721725Z peer1001，conn-d3f7f651919c037eb58d24c7b2d3a230，observer16；保留目标为participant0f |
| A71 fresh signed准入 | 04:17:41.702282Z conn-e2bfcea505ffa847a13de8693e912c5f，Hosttick13343 |
| A71先实际观察 | 原Welcome epoch61，Self=`0000000000000001000000000000000f`，浏览器到达04:17:41.764Z |
| A71后实际新生命 | 原Welcome epoch62，Self=`000000000000000100000000000003a2`，到达04:17:42.159Z；Active/Protected；旧检查点保留restoreLifeGeneration27、settlementTick13318 |
| A71受控新生命后关闭 | before-close Active/Protected Self3a2 authority13393；04:17:46.405174Z peer1001，observer17；Host tick13437安排3a2 expiry |
| A72同新生命受控重准入 | signed reconnected04:17:48.447849Z / Hosttick13477，conn-d12da1230543ddf1b2a1fc37fe1d218d；原Welcome epoch63，Self3a2，到达04:17:48.474Z |
| 新生命受伤及死亡 | 3a2 damage gameTick13473（fresh准入前）、13517、13560；对应loggerHostticks13475/13519/13562，最后日志04:17:52.649515Z |
| 在线区间 | A72 after-new-page Active/Vulnerable Self3a2 authority13494；直到Root后来04:35:47.339777Z真实关闭，该连接107/107 ping/pong |

浏览器UTC由原 `timeOrigin + at` 计算，报告仅保留毫秒精度；它是Welcome到达，不能充当Runtime Applied/消费或 writer fence ACK。`settlementTick13318` 的持久字段不能单独解释为精确transfer提交时间，更不能给该提交赋 conn；两个原Welcome的真实先后才证明本次前置包含观察重准入及其后新生命附着。

后续两个原封检查点42599/43199：3a2/gen27仍为current/last，deathTick13560、DeathStructurePending=true、SuccessorPending=false、Slot0；原terminal仍383/gen26，destruction13258、restore settlement13318、allocation generation26。这只证明玩法后续待办未消费，不还原 private Runtime route/当前owner或credit状态。

## Expiry 与断线可见边界

实际boot只读提取 `host.reconnect_window_ms=300000`。截至death13560对应日志时间，完整前缀共有10条 `host.expire`，**全部 scheduled**，没有 fired/rearmed/deferred；首条04:13:22.353075Z旧1f6 due_ms713491。按实际5分钟配置及连续单调时钟，首计划期限约04:18:22.353Z，晚于在线死亡约30秒；这是期限推算，不声称日志投影了该时刻的 armed table。3a2自己的安排为04:17:46.405832Z / tick13437 / due_ms977544。

第一个实际 expiry dispatch相关 deferred 出现在 **04:21:14.050586Z**，旧2f4 / due_ms885163 / `runtime_query_pending`，晚于death13560。它不能倒因果作为死亡前的旧 timer 回调。当前没有日志证明death13560前发生对应旧life/participant Expire 或过期回调。

正常Server008861源码表明：disconnect可能走pending-close、deferred drain或正常live Session三个分支；正常live分支先调用Runtime disconnect、再保留账号/target并安排期限（owner.rs3916起）。`cancel_expiry_for_net_entity` 有取消/清表实现，但没有cancel事件投影；正常controlled准入完成后调用它（admission/lifecycle.rs857），不能用signed reconnected或收到Welcome替代实际初始发布完成和该调用。`drive_wall` 在pending successor或pending delivery时不泵expiry；真正调用expire会投影Fired/Deferred，observation expiry另有typedcontrol路径。断线Apply的原始tuple、关闭后选择哪条生命周期分支、cancel是否实际发生，在本窗口均未投影。

## 精确缺失与下一资格

窗口内有 generic `host.operation_result`4654行、`host.successor`901行；后者只slot/revision，不能没有完整token/account/participant关联就分配给A。没有原始SuccessorAuthorization、Prepare返回码、GameConsumed/ResultDrained/PublicationDrained或credit总额日志。原公开 `TryConsume`、result drain及publication drain是不同事件，Welcome接收不证明它们全部结清。也不能从Slot0推断旧privatecredit为0。

Root授权下一条仅Runtime Native控制案覆盖具体新增前置：controlled旧life死亡→观察状态真实Disconnect→fresh observing准入→真实Ready/transfer新life→再次Disconnect→fresh controlled admit→lethal/Prepare。原HostedAdmissionFixture的正常ACK/初始baseline/协议drain全部保留；不使用Offline7草稿、不强制附着或伪造binding。它是Runtime原fixture，不是新增签名Host/真实socket端到端；Host初发布writer fence仍属未覆盖边界。无真实RED时不改生产守卫，不因为期待失败删除必要drain。

## 冻结位置

`C:/Work/LumioGames/LumioGame/.run/live14-online-death-timer-readonly-01/seal-01/result.json` SHA `afccec2ff37b3f18c20db4aa9e67e661ad409227b22925bf7e65e00200b3b9aa`；同目录manifest SHA `bb798a6550d3425f1bd91fe1a361cf502e82968434a162995007697d3f850d9b`。

包含04:17:20–04:18:10完整原窗口、带原行号的精选时序、四个原浏览器JSON逐字副本、六个只读源码副本、先前checkpoint引用/输入hash及当前原日志前缀重新核对证据。boot只记来源hash与安全单值，未复制凭据；原封件及当前现场未改。
