# Game101 狂暴拾取与生产 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Kind7 狂暴糖经真实 GAS Applied 回满血，允许有界额外标准弹，严格保留跨 Life 并发、完整来源自免和未知结构发布信用。

**Architecture:** 沿用 PickupAbility、BomberHealEffect、PlaceBombAbility、Native Bomb HFSM 和 BomberBombAdmissions。Participant 只保存狂暴来源/时间及至多六条未发布结构承诺；已发布弹的阶段、位置和期限仍只读真实 ECS。没有第二 Tick、第二 HFSM、地形镜像或玩家位置副本。

**Tech Stack:** C# 14/.NET 10 与 netstandard2.1、官方 SDK complete-release-06、SDK ECS 声明生成、现有 LumioConfig 生成 Reader、xUnit v3/MTP、真实 Native/Voxel。

## Global Constraints

- 产品依据：`docs/specs/bomber/design.md` §8.5/12/16 与 `.spec/decisions/0048-bomber-m2-map-packages-and-interaction-boundaries.md`，已有 Owner 授权，无新增参数审批。
- 官方完整源身份：`complete-release-06` manifest SHA256 `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`；只消费完整包，不拼 DLL、不改同级源码引用。
- 保留当前 `feat/101-bomber-engine-foundation` 与既有 dirty 文件，不 reset/clean，不一概暂存。源码声明只在 Root 释放后修改；v14 由 capacity/schema owner 统一生成，禁止手改生成物。所有 build/test 串行使用 Root 窗口。
- 狂暴为 `BomberPickupKind.Frenzy = 7`；现有 Kick6 必须保留，旧0–5不改码。Kind7 只走 existing Heal Effect Applied，满血也消耗；重复活跃狂暴拒绝且物品留地、不续期。
- `BomberConfigBinding.For(world).Game` 参数：`FrenzyEnabled: bool=true`、`FrenzyDurationMs: uint=6000`、`FrenzyFuseMs: uint=1200`、`FrenzyConcurrentLimit: int=6`（合法1..6）、`FrenzyMinPlacementTicks: uint=5`（合法≥5）。产品默认值来自源表，消费代码不硬编码这些可调值。
- 每颗额外弹固定 Standard，不继承特殊槽、不产生 Split children、不扣/返普通库存、不计帽数。Participant 的实际 Fuse primary 加未发布 promise 至多六，至少五 Tick 间隔，跨 Life 保留；死亡/到期/换槽不得退还仍在场弹或未知订单的名额。
- 自免只比较 `Frenzy == true && bomb.SourceLife == player.Entity && bomb.SourceLifeGeneration == player.LifeGeneration`；不按 Participant 单独免疫，不按当前狂暴是否到期，不免敌弹。barrel 派生沿完整来源继承 Frenzy 自免标记，其 `barrel:` 独立信用与 `CapacityReturned=true` 不计 primary 额外六账。
- 普通、Frenzy、Split、Barrel 共享 BomberBombAdmissions 的真实 live + 未发布硬总 cap；未知发布不超时释放、不重放，不以概率折扣预算。
- 20Hz 默认：6秒为120Tick，1.2秒为24Tick，正常 Fuse 同时峰值 `ceil(24/5)=5`，六是硬安全上限；累计投出可以超过六。六边界 fixture、损坏快照与实际 withheld publication 要明确区分。
- 验证报告必须记录 total/pass/fail/skip、实际 child exit、源码与包 hash；零测试不是通过。局部 Native 绿不替代整局、下一局、八 Bot、30分钟和正式 M2 准入。

## 文件写域与协调

| 文件 | 责任与拥有者 |
|---|---|
| `Gameplay/BomberTypes.cs` | Frenzy agent 增 enum 明码；Root 控制与 Kick6 的交接 |
| `Gameplay/Abilities/PickupAbility.cs` | Frenzy agent 增 Kind7 准入；Server execute 继续现有 SubmitPickup |
| `Gameplay/BomberHealthBusiness.Server.cs` | Frenzy agent 增全血点数及 Applied 后启动 |
| `Gameplay/Effects/BomberHealEffect.Server.cs` | Frenzy agent 增 Kind7 结算资格，允许 zero-point Applied |
| `Gameplay/Components/Bomber/BomberHealthFacts.Server.cs` | Frenzy agent 扩合法 Kind7，不变声明或 Effect 参数 |
| `Gameplay/Components/Bomber/BomberParticipantState.cs/.Server.cs` | Frenzy agent 追加五个持久字段与恢复验证 |
| 新 `Gameplay/BomberFrenzy.cs/.Server.cs` | Frenzy agent：共享只读活跃/自免判断；服务端承诺、并发、发布观察、校验、round清理 |
| `Gameplay/BomberInventory.Server.cs` | Frenzy agent 极窄 `!b.Frenzy.Value` 过滤 |
| `Gameplay/Abilities/PlaceBombAbility.cs/.Server.cs/.Client.cs` | capacity owner 单写，按本文 partial 接缝接入 |
| `Gameplay/Components/Bomber/BomberBombState.cs/.Server.cs` | capacity owner 单写：第六声明、Awake发布观察与恢复验证 |
| `Gameplay/BomberBombAdmissions.Server.cs` | capacity owner 单写：ReservedCount/HasSubmittedPromise 接入 |
| `Gameplay/BombSystem.Server.cs` | capacity owner负责现有生命周期；Frenzy agent只经窗口写 ReserveBlastContacts/ReturnBombCapacity 两个局部接缝 |
| `Gameplay/BomberRoundTransition.Server.cs` | barrel owner 单写：Prepare、StartNextGeneration 与 ResetParticipant 接入 |
| `Gameplay/BomberBarrelBombPromises.Server.cs` | barrel owner 单写：Promise继承 SourceFrenzy、publication验证 |
| Tables源、`BomberTypedTables.cs`、Readers/exports、Config预算 | Root+capacity按作者域协商单写，Frenzy消费共同 GameRow 接口 |
| 新 `Server/Tests/Gameplay/BomberFrenzyProductionTests.cs` | Frenzy agent，只真实 WorldManager.Tick，fixture标明来源 |
| `.sdd/101-20261003-frenzy-report.md` | Frenzy agent 精确证据与独审交接 |

以上路径均以 `C:/Work/LumioGames/LumioGame/games/101-bomber/` 为前缀。完整方案文件为当前计划；模块之间的窄接缝必须先发送确切签名，不并发覆盖同文件。

## v14 精确声明清单

不增加 EntityType、ComponentType、Ability、Effect、Tag、Attribute、Input 字段或 RPC。共六个尾追加字段，旧字段次序不变：

```csharp
// BomberParticipantState.cs 尾追加
[Persist] public Sync<NetEntityId> FrenzyLife = new(Scope.Room, Authority.Server);
[Persist] public Sync<ulong> FrenzyGeneration = new(Scope.None, Authority.Server);
[Persist] public Sync<ulong> FrenzyUntilTick = new(Scope.Room, Authority.Server);
[Persist] public Sync<ulong> FrenzyLastPlacementTick = new(Scope.None, Authority.Server);
[Persist] public SyncList<string> FrenzyBombPromises = new(Scope.None, 6, Authority.Server);

// BomberBombState.cs 尾追加
[Persist] public Sync<bool> Frenzy = new(Scope.Aoi, Authority.Server);
```

`FrenzyBombPromises` 单行 UTF8≤1024、物理最多六行，token UTF8≤128。新增 enum 必须明确保留所有值：

```csharp
public enum BomberPickupKind
{
    Power = 0, Capacity = 1, Speed = 2, Health = 3,
    Skill = 4, GoldenHeart = 5, Kick = 6, Frenzy = 7,
}
```

生成影响：server/client declarations与registry、browser副本输出、schema root/successor/history/identity审计；client有FrenzyLife/Until与Bomb.Frenzy展示信号，生成的服务端None字段不成为前端第二事实源。普通 Effect 参数编码与已发布 wire 类型不变。Root 官方 mint `pickup_kinds` row7，与 v14 输出同时保留准确编译器/input/output/schema hash；不能从本文手分配公共 Reader/row ID。

## 持久承诺与接口

Participant promise 是**未发布的放置意图和不可重放的提交事实**，不是活动弹的位置缓存。已发布时移除 promise，只读真实 BombState/LogicTransform。

```csharp
internal sealed record Promise(
    string Token, string Life, ulong Generation, ulong Match,
    ulong Chain, int Power, int X, int Z, float Y,
    ulong Placed, ulong FuseEnd, bool CreationSubmitted,
    string Produced = "");
// Token：FormattableString.Invariant($"frenzy:{participant.Entity.ToHex()}:{chain:x16}")
```

产生 `Produced` 只用 EntityOrder 的实际 AssignedId，default则留空，不能造 NetEntityId。`Life/Generation/Match/Chain/Power/XYZ/Placed/FuseEnd` 在 Stage 前从真实 owner/LogicTransform/config 算一次。Stage 写入 `CreationSubmitted=true` **先于**结构 Create；未知结果即保留，永远不根据到期、死亡或找不到 live row重试。

共享类与服务端类采用同一 partial static class，精确 API：

```csharp
internal static partial class BomberFrenzy
{
    internal static bool IsActive(World world, BomberParticipantState participant, NetEntityId life) =>
        BomberConfigBinding.For(world).Game.FrenzyEnabled &&
        participant.CurrentLife.Value == life && participant.FrenzyLife.Value == life &&
        participant.FrenzyUntilTick.Value > world.Tick;

    internal static bool IsSelfImmune(BomberBombState bomb, BomberPlayerState player) =>
        bomb.Frenzy.Value && bomb.SourceLife.Value == player.Entity &&
        bomb.SourceLifeGeneration.Value == player.LifeGeneration.Value;
}
```

仅服务端 `.Server.cs` 实现这些入口：

```csharp
internal static bool CanProduce(World world, BomberParticipantState participant, out string? failureCode);
internal static EntityOrder StageAndCreate(World world, BomberParticipantState participant,
    BomberPlayerState life, int power, ulong nextChain, int x, int z, float y, ulong fuseEnd);
internal static int ReservedCount(World world);
internal static bool HasSubmittedPromise(World world, string exactToken);
internal static void ObservePublished(World world, BomberBombState bomb);
internal static void StartFromApplied(World world, BomberHealthFacts facts);
internal static void ValidateParticipant(World world, BomberParticipantState participant);
internal static void ValidateBomb(World world, BomberBombState bomb);
internal static void Validate(World world);
internal static bool HasUnpublished(World world);
internal static void ResetParticipant(World world, BomberParticipantState participant);
```

`CanProduce` failureCode：`frenzy_capacity_full` 或 `frenzy_placement_interval`。它验证 participant 的完整 CurrentLife/Generation 与 Frenzy来源一致，`FrenzyLastPlacementTick==0 || Tick-Last>=Game.FrenzyMinPlacementTicks`，然后将该 Participant 的真实 live primary Fuse（Frenzy且token以`frenzy:`开头）与其尚无确切 live publication 的 promise相加，不超过读取的limit。用 checked 算术；不得把 Danger/Burn 当 Fuse，也不得因为死亡而只数 CurrentLife。

`ReservedCount` 只返回全世界无确切 publication 的 promise数量。live bombs 已由公共 Admissions 按 `1+FutureChildren` 计数，不能重复收费。`HasSubmittedPromise` 只有真实持久 row 的 `CreationSubmitted` 为true才返回true。`ObservePublished` 在 Awake 和 ProcessBombs 前段调用，先逐项比对 row与实际entity/source/gen/match/chain/shape0/power/Placed/FuseEnd/SkillLevel0/Pierce0/Future0/Frenzytrue，再移除 exact row；AssignedId分配本身不是 publication，错误/重复token直接拒绝。恢复时可有 retained row与其正确实际live发布并存，ReservedCount应为零，第一普通Tick才观察移除，不在OnHydrate修改源快照。

`ValidateParticipant` 验证四scalar为全空或完整历史源（local非零Life、Generation>0且≤participant.LifeGeneration），LastPlacement≤Tick；有promise时逐行严格JSON/UTF8/六上限、完整local Life、Generation>0、当前Match、Chain>0且≤Runtime.NextChainId、非负合法格、finite Y、正且不越界Power、Placed≤Tick、FuseEnd等于Placed+Reader换算、submitted标记、exact token/无重复。`Produced`非空必须完整local ID。无实际发布的合法 submitted row允许保留，不能擅自推定成功或失败。

`ValidateBomb` 验证`frenzy:` token与Frenzy标记成对、owner完整local identity、Chain与token匹配、Standard形态及零special参数。barrel派生免疫允许合法`barrel:`来源但不占primary账；由barrel owner验证其确切Original。`Validate(World)`在世界全部hydrate后验证promise/live匹配、重复token、所有Participant并发与共享总预算。原始invalid恢复必须拒绝且source字节不变。

## Task 1: 两项现有 API RED

**Files:** Create `Server/Tests/Gameplay/BomberFrenzyProductionTests.cs`。

**Interfaces:** Consumes `BomberTerrainProductionTests.Scene(0)`、`BomberEffectIntegrationTests.Bomb`、`BomberGrowthHealthTests.Item`、`AbilityComponent.Activate<PickupAbility,...>`；Produces Kind7缺失的精确Native失败证据。

- [x] 写入两个 Fact：`InjuredLifeConsumesFrenzyCandyAfterActualAppliedHealthSettlement`、`FullHealthLifeConsumesFrenzyCandyWithActualZeroPointAppliedSettlement`。文件初稿SHA256 `c169e39bf05cbbd3cb5917d6ba174c80a232c9e1da9c8f463a081fce72294e66`，没有新声明依赖。
- [x] 在capacity现有v13冻结后，由其一个build执行两RED。实际 first health4不等6；second Kind7物品仍live。均为预期行为断言失败，不是缺Native、编译失败、index error或zero tests。
- [x] 保存结果到report：两case全部名称、total2/pass0/fail2/skip0、实际childexit2；log SHA256 `756955cbabca57dc456b9d86583b62627d2e219b34161cff2039d9682fcc9ae6`，`.run/resume-capacity-20261003/frenzy-native-red-01.log/json`。Split/Capacity/Fire回归由capacity独立报告，不混入Frenzy通过数。

对应既有测试中的核心断言为：

```csharp
EntityOrder candy = BomberGrowthHealthTests.Item(world, life, 7);
scene.Manager.Tick();
world.Get<AbilityComponent>(life).Activate<PickupAbility, PickupAbility.Input>(
    new PickupAbility.Input { Target = candy.AssignedId });
scene.Manager.Tick(); scene.Manager.Tick();
Assert.Equal(6L, world.Get<AttributeComponent>(life).GetBaseValue(BomberAttributeNames.HealthPoints));
Assert.False(world.IsLive(candy.AssignedId));
BomberHealthFacts facts = world.Get<BomberHealthFacts>(life);
Assert.Equal(1, facts.Status[0]);
Assert.True(facts.Ready[0]);
Assert.Equal(7, facts.Kind[0]);
Assert.Equal(candy.AssignedId, facts.Item[0]);
Assert.Equal(life, facts.Target[0]);
Assert.Equal(life, facts.Source[0]);
```

## Task 2: Applied 启动与六字段统一生成

**Files:** Modify PickupAbility.cs、BomberHealthBusiness.Server.cs、BomberHealEffect.Server.cs、BomberHealthFacts.Server.cs、ParticipantState.cs/.Server.cs、BomberTypes.cs；Create BomberFrenzy.cs/.Server.cs；capacity owner统一BombState与所有生成物，Root统一源表Reader。

**Interfaces:** Consumes GameRow五参数与Task1RED；Produces IsActive/StartFromApplied及新增六字段。

- [ ] 先新增actual Tick重复拾取测试：第一颗糖真实Applied后记录Until，第二颗Kind7在同一Life脚下，跑三Tick，断言它仍live、ClaimedBy默认、Until原值，原life只一条pickup_taken。新增skills-off/FrenzyEnabled=false源表测试，参数改变由官方Reader而不是手写GameRow。
- [ ] Root协调v14作者输入一次冻结；追加上面六声明与枚举、官方Kind7row、五参数后交统一SDK生成。分别保存server/client/browser输出与schemahash，旧v13保留历史。
- [ ] PickupAbility现有growthelse增加这个分支，不绕开共享健康准入：

```csharp
else if (item.Kind.Value == (int)BomberPickupKind.Frenzy)
{
    if (!BomberConfigBinding.For(world).Game.FrenzyEnabled)
    { failureCode = "pickup_frenzy_disabled"; return false; }
    if (BomberFrenzy.IsActive(world, participant, owner.Entity))
    { failureCode = "pickup_frenzy_active"; return false; }
}
```

- [ ] HealthBusiness的item判断，在Health之后增加Frenzy资格；afterMaximum/Hats/Gold不变，全血Points可为零，不能落进growth差额覆盖：

```csharp
else if (item.Kind.Value == (int)BomberPickupKind.Frenzy)
{
    if (!BomberConfigBinding.For(world).Game.FrenzyEnabled ||
        BomberFrenzy.IsActive(world, participant, player.Entity)) return false;
    points = Math.Max(0, maximum - attributes.GetBaseValue(BomberAttributeNames.HealthPoints));
}
// 原有 afterMaximum 计算之后，缩窄growth差额分支：
if (item.Kind.Value != (int)BomberPickupKind.Health &&
    item.Kind.Value != (int)BomberPickupKind.Frenzy) points = afterMaximum - maximum;
```

- [ ] HealEffect.CanSettle的Kind7分支允许zero，但钉所有原始来源与holdings：

```csharp
else if (p.Kind == (int)BomberPickupKind.Frenzy)
    return BomberConfigBinding.For(world).Game.FrenzyEnabled &&
        !BomberFrenzy.IsActive(world, participant, p.Life) &&
        p.Points == Math.Max(0, p.MaximumBefore - attributes.GetBaseValue(BomberAttributeNames.HealthPoints)) &&
        p.MaximumAfter == p.MaximumBefore && p.GoldAfter == p.GoldBefore &&
        p.HatsAfter == life.HatCount.Value;
```

Apply保留既有base Health设置与CompleteFact，不在submit/CanActivate改活跃状态。HealthFacts.OnHydrate允许`Kind7`而仍拒绝4/6：`Kind[0] is < 0 or > 7 or 4 or 6`。

- [ ] HealthBusiness.Consume仅在Status1且Ready并且Kind7时调用StartFromApplied，在Destroy item之前执行。实现：

```csharp
internal static void StartFromApplied(World world, BomberHealthFacts facts)
{
    if (facts.TypeId[0] != BomberHealEffect.TypeId || facts.Status[0] != 1 || !facts.Ready[0] ||
        facts.Kind[0] != (int)BomberPickupKind.Frenzy || facts.Item[0].IsDefault ||
        facts.Target[0] != facts.Source[0] || facts.After[0] != facts.MaximumAfter[0])
        throw new InvalidOperationException("Frenzy requires the original Applied health fact.");
    var participant = world.Get<BomberParticipantState>(facts.Participant[0]);
    if (participant.MatchId.Value != facts.MatchId[0] ||
        participant.CurrentLife.Value != facts.Target[0] || participant.LifeGeneration.Value != facts.Generation[0])
        throw new InvalidOperationException("Frenzy Applied changed its exact life correlation.");
    ulong until = checked(facts.Tick[0] + Ticks.FromMilliseconds(
        BomberConfigBinding.For(world).Game.FrenzyDurationMs, BomberConfigBinding.For(world).Game.TickRateHz));
    participant.FrenzyLife.Value = facts.Target[0];
    participant.FrenzyGeneration.Value = facts.Generation[0];
    participant.FrenzyUntilTick.Value = until;
}
```

实际Effect生成若没有公开`TypeId`常量，比较既有10102u，不能为此增加Effect声明。FrenzyLastPlacement不在Start中清零，避免跨Life的间隔退款。Rejected/Cancelled仅释放item.ClaimedBy，绝不启动/续期。

- [ ] 正常编译窗口跑Task1+重复+拒绝后的重试+死亡先于结算+GAS admission耗尽+Kind7 pending fact快照恢复。每项先记录RED再实现GREEN。仅精确文件提交作者与官方生成物，不带入其他dirty文件。

## Task 3: 实际额外放弹、共享总 cap 与未知提交

**Files:** New BomberFrenzy.Server.cs；Modify Inventory；capacity owner的三端Place/BombState/Admissions接缝。

**Interfaces:** Consumes `BomberBombAdmissions.CanReserve(World,int)`、`CreateFromPromise(World,string)`；Produces三静态promise入口、真实Frenzy primary与跨Life并发计数。

- [ ] 写真实放置RED：吃糖后特殊槽fixture为Freeze/Pierce/Remote/Split之一；将普通AvailableBombs降至0只作库存前提，沿真实Ability input放置。断言新actual live bomb Standard/Frenzy/Power读取当前属性/24TickFuse/Future0/Skill0/Pierce0、普通库存0不变、hat原值、actual bomb_placed。不得手造Frenzy弹代替此路径。
- [ ] 三端Place定义确切partial接缝：

```csharp
private static partial bool CanProduceFrenzy(World world, BomberParticipantState participant, out string? failureCode);
private static partial EntityOrder CreateFrenzyBomb(World world, BomberParticipantState participant,
    BomberPlayerState life, int power, ulong nextChain, int x, int z, float y, ulong fuseEnd);
```

Server代理BomberFrenzy；Client Can返回false并输出`bomb_authority_required`，Create抛authority exception。Input wire继续empty，client不获得生产副作用。

- [ ] CanPlace根据共享IsActive分支选择CanProduce，非活跃继续原inventory检查。Frenzy选择kind0/future0，继续原terrain/cell/reservation与generic CanReserve；不因技能槽不合法静默创建正常Frenzy，原有slot校验仍生效。Execute读取Game.FrenzyFuseMs，kind0/pierce0/skill0；计算checked元数据后进入Frenzy Create分支，最终ordinary available只在非Frenzy扣减。
- [ ] StageAndCreate先再次检查CanProduce、generic1credit与完整元数据，Serialize并验证新row≤1024、participant总rows≤6，再保存不可重放row、LastPlacement、NextChain，随后调用CreateFromPromise。structural未知异常保留以上值。actual order初始化完整source、Frenzytrue、Standard、PhaseFuse、1.2Reader换算期限和LogicTransform；命令必须仍经world.Commands，由正式Tick发布。实际AssignedId出现后只在原row补Produced，不清信用。
- [ ] Admissions.Occupied增加 `BomberFrenzy.ReservedCount(world)`，`CreateFromPromise`承认Frenzy.HasSubmittedPromise的exacttoken，禁止empty/unregistered token。BombState.Awake与ProcessBombs前段分别ObservePublished；实体尚未live时绝不清承诺。
- [ ] 普通inventory隔离与Return接缝：

```csharp
// BomberInventory.Available现有Count谓词追加
!b.Frenzy.Value && b.Phase.Value == (int)BomberBombPhase.Fuse && !b.CapacityReturned.Value

// ReturnBombCapacity的最前面，独立于旧Life是否仍live
if (bomb.Frenzy.Value)
{
    bomb.CapacityReturned.Value = true;
    return;
}
```

primary六账用真实Fuse阶段，与CapacityReturned观察之间没有第二计数器。Native HFSM出Fuse才能退款；重复熄灭不返库存，barrel原有CapacityReturned=true仍安全。

- [ ] 正常真实矩阵：首弹、同Tick与+4Tick拒绝、+5Tick成功；blocked terrain/cell/shared总cap拒绝均不动库存/链号/LastPlacement/promise；循环实际移动到八个开放格、每次隔5Tick，累计>6且旧弹自然爆后可补、同时Fuse≤5默认；换特殊槽不改旧flag/来源、不退额外名额。
- [ ] generic总cap测试以实际live边界occupancy fixture明确来源（沿现有BomberBombCapacityTests形式），预留最后一个真实Frenzy order后同Tick第二producer拒绝；actual Tick发表后总数恰等cap，排队Destroy不立即退款，真正结构退场后准入成功。
- [ ] unknown测试必须从真实Place产生的queued EntityOrder开始：在publication前capture durable提交row和paired world，确认原世界尚无该live token；恢复该checkpoint之后不重发、不按过期/死亡释放、ordinaryTick仍占一个shared/participantcredit。若官方pairedCapture拒绝待结构的checkpoint，记录明确拒绝测试，并用明确标注的持久模型fault row测试恢复保留；不能把模型冒称 actual withheld。六unknown/historical Fuse边界fixture单列证明第七拒绝，不把正常物理峰值宣称六。
- [ ] 验证small suite无skip与普通BombPlacement/InventoryContinuity/Split/Fire/Barrel回归，保存真实来源hash与case计数，独审后窄提交。

## Task 4: 旧Life自免、恢复、损坏和下一局

**Files:** BomberFrenzy.Server.cs validators；BombSystem.ReserveBlastContacts；ParticipantState.Server hydrate；capacity BombState/world-level验证；barrel RoundTransition与Promise继承。

**Interfaces:** Consumes IsSelfImmune、Validate/HasUnpublished/ResetParticipant；Produces只针对完整SourceLife的自免与不丢失的恢复/清理。

- [ ] ReserveBlastContacts在产生damage reservation之前追加：

```csharp
if (BomberFrenzy.IsSelfImmune(bomb, player)) continue;
```

这是通用explosion/acceptedCells路径上的来源资格，不手改Health/Effect状态。barrel owner在Promise尾增来源Frenzy bool，并在Stage/ValidatePending/actualpublication初始化和比对继承它；由该生产者自己的Original证明来源，不能只看已销毁source实体缺省false。

- [ ] 自然expiry真实路径：记录实际Applied tick S，在S+115由真实Place投最后尾弹，Until=S+120；留原Life在该爆炸格，Tick到S+139，Assert健康未减、该actualbomb正常爆炸、Frenzy仍true、不是因为Protection/Bubble或range不覆盖。于邻近另一开放格投actual敌弹覆盖它，Assert真正Applied-2，证明不全免疫。不要修改FuseEnd。
- [ ] 新Life路径精确复用既有`BomberTerrainProductionTests.DelayedOriginalAfterSourceDeathKeepsOriginalAttribution`的实际Original延迟：controlled Scene在(6,1,5)作者放softbrick，旧primary经真实Place放在(5.5,1.5,5.5)，power1并朝这格传播；Native实际删砖后、Gameplay收Original之前，保存`scene.Adapter.CaptureResultCheckpoint()`，绑定新的HostVoxelWorldAdapter与同一个Native handle但暂不RestoreResultCheckpoint。敌方三次actual damage杀旧Life，`scene.TickControlled()`运输真实Successor并等新Life的Protection自然到期，将新Life移至Native已经实际清出的(6.5,1.5,5.5)。随后新accepted adapter调用`RestoreResultCheckpoint(checkpoint)`，绑定其PrepareVoxel/CommitVoxel，普通Tick交回原始Applied。完整SourceLife旧ID不等newID，Assert新Life收到Applied-2；原Lifeexpiry后免疫由前项自然尾弹证实。只推迟公开adapter的真实结果投递，不改BombState/Fuse/Source/Phase或shadow position。

实际公开适配器切换代码如下，等候阶段用真实controlled生命接力，不直接设置CurrentLife：

```csharp
var checkpoint = scene.Adapter.CaptureResultCheckpoint();
var delayed = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native))
    { World = scene.World };
using var delayBinding = VoxelGameplayBinding.Bind(scene.Manager, delayed);
scene.Manager.BindVoxelTick(delayed.PrepareVoxel, delayed.CommitVoxel);
// 运输真实Successor，请求窗口用Reader换算并保持有限。
var config = BomberConfigBinding.For(scene.World);
ulong waitEnd = checked(scene.World.Tick + Ticks.FromMilliseconds(
    checked(config.Life.RespawnMs + config.Life.ProtectionMs), config.Game.TickRateHz) + 64UL);
bool Ready() => !participant.CurrentLife.Value.IsDefault && participant.CurrentLife.Value != oldLife &&
    scene.World.IsLive(participant.CurrentLife.Value) &&
    scene.World.Get<BomberPlayerState>(participant.CurrentLife.Value).ProtectedUntilTick.Value <= scene.World.Tick;
while (scene.World.Tick < waitEnd && !Ready()) scene.TickControlled();
Assert.True(Ready());
BomberEffectIntegrationTests.Position(scene.World.Get<LogicTransform>(participant.CurrentLife.Value),
    new Vector3(6.5f, 1.5f, 5.5f));
var accepted = new HostVoxelWorldAdapter(scene.Native.NativeHandle, new VoxelFacadeNativeAbi(scene.Native))
    { World = scene.World };
accepted.RestoreResultCheckpoint(checkpoint);
using var acceptedBinding = VoxelGameplayBinding.Bind(scene.Manager, accepted);
scene.Manager.BindVoxelTick(accepted.PrepareVoxel, accepted.CommitVoxel);
scene.Manager.Tick(); scene.Manager.Tick();
Assert.Equal(4L, scene.World.Get<AttributeComponent>(participant.CurrentLife.Value)
    .GetBaseValue(BomberAttributeNames.HealthPoints));
```

预算耗尽明确Assert失败，不无限等待或隐藏skip。
- [ ] 在上述旧源处于真实pending阶段做paired capture/restore并继续actual Native回执：原源/Generation/Frenzy/剩余promise及LastPlacement字节/StateHash保持；late publication只清对应row一次、duplicate/wrong-produced/wrong-LifeGeneration拒绝，源快照不变。
- [ ] 损坏快照逐项：row第七项超过物理cap、单行UTF8>1024、token>128、invalidJSON、duplicate token、非localLife、generation0、wrongmatch、futurePlaced、overflowFuse、wrongproduced、Frenzy标记/token不成对。使用现有BomberSnapshotCorruption修改持久bytes，不修改SyncList cap头或拿构造时异常冒充hydrate拒绝；每项钉owner exception与原source checkpoint字节一致。
- [ ] round接缝：`BomberRoundTransition.Prepare(World)`与`StartNextGeneration(World,ulong)`增加`BomberFrenzy.HasUnpublished(world)`拒绝门；`ResetParticipant(World,Participant)`调用Frenzy.ResetParticipant(world,p)。Reset只在确切published已观察、无unknown之后清四active scalars，不删除未知promise，不借下一局忘债。使用同原Native完整cleanup恢复下一局，不另建规则循环。
- [ ] 窄回归、双端/browser声明校验、schema successor/history与源表Reader/export字节一致；随后Root统一主线Native全量。每组记录total/pass/fail/skip与childexit。最终独审spec/quality均通过才窄提交，不宣称完整局/M2/30分钟已过。

## 串行验证与交回

2026-10-03生产作者输入已READY，当前25个预计测试cases未编译/运行，详细状态与12份owned文件hash见 `.sdd/101-20261003-frenzy-report.md` / `frenzy-sources.json`。Root确认公开Runtime CaptureSnapshot拒绝pending creates；真实queued用例钉正确拒绝，缺publication submitted row仅作为明确corruption fixture恢复，不宣称actual unknown structural restore。第一两RED的真实证据保留，Task完成状态仍由Root在Game窗口后推进。

Root为一次验证窗口配置独立SDK NuGet/lock与完整包selection。Frenzy agent不复用另一个运行中的build输出，也不擅自启动generation。获得窗口后可以运行：

```text
dotnet build Tools/Lumio.Bomber.Gameplay.Tests/Lumio.Bomber.Gameplay.Tests.csproj --nologo
dotnet test --project Tools/Lumio.Bomber.Gameplay.Tests/Lumio.Bomber.Gameplay.Tests.csproj --no-build -- --filter-class Lumio.Bomber.Gameplay.Tests.BomberFrenzyProductionTests --minimum-expected-tests 2
node --test Tools/schema-identity-bomb-promises.test.mjs Tools/schema-identity-bomb-promises-migration.test.mjs
node eng/spec-lint.mjs
```

上述MTP filter参数先用本工程已成功的帮助/现有command口径核对，child unknownoption或zero-tests要报告并修正，不能计GREEN。完整`dotnet test LumioBomber.slnx -- --minimum-expected-tests 1`由Root控制统一验证。

交回report含：本子系统范围、完整每case记录、首次RED/最终GREEN日志、v13→v14所有声明字段与计数hash、五参数实际Reader与source hash、complete-release-06 manifest与Native哈希、owned narrow diff、共享接缝owner确认、测试total/pass/fail/skip/exit、独审报告路径、未过的实际集成门。Task状态由Root ledger推进，不提前标全目标complete。

## 计划自检

- §8.5即时全血/六秒/重复留地：Task1–2。
- §8.5标准1.2/独立库存帽/至少五Tick/累计超过六：Task3。
- ADR0048跨Life额度与不提前退款/原Life到退场自免/新Life不继承：Task3–4。
- shared live+unpublished cap/未知submit/pairedrestore/corruption/round不忘债：Task3–4。
- 无新公共Effect/wire，无第二状态机/Tick/位置真值：所有Task约束。
- Frontend表现、中央唯一发行、M2源预算和全部产品验收由完整交付相邻切片承担；本计划消费其已约定接缝，不能靠局部GREEN解除那些门。
