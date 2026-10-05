# typed authority 性能：只读机制与最小候选

本轮停在机制调查和实验设计，没有改生产或运行新的 benchmark。正式 Runtime0247 的 default-off on/off 原件均有长 Tick，但多场景共享16logicalCPU、生命切换和实体工作量不配对。不能据低 Native bridge mean 称 managed 独占；已到 Results 的后续08:38 cut也不能混进先前 Running 统计。

只读来源是 `C:/Work/LumioGames/.101-pack07/LumioGameRuntime15AuthorityCaptureDiagnosticComposition` 的0247源，以及已封 `C:/Work/LumioGames/LumioGame/.run/browser-authority-capture-private-game15-01/game-input/Gameplay/generated/client`。有界源形状记录在 `C:/Work/LumioGames/LumioGame/.run/browser-authority-capture-perf-design-01/source-shape-02.json`，每项保留 path/hash；没有重新核包或PDB。

## 已排除与已确证

1. **Persist重复遍历假设不成立。** `tools/gen-declarations/CodeEmitter.cs:734` 的 generated CapturePersist 首句是 `if (writer is IPredictionFieldWriter) return;`；真正 Game 的 BomberPlayerState 等 client.g.cs同样如此，LogicTransform手写实现也保留此门。AuthorityFields实现该接口，所以Core调用CaptureSync后虽调用CapturePersist，后者立即返回，并不再遍历Persist字段。不能用删除CapturePersist调用宣称省掉一整轮字段clone。
2. **CaptureSync确是 typed全声明采集。** CodeEmitter.cs:764 的 prediction分支读取component.Fields并逐项WritePredictionField。AuthorityFields从`component.field`分离fieldId，以ISyncContainer或TryGetSyncField合法同步元数据准入；这不是JSON解析。普通locals过滤是协议能力边界，不能因当前Game字段都同步便全局删除。默认普通writer的Scope过滤与typed分支不同，不能误用普通CaptureSync代替typed复制而丢Owner/None同步字段。
3. **声明规模与实际调用规模分开。** 当前client generated源中40个有CaptureSync的组件，共536个typed写入site：388个scalar metadata sites、148个container写回sites。它们是静态声明，不是实际实例乘积。较大声明包括Skill66scalar、RespawnCarry48（1container）、Bomb44（11container）、WorldRuntime42（21container）、Participant34（3container）、Results31（30container）、Player27scalar、FireFacts26containers。没有把Scope.None/空默认值当成可删除字段。初版source-shape01从generated partial字段声明grep出container0，是错误统计口径，保留；02改读实际generated WriteField的ISyncContainer分支，0不代表不存在容器。
4. **实际6组给出了范围而非完整census。** B quiet samples仍是18–22个实际source entities、134–169 components、117–148个generated-capture调用、2330–2770次FieldSink、2463–2976次WriteDispatch、5209–6296次accounting。FieldSink只包WritePredictionField；手写Builtin的WriteUInt64等直接writer方法也会采集/写回，所以不能用sink与write数量差值推断过滤多少或丢字段。采样没给每组件实例数、每容器项数/clone bytes或历史CreationOrder长度，均为UNPROVEN。
5. **容器确有隔离复制。** SyncFieldCloneWriter.WriteContainer先按原预算计字段，IPredictionSnapshotContainer.CapturePredictionSnapshot按实际项逐项计账并产生List/Dictionary快照；SyncList/SyncDict.AssignFromRemote再产生replacement并保留容量/元素校验，写入prediction state。这些所有权和失败边界不能用直接共享authority容器引用绕过。仅见两次复制机制，不代表已量出占比；不要据clone存在直接池化或跳过未变容器。
6. **authority历史列表确保留dead id，但未证明主耗时。** World.Attach首次加入CreationOrder，普通Detach清除id→slot和active实体但不移除authority CreationOrder。RefreshTypedAuthorityCore扫描authority CreationOrder，每个id查Record，null跳过。predicted侧另有CompactJointPredictionBookkeeping和CompactPredictionStructures保留/重排live；注释明确authority history拥有replication cursors。六组structure桶mean0.817ms是inclusive，且entities计数只数live source；不能据它估计历史长度或称历史扫描dominant。改遍历_activeEntities还可能改变重出现id的确定性顺序，因此不得简单换集合或删除历史。

## 可以先验证的最小候选

第一候选仅属于Runtime `tools/gen-declarations/CodeEmitter.cs:861/891` 两个生成派发方法：在完全保留字段名ordinal语义、分支内容与fallback的前提下，比较现有顺序`string.Equals`链与生成`switch(fieldId)`。它可减少大声明逐字段派发的比较次数，仍只是可测假设。没有改变NativeABI、field/scope、GAS、typed snapshot内容、container clone、scratch收费或World复制时序。其它生成方法及手写Builtin先不改。

有界TDD接缝是现有`tools/gen-declarations/tests/Lumio.Tools.GenDeclarations.Tests`及`fixtures/ability-registry/PredictionFieldsComponent`。新增真实编译/执行用例覆盖首中末fieldId、unknown/null/case差异/相近前缀，scalar的uint/ulong与container、silent/setter回调、错误类型与原no-op/false/nullfallback。用原与候选生成的组件分别进入同样的正常typed-refresh输入，验证全部字段、容器脱离源后的隔离性、普通locals不泄露、未知container拒绝、失败后world状态及原预算上限。`modules/ecs/tests/Lumio.GameRuntime.Ecs.Tests/AuthorityCaptureScratchTests.cs`的原守卫应保持。不要以字符串源码包含switch的测试冒充行为或性能证明。

实验分两层，避免拿synthetic均值当正式Game瓶颈：

- **资格层**：正常CoreCLR实际Native以及正式WASM桥，旧/候选消费同一真实typed payload、同Native token和相同空/queued-input用例，default-off，结果/Native cleanup/预算拒绝逐项一致。固定组件/字段数可验证派发算法和输出不变；DOM白名单pose不够重建full typed authority，不能把browser probe当完整复放payload。
- **真实成本层**：独立正式完整包消费后，Root用真实2Human+6Bot/20Hz/voxel的Running窗，记录同阶段组件/字段/容器项/历史长度的最小计数事实，真正quiet/input各至少15s。减少旧owned场景资源的动作由Root在保留证据后协调，本代理不停止场景。对比actual outer Tick和完成draw callbacks，并把V9/stringify成本仍单列；sampled inclusive桶不能相加/净减。无收益或工作量不等就保持UNPROVEN，不发布性能完成声明。

如果派发实验不能解释主要成本，下一条独立调查才是容器snapshot/写回的实际数量与大小；要先测出再设计原子性、生命周期和额度不变的优化。当前不提出streaming写回、全局cache/pool、inputs空时skip或历史删除等未经契约验证的修法。GEN body任何真实改动都需要独立完整pins/语义审核，不能直接换hash冒充审核。

读取过程的两次`Select-Object -First`英文参数和一次猜Builtin目录失败均为只读行政错误，机械改成实际数字/目录后读取，不是产品RED。无测试/构建/服务/浏览器操作，全部性能候选仍未授权实施。
