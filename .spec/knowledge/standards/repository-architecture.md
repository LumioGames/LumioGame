---
name: repository-architecture
description: 仓库边界与架构契约——Gameplay 所有权、跨仓依赖和公共语义消费纪律;改职责、公共契约或发布组合前查
metadata:
  type: doc
  status: 已交付
---

# 仓库边界与架构契约

## 规范来源与优先级

- Agent 的开发流程、测试政策和交付规则以 `.spec/` 为权威。
- 产品与模块边界以根 [`README.md`](../../../README.md) 为本仓入口。
- **公共语义的唯一事实源是架构仓 `LumioGameEngine`**，按 Living Architecture 组织，不再有 Baseline、版本化架构正文或生成源仓：
  - ABI：`engine/abi/native-abi.json`
  - 线上语义：`engine/wire/*.json`，每条公共契约各一份（`voxel-world-v1` / `gameplay-command-envelope-v1` / `entity-binding-and-query-v1` / `account-port-v1` / `platform-port-v1` / `hello-wire-v1` / `native-timer-abi-v1`）
  - 设计概要：`.spec/knowledge/features/` 下的 `architecture` / `bomber-slice` / `tick` / `ecs` / `gas` / `movement` / `voxel`
- **本仓不保存架构镜像**，也不复述公共契约字段。要查字段、错误码、消息 ID 或依赖方向，一律回架构仓读上述来源。
- 发生冲突时不得在本仓自行改写公共语义；先在架构仓完成 ADR 与契约变更，再更新本仓的消费口径。

## 所有权边界

- 本仓拥有具体 Ability/Effect/Attribute/Tag、Component、权限、经济、任务、配置、内容、Scenario、Save Migration 和 `GameManifest`。
- 本仓按同一 `ProductId + GameReleaseId` 产出独立的 Server Gameplay 与 Client Gameplay；每个 Session 只绑定一个精确 Release。
- 本仓不拥有 Native ABI、Voxel Section/Revision、Runtime 生命周期、网络连接、Host 进程或 Release Pool；业务代码不得依赖 NativeCore/VoxelEngine 实现源码。
- 网络输入必须经公共契约与权限校验，不能建立本地旁路。

## 与引擎的三条接缝

炸弹人 Stage 0 起，本仓按架构仓 `bomber-slice.md` §4 的第二样板消费引擎，三条接缝各只有一种正确形状：

- **地形**：经引擎体素的批量读写——帧初一次批量读整图、帧末一批写、常驻区域 pin（`voxel.md` M6–M8）。本仓不实现地形存储、不保存第二份地形真值、不逐格单读。
- **玩法系统**：经 Tick 相位注册（`tick.md` §4），跑在 `WorldManager.Tick()` 这一条路径上。本仓不建第二条 Tick 循环、不在 `Tick()` 前后手调规则函数。
- **移动与放弹**：是实体上的 GAS Ability（`gas.md`、`movement.md`）。位置的唯一真值是 `LogicTransform`，属性走 `AttributeComponent` 的基础账与当前账两本账。本仓不另建位置字段、不另建单账属性、不用 DTO 命令替代 Ability。

## 变更纪律

- 新玩法先定义 Scenario、失败路径和 Replay 断言，再接入表现。
- 公共 Contract/ID/错误码/依赖方向只在架构仓修改；本仓只跟随更新消费口径。
- 生成物（Component 声明、Registry、Sync 表等）只读，只能经生成源与生成命令重建，与生成源一起提交。
- 任何保存或迁移变更必须包含旧版本 Fixture、校验、失败保留和可回放证据；不得把产品规则下沉到 Runtime、Server、Client、Voxel 或 NativeCore。

## 发布组合

- 一次 Release 同时锁定 Runtime、Server Host、Client Host、Server/Client Gameplay、Config/Content、Migration、签名和 SBOM。
- 已发布产品不可原地改写；破坏性 Schema 变化必须产生新的 `GameReleaseId`。
- Gameplay 只根据 Role、Command、Event、Port 与 Capability 分支，不读取 Offline/Local 等模式布尔值。

## 跨仓检出

本仓的 C# 工程编译期引用同级 `LumioGameRuntime`：优先取环境变量 `LUMIO_RUNTIME_ROOT`，未设时回落到同级或上两级的 `LumioGameRuntime` 目录。不得在工程文件里硬编码机器绝对路径。

**编译期另需同级 `LumioGameEngine` 检出**：Runtime net10.0 的 Ecs / Simulation 编译绑定 `Lumio.Engine.NativeLoader`，只探测 Runtime 同级目录名 `LumioGameEngine`，或接受 MSBuild 属性 / 环境变量 `LumioArchRoot`。CI 把架构仓 checkout 到 `LumioGameEngine`（不要用短名 `engine`），并同时设 `LumioArchRoot`。缺检出则 net10.0 报 `LUMIO_ARCH_REPO_MISSING`，没有 C# 替代实现。

**测试期继续用 `LUMIO_ENGINE_ROOT`**：wire 契约一致性用例直接打开架构仓的 `engine/wire/*.json` 逐条比对，优先取环境变量 `LUMIO_ENGINE_ROOT`，未设时从测试输出目录逐级向上找同级 `LumioGameEngine`（worktree 下也成立）。**缺检出即失败，不 skip**——契约真值读不到时静默跳过等于把漂移放行（见 ADR [0023](../../decisions/0023-wire-contract-pinned-in-tests.md)）。本仓仍不保存 wire JSON 的任何副本。

**这一段是内部贡献者口径，不进根 `README.md`。** 根 README 是组织的公开导航入口，私有仓的检出路径与环境变量名不在那里出现（R-00526 / ADR-074 §5）；外部开发者经 NuGet 包消费引擎，不需要任何私有仓检出。构建与测试命令见 [`../../AGENTS.md`](../../AGENTS.md)「收口门槛」。
