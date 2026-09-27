# 开工提示词 · LumioGame 101 炸弹人上引擎（照 LumioSample v0.0.1 的正规做法，四轮走完）

> 用法：整段贴给一个新的主会话（Claude Code，工作目录 `~/LumioGames/LumioGame`）。本文件只是提示词，任务真值以 Workflow 线上单为准。
> 写于 2026-09-27。引擎发布物当前版本 `LumioEngineRelease v0.0.1`（LumioSample 已钉，origin/main `c8385cf`）；101 网页原型第 4 轮已合入 LumioGame origin/main `35b3fef`。

---

## 0. 任务与节奏

把 **101 · 体素炸弹人「帽王乱斗」** 从 TS 网页原型做成**真正跑在 Lumio 引擎上的游戏**。写法、目录、引擎消费方式、配表、底图、Bot、启动器、旁观页、验收证据，**全部照 LumioSample v0.0.1 做，目录结构逐文件对照 Sample**（§3.2）。

**四轮走完，一轮做完再进下一轮，中间不回来问我**（§1 列的四件事除外）：

| 轮 | 干什么 | 这一轮结束的标志 |
|---|---|---|
| **第一轮 · 打地基** | 读透资料、对账、定设计、搭出和 Sample 同构的空骨架、把所有接口物（组件 / 实体 / 事件 / 配表 schema / 技能输入 / 底图）定下来、拆单落单 | 骨架已合入 main；接口物已冻结；所有第二轮的单都在线上、文件集互不重叠、`readiness=ready` |
| **第二轮 · 正式写代码** | 多个 worker 并行按单写代码 → 推分支开 PR → 主 loop 粗看后合入 → 下一批 | 所有单的代码都已合入 main |
| **第三轮 · Review** | 按模块分批做对抗审查 → 问题写成 bug 单 → 派 worker 修 → 合 → 复审修复 | 最后一轮审查无 P0 / P1；P2 都已建单 |
| **第四轮 · 本地测试** | 在合入后的 main 上本地编译、测试、一条命令跑整局、确定性 / 规则 / 稳定性门 → 红了按根因修、合、重测 → 本地全过后才触发 CI → 循环到全绿 | §8 完成定义全部成立 |

**通用纪律（四轮都适用）**
- 前三轮**不等 CI、不看 CI**，也不要求本地编译跑测（worker 想跑 `dotnet build` 自检可以，不强制）。PR 上 CI 红照合。**唯一例外**：第一轮的骨架必须本地编过、启动器能把 8 个 Bot 送进房间（§5.1 第 6 步）——地基不牢，第二轮的并行全白做。
- 所有进 main 的改动都经 PR、merge commit，禁止直推 main、禁止 `--admin` 绕保护。
- 发现问题当轮就建单，别攒在脑子里；每轮结束在 RM-00013 写一条轮次小结评论（合了什么、剩什么、发现什么）。
- 同一问题三次修不过 → 停下质疑方案、拆问题重拆单；只有方向问题才升级 Owner。

---

## 1. 授权范围（Owner 常设授权，这些不用再问）

- 在 `LumioGame` 里建分支、推分支、开 PR、**合入 main**。
- 在 Workflow 项目 `lumiogamesengine` 的 **RM-00013**（体素炸弹人 · Stage 0 杀手原型）里建单、改单、派单、流转、评论、建 bug 单。
- 在 `~/LumioGames/` 下建 / 清理本任务自己的 worktree 和分支（只清自己建的，且只在读回 PR 为 MERGED 后清）。
- 写 ADR 与 feature 文档；改 `docs/specs/bomber/` 下与本任务直接相关的段落。
- 引擎缺口需要改引擎仓时：在架构仓 `LumioGameEngine` 登记、在对应引擎仓派 worker 做，同样按四轮节奏走（§5.5）。

**要先问一句再做的**（只有这四件）：
1. 触碰世界模型（出现体素 / 实体之外的第三种东西、在体素里存业务数据、GAS 之外另造预测）——架构变更，先开 ADR 再问。
2. 引擎公共契约 / 公共错误码的**语义**新增或改变（单纯补实现不算）。
3. 对外发布新的引擎 tag（`LumioEngineRelease v0.0.2` 之类）。
4. 删除不是本任务建的分支 / worktree / 数据。

问的时候：**结论先行 + 对比表 + 一次只问一个问题**，大白话，带一个编号步骤的游戏例子。问完**不停工**，先做不受影响的单。

---

## 2. 必读（第一轮开头读完；读到的规则一律照办）

**LumioGame（本仓）**
1. `.spec/AGENTS.md`、`.spec/knowledge/README.md`（会话已强制载入就不用再读）；`.spec/knowledge/standards/` 四份。
2. 玩法真值：`docs/specs/bomber/design.md`（§2 核心循环、§4 局制与决赛圈、§5 地图、§6.1 手感、§7 炸弹、§8 技能、§9 帽子、§12 血量死亡、§13 结算、§15 默认值、§16 实现切片、§17 遥测与门槛）。
3. 内核契约：`docs/specs/bomber/stage0-kernel-contract.md`（v2，对齐架构第二样板）、`stage0-test-matrix.md`。
4. 决策：`.spec/decisions/` 0011–0033，尤其 **0024**（按游戏分目录、原型是抛弃型参考）与 0025–0033（原型各轮定下的规则改动）。
5. 原型：`games/101-bomber/prototype/README.md` 全文，特别是「内容范围」「结构与接缝」「原型扩展（NON-CONTRACT）」和它对契约没定的地方做的取舍。**原型只是手感和画面的参考，不是规则真值**；它的 `src/sim/` 生产代码不得 import 或照抄。
6. 旧 C# 契约壳：`modules/server-gameplay/src/Lumio.Game.ServerGameplay/Bomber/`（23 个 .cs），以及它现在怎么经同级 `LumioGameRuntime` 源码编译（根 `Directory.Build.targets`）。

**LumioSample（样板，读 origin/main）**
7. `README.md`、`AGENTS.md`、`.spec/AGENTS.md`。
8. `.spec/decisions/0001`（配表是 JSON 文件）、`0003`（**引擎只从子模块 `Engine/` 取**）。
9. `.spec/knowledge/features/sample-gameplay.md`、`sample-tour.md`。
10. **整棵目录树逐文件过一遍**：`git -C ~/LumioGames/LumioSample ls-tree -r --name-only origin/main`。§3.2 的对照表以它为准。

**LumioGameEngine（架构仓）**
11. `.spec/rules/system.md`（世界模型、错误码、NativeCore、hfsm、Tick、GAS 预测——全是红线）。
12. `.spec/knowledge/features/bomber-slice.md`（世界模型套用表、13 项引擎能力、第二样板代码）。
13. `game-workspace.md`、`sample.md`、`tick.md`、`gas.md`、`ecs.md`、`movement.md`、`voxel.md`、`config-table.md`——写到哪块读哪块。
14. ADR-102（游戏工作区与 SDK 消费）、104 / 105 / 106、117（游戏不得依赖引擎测试夹具）、121（错误码）、123（引擎发布物仓）、080（公开仓 CI 走 GitHub 托管）。

---

## 3. 已经定了的事（直接照做，不重新讨论）

### 3.1 「正规做法」= Sample 的七条

| # | Sample 怎么做 | 101 照做成什么样 |
|---|---|---|
| 1 | 引擎只从只读子模块 `Engine/`（`LumioEngineRelease` 的 tag）取；`Lumio.Engine.SDK` 只从 `Engine/sdk/` 解析，版本读 `Engine/manifest.json`；没有 sibling / global-packages / nuget.org 第二条路 | 101 同样用 `Engine/` 子模块，钉 **v0.0.1**；**不再经同级 `LumioGameRuntime` 源码编译** |
| 2 | 目录：`Gameplay/`（两端共用）、`Client/`、`Server/`（只放数据）、`Tools/`、`eng/`、`integration/`、`.spec/` | §3.2 逐文件对照 |
| 3 | 配表是文件：`Gameplay/Tables/` 源表 → LumioConfig 编译 → 两端投影 JSON + 生成的只读 Reader；开机装载一次、帧内不可变；**源码里没有数值字面量** | 101 所有数值（引信 2100 ms、危险窗 400 ms、放弹缓冲 125 ms、火力、心数、移速档、重生 / 保护时长、掉落率、再生间隔、决赛圈时间表、技能数值……）全进配表 |
| 4 | 地图是数据：底图是体素快照，由一次性脚本经引擎写格再导出，产物不手改；DS 开机只 restore | 101 的**底图**（地面 + 外圈铁皮 + 硬砖格局）做成体素快照；**每局按种子铺的软砖 / 木箱 / 水、软砖再生、决赛圈清格**是玩法系统帧末批量写体素（这是玩法写格，不是程序化地形生成） |
| 5 | 玩家行为由 **C# Bot**（引擎的无渲染客户端宿主 + 本仓的场景类与输入映射）执行；浏览器先旁观 | 101 的 8 个 Bot 是真客户端：只读自己看到的复制状态、只发技能输入；AI（发育 / 追帽王 / 逃生 / 漫游，easy / normal / hard）按原型 `src/bots/` 的行为移植成 C# |
| 6 | 一条命令：`node Tools/launcher.mjs --bots N` 起 Platform → `lumio-ds` → N 个 Bot，逐步打印 `step=NN`，只凭 DS 日志与 Bot 的 `result.ndjson` 判；缺环境 `BLOCKED_ENV`（exit 2）点名，**不假绿** | 101 同构：`node games/101-bomber/Tools/launcher.mjs --bots 8 --seed <n>` 跑完一整局到结算 |
| 7 | 两轮同底图逐位同哈希；世界断言 | 101：**同种子 + 同配表 + 同输入流 → 同一 State Hash** |

### 3.2 目录结构：逐文件对照 LumioSample

`games/101-bomber/` 就是「一个装在子目录里的 LumioSample」。**规则：**

1. **Sample 根下有的目录 / 文件，101 在 `games/101-bomber/` 下同位置、同层级、同用途地有一份**；命名只做一次替换：`Sample` → `Bomber`、`Lumio.Sample.*` → `Lumio.Bomber.*`、`LumioSample.slnx` → `LumioBomber.slnx`。
2. **101 新增的东西，按 Sample 的同类放法放**：系统放 `Gameplay/` 根下命名 `*System.Server.cs`（Sample 就是 `SampleMiningSystem.Server.cs`，没有 `Systems/` 目录）；组件放 `Gameplay/Components/<分类>/`；技能 `Gameplay/Abilities/<名字>Ability[.Server|.Client].cs`；Effect 放 `Gameplay/Effects/`；实体类型放 `Gameplay/EntityTypes/`；配表 `Gameplay/Tables/{schemas,tables,registry,profiles}` + `repository.yaml`；测试用例源码放 `Server/Tests/Gameplay/`、工程文件放 `Tools/Lumio.Bomber.Gameplay.Tests/`。**不发明 Sample 里没有的顶层目录。**
3. **Sample 有、101 不需要的，不建**，并在 101 的 `.spec/knowledge/features/bomber-gameplay.md` 里列一张「对照 Sample 省略了什么、为什么」的表（例如聊天、矿脉 / 矿石 / 挖掘、MC 导入、存档后重启核对场景、`final-shas.txt`）。
4. **只有三处因为 git / GitHub 的机制不得不放在 LumioGame 仓根**，其余一律在 `games/101-bomber/` 里：
   - 子模块声明写在仓根 `.gitmodules`（`path = games/101-bomber/Engine`）；
   - CI workflow 放仓根 `.github/workflows/bomber-101.yml`（GitHub 只读仓根这个目录）；
   - LICENSE 用仓根那份（Apache-2.0，同 Sample），`Engine/LICENSE` 随发布物。
5. 101 的构建**不得继承** LumioGame 仓根的 `Directory.Build.*` / `Directory.Packages.props` / `NuGet.config` / `global.json`（根那套走同级 Runtime 源码，会污染）。101 目录下放自己的一套（从 Sample 照抄再改名），并在第一轮验证确实没被根文件带偏。

目标形状（左 = Sample 根，右 = `games/101-bomber/`）：

```
LumioSample/                         games/101-bomber/
  .spec/                               .spec/
    AGENTS.md                            AGENTS.md
    decisions/0001..0003, README.md      decisions/0001-*.md 起, README.md
    knowledge/README.md, lessons.md      knowledge/README.md, lessons.md
    knowledge/features/                  knowledge/features/
      _TEMPLATE.md                         _TEMPLATE.md
      sample-gameplay.md                   bomber-gameplay.md
      sample-tour.md                       bomber-tour.md
    knowledge/standards/                 knowledge/standards/  code-style / testing / workflow
    plans/ reviews/ tasks/ tools/        plans/ reviews/ tasks/ tools/
  AGENTS.md  CLAUDE.md                 AGENTS.md  CLAUDE.md
  Engine/  (子模块)                     Engine/  (子模块，声明在仓根 .gitmodules)
  Client/                              Client/
    Application/                         Application/   Lumio.Bomber.Client.Application.csproj …
    Assets/Blocks/                       Assets/Blocks/  地面 / 铁皮 / 硬砖 / 积木 / 木箱 / 水
    Bots/                                Bots/          Lumio.Bomber.Bots.csproj、Bomber*Scenario.cs、AI
    Config/{Tables,Generated}            Config/{Tables,Generated}
    Tests/                               Tests/
    UI/Spectator/                        UI/Spectator/  旁观页（复用原型表现层，见 §4.2）
  Server/                              Server/
    Assets/Maps/                         Assets/Maps/   bomber.voxel、bomber.layout.json、bot-voxel-budget.json
    Config/{Generated,Profiles,          Config/{Generated,Profiles,Startup,Tables}
            Startup,Tables}
    Tests/{Gameplay,Host}, EngineRelease.cs   Tests/{Gameplay,Host}, EngineRelease.cs
  Gameplay/                            Gameplay/
    Abilities/ Compatibility/            Abilities/ Compatibility/
    Components/<分类>/ Config/           Components/<分类>/ Config/
    Effects/ EntityTypes/                Effects/ EntityTypes/
    Tables/ generated/{client,server}    Tables/ generated/{client,server}
    SampleGameplay[.Server].cs           BomberGameplay[.Server].cs
    SampleMiningSystem.Server.cs         BombSystem.Server.cs、ExplosionSystem.Server.cs …（同类放法）
    Lumio.Sample.Gameplay.csproj         Lumio.Bomber.Gameplay.csproj
  Tools/                               Tools/
    launcher / engine-release /          同名同用途，按需取舍（取舍写进对照表）
    update-engine / capture-basemap /
    sync-config-* / verify-* /
    world-assert / tour-steps / ds-* /
    account-client / bot-credential …
    compose/ fixtures/ logs/             compose/ fixtures/ logs/
    Lumio.Sample.Gameplay.Tests/         Lumio.Bomber.Gameplay.Tests/
    Lumio.Sample.Server.HostTests/       Lumio.Bomber.Server.HostTests/
    package.json README.md               package.json README.md
  eng/ResolveLumioSdk.proj, spec-lint    eng/ResolveLumioSdk.proj, spec-lint.mjs
  integration/                         integration/   验收证据落点
  Directory.Build.props/targets        Directory.Build.props/targets
  Directory.Packages.props             Directory.Packages.props
  NuGet.config global.json             NuGet.config global.json
  LumioSample.slnx README.md           LumioBomber.slnx README.md
  .gitignore .gitattributes            .gitignore .gitattributes
  (原型没有对应)                        prototype/   现有网页原型，原样保留，不进 slnx / CI / Release
```

- 旧契约壳 `modules/server-gameplay/.../Bomber/` **迁进 `games/101-bomber/Gameplay/` 后删除原处**，不留兼容、不留转发、不留 `#if`。`Chat/`、`Identity/`、`EntityChat.*`、`modules/config`、`modules/scenario` 等非炸弹人部分**本任务不动**，根 `LumioGame.sln` 仍要按原方式编得过。
- LumioGame 仓根 `README.md` 的目录表、仓根 `.spec/knowledge/README.md` 导航各补一行指向 101。

### 3.3 世界模型套用（按 architecture.md §1.1 四问判定，已判完）

| 东西 | 判定 | 落点 |
|---|---|---|
| 地面、外圈铁皮、硬砖、积木（软砖）、木箱、水 | **体素** | 方块类型走引擎体素；挡路 / 可炸 / 减速等性质由方块材质表定；**不在体素里存任何业务数据** |
| 玩家 | **CS 实体** | `LogicTransform` + 玩家属性（两本账：血量半心点、火力、手上炸弹数、移速档……）+ `AbilityComponent` + `EffectComponent` |
| 炸弹 | **CS 实体** | 格子（由逻辑位置推导）、主人、到期帧、火力、四臂到达长度；生命周期「引信 → 爆炸 → 留火 → 销毁」 |
| 掉落的糖果 / 血包 / 技能糖、决赛圈强力宝箱 | **CS 实体** | 结构单生成 / 销毁；拾取竞争只成功一次 |
| 一局的状态（阶段、局时、决赛圈进度、帽王、排名） | **CS 实体**（挂在世界 / 对局实体上） | 不是第三种东西 |
| 火焰画面、爆炸特效、帽塔、光柱、领奖台演出 | **Local 实体** | 只在客户端，由复制下来的炸弹四臂长度 / 事件长出来，不上网 |
| 移动、放弹、主动技能 | **GAS Ability** | 两端同一段代码；预测只经 GAS（移动 = 逻辑预测） |
| 伤害、中毒、麻痹、回春、减速 | **GAS Effect** | 爆炸 / 毒圈只下单，提交相结算改基础账；击杀 = 跨零由引擎判 |

「爆炸格每格一个实体」「炸弹做成地图上的列表记录」都已被否（LumioGame ADR 0017）。看起来需要第三种东西时，**停下，按 §1 第 1 条处理**。

### 3.4 规则真值的优先级

`stage0-kernel-contract.md` v2（类型形状）＞ `design.md`（规则与默认值）＞ ADR 0025–0033（原型各轮改动，已写回 design）＞ 原型 README 的取舍。原型取舍**逐条核对**，结论写进 `bomber-gameplay.md`；design 没写的由你按「换个游戏还成立吗 / 手感参考原型」自己定并记一行。原型里标 NON-CONTRACT、要进正式实现的字段，**先改契约文档再写代码**。

---

## 4. 做到什么程度（第二轮的全部内容，第一轮拆单时照这个拆）

### 4.1 玩法范围

| 块 | 内容（对应 design §16） |
|---|---|
| **A · Stage 0a 内核（必做，最先保证）** | 19×19 灰盒；移动 + §6.1 手感（双方向、转角吸附 0.5 / 连续 0.25 格、转角缓冲）；放弹（125 ms 缓冲、离格穿透）；十字传播、连锁同 Tick 结算（同弹同人一次、同链同人 ≤ 3 心）；三心半心点、死亡晚一帧、3 s 重生 + 3 s 保护（放弹即解除）；三糖果 + 血包、上限；**帽子 = 强化数**、死亡掉一半强化、掉落 3 s 保护；帽王判定；7 分钟封顶 + 结算数据；8 Bot（四种行为、三档难度）；§17 遥测事件（经引擎日志组件出 logfmt） |
| **B · Stage 1 规则 + 原型已提前的 Stage 2 材质** | 决赛圈（积木 < 20% 或只剩 115 s 触发；13 / 9 / 7 / 5 / 3 / 1 缩圈；末三段清格；强力宝箱；圈外毒；不能复活；活到最后者胜；排名规则）；软砖再生（每 8 s、4:05 停）；木箱（必掉）、水方格（减速 30%、灭弹、溺水）；领奖台 + 结算 + 自动下一局的数据面 |
| **C · Stage 5 角色与技能（Feature Flag 包住）** | 四个角色、三槽、8 种技能糖（含中毒弹 / 麻痹弹）、升到 Lv3、3 条组合进化、占槽不拾取、技能死亡掉落、火焰按暴露时长烧；Flag 关掉时退化成无技能版本、能完整跑一局 |
| **D · 浏览器旁观** | 照 Sample 的 `Client/UI/Spectator/` 做；表现层尽量复用原型 `src/view/`、`src/hud/`、`src/present/`、`src/contract/`——按原型 README 说的，新写一个接引擎复制流的 `GameSource` 替换 `local-host.ts`、不依赖 `src/sim/`（代码进 `Client/UI/Spectator/`，原型目录本身保留）。**浏览器可玩（输入 + 预测）** 归 LumioClient / ADR-067，v0.0.1 的 `Engine/web/` 不支持就记上游单，不在游戏仓自建 |

B / C / D 与 A 一起在第二轮并行写（接口在第一轮已冻结）。

**明确不做**：24 / 48 / 100 人、61×61 大地图、分区与补给、中途加入补偿、狂暴糖、存档与关服重启、账号成长、真人外测。

### 4.2 建议拆单（第一轮落单时用；文件集必须互不重叠，重叠就串行）

| 单 | 文件集 | 轮 |
|---|---|---|
| 骨架：`Engine/` 子模块 + `Directory.*` / `NuGet.config` / `global.json` / `LumioBomber.slnx` / `eng/` / 空工程 / `.spec/` 骨架 / 仓根三处（.gitmodules、CI、README 行） | 见 §3.2 | 一 |
| 旧 Bomber 壳迁入 + 删原处 + 组件 / 实体类型 / 事件按契约 v2 定形 | `Gameplay/{Components,EntityTypes}`、事件文件、`modules/server-gameplay/.../Bomber/`（删） | 一 |
| 配表：全部 schema + 首轮默认值 + A/B 变体 + 两端投影 + 生成 Reader + sync / verify 脚本 | `Gameplay/Tables/`、`Gameplay/Config/`、`Server/Config/`、`Client/Config/`、`Tools/sync-config-*.mjs`、`Tools/verify-config-artifacts.mjs` | 一 |
| 底图：19×19 快照生成脚本与产物 + 方块资产 + Bot 体素预算 | `Tools/capture-basemap.mjs`、`Server/Assets/Maps/`、`Client/Assets/Blocks/` | 一 |
| 启动器骨架 + 引擎解析 + Platform 输入 + 账号客户端（先能起 DS、8 Bot 登录进房） | `Tools/{launcher,engine-release,update-engine,ds-*,account-client,bot-credential,tour-steps}.mjs`、`Tools/compose/` | 一 |
| 移动技能 + 手感 | `Gameplay/Abilities/MoveAbility*.cs` | 二 |
| 放弹技能 + 炸弹生命周期（hfsm）+ 爆炸传播与连锁结算 + 体素批量写 | `Gameplay/Abilities/PlaceBombAbility*.cs`、`Gameplay/BombSystem.Server.cs`、`Gameplay/ExplosionSystem.Server.cs`、`Gameplay/Components/Bomb/` | 二 |
| 伤害 / 血量 / 死亡 / 重生与保护 | `Gameplay/Effects/Damage*`、`Gameplay/{Death,Respawn}System.Server.cs` | 二 |
| 掉落、糖果、血包、拾取、帽子 = 强化数、死亡掉落与保护、帽王 | `Gameplay/{Drop,HatKing}System.Server.cs`、`Gameplay/Abilities/PickupAbility*`、`Gameplay/Effects/Pickup*`、`Gameplay/Components/Pickup/` | 二 |
| 对局生命周期（hfsm）、局时、排名、结算数据、遥测 | `Gameplay/MatchSystem.Server.cs`、`Gameplay/Components/Match/` | 二 |
| Bot：输入映射 + 四种行为 + 三档难度 + `result.ndjson` | `Client/Bots/`、`Client/Application/` | 二 |
| 证据对账 + 世界断言 + 两轮同哈希 + 启动器跑整局 | `Tools/{verify-evidence,world-assert}.mjs`、`integration/` | 二 |
| 规则测试：`stage0-test-matrix.md` 逐行落成测试 | `Server/Tests/Gameplay/`、`Tools/Lumio.Bomber.Gameplay.Tests/` | 二（按接口写，与实现并行） |
| 准入 Host 用例 | `Server/Tests/Host/`、`Tools/Lumio.Bomber.Server.HostTests/`、`Tools/test-server-host.mjs` | 二 |
| 决赛圈 + 圈外毒 + 强力宝箱 + 清格 | `Gameplay/FinalCircleSystem.Server.cs`、`Gameplay/Components/FinalCircle/` | 二 |
| 软砖再生 + 木箱 + 水方格 | `Gameplay/{Regen,Water}System.Server.cs` | 二 |
| 领奖台 / 自动下一局数据面 | `Gameplay/PodiumSystem.Server.cs` | 二 |
| 角色与技能（可再拆 2–3 张） | `Gameplay/Abilities/Skills/`、`Gameplay/SkillSystem.Server.cs`、`Gameplay/Effects/{Toxin,Shock,Regen}*`、`Gameplay/Components/Skill/` | 二 |
| 浏览器旁观 | `Client/UI/Spectator/` | 二 |
| README / 导览 / feature 文档收尾 | `README.md`、`.spec/knowledge/features/bomber-*.md` | 二 → 四 |

---

## 5. 四轮怎么走

### 5.1 第一轮 · 打地基

目标：第二轮所有 worker 拿到单就能直接写，不用再猜接口、不用再搭环境、彼此不撞文件。

1. **对齐 origin/main**：所有涉及的仓 `git fetch`，一律以 origin/main 为准（本机依赖仓常是脏的）。
2. **撞车检查**：扫 `~/LumioGames/` 兄弟 worktree、LumioGame 的 open PR、RM-00013 评论区，确认没有别的会话在做同一件事。撞了先停，查 reflog 与活进程，不清别人的东西。
3. **线上对账**：`GET /search?q=炸弹人`、`/search?q=S0-G`、RM-00013 overview。已知现存：`[S0-G0v2]` 契约 v2（done）、`[S0-G1]` 规则内核、`[S0-G3]` 掉落与糖果、`[S0-G5]` 配表、`[S0-C1]` 网络面契约（backlog）、一张 Runtime 的「公开 Ability API 把炸弹人玩法类型写进泛型签名」单（review 中）。**能复用的旧单改写正文复用，不重复建**；和本方案冲突的旧单按 transitions 关掉，写明被哪张新单取代。
4. **引擎能力对账**：`bomber-slice.md` §3 的 13 项能力逐项对 `Engine/` v0.0.1 实际交付的 SDK（包里的 `content/docs/public-api.md`、`error-codes.md`、XML doc，以及 Sample 实际用到的写法）打勾：有 / 没有 / 有但形状不对。缺口按 §5.5 处理。**这张表写进 `bomber-gameplay.md`。**
5. **写设计文档**（不等 Owner，除非碰到 §1 四件事）：
   - LumioGame 仓根 `.spec/decisions/0034-*.md`：101 上引擎的落点、目录逐文件对照 Sample、101 自带 `.spec/`、只从 `Engine/` 消费、仓根只留三处、旧壳迁移并删除、底图快照 vs 玩法写格的分界、对 0024 哪几条的修订（ADR 不改写，只新增取代）。
   - `games/101-bomber/.spec/decisions/0001-*.md` 起：101 自己的决策（照 Sample 的 0001 / 0003 口径）。
   - `games/101-bomber/.spec/knowledge/features/bomber-gameplay.md`（对标 `sample-gameplay.md`：世界模型表、配表、启动器、验收门、引擎能力对账表、Sample 省略对照表、原型取舍核对、待解决）与 `bomber-tour.md`（对标 `sample-tour.md`：从编译配表到一局结算逐步导览，每步对应引擎哪个接缝）。
   - `stage0-kernel-contract.md` 要改的（NON-CONTRACT 转正、B / C 块新增组件与事件）在这一轮改完。
6. **搭骨架并合入**：§4.2 标「一」的五张单。骨架要能 `dotnet build LumioBomber.slnx` 编过（空工程 + 冻结的组件 / 实体 / 事件 / 配表 Reader），启动器能起 DS、8 个 Bot 登录进房、DS restore 19×19 底图——这是 Sample 十四步的前 6 步，也是后面所有单的地基。这一轮**需要本地编过**，否则第二轮的并行会全部建在沙子上。
7. **冻结接口物**：组件、实体类型、事件、配表 schema、技能输入结构、方块类型表、底图——合入 main 后在 RM-00013 写一条「接口冻结」评论列清单。第二轮再改接口要走一张单并通知受影响的单。
8. **拆单落单**：用 `workflow-planning` 在 RM-00013 落第二轮全部单，`workflow-dependencies` 补边。每张单正文就是派活提示词，必须写清：**文件集**、**前置与 basis**（默认 `interface`）、**验收项**（最后第四轮逐条对）、**世界模型归类**、**要读的文档与样板文件**（指到 Sample 里对应的那个文件）。
9. 跑 `node .spec/tools/lint-extensions.mjs`（红是待办，列出来）。第一轮小结写进 RM-00013。

### 5.2 第二轮 · 正式写代码

1. 用 `workflow-dispatch`：取 `readiness=ready` 且文件集互斥的单**同时扇出**。快 > 稳 > 好。
2. **worktree 一律建在 `~/LumioGames/` 的直属子目录**（如 `~/LumioGames/LumioGame-101-bomb`），不要放 `.claude/worktrees/` 或 `/tmp`——相对路径依赖兄弟仓，放错会断。
3. 并行 worker **各用自己的临时文件路径**，不共用 scratchpad（共用会串数据，评论发错单还删不掉）。
4. 派出去的 worker 在跑时，**不要 SendMessage 追加要求**（会另起副本并发改同一个 worktree）；要补的等它交回再带进下一单。子代理报「完成」可能只是在等后台任务，确认交回物再派接手，不要重复派。
5. worker 交回物只认四件：状态流转（取 transitions 里「待验收」语义的边）、带提交号的证据评论（跑了什么写什么，没跑写「未执行」）、不做的 TODO 补单并引用单号、≤200 字交接纪要（`agentLabel` 必填）。以 diff 为准，成功报告本身不作数。
6. **主 loop 合入前只做粗看**（深审留给第三轮）：有没有冲突、改动是否都在单的文件集内、有没有明显编不过的（引用不存在的符号、签名对不上、漏改调用点）、PR 描述是否和代码一致（写了「已删」的符号真删了）、有没有碰红线（§7）。过了就合；冲突退回实现方合 main 后再推。
7. 一批合完就派下一批，直到所有单的代码合入。

### 5.3 第三轮 · Review

1. 按模块分批（例如：移动与手感 / 炸弹与爆炸 / 伤害死亡重生 / 掉落帽子帽王 / 对局与决赛圈 / 角色技能 / Bot / 启动器与证据 / 配表与底图 / 旁观页），每批派一个 `reviewer` 子 Agent 只读审这批的完整 diff，对照单正文、契约、design、本提示词 §3 / §7。批与批互不依赖就并行派。
2. 重点让 reviewer 查：规则和 design / 契约对不上的地方；世界模型越界；源码里的数值字面量；墙钟与无种子随机数；手写状态机迁移；空集合上永真的断言、坏掉的取证路径（「失败时它真的会失败吗」）；两端代码分端错误；和 Sample 目录 / 写法不一致的地方。
3. 主 loop 是唯一写入方：把 P0 / P1 / P2 写成 RM-00013 的 bug 单与评论（reviewer 自称「我已建单 / 已流转」不采信）。
4. 按 `receiving-code-review` 处理：先对照代码核实再修，不盲改。修复单同样「派 worker → 推 → 粗看 → 合」。
5. 修完的部分再审一轮，直到**无 P0 / P1**；P2 能顺手修的修，修不了的保留单号。

### 5.4 第四轮 · 本地测试（最后才碰 CI）

在**合入后的 main** 上做，不在 PR 分支头上做（基点之后 main 有改名 / 搬家时，分支头绿不代表合入能编过）：

1. `git submodule update --init --depth 1 games/101-bomber/Engine`，确认指向 v0.0.1（或 §5.5 的现编产物，要在报告里写明）。
2. `dotnet build games/101-bomber/LumioBomber.slnx` → `dotnet test`（MTP 测试工程先 build 再跑；`Zero tests ran` 先查是不是没 build，**零个测试不算通过**）。
3. `node --test games/101-bomber/Tools/*.test.mjs` 以及 `Client/UI/Spectator` 下的前端测试。
4. 一条命令跑整局：`node games/101-bomber/Tools/launcher.mjs --bots 8 --seed <n>`，跑到结算与自动下一局。
5. **确定性门**：同种子 + 同配表 + 同输入流跑两轮，State Hash 逐位一致。
6. **规则门**：`stage0-test-matrix.md` 逐行有对应测试且通过；强化守恒（掉出 = 扣除）、同弹单次、拾取竞争只成功一次、地图断言全过。
7. **稳定性门**：8 Bot 连续 30 分钟，无卡死、无不可重生 / 不可拾取状态、无 DS 故障关闭。
8. **Bot 体验指标出数**（首次放弹 / 拾取 / 受伤 / 击杀时间、帽王更替次数、结束方式占比、局长、各角色胜率），和原型第 4 轮统计放一张表比；差得多的逐条解释（规则差异还是 bug），是 bug 就修。
9. 角色技能 Flag 关 / 开各跑一整局；浏览器旁观能看完一整局（截图 / 录屏作证据）。
10. 任何一步红：按 `systematic-debugging` 找根因（先分清代码红 / 环境红 / 依赖漂移——排跨仓红先用 `git archive` 快照固定依赖仓，再怀疑本仓）→ 建 bug 单 → 修 → 经 PR 合 → **从第 1 步重来**。
11. 本地 1–9 全过后，**才手动触发 CI**：`gh workflow run bomber-101.yml`。红了同第 10 步处理，循环到全绿。
12. 红**不得改成假绿**：不删断言、不缩必跑集合、不放宽枚举、不把环境阻塞改成通过、不跳过测试。环境缺东西就 `BLOCKED_ENV` 点名，然后把缺的补上。
13. 全绿后：`workflow-qa` 按每张单的验收项逐条判定、回写证据、流转；写收口报告（§8）。

### 5.5 引擎缺口怎么处理（任何一轮发现都一样）

- 判「是不是引擎的事」只用一条：**换一个游戏它还成立吗**。成立 → 引擎的事；不成立 → 写在 101 的 `Gameplay/` 里，引擎不为炸弹人定制。
- 引擎的事：先查 NativeCore / Runtime 有没有现成的（定时、调度、空间查询、状态机、确定性随机数……）；没有就在架构仓 `LumioGameEngine` 登记（改公共契约的按 ADR → 契约 → 重新生成），在对应引擎仓（RM-00002 / 03 / 05 / 06 / 07）落单并**当场派 worker 做**，同样走四轮节奏。
- 引擎仓合入后，101 用架构仓 `node eng/pack-release.mjs --from-main --out <LumioGame>/games/101-bomber/Engine` 现编一份同布局产物继续开发与测试（这样填的内容被 `.gitignore` 挡住，不得当普通文件提交）；正式发新 tag 按 §1 第 3 条先问。
- **不得**在游戏仓造「临时的」底层实现、复制引擎代码、引用引擎的 tests / fixtures / samples（ADR-117）、借用意思相近的公共错误码（ADR-121）。
- 被引擎缺口卡住的单挂 `basis=implementation`，写清 `reason` 与 `unblockCondition`；其余单照常并行。

---

## 6. CI 的写法与时机

- 仓根 `.github/workflows/bomber-101.yml` 照 `LumioSample/.github/workflows/ci.yml` 改写：公开仓一律 **GitHub 托管 runner**（ADR-080，组织自托管 runner 不接公开仓、会静默排队）；checkout 带 `submodules: true`；**不 checkout 任何私有仓、不读任何 secret**；`paths` 只看 `games/101-bomber/**`；工作目录设到 `games/101-bomber`；必须有 `workflow_dispatch`。
- 第一轮写好合入；前三轮它在 PR 上跑也**不看不等**，红不挡合入。
- 真正用它下结论只在第四轮第 11 步。

---

## 7. 红线与已知的坑（四轮都照办）

**架构红线**
1. 世界里只有体素和实体；静态无逻辑 = 体素，会动或有服务器逻辑 = 实体，只表现 = Local 实体；**不在体素里存业务数据**；GAS 只是实体上的组件，预测只经 GAS。
2. 游戏系统只注册进 Tick 的业务相（第 3 / 4 相），`WorldManager.Tick()` 是唯一路径；不另建 Tick、不另存地形真值、不另存位置真值（位置只在 `LogicTransform`，所在格由它推导）。
3. **一切状态机迁移只用 `lumio-hfsm`**：炸弹生命周期、对局阶段、决赛圈段、玩家生死 / 保护都是。C# 只持 Snapshot、算 Guard、执行 Action，不手写迁移表。
4. 定时、调度、空间查询、确定性随机数先用 NativeCore / 引擎现有的；没有就上游提。规则代码不得用 `DateTime.Now` / `Stopwatch` / 无种子 `Random` / 任何墙钟。
5. 数值全部来自配表，源码里没有数值字面量。
6. 公共错误码只消费引擎生成物；游戏自己的码是游戏的开放词表，不借用引擎公共串。
7. Tick 没有取消；异常按故障处理，不自动回滚重跑。
8. 引擎归引擎、玩法归玩法；「换个游戏还成立吗」不成立就不进引擎。
9. 底层清理不留兼容与过渡：旧壳迁完就删，不留转发层、不留 `#if`、不留「以后再换」的替身。
10. 目录与写法对照 Sample；不发明 Sample 里没有的顶层目录。

**流程坑（都真实踩过）**
11. 对账前先 `git fetch` 看 origin/main；报告自称「读的是本地工作区」的结论先复核。
12. 验合入结果，不验 PR 分支头。
13. PR 描述必须回代码核一遍（曾有三个符号写了已删实际没删；跨仓改名漏了整个目录）。
14. 断言在空集合上永真、取证路径坏掉——每条测试问「失败时它真的会失败吗」，必要时做一次变异自证。
15. `dotnet test` 报 `Zero tests ran` 多半是没先 build；零个测试不算通过。
16. Bot 进体素世界必须带体素预算（Sample 的 `--voxel-config` + `bot-voxel-budget.json`），不带就在第一帧 SectionFrame `session_faulted`——设计行为不是缺陷。
17. 给 Runtime 公共方法加可选参数会炸服务端（HostEntry 反射调用不填可选参数）；拷 dll 到目录无效，.NET 按 deps.json 解析。
18. 提交被 guard-commit 钩子拦，多半是工作区残留（`.claude/worktrees/`、`.workflow-drafts/`）；查清原因处理，**不得 `--no-verify` 绕钩子**。
19. 只在读回 MERGED 后删分支 / 清 worktree；`gh` 并行调用会间歇 401，merge 失败别让串联的清理照删。
20. Workflow API：评论 `targetType` 传错不报错、评论只能追加、建验收项要带 `acceptanceTypeId` + `statusId`；需求单从 backlog 出去先 `in_review`，流转字段是 `toStateKey`；状态一律现查 transitions。
21. 密钥 / 凭据不入库、不进日志、不进提示词；Bot 凭据用 Platform 签发的，本仓不自己签。

---

## 8. 完成定义与最终汇报

**完成 = 以下全部成立**
- `games/101-bomber/` 的目录与 Sample 逐文件对照成立，省略项在对照表里都有理由；仓根只多三处（.gitmodules 条目、CI 文件、README / 导航行）。
- §4 的 A–D 全部合入 LumioGame main，单都在 RM-00013 流转到验收语义的状态、带证据评论。
- 第三轮最后一次审查无 P0 / P1；剩下的 P2 都有单号。
- 第四轮 1–11 全部通过，**CI（workflow_dispatch 那一次）全绿**，run 链接写进报告。
- README（对标 Sample：玩法一句话、它教什么、世界模型四类、五分钟跑起来、引擎从哪来、仓库结构）、`bomber-gameplay.md`、`bomber-tour.md`、仓根 ADR 0034、101 的 ADR 都已合入；lint 跑过（红项列为待办）。
- 旧 `modules/server-gameplay/.../Bomber/` 已删除，根 `LumioGame.sln` 仍能按原方式编过。

**最终汇报**（写进 `games/101-bomber/.spec/reviews/2026-MM-DD-bomber-engine-build.md`，在 RM-00013 评论引用，另在对话里给一份大白话摘要）
1. 一句话结论：101 在引擎 vX.Y.Z 上能不能完整跑一局，确定性与稳定性门过没过。
2. 四轮各一段：做了什么、合了哪些 PR、用了多久、踩了什么坑。
3. 表：每张单 → PR 链接 → 合入提交号 → 验收项判定。
4. 表：验收门 → 命令 → 关键输出 → 通过 / 不通过。
5. 表：Bot 体验指标（引擎版 vs 原型第 4 轮）及差异解释。
6. 引擎缺口清单：单号、在哪个仓、状态、是否需要发新 tag。
7. 原型取舍核对结论（每条：采纳 / 改为 / 理由）。
8. 需要 Owner 拍板的事（如有），每件结论先行 + 对比表。
9. 已知遗留与下一步（Stage 2 大地图、100 人性能门等），附单号。
