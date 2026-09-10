# LumioGame — 中心文档

本仓的项目介绍与本仓专有的路由约定。**通用调度与编码规程在 Workflow 插件的常驻规则里,本文件不复述**(ADR-089 第二步:插件注入通用调度规则与硬红线,并自带 brainstorming / receiving-code-review / spec-steward / systematic-debugging / test-driven-development 五个技能与 `reviewer` 子 Agent)。

> 知识导航(`knowledge/README.md`)经 `CLAUDE.md` 的 `@import` 每次 init 强制载入,本文件不复述。

## 项目是什么

`LumioGame` 是 Lumio 游戏产品、Gameplay Content、发布组合和产品语义的唯一事实源，主要承载 C#/.NET Gameplay、配置、内容、Scenario、Migration 与客户端玩法内容(后续客户端暂定浏览器,首发不接 Unity 等游戏引擎,见 ADR 0013)。

- 公共语义的唯一事实源是架构仓 `LumioGameEngine` 的 `engine/abi/native-abi.json`、`engine/wire/*.json` 与 `.spec/knowledge/features/`；本仓只消费、不复制、不保存镜像。
- 本仓拥有玩法与产品发布语义，不拥有 Native/Voxel 内部、网络连接、Host 进程或 Runtime 生命周期。
- 开工前先读 [`repository-architecture.md`](knowledge/standards/repository-architecture.md)；详细模块边界见根 [`README.md`](../README.md)。

## 本仓验证入口

`node .spec/tools/lint-extensions.mjs && node --test .spec/tools/lint-extensions.test.mjs && node --test clone-all.test.mjs && dotnet build LumioGame.sln && dotnet test LumioGame.sln`；`dotnet` 两条需要同级 `LumioGameRuntime` 检出(或 `LUMIO_RUNTIME_ROOT` 指向)。Runtime net10.0 的 Ecs/Simulation 编译期绑定 `Lumio.Engine.NativeLoader`，因此 **build 与 test 都要**同级 `LumioGameEngine`（目录名必须是 `LumioGameEngine`，或传 `-p:LumioArchRoot` / 环境变量 `LumioArchRoot`）。`dotnet test` 另用 `LUMIO_ENGINE_ROOT` 读架构仓 `engine/wire/*.json`，缺检出即失败,不跳过。公共语义要改先去架构仓 `LumioGameEngine`，不在本仓自行改写。命令与排障细节见 [`testing.md`](knowledge/standards/testing.md)。

## 本仓专有路由(美术 / 策划)

通用技能归插件;下面两族是本仓自有、插件没有的,涉及时一律按此路由。

- **美术向工作:** 涉及游戏美术(整体风格 / 2D UI / 原画 / 特效 / TA / 3D 场景)的讨论定调、规范沉淀、AI 出图 prompt 与资产评审,一律路由 [`skills/art-director`](skills/art-director/SKILL.md) 技能族(hub 内再分发 art-bible / art-prompt / art-review);美术规范落 `docs/specs/`(见 ADR-0002),方向级决策照常记 `decisions/`。
- **策划向工作:** 涉及游戏策划(玩法 / 系统 / 数值 / 关卡 / 商业化 / UGC)的方向讨论定调、策划案沉淀、需求翻译与方案评审,一律路由 [`skills/design-director`](skills/design-director/SKILL.md) 技能族(hub 内再分发 design-doc / design-request / design-review);策划案落 `docs/specs/`,策划需求落 Workflow 平台,方向级决策照常记 `decisions/`。

## 框架自身的决策与校验

- 决策**一律**记 [`decisions/`](decisions/README.md)(ADR,不改写、只新增取代)——功能内与框架级共用,唯一落点;feature 文档只描述设计现状,不留决策记录。
- 结构一致性由 `node .spec/tools/lint-extensions.mjs` 校验,改完 `.spec/` 必跑;校验项清单以脚本头部注释为单一权威。
