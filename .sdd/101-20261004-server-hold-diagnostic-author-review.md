# 101 私有 Host hold 诊断作者交回

状态：**已封存，待非作者审核。仅私有诊断；未提交、未打包、未运行到浏览器，不是修法或体验验收。** live10 的服务、二进制、原日志和失败第八次重进现场均保留。

## 精确范围与来源

所属新树 `C:/Work/LumioGames/.101-pack07/LumioServerHoldDiagnostic`，分支 `codex/101-server-hold-diagnostic-v2`，clean 基准 `15418fc104a97fc30f7de45fd0f0c7c93309777c`。首次尝试分支名已被旧 Server10Diagnostic 的封存测试占用，未复用、未更改该旧树；另建本树。

生产写集严格两文件，当前停止写入：

| 文件 | SHA256 |
| --- | --- |
| `Engine/src/owner.rs` before | `86ba0843ea6a27873846c45c6448ca5778f5333982e14d14c8c261871e363021` |
| `Engine/src/owner.rs` after | `3897a6e4a6e384a4743fb98f4f2a9f30592bf3b8a20fc2aa55dcef76a54a20b1` |
| 新 `Engine/src/owner/hold_diagnostic.rs` | `2796760f02941ca2e4609140b20c49935a0d29bb691191332ca031f3d6f80fd7` |

封存：`.run/hold-diagnostic/seal-01/source-manifest.json` SHA `4f64ec61974ec5bbc20e93975fcf0199e215de0ab35e0b0d902242d2841a414e`。同目录含完整 before/after、`exact-two-source.diff`、原日志与命令脚本；不包含 manifest 自身或重定向中的行政结果文件，避免自输出哈希循环。

## 观测行为与限制

只有显式 `LUMIO_PRIVATE_HOLD_DIAGNOSTIC=1` 启用；进程第一次检查时缓存配置。缺省不进入诊断 TLS、不输出诊断、不改原返回值。既有路径仍有极小检查成本，未声称零性能扰动。

三个 gate：receipts、Runtime pending delivery、successor publication/correlation。在原条件已经成立后才观测，不额外调用 Runtime、查询、时钟、准入或恢复。receipts 的 key 使用 `last_committed_tick`；delivery 使用刚取得的原 `RuntimeTick.applied_tick`；successor 使用既有 parked packet 的 `RuntimeTick.applied_tick`。不使用持续增加的 Host 重试 tick 作为批次身份。

Owner 线程 TLS 固定 32 个 `(gate, applied_tick)` 槽；同 key 只输出首次，满 32 槽后静默。无动态增长、定时或后台任务。这个私有诊断针对单房间进程；key 不包含 room，多房间相同 gate/tick 会互相抑制，不能将其用于多房间完整诊断。

每组最多 **16 条日志，包括 header/footer，最多 14 条 tuple 细节行**。只读既有 results → requests → admissions，按原顺序；terminals 仅统计数量。footer 的 `truncated=true` 表示 tuple 被行预算截断，不能据缺失行断言对应记录不存在。每条文本刻意分组以适合 Native 240 字节消息与 8 个数字字段上限；未实际验证日志渲染或输出完整性。原日志设施仍可能截断异常长度值，必须检查 Native 截断标记，不假称捕获全集。

结果输出显式 operation/kind/request/world/participant、前后 attachment/view/life/generation、owner-facts 是否存在、其连接在 sessions/pending_admissions 中是否存在，以及 history token/slot/allocation/life/intent/match/old binding 身份。请求输出既有 transfer expectation 与 history；准入输出初始与当前 attachment、连接及存在性。**不输出 credential、签名、AdmissionProof、accountAuth、payload、帧字节、detail，也不整体 Debug/序列化记录。** 无日志外的新写盘端口。

首次拒绝固定标签覆盖各 planner 明确早退与缺失 Option；先出现的标签保留，不被外层 `initials.results_plan` 等标签覆盖。内部选路闭包的缺失会显示其外层选择失败标签，不承诺拆开每个内部校验。RefCell 只在固定诊断记账期间借用，日志发出前已经释放；诊断不借用或保存 World、Runtime 或 authority 对象。

## 原行为逐项可逆

`verify-inverse.mjs` 删除新增 module、1 次 begin、4 次 emit、47 次 note，并把 31 次透明 `required(original_option, label)` 恢复成原 Option 表达式。忽略格式和注释后，全部 **41,557 个 Rust tokens** 与封存基准逐项一致；原 guard、短路表达式、`?`、borrow/action 顺序及 Runtime 调用顺序均保留。两侧 token SHA 均为 `f2b5423c3b5af4848264ef9e13e5aa51ae1dde469ff036fbb30b1bec26a1231d`。

这是静态可逆证据，不是运行时语义 RED/GREEN；未绕过任何 hold、预算、额度、协议或 authority 校验，没有世界状态或玩法替代。

## 实际验证

| 实际项 | 结果 |
| --- | --- |
| `cargo fmt -p lumio-server-engine` | 0 |
| `git diff --check` | 0 |
| `cargo check -p lumio-server-engine` attempt01 | **101**：误选 `.101-pack07/LumioGameEngine`，缺 ignored 生成契约；原 fail-closed 构建拒绝。原日志保留，不是行为 RED。 |
| 同命令 attempt02，正确 clean 正式 `LumioGameEngine-101-release-freeze0e` 输入 | 0 |
| `cargo clippy -p lumio-server-engine --lib -- -D warnings` | 0 |
| `cargo test -p lumio-server-engine --lib successor -- --test-threads=1` | raw0；3 passed、0 failed、0 ignored、387 filtered |

原三项为 owner successor fence、Section deferred predecessor ordering、successor 初始授权编码。不是完整 owner/Engine 全测，未声称执行真实 CLR、socket、浏览器或启用诊断的日志测试。本轮将编译槽让给离线死亡与新 controlled admission 同拍的真实 Host 复现，没有为了诊断重复重型构建。

编译 NativeCore sibling 为 clean `81b2501a621db2657bd087db2afa808ecfb9e846`；Engine 契约源 clean `0e2fc74783f9f186d59909b38d4ee70887a21137`，与正式10对应所有者输入。独立新 Cargo target 位于本树 `.run`，没有替换任何旧 DLL、改 Cargo/契约/生成物或旧测试。当前 Git 写集仍只有上述两源。

## 真实失败事实与待定根因

已独立冻结 live10 原日志前缀 `games/101-bomber/.run/browser-experience-repair-01/live-10/server-hold-independent-01/ds-prefix-01.log`，6,043,827 字节，SHA `fd2dc9444fb26ee385bb25284e27eb0d28716d85561a0c8cb1decc650f465f5a`。原 log 仍写，未当 final hash。

最后正常 Host3998/applied3998/frames7 为 UTC `20:02:38.095418`；新 A39 connection 获准 UTC `20:02:38.126300`；第一冻结 Host3999/applied3998/frames0 为 UTC `20:02:38.156033`。冻结前缀包含连续 2,402 行 frames0。旧 A38 真关闭 UTC `20:02:36.106`，A life121 受伤日志 UTC `20:02:36.607479` 在关闭后、重准入前；B 最新权威3997中 A life121 为 AwaitingRespawn/gen7。这个时间关系有别于旧 live09，但尚不能由日志证明 close 的因果或具体 planner 分支。

现有 log 无准确 hold gate/batch。真实 Runtime 三例已排除“正常 Disconnect 后仍保留活 life route 并产生 Applied observe”假设；Root/Reentry 正以真实 Host+CLR 验证离线死亡重试在新准入同拍转 observe 的候选。若该真实 RED 先定位，可保留此诊断而不打包。非作者审核前不提交；即使审核接受，是否经官方完整 DIAG 包消费由 Root 另行决定，不更换 live10 现场二进制。
