# 木桶生产实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 初始化产生真实稀疏绑定木桶，Original Applied 后立即提交继承来源与形态的火力3炸弹，固定在实际应用Tick+2（100ms）爆炸。

**Architecture:** Native 拥有格与绑定位置；初始化格只保留作者输入。WorldRuntime.BarrelBombPromises 保存最多8条债务，绑定销毁与结构发布均以确切身份结算。统一炸弹准入统计全部未兑现债务。

**Tech Stack:** C#/.NET10，complete-release-06 SDK、真实 Native、官方 ECS 声明与配表生成，xUnit/MTP。

## Global Constraints

- SDK manifest SHA256 8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4；仅完整发布消费。
- 三档初始桶4/8/8，上限4/8/8，65%总占格与镜像输入不变。
- 木桶1032/row109012，保留firecracker1030历史；声明只做一次v13官方生成。
- Promise Sync<string>默认空，最多8条、UTF8<=16384；炸弹token UTF8<=128。
- 保留Staged/Unknown债务；Rejected不保留；Split形态4预留5credits，其余1。
- ROOT协调重build窗口；本任务不移除M2准入guard、不宣称整局验收。

### Task 1: 真实初始化与Native绑定

**Files:** BomberBarrelState{,.Server}.cs、BomberBarrelEntity.cs、BomberInitialResources.Server.cs、BomberTerrainBudget.cs；Tools/official-catalog.mjs与Gameplay/Tables源；BomberBarrelProductionTests.cs。

**Interfaces:** 新桶仅ResourceGeneration、InitialResourceMatch、InitialResourceCell；原BomberPendingVoxelCell.Chest列泛指唯一绑定实体，Initialize仍无产物。

- [x] 写失败测试：`Assert.Equal(4, world.Each<BomberBarrelState>().Count())`，逐格验证1032、BindingGet与唯一generation。
- [x] 官方v13声明生成；`run.ps1 -Label barrel-red-build-02 -Mode build`成功。
- [x] Native RED：`run.ps1 -Label barrel-native-red-02 -Filter '*BomberBarrelProductionTests'`中初始桶Expected4 Actual0；保留原日志。
- [x] 官方mint/source patch/export，新建桶实体并在全部layout.Cells批次绑定桶；1032/109012，正式enabled保持false。
- [x] 重跑同一Native断言并保留地形/初始化/回合回归；final matrix97/97。

### Task 2: 耐久债务与100ms产弹

**Files:** BomberBarrelBombPromises.Server.cs、BomberTerrainTransactions.Server.cs、BomberWorldRuntime.Server.cs；同一新测试文件。

**Interfaces:** 消费`BomberBombAdmissions.CanReserve(World,int)`、`CreateFromPromise(World,string)`；提供`ReservedCount(World)`与`ObservePublished(World,BomberBombState)`。

- [x] RED：真实Native桶在6,1,5，5,1,5来源爆炸；绑定消失、债务1、产弹Power3与旧来源完全相等，实际applyTick+2爆炸。原7项RED1pass6fail保留。
- [x] TryDestroy先验证完整Native绑定/generation与credit，再预编码债务；End预存债务后stage，Rejected撤销、Unknown保留。
- [x] Original Applied校验整条来源/绑定已销毁，因选定HostAdapter同Tick同步Commit契约记原提交Tick。正常下Tick发布，固定due不随晚到Original重启。
- [x] Awake/恢复实际匹配token+identity+lineage后仅移除该债务；CapacityReturned=true且无战利品。
- [x] 边界测试：full/free5、Rejected、真实NativeAborted、historical未知、重复Original、晚到Original、误配发布、count9/UTF8超限/损坏hydrate。Unknown结构发布为明确fault injection。
- [x] exact source/DLL/package证据、冻结文件哈希与剩余依赖报告交Root。Barrel27、相关70同DLL一次97/97、catalog12/12。

冻结：`games/101-bomber/.run/resume-capacity-20261003/barrel-freeze-01/manifest.json` SHA256 `304281bfc4c25eb530f3385442f9e68e4219c97e6fe779b2e3310192cd2eb867`。报告见同目录上层 `.sdd/101-20261003-barrel-production-report.md`。
真实23/27初始化、再生、Frenzy继承标记、完整M2正式guard开放、独立review及整局验收尚未交付。

当前4个团队槽位均占用，按Inline Fallback执行；独立新review由Root安排。无提交授权，不提交现有无关改动。
