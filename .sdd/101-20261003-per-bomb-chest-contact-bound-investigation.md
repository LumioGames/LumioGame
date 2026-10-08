# 每弹历史宝箱接触上界：只读根因调查

2026-10-03，registry_bounds_review。使用systematic-debugging先追根因；未改生产/测试/声明/生成/index，未运行build/test/Native。Root已告知旧TerrainProduction31/31真绿，但该集合不证明本文新retry+replacement cut。本调查提供静态可达路径与待真实Native执行的私有fixture方案，不伪称已复现。

**结论：当前实现无法证明24/25个坐标就是每弹distinct full chest IDs的上界。** 已接受前缀后的retry会回退到原origin、恢复全Power；旧source的terrain debt又可跨Danger/Burn截止保留。333只是有限checked-in数值集合的whole-match保守候选，不能限制机器schema合法UGC。现ContactedChests上限5会拒绝新接触，它是存储拒绝事实，不是正确发行容量的证明。

## 精确源码链

- `BomberBlastTerrain.Trace:21–30`从真实bomb transform取origin；正常四臂是Power格，无照片时持久四个origin/Power/Unstarted。Trace只把origin加入爆炸接触，不在origin调用TryDestroy。
- `Resume:35–67`对全原family/Occurred/remaining检查后取当前真实照片。已接受的非Unstarted continuation先检查其旧破坏格的当前Native材料；若已被替换成Destructible则停止该臂（代码注释“receipt owns old destruction only”）。否则从已接受格+remaining继续。因此正常前进路径本身是单调的，直接late replacement不会被旧回执误删。
- `Ray:89–99`一旦当前destructible的TryDestroy给retryArm，完全忽略此次Ray的参数x/z/remaining及已接受前缀，重新保存**bomb原origin+完整Power+Unstarted**。下次Resume走Unstarted分支直接重射原全臂；并不执行旧已接受cell的replacement-stop分支。
- `BomberBombState.ValidateStorage:147–152`还强制所有Unstarted必须origin/Power。因此只改Ray保存cursor、却不处理这个guard，会形成无效存储；不能将其当最小已完成修复。
- `TerrainTransactions.Begin:107–195`在真正matching Original后，对terminal资源箱把完整旧chest ID追加ContactedChests，生成一个从被破坏格继续的剩余continuation；已接受source/tuple/统计/奖励仍属于原bomb。已知Rejected不会凭空制造Original continuation。
- `InspectChest:101–107`Duplicate只按完整ID比较；同一个坐标换新实体ID不是Duplicate。历史列不删除旧ID，FullID包含world instance/counter，物理退休旧chest不会令旧历史变成新chest。
- `BombSystem:251–254`每Tick先Resume所有有terrain continuations的source；283–294若HoldsSource就不推进Danger/Burn/Expired动作。Terrain `HoldsSource:212–218`检查continuation、pending source或当前frame意图。故不能用400ms Danger/火残留时长简单排除长期重试，pending/continuation可延长实际保留寿命。

## retry条件必须区分

TryDestroy:229–231的pending/MaxDestructions/frame不同kind，248的barrel混批，264的chest混批，266的soft与已排bound chest混批会设置retryArm。barrel reservation拒绝也设置retryArm。**294–295输出信用不足仅return false，retryArm仍false**；它本身不产生该回退。TryDestroy的既有pending chest/InspectChest容量拒绝、frame同格duplicate、非法binding/不可破坏也不是此retry分支。Ray遇这些普通false仍break，但不保存重试，不能混称credit pending都必然延迟。

最小单bomb路径不需要伪造外部credit压力：第一Tick右臂真实破坏A，另一臂C因A占当前chest frame而保存Unstarted；下一Tick先消费A Original，把右臂剩余continuation追加在C重试之后。Resume先成功排C，再让A的右臂在前方B遇soft/chest混批，retryArm=true，右臂回origin+全Power。于是前缀A被重新纳入当前可达射线；若其格已由真实Native作者输入换为新A' full ID，旧source会作为新chest接触者处理A'。这条序列是静态路径，待后述真Native负控，不当成执行事实。

## 坐标上界、UGC与容量判断

默认Attribute BombPower maximum6只是现源表数值；attributes schema的maximum列没有上max。PlaceBomb从正式Attribute当前值得到Power，不能拿6当所有schema合法UGC的固定限。一般静态几何臂格数应按实际power和map边界推导；origin不是TryDestroy宝箱目标，所以原24/25说法也需要明确数的对象。

即使固定19地图、Power6，空间坐标有限仍不能推出历史distinctIDs有限为同样数：回退可重新遇到已穿过坐标的新代数。现代码没有“每臂消费距离永不回退”的持久不变量，也没有“坐标每弹只接触一次”的规则。固定存储guard5当然使已成功记录Count≤5，但下一合法发行箱会因容量拒绝，不能据此声称业务需求≤5。扩到333亦不能凭guard反向证明需求≤333。

capacity_schema给出的静态profile证据`.run/resource-chest-budget-bounded-candidate-01/profiles-proof.json` SHA `e20411f8b222e3a9ddbaf11e671c14d339ca1aff783066be947b805161ccc9d0`明确标记非Snapshot/Native执行；我只核身份/文件表述，不冒认自己运行其42/48集合计算。对方报告默认/命名组合333，schema合法更短interval/first0可达39205 whole-match contacts、canonical文字约1372243B>1MiB。Regeneration schema interval/first minimum0、orbits minimum0无上max；ObjectBudgetCalculator只拒effective interval0，没有把first0作为统一禁用语义。当前Regen8秒slice对first0拒绝只是consumer限制，不可拿它偷偷把未来正式UGC发行面限制到333。旧六个真正ECS storage接触仍不是真Native生产者证明。

## 私有最小真实Native负控fixture方案（尚未源码发行/编译/运行）

拟用新私有独立class，复用`BomberTerrainProductionTests.Scene`实际官方07World/Native、真实Manager.Tick与已有Bomb fixture。Scene确有测试入局phase设置，所以标签必须为Gameplay/Native terrain owner fixture，不称Host完整准入或新Regen producer；本题关心真正Trace/Resume/TryDestroy/Original，不调用这些helpers替代Tick。

1. author native路径：origin(3,5)，右A(6,5)真实Wood箱，右前B(7,5)soft；下C(3,6)另一真实Wood箱。上(3,4)/左(2,5)真实hard挡住其他臂。所有格先用Scene.Write或正式Native作者Prepare/Commit建立；实际ground/floor/pin检查。A距origin3，避免把紧邻bomb的再生禁区误当合法新发行路径。
2. A用现Scene.Chest("Wood")：真实ECS published→InitializeTier→实际SDK sparse binding通过真实Native commit。预先真实publish C与A'，初始化配置Wood tier（A' generation2）；C绑定其真实格，A'暂不绑定。保持总chest≤当前5；这是显式Native输入fixture准备，不声称未来Game资源箱producer已存在。不得写ContactedChests、TerrainContinuations、pending、phase/outcome/receipt/revision作为预期成功。
3. 创建同一pierce Bomb fixture（实际power4足够，origin3.5/5.5，Pierce boolean现逻辑>0），真实Tick发布、下一Tick触发Native HFSM爆炸并提交A dig。记录唯一真实Applied/Original/TokenConsumed/原receipt byte evidence、完整transaction/section/revision/source tuple；A物理退休、Native binding消失。此时C右后继续义务尚在，不能清journal/results伪造初态。
4. 下一真实Tick消费A Original：先C臂排实际Native dig，后A continuation对B因已有bound-chest frame得到retryArm。核实际persisted right ray有origin(3,5)、Power4、Unstarted（作为当前source trace见证）；原A FullID出现在同一bomb ContactedChests，source owner/life/generation/chain/family/Occurred保持。此检查可作为定位断言，不是最终期望。
5. 在此idle边界用真实Native SDK作者事务把预published A'的full ID绑定到已空A格。调用真实`PrepareWriteV2`的block+`VoxelBindingMutationEntry.Set`同一个token并真实CommitV3，expected section revision来自当前Native ReadCell；Native当前Runtime candidates包含真实live A'。此作者事务不伪造任何Game Original、不调用直接ObserveChest；取实际bind/read back确认A'及new section revision。现SDK拥有该真实作者API，现LateOriginalReplacement已有同类Native输入cut；若Native candidate/保留token冲突拒绝，必须报告fixture error，不捏造成功。
6. 下一真实Tick消费C Original并Resume右Unstarted；最终负控期待已经接受A的前缀不会重射A'：A'仍live、其Native binding保留，原source ContactedChests不含A'，完整来源与旧A历史保留；仍能合法前进B并按原remaining/power处理。当前静态预测会重射并排A' dig；用真实checkpoint与再一Tick消费后记录同source两个distinctIDs在同坐标的证据。所有收益/统计/journal用baseline+增量，不清原输入日志。实际失败应在replacement被触碰/退休，而不是fixture授权或Native绑定异常。

这是一项范围很窄的**frontier回退反例测试方案**，不是“Native资源箱再生生产已通过”，也不是直接造25/333/39205箱的压力证明；成立后才可讨论修复。更小的第一负控可只检查真实Original之后的续射retry不回origin，但完整Native A'反例更能区分坐标与full-ID。

## 待Root真实RED后最小修复方向与仍待证明

目前仅建议先TDD证明上述回退，不修改生产。若实际RED证实，则持久retry必须保存**当前臂已消费距离/frontier与remaining**，不能把已接受部分重置到origin/Power。同步处理Unstarted存储guard与真实Resume replacement-stop语义，保持family/source/Occurred/Native Original和拒绝credit规则；不借删ContactedChests、截断历史、限制UGC interval/orbits或增大333掩盖根因。

修复后才能证明每臂已接受chest位置严格沿原方向推进，每次计数消耗至少一格且不同臂不重叠目标；由有效Power/map geometry推导distinctIDs tighter bound。还须检查强力箱非terminal接触、late replacement、initial no-photo retry、knownReject、Unknown、同格世代、所有4臂竞争、Source跨截止及round debt，不能只看首个反例GREEN就宣布24为正式UGC上界。未知等待也应保原债务，不自动延长新的爆炸entry window。

## 精确主要源码SHA

Blast `681f14ad9420df3b0c4b1934172780e6f907fe5ebd42a43e4b0d58927d7660b8`；Terrain `eaf6c8bb187b634be121c54ae602716d4a9fef06a9dbb00cb2f0795e59148c88`；BombState.Server `cf1e28598ba270d816a3d1e89b60c799c3c683946f20116d933714549efa0ff1`；declaration `fd871eb03ccd4f1e5737ec0a9e671943283b3d5a522d049c6cb4dd376ca356ea`；BombSystem `22076471966d5510a4f40766b6dd0c22e1a272bc4a8b4f4e51c2c886811bcc9e`；Lifecycle `6618ab1edd3eeb603baa0565e8321c8bfb38ad2f0a7c764857e457d012be4fb6`；ObjectBudgets `2b2285078879efd035bfe4fd70840fadf60cb1034c860ded9fd76b4701cad94a`；PlaceBomb `1ca7265b2266460db92aa5821170cb52914578e954080e43aec86180f16b1b37`；regen schema `88e02edcb8f82d6c3868b579a2bdbe884f1057a7eca84445a2ffe23aaa5d81e6`；attribute schema `fbf260dfc50177191decd50ae032a5df6f471c563ab5acbde07befffa8af6b53`；TerrainProductionTests `6db06fe7ab2e1948a5269159e8a7d50ca684de8c0612c2c190f837c8c8b3c299`。源写STOP。
