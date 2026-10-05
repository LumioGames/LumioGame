# Frontier2 Native 私稿独立测试审查

非作者 capacity_schema 只读审查，无阻断；可由 Root 发行并串行 fresh build/真实 Native RED。审查者没有运行 GEN、构建或测试，也没有修改任何编译源码。本结论不是两个预期失败的实际结果，也不是最终 perBomb 容器上界证明。

## 精确输入

私稿原件 `.run/per-bomb-frontier-native-test-draft-01/BomberTerrainFrontierRetryTests.cs.draft` SHA256 `ca94e4a140ab9ad582274e415a00051198dcc1a7e758222ee06d623df804cb64`；现 Root发行测试在唯一fixture修正后为 `4d25deea747123af962db28fac8e8e9b219cf1afbd9455ff4c3688b710014a2e`。1 Theory /2 InlineData，分别检验前进 cursor 与同格新完整身份。对应 root investigation SHA `28c1b2e8fe4e37a1965c60b60deaf966b3b5f6ea0521a9274762947a2a04f29c`。原 TerrainProduction31、旧 MultiArm2及 Scene helper 未由本次作者/审查者修改。

实际引用源：`BomberTerrainProductionTests.cs:37–96` 的旧 Scene 通过真实世界/SDK Native 运行，但已有人工 Running / Vulnerable / protection0输入。新稿明确继承这一 terrain owner fixture 的范围，没有包装为完整 Host admission、自然出生阶段或正式资源箱再生。`Scene.Bomb`（128行）配置真实待建 ECS 爆弹的输入；新稿没有直接调 Trace/Resume/TryDestroy/Observe，也没有写 production pending/continuation/result/receipt。

## 路径与目标断言

新稿19行起设置 origin(3,5)、Power4、pierce，右方 A(6,5)Wood、B(7,5)soft，下方 C(3,6)Wood，上/左真实hard阻挡。A距origin3，因此 A 的实际 Original 接受后右臂剩1。当前 `BomberBlastTerrain.Server.cs:35–65` 从持久队列按顺序 Resume，Begin消费A的 Original后追加A的续射；旧未开始C臂先占该帧 bound-chest，随后A碰B混批。`TryDestroy` 的真实frame竞争分支（TerrainTransactions:226–229、265–267）给retry，而当前 Ray 的retry分支（BlastTerrain:88–97）重新写 origin+整Power/Unstarted。这与两个预期业务失败吻合，无需伪造时序。

cursor例（100行起）要求右续射仍为非Unstarted、(6,5)、remaining1，且先检查 source、chain、family、Occurred未变。这是目标单调前缀的明确断言，不以contact5硬上限倒推语义。

replacement例（108行起）在C实际原回执待交付的 idle边界，把先已真实 ECS出版且初始化 generation2 的 A'作者输入绑定到已真实dig空的A格。A'与A是不同完整 NetEntityId、同World；old A、C generation在被 Native退休前取出。`BindAuthoredChest`（207行起）使用真正 SDK PrepareWriteV2，当前 SectionRevision、原材料0及原binding null，原子block+Set binding、GetOutputRequirements、CommitV3状态0、真实readback。原稿及初审对“普通无queued Tick会刷新新live候选”的假设被实际首次绑定失败推翻；Root现通过下面的真实公开context刷新前置修正，而非假binding字典或假revision。它是SDK作者输入，不声称尚未落地的正式资源箱再生生产者已经创建A'。

replacement后的两个正常 Tick保留C真实交付。坏路径若产生A'事务，条件分支只收集真实 Original证据，最终仍严格要求 A' live、binding/material保留、历史恰A+C且不含A'、DestroyedBlocks仅baseline+2、pending空；没有因存在坏回执而放宽预期。真正 Native retirement后只读预捕fullID/world状态，避免用已detach组件值代替活性证据。

## 原回执及完整来源

`AssertOriginalPending`（162–203行）逐项核实际持久事务单row、section/cell/kind、chest fullID、sourceBomb/participant/sourceLife/generation/chain/match/submitted范围，以及 detail coordinates/family/Occurred/cell generation。实际 Adapter.CaptureResultCheckpoint 中相同 transaction的 row必须唯一、Operation/BatchTransactionId null、Status0、Applied、Original、TokenConsumed、原receipt非空且字节数相等、单section、UpToSectionRevision大于提交前revision。主测试同时验证A/C真正retired、A格0/null、Original消费前无contact/统计、消费后恰A/统计+1。来源不是由测试拼出成功 EffectResult/Claim或 Native receipt。

同Section上的A'新作者提交可推进当前revision，但没有写/替换C retained Original：既有消费路径按原receipt Section推进证明和 exact pending provenance核验，不要求 idle后 Section仍恰等原 UpToRevision。实际能否通过binding candidate授权、opaque receipt保留与SDK构造仍以 Root fresh build/run为准；若前置失败只算fixture/compiler失败，不能充当cursor业务RED。

## 边界

这两例只对 Power4 /一枚bomb /A-C同帧竞争/右臂accepted frontier /同格generation2建立最小路径。没有证明任意四臂顺序、nonterminal chest、unknown/rejected、移动origin、UGC Power7、大图或全局快照上限。实际 RED 后才可授权单调前进修复；Native GREEN及后续完整矩阵之前，不能按24/25坐标或333 whole-match候选发行新的固定容器literal。

## Root fixture01 的真实前置修正

原独审稿SHA `262f9eaca0663576d11d2aa7dca07a15f834cc7f94f853ced262bfa4a6a5ca37` 保存在私稿同目录 `independent-review.before-fixture01.md`，没有抹掉先前假设。实际 `games/101-bomber/.run/v14-fullpack07-native-20261003/terrain-frontier-retry-red-01.{json,log,exit}` 为2 total /0pass /2fail /0skip /raw2，sourceDrift0、同ca94源码；原log SHA `a82a960a2c74b0d456b8f2c8c8ed322192e38b0278516d399470f26b04616d85`。两例都在第55行C首次绑定、SDK PrepareWriteV2抛 `EntityBindingMissing1016`，没有到cursor/replacement目标，**不能算业务RED**。

Root仅在本新类 BindAuthoredChest 的真实live/type断言后加 `Assert.True(scene.Adapter.TryRefreshBindingContext())`。删这一行逐字恢复ca94原件，任何Native/source/contact/remaining/最终负控断言未变。exact06 `HostVoxelWorldAdapter.BindingContext.cs:113–145` 公开方法直接调用真实 Runtime TryPublishBindingContext，检查owner、既有policy、条目/byte预算，逐个遍历实际World活组件，生成fullID/真实wire类型，并通过真正Abi.ReplaceBindingContext推Native。没有传测试伪候选、放宽policy、改capacity、写terrain、触碰pending/result或伪造Original。

只读核该delta无阻断：对 SDK 作者输入之前显式刷新实际候选是正确前置。新代与临时C都是正常ECS出版，Root原件与fixture failure保留。随后fresh编译/Native red-02的结果另核；当前报告不把原red-01升级为业务失败，也不声称4d25两例已执行通过。

## 后续真实Native窄闭环

上述待执行版本SHA `31405782634558055597781999f62a97f2e64a40de3371334d57887314a90681` 已另存 `independent-review.before-native-closure.md`。现独立读取Root `terrain-frontier-retry-red-02` 实际2 total /0pass /2fail /0skip /raw2：已越过SDK绑定前置，分别失败在cursor回origin/Unstarted与A'被退休；并非red01前置重复。Root最小Ray修复仅保留当前x/z/remaining及仅origin才Unstarted，Blast `681f14ad…`→`701769cac2b57d5be3fb10bd39d387b1b13b8a35f0c089ff8c65b08cf6d8c843`，跨RED/GREEN全源AtStart只差该一项。

build12/build13均0warning/0error/raw0；同4d25源码、同Tests `5f6c65dac5ebcaf6da99231669b81bade0dbce1a6b0bc7ee84d6b9c1fb100859`，真实 `terrain-frontier-retry-green-candidate-01` 为2pass /0fail /0skip /raw0、4s960ms。Game变为 `78b1a0ec…`，Ecs `aa5520f…`、Gas `09150ba…`、Native `c01599b…`与manifest `652b5a55…`保持。JSON/原日志/完整SHA认证保存在 `.run/per-bomb-tight-bound-independent-review-01/proof.json`。

该闭环只关闭本两例竞争与替代箱反例；并不使恶意hydrate、Power>6、所有direction/Unknown、完整snapshot或新容器literal获得通过。后续数学/恢复缺口见 `101-20261003-per-bomb-tight-bound-independent-investigation.md`。审查者未构建/运行Native，以上actual均为Root原件独立核验；后续另写域IceBridge源变化与此historical窗口分开记录。
