# 0045 · 101 炸弹人按 Sample 建独立引擎工作区，迁移旧壳并以 v3 草案承接 A–D

- 日期：2026-09-27
- 状态：生效（工作区与范围决策）；接口 v3 尚未冻结，须通过真实骨架门。
- 后续范围：玩法默认档、角色与 M2 设计以 ADR 0034–0044 和 [最新收敛计划](../../games/101-bomber/.spec/plans/2026-09-28-prototype-convergence.md) 为准；本 ADR 的 19×19/8 人、7 分钟、四角色/三槽仅记录开工时的迁移基线，不代表当前正式完成标准。
- 依据：Owner 的[四轮开工计划](../archive/plans/2026-09-27-101-bomber-engine-build-prompt.md) §3.2/4/5.1；沿用 [0024](0024-per-game-directories-and-101-web-prototype.md) 的按游戏分目录与原型隔离。

## 背景

101 网页原型已经验证了部分规则与表现，但仍是 TS 规则替身。旧 C# 契约壳使用同级 Runtime 源码，v2 文档保留了独立帽子资源、64 位身份与旧范围；它不能作为本次真正上引擎的冻结物。Owner 授权按 LumioSample 的目录、SDK 消费、配表、底图、Bot、启动器及证据方式实施，并要求四轮收口。

## 决策

### 1. 一个装在子目录里的 Sample

`games/101-bomber/` 自带 `.spec/`、`Gameplay/`、`Client/`、`Server/`、`Tools/`、`eng/`、`integration/`、`LumioBomber.slnx` 及构建/包/SDK配置。Sample 同类文件保持同位置、同层级、同用途；系统在Gameplay根下命名 `*System.Server.cs`，测试源码与Tools中的测试工程分开。省略项及理由登记在游戏feature，不发明新的顶层目录。

只有三项因Git/GitHub机制留在父仓根：`.gitmodules` 的 `games/101-bomber/Engine` 声明、`.github/workflows/bomber-101.yml`、Apache-2.0 LICENSE。游戏工具必须解析真实Git仓根，不在游戏内另造 `.gitmodules`。

游戏自带 `Directory.Build.props/targets`、`Directory.Packages.props`、`NuGet.config`、`global.json`；不得继承父仓经同级Runtime源码编译的配置。父 `LumioGame.sln` 继续负责其他模块，不把Bomber重复编译进旧工程。

### 2. 引擎唯一输入为发布物

只消费只读子模块 `Engine/` 中的 LumioEngineRelease v0.0.1，初始gitlink为 `042f1d1e5f9c36e460abb818116763c3e97a6337`；SDK仅从 `Engine/sdk/`，版本读manifest，运行时也从该checkout。禁止同级Runtime源码、全局包缓存或nuget.org兜底，禁止引用引擎tests/fixtures/samples。

缺能力在架构仓登记，并由所属引擎仓补通用实现；游戏不复制公共语义或私建替身。duration/period遵守gas M3/M9与ADR-064既定语义；RNG使用Runtime `DeterminismContext.OpenRngStream`。若需新增公共语义或对外发布新tag，遵守Owner原有确认边界，本ADR不授予这些变更。

### 3. 迁移旧壳与本轮范围

取代0024“既有Bomber C#壳本次不搬”的范围限制：旧 `modules/server-gameplay/.../Bomber/` 迁入游戏Gameplay后删除原处，不留兼容层、转发、条件编译。Chat、Identity及其他非Bomber模块不在本次迁移范围；`docs/specs/bomber/` 继续作为产品规范落点。

开工迁移基线按 Owner 原计划为：A 的19×19/8 Bot内核与强化流转；B 的再生、木箱/水、115秒决赛圈、排名与下一局；C 的旧四角色/三槽/八种技能糖/三组合，带 Feature Flag；D 的浏览器只读旁观。后续 ADR 0034–0044 与正式收敛计划已扩大当前目标到 12/23 默认、16/27 对照和 M2 规则；旧基线保留为回归与迁移证据。浏览器只读边界继续有效。

24/48/100人、大地图、分区与补给、中途加入补偿、狂暴糖、存档重启、账号成长、真人外测明确不做。浏览器可玩与GAS预测宿主仍归LumioClient/ADR-067；发布物不足时登记上游，不在游戏造TS规则。

### 4. 底图、运行时写格与世界模型

底图由一次性作者工具经引擎写格后捕获，只包括地面、外圈铁皮与硬砖格局，DS启动只restore。每局种子铺积木/木箱/水、软砖再生和圈清场属于Gameplay的体素批量写；真实成功结果才驱动掉落/资源计数，拒绝不发奖励、不fault世界、不自动重试。

体素只承载地形。玩家、炸弹、物品、对局和圈状态为CS实体/组件；宝箱为占格体素与Native绑定计数实体；纯画面为Local实体。位置只用LogicTransform或正式体素绑定；移动/放弹/拾取/角色技能走GAS，状态迁移走Native HFSM，WorldManager.Tick为唯一Tick路径。

所有可调数值进表，生成Reader/双端投影；相同发布物、底图、初始化身份、seed、表与输入流产生相同StateHash。浏览器与Bot只读各自合法复制状态，不从DS取私有状态。

### 5. v3草案与冻结门分开

[内核契约v3](../../docs/specs/bomber/stage0-kernel-contract.md)与[A–D矩阵](../../docs/specs/bomber/stage0-test-matrix.md)承接0025–0033的有效规则，并取代0021对应v2文档的旧字段/旧壳冻结声明：完整128位身份、六属性与独立库存、强化派生帽数、双方向空放弹输入、三槽、7分钟/115秒圈、结算下一局。保留0021的引擎架构接缝，删除帽堆与旧18变体口径，改16核心数值变体加design新增对照；技能Flag独立。

同Tick致死结束与同Tick全灭并列要求保持；typed payload/结算关联与合法同Tick接缝须审计，不能因SDK缺口降低玩法要求。未知边界列为冻结前解释项，不把原型NON-CONTRACT默认提升成已冻结协议。

只有声明/注册表/输入/事件/表schema与Reader/catalog/底图全齐、实际SDK编译、DS restore与8Bot登录通过、未决项收口并经PR合main，才能在RM-00013登记清单与hash为“接口已冻结”。此ADR生效不表示上述验收已经通过。

### 6. 四轮节奏与证据

第一轮地基与接口；第二轮按互斥文件集实施A–D；第三轮对抗审查并闭环P0/P1；第四轮在合入main后本地完整构建/测试、整局/下一局、双真实回放、8Bot稳定性通过后才触发CI。前三轮不等待CI，第一轮骨架真实构建与登录门仍必须通过。

启动器照Sample编排Platform→DS→真实C# Bot，以DS日志与Bot结果判定；缺发布物、Platform、Docker或配置报告 `BLOCKED_ENV`、exit2。零测试、空结果、合成日志不能算通过。

## 后果

- 游戏可以独立构建与发布，父仓其他Gameplay继续原路径；需要同步根README、知识导航、spec索引与0045导航。
- 原型保留在 `prototype/`，不进游戏sln/Release/CI。可复用表现层，但生产路径不得import或复制 `src/sim/`；不改变0024的原型豁免边界，也不构成新的美术定调。
- v3为破坏性游戏契约迁移：废弃ID进tombstone，生成物和回放schema一同重建，旧Raw身份/帽堆fixture不能静默读取。
- 接缝未完成的实现单按真实依赖登记；草案完整与接口冻结、规则实现、整局通过分别出证据，不能相互代替。
