# Transform prediction capture regression plan

状态：只读方案；等待完整09私有诊断包的真实客户端`capture`/`typed`占比。尚未新建修复worktree、写测试或生产代码、stage、commit或运行本方案。该方案不能代替八人浏览器体验验收。

所属Runtime正式基准是`d8ae3da3793d5d95785606be319668a4318af85a`，精确树`C:/Work/LumioGames/.101-pack07/LumioGameRuntime`。`modules/ecs/src/Lumio.GameRuntime.Ecs/LogicTransform.cs`原SHA256为`60cbfb75c73819d78c4c33b9545ffec975a9f5f4e458847056772b72abff0781`。四文件私有诊断提交`0053ea4d2b9b9743f2871156e725e13a842e0d6a`已由Root显式提交、独审仅接受为诊断；此计划不建议将诊断提交作为正式修复基准。

## 源码事实与最小候选

- `LogicTransform.cs:442`和`:450`的`CapturePersist`、`CaptureSync`均写同四个字符串：localPosition、localRotation、parent、teleportId。
- `SyncFieldCloneWriter.cs:56`只追加条目，不去重。`World.cs:1120`逐条`WriteField`，而`LogicTransform.cs:474`/`:485`会重新解析位置、旋转、传送和parent。因此typed refresh每个Transform当前捕获和应用八条；不是所有Game生成字段均重复，生成组件的Persist已有`IPredictionFieldWriter`早退。
- 最小生产候选仅为手写`LogicTransform.CapturePersist`对`IPredictionFieldWriter`遵守同一既有协议，普通持久化不变。必须先由09实测判断其实际份额，不能由重复次数估计收益。typed capture里还包含metadata、scratch、entity attach、CopyCapturedFields等；`capture`桶不是纯字符串序列化耗时。
- 此marker覆盖`CloneConfirmedForPrediction`、`RefreshJointAuthority`/`RefreshTypedAuthority`、`PredictionUndoJournal.Capture`以及`World.Detach`的legacy capture，不只影响一个joint方法。`World.PredictionRemap.IdentityFields`也实现marker，但原来有`_seen`去重且先CaptureSync。

## 确定性RED的现有入口

优先沿用`modules/ecs/tests/Lumio.GameRuntime.Ecs.Tests/TransformComponentTests.cs`的`TransformRegistry`、`WorldTickTestBinding`和真实`LogicTransform`；不新造预测driver或Native模拟器。Runtime内部`RefreshJointAuthority(predicted)`可直接接收已安装`PredictionStateLayers`的World，已有`FrameworkSelectiveLayersTests.cs:109`的authority removal、拒绝后图/精确charge测试和`:494`的authority refresh保持local prefix测试使用同入口。

建议新增一个actual typed refresh预算测试，RED断言是**完整权威投影在足够容纳一份同步字段的剩余预算内应成功**，不是`Fields.Count == 4`或CI毫秒阈值：

1. 建立父、子、孙以及独立分支，固定父/子非单位旋转和local pose；用真实controller执行KeepLocal/KeepWorld、teleport。由`CloneConfirmedForPrediction`获得候选，再安装真实`PredictionStateLayers`的reserve/release tracker。禁止手写替代投影。
2. 固定使用`WorldIngressBudget.Default.PredictionMaxBytes`（1,048,576），不调整Game/SDK默认额度。通过真实`ReserveScratch`的一笔在用lease占据已有预算，留下可容纳一份完整Transform同步capture及该刷新必需的structure/component scratch的余量。该lease是单元测试的受控在用资源，不是放宽或降低真实八人宿主的额度。
3. allowance以既有保守计费协议和真实serialized值计算，并有baseline证据：structure scratch是`ReserveScratch(256 + PredictionAuthorityIds.Count*64)`，component scratch是`ReserveScratch(256)`；每个field的一份capture包括`96 + attributeId.Length*2`和`PredictionSnapshotSize.Scalar(value)`，经AuthorityFields的`+64`再经`ReserveScratch`自身`+64`计费。四个不同field的最大完整component allowance，按实际值长度求值；不把重复两份算进合法余量。
4. 明确记录拒绝来自第2份相同field capture而非state注册、结构重映射或别的component，并在finally释放所有lease，检查scratch回到原retained基线。无layer时先完成这一最窄RED；未覆盖input survivor另用正常预算的语义回归，避免把其合法base/layer/observation charge偷算成重复capture。
5. 权威改变父pose、子parent/teleport后调用**生产**`RefreshJointAuthority`，断言WorldPose/LocalPose、父/子/孙连接、稳定sibling顺序、不同分支及Vector3.One scale；循环至少三次并确认没有retained增长。RED必须原d8失败于重复capture预算；同一测试在最小guard后成功。未测的断言先在基准正常余量下确认，不能借新期望制造RED。

如exact allowance因合法结构计费复杂而不能隔离，不应加入随意魔数或增额度让测试通过：改用真实`SyncFieldCloneWriter`有reserve回调的一次完整capture + `World.CopyCapturedFields`/`ResolvePendingTransformParents`的较窄预算操作，仍断言真实姿态、parent和teleport结果，并明确该RED覆盖capture协议，actual typed refresh由后续语义测试覆盖。不得仅检查字段数量。

## 正常预算语义与现有真实Native回归

一个不触碰额度的测试覆盖clone与刷新：父/子/孙非单位四元数、三种ParentPoseMode、teleport后代传播、fixed scale、authority覆盖已有input、较新input surviving投影、已覆盖history回收。通过`PredictionStateLayers.CoverPrefix`及正常Gas authority窗口驱动，不跳过校验或闭合publication。新增断言只在原d8正常预算下先有PASS证据，再放入修复回归。

普通持久化用实际`CaptureSnapshot`/`RestoreLowLevel`，保留现有`LogicPersistsWhileModelPresentationStateIsExcluded`的position/model分离断言，并加旋转、teleport、Vector3.One及普通snapshot字段字节保持。`WorldSnapshotCodec.SnapshotWriter`不实现marker，因此普通Persist应仍完整。

不能把“普通snapshot父子图完全恢复”直接作为此次新增GREEN前提：原d8 `LogicTransform.RestorePersist`只读position/rotation/teleport，没有parent读取，此处是只读源事实，未实际跑新的层级snapshot基准。parent图语义放在clone/typed/纠正用例；若独立基准发现别的缺口另报告，不顺手扩修。

最小有针对性的现有回归集合（不重复无变化全解测试）：

- `TransformComponentTests`：授权写入、旋转、parent、teleport、fixed逻辑scale、普通snapshot/model分离。
- `GasJointTransformUndoTests`：failed correction/retirement、legacy structural undo、旋转local/world pose、稳定child order。
- `GasJointParentUndoTests.RealNativeRefusedReparentRestoresLiveHierarchyAndSiblingOrder`。
- `GasJointTeleportUndoTests.RealNativeTeleportDescendantsRestoreEarlierInputAfterRefusal(false/true)`。
- `GasJointTransformBudgetTests.RealNativeTransformBudgetRefusalUndoesStageAndResumes`及legacy拒绝/回收。
- `FrameworkSelectiveLayersTests.AuthorityRemovalRefusalRestoresUnobservedHierarchyAndExactCharge`与`AuthorityRefreshPreservesLocalPrefixAndIndependentEntityIdentity`。

真实Native用已有`WithNativeAcceptance`及完整08实际Native身份`81b2501a621db2657bd087db2afa808ecfb9e846`，必须设置可用`LUMIO_ENGINE_NATIVE_PATH`并记录fixture、SDK入口和Native路径；不能把Skip当PASS。当前fixture的Native8x8是现有引擎单元场景，不替代用户要求的真实八人Game预览，也不更改该预览的人数、体素或模拟频率。

## 实施与验收边界

待Root读09实际数据并授权后，新建clean owning Runtime修复树于正式d8基准。先写失败测试、冻结原RED，再最小guard；必要语义测试先保存baseline PASS。不得从私有09拷贝计时helper入正式修复。候选仍需非作者审查，显式文件commit后经官方完整包消费。回归实际同房八人双端移动/放弹、至少十次关闭新开以及原始Tick/输入ACK数据，才能判断体验收益；字段或预算测试GREEN不能宣称浏览器卡顿根因已收口。
