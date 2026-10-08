# 101 正式版本恢复与交付计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接续现有原型迁移成果，完成最新策划、真实引擎链路、原型表现和全量验收，不以阶段产物代替正式交付。

**Architecture:** Game 只拥有玩法与表现，Runtime、Engine、Client、Server 缺陷在对应上游修复。Game 消费一致的 Engine 发布物；Gameplay 使用唯一 WorldManager.Tick、GAS、Effect、Native HFSM、体素与实体，不引入原型模拟器。

**Tech Stack:** C#/.NET 10、Lumio Engine SDK/Native、Rust、浏览器 .NET WASM、Three.js、TypeScript、Node 工具、真实 Platform/DS/Bot。

## Global Constraints

- 最新用户要求完整正式浏览器可玩与全量测试，覆盖旧计划的“只读旁观”“暂缓联网”“暂不跑完整测试”阶段限制。
- 正式玩法遵循最新已批准的策划、ADR 和契约；原型与正式设计之间已批准的差异必须明确记录。
- 正式版本必须运行真实 Platform、DS、客户端、引擎复制与权威玩法链路。
- 表现层不得引入原型模拟器、本地规则替身或第二份状态真值。
- 不得通过跳过测试、删除断言、放宽指标、关闭必需功能、伪造数据或隐藏错误来获得通过。
- 保留已有未提交修改、暂存区和私有候选成果；不重置、不清理他人数据、不混装 DLL。
- 每项修复先复现，保留失败证据，修复后做相关回归与独立审查。

## 恢复基线

- 当前分支 `feat/101-bomber-engine-foundation`，HEAD `8787797`；存在大量暂存、未暂存和未跟踪迁移成果。
- 2026-10-02 fetch 后 `origin/main=af385a9cd0f261317e97240a7e55accdda8d01d5`；这是最新原型比较基准，当前本地 prototype 目录较旧。
- 当前发布物 manifest/产品 props 为 `0.0.4-main.ecece8a`；gitlink 为 `7e798301`，不能用 gitlink 推断本地候选发布物内容。
- 历史 `.sdd/progress.md` 和 `.run/effect-current-controller-head.json` 中活跃会话属于已停止的旧执行。恢复以实际源文件、候选报告和新测试为准。
- 本次测试证据目录 `games/101-bomber/.run/acceptance-20261002/`。本次恢复主账本 `games/101-bomber/.spec/plans/2026-10-02-delivery-progress.md`。

## Task 1: 恢复当前失败与一致发布物

**Files:** `games/101-bomber/Directory.Build.*`、`eng/BomberRelease.props`、`Tools/prepare-server-host-inputs*`、`Tools/engine-release*`；上游修复仅在对应仓。

- [x] 读取父仓与工作区 AGENTS、导航、工作流、测试、架构与旧计划。
- [x] 记录实际分支、工作树、远端原型和 Engine manifest。
- [x] `dotnet build LumioBomber.slnx --nologo` 当前通过，0 warning/error。
- [ ] 跑当前 `dotnet test LumioBomber.slnx --no-build -- --minimum-expected-tests 1` 与 `node --test Tools/*.test.mjs`，记录非零总数和失败。
- [ ] 复现 `hostentry_fault_diag4.log` 的 GasWorldContext 构造函数缺失，区分旧生成输出/包缓存/发布物内部 ABI；修复实际所属入口，回归真实 DS 启动。
- [ ] 复核并组合现有上游有限 Effect、successor、预测、浏览器 HFSM 修复；通过发布工具生成一致包后回接，不复制零散 DLL。

## Task 2: 集成已完成的 Game 规则候选并补齐差异

**Files:** `Gameplay/`、`Server/Tests/Gameplay/`、`Gameplay/Tables/`、两端生成投影；候选来源见审计清单。

- [ ] 对比原工作树与 `.run` 中已独审增长、地形、Effect 等候选，逐文件三方组合，保留原有修改。
- [ ] 用真实 Tick 覆盖伤害结果关联、死亡 successor、掉落守恒、重生、移动/放弹、六形态、五角色、地形互动、缩圈、结算与下一局。
- [ ] 正式矩阵 F01–F11、A01–A36、B01–B28、C01–C21 逐行关联测试与运行证据；不得只修改配置打开未实现 profile。
- [ ] 官方重新生成并核对 schema 身份与历史 tombstone；完成 19/23/27 成套地图和预算证明。

## Task 3: 完成原型表现与交互

**Files:** `Client/Presentation/`、`Client/UI/Spectator/`、客户端投影和输入；不导入 prototype/src/sim。

- [ ] 保留并复用 af385a9 的场景、模型、材质、灯光、动画、HUD、音效和特效。
- [ ] 补齐权威投影：五角色、动态心数/金心/Boss、箱/补给/狂暴、技能/爆炸、结算与高光。
- [ ] 完成选角、键鼠/触屏、移动/放弹/技能预测接缝和同房下一局；只消费正式状态。
- [ ] 同视口、对应状态截图对照原型；桌面与移动布局和真实音频逐项检查。

## Task 4: 真实验收与交付

**Files:** `Tools/`、`integration/`、当前验收矩阵、README 与知识文档。

- [ ] 父仓与 101 规定构建、静态检查、类型检查、生成一致性及完整测试全部运行并记录总数/失败/跳过/退出码。
- [ ] Platform→DS→真实多 Bot/浏览器从准入、完整对局、结算到同房下一局；检查浏览器控制台/网络/服务日志。
- [ ] 技能开启/关闭整局，逐 Tick 确定性回放，八 Bot 连续 30 分钟，多种子与三档地图统计。
- [ ] 独立整体审查并修复全部影响交付的问题；最后对实际交付版本复验。
- [ ] 写准确启动命令、逐项清单、已批准差异依据和证据链接；满足全部条件才标记目标完成。
