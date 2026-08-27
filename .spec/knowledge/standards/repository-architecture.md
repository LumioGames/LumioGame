---
name: repository-architecture
description: 仓库边界与架构契约——Gameplay 所有权、跨仓依赖和 Architecture Gate;改职责、公共契约或发布组合前查
metadata:
  type: doc
  status: 已交付
---

# 仓库边界与架构契约

## 规范来源与优先级

- Agent 的开发流程、测试政策和交付规则以 `.spec/` 为权威。
- 产品与模块边界以根 [`README.md`](../../../README.md) 为本仓入口；共享架构以 `LumioGameEngineArchitecture` 的 `LGE-V1.0-2026-08-27` 为唯一来源，本仓 [`架构镜像`](../../../docs/architecture/LumioGameEngine_Architecture_v1.0.md) 只读。
- 发生冲突时不得在本仓自行改写公共语义；先在架构源完成 ADR、Schema、Fixture 和新 Baseline，再同步镜像与本规范。

## 所有权边界

- 本仓拥有具体 Ability/Effect/Attribute/Tag、Component、Replication Mapping、权限、经济、任务、配置、内容、Scenario、Save Migration 和 `GameManifest`。
- 本仓按同一 `ProductId + GameReleaseId` 产出独立的 Server Gameplay 与 Client Gameplay；每个 Session 只绑定一个精确 Release。
- 本仓不拥有 Native ABI、Voxel Chunk/Revision、Runtime 生命周期、网络连接、Host 进程或 Release Pool；业务代码不得依赖 NativeCore/VoxelEngine 实现源码。
- 跨 World 操作只能经 Runtime Coordinator；网络输入必须经生成契约与权限校验，不能建立本地旁路。

## Architecture Gate

- 新玩法先定义 Scenario、Schema、Mapping、失败路径和 Replay 断言，再接入表现。
- 公共 Contract/ID/错误码/依赖方向只在架构源修改；变更必须带正向与失败 Fixture、兼容/迁移说明和 Baseline 更新。
- Component/RPC/Mapping/Serializer/Manifest 生成物只读，可从锁定源重建并记录 Compiler/Input/Output Hash。
- 任何保存或迁移变更必须包含旧版本 Fixture、校验、失败保留和可回放证据；不得把产品规则下沉到 Runtime、Server、Client、Voxel 或 NativeCore。

## 发布组合

- 一次 Release 同时锁定 CoreEngine、Runtime、Server Host、Client Host、Server/Client Gameplay、Generated Contract、Config/Content、Migration、签名和 SBOM。
- 已发布产品不可原地改写；破坏性 Schema 变化必须产生新的 `GameReleaseId`。
- Gameplay 只根据 Role、Command、Event、Port 与 Capability 分支，不读取 Offline/Local 等模式布尔值。
