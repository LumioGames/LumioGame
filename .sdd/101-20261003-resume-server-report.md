# 101 Server observation expiry 修复交回

状态：Server 修复已完成并冻结，等待 Root 独立审查与整合。真实八 bot 整局验收未完成；首死亡附近的 bot-7 `bad_envelope` 留给下一项实际 Host 帧到官方 Client Session 的只读重放诊断。本报告不宣称该 Client 问题已定位或修复。

## 写域与冻结身份

- 工作树：`C:/Work/LumioGames/LumioServer-101-successor-expiry`。
- 分支：`codex/101-successor-expiry`。
- base / HEAD：`161e3777a91842b59a3a89d8f47829bdcf1b5986`；未提交、未推送、未官方重包。
- 冻结目录：`C:/Work/LumioGames/LumioServer-101-successor-expiry/.run/101-successor-expiry/freeze-01`。
- 精确补丁：`freeze-01/server-expiry.patch`，SHA256 `ee771b0ed1eb97417f91caa8efb38fec11924b8feb79ebf6c49e8364f7787295`，17162 bytes。
- 冻结清单：`freeze-01/manifest.json`，SHA256 `0c65b2d4169af9151e4116195339ead5379be4bb5e1ae8ea6a6409edfc28b2fc`。
- `before/` 保存 base 原始字节，`after/` 保存本次交回精确字节，manifest 保存逐文件 SHA256、二进制身份和测试计数。

只改以下 5 个文件，总计 197 additions / 43 deletions；生产改动仅 `Engine/src/owner.rs` 12 行 diff。

| 文件（相对 Server 工作树） | 交回 SHA256 | 用途 |
| --- | --- | --- |
| `Engine/src/owner.rs` | `953b98fada356c5c0d7778e7f535a5a4b6277aff858add2a7466baf0af40804d` | Applied observation expiry 清理 reconnect continuity，停止普通 Entity expiry |
| `Tests/tests/successor_real_clr.rs` | `1305003608c0735e35ff200281d0a26c68c6e901da5708c1cd1f704eb3d7fdd4` | 真实 Native/CoreCLR/鉴权 WebSocket 回归，保留实际帧 |
| `Tests/fixtures/successor_runtime/SuccessorScenario.cs` | `a3edc12ff90a57b0d50adf53bf5da971b31449d24d508ce760cf0d95bd6117c3` | expiry 测试专用 Stage4 环境开关，停在真实 restore 后 |
| `Tests/fixtures/successor_runtime/generated/server/Lumio.GameRuntime.Gas.SuccessorFixture.Registry.g.cs` | `6d8936fac966da652e90fe3424179e49ab8e1fa07dc8aa8054a4cc203b167271` | 官方 SDK generator 生成 canonical health 属性名 |
| `Tests/fixtures/successor_runtime/generated/server/attribute-declarations.json` | `356c41d98cbbc80f44deab7a231bedc25e780c8d84b391c8030294c4100d03bd` | 同上 |

未改 Runtime、HostEntry、NativeCore、Game 玩法、Root 账本或公共契约。本改动恢复既定 observation retention 语义，没有新增公共行为；适用纯 bugfix 的知识文档豁免，本报告用于审查证据交接，不代替正式完成状态。

## 根因与最小修复

已读 Game / Server 入口、知识导航、架构 / 测试 / 风格规范和 canonical successor 契约，应用 systematic-debugging 与 TDD。

canonical 来源为 `C:/Work/LumioGames/LumioGameEngine-101-release-freeze0e/engine/wire/successor-binding-v1.json`，SHA256 `148fe1d1f21ead99b748f079595c3bc27239bc998995be1654f0554a71213331`。其中 observation retention 和 credit ownership 明确：attachment expiry 只到期 route / proof，不隐式销毁 durable Participant、carry / rank 或 prepared entity；prepared entity 清理由 Game / World structural work 负责。

原 `Inner` reconcile 在 `ExpireObservationAttachmentMessage` 返回 Applied 后，只删除 `retained_observations`，随后仍无条件预约 `now + 1` 的普通 entity expiry。下一次 Native timer 看不到 observation retention，落入普通 `expire_with_request_id`，尝试销毁 durable Participant。Runtime 对该结构操作返回 `successor_reservation_invalid`，Host 封存 world。

原真实证据：`C:/Work/LumioGames/LumioGame/games/101-bomber/.run/product-bots/real-tour09a/ds-boot-1/2026-10-03_000.log`，Tick6329 对 Participant `00000000000000010000000000000003` 到期操作 deferred；第27675行 Tick6330 返回 `successor_reservation_invalid`，第27676行 `stage=runtime_tick` 封存。其他 operation_result 的 Applied 并不表示该 tick 整体成功。

修复在 `Engine/src/owner.rs` 的 observation expiry results loop：

- Applied 时调用已有 `drop_reconnect_target`，清理 retained observation、retained account 与 reconnect target，并结束该 timer 链。
- 非 Applied 的拒绝 / 暂时不能执行仍按原逻辑预约重试。

不销毁 Participant / dormant successor，不放宽拒绝、预算或 shutdown 断言，不改变 Game prepared entity 生命周期。

## 真实 RED → GREEN

新增 ignored 集成测试 `expired_observation_preserves_participant_and_dormant_successor`，显式 `--ignored --exact` 执行，因此下面实际运行的 skip 均为 0。

测试经过真实 admission ticket、HostEntry、CoreCLR Runtime、Native kernel 与 WebSocket：接收 initial authorization / baseline，真实 create / restore 后接收 observe authorization，按其 connection 显式断线，确认只预约 1 个 retention timer；推动真实时钟越过 150ms reconnect window 到 500ms，逐 tick 保留 `ok` 断言。再用另一真实鉴权 account 接入，检查实际 baseline 仍有原 durable Participant 与 dormant player，Participant target 指向该实体，matchId `9007199254740993` / lifeGeneration `1` / intentGeneration `1` 不变，最后 shared publication budget 必须归零。

fixture Stage4 开关只阻止后续 transfer。否则 fixture 自身在断线后请求 transfer，会先遭 `successor_capacity`，无法到达目标 expiry。此开关没有伪造或手工注入 Applied expiry。生成器的 `HealthBase/HealthCurrent` → `healthBase/healthCurrent` 是 complete-release-06 官方 SDK 的 canonical 输出。

证据根目录：`C:/Work/LumioGames/LumioServer-101-successor-expiry/.run/101-successor-expiry`。每次真实测试保存 `inputs.json`、`test.log`、`test.exit`、实际 `socket.json` 和诊断目录，inputs 记录运行前源码及所有加载二进制 SHA256。

| 证据 | total | pass | fail | skip | exit | 结论 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `expiry-final-red-01` | 1 | 0 | 1 | 0 | 1 | 只撤回生产修复：真实 Tick31 `successor_reservation_invalid`；原 survival 断言失败 |
| `expiry-final-green-01` | 1 | 1 | 0 | 0 | 0 | 与上行相同测试源码，只恢复 owner 修复；真实 receipts-parts profile |
| `expiry-final-green-02` | 1 | 1 | 0 | 0 | 0 | 最终冻结源码（测试 setup 提取后），真实 receipts-parts profile |
| `signed-nextmatch-final-02` | 1 | 1 | 0 | 0 | 0 | 最终冻结源码：真实签票、initial → observe → transfer → 下一 match observe → transfer |
| `ordinary-expiry.log` | 9 | 9 | 0 | 0 | 0 | 定向 owner expiry 回归，fake Runtime 测试组 |
| `host-owner-full.log` | 65 | 65 | 0 | 0 | 0 | 完整 host_owner 回归，fake Runtime 测试组 |

最小 RED/GREEN 的同测试源码证据是 final-red-01 / final-green-01。GREEN 后只提取测试 CLR setup 以通过 clippy，没有再次改生产逻辑；final-green-02 和 signed-nextmatch-final-02 对最终交回源码重新通过。

静态检查：`clippy-final.log/.exit`、`fmt-final.log/.exit`、`diff-final.log/.exit` 全部 exit0。clippy 范围为 engine / tests，`--all-targets --all-features -- -D warnings`。fixture build exit0、0 warnings / 0 errors。

早期失败如实保留：

- `expiry-red-01` Rust 编译发生 OOM，未运行测试，不作为 RED。没有证据把它与其他 agent 的 OOM 归为同因。
- `expiry-red-02` 是上面说明的 fixture transfer `successor_capacity`，不作为目标 RED；red-03 / red-04 已出现真正目标失败。
- `expiry-green-01` survival tick 已通过，但错误地把同 account 作为新 admission；同 account 仍属于 dormant 生命周期。改为独立 account 的真实观察者，保留原 survival 断言。
- `expiry-parts-green-01` 实体 survival / baseline 已通过，但独立观察者关闭后留下 terminal debt；增加既有的 3 tick 清理模式，继续要求 shutdown budget=0。
- 初次 clippy 报测试函数行数110/100；GREEN 后拆出 setup helper，最终 clippy 通过。

## 复跑与发布输入

独立 runner：`C:/Work/LumioGames/LumioServer-101-successor-expiry/.run/101-successor-expiry/run-real.ps1`。使用新证据 label，避免覆盖原实证：

```powershell
./.run/101-successor-expiry/run-real.ps1 -Label review-expiry-01 -Profile lumio.successor-binding-receipts-parts.v1
./.run/101-successor-expiry/run-real.ps1 -Label review-signed-01 -Test signed_ticket_native_tick_projects_initial_authority_before_baseline -Profile lumio.successor-binding-receipts-parts.v1 -NextMatch
```

runner 设置独立 Cargo target / diagnostics，`CARGO_BUILD_JOBS=1`、`--test-threads=1`；用官方包 Native / HostEntry / Ecs / Replication 与本次 fixture，真实测试命令为：

```text
cargo test -p lumio-server-tests --features test-harness --test successor_real_clr <case> -- --ignored --exact --nocapture --test-threads=1
```

官方输入：`C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261003-controlled-game/complete-release-06`，SDK `0.0.4-main.0e2fc74`。

| 输入 | SHA256 |
| --- | --- |
| release manifest | `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4` |
| Native DLL | `419b74c7b5eac0f85a02ab58eda8485240194060dfd319e816ab35f501bfbfed` |
| HostEntry DLL | `dc498450d6f48058c0d136d6b9eef2c54b7ac576e27366b8a465394a6be830fb` |
| Ecs DLL | `74da7fff23e1aa72b8e8b7d0fd93c8164447c636de47700e254d8404c0648def` |
| Replication DLL | `d1747079aebb82cbade1407c125b89782d080045c2f316080c9e474876687f43` |
| SDK nupkg | `0b1657ec29ec83c4281549ebf787fe0b9187b5d30780b6bc513151bf75dd9c3b` |
| 本次 fixture DLL | `7fc0660d1459f47874439a686f8f610b82933b8d743aafda824d4b5cddf39cf1` |
| 最终真实测试 exe | `48b757f64a23f9cb0ba08c855ea0666884575f03b5e074b18720a3b31aa97658` |

hostfxr 为 `C:/Users/g923/.dotnet/host/fxr/10.0.11/hostfxr.dll`，SHA256 `44f97e946b36415176dbc56a4426565a5e9b3e722c0ad579e20a749e3c0c7bcd`。Runtime 生产输入来自官方包（commit `23356eaf`）；完整打包源身份保留在原 `full-pack-06/handoff.json`。本次 Rust 链接的 sibling NativeCore 源 HEAD 为 `c93b5c62ebd6dab32a92f70efef3e5d07151f689`，与官方包 Native DLL 来源 commit `81b2501` 明确区分，均未改源码。

fixture 通过独立 sdk-selection.props / lock / NuGet cache pin 到上述 SDK，`-m:1 -p:UseSharedCompilation=false` 构建，`fixture-build.log/.exit` 保存结果。编译后仅把 generator 产生的17个 CRLF 文件机械还原为仓库 LF，未改 generated body；哈希保留在 `generated-lf-normalization.json`，最终只有上述两项 generated 文件有语义差异。

## bot-7 BadEnvelope 的实际边界

brief 的 Bot1 索引需要纠正：首次死亡附近真实拒绝的是 bot-7 / account `FollowupTour09a07`，PID21404，observer_id1，connection `conn-c56d200e082925a81a1fb9531ca7734e`，Participant3 / 原 life2。Bot1 是随后 world 被封存后的 `internal_error`，不是首个 BadEnvelope。

`C:/Work/LumioGames/LumioGame/games/101-bomber/.run/product-bots/real-tour09a/bot-7/2026-10-03_000.log` 第17行（2026-10-03T00:17:39.2101478Z）实际解码为 `reason=protocol_rejected phase=protocol generation=1 txn=successor exception=bad_envelope`；第18行本地1008关闭。对应 DS Tick328 在约00:17:39.205提交14 frames，随后 peer close 与 retained expiry。原09a没有保存该 socket 原始帧，不能据此断言具体 Client 校验条件。

已追到 Client successor admission / session 路径：`Client/Gameplay/Session/src/Internal/ClientSession.Successor.cs` 与 `Client/Gameplay/ECS/src/Public/SuccessorAdmission.cs`。其中 correlationId 检查值得在实际帧重放中验证，但尚无证据判定为根因；实际 fixture initial correlationId2 → observe correlationId1 → transfer correlationId2，不能错误假定首 admission 是1，也不能仅凭不同操作域可能撞号就改协议。

下项可直接读取最终 `expiry-final-green-02/socket.json` 和 `inputs.json`，以及 `signed-nextmatch-final-02/socket.json` 和 `inputs.json`，将真实 Host 帧重放到官方 Client Session。Root browser 首次 WebSocketerror 未证实关联，不混为同一问题。未读取 / 打印带票据的 bot 命令首行，报告和 socket 证据不含 ticket secret。

## 未执行与交接风险

未执行完整 Server Rust workspace、完整 HostEntry managed suite、官方完整重包、八 bot 整局复跑或最终 Game 全验收。Root 负责独立审查、整合、官方包及整局后验收。当前证据证明 Server 错误 expiry 链已通过真实 Native/Host 回归，不能替代真实整局完成证据。

请按冻结 manifest 的 base、5项 after hash 与 patch hash 审查；工作树没有暂存 / 提交，不覆盖其他 agent 的成果。已停止扩改。
