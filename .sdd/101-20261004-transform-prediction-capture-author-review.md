---
name: 101-transform-prediction-capture-author-review
description: 原 Runtime d8 的 LogicTransform 预测捕获重复预算复现、最小协议 guard 与相关回归证据；作者交独审时查
metadata:
  type: report
  status: 待独立审查
---

# LogicTransform prediction capture 候选作者交审

此候选只修正式 Runtime d8 中已确定的重复 Transform 捕获及重复 scratch reservation。诊断09的 capture 时间桶包含全 ECS 捕获，不能把其全部毫秒归给 Transform；此候选的浏览器收益尚未测量，真实体验门仍未关闭。无新 API、无预测或体素关闭、无协议/配额变更、无额外 gameplay World。

## 精确源码边界

- 工作树：`C:/Work/LumioGames/.101-pack07/LumioGameRuntimeTransformCapture`，分支 `codex/101-transform-prediction-capture`，基准 `d8ae3da3793d5d95785606be319668a4318af85a`，不是私有诊断 commit0053。
- `modules/ecs/src/Lumio.GameRuntime.Ecs/LogicTransform.cs:444`：仅增加 `if (writer is IPredictionFieldWriter) return;` 一行。普通 `IPersistWriter` 仍捕获位置/旋转/父级/teleport；`CaptureSync` 完全不变。
- `modules/ecs/tests/Lumio.GameRuntime.Ecs.Tests/TransformComponentTests.cs:192`：增加3个场景及现有 harness 的小 helper，160行。无新模拟器或影子 World 驱动。
- 4个 private diagnostic source 均不在此工作树改动/候选内；未 stage、未 commit。

| Source | d8 SHA256 | 当前/封存 SHA256 |
|---|---|---|
| LogicTransform.cs | `60cbfb75c73819d78c4c33b9545ffec975a9f5f4e458847056772b72abff0781` | `0cd63226ee6a67a13d797a2f2f0bbd888ce575ffbe74e938fac3399ce32d21e5` |
| TransformComponentTests.cs | `8166580adc382280f07e35a7eb5b01956fb78de0a735a1ec1e0a826752c6bfe5` | `faddfd833a3727aeb2b1bc928a3068221be4fbed9ce2b5b4c9a193307a2763c2` |

封存：`.run/transform-capture/seal-01/manifest.json` SHA256 `de61cbf9f45b81db83d81bd1dbe7b64b69ef37d589d9c24057e7d753bbb2dfa4`（47,456bytes）。同目录 `sources/` 是精确2文件，`candidate.diff` 是候选差异。manifest 含日志、TRX、程序集证据和依赖身份原始文件 hash。后续新增结果须用新封存版本，不覆盖本 manifest。

## 根因与既有协议

`Component.cs:284` 已定义 `IPredictionFieldWriter`。声明生成组件的 `CapturePersist` 已统一在该 marker 下返回：例如既有生成 `ChatComponent.g.cs:60`；预测捕获独立于普通持久化，`CaptureSync` 已完整供给同步字段。

手写 LogicTransform 在 d8 缺此 guard。`WorldManager.JointPrediction.cs:206-207` typed authority refresh 连续调用 CaptureSync + CapturePersist；两个方法对位置、旋转、父级、teleport 四字符串写相同键。AuthorityFields 下层每次字段写都会先 ReserveScratch，再追加 SyncFieldCloneWriter 的列表；同键第二次写仍追加第二条，随后 CopyCapturedFields 再处理一次。重复字符串构造、字段租约、捕获条目及字段复制均发生。相同双调用还用于 CloneConfirmedForPrediction（WorldManager.cs:2019-2020附近）和 legacy authority refresh（JointPrediction.cs:158-159）。guard 让四个完整 Sync 字段只捕获一次，普通持久化保留原格式和字段。

此候选不修 WorldSave 或 AttributeComponent 的其他手写字段，也不改变全 ECS 扫描、初始 fallback 双 clone、容器 snapshot、反射、字符串表示或 typed authority 数据模型。

## 有意义的 RED 及正常行为基线

先在原 d8 LogicTransform 下加入两条正常行为断言并实际运行：`TypedAuthorityKeepsRotatedHierarchyAndUncoveredTransform` 和 `OrdinaryPersistenceKeepsRotationTeleportAndFixedScale`。原11条 Transform 测试通过（11/11、0skip），包括实际 CloneConfirmedForPrediction、旋转三级父子关系、局部/世界姿态、固定scale、teleport传播、covered prefix 移除与未确认局部写保留，以及普通 snapshot/restore。未声称普通 snapshot 的父级恢复在此被证明：普通持久化新断言为单 Transform 姿态/teleport/scale。

随后新增 `TypedAuthorityRefreshFitsOneCompleteTransformCapture:248`，在同一真实 WorldManager/PredictionStateLayers/Native-bound harness 内保留原 `WorldIngressBudget.Default.PredictionMaxBytes`（1MiB）。它从实际 CaptureSync 计算单个完整组件的 canonical 字段及既有 scratch/lease overhead，合法占用其余预算，实际 RefreshJointAuthority 应完成一次完整同步拷贝且所有短期scratch释放。连续3次验证 pose/parent/children/teleport/scale完整且 Used 回到同一基线；不是字段调用次数断言、性能阈值、下调预算或人为失败驱动。

实际 RED 为1发现/1失败/0skip，exit2。失败精确发生于 LogicTransform.CapturePersist 的重复 WriteString→AuthorityFields→SyncFieldCloneWriter.ReserveField→PredictionStateLayers.ReserveScratch→合法 Default quota reservation refusal，异常 `prediction-capture-capacity`。第一遍 CaptureSync 已完成，第二遍persist捕获重新收取容量造成错误。RED source、编译 test DLL 和原日志/原exit/TRX已保存。RED测试源码与当前GREEN逐字相同；RED LogicTransform逐字等于正式d8 blob。正常基线只封存了编译DLL及日志/TRX，没有补造当时完整source快照。

## 已执行验证

所有 managed 构建保留仓现有 TreatWarningsAsErrors/NoWarn，未添加 suppress。执行 narrow owner 项目，使用隔离 `.run/transform-capture/artifacts`，未把本地 DLL 放入任何正式包/现场宿主。`LumioArchRoot` 实际为 `C:/Work/LumioGames/LumioGameEngine-101-release-freeze0e`（HEAD `0e2fc74783f9f186d59909b38d4ee70887a21137`）。

| 证据目录（此 Runtime .run/transform-capture 下） | 原exit/结果 |
|---|---|
| baseline-01 | ECS tests build0；11PASS/0FAIL/0SKIP，tests0；正常新增2场景在原实现通过 |
| red-01 | ECS tests build0；1FAIL/0SKIP，tests2；上述真实重复capture容量栈 |
| green-01 | 同测试源码、仅生产guard；ECS build0，12PASS/0FAIL/0SKIP，tests0 |
| gas-green-01 | GAS build0（0warning/error）；首次测试筛选命令中间通配符被 runner 拒绝，tests5，NOT_RUN；错误证据保留 |
| gas-green-02 | 复用不变GAS构建、合法首尾通配符筛选；44PASS/0FAIL/0SKIP，tests0 |
| netstandard-green-01 | ECS production netstandard2.1 narrow build0（0warning/error），浏览器目标编译通过 |

GAS筛选为 `*Transform*`、`*Teleport*`、`*Reparent*` 加 exact PoseUndoKeepsExistingSiblingOrdinal、AuthorityRemovalRefusalRestoresUnobservedHierarchyAndExactCharge、AuthorityRefreshPreservesLocalPrefixAndIndependentEntityIdentity，`--minimum-expected-tests 20 --parallel none`。TRX含44条完整名字/结果；真实Native下面三类有4条 Passed而非跳过：

- `RealNativeRefusedReparentRestoresLiveHierarchyAndSiblingOrder`；
- `RealNativeTeleportDescendantsRestoreEarlierInputAfterRefusal`，local true/false；
- `RealNativeTransformBudgetRefusalUndoesStageAndResumes`。

同44条包含 LegacyJournalFixture 的 RepeatedTransformWritesRefuseBeforeMutationAndUndoForReuse、teleport容量拒绝/恢复及 hierarchy结构undo，typed authority删除拒绝/精确charge和未覆盖局部prefix。候选2文件 `git diff --check` exit0。未跑全 Runtime solution/全 Engine；没有扩大本轮必要验证。

## 真正 Native 与 package 来源

测试环境 `LUMIO_ENGINE_NATIVE_PATH` 指向官方完整09诊断包：
`C:/Work/LumioGames/LumioGame/games/101-bomber/.run/20261004-browser-experience/complete-release-09-diagnostic/server/win-x64/SDK/Native/win-x64/lumio_engine_native.dll`。

- DLL SHA256 `030046d7563efd8cfe01e127bd719470eaba06ef81c7f808b640d97efea78ba8`；同目录真实 sidecar buildId `d595e2c77e6943ecbbf43ea3994b8367`、abiHash `c5f276c855bcb71fd9b04dcd546d1dd925ac408fd6303d56e30a2c044946a2f3`、binarySha匹配。
- 官方09 manifest 的 Native源 `81b2501a621db2657bd087db2afa808ecfb9e846`、Engine `0e2fc...`、Client `a6071a2...`、Server `15418fc...`。其 Runtime为诊断0053，但本候选managed测试编译的是正式d8加一行guard，从该包消费的只有公开 Native产物/sidecar，不替换包内程序集。
- 实际真实 Native fixture 从本工作树 checked-in `modules/coordination/tests/fixtures/voxel-native/catalog-world.json` 读取，未放宽其配置；源文件hash及完整包manifest/sidecarhash均见seal manifest。

GAS既有声明生成target执行后自动产生48个 generated文件的 CRLF字节漂移：所有48个按CRLF→LF规范化逐字等于d8原blob，git diff没有文本内容差异。这些输出原字节/路径/hash已保存于seal `generated-side-effects/` 和manifest。没有reset/clean/restore它们，也不纳入候选commit；Root应显式只提交上述2文件，冻结包用独立干净worktree。原07/09冻结仓未改。

## 独审与后续边界

请求非作者核对已有marker协议、RED容量公式与正常行为、实际Native身份和源2文件封存一致性。若接受，Root只显式commit该2文件并通过官方完整包消费，然后原八人房间实际A/B时序、移动、放弹、关闭重进比较。此作者GREEN仅支持候选正确性，不是浏览器体验验收或完整交付完成。Root另有后期successor停顿证据调查；它不能以此Transform候选被宣称解决。
