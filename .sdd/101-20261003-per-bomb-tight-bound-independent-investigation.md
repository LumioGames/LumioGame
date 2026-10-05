# 每弹历史箱接触：Ray修复后的独立数学/生产调查

2026-10-03，非作者 capacity_schema。只读生产/官方06接口，轻量Node枚举数学几何并核Root实际原件；没有GEN、C# build、Native/test、私有生产实现或任何编译源码写入。现阶段不选择48、32或333的正式DECL。

## 结论与实际Root闭环

**对可信当前生产路径、固定内域爆炸origin/map/Power、真实单调续射，地图几何可给出与全局箱发行无关的每实体安全上界。** 这解决了whole-match333模型的方向问题，但恢复恶意cursor与任意作者Power的准入仍未闭环，不能立即发行固定容器。

Root实际 `terrain-frontier-retry-red-02` 是2 total /0pass /2fail /0skip /raw2，失败分别为右臂回origin/Unstarted和A'被退休，均已越过真实Native/C绑定前置。唯一生产变更为 `BomberBlastTerrain.Server.cs` `681f14ad…`→`701769cac2b57d5be3fb10bd39d387b1b13b8a35f0c089ff8c65b08cf6d8c843`：retry保存本次x/z/remaining，并仅在等于原origin时Unstarted。BombState.Server `cf1e28598ba270d816a3d1e89b60c799c3c683946f20116d933714549efa0ff1` /TerrainTransactions `eaf6c8bb…` /物理contact5未变。

Root build12、build13均raw0/0warning/0error。same测试源码 `4d25deea747123af962db28fac8e8e9b219cf1afbd9455ff4c3688b710014a2e`、same Tests DLL `5f6c65dac5ebcaf6da99231669b81bade0dbce1a6b0bc7ee84d6b9c1fb100859`，actual `terrain-frontier-retry-green-candidate-01` 2pass/0fail/0skip/raw0、4s960ms。全源AtStart映射跨RED/GREEN只差Blast一项；Game DLL `d1b52f…`→`78b1a0ec5ad12867da0e78757db7414d70c61e8e9fc72e48e7a60d4ea803626e`。Ecs `aa5520f…` /Gas `09150ba…` /Native `c01599b…`及manifest `652b5a55…`均相同，当前物理六个DLL/build-info符合GREEN原记录。原red01 EntityBindingMissing1016仅fixture failure，仍保留，未充当业务RED。

实际日志、JSON、raw原件在 `games/101-bomber/.run/v14-fullpack07-native-20261003/`；详尽身份与源SHA保存 `.run/per-bomb-tight-bound-independent-review-01/proof.json`。这仅认证Power4/A-C竞争/右臂续射/同格A'两个切片，不代替全状态或48容器验收。

## 条件式数学上界

设W、D是固定图宽深，B≥0为boundary，`W−2B≥1`、`D−2B≥1`，爆炸origin `(x,z)` 在 `[B,W−B−1] × [B,D−B−1]`，P是冻结的非负effective int Power。四臂只在step≥1处调用TryDestroy，origin自身只作爆炸覆盖，**箱联系人不另加origin的+1**。

```text
N(x,z,P) = min(P,x−B) + min(P,W−B−1−x)
         + min(P,z−B) + min(P,D−B−1−z)
max N = min(2P,W−2B−1) + min(2P,D−2B−1)
```

因为左右可用距离之和恰 `W−2B−1`，两个被P截断的非负整数之和最大为该总和与2P的小者；垂直相同，两个方向轴独立。以long/BigInt计算2P和尺寸差，不能先做int乘2再声称checked。若P0则0，P1则最多4，默认P6最多24；这些是几何结果，不能反推作者Power只能6。

| 固定正方形、B1 | P4 | P6 | P7 | 足够大P的几何上界 |
|---|---:|---:|---:|---:|
|19|16|24|28|32|
|23|16|24|28|40|
|27|16|24|28|48|

轻量纯数学脚本 `audit.mjs` 对19/23/27宽深组合、B0/1/2/3、P0/1/4/6/7/8/16/32/100/Int32Max共360组，逐枚举145800个合法内域origin，全部等于公式。这不是Native达到这些数字的证明、不是全部B配置的游戏支持声明，也不是表内资源可以在每个几何格实际生成的最低需求。硬柱/水/安全区只可能减低正常contacts，因此公式是保守空间上界。

该几何转成distinct full ChestID上界的必要条件是：每坐标对这颗实体最多提交一次联系人，已接受前缀不回退；新generation不能在已经计入的坐标再次被旧source计入。下面证明目前只覆盖正常实际生产而非任意恢复字段。

作者范围另须区分：实际 `map.boundary_cells` schema仅minimum0、无maximum；当前Calculator:38/51–53锁Legacy/19/19却未锁B1。因此B1的32/40/48不能代表全部UGC。若B0，几何饱和分别36/44/52；默认Native硬外环可能进一步收紧，但尚需独立layout不变量证明，不能把named profiles均B1作为证明。23/27现仍正式guard关闭，表内数字是产品候选几何，未声称已准入。

## 正常生产路径已有的静态证据

1. **每实体初始四臂且不破origin。** BlastTerrain:17–31记录当前LogicTransform，Trace只一次由Explode调用（BombSystem:315）。Ray从step1开始，方向与boundary检查在BlastTerrain:72–83。无可读地形时会保存四个原origin/Power/Unstarted；读不可用的Resume不清债务。
2. **接受推进与retry不增加距离。** TryDestroy用当前Ray `remaining−step`（nonpierce0）生成pending detail（TerrainTransactions:299）；只有真实Applied/Original/TokenConsumed、完整provenance/receipt验证后，Begin把被接受坐标和该剩余量转成非Unstarted continuation（186行）。已接受cursor的实际当前格若是replacement destructible，Resume:56–59丢弃该臂而不再dig。新Rayfix:92–98竞争retry保存传入cursor/remaining；下次先走replacement检查，故不能穿回接受前缀。开放格可重复读取，但此前没有联系人，不能因此增加distinct箱ID。
3. **非terminal/strong不会制造重走入口。** ordinary资源箱RemainingHits>1以及strong预先计数都通过当前bomb的TryObserveChest，Ray随后break；它们不返回retry或新continuation（TerrainTransactions:273–292）。terminal普通箱仅Original后计入；strong terminal预先计入一次，失败不能再给同完整ID加一。InspectChest按fullID dedup，Family只用于箱独立家族，不是ContactedChests的聚合owner。Split儿童各自持有自己的ContactedChests；damage owner母弹的共享hit rows不能混成全家箱列表的32界线。
4. **known refusal不回退；unknown不重放。** End的Staging Rejected直接return（353–357）；普通臂无新增continuation。原Aborted非Original清pending（72–82），没有把射线重置原origin。合法真实Unknown/非Original/Historical/Duplicate不会消费pending或增加联系人（84–86）。accepted终点一个方向的pending与existing continuation不能并存，Begin:139–140显式拒绝。拒绝可能减少波及范围，本文只证明没有增加distinct历史；不把这种停止行为擅称新的活性/补偿需求已通过。
5. **当前writer闭包中，出生后Power不再变。** 搜索实际Gameplay非generated源码，Power写入只在PlaceBombAbility:139、Frenzy:90、BarrelPromise:143（3）、Split:106（1）的待建EntityOrder模板。玩家后续升级改变玩家Attribute，不改变既有bomb的Power。Split child存储guard还强制Power1。普通/Frenzy checked转int取出生时有效属性，属性schema最大值没有硬锁6。
6. **爆炸后origin在当前正常生产不再移动。** BomberBombEntity无AbilityComponent/动态体，仅Observer、LogicTransform、BombState/Hfsm/DamageFacts。placement、Frenzy、barrel、Split只写新order初始位置；其余bomb位置writer只有Kick。Kick.Advance:65–67仅Fuse且FuseEnd>当前Tick；Native ReturnCapacity action清KickDirection/Range，EnterDanger才写Occurred（Lifecycle:60–68）。MoveAbility只能对真实player激活。正常Place.Server:28–30、Kick.TerrainAt:139–140都夹在内域；Split endpoint来自原reach，barrel坐标来自已校验真实bound cell。这是当前producer代码闭包的条件证明，不是readonly不可写的Runtime字段承诺，也没有验证恶意hydrate位置。
7. **旧生命和晚到义务不能按钟释放。** HoldsSource=continuation+pending source+当前frame（TerrainTransactions:212–218）；BombSystem:282–291在phase截止前先检查HoldsSource、Fire/Hit debt，不能按Danger/Burn截止销毁。RoundTransition:29–34阻止未解地形进入下一match，且任何仍live Bomb使旧局清理等待。源码没有删ContactedChests的活动路径；旧fullID在实体退休/新generation出现时保持。旧SourceLife死亡不让Bomb.SetSource重分配（BombState:17–28）；GetSource只要求历史fullIDlocal，故不用新Life位置作为射线origin。

## 剩余finding：恢复与高Power尚不够

**[P2] 恢复的几何/前进记忆不完整。** BombState.OnHydrate直接ValidateStorage（111行）。对非Unstarted，140–145只验direction唯一、remaining0..Power、family/Occurred及in-map；没有与origin同轴/方向、已消耗距离+remaining≤原Power、nonUnstarted必须离开origin、或已接受prefix的匹配。单个合法source上，right `(6,4,1)`（错误行）、left `(6,5,1)`（逆向）、right `(6,5,2)`（超原P4）均可满足现形状guard。合法前进row改成origin/P/Unstarted也符合147–152，已有ContactedChests只存fullID，不能重建其方向/坐标来证明此reset无效。

因此“加强同轴+距离关系”必要但单独不足跨恢复反重放：origin/fullPower的Unstarted本来是合法初态，现state无法区别恶意回退与真正未开始。还有pending detail:611仅验remaining0..6，不关联sourcePower/origin/方向；raw snapshot在checksum/canonical型态上正确，不保证这些Game因果。需要真实Capture/官方Restore的明确corruption负控先RED，及正常合法continuation/old-dead-source正控。Runtime-only active restore在Tick被Game guard拒绝，但 `BomberWorldRuntime.Server.cs:22`允许CompletedRestore.PairedCheckpoint，不应把这一限制写成所有真实恢复都不可执行。若要声称完整恢复tight bound，必须涵盖实际paired cut，而不只拒绝单端resume。此处不擅加persist字段或缩支持范围。

**[P2] 任意effectivePower没有生产准入闭环。** attributes.maximum为i64/min0且无6上界；普通/Frenzy的checked int及其他配置算术是有限范围，但不等于全int均获支持。pending terrain detail.Remaining仍硬编码≤6（TerrainTransactions:611）；Power8在首格pierce提交会持有remaining7，下Tick验证可能在已有Native提交后fault。Power7首格remaining6只是较窄可构造正控，不证明Power8。需要真实作者CLI/Reader通路先确认该具体配置能准入，再真实Native正控/首例RED；不能通过把schema锁6、改公共MaxWork或提前断言UGC必须拒绝解决。本调查不认定公开Runtime缺陷。

## 必要可自动化证明清单（计划，未新增测试源）

| 切片 | 使用实际证据与不可放宽条件 |
|---|---|
| Fixed frontier回归 |当前same两例GREEN +原Terrain31、Corrective28、MultiArm2用当前701769 DLL再跑；四direction竞争/MaxDestructions/read unavailable分别保完整source+剩余距离+actual Original，不假回执 |
| Gold/strong和家族 |真实nonterminal Gold和strong命中后Native replacement、terminal拒绝/真实Original、Split shared Family各实体历史；证明本实体不会通过另臂重复同坐标/新ID，保持独立家族奖励条件 |
| 真实Unknown跨截止 |借现Gold retained-result/SDK receipt eviction取得actualUnknown，长期hold至Danger/Burn之后、旧SourceLife死亡后新Life落地；Capture保持债务与历史，再实际Original重交付，不能clock释放或重置cursor |
| known reject矩阵 |真实revision冲突、staging/receipt capacity拒绝之后Native replacement，原统计/contact/credit不加；不能只对同一旧ID看dedup，须全新ID负控 |
| 恢复shape/反reset |真实非空前进row建立后Capture，唯一字段corruption：错误轴、逆向、超remaining、origin/nonstart、origin/fullPower/Unstarted、改变Power/transform、pending geometry；官方Restore先应拒绝且保原像。与合法retained source/两cuts/paired checkpoint完整正控区分，不伪造成功Native receipt |
| Power/边界 |authoring/Reader真实Power7、8及饱和空间的合法范围，interior四边/中点/Kick截止+同Tickchain、barrel3/child1；数学safe上界与当前pending≤6冲突独立先RED，未支持M2档仍guarded |
| 物理/序列化 |在上述语义证据后仅Root批准的isolated候选做official GEN、满容器/one-over、实际完整World capture+official reader/restore、所有同步债务；保持1MiB/64MiB/8MiB限额，schema历史原件和旧cap5原像先存。原333候选只能隔离实验，不能正式publish |

所有切片应记录实际总数/skip/raw子退出、exact源/Runtime/Native/manifest、Original原始bytes、Source完整ID/gen/chain/family/Occurred，测试前置失败单列。现2GREEN只关闭第一行最小反例，其余计划不是已执行pass。

## 现在可执行的最小old5 Snapshot基线

已收口13个私稿均保持未编译/未运行。Root可先从 `.run/resource-chest-budget-bounded-candidate-01/BomberContactWorldSnapshotTests.cs.draft`（SHA `4139c19ed9759d139b31d93a7f530d7c81eb86b74005ce3407522e655b0edb65`）仅提取独立单Fact类 `BomberContactOldWorldSnapshotTests` 与其Evidence helper，minimum1。它仅O0+centralfalse作者参数；旧Calculator仍ChestLimit5/required391且旧source703覆盖，不需新公式、DECL或GEN。真实Tick出版5 Chest+Bomb，通过真实TryObserve记录完整ID，公开Capture先保存原始old5 LWM/实际SHA/export/Game/Runtime，再官方Restore和逐字recapture。输出 `OLD_CAP5_WORLD_ARTIFACT` 给以后兼容读回。Root已计划永久artifact/config保存实际作者export原字节与SHA；future333 class继续private、未经编译，不发行或运行，更不能拿其跳过作为pass。

Codec3稿也能在原Game声明运行，其中old5→old5是实际official writer/reader正控，old5→333 desired兼容预计canonical拒绝；它不是完整Game旧release原像的替代。全13稿与manifest `702bdf1b…`未被本调查修改。旧105、Resource10原断言、公共限额与正式M2guard均保持。

## 后续共享写域身份变化

上述Root2例原件/18源SHA属于审计完成时窗口。随后另外写域加入IceBridge接面，TerrainTransactions `eaf6c8bb…`→`4d9d2767…`、BombSystem `22076471…`→`a42880ac…`（过程中另见`490fba26…`）、RoundTransition `7603a51e…`→`6401cf3c…`、WorldRuntime.Server `838b2f80…`→`e33dc451…`。原fence失败保留在 `.run/per-bomb-continuation-proof-test-draft-01/fence-check-original-failure.json`；不声称跨时间0drift，也没有把这些变更算本审查者编辑。Blast701769与BombStatecf1e/DECL物理5及原13私稿保持原字节。

只读核实这些新接面后，普通DestroySoft的pending `Remaining≤6`原predicate仍在现643行，BombState continuation shape校验未变；当前Pierce kind3不会经Freeze/Fire RequestContact建立Bridge promises，空Bridge记录不HoldFuse。额外Bridge生产未由本文整体验收。新11例仅private测试私稿及断言说明见 `101-20261003-per-bomb-continuation-proof-test-draft-report.md`；未编译/未运行，后续由Root选择物理发行。
