# Server 浏览器关闭重进修复：非作者独立审查

日期：2026-10-04。审查者：`schema_pins_review`，非 `reentry_trace` 作者。结论：**ACCEPT**，仅接受下列 `review-02` 精确三文件修复；范围内没有发现需要退回的生产 P1/P2。未接受完整包08、真实八人浏览器体验或正式交付门。

## 冻结输入与边界

Owner 仓为 `C:/Work/LumioGames/LumioServer-101-browser-reentry`，分支 `codex/101-browser-reentry`，实际 HEAD/base `448c90b57fa2e071a224b58b0ef1acfb4189a355`。最终依据为 `.run/browser-reentry/review-02/report.md` 与 `source-manifest.json`；已独立读取实际源、冻结副本与原日志，不以作者结论代替审查。`review-01` 保留历史，不能凭其旧测试哈希消费最终源。

| 最终源（相对 Owner 仓） | 精确 SHA256 |
| --- | --- |
| `Engine/src/owner.rs` | `86ba0843ea6a27873846c45c6448ca5778f5333982e14d14c8c261871e363021` |
| `Tests/tests/browser_reentry_real_clr.rs` | `5452e67fe00c5e358efadc4e86116263f75d6db4cc7c9c6eac6f5a89c41ef159` |
| `Tests/fixtures/successor_runtime/SuccessorScenario.cs` | `6c2671e40aeef1356d3d4aa7934ec72f63e965ab1dc8eafe419a284e2940822e` |

三源在读取前后与最终 manifest、冻结副本逐字节一致。独立逆变换证明 Owner 除已审核的参数传递、当拍候选选择和局部认证副本外，所有原逻辑保留；fixture 除明确专门模式下八行 capacity 重试外，所有原逻辑保留。最终新测试相对 review01 恰增加 35 字节 `#![cfg(feature = "test-harness")]` 和空行，原测试体逐字节不变。`Engine/src/successor.rs` 原授权、socket、代次与 transfer_control 守卫未改；其余 tracked 文件无变化。此审查不写生产源，不提交，不重跑重型测试。

基准 git blob（LF）已独立保存在证据中：Owner SHA256 `953b98fada356c5c0d7778e7f535a5a4b6277aff858add2a7466baf0af40804d`；fixture `a3edc12ff90a57b0d50adf53bf5da971b31449d24d508ce760cf0d95bd6117c3`。这些是基准 blob 哈希，不能混同 RED 带临时诊断的 Owner 源哈希。

## 实际失败与根因

已读 Owner 入口/导航、仓归属、Host、准入/连接与测试规范，并核对当前完整包07 successor 契约。真实 Game live04 的最终日志 SHA256 为 `16f37f8eee9d116d08b1f3fedf1896b46365f604c710b06168ce7fed505c2718`：line12672 `16:21:54.561032Z` 完成 reconnected；line12673 `.575028Z` 首次 `stage=requests`，Runtime 已 Applied4156，而 Host 返回 Applied4155/frames0。之后正常节拍仍唤醒 Host，冻结的是保留批次的发布/Runtime 前进。后续 pending 连接失效可出现其他 hold 阶段，不把全部末尾日志都概括为 requests。

真实新 A 观测显示 socket 在页面时钟 33636.300ms 打开；75067.400ms 的 visible 样本仍 negotiating，received0、bytes0、Self/Participant/World 均未绑定。诊断 EXE 只作为故障定位证据；诊断源码已经从最终生产 diff 移除。

原 `accept_successor_initials` 先验证重附着结果、历史、当前 Owner 事实与匹配 Welcome，再调用只查 `sessions` 的请求选择；新认证 socket 此时仍在 pending。合法的当拍 ready-transfer 请求只能使用刚提交的新 observing 附件，已退休或尚未建立的 session 不能提供它。请求失败使同一已排空批次持续保留；Welcome 无法投递，新连接不能转正，而下一次 Runtime Tick 又被该批次阻止。真实 `transfer-red-02` 精准重现这条环路。

## 守卫与候选原子性核查

候选修复传入原先完整验证出的 transitions，只匹配相同 account、room、Participant 和 observing 模式；要求完整 reservation history 相等。fresh reattach 取原认证 pending authority/egress，拒绝 closing pending，要求 exact socket id/profile 且 open、无 close_requested。既有 transition 仍从自身 session 取得认证，不复制 Game/client 声明的账号权力。

局部 authority clone 仅携带当拍已提交附件，用于原 `transfer_control` 再校验：实际 incarnation/token、immutable old life/epoch、当前 observing view/epoch、Participant、eligibility/restoration/effect authority 及 bounded 编码。这里没有提前更新存储的 admission/session，没有新增 account registry、影子世界或发布通道。没有改协议、额度、模拟频率或 hold 条件。

整个批次的候选与 controls 在原 staged Vec 中先校验，再进入原 enqueue 循环；校验失败不会提前晋升 pending 或插入授权/Welcome。已接受 control 才进入原 pending-request ledger，重试使用精确 request/history 去重。若后续 enqueue 拒绝，仍保留原批次与已接受 ledger；这沿用既有逐项入队/重试行为，**不宣称整个 enqueue 循环是新增的全有或全无事务**。授权/Welcome 插入、stored attachment/sequence 更新及实际路由转正仍在原所有者路径，已 Applied 事实不回滚、不重演。

负控覆盖边界：新候选分支的错 history、关闭/替换 socket、重复 request、错误新代次、部分 enqueue 拒绝以及 withheld publication 原子性，本次是源码与保留守卫的静态核查；作者没有提交这些分支专门的新负向注入结果，审查者也未运行它们。389 项原测试通过不能代称这些新增分支均已逐项实测。

## 原始验证证据与质量

| 作者原始实际记录 | 读取到的结果 |
| --- | --- |
| `transfer-red-02/test.log`、`test.exit`、`socket.json` | **实际 Cargo exit101**；100 次 reentry 全为 Applied19/frames0，socket after=[]；缺 SuccessorAuthorization/Welcome |
| `transfer-green-final-02` | exit0；1 passed/0 failed/0 ignored；最终三源 hash 全匹配 |
| `basic-green-final-02` | exit0；1 passed/0 failed/0 ignored；最终三源 hash 全匹配 |
| `lifecycle-green-01`、`expiry-green-01` | 各 exit0；原真实 lifecycle 与 expiry 保留 Participant/准备生命路径通过 |
| `engine-tests-02.log` | 原记录 389 passed/0 failed/1 ignored；ignored 的真实 CLR 个案如实保留 |
| `clippy-02.log` | 原记录 targeted Engine/Tests all-targets/test-harness、`-D warnings` 成功 |
| `default-target-build.log` | 无 feature 的新增 target `--no-run` 原记录成功，最终 cfg 门生效 |

独审更正作者封存报告的 `Exit1` 表述：`transfer-red-02/test.exit` 明确是 **101**。原日志、原报告不覆盖；不是生产改动，不把失败改称通过。初次 capacity fixture 异常、旧 fixture 仅基本路径通过、第一次 Native 环境遗漏导致的原单测失败、原 clippy too_many_lines 失败与 provenance 文本更正全部保留，均不作为精准 RED 或最终 GREEN。

真实 final02 socket 逐帧为：reattach authorization(epoch3/sequence1) → Welcome3 → 两个 SectionFrame → WorldChange → transfer authorization(epoch4/sequence2) → Welcome4 → 两个 SectionFrame → WorldChange。转移 previous 完全等于 fresh reattach next；新旧 socket connection 不同、Participant 相同，new admission/incarnation/actual GAS authority 在两次授权间一致。Runtime 在重进释放批次后继续前进。原测试真实关闭1001、使用新签票，保留 Host/CLR/Native cleanup 和 shared publication ledger 实际零债务断言；没有以 Owner disconnect API、模拟 socket 或假 Runtime 代替真实链路。fixture 只在专门模式重试返回的 successor_capacity，继续走真实 RequestSuccessorTransfer，不伪造 Applied，不改变额度或其他拒绝。

RED 使用临时仅诊断的旧 Owner 路径与 official07 新 fixture，GREEN 使用最终修复和重构后的测试；不声称 RED/GREEN 新测试逐字节相同。最终 helpers 保留原真实 socket、Tuple、Tick、清理断言，review02 只增加必要 feature gate。

## 身份与后续验收限制

逐项读回全部真实运行 Native、HostEntry、runtimeconfig、Ecs、Replication、hostfxr、fixture DLL 哈希，均与 inputs.json 相符。官方07 manifest SHA256 `652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`；fixture 的严格锁副本消费 SDK `0.0.5-main.0e2fc74`，未替换旧 DLL。

Rust build contract root 为 `LumioGameEngine-101-release-freeze0e`，HEAD `0e2fc74783f9f186d59909b38d4ee70887a21137`。源码 successor JSON 哈希 `148fe1d1f21ead99b748f079595c3bc27239bc998995be1654f0554a71213331` 与 Rust generated CONTRACT_SHA256 一致。包内 public JSON 哈希 `f329cbf543fcdef5c4e12321e0c3e2dcf5ce4c04700ad008372300533d06d5ec`；两者逐字段只有 purpose、decisionRecord、ownership.entry 三处 ADR-139 文字裁剪差异，不宣称原始字节相等，行为/限额/形状相同。

作者 Rust Cargo 实际 sibling NativeCore clean HEAD 为 `c93b5c62ebd6dab32a92f70efef3e5d07151f689`；这是本次 Host 测试构建依赖，与07冻结 NativeCore `81b2501` 不同。真实加载的 SDK Native DLL 仍是官方07。当前审查不将混合来源的 Rust Host 测试产物作为完整官方08发布身份；Root 后续官方消费应重新验证固定依赖闭包。

仍需官方完整包消费后的真实 A/B 同房间、双向移动/放弹同步、至少十次实际关闭重开、性能与截图验收。Platform 仍签旧 gameReleaseId，发布身份未闭合。预测、渲染和其他正式交付缺口不在此审查范围。

## 独立证据

目录：`C:/Work/LumioGames/LumioGame/.run/server-browser-reentry-independent-review-01/`。独审验证器仅做真实文件/原日志读回、源码逆变换与 SHA 对账；最终运行 exit0，未重复 CLR/Cargo 重型验证。

- `verify.mjs` SHA256 `86ec189b30f9c2cc76424d5040fed36c1c3d8cfa21a4cad70c443b953bb3b488`。
- `verification.json` SHA256 `02312191923b39af84ae4fc35f4b5c513d2fea13a82a06df6aae8b0441fa3914`，包含前后 fence、五条实际运行 hash、真实逐帧序列、浏览器停滞摘录和限制。
- `author-source-manifest.json` SHA256 `3bbe6c7670194febca039ce6f573438ca9d02d4494312f3585f43db12b1dc497`；`author-report.md` SHA256 `307887e03c29e38812fa754d8f44a5539cca6c1761666609ada1d892c96b92f6`。
- `exact-tracked.diff` SHA256 `2d47c3c719897b53edd9ee60276d21c5d7af0efc14869aabe9238504af8a5615`；独立冻结三源和两份基准 git blob 已保存。
- `manifest.json` 将固定本报告、上述独立证据和所有引用原始验证日志/退出码/输入/socket/诊断日志的完整 path/bytes/SHA256，生成后不再改本报告。
