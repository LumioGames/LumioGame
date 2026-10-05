# 101 复制超限修复：完整发布物回接

2026-10-02。参见同目录 `101-20261002-respawn-diagnostic.md` 的真实超限证据。本记录只涉及这条接线；不重开全树来源盘点。

## 可以实际复用的完整基线

`C:/Work/LumioGames/probe/effect-delta-release-04`（P04）实际官方 verifier exit 0、131 文件，版本 `0.0.4-main.54930d9`。manifest SHA256 `5a5f34f5d8d7c8708009b9f29c8d091deb6b73799ae3939dbde932ec548300f6`；SDK `2a91cd295e29b6b1edcc183ebb5ee812bcca1b6d0cf3f07fe2d7328c97305c42`；DS `8bc8c08cee2a9f02931d015d025a976f5196e134f993fa850f8430c99f8defd0`。

对应实际可用 WSL Platform 镜像为 `lumio-platform-local:0.0.4-main.54930d9-effect04@sha256:7acc5cce1b0cdd2a733e231197451d60e7ea6f7c74b6f7bb285988083d145c50`，本次 Docker inspect 匹配。旧 18082 服务、P04 完整包均未修改。

批准与来源并非仅 Git HEAD：`games/101-bomber/.run/effect-game-package04-release.md`、`effect-package04-root-approved.json` 已明确批准本地 Game Task3 消费，接受当时 3 个 Client lockfile 中既有 GAS System.Text.Json 依赖边补全，原始 sourceStable=false 保留。原 `effect-package04-verification-report.md` 的 HOLD 已由这份后续有界裁决解决，不能只引用旧 HOLD。

原批准输入是已冻结的 Architecture consumer-v10 890 文件和 Runtime final-v11 890 文件；确切来源关联在 `effect-package04-source-association.json` 与 `effect-candidate-evidence-04-verified/sources.json`。原打包脚本 `pack-effect-candidate-04-wsl.mjs` 调用正式 `packFromMain`，当时源根为：

| 所有者 | 当时根目录 |
| --- | --- |
| Engine | `C:/Work/LumioGames/LumioGameEngine-101-container-wire` |
| Runtime | `C:/Work/LumioGames/LumioGameRuntime-101-effect-integrated` |
| Native / Voxel / Server / Client / Platform | `C:/Work/LumioGames/probe/container-delta-candidate-sources/<Lumio仓名>` |

**这些路径现在已有后续修改，不能原样重新运行 pack04 并声称重现 P04。** 本次直接读到 Runtime `WorldManager.Successor*.cs` 和 Client `SessionSuccessorTests`、`BotTransportProfile` 的 successor 分支；P04 release 本身明确排除后续有限 Effect/successor。应使用已冻结清单作为批准输入标识，再组合选定修复，而不是把可变目录名当版本。

## 最短的一致组合与接回顺序

1. 保留 P04 容器增量、uint 转换、owner callback、parts 契约/实现及真实 replica 消费接线；在所属上游组合当前正式玩法需要的有限 Effect、successor 和本次完整 hydration 修复。Runtime composition 的 before-mutation 容量缺陷由当前独审红例修复后再合；`LumioGameRuntime-101-finite-successor-composition` 旧报告不能当独审通过。Hydration 切片独审结果见 `101-20261002-hydration-review.md`。
2. 选定 Server、Client/Bot、Platform 必须与上述 Engine successor/parts/Effect 契约一致。保持 Native/Voxel 实际 ABI 匹配，并保留对应 build-info；当前 root 正构建的匹配 Native 不能被旧 P04 DLL 偷换。用正式 `eng/pack-release.mjs::packFromMain` 输出**全新完整目录**，包含 SDK、Server Host/managed/native、Bot Host、browser replica、web connector/tools、Platform compose+真实镜像及 manifest。不要覆盖 P04，不复制零散 DLL。
3. 一次接回完整 Engine 发布目录、`BomberRelease.props` 与表现版本绑定；Game 缓存和 ArtifactsPath 使用新位置，重建两侧 Gameplay、Bot、Spectator/browser。若版本字符串仍相同，必须按实际 SDK/输出哈希防缓存误用。Platform 用新包 compose 中记录的同一镜像；现有 18084 是 ecece8a 诊断环境，不冒充新包 Platform。
4. 复用候选 Game `C:/Work/LumioGames/probe/container-delta-candidate-game` 的窄接线：显式容器容量/生成契约、浏览器 `WorldChangePartsAssembler`、Section readiness、8 个真实 replica 测试引用。保留根 Game 后续已做玩法修复，不用整个旧 Game 覆盖它。`GTCG` 由 gameplay_audit 独占，本任务不写。
5. DS `transport.max_wire_text_bytes` 保持 **65536**，显式 `world_change_parts:true`；旧候选 `max_deferred_frames_per_connection:64`、`max_deferred_frame_bytes_per_connection:8388608` 是已批准逻辑分帧积压预算，不是提升单帧上限。Client/Bot 必须协商 parts；P04 `BotTransportProfile` 缺省 parts，当前后续源支持 successor+parts 时应按完整新契约选择，不手写 Game 分片协议。browser `GameplayProfile` 与 released web connector 一致，使用 released assembler 原顺序合成后交 Runtime。
6. 先跑 8 replica 死亡/successor 压力与相关上游边界回归，再不带诊断代理运行真实 Platform→DS→8 Bot 完整局+同房下一局；随后按总矩阵继续 30 分钟、多种子、浏览器和确定性回放。P04 旧 16 弹测试与本次诊断都不能代替这一步。

## 已备好的真实回归入口

`games/101-bomber/.run/acceptance-20261002/strict-launcher-regression.mjs` 已实现，可选正式 Game 根与 Platform origin，使用原样生产 launcher、原配置整局 Tick/超时预算、全新证据目录与唯一登录前缀。不注入代理、不更改 cap、不修改运行配置。只在本次子进程停止后清除其日志中的 ticket 参数泄漏。

```powershell
$env:DOTNET_ROOT = 'C:/Users/g923/.dotnet'
node .run/acceptance-20261002/strict-launcher-regression.mjs --game-root C:/Work/LumioGames/LumioGame/games/101-bomber --origin http://127.0.0.1:18084 --out .run/acceptance-20261002/final-respawn-01 --seed 102
```

上例 18084 仅是当前仍红的 ecece8a 复现服务；新完整包集成时换成匹配新镜像的实际 origin。脚本还支持 `--profile <发布物支持的profile>`。`--check` 可以只读重判旧证据，必须显式提供真实 launcher exit。已执行语法检查与帮助均 exit0；对 `respawn-04` 真实失败证据负向重判 exit1，结果 `respawn-diagnostic/strict-rejudge-04.json`，绝未生成虚构绿例。

独立门包括实际 launcher exit0、官方 PASS、14 个唯一步骤、8 实际独立准入、8 个完整结果流/断言、真实伤害重生事件、DS 结构化结算和同 world/room 的下一 match、无 runtime_failure/deadline，运行前后 manifest/scenario 不漂移。脚本明确不声称覆盖持续 30 分钟、浏览器或 replay。

## 八 replica 新场景的接续位置

P04 Game `Server/Tests/Gameplay/BomberJournalReplica.cs` 和 `BomberJournalWireBudgetTests.cs` 已有真实 `IClientReplica` 建立、Welcome、StageAuthority、CommittedOutcome、原发生 Tick/序号/来源和到期检查。复用此工厂，在独立测试副本增加持续正式 Ability/Effect 伤害至死亡、不同 successor 身份与新基线的压力场景，不重复仅两轮 16 弹的旧覆盖。真实物理分帧预算由完整 Server/Client 链路回归检查；单元测试不可自己写分片器冒充 DS。

收到主协调者释放槽位的新指令之前，已在 `.run/acceptance-20261002/replica-stress` 建好独立副本（正式 Game 源未修改，Engine 是只读复用当前完整 ecece8a 的 junction）。新增 `Server/Tests/Gameplay/BomberRespawnWireBudgetTests.cs`，复用原样 P04 `BomberJournalReplica.cs`；测试项目仅增加 released Client ECS/Log 引用。两侧 Gameplay 与测试工程实际编译 exit0、0 warnings/errors，日志 `replica-stress-client-build.log`、`replica-stress-test-build.log`。

一次短执行结果为 **exit2，1 测试、1 失败、0 成功、0 跳过**（`replica-stress-red-01.log`），10.7 秒场景之后在持续放弹阶段遇到 `WorldChange requires a real Welcome`，不是准入阶段。此结果不能冒充超限回归已成功复现，也还未判定是当前 successor 出站消息顺序缺陷还是测试需按正式重绑协议接线。最后仅扩充该断言的 Tick/Observer/Connection 诊断文本，尚未重编译或复跑；两份编译/失败证据对应扩充文本前相同逻辑。主协调者可直接在一致包接回后继续此单例，不必重建整个副本。没有修改 GTCG 或正式源，也没有手设血量、跳过死亡或自制分帧器。
