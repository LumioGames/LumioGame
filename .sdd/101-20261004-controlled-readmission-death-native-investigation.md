# Controlled readmission 后再次死亡：真实 Native 对照

裁决：`ACTUAL_NATIVE_CONTROLLED_READMISSION_FOUR_CASES_PASS_NOT_LIVE14_ROOT_CAUSE_REPRODUCTION`。正常的 controlled 重连、普通 `admit` 再准入、已经 consumed 的 successor reservation 留存，均不足以单独解释 live14 的 Prepare 长期未成功。没有生产修复，也没有把通过的对照改称 RED。

## 隔离源与消费身份

- 独立树：`C:/Work/LumioGames/.101-pack07/LumioGameRuntimeControlledReadmissionDeath`，分支 `codex/101-controlled-readmission-death`，基线 `520ffe482e1c48fb6e48187925eecec986cdb9c8`，正是正式14的 Runtime。
- 唯一 authored 新文件：`C:/Work/LumioGames/.101-pack07/LumioGameRuntimeControlledReadmissionDeath/modules/replication/tests/Lumio.GameRuntime.Replication.Tests/ControlledReadmissionDeathTests.cs`，最终 SHA256 `c3e9a13cd540a44a9cddf62f7694d5668c5588dbefe9a1177c32ec4383ef5dff`。
- 正常 replication 测试项目内 `SuccessorBindingTests` partial，自然复用同一类的 private `Harness(correlatedAdmission: true)` 和 `HostedAdmissionFixture`。没有跨编译私有 fixture，没有修改原 harness/fixture/172个原 case。
- 构建依赖 Engine：`C:/Work/LumioGames/.101-pack07/LumioGameEngine11SdkClosure`，源 `523c3d39f8f29b2dccd7d6451fe5a5e8c968c5c0`。独立普通托管图、NuGet cache、artifacts；未重建 Native、未替换发行 DLL。
- 实际 Native：`C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-14/server/win-x64/SDK/Native/win-x64/lumio_engine_native.dll`，SHA256 `e15c2b124d339a000b5348d47cdf4ef7571e55ff8447637386795e0cf0034c89`；正式14 manifest SHA256 `65bcedda784e3a99ac5f0ff55d9f1fb20bfeaef14313f28001b25e741270a9c9`。Sidecar buildId `256deae04b8e439924c0694f8a61ebc5`，ABI hash `c5f276c855bcb71fd9b04dcd546d1dd925ac408fd6303d56e30a2c044946a2f3`。

## 实际流程与结果

每案都正常初准入；真实 Native lethal → Prepare/Destroy/Applied observe → Create/Restore/Ready → Runtime transfer Applied → 原 GameConsume fixture 提交新 life。`HostedAdmissionFixture` 按原流程 Acquire、Reserve、Enqueue、Drain 原 publication、逐帧 ACK、Settle 原 receipt，保留真实 Native lease/债务。

三项原对照是：不重连；Disconnect 后 `reconnect`；Disconnect 后 `reconnect` 且 LastLife 按当前 Bomber TryLand 行为落到新 CurrentLife。追加第四案是 `admit` 加相同实际 LastLife 策略。这条分支对应正常 Start 的 binding action；测试没有把它替换为 rebind。

实际共同链：life `f123456789abcdef0000000000000002` → life `f123456789abcdef0000000000000004`、LifeGeneration2、connection generation3。Consume 后 result credits0、publication bytes0，原 reservation bytes1008/slot1/allocation1 仍保留。重连案先执行真实 Disconnect，旧连接路由不存在、Observer.Connected=false，再正常原 admission publication 结清；新 `c2` route 指向 life4/gen4、旧 `c1` 不可解析、Connected=true。随后实际 Native lethal health0，IntentGeneration2、NextLifeGeneration3，Prepare 返回 null，旧 slot1 复用为 allocation2，死亡实际消费、Applied observe、Welcome 对应真实新 connection/gen5。

`baseline03`：构建 raw0、0 warning/error；Native 测试 raw0、4 PASS、0 FAIL、0 SKIP。原始日志 `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeControlledReadmissionDeath/.run/controlled-readmission-death/attempt-baseline03-test.log` SHA256 `70715f8f0911134fe33b5826e312581f9b4aa3f4639dc201bc24d520241e1343`；test-result SHA256 `f28ce7e73a36fc2e5856e5c0404f15cb1a410fd6ca0c9e6f86a7e6059810fc5e`；build-result SHA256 `a2b40a5d838e6281df3c61ca63671086d8e5d7a9956734cb640a56b2f4b78f70`。没有新生产变化，故未追加无关整类重跑。

## 原失败与封存边界

首版 `baseline01` 的两案在 Tick2 就被 `section_subscription_deltas_not_taken` 拒绝：新测试遗漏了原 Host 每 Tick 必须 TakeSectionSubscriptionDeltas 的调用，尚未到目标死亡/重连阶段。这是 `INVALID_FIXTURE_FLOW`，不能当行为 RED。修正仅新测试 helper，在原 Tick 前消费原 pending deltas，没有改变 fixture/生产代码。原源、日志、退出码和完整正常 bin 保留在 `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeControlledReadmissionDeath/.run/controlled-readmission-death/baseline01-frozen/manifest.json`，SHA256 `15bf707c718e681db7c4ca89e946407a718e561c68fab703a09cce03771a8333`。

三案 PASS 的独立封件 `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeControlledReadmissionDeath/.run/controlled-readmission-death/baseline02-frozen/manifest.json` SHA256 `cc52ceccc2e48c0d8432f2228db545ee2267a758ef40a39399b54878e84a9253`，148文件，包含正常 Content/Fixtures 全16个文件，实际测试 PE/CodeView/PDB/源码 checksum 一致；原 source SHA `4d37ac1328d1041352c78c1872364a4c51b1cff102c831d9efd61ee953a81cee`。最终第四案另存 `C:/Work/LumioGames/.101-pack07/LumioGameRuntimeControlledReadmissionDeath/.run/controlled-readmission-death/baseline03-frozen/manifest.json`，SHA256 `ec9c1f12869e433d833eb7ce872eb15b27aefa09183ea60905b44107a08f7c76`，同样148文件/16 Fixtures、实际 PE/PDB/最终新 source checksum 一致，不覆盖 baseline02。

构建产生的38个 generated 文件只有 CRLF→LF 物理差异，逐字 normalized 语义0；原样保留，未 restore/clean/stage/commit。所有 tracked production/input 源语义均与纯520基线一致。

封件 `result.json` 的 nativePhases 是 Node JSON 派生阅读视图，其中超过 JS safe integer 的数字不作身份判据。完整 ID 以原日志的 ToHex 字符串为准；InstanceId/Counter 精确数值如需使用，必须读取原始 JSON 字节，不能从派生 Number 反建 tuple。原 raw 不变。

## 未证明的部分与下一步

这些是正式 Native + 正常 HostedAdmissionFixture 的 process owner/receipt 流程，不能称 Rust signed socket 端到端，也未 Restore live14 的 checkpoint、八人 Gameplay/整局成绩/真实所有 admission history。正常 admission 成功并不证明真实现场所有条件相同。

live14 的 death13560发生于 fresh controlled reconnect socket 活跃区间，后续新票仍指向旧 life3a2；不能将未批准的离线 DRAFT 当成该在线根因。四项反证已经足够停止扩大健康流程案数。下一步由 Root 在 NEW 私有 Game 构建采集原 PrepareDeath 返回的准确 error/阶段，默认关、有界、无新增 Runtime 查询、无输入或世界改写；本代理不写该诊断或任何 Runtime 生产候选，取得真实拒码后再形成匹配的最小 RED。
