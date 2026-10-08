# IceBridge first-wave 独立审查

2026-10-03，registry_bounds_review，非测试/计划作者。本轮仅读取测试、前后像、计划、实际日志、现有 Gameplay 与公共 Runtime/Voxel 合同；仅写本报告。未执行 build/test/GEN/Native、未修改源码/配置/声明/生成物/index。

结论：**Spec/quality PASS，作为受限的真实 Native TDD 第一波入口；生产实现与完整验收 HOLD。** 未发现阻断这11例或当前实施计划的 fixture/合同问题。实际 RED 只证明 Freeze 首次建桥生产者缺失，不证明后续退款、延期、替代、恢复或完整 M2 已执行。

## 精确身份和实际执行

- 测试 `games/101-bomber/Server/Tests/Gameplay/BomberIceBridgeProductionTests.cs`：SHA256 `92eba733105e66e3c2b2a6f1bb1b075f4d45dd12e59e5165cc9a8e43c7263a08`。独立计数7 Facts、2 Theories、4 InlineData，合计11例。
- 当前计划 `docs/plans/2026-10-03-bomber-ice-bridge-first-wave.md`：SHA256 `6e1ead40888d6a8fa379592d77d5ae5344815624abc461b3f8ada40092e349b1`。使用此计划，不将旧 `.sdd/101-20261003-regeneration-bridge-v14-plan.md` 的先空气再水序列作为现行方案。
- 前像 `.run/ice-bridge-first-wave-test-source-01/before.cs`：`725f7faa51c975d196379e032fc829333d827a0484d24dc9be03a017da8bc037`；after.cs物理字节SHA等于当前测试。独立逐diff核验三类修正：精确 AdapterBinding 返回类型、detach前捕获full ID/来源、等待真实 Fire 自然退役。
- 实际证据 `games/101-bomber/.run/v14-fullpack07-native-20261003/ice-bridge-red-01.{log,json,exit}`。log实读SHA `94e1fed48da74256a374c4b47bc8a3eb47776360155e0eccf13f4b9863126476`；原始摘要 **11 total / 8 failed / 3 succeeded / 0 skipped**，`.exit` 实值 **2**，JSON exitCode亦2。时间 `2026-10-03T06:51:04.4399692Z` 至 `06:51:17.6322408Z`。这是实际业务 RED，先前 CA1859 编译失败不作业务 RED。
- 实际 argv：`dotnet C:/Work/LumioGames/LumioGame/games/101-bomber/.run/v14-fullpack07-native-20261003/artifacts/bin/Lumio.Bomber.Gameplay.Tests/release/Lumio.Bomber.Gameplay.Tests.dll --filter-class *BomberIceBridgeProductionTests --minimum-expected-tests 11`。
- JSON sourceSha256AtStart/sourceSha256AtEnd各369路径；sourceChanges为空；本新类两端均为上述92eba完整SHA。complete07 officialManifestSha256=`652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`，Config sourceCommit=`a991a517f9dbae255321c25d65fea0bfdfdca42f`。

记录的 RED 执行身份如下；这是该次结果记录中的历史身份：

| 输入 | SHA256 |
|---|---|
| Gameplay.Tests DLL | `ef9942a7edd6b35fe6a78905840bb2e1187c7e1e3b9967cb923e1109fcceb4d6` |
| Gameplay DLL | `1aecabdd234725ab826c1b23aca093d2a70f8a2a3f369a50153abf626cd01068` |
| Runtime.Ecs DLL | `aa5520f37e22eb6337d4e9e5c33008684bb7fd51e598dad38ef404351dddbd49` |
| Runtime.Gas DLL | `09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc` |
| Native DLL | `c01599b8c31ea72185f2a206dbcc5c4ff8fb432c68bb61ea3dabab5e6d4ddb12` |
| Native build-info.json | `f9752593b0d802b76996a5bcaa8fdda4a75d2f9449fd160d268e793029f3570d` |

独立当前磁盘复核：Ecs/Gas/Native/build-info仍等于该记录；共享 artifacts 下Tests/Gameplay已分别变为 `8961a57a0a036457e678e11b84344a933212ffaa2804726557e0e1d4c00a7d53` / `3300423dbde83c84546a47b94f782bac0fef5421f26181250ac7758135637d0d`。Root串行后续构建复用了该输出路径，因此不能宣称当前两个DLL仍是历史RED原件；本报告不以新DLL重新解释旧结果。

## 实际到达范围

8例均在 `AwaitNativeBridge` 第304行失败：Expected `263936`（1031<<8），Actual `262912`（1027<<8）。首次 Freeze 后真实 Native 仍是 water，未停在配置加载/作者编译/Scene初始化异常。

| 组 | 数量 | 实际结论 |
|---|---:|---|
| 首次Freeze、来源/绑定/固定时钟 | 1 | 首次ice断言RED，后续持久debt/Original/时钟未执行 |
| 再次Freeze不续期 | 1 | 首桥前置RED，重复请求段未执行 |
| Standard/Freeze危险窗不融桥 | 2 | 首桥前置RED，已存在桥负控未执行 |
| Fire原子融化/退役 | 1 | 首桥前置RED，水+清绑定及Original后退役未执行 |
| expiry全部Fuse/withheld Original/返还 | 1 | 首桥前置RED，occupants及延期退款段未执行 |
| old-life Remote/真实successor | 1 | 首桥前置RED，该例死亡/落地/退款段未执行 |
| 旧Original不能改替代代数 | 1 | 首桥前置RED，Fire退休与新代数段未执行 |
| 同Tick Fire/Freeze两种顺序 | 2 | PASS：真实sources/Tick后water/no bridge/no debt；当前没有建桥生产者也会通过，不能单独证明优先仲裁实现 |
| Standard覆盖water | 1 | PASS：真实Native保持water/no bridge/no debt，作为无错误结冰负控 |

## 测试真实性与fixture边界

Scene为真实Native、controlled真实世界，配置是LegacyPillars19/8，ice.enabled仍false。仅沿既有Remote测试入口使用真实authoring CLI私有启用Remote；没有解除M2准入/六形态/ice enabled生产守卫。Blast创建真实EntityOrder，kind/位置为发布前几何与形态fixture输入，普通Tick由现有Native HFSM爆炸；未直接调用待实现bridge helper，也未手写桥/水结果/阶段。这不验收公开特殊弹选择与放置资格。

标准/Remote/Frenzy occupants用实际CanPlace/Ability.Activate发布，再将真实炸弹transform移到同cell，明确是几何fixture，不能声称实际kick、移动或叠放已通过。过期段把放置安排在原截止前16 ticks，随后要求真实FuseEndTick>now；旧Remote早于其8秒兜底的桥截止，真实3次伤害→死亡→transfer/restore/landing仍是业务前提，不手填revision/生命阶段。后续首次可达运行必须观察这些断言，不将静态窗口推断当执行证明。

生命周期修正合理：旧完整实体/SourceLife/gen/Participant在detach前保存，退役后要求IsLive=false、真实唯一bomb_extinguished事件及完整来源、ordinary库存0→1、Frenzy库存不变/真实promise0，重复Original保持计数和库存。删去detach后读取Phase/CapacityReturned，换成有效的事件与资金观察，没有伪造成功、放宽原业务要求。替代测试另等待真实Fire在配置Danger+Burn有界窗口内自然退休；不人为清phase或deadline，避免合法旧留火压制新Freeze导致fixture假失败。

Original()来自实际CaptureResultCheckpoint，要求准确pending transaction、Status0/Applied/Original/TokenConsumed、非空原回执和准确section revision推进。Withhold使用真实同Native owner的fresh adapter且复制现有BindingPolicy，不Restore结果；Deliver恢复实际checkpoint，重新绑定正常Tick。using/Dispose准确恢复绑定与Voxel tick委托。重送的是原事实，不是伪造Duplicate/receipt；它只应因已结算exact pending不存在而不能再次付费。

## 合同与最小生产方案：五个必需领域

策划依据design §§5.1–5.3/7.3及ADR0048：成功结冰Tick起8秒；重复不续期；火焰弹及留火/expiry融化优先；已接受的水变化才能熄灭全部Fuse，并只返原生命库存/原狂暴信用一次。公共机器合同 `LumioGameEngine/engine/wire/voxel-runtime-results-v1.json` 的 staging.bindingMutations / native.bridge / durableDelivery 明确现有TryStageMutation支持同批block+binding，调用者显式expected section revision；Original才授权effects；Unknown不得猜成功/重发。该文件SHA=`bf0688a726979b0a4156f3cbfe7abb50c7df19c609dc14a1a35723273515b5c4`；voxel-world-v1.json SHA=`e2a40d523df62e92a3fb98149688529c4572c3e956ffa52d182de21b75c817d8`。

Runtime实际HostVoxelWorldAdapter.CommitTransactionCore只有batch.Digs生成destroyIds/AppliedDigs；explicit water-write+null-binding不是DigThrough，故不能期待它自动销毁ECS。现行TerrainTransactions.Clear/dig验证还要求实体已退役，不能把bridge water操作误归普通chest Clear/DestroySoft。以下是必需领域，**不是未经Root批准的五文件写许可**：

1. **持久桥所有者与有界恢复。** 新BomberIceBridges helper +既有WorldRuntime私有验证/尾部intent：完整bridge/gen/match/token/源tuple/地址/section预期、各提交时钟及creation/freeze/water/retirement阶段。保持单调共享NextResourceGeneration；新生、encode、UTF8≤65536、rows≤60、token≤128以及结构信用先预检后发行。Unknown仍持有信用，不timeout删除或盲重生；accepted桥允许原SourceBomb/Life自然退役而仍保留原始归属。既有声明已够，不私写generated。
2. **真实可达contact与同Tick优先。** ProcessBombs/实际Trace或Resume contact集：Freeze只对实际覆盖water请求；Fire真实爆炸与未过期Burn覆盖请求melt；所有sources与expiry收齐后再仲裁，先排除Freeze loser再create/stage，不能先提交后再假取消。普通Danger不作为Fire。保留实际obstacle/water occlusion与迟到continuation归属，临时集合不充当恢复truth。
3. **Native policy、单写者与Original结算。** 1031→真实registry BomberIceBridgeEntity绑定policy须合并保留chest/barrel，不覆盖已有pending policy；私有配置row sparse_binding由Root通过正式authoring/export更新，ice.enabled仍false。TerrainTransactions仍唯一DrainResults；新增明确freeze/water intent及整批validate→settle/reject分支。freeze用实际water+emptybinding→ice+exactpublishedbridge；water用同批water+nullbinding，expectedrevision相同。成功时钟在此同步Host/帧末commit路径取持久submitted Tick，接受晚到Original不会重起8秒。Rejected/Unknown不产生退款/桥成功或遗漏债务。
4. **水成功后的全Fuse生命周期与精确退休。** matching Original且当前Native water/no-binding/完整旧generation一致后，先验证全批及所有occupants，再调用现有Native BombLifecycle.Extinguish，以ReturnBombCapacity的原Life/gen守卫结算一次。Frenzy解除真实并发，不增加普通库存。Danger/Burn不Extinguish。随后Commands.Destroy exact旧桥并持有retirement债至IsLive=false；旧Original不能作用于replacement。现有Split ExtinguishWater仅child，Kick仅实际滑入，不能替代该stationary/Remote全量结算。
5. **全生命周期整合与不提前开放。** RoundTransition现在只接受obstacle层chest/barrel，ground ice会被判foreign binding，必须通过owner协议water+clear+retire，再允许next-map；不能清string漏Native。hydration/paired恢复按完整源、match、Native binding、pending、accepted-water retirement cut校验；物件信用含live+unpublished+pending/Unknown+retiring。共享Terrain/WorldRuntime/Round源码先与当前Regen作者合并所有权；完整地图/budget尚未证，不扩正式M2守卫/公开Reserved slots。

## 关闭条件与限制

先按当前冻结11例同source fresh RED→GREEN，逐确认8个原blocked后段全部实际到达；不以原3个负控证明新增优先实现。必要后续TDD：真实保留Burn覆盖、Danger/Burn occupant保持、迟到freeze Original跨原deadline、known拒绝/stale revision/Unknown create、bad codec/fullsource/UTF8与60记录、pending/accepted-water paired恢复、round cleanup及多cell整批不部分付款；真实public特殊弹、movement/kick、三图预算/next-round/长稳仍独立未完。

本报告不宣称已有bridge生产、11 GREEN、全Native/Game通过或M2开放。当前计划具可执行边界，可由Root依共享写域协调授权最小生产，不能跳过先行实际RED或用完整包成功替代玩法证据。
