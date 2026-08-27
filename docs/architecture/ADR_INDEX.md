# LumioGameEngine V1 ADR Index (Mirror)

> 这是产品仓库的只读镜像。规范索引和 ADR 正文以 `LumioGameEngineArchitecture` 唯一架构源为准；改变公共语义必须在那里走 ADR、Schema、Fixture 和 Baseline 流程。`Draft` 表示方向已写明、正在 Architecture Gate 验证，`ADR-015` 保持 `Reserved`（P2 Mod）。

| 编号 | 主题 | 状态 |
| --- | --- | --- |
| ADR-001 | Session Ownership、World Lifecycle、Clock Split | Draft |
| ADR-002 | Tick Phase、Processor Scheduling、Determinism | Draft |
| ADR-003 | CrossWorldTxnV1、Revision 和 SnapshotCut | Draft |
| ADR-004 | Entity Identity、Tombstone、Ownership Revision | Draft |
| ADR-005 | Replication Baseline、Prediction、Resync | Draft |
| ADR-006 | NativeManagedAbiV1、Loader 和 Fault Domain | Draft |
| ADR-007 | Contract Toolchain、ID Namespace、Dependency DAG | Draft |
| ADR-008 | GAS Core State Model | Draft |
| ADR-009 | Local Transport Fidelity 和 Fault Injection | Draft |
| ADR-010 | Persistence、Serialization、Config Snapshot | Draft |
| ADR-011 | Logging、Metrics、Trace、Audit 和 Failure Bundle | Draft |
| ADR-012 | Release Catalog、Rolling Update、Forced Maintenance | Draft |
| ADR-013 | Migration DAG、Staging、Atomic Activation | Draft |
| ADR-014 | Unity/HybridCLR Platform Capability | Draft |
| ADR-015 | P2 Mod SDK Extension Boundary | Reserved |
| ADR-016 | Benchmark Workload、TickBudget、Hardware Profile | Draft |

每个 ADR 必须包含背景、决策、替代方案、接口/Schema、失败语义、兼容影响、迁移方案和验证 Fixture。完整正文、Schema、Fixture 和待确认选择位于 `LumioGameEngineArchitecture`；本文件不承载第二份正文。
