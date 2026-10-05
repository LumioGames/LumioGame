# 中央补给实施切片

本切片承接完整交付主计划，Root负责；当前只完成接缝与写域规划，尚未生产或测试通过。依据design§8.6/16和ADR0048：23/27默认50秒预告、60秒公开喷发一次，19官方档关闭；自定义房可显式配置开启。使用真实World.Tick、Native地形、现有结构创建与presentation journal，不增加第二Tick或地形真值。

## 写域与接口

- Root：`Gameplay/Tables/schemas/game.json`和`tables/game.txt`追加共同Supply/Frenzy参数，`pickup_kinds`作者新增Frenzy7（Kick6保留）经官方mint；`BomberTypedTables.cs`接生成Reader、`Config/BomberObjectBudgets.cs`仅为这些已知有界来源增加校验/checked envelope，保持M2/Fire/Split未知生产者守卫；官方双端Reader/export，禁手改生成物。
- Root：新`Gameplay/BomberCentralSupply.Server.cs`，提供`Advance(World)`、`Validate(World)`、`ReservedCount(World)`、`ObservePublished(World,BomberPickupItem)`、`HasPending(World)`；独立ProcessorPlan系统After BombSystem调用Advance。供给对象从自己的持久promise转交真实发布物，不加库存/帽子。
- v14协调声明：`BomberWorldRuntime`尾追加`SupplyAnnouncedMatchId: Sync<ulong>(Room)`、`SupplyIssuedMatchId: Sync<ulong>(Room)`、`SupplyPending: Sync<string>(None, default="")`；持久pending最多11条、UTF8≤8192，Encode/Hydrate强校验。`BomberPickupItem`尾追加`SupplyMatchId: Sync<ulong>(None)`、`SupplyOrdinal: Sync<int>(None, default=-1)`。不增实体/组件槽或公共wire。
- Root仅协商极窄`BomberPickupItem.Server.cs` Awake/OnHydrate source校验、`BomberWorldRuntime.Server.cs`调用Validate、TerrainTransactions pickup prepaid-credit/destination接缝；Barrel owns同文件其他分支。RoundTransition的pending门与next reset由Barrel集成`HasPending`，Root不并发修改。

## 配置契约

既有GameRow追加：CentralSupplyEnabled bool(default false)、CentralSupplyAnnounceMs uint50000、CentralSupplyOpenMs uint60000、CentralSupplyStrengtheningCount int5、CentralSupplyHealthCount int2、CentralSupplyFrenzyCount int1、CentralSupplySpecialCount int2、CentralSupplyGoldenHeartCount int1。总计最多11，非负、announce<open、open小于局时。Frenzy五参数接口已交frenzy_production：FrenzyEnabled true、FrenzyDurationMs uint6000、FrenzyFuseMs uint1200、FrenzyConcurrentLimit int6(1..6)、FrenzyMinPlacementTicks uint5(至少5)。具体值来自生效ADR；配置校验与native矩阵不相互替代。

五个明确强化位仅从Power/Capacity/Speed既有权重选，不替换Kick，不增加总数量；两个Health、一个Frenzy、两个独立六形态等权Skill、一个GoldenHeart。技能关闭时不发行已关闭的两个Skill位，沿用现有宝箱flag语义，其余九份保留。下一步独立roles/special flag属于完整产品门，不能把现有单flag当两开关验收。

## 持久所有权与阶段

活动Running/FinalCircle按match.StartTick计算50/60秒；Waiting/Warmup/Podium/Results不新发行。预告与开启均只记同Match一次；journal保存实际occurrence tick，不能伪造迟到之前的喷发。发行时先检查全额11(或flag off9)pickup信用，再一次把选定kind/skill/ordinal/actual occurred tick写入世界pending，并设置IssuedMatch。选择使用Runtime DeterminismContext(seed, logical open tick, SchemaEpoch)的固定stream；不读墙钟或按恢复重抽。

每条pending在结构创建前持久标submitted；之后只在实际匹配SupplyMatch+Ordinal的item publication/hydration观察到时移除，未知创建不超时释放、不重复提交。合法落点按Native现有可放置地面，以中心距离、z/x排序散落；避开live与queued pickup、live/待放bomb，不用库存位置DTO。无落点保留pending。items无SourceLife或SourceBomb，不冒充terrain damage来源，单独Validate supply provenance。留地供任何合法Life经既有PickupAbility抢取。

共享容量：Supply pending持有原credit；同tick queued位置以prepaid标识，不能又当新信用重复charge。Terrain的ordinary producer、死亡掉落和Supply读取同一个live+未发布位置/credit view；unknown仍计pending。发布是同一信用从pending转live。下一局必须等pending已结清，未知不能通过reset删除债务。

## 真实验证顺序

1. 作者源参数与Row mint Node RED→GREEN，官方两端导出两次字节一致，旧profile全部可读。
2. 有界UGC Native19/8 isolated producer profile（与正式23/27地图验收区分）：skills-off在真实Tick到50秒一个预告、60秒九件及一个开启，之前零，重复Tick无额外发行；再跑满11组成需六形态消费者/准入完成。
3. publication持久转交、无合法落点/满budget保留、unknown/late/重复、损坏JSON与UTF8上界、paired restore和nextRound reset。所有路径零skip，保留首RED原因与退出码。
4. 正式23/12与27/16实际完整包来源Native各1–100、技能开/关、整局下一局、determinism、8Bot30min及browser光柱/HUD/音效仍独立必需。本切片局部绿不能解除正式M2守卫或宣称完整交付。
