# Bomber 工具

在 `games/101-bomber` 执行以下命令。工具负责真实发布物、Platform、DS、Bot、地图作者产物和证据检查；Gameplay 和引擎执行权威玩法。完整交付状态与尚未通过的门见[当前执行记录](../.spec/plans/2026-10-02-delivery-progress.md)，验收合同见[十四步与独立验收门](../.spec/knowledge/features/bomber-tour.md)。

## 构建与启动

```text
dotnet build LumioBomber.slnx
dotnet test LumioBomber.slnx --no-build -- --minimum-expected-tests 1
node --test Tools/*.test.mjs
node Tools/launcher.mjs --bots 8 --seed 101
node Tools/launcher.mjs --admission-only --bots 8 --seed 101
```

`launcher.mjs` 编排引擎发布物中的真实 Platform、DS、Bot.Host，账号和票据由 Platform 签发。`account-client`、`bot-credential`、`ds-ready`、`ds-config`、`server-profile` 分别负责账号、凭据脱敏、准入、启动预算、进程清理、DS_READY、体素预算和服务端 profile 检查。`engine-release`、`engine-tools`、`update-engine` 定位并校验 `Engine/` 完整发布布局，不编译同级 Runtime 或 Client 源码。

内部完整发布包可通过 `node eng/select-engine-release.mjs <完整发布目录> <selection.props>` 校验并生成构建选择文件；构建传 `-p:LumioEngineSelectionProps=<selection.props>`，启动传 `--engine-release <同一完整发布目录>`。Game 三端、Bot 场景、浏览器和 DS 必须来自同一发布图。SDK/Web 局部产物不具有完整发布资格。

`--admission-only` 使用 `Client/Bots/bin/Debug/net10.0/Lumio.Bomber.Bots.dll`，须先构建该程序集。它要求 `--bots 8`，为八个 Bot 分别启动 Host 并运行 `BomberAdmissionScenario`。每个账号须获独立票据；DS 保持存活；每个客户端完成准入，产生两条完整、通过的 `result.ndjson`，输入上行数为零，并自然以 exit 0、无信号结束。该模式不接受 `--fleet-per-process > 1`、`--scenario-dll` 或旁观者选项。报告 scope 为 `bomber-admission-only`，Step 05–14 始终为 `NOT_RUN`，包括环境失败时；它不能替代整局验收。

普通整局启动需要通过 `--scenario-dll <同一发布物编译的 Lumio.Bomber.Bots.dll>` 指定完整局场景；缺失场景、.NET、Docker、发布布局或必要环境必须明确报告 `BLOCKED_ENV`，不能写整局 PASS。完整局场景实际检查放弹、爆炸、死亡、重生、结算和同房间下一局。

## 浏览器玩家会话

`--player` 默认启动七个正式游戏 Bot，并为浏览器玩家在 Platform 注册独立账号。`--player --player-count 2` 使用六个 Bot 和 A、B 两个独立玩家，总席位为八个。此模式不能与 `--spectator`、`--admission-only` 合用。必须先构建 `Client/Bots/Lumio.Bomber.Bots.csproj`；可用 `--scenario-dll <path>` 指定同一发布物编译的 Game Bot 程序集。所有玩家房 Bot 都运行持续的 `BomberPlayScenario`，不运行验收场景中的自杀脚本，也不带有限 tour 帧数。缺少 Bot 程序集时在注册账号、启动 Platform/DS 之前拒绝。

```text
dotnet build Gameplay/Lumio.Bomber.Gameplay.csproj -c Debug -p:LumioEcsSide=server
dotnet build Gameplay/Lumio.Bomber.Gameplay.csproj -c Debug -p:LumioEcsSide=client
dotnet build Client/Bots/Lumio.Bomber.Bots.csproj -c Debug
dotnet build Gameplay/Lumio.Bomber.Gameplay.csproj -c Release -p:LumioEcsSide=client -p:LumioBrowserReplica=true
dotnet publish Client/UI/Spectator/host/Lumio.Bomber.Client.Spectator.csproj -c Release -p:LumioEcsSide=client -p:LumioBrowserReplica=true
node Tools/launcher.mjs --player --bots 7 --seed 101
node Tools/launcher.mjs --player --player-count 2 --seed 101 --origin http://127.0.0.1:18084
```

浏览器发布消费完整引擎发布包中的 web/Replica/voxel wasm 与 SDK，需要 .NET `wasm-tools` workload。默认通过 `Engine/platform/docker-compose.yml` 启动 Platform；`--origin` 使用已运行的 Platform，不另启 compose。打开启动器打印的 `player-url=http://127.0.0.1:<port>/play/`。启动器保持运行直到 Ctrl+C。首次进入、刷新和断线重连会为同一浏览器账号重新取票；票据不放进 URL。

WASD 或方向键移动，Space 放弹；页面也提供方向和放弹按钮。浏览器 Gameplay 把 Ability 请求上行给权威 DS，不执行第二份本地权威规则。当前启动器的 legacy 19×19、八人限制及 M2 档位的真实接入状态，以当前执行记录和机器校验为准；待办档位不能靠修改文档宣称可用。浏览器会话启动报告不将 Step 05–14 判为整局通过。

## 配表、地图与资产

配表作者链由 LumioConfig 提供。需要外部作者 checkout 时，设置 `LUMIO_CONFIG_ROOT`，Windows Python 可通过 `LUMIO_PYTHON` 指定真实解释器。源表位于 `Gameplay/Tables`，双端 Reader 和投影必须由官方工具重生，禁止手改。

`--seed`（或 `LUMIO_GAME_SEED`）接受 0–4294967295，默认 1；服务端从不可变 `game.initial_seed` 读取第一局种子。启动器使用所选完整引擎包的正式配置编译器，为本次 seed 生成配套的两端导出并记录在证据目录的 `seed-config/`；原有源表与导出保持不变。默认配置和已登记 profile 可自动找到作者源；自定义导出改 seed 时须用 `--config-source <作者源目录>`（或 `LUMIO_CONFIG_SOURCE`），启动器先核对源表与选定两端一致，避免丢失自定义参数。下一局种子由 Runtime 确定性流产生。

```text
node Tools/sync-config-readers.mjs --check
node Tools/verify-config-artifacts.mjs <尚不存在的临时产物目录>
node Tools/official-catalog.mjs --check
node Tools/check-block-assets.mjs
node --test Tools/capture-basemap.test.mjs Tools/official-catalog.test.mjs Tools/check-block-assets.test.mjs
```

地图作者链位于 `capture-basemap.mjs` 和 `Lumio.Bomber.MapAuthor`，通过发布物 Native 写格并 capture；DS Restore 正式底图。官方目录 ID 与玩法 block kind 的映射由地图工具维护。

不带参数的 `node Tools/capture-basemap.mjs` 写 `Server/Assets/Maps/bomber.voxel`。M2 作者底图用 `--profile m2-map-19`、`m2-map-23`、`m2-map-27` 选择；`--out` 指定输出，`--verify-only` 通过 SDK Restore 校验。`m2-room-19/23/27` 作者档包含 240000 ms 封顶、8000 ms 再生首触发、20000 ms 停止提前量、2/3/4 镜像组，并关闭前五段强力宝箱。作者产物存在不等于正式房间可运行；必须通过对象容量、动态写格和真实整局验收后才能启用。

## 真实 Host 守卫

`test-server-host.mjs` 先构建，再逐例启动独立 MTP 进程；每例必须 `total=1 passed=1 failed=0 skipped=0`，固定英文输出用于解析统计。缺失输入明确以 `MISSING_INPUT` 失败，不跳过真实契约。

```text
dotnet build Gameplay/Lumio.Bomber.Gameplay.csproj -c Release
dotnet build Tools/Lumio.Bomber.Gameplay.Tests/Lumio.Bomber.Gameplay.Tests.csproj -c Release
# 先将 LUMIO_BOMBER_CATALOG_WORLD_OUTPUT 设为新的绝对目录
dotnet test Tools/Lumio.Bomber.Gameplay.Tests/Lumio.Bomber.Gameplay.Tests.csproj -c Release --no-build -- --filter-method Lumio.Bomber.Gameplay.Tests.CatalogWorldTests.AuthorsTheWallSceneOnTheReleaseNative --minimum-expected-tests 1
node Tools/prepare-server-host-inputs.mjs --gameplay-bin Gameplay/bin/Release/net10.0 --voxel-fixture <上述目录>
node Tools/test-server-host.mjs <结果目录>
```

准备工具核验 Native hash，并输出 `LUMIO_BOMBER_GAMEPLAY_DLL`、`LUMIO_CONFIG_DIR`、`LUMIO_TEST_VOXEL_FIXTURE_DIR`；本地调用需设置这三个环境变量，GitHub Actions 通过 `GITHUB_ENV` 设置。两例覆盖 runtime-only 与 runtime+voxel：完整 128 位身份、LogicTransform、HealthPoints 配表初值和持久化、catalog 防御复制、失败恢复不换 Manager、成功恢复更换 Manager 且保留 IngressBudget、runtime-only 快照无 voxel、Physics 随 profile 存在。它们同时检查五个 Bomber 能力恢复前后经 GAS 返回 `bomber_match_not_ready` 的拒绝边界。

## 证据文件接口

```text
node --test Tools/world-assert.test.mjs Tools/verify-evidence.test.mjs
node Tools/verify-evidence.mjs --dir <新的两轮证据目录>
```

`verify-evidence` 是文件接口校验器，结果始终含 `scope: bomber-evidence-interface`、`acceptanceStatus: NOT_EVALUATED`。退出码 0 只表示接口与两轮数据一致，1 表示证据不合格，2 表示参数错误。真正的确定性验收必须使用引擎输入边界录制、实际权威回放、完整状态哈希与独立规则 oracle。测试只在临时目录生成标注 test-only 的数据。

证据目录包含 `expected.json` 和独立的 `round-1/`、`round-2/`。每轮包含：

| 文件 | 接口 |
|---|---|
| `manifest.json` | schema `bomber.replay-evidence/1`、独立 runId、source `authoritative-replay`、整数 seed、小写 SHA-256 字段 releaseSha256/configSha256/baseMapSha256/inputsSha256 |
| `inputs.ndjson` | 非空 `{tick,input:{...}}`，tick 单调且为非负整数；保留引擎输入边界完整 payload；UTF-8 换行规范化为 LF 后计算 inputsSha256 |
| `ticks.ndjson` | 连续 `{kind:tick,tick,stateHash,events:[...]}`，末尾为 `{kind:complete,lastTick,status:success}`；event 为 `{type,entityId?,data?}`，身份必须完整、data 为对象 |
| `world.json` | 与 expected.json 相同的世界接口，tick 等于结束 tick |

世界接口为 `{schema: bomber.world-evidence/1,tick,cells,entities}`。cells 非空，元素 `{x,y,z,blockType}` 使用安全整数坐标、官方目录 uint16 ID；entities 非空，元素 `{entityId,type,fields}` 使用非默认小写 32 位 hex 身份和非空观测字段。坐标与实体身份不能重复，嵌套数字必须有限。格表与实体表按 key 对齐，其他值严格一致；expected 来自独立规则 oracle，不能复制 actual。

严格 envelope 拒绝未知字段；业务事件数据放进 data。空证据、坏 JSON、非对象、末行不闭合、错误记录、缺少结束标记、无事件、Tick 缺口和截断身份均失败。两轮 seed/release/config/map/input 必须相同，逐 Tick 比较 stateHash 和完整事件序列，不放宽 Tick 偏移或排除事件类别。

## Schema 身份审计

`Gameplay/Compatibility/schema-identities.json` 的 schema、status、freezeEligible 和 pendingDomains 为当前机器状态；不能沿用历史勾选作为本次冻结证据。

```text
node --test Tools/schema-identities.test.mjs
node Tools/verify-schema-identities.mjs --bootstrap-ref fab6f08ebe717614c04383a71d1e25ea6c071711
node Tools/verify-schema-identities.mjs --baseline-ref <经独立审查的变更前完整提交SHA>
```

bootstrap 只用于最早没有候选账本的固定历史提交。后续审计使用严格早于当前 HEAD、经独立审查的完整小写提交 SHA，从 Git blob 读取账本而非工作树候选。祖先关系不代替审查；不能用 HEAD、缩写 SHA 或当前候选自建基线。源声明和双端 generated 必须先由 SDK 官方生成器重生，并按[生成声明归 SDK 的决策](../.spec/decisions/0002-generated-declarations-owned-by-sdk.md)独立核对。发布物来源须与账本 engineRevision、runtimeRevision 对应。

删除、重命名或重定型时，保留独立历史中每个原形状及证据的不可改写 tombstone，并按实际迁移填写 transition、replacement 和发布决定。不能改旧 tombstone、改 scope 躲身份或一起删除源和账本。新 Effect、Tag 和未定公共语义须另行裁决，表内数字不是 GAS EffectType 分配。

审计退出码 0 只证明支持范围内身份一致；1 为账本、历史、声明或生成形状诊断，包括读取期间变化；2 为参数、JSON、基线、历史对象或必需输入无法读取/不受支持。查看 diagnostics、diagnosticCount、diagnosticsTruncated、inputHashes 和 pendingDomains；不能修改基线抹去失败。该命令不证明运行时序列化、发布兼容或公共接口已冻结。

## 从 Sample 迁移的边界

移除的 MC/lakeside 作者工具、300 Bot spectator/stress、挖矿 oreCount fixtures、Sample 存档重启与历史 integration PASS 见[迁移记录](../.spec/plans/2026-09-27-tools-migration.md)。八 Bot 连续 30 分钟、skills-on/off 整局、真实浏览器完整对局、逐 Tick 确定性、多种子统计和完整规则矩阵仍是必需验收；不因旧 Sample 工具移除而免除。
