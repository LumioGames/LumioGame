# 101 真实重生附近的 runtime_failure 根因

2026-10-02，本次只修改 `.run/acceptance-20261002/respawn-diagnostic` 诊断文件及本报告，未修改正式源或 Engine 发布物。已读取 LumioServer AGENTS、导航、架构/Gameplay 接入规范及所属 Host/Runtime 源码。

## 结论

**实际故障是引擎复制输出超过现有单帧传输上限。不是本次已证实的 GAS 构造器异常，也不是 Defender。**

真实 Platform→DS→8 独立 Bot 的第 4 次诊断在 Tick 427 复现：原 HostEntry 的 `tick` 返回 `ok:true, appliedTick:427`；原 HostEntry 的 `drain` 同样返回 `ok:true`。随后 DS 报 `runtime_failure` 并全房 1011。透明边界记录在同次提交精确看到：

| 输出 | 数量 | 每帧实际 UTF-8 字节 | 默认传输上限 |
|---|---:|---:|---:|
| 现存观察者的 WorldChange | 6 | 68,036 | 65,536 |
| 刚重生两位的 Welcome | 2 | 118 | 65,536 |
| 刚重生两位的完整 WorldChange | 2 | 98,595 | 65,536 |

该次共记录 856 个边界摘要、2,185 帧；前 426 Tick 没有超限，Tick 427 八份 WorldChange 同时超限（最大 98,595）。原始 drain JSON 809,199 字节是八观察者批次，不是 WebSocket 的单帧；故障门须分别比较每个 `bytesBase64` 解码后的帧，不能用批次字节冒充单帧。

此前只凭相邻 `player_respawned` 推测重生逻辑抛错是不充分的。本次将模拟成功与传输失败分离：无 managed exception 栈是合理结果，因为原模拟和 drain 确实成功。Host 所属源码 `Engine/src/owner.rs` 的 `deliver_to_connection` 在 `bytes.len() > max_wire_text_bytes` 时返回 `Delivery::Invalid`；后续 route world-fatal 路径扩大为 `WORLD_FAULT_CODE=runtime_failure`。这与实际八帧超限、紧接全连接 internal_error 和零帧失败摘要吻合。死亡/重生使完整观察者基线和当帧事件一起增长，是触发点，不能靠禁止重生避开。

## 四次尝试与证据

所有路径相对于 `games/101-bomber/.run/acceptance-20261002/`。

| 运行 | 实际结果 | 有效证据/限制 |
|---|---|---|
| `respawn-01` | Launcher exit 1；8 准入；Tick 362 runtime_failure | 未改运行接缝。多弹致死附近全房故障。启用现有 `LUMIO_HOSTENTRY_FAULT_LOG`，未产生 managed fault 文件 |
| `respawn-02` | Launcher exit 1；账号口令不匹配，未启动 DS | 同一隔离 Platform 已存在上一局账号，而 launcher 重新生成密码；此后为每局选择新 login prefix，未重试旧账号 |
| `respawn-03` | Launcher exit 1；8 准入；Tick 392 runtime_failure，继发 owner_result_deadline | 标准 DOTNET_STARTUP_HOOKS 只作用于 muxer Bot，不作用于 Native 宿主的托管加载；此办法未能捕捉 DS，不将 Bot 的关闭异常误当根因 |
| `respawn-04` | Launcher exit 1；8 准入；Tick 427 复制超限并全房失败 | 使用只读透明 native/managed 边界代理。原 HostEntry、Runtime、Native、Bot、Game 仍为真实发布物/当前构建；代理只原样转发指针及返回数据并记录摘要。此运行是根因诊断，**不是正式验收通过** |

主证据：

- `respawn-diagnostic/boundary-04.ndjson`：逐 Tick 原 HostEntry 成功/失败原文摘要、每帧真实字节数；最后两行是 Tick427 与其 drain。
- `respawn-diagnostic/frame-summary-04.json`：上述 856/2185/8/98595 汇总和超限观察者身份。
- `respawn-04/ds-boot-1/2026-10-02_000.log`：`player_respawned`、Host expire、runtime_tick fault、连接关闭。
- 每次 `verification.json`、各 Bot `result.ndjson` 和 `respawn-diagnostic/launcher-NN.log`：实际非零失败退出及原始十四步结果。
- `respawn-diagnostic/proxy/{Entry.cs,BoundaryProxy.csproj}`、`proxy-run.mjs`：可审查的诊断实现；独立编译 exit0、0 warnings/errors，不引用 Game/Runtime 源码。代理改动只写本次生成的 DS config 的 assembly/entry_type/method，绝不修改正式模板或发布物。

自己创建的 Bot 日志里原 process-tools 曾记录原始 admission-ticket 参数，已在运行结束后就地替换为 `<redacted>`，保留其余证据。后续 launcher 的脱敏需要纳入工具回归。未触碰历史日志或其他人的凭据。

结束核对：本次 DS/Bot 全退出；当前 Engine 的 DS、HostEntry、Gas SHA256 仍分别为 `e537d7965c3a0301d5491571d98571619b6a3a39e31e1c68aadbc0463092a187`、`106dd94ded9d7102ca43c57d3d92771fab615636e451807ddeb980006863277b`、`652e93a925f671e74cd20c7070308a4895eaa6af5b29f69a91aa40b72ba1a2b0`，与 manifest 一致。

## 必须在上游修复的接缝

当前完整发布物没有协商的 WorldChange parts 接线。已存在的 9 月 30 日容器增量/分帧工作正针对同一缺口：

- Runtime 源：`C:/Work/LumioGames/LumioGameRuntime-101-container-delta`；旧 `container-runtime-last-fixes-independent-review.md` 明确 owner callback 和 uint CaptureSync 已独审通过。
- Engine 所属契约源：`C:/Work/LumioGames/LumioGameEngine-101-container-wire`（54930d9 系列候选）；必须核实其拥有的 container-delta/parts 合同及授权后再接，不能由 Game 另定公共帧语义。
- 真实候选 Game：`C:/Work/LumioGames/probe/container-delta-candidate-game`；已有显式容量、实际 8 replica 的 journal 回归、浏览器 parts assembler/Section readiness/完整发布绑定；不应盲目重复它的旧修复。
- 完整 P04 发布物：`C:/Work/LumioGames/probe/effect-delta-release-04`，`0.0.4-main.54930d9`，官方 verifier 实际 exit0/131 文件，Platform `lumio-platform-local:0.0.4-main.54930d9-effect04@sha256:7acc5cce1b0cdd2a733e231197451d60e7ea6f7c74b6f7bb285988083d145c50`。它是可审计旧完整接缝基线，不能冒充当前全部技能/重生正式需求完成。

下一步正在逐项核实 P04 实际 SDK、Server、Client、browser 与源码组成，以选择最小一致组合。不得把旧包若干 DLL 拷进 ecece8a，不得升高 65,536 上限，不得删除 journal、丢事件、限制死亡/重生或篡改单元断言。

## 回归缺口与接回要求

当前 `BomberJournalWireBudgetTests.EightRealObserversReceiveCompleteBombOccurrencesWithinWireBudget` 只触发两轮 16 次放弹，未涵盖持续对局的死亡、新实体身份及 successor 重新基线。468 项 Gameplay 全通过不能排除此 Host 链路故障。

必须新增/复用如下实质回归：真实 WorldManager + 发布 Native、8 个真实客户端 Replica，持续正式 GAS 放弹到至少一名真实死亡与 successor 绑定；在完整编码边界验证所有物理帧 ≤65,536，普通更新与新生命/迟入完整基线都经过同一协商生产链；原始事件身份、来源、次序、存活期与到期逐 Tick 观察不变；不通过直设血量/手调系统替代实际 Effect/结构相。先在当前包复现红，再在一致完整新包回归绿。最终必须再次不带代理运行正式 launcher 八 Bot 完整局、结算、同房下一局。

## 当前可复用诊断环境

本任务独立创建的 WSL compose project 为 `bomber-acceptance-respawn-20261002`，Platform `http://127.0.0.1:18084`，实际镜像 digest 为当前 ecece8a `586e0438...daf4`，games-seed exit0，数据库仅本任务账号。旧 18081/18082 服务未改。为主协调者的后续真实回归暂保留该隔离 Platform；每次独立 run 设置新的 `LUMIO_LOGIN_PREFIX`。清理只对本 project 使用原 Engine compose `down -v`，不能停止所有 docker 容器。
