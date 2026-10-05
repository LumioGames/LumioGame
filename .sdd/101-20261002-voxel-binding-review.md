# RVP → 当前 Runtime main 独立只读审查（2026-10-02）

**裁决：PASS（限定本次 5 个生产文件的体素预测绑定移植）。未发现阻断性实现问题。** 此结论不代表已发布或 Game 真实浏览器链路验收通过。

审查目标：`C:/Work/LumioGames/LumioGameRuntime-101-hydration-complete-world`，HEAD `a9ca44c`，计划 `.spec/archive/plans/2026-10-02-voxel-binding-port.md`。已按顺序读取目标 AGENTS、知识导航、架构/测试/工作流/代码规范；只读源码、差异与已有证据。未重建全树、未跑新的测试、未修改 Runtime 代码或原证据。

## 原 RVP 比对

原候选：`C:/Work/LumioGames/LumioGameRuntime-101-voxel-prediction-corrective`。原基线和最终清单分别来自 `LumioGameRuntime-101-effect-integrated-evidence/successor-runtime-implementation/corrective-v1/final-source-02/after-manifest.json` 与 `voxel-prediction-corrective-v1/runtime-final-manifest.json`。

独立以 SHA-256 读取验证：差异恰为 **10 文件**，两侧实际文件均与各自登记哈希一致（5 生产、3 测试、2 原 typed Effect 生成物）。未执行会改写 patch 的 extract 脚本。另核对当前 `rvp-production.patch` / `rvp-tests.patch` 与真实工作树差异。

- 当前 `VoxelGameplayBinding.cs`、`WorldManager.JointPrediction.cs` 与原 RVP 文件逐字节相同。
- `HostVoxelWorldAdapter.cs` 保留当前 main 的 Native handle 可用性判断及注释；绑定字段/固定 owner/退休拒绝/执行身份门控均移植。当前 B3 无 `EffectReducerBarrier`，因此未把原 typed Effect 分支独有调用误搬入当前 main。
- `WorldManager.cs` 只增加两处 settlement wrapper 调用及 helper；当前完整批次 hydration 修改保留，未被旧文件覆盖。
- `GasJointPrediction.cs` 只增加 owner access 与 confirmed adapter 实例一致性校验；当前 main 的其它预算、准入、遥测/清理行为保留。
- 测试改用当前 `CreateLowLevel` / `RegisterEffect` / `EffectSettlementContext.Settle`，仍执行真实 Effect 结算回调、真实 Native dig、重放、物理查询与 confirmed/predicted 分离断言；未用空函数替代验证。

## 逐项边界审查

以下路径相对目标 Runtime 根。

| 关注点 | 当前证据 | 判断 |
|---|---|---|
| 租约归属固定 confirmed | `modules/coordination/src/Lumio.GameRuntime.Coordination/Voxel/VoxelGameplayBinding.cs:21` / `:46` 均从 `ConfirmedWorld` 获取 owner；服务附着 owner，未在动态 `manager.World` 选择器上查 lease。Bind 先校验 owner、无现有 joint driver、adapter 无 driver。 | 符合；预测执行不丢绑定，不把 lease 复制为第二 owner。 |
| 预测目标与 driver 身份 | `VoxelGameplayBinding.cs:58` 与 `modules/ecs/src/Lumio.GameRuntime.Ecs/Prediction/WorldManager.JointPrediction.cs:81` 使用引用一致性，要求所选 world 即 `_predictedWorld`、driver 即已准入 `JointPrediction` 且未 retired。`GasJointPrediction.cs:42` 先检查 owner 线程和 adapter 的 confirmed world。 | 符合；同 InstanceId 的不同世界、替换 driver、legacy ECS-only clone 不能借用该体素写入口。 |
| 被缓存/退休的 adapter 不得旁路 | `HostVoxelWorldAdapter.cs:77` 阻止已绑定 adapter 改 world；`:153` 在 Stage 开始先核查 `_hadBinding`、当前 lease 与 owner，再核查当前执行世界。退休后即便手动设 World=null 或别的 manager 仍拒绝，直到正式重新绑定。 | 符合；缓存引用不绕过 Resolve；写入/挖掘收口到同一 Stage。 |
| 旧租约不能删除新租约 | `VoxelGameplayBinding.cs:79` 只有当前服务引用仍等于本 lease 时才移除；清理固定 `_owner`、退休本 adapter，并把 lease 字段清空，重复 Dispose 无效。`World.RemoveService` 已有 owner 写访问检查且允许 manager 销毁后的清理。 | 符合；租约不拥有 Native，不提前释放 host Native handle。 |
| Native Close Pending | `GasJointPrediction.cs:415` 的既有清理保留：Close status 21 继续保留 driver/adapter，后续 Dispose 重试；只有 session 成功 close 才释放 prediction、physics 与 adapter driver。新 Bind 禁止此时替换。 | 符合；现有 owner 生命周期未被新 lease 短路。 |
| 结算期选择与 finally 恢复 | `WorldManager.cs:1982` 保存 previous，选择 predicted，在 `finally` 恢复；joint 输入 `WorldManager.JointPrediction.cs:102` 和 legacy replay `WorldManager.cs:1768` 都通过 helper。输入/创建/system 的已有切换模式不变。 | 符合；结算期间 Manager.World 与 context.World 一致，正常/异常退出都恢复 previous。 |
| 与 hydration 组合 | `WorldManager.cs` 的 clone 先完整复制与建立索引，再批量 OnHydrate 的修改保留；RVP 只改变 settle 调用，不回退实体构造/索引/owner 构造顺序。 | 本次窄移植未发现冲突。 |

## 已有测试证据核对（非本审查重新执行）

全部日志位于目标 `.run/hydration-20261002/`。

| 日志 | 可读实际结果 |
|---|---|
| `rvp-native-red.log` | RealNativeMappedDigResolvesTheConfirmedVoxelLease，1 total / 1 fail / 0 skipped，错误 `no_voxel_binding`；是行为 RED 而非零测试。 |
| `rvp-focused-green.log` | 6 total / 6 pass / 0 fail / 0 skipped。 |
| `rvp-gas-class.log` | 完整 GasJointPredictionTests，509 total / 509 pass / 0 fail / 0 skipped。 |
| `rvp-simulation-green-02.log` | 3 total / 3 pass / 0 error / 0 fail / 0 skipped / 0 not run。 |
| `rvp-hydration-regression.log` | 67 total / 67 pass / 0 fail / 0 skipped。 |
| `rvp-build-green.log` | 全 solution 目标构建成功，0 warning / 0 error。 |

测试内容已与源码核对：真实 Native 开 session/read/dig/authority replay；预测 HP=9 与 confirmed HP=10 保持分离；结算 callback 明确断言 selected world；legacy clone 无绑定、缓存 adapter staging 拒绝且 Native block/revision 不变；foreign world/跨线程/替换 driver 被拒；retired adapter 与旧 lease 清理覆盖。509 类回归含 Effect handler/queued failure 与撤销路径；新增专项对结算异常恢复没有独立同名测试，本审查对此额外核对了不可绕过的 `finally` 实现。

日志本身未独立记录 shell exit code；计划和执行者报告为 exit 0，审查仅将日志中的实际测试计数/构建结果作为已读证据，不伪称重新取得退出码。

## 集成时保留的限制

1. 当前 B3 主线没有 typed Effect `EffectReducerBarrier`。后续合并 typed Effect/finite/successor 修复时，必须保留原 RVP 在 Stage 入口的 reducer barrier 语义，不能因本次针对当前 API 的窄移植而遗失；这不要求向当前不存在该类型的 main 添加占位实现。
2. 仍需按规定统一打包 Runtime/Engine/Client，再重跑原真实 Client Bot 反例和真正 Game 浏览器整局。上述 Native/单元日志及已完成的 UI 夹具均不能替代发布包链路验证。
3. 未审查本次范围外的所有 generated 漂移、其它 Effect 合并、传输预算或完整长期稳定性，不将当前仓库脏文件数量等同于本次移植范围。

本审查无 P0/P1/P2 修复项；原计划的独立审查项可以标为本范围已通过，统一发布与真实链路项仍保持未完成。
