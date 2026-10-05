# 单调续射恢复与大威力：先行测试私稿

2026-10-03，capacity_schema。只写父仓 `.run` 私稿与本报告；无编译源码、生产、DECL、表、GEN、Native运行或提交。私稿测试预期尚未实际执行，不能记为RED/GREEN。

私稿：`.run/per-bomb-continuation-proof-test-draft-01/BomberTerrainContinuationProofTests.cs.draft`，SHA `e91d296cffec03164f772e95390dea9d5dea5532d9ab0e88b444cdc9171736de`。类过滤 `BomberTerrainContinuationProofTests`。静态1 Fact、2 Theory/10 InlineData，合计11 cases：预计2合法正控、9失败目标；实际首次run必须区分前置/API失败与行为RED。

## 真实前像与八个几何负控

复用既有 `BomberTerrainCorrectiveTests.AcceptedContinuationSurvivesRealUnavailableSectionAndReadRecovery` 的真实SDK路径，既有Scene只设测试启动条件，Bomb birth模板是既有fixture helper。两次正常 `WorldManager.Tick` 真正Native破 `(6,5)` softBrick；记录原 `Applied/Original/Status0/TokenConsumed`、原receipt bytes、section/revision及pending完整bomb/participant/life/generation/chain/match tuple。通过实际 `OpenSectionExport→ApplyDurabilityAck→UnloadSection` 得无权威读；下一正常Tick消费actualOriginal，生成真实非Unstarted右臂 `(6,5,remaining3)`，原origin `(5,5)`、Power4。没有伪造成功回执或手造accepted continuation。

先保留该合法原像并用现 `ValidateStorage` 与官方 `BomberTestWorld.Restore` 实际hydrate/逐字recapture验证。每个corruption仅替换上述row的一个列，其他来源和Power/transform不变：

| corruption | 一列变化 | 应拒绝的事实 |
|---|---|---|
|axis|Z5→4|不与原origin同轴|
|direction|right1→left3|cursor仍在origin右侧，却声称左臂|
|remaining|3→4|已走1格+剩4>原Power4，虽remaining自身≤Power|
|distance|X6→10|正向位移5格已超Power4，且保留剩3|

每项分别直接调用真实 `BomberBombState.ValidateStorage`、或先用公开canonical `CaptureSnapshot` 再官方Restore触发OnHydrate，8条相互独立目标。期待原 `InvalidOperationException`/owner错误内因，消息包含continuation；拒绝后原corrupted源字节不变。合法Original原bytes/合法与corrupted `.lwm` 在执行时永久写到Game `.run/continuation-proof-artifacts/<guid>` 并输出SHA/source tuple。当前shape guard缺这些关系，预计八条不能抛而实际RED；该结论仍待Root fresh执行。

这里测试 **Runtime-only hydration cut**，不tick active Runtime-only restore，不冒称paired Native恢复通过。原资料已明确paired可运行，但本最小slice不闭整个paired续射/unknown/死source矩阵。

本稿不把 `origin/fullPower/Unstarted` reset作为能由现数据唯一判错的测试：同一方向本来可能合法尚未开始，其他臂已有contact历史；现列表只有ID、没有按方向的接受记忆。该信息边界保留在tight-bound报告，须先明确恢复因果owner及实际paired正控，不能加“只要有历史就拒绝Unstarted”误伤合法状态。

## 两个实际作者Power边界

使用原真实 `AuthoredFixture` CLI把 `attributes.BombPower.initial/maximum` 同设7或8，再由实际Reader和真实World属性断言。maximum schema是i64/min0、无6上限，7/8不改变当前最大强化属性8，也不修改容器/普通budget/guard。资格仅使用现 `SpecialBombProductionTests` 同等明确的held Pierce slot fixture；这是真实Place RPC/source birth验证，不声称自然拾取或完整Host资格验收。

经现 `MovementInputMemoryTests.Queue` 原wire RPC激活 `PlaceBombAbility`，由真实生产者设置Power、SourceLife/fullParticipant/generation、chain、Fuse和Phase。炸弹任何这些字段均不patch；等原正常Fuse到期。Native在右邻 `(4,5)` actualApplied破砖后，durable detail remaining分别6、7。先验证原receipt身份/bytes与pending full source tuple，再下一原Tick期望能消费Original并实际Native破下一 `(5,5)`。

Power7应过当前硬上限6；Power8预期在既有 `BomberTerrainTransactions.Validate` 的 `row.Remaining>6` 才失败（原eaf6:611、桥接4d9d:643），actual第一Native破砖与真实RPC前置必须先成立。若作者CLI、World准入或producer资格先失败，只记相应前置，不能假称此RED已到。不得把这项预期当成任意Power均被支持，或反向把产品schema静默锁6。

## 私有身份与跨时间源差异

轻量 `audit.mjs` 只数私稿案例、核源与官方API身份，不执行C#测试。`proof.json` SHA `bf675527868a84bd27a28ef8df92bad0c9b9662dcd5f37adbbebb71e309bddc7`。它如实保留数学审计后4个Bridge共享源变化与先前fence失败，未声称全域0drift。Blast701769、BombStatecf1e、字段DECLfd871物理5及其余原审计核心源保持；桥接新Helper只是核Pierce kind3/空owner不参与本slice，未整体review其生产。

原snapshot13三个私稿和manifest逐字未动：codec `ca12273d…`、World `4139c19e…`、UGC6 `5a476498…`、manifest `702bdf1b…`。Root可仅发布旧5单类与Evidence helper，永久保存作者export原字节；333 class继续private，本私稿不依赖它或任何newbudgetformula。未选择48/32/333 DECL，1MiB/64MiB/8MiB公共限额及正式M2guard均保持。交回后STOP全部source写入。
