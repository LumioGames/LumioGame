# 101 Server observation expiry 独立审查报告

审查日期：2026-10-03。独立 reviewer：`selected_config_review`。只读审查，未参与本次 Server 实施，未构建、未运行测试、未生成声明、未改生产源码；只新增本报告。

## 裁决与边界

- **Spec：PASS。** 最小生产修复恢复既定 observation attachment 过期语义。
- **Quality：PASS（附一项非阻断 P3 证据元数据 finding）。** 未发现这五项冻结源码内应阻断整合的缺陷。
- **批准仅覆盖 freeze-01 的五项 after 源码及精确补丁。** 不批准后继源码、官方重包或最终 Game 验收。

真实 CLR/Native 定向测试成立；八 Bot 整局、正式新 fullpack 的整合与复测仍未完成。Bot-7 BadEnvelope、browser WebSocket error 的根因未由本修复证实，不把它们并为同一问题，也不宣称已经解决。完整 Server workspace、完整 HostEntry managed suite、实机全角色/整局/下一局与最终产品验收均不由本报告替代。

## 输入与身份核验

已按 owning Server `AGENTS.md` 指针顺序阅读 `.spec/AGENTS.md`、`.spec/knowledge/README.md` 和仓库架构边界。公共事实使用指定 Engine freeze0e 文件，没有采用当前其他工作树的契约替代。

| 输入 | 实读 SHA256 | 核验 |
|---|---|---|
| Game `.sdd/101-20261003-resume-server-report.md` | `cb413ff8d6161d258e26b7b80945a19bf04e8c4795f2f229cff776ea3191ee48` | 匹配指定值 |
| Server `.run/101-successor-expiry/freeze-01/manifest.json` | `0c65b2d4169af9151e4116195339ead5379be4bb5e1ae8ea6a6409edfc28b2fc` | 匹配指定值 |
| `freeze-01/server-expiry.patch`，17162 bytes | `ee771b0ed1eb97417f91caa8efb38fec11924b8feb79ebf6c49e8364f7787295` | 匹配指定值 |
| Engine freeze0e `engine/wire/successor-binding-v1.json` | `148fe1d1f21ead99b748f079595c3bc27239bc998995be1654f0554a71213331` | 匹配 freeze manifest |

Server owning root 为 `C:/Work/LumioGames/LumioServer-101-successor-expiry`，base/HEAD `161e3777a91842b59a3a89d8f47829bdcf1b5986`。逐项复核 before 与 after 的实际 SHA；十份文件均匹配。复核时工作树仅列出这五项变更，五项工作树 bytes 也匹配 after。下文源码行号指该 freeze 的 `after/`。

| 批准的源码路径 | after SHA256 |
|---|---|
| `Engine/src/owner.rs` | `953b98fada356c5c0d7778e7f535a5a4b6277aff858add2a7466baf0af40804d` |
| `Tests/tests/successor_real_clr.rs` | `1305003608c0735e35ff200281d0a26c68c6e901da5708c1cd1f704eb3d7fdd4` |
| `Tests/fixtures/successor_runtime/SuccessorScenario.cs` | `a3edc12ff90a57b0d50adf53bf5da971b31449d24d508ce760cf0d95bd6117c3` |
| `Tests/fixtures/successor_runtime/generated/server/Lumio.GameRuntime.Gas.SuccessorFixture.Registry.g.cs` | `6d8936fac966da652e90fe3424179e49ab8e1fa07dc8aa8054a4cc203b167271` |
| `Tests/fixtures/successor_runtime/generated/server/attribute-declarations.json` | `356c41d98cbbc80f44deab7a231bedc25e780c8d84b391c8030294c4100d03bd` |

## Spec 审查

公共契约核对位置为 freeze0e 的 `capacity.retentionEvents`、`capacity.creditOwnership`、`bridge.resultRules` 与 `observation.retention`：

- disconnect/takeover 可在有界保留期保留 observation 与 prepared-life 账；expire_attachment 退休 route/proof 和对应未使用额度。
- 退休 prepared-life 的权威账不等于销毁 prepared entity；Participant、carry/rank 和 prepared entity 的结构清理归 Game/World。
- Applied expire 的 `newAttachment/newBinding` 为 null，仅退休 attachment；原相关性与旧绑定 provenance 不可改写。
- 过期不能复活 proof；普通 live entity expiry 语义仍保持。

生产 diff 仅 `Engine/src/owner.rs:5017` 的结果处理：Applied 时从原来的“删除 retained_observations 后继续预约普通 expiry”改为调用已有 `drop_reconnect_target`，停止该 timer 链。`drop_reconnect_target` 在 `owner.rs:3988` 只清 Host 的 retained observation、account 到 entity 的 retained 映射及 reconnect target，不修改 Runtime/Game 实体。Refused 分支继续保留原本 now+1 的有界重试。

Applied 判定仍经过 `owner.rs:5092` 的 `plan_successor_expiries`，核对 commit fact/code、null 新 attachment/binding、incarnation、Participant、完整旧 observing tuple、history、commit tick 与仍存在的 reconnect target。未放宽拒绝或绕过 correlated terminal result。已取得 Applied 后才退休 Host continuity，符合契约。普通 `expire_with_request_id` 路径、Native timer 调度、Runtime drain/publication 所有者、故障封存与预算断言均未改。没有公共契约、HostEntry、Runtime、NativeCore 或 Game 玩法变更。

fixture 的 `SuccessorScenario.cs:111` 新开关只停在真实 create/restore 之后、发 transfer 之前，避免测试自身的 transfer 干扰目标 retention expiry。它没有伪造 Applied、手工销毁实体或替代真实 tick/鉴权/Socket。这是测试 fixture 内的场景控制，不是生产 Game 分支。

## 生成物来源核验

两项 generated diff 只把属性 ID 的 `HealthBase/HealthCurrent` 更新为 `healthBase/healthCurrent`；值类型、持久化、复制和可见域均未改，fixture 声明仍为 `[DeclareAttribute("Health", IsLethal = true)]`。这项大小写变化确实是语义变化，不能当作换行忽略，但它与本次正式 provider 的生成规则一致：

- 06 release manifest 声明 Runtime 源 `23356eafc365c753b6e8d9987fd069815ff067ce`；只读查看该 commit 的 `tools/gen-declarations/CodeEmitter.cs`，其 BuildRows 明确使用 `Camel(attr.Name) + "Base"/"Current"`。
- fixture csproj 启用 `LumioEcsGenerate=true` / server side，sdk-selection.props 与锁文件 pin 到 `0.0.4-main.0e2fc74`。编译产物的 NuGet import 明确导入该包的官方 targets，targets 调其 `tools/net10.0/any/Lumio.Tools.GenDeclarations.dll`。
- cache nupkg SHA 与正式包 `0b1657ec29ec83c4281549ebf787fe0b9187b5d30780b6bc513151bf75dd9c3b` 相同。直接读取正式 zip：generator DLL SHA `053d2fcbfd1ee062dd18ea86c30c51690b7cb44ecf7b79e0e2373602fe1cd537`、targets SHA `bef85454f6d6f2b0bc4b1d9b72d8544ef45c8e515a470370f3e636f5c812f111` 均与 fixture cache 文件相同。
- `fixture-build.log/.exit` 记录真实 generated 输出后编译成功，0 warnings/0 errors、exit0。`generated-lf-normalization.json` 记录的17个 final after hash均与磁盘匹配；最终语义 diff 仅上述两项 casing。未执行独立再生成。

因此可接受为跟随官方 SDK 的 fixture 生成物更新，不是 Server 私改公共属性语义。批准范围不扩展为 generator 或 Runtime 源码审查。

## 真实验证证据与最终源码对应

此报告复核已有原始日志、exit、inputs 和 socket，未另跑测试。证据根为 Server owning root 下 `.run/101-successor-expiry/`。

| 证据 | 原始结果 | 审查意义 |
|---|---|---|
| `expiry-final-red-01` | 0 pass / 1 fail / 0 ignored，**raw exit101** | Tick31 `successor_reservation_invalid`，原 survival 断言失败；真实目标 RED，见 P3 元数据问题 |
| `expiry-final-green-01` | 1 pass / 0 fail / 0 ignored，exit0 | 和 RED 相同测试/fixture SHA，仅 owner 从 before 恢复 after，成立同源码 RED→GREEN |
| `expiry-final-green-02` | 1 pass / 0 fail / 0 ignored，exit0 | helper 提取后的最终 Rust test hash、owner hash、fixture source hash均匹配 freeze after |
| `signed-nextmatch-final-02` | 1 pass / 0 fail / 0 ignored，exit0 | 同最终三项源码 hash；真实 initial→observe→transfer→observe→transfer，通过下一 match 路径 |
| `ordinary-expiry.log/.exit` | 9 pass / 0 fail / 0 ignored，exit0 | 普通 expiry 定向回归，fake Runtime 组 |
| `host-owner-full.log/.exit` | 65 pass / 0 fail / 0 ignored，exit0 | 完整 host_owner，fake Runtime 组，不称为65项 CLR 实测 |
| `clippy-final`、`fmt-final`、`diff-final` | 均 exit0 | 已有静态检查证据，不替代 Runtime 验收 |

三个真实用例显式 `--ignored --exact` 执行，日志的 ignored 为0；3 filtered out 是未选中的其他用例，不计为通过。最终两个绿测 `inputs.json` 的 Rust test SHA 都为 `130500...7fdd4`；早期同源码 RED/GREEN 为 `631e71...e186d0`。未用重构前的绿测冒充最终源码。

实读 `expiry-final-green-02/socket.json`：18个 before 帧与5个 after 帧；独立 authenticated account 的真实新 baseline 中原 Participant `...0003` 仍存在，matchId `9007199254740993`、lifeGeneration `1`、intentGeneration `1` 不变，target 指向仍存在的 dormant player `...0004`。源码还要求跨过150ms retention 至500ms期间每个 Native/CLR tick成功、timer debt为0，以及最终 shared publication budget为0。`signed-nextmatch-final-02/socket.json` 保留真实五次 authorization，transfer 的 eligibilityRevision 为1→2。它们证明目标 seam 和生命周期回归；没有官方 Client Session 重放或 Bomber 整局证明。

freeze manifest 中全部10项 binaries/contract 文件的 SHA均重新实读匹配，包括正式 Native、HostEntry、Ecs、Replication、SDK、fixture DLL、最终 Rust test exe与host_owner exe；hostfxr 的原始 SHA也匹配输入记录。最终真实 test exe SHA为 `48b757f64a23f9cb0ba08c855ea0666884575f03b5e074b18720a3b31aa97658`，fixture DLL为 `7fc0660d1459f47874439a686f8f610b82933b8d743aafda824d4b5cddf39cf1`。Rust 编译使用 sibling NativeCore `c93b5c62...`，运行加载的官方 Native DLL来源为 `81b2501...`；这两种身份明确分开，没有混称同源。

早期 OOM、fixture transfer capacity、同 account 新准入和 terminal debt 的失败保留，只使用最终目标 RED和最终绿测裁决。绿测并未删 survival、baseline、shutdown 和预算归零断言。

## Finding

**[P3] 红测退出码元数据与原始记录不一致。** 精确位置：Game `.sdd/101-20261003-resume-server-report.md:56`，Server `freeze-01/manifest.json:108`（生成源 `freeze.mjs:53` 硬编码同值）。`expiry-final-red-01/test.exit` 实际为 **101**，两处摘要却写 **1**。日志确证测试执行后在 Tick31失败，因此 RED本身真实有效；错误不影响五项源码身份或绿测通过，但损害机器可复核的精确退出码口径。应另增纠正记录引用原始101，并将以后证据生成改为读原始 exit；本次原freeze/报告输入、红测日志均保持不变。Root 已表示将另写纠正证据/账本。

**源码阻断 finding：无。** 本次窄范围 PASS 不代表上述 P3 摘要值正确，也不代表实际全局验收完成。
