# Lumio Bomber 101 · 帽王乱斗

八名玩家�?19×19 体素场地放弹、炸砖、吃糖强化，最后在缩到一格的决赛圈争夺胜利。帽子数量就是强化等级之和；死亡会掉落强化，决赛圈开始后新死亡不再复活�?
**目前处于第一轮基础建设�?* 已有发布�?SDK 骨架、生成配表、正式底图和客户端准入场景；完整玩法、Bot AI、旁观与十四步整局验收尚未完成。登录成功不能代替完整一局通过�?
## 这个样板教什�?
本目录按 LumioSample 的工作区布局消费引擎：共�?C# Gameplay、GAS 输入�?Effect、Native HFSM 状态迁移、体素批量事务、启动时只读配表、真�?C# Bot，以及由运行证据判定的启动器。服务器只从底图快照恢复地形；旧版每局软砖、木箱、水和后续破坏由玩法系统提交体素写入。M2 三档作者底图已将护城河水格写入快照，但房间仍未准入�?
| 世界对象 | 表示与责�?|
| --- | --- |
| 静态地�?| 地面、外圈、硬砖、软砖、木箱、水是引擎体素，方块不存业务数据�?|
| 有服务器规则的对�?| 玩家、炸弹、掉落、火墙、对局�?ECS 实体；位置来�?LogicTransform，对局实体不需要位置�?|
| 静态且带逻辑的格�?| 强力宝箱由体素和计数实体通过引擎稀疏绑定关联，命中数归实体�?|
| 纯表�?| 帽塔、爆炸画面、光柱、领奖台演出属于客户�?Local 实体�?UI，浏览器仅旁观�?|

规则只随 `WorldManager.Tick()` 推进。数值来�?`Gameplay/Tables/`，投影和 Reader �?LumioConfig 生成。完整规则与边界�?[bomber-gameplay.md](.spec/knowledge/features/bomber-gameplay.md) �?[内核契约](../../docs/specs/bomber/stage0-kernel-contract.md)�?
## 五分钟启动入�?
需�?.NET 10、Node.js、Git 子模块及可运行发布物 Platform compose �?Docker。下面的 PowerShell 命令从仓根开始；Windows 使用发布物的 `win-x64`，其他平台按 `Engine/manifest.json` 选择对应 RID �?Native 文件�?
```powershell
git submodule update --init --depth 1 games/101-bomber/Engine
Set-Location games/101-bomber
dotnet build LumioBomber.slnx
dotnet build Client/Application/Lumio.Bomber.Client.Application.csproj
dotnet build Client/Bots/Lumio.Bomber.Bots.csproj
$env:LUMIO_ENGINE_NATIVE_PATH = (Resolve-Path Engine/server/win-x64/SDK/Native/win-x64/lumio_engine_native.dll).Path
dotnet test LumioBomber.slnx --no-build -- --minimum-expected-tests 1
node --test Tools/*.test.mjs
node Tools/launcher.mjs --bots 8 --seed 101
```

现阶段工具全量测试仍有“完整场景尚未实现”的失败门；它会保留到第二轮完成。最后一条命令从真实 Platform 取得准入票据，再启动 DS 和八个独立客户端。没有完�?`BomberMatchScenario` 时，登录后第 05�?4 步为 `BLOCKED_ENV`，进程退�?2，不产生整局 PASS。完整实现后的同一入口将覆盖结算和同房间自动下一局，详�?[bomber-tour.md](.spec/knowledge/features/bomber-tour.md)�?
DS 使用 `runtime+voxel` �?`snapshot_only` 配置。启动器把模板具体化�?`.run/launch-*/server.boot-1.json`，写入本次实际路径、存储目录和 Platform 分配信息；同时传递真实体素预算和 kernel 配置�?Bot。缺少引擎文件、Docker 或准入配置会点名报告 `BLOCKED_ENV`（exit 2）。凭据不写入仓库�?
重新生成配表或底图属于作者工具流程，不是每次运行的前置操作；命令与来源见 [Tools/README.md](Tools/README.md)。配置编译器使用独立 LumioConfig 作者工具入口，运行与构建均不引用同�?Runtime 源码�?
## 引擎来源与仓库结�?
`Engine/` 是钉�?**LumioEngineRelease 0.0.4-main.ecece8a** 的只读候选发布物。SDK 只从 `Engine/sdk/` 解析，DS、Bot �?Native �?`Engine/manifest.json` 选择同一发布布局。本目录自带 `Directory.Build.*`、包配置�?SDK 版本配置，隔离父仓的源码构建方式。产品版本与要求�?SDK 版本�?`eng/BomberRelease.props` 统一�?`0.0.4-main.ecece8a`；实�?SDK 仍从 manifest 读取，缺失或版本不符会阻止构建。该候选包�?Runtime �?`uint` 持久化修复；正式 tag 仍须另行发布授权�?
| 路径 | 用�?|
| --- | --- |
| `Gameplay/` | 两端共用 C#、组�?实体/能力/效果、业务系统、源表与生成声明�?|
| `Client/` | 客户端组合入口、C# Bot、客户端配表与旁观页�?|
| `Server/` | 底图、服务端配置、Gameplay/Host 测试源码�?|
| `Tools/` | 启动器、作者工具、验证工具及测试工程文件�?|
| `eng/` | SDK 解析与文档校验�?|
| `integration/` | 可核对的运行证据与报告入口�?|
| `.spec/` | 本游戏规范、设计决策、任务计划和审查记录�?|
| `prototype/` | 早期网页原型，仅供手感、表现及指标比较，不进正式构建�?|

子模块声明、GitHub workflow 和游戏许可证位于父仓。游戏使用父�?Apache-2.0 [LICENSE](../../LICENSE)；引擎条款见 `Engine/LICENSE`。Sample 省略项与原型取舍逐条记录�?[bomber-gameplay.md](.spec/knowledge/features/bomber-gameplay.md)�?