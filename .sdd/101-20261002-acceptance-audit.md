# 101 验收恢复审计（2026-10-02）

本次按父仓与 101 AGENTS、知识导航、开发/架构/测试规范、tour、迁移计划、执行账本及最新 `.sdd/progress.md` 读取；只读源与历史工件，没有启动服务或修改正式源。旧账本停在 9 月 29 日的多数结论已经过时，应以当前源、当前发布物和 10 月 2 日失败为恢复基线。

## 当前发布物与可用入口

父仓 HEAD `8787797`，大量已暂存/未暂存/未跟踪成果须保留。Engine gitlink 工作状态 `+7e798301f0d1fda4c646dd18b16cb1dc608a0c9d`；实际 manifest、`eng/BomberRelease.props`、Presentation package 都是 `0.0.4-main.ecece8a`，工作区 AGENTS 的 `ea82985` 描述已过时。

本次实际运行各自官方 `tools/verify-release.mjs --root <dir> --rid win-x64 --json`：

| 路径（均在 C:/Work/LumioGames 下） | 版本 | 文件数 | 退出码 | 适用性 |
|---|---|---:|---:|---|
| LumioGame/games/101-bomber/Engine | ecece8a | 132 | 0 | 当前完整候选，有 Platform digest；hash 一致仅证明布局，不证明运行通过 |
| probe/bomber-final-release-timer2 | ecece8a | 131 | 0 | 最近完整候选，有同一 Platform digest |
| probe/bomber-final-release-timer | ecece8a | 130 | 0 | platformImage=null，不作为完整 Platform 链路交付 |
| probe/bomber-final-release | ea82985 | 131 | 0 | 旧完整候选，不能替代最新技能/协议要求 |
| probe/effect-delta-release-04 | 54930d9 | 131 | 0 | 更旧的独立候选；历史私有实现的接入基线，不应直接替换当前包 |

当前 ecece8a 来源为 Engine `ecece8a4ed42be90f06a4bcd252088ab8e248505`、Runtime `c65c7f80f721360a77abc6dfdc8acdf0944878f2`、Server `460868ea3a2d15081c8e80405da1714fde9b348d`、Client `4d79f50b26392fe8360ddba2062328dc21d38b72`。SDK nupkg 与 NuGet 缓存 SHA256 均 `a988279e7bdad4d9d58b12bf174b65ed4ac7789a7145bd08a18091504dc3fb42`。

当前 server SDK Gas DLL 与缓存 lib/net10.0 均 `652e93a925f671e74cd20c7070308a4895eaa6af5b29f69a91aa40b72ba1a2b0`；Gameplay/bin/Debug/net10.0 中 Gas 为 `fa6593e06851dc6cc1ebaf1428681655d82ed19c3a50f6281554148918651b48`，Ecs 等于包中 Bot/netstandard 风格 `3e5369cf...` 而非 Server SDK `9ef0e4c5...`。这是必须排查的输出图差异，但不是已证实根因。实际反编译两份 Gas 均存在 `GasWorldContext(World)`；不能把历史 MissingMethod 简化为“SDK没有构造器”或未核实地清全局缓存。

`.run/runtime-finite-successor-composition-report.md` 提供私有 RFC 972 文件成品（路径 `C:/Work/LumioGames/LumioGameRuntime-101-finite-successor-composition`），合成 RF/RSC、finite persist、successor 及 bounded publish。其独审 exec 最终 HTTP 502，无批准报告；browser HFSM bridge 独审同样 502。不能将已停止旧 CLI 当作仍在推进，也不能将作者报告视为已审可接入。最新可立即验证的组合是当前完整包＋fresh Game 构建；要整合私有完成品，先按其明确边界重启独审，再通过正式完整打包流程，不能单换 DLL。

## 最新真实失败，不能沿用旧通过

最新 12 个 `.run/launch-*` verification 均为 FAIL。最新 `launch-eQ0GRk`（2026-10-02 10:22，seed 102）实际 Platform 八独立账号/票据、DS_READY、8 Bot 准入成功；step 05–14 全 FAIL。Bot1 实际 386 owner frames、16 uplinks，断言只观察到 self/match/bomb 一部分，未通过底图、连锁、伤害、重生、缩圈、结算/下一局。

`launch-eQ0GRk/ds-boot-1/2026-10-02_000.log` 最新 Tick 499：先 `player_respawned`（gameTick 498，新生命 `...0032`），后 `host.expire scheduled`，紧接 `host.tick failed code=runtime_failure`、host sealed、八连接 1011，外层只报 watchdog。其 Defender 诊断为 0 相关事件且保护开启。真正 managed 异常尚未记录，需要优先补取准确栈。

`.run/hostentry_fault_diag.log` 是更早缺 Logging.Abstractions；`hostentry_fault_diag4.log` 是更早 `GasWorldContext(World)` MissingMethod。它们不等同最新运行故障；当前已有数百真实 Tick、爆炸/死亡/重生事件，不能继续停在启动构造器问题。

## 可复用命令（在 games/101-bomber）

基础门：

```powershell
$env:LUMIO_CONFIG_ROOT='C:/Work/LumioGames/LumioConfig'
node Engine/tools/verify-release.mjs --root Engine --rid win-x64 --json
dotnet build LumioBomber.slnx
dotnet test LumioBomber.slnx --no-build -- --minimum-expected-tests 1
node --test Tools/*.test.mjs
node --test Client/UI/Spectator/*.test.mjs Client/Tests/Application/*.test.mjs
node eng/spec-lint.mjs
node Tools/sync-config-readers.mjs --check
node Tools/sync-config-export.mjs --check
node Tools/verify-config-artifacts.mjs .run/acceptance-20261002/config-fresh
node Tools/official-catalog.mjs --check
node Tools/check-block-assets.mjs
```

`config-fresh` 必须尚不存在。`dotnet test` 不传 `--nologo`；零测试不是通过。根仓还要运行 AGENTS 的 lint、三个 Node guard 套件、`dotnet build LumioGame.sln`、`dotnet test LumioGame.sln`，并提供现打 Native/Engine/Runtime 路径。101 不能引同级 Runtime 源码。

Presentation 在 `Client/Presentation`：`pnpm run typecheck`、`pnpm test`、`pnpm run guard`、`pnpm run build`。视觉夹具入口 `tests/browser-smoke.mjs` 固定依赖本地 Playwright 和端口 5199，只覆盖桌面/手机动画、操作发出和布局；不证明真实客户端完整局。

真实 Bot：

```powershell
dotnet build Gameplay/Lumio.Bomber.Gameplay.csproj -c Debug -p:LumioEcsSide=server
dotnet build Gameplay/Lumio.Bomber.Gameplay.csproj -c Debug -p:LumioEcsSide=client
dotnet build Client/Bots/Lumio.Bomber.Bots.csproj -c Debug
node Tools/launcher.mjs --admission-only --bots 8 --seed 101
node Tools/launcher.mjs --bots 8 --seed 101 --scenario-dll Client/Bots/bin/Debug/net10.0/Lumio.Bomber.Bots.dll --evidence-dir .run/acceptance-20261002/tour-seed101
```

`BomberMatchScenario` 当前确有 13 项真实复制断言、结算 roster/ranking 校验、同房新 MatchId 检查；peer 使用 `BomberMatchPeerScenario` 持续到主 Bot 完成。其一次 PASS 仍不能代替全矩阵、全部 Bot 行为、30 分钟和回放。Launcher 会清空指定 evidence-dir；必须每次给新子目录。

真实浏览器：

```powershell
dotnet build Gameplay/Lumio.Bomber.Gameplay.csproj -c Release -p:LumioEcsSide=client -p:LumioBrowserReplica=true
dotnet publish Client/UI/Spectator/host/Lumio.Bomber.Client.Spectator.csproj -c Release -p:LumioEcsSide=client -p:LumioBrowserReplica=true
node Tools/launcher.mjs --player --bots 7 --seed 101
node Tools/launcher.mjs --player --player-count 2 --seed 101
```

可给 `--origin http://127.0.0.1:18081` 复用已确认存活 Platform。打开打印的 player-url；WASD/方向、Space、Shift 和选角。当前 README 明说仍限制 legacy 19×19/8 人，M2 profile 拒绝；客户端 MoveAbility/放弹预测未完成。可玩浏览器已存在，旧“仅旁观/不联网”计划限制不适用于本次用户全交付要求。

## 验收缺口与对应修复任务

| 必需门 | 当前实现/证据 | 修复/验收动作 |
|---|---|---|
| 完整同房两局 | 最新八 Bot 到重生即 host fault | 捕捉 Tick499 原因，在所属模块修复，恢复完整 14 步，保存每 Bot 结果和 DS 事件 |
| 基础静态/生成/全部测试 | 历史计数跨候选、跨未提交源；本审计仅实际执行 5 次官方发布校验 | 本次实际交付源重新跑非零全套并记 total/pass/fail/skip/exit；生成 consistency 对源和双端 |
| 三档 8/19、12/23、16/27 | m2-room 作者 profile runtimeEligible=false；上游私有成品未整合 | 三档正式包/配表/对象预算/Restore/玩法/房间准入完整接入，不能只调人数 |
| 30 分钟稳定性 | `--duration-ms 1800000` 仅延长 hold，不自动证明 gameplay；无当前真实达标记录 | 做真实活跃 Bot workload，持续读结算/下一局、fault、内存、峰值、P99/overrun；矩阵 V11 实际要求三档各 30 分钟 |
| 逐 Tick 回放 | `verify-evidence` scope 明确 NOT_EVALUATED；`BomberWorldDeterminismTests` 仅 10 Tick foundation snapshot | 上游合法输入边界录制与 authoritative replay producer接齐；同输入两回放非空每Tick状态/事件严格一致、反向断言有效 |
| 多种子统计 | 原型 TS harness 不可作正式规则证据 | T08 默认12/23种子1–100，各100局；普通脚本玩家按时进圈，前3≥50%、K/D≥1；E唯一存活≥85%、均长≤4分钟、1×1可达，8/19与16/27对照；地图三档1–100 |
| skills-on/off | profile 存在不证明技能 production | 三档适用 A–D 行；开关分别完整局/下一局、预算/回放，五角色/六弹形态/稀有踢/最爱/finite Effect、金心/成长完整 |
| 浏览器实操/还原 | authored fixture 与旧预览，未当前正式整局 | 同视口同状态原型对照五角色/HUD/技能/爆炸/音效/结算/响应式；记录console/network/DS和截图/录屏 |
| 最终独审 | RFC/HFSM等旧审查502；若干私有最终成果缺回接 | 对实际集成版本独审，修所有影响交付finding，重新受影响回归 |

建议最快顺序：当前 fresh build 验证 → 针对最新 Tick499 的 managed fault 捕栈 → 修真实重生/复制 fault → 八 Bot 两局 → 补齐已批准 M2/skills source → 完整包重接 → 三档全矩阵/长跑/回放/统计并行 → 真实浏览器最终还原/独审。历史证据完整保留，不为重跑清空或重用任何已有运行目录。
