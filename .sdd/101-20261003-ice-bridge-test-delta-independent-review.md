# IceBridge 新增12 / fixture修正 / Native照片3：非作者测试独审

2026-10-03，capacity_schema。结论：**本次测试增量无阻断**；只对他人新增的第12个case、Root一正常Tick、clientcorr/Root的93f fixture delta及独立照片3作评审，不独审自己原11的行为设计，不把实际12通过提升为IceBridge完整feature/allcuts验收。只读源/official06 API/Root原log与JSON，未build、GEN、Native跑测或修改physical源码。轻量证据 `.run/ice-bridge-test-delta-independent-review-01/verification.json` SHA `e51e1a5c4d41483b9b2ebce0bc9ef8a8774081d03a6512a3abd76f2021e1ec4f`。

## 精确source增量

原11冻结 `92eba733…` → registry新增12作者稿 `b6bbda1f…` → Root正常Tick稿 `7c62a3bb0abba8b59890640701e2f6b2d8320b3a281ecc7c279bdc2181976e99` → fixture93f当前 `93f2069ff42f47366f0710fa179aeaa1a4cf75f85d9eeedf904c28bf5c24a361`。

轻量逐字核：从b6bb移除仅新方法119行，完全重构92eba；从7c62移除仅Root的 `scene.TickControlled()` 一行，完全重构b6bb；93f中的新增12方法完整原字节与7c62相同，当前physical与93f私稿相同。7c62中的182个含Assert表达式原行在93f中按原顺序保留，新增30行，共212；包括六条 `var … = Assert.…` 行，未漏算。首轮review脚本仅数行首Assert而得到176/206，其工具前置原件保留，修正为所有实际Assert行后核182/212；这不是任何Native行为失败。

## 新增真实跨引信期限测试

当前93f `BomberIceBridgeProductionTests.cs:353–470`（原7c62:293–410）从实际Freeze/Original接受的桥取得full实体ID、generation/token及Applied/Expires。公开真实Place在干地生产Standard bomb，再明确fixture仅搬该已出版炸弹geometry到桥；它不宣称公开Place可以直接放到当前disabled ice格。Root新增367行的一次正常Tick让实际Native HFSM成为Stationary，随后378/415核MachineKey/Epoch/StepSeq与ReadSnapshot；不是直接写phase/machine快照，也不改变原Fuse。原 `FuseEnd=PlacedAt+配置Fuse`、chain/full source断言保持。

Actual Water写回/unbind已由SDK真实Original确认；用新的空delivery adapter暂时withhold原回执，重复正常Tick直至原FuseEnd+2。每帧断言live/full source身份、Fuse/零Explosion/Danger/Burn、未退款、Native水revision/binding null、桥owner/generation/token/固定期限和durable pending transaction不变；实际Native machine保持Stationary。此counterexample能发现“Native水已落地但原回执未交付，旧Fuse先自行到期”的路径，期限绝未延长。

同7c62真实 `ice-long-withheld-red-candidate-02` 是1fail/0pass/0skip/raw2，在原348行Expected Phase0/Actual1；真正业务RED，非出版前置。producer修后 `ice-long-withheld-green-candidate-01` 名字虽green，实际仍1fail/0pass/0skip/raw2，已走完整跨deadline前置，却在第一ActualOriginal re-delivery 的helper报 `restore_target_not_fresh`；保留且不能算GREEN/退款已经通过。

## 93f两项他人fixture修正

`BindCandidate` 当前621–622交换顺序：先 `RestoreResultCheckpoint(original)`，再 `SetBindingPolicy`，其余相同。exact06 `HostVoxelWorldAdapter.Checkpoint.cs:24–27` 要fresh且`!_frozen`；`BindingContext.cs:48` 的SetPolicy调EnsureMutation，后者 `HostVoxelWorldAdapter.cs:100–114` 会将`_frozen=true`。因此原helper顺序本身违反公开fresh契约；修正只是按公开接口安装原delivery facts后初始化真实policy。SDK的CopyResults复制原receipt/sections，测试没有手造成功facts/receipt、改变raw Original或放宽owner/预算。

OldLife case 当前206–307仅选择已有支持的 `drops.death_drop_permille=1000` 作者取值，其他cases仍default，Remote enabled为既有明确私有能力。它通过实际Capacity pickup/真实PickupAbility→capacity2，两个public Remote placements形成同full旧Life/gen、不同完整bombID；第二枚固定在干地15,13且引信未来。旧3个真实effect杀伤循环完整保持，只在旧Life仍live时再发真正903杀伤，不手写死亡/继承/保护phase，也不把该case当“三击必死”验收。

真实旧life死亡后等待真正successor落地/restore完成并generation增长，full-loss使新cap1；一个待灭remote加一个真实live dry remote让库存前值0。水Accepted只灭桥上第一枚，剩一枚dry占cap1，所以 `BomberInventory.Available(participant,1)=max(0,1−1)=0`，可隔离旧来源退款而不误把正常新life reconcile释放槽判为错。旧两次 `Equal(before, Available(successor))` 与exact-once灭火/来源断言保持，新增AssertDryRemote贯穿前后，核full identity、旧generation、Fuse原期限/未归还、位置、dry ground及无灭火事件。并未改Inventory生产0→1合法reconcile；其他配置/旧source库存矩阵仍须Root单独回归。

## 真Native照片3

`BomberIceBridgeNativePhotoTests.cs` SHA `69539d581c4fab09a70e33780f78b7f868d5aace7e7d6dea6bda0d4e81b155c2`，独立3 Theory：freezeOriginal /activeOwner /waterOriginal。真实Native桥、binding及原Applied Original先建立；仅在单次正常Tick的89–94行启用 `NativeReadWitness.Recording`。Witness在实际`inner.Read`之后记录地址，所有结果/prepare/apply/query/bind/coalescing/prediction均直接转发官方ABI，没有替身地形或假成功回执。

124–127行断言Legacy19两层完整722个cell read、722唯一、与实际Address规则逐字顺序一致，每格一次；对WaterOriginal还断言实体真实退休、水与binding null，对另外两态断言真实owner/live/fixed8秒Applied clock。Setup和后置显式SDK ReadCell不经过该记录器，不能混入被测Tick。记录器量测的是生产adapter的实际ABI Read，不独自证明任意直接SDK旁路或Host.Read调用次数；静态再核当前 `BomberTerrainRead.Server.cs:95–117` 构造整图两层addresses、112行一次Adapter.Read并按tick+adapter缓存，official `HostVoxelWorldAdapter.cs:538–549` 展开到记录到的真实ABI读取。这三例只证明这三个Legacy/单owner阶段，不是所有多owner/地图档/paired cut照片预算验收。

## Root实际闭环与身份

全部原件在 **Game** `.run/v14-fullpack07-native-20261003/`，审查者没有自行执行它们。

| 原件 | 实际结果 |
|---|---|
|ice-long-withheld-red-candidate-02|1/0pass/1fail/0skip/raw2；7c62，Phase0→1业务失败|
|ice-long-withheld-green-candidate-01|1/0pass/1fail/0skip/raw2；same7c62，fresh helper前置失败|
|build21-ice-native-photo-witness|raw0，0warning/0error/sourceChanges0|
|ice-native-photo-green-candidate-01|3/3pass/0fail/0skip/raw0，7s570ms；69539原source|
|build22-ice-fixture-and-continuation|raw0，0warning/0error/sourceChanges0|
|ice-bridge-production-green-candidate-02|12/12pass/0fail/0skip/raw0，15s768ms；93f，新增12与oldLife新增前置已实际到达|

最新12 JSON SHA `c04fec7bcff3bd9bdd4e1edb8f2cd2afef1609639af761ebb42f196a969f46f2`，log SHA `8537102da18ad208dde84c762b3f551e01f03d6ddecb4c5417f5685030cc8cc3`；所有上述log SHA吻合JSON、raw退出吻合、sourceChanges空、manifest一致 `652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`。最新Tests `1a18d1b1e5ed779ff9ade7be356cb1385201e530f875928c80e9ad5c4a340a57`、Game `532cd6d2caf08f78ee6d022d4fcd595b367d00c460cb23da912821ce07d0172a`，当前physical六DLL/build-info匹配原记录。Photo3与最新12是同Game532cd6；Tests分别646c…与1a18…，不可冒称same test DLL。Ecs `aa5520f…`、Gas `09150ba…`、Native `c01599b…`/build-info `f975259…`一致，完整值与official06 API源SHA均在verification原件。

本次只关闭新12及fixture/照片3质量证据；不覆盖所有未知/拒绝/多格多owner、paired恢复/腐败snapshot、16人/大图正式准入或完整inventory profile矩阵。原自己11不据本报告追加“独立设计通过”标记。物理写域继续STOP。
