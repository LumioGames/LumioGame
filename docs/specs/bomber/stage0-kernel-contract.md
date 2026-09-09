# 体素炸弹人 · Stage 0 内核契约

> **状态**：已冻结 v2.0.0
> **序位 / 适用范围**：体素炸弹人 Stage 0 内核实现卡（G-1..G-7）与网络契约卡（C-1）的唯一契约来源
> **上游**：[`design.md`](design.md)（策划案）、架构仓 `LumioGameEngine` 的 `.spec/knowledge/features/` —— `bomber-slice.md` §2 / §4（第二样板）、`movement.md` §9.1、`tick.md` §4、`gas.md` M2–M5、`voxel.md` M6–M8；ADR [`0013`](../../../.spec/decisions/0013-logic-first-browser-client-no-engine.md)（逻辑先行）、[`0014`](../../../.spec/decisions/0014-bomber-v04-stage0-convergence.md)（v0.4 收敛）、[`0017`](../../../.spec/decisions/0017-bomber-explosion-and-health-model.md)（爆炸与血量模型）、[`0018`](../../../.spec/decisions/0018-bomber-k1-k2-resolution.md)（K1 / K2 关闭）、[`0021`](../../../.spec/decisions/0021-bomber-contract-v2-align-engine-second-exemplar.md)（**本版依据**：对齐架构第二样板，取代 0015 / 0016 / 0019 的对应条款）
> **冻结物**：`modules/server-gameplay/src/Lumio.Game.ServerGameplay/Bomber/Contracts/**`（不含 `generated/`），共 13 个源文件（5 Components + 5 EntityTypes + 1 Events + 2 Ports）；内容 sha256（源文件按**仓库相对路径**升序、只拼接**文件内容**后整体哈希）：`4df6bc6b3391e956b7f9d72846d96cb0dcf1ad0fbb248c3665e8d63adc839cae`（v1.3.0 为 `d16de07a…`，本版真的动了 C# 源码故重算）
>
> **v2.0.0 相对 v1.3.0 的变化**（ADR 0021）：六个环节全部改按架构第二样板重写——位置归 `LogicTransform`、属性走 `AttributeComponent` 两本账、移动 / 放弹为 `AbilityType`、爆炸 / 死亡 / 帽子 / 掉落 / 拾取为 13 相第 4 相系统、伤害为瞬时 `EffectType`、地形走引擎体素批量读写。**这是一次破坏性重冻**：`Bomber/Contracts/Commands/` 整目录删除，四个组件的位置字段与 `BomberPlayerState` 的四个单账属性字段删除，`ITerrainStore` 整节删除，冻结物 sha256 重算。逐环节对照见 §0。

## 0. 架构第二样板对照

架构仓 2026-09-05 把 `bomber-slice.md` §4 立为**以后所有战斗类 ECS / GAS 代码的标准**（第二样板），并把 v1.3.0 赖以成立的三个 Runtime 缺口全部立成了卡。v1.3.0 是照着 2026-09-04 当天的缺口**反向设计**的，与第二样板有六处结构性不同；按 v1.3.0 继续派 G-1 ~ G-7，等于在游戏仓造第二条 Tick 路径、第二份地形真值、第二份位置真值。

| 环节 | v1.3.0 怎么写 | v2 怎么写 | 引擎依赖卡 |
|---|---|---|---|
| **位置** | `BomberPlayerState` 自带 `CellX/Y/Z` + `PosMilliX/Y/Z` 六个 `Sync<int>`；炸弹 / 帽堆 / 糖果各自带 `CellX/Y/Z` | 唯一真值是实体上的 `LogicTransform`；所在格由逻辑位置**推导**（§1.2），组件不存位置 | R-00461（已在 Runtime main） |
| **属性** | `HealthPoints / BombPower / BombCapacity / SpeedTier` 四个单账 `Sync<int>` | `玩家属性 : AttributeComponent` 一处声明，生成器展开成**基础账 + 当前账**两本（§1.3） | R-00468（RT-4） |
| **技能** | 两个内部命令 DTO（移动意图 / 放弹意图），规则内核当普通函数调 | `移动技能` / `放弹技能` 两个 `AbilityType`，共享文件两端跑，准入五步，档位「逻辑预测」（§2.1） | R-00468（RT-4） |
| **系统** | 规则内核是普通函数，由 Scenario 宿主在 `WorldManager.Tick()` **前后手调** | 五个 `[System(Phase.ProcessorPlan)]` 注册进第 4 相，`WorldManager.Tick()` 是唯一路径，注册表由生成器产出（§2.2） | R-00462（RT-1） |
| **伤害** | `DamageApplied` 事件 + 服务端临时命中集合 | 瞬时 `EffectType`，只下单、提交相结算改**基础账**，击杀 = 跨零由引擎判，事件产生点改 `OnFx`（§2.3） | R-00480（RT-5） |
| **地形** | Game 自有 `ITerrainStore` + `InMemoryChunkStore`，`GetCell` / `GetColumn` / `GetBox` | 引擎体素：帧初批量读整图、帧末一批写、小地图 pin 常驻（§6） | R-00469（E7） |

**三处两边一致，不动**：炸弹实体持火焰（四臂到达长度，ADR 0017）、帽堆实体、重生。

**代码落地节奏**（ADR 0021）：本卡把**今天就能编译**的部分改到位（实体挂 `LogicTransform`、删位置字段与单账属性字段、删 DTO 目录）；依赖引擎接缝的部分（技能 / 系统 / 属性两本账 / 体素读写）在本文档**定形到签名级**，代码随批 B 的 G-1 / G-3 / G-6 在 R-00462 / R-00468 / R-00469 / R-00480 合入后落。**不建占位文件、不加 `#if` 开关、不留「Stage 2 再换实现」的替身。**

### 0.1 Runtime 接入现状

| # | 能力 | v1.3.0 结论 | v2 结论 |
|---|---|---|---|
| ① | Game 定义并注册全新 Component / EntityType / Registry | 可行 | **可行，不变**。`gen-declarations`（`LumioGameRuntime/tools/gen-declarations`）以 `--sources` / `--side` / `--namespace` / `--assembly-name` 为参数、与命名空间无关。**新增一条上游硬约束**：每个非 World 的 `[EntityType]` 必须声明 `[Has(typeof(ObserverComponent))]`，否则生成器 lint 失败（`SourceModel.cs`）；Runtime 自己的样例同此写法 |
| ② | Game 注册系统参与 Tick 编排 | 不可行，硬阻塞 | **改由 R-00462 提供**：`[System(Phase)]` / `[After]` / `[Reads]` / `[Writes]`、`GeneratedSystemRegistry`、`WorldManager.Tick()` 唯一路径。只允许标第 3 / 4 相（业务相） |
| ③ | Game 触及体素读写 | 不可行 | **改由 R-00469 提供**：帧初批量读、帧末一批写、区域 pin（§6） |
| ④ | 确定性逐 Tick 快照并哈希 | 可行 | **可行，不变**。`WorldManager.CaptureSnapshot()` 公开，返回可复制 `byte[]`；Game 自行 SHA-256 |
| ⑤ | Component 承载整张地图网格 | 不可行 | **不可行，且不再需要**——地形是体素，不进 ECS（§6） |

**复现命令**（对同级 `LumioGameRuntime` 检出，或经 `LUMIO_RUNTIME_ROOT` 指向）：

```bash
dotnet build LumioGame.sln
dotnet test  LumioGame.sln
```

> **已知坑**：本机上 `dotnet test --project ...` 可能以退出码 5 报 `Zero tests ran`。按 [`../../../.spec/knowledge/standards/testing.md`](../../../.spec/knowledge/standards/testing.md) 记录设 `DOTNET_ROOT`，或直接对已构建 dll 用 `dotnet exec`。**不得把「运行了零个测试」当成通过。**

## 1. Component 面（Server 权威，`Bomber/Contracts/Components/`）

单位纪律：**位置一律经 `LogicTransform`**，组件不存位置；时间一律 Tick（`ulong`）；**血量一律半心点**（ADR 0017，`healthPointsPerHeart = 2`）；`NetEntityId` 不满足 `Sync<T>` 的隐式约束，一律以 `*Raw` 后缀的裸 `ulong` 编码表示；属性值与修饰量一律 `long`（架构 ADR-064 第 5 条）；其余字段整数（config IntegerOnly 纪律向下游对齐）。

| Component | 挂载实体类型 | 字段 | design.md 出处 |
|---|---|---|---|
| `BomberMatchState` | `BomberWorldEntity`（World 单例） | `MatchTick:u64`、`StartTick:u64`、`EndTick:u64`、`Phase:i32`（0 Warmup/1 Running/2 Endgame/3 Settlement）、`HatKingNetEntityIdRaw:u64`（0=无帽王） | §4 / §4.1 / §13 |
| `BomberPlayerState` | `BomberPlayerEntity` | `HatCount:i32`、`RespawnAtTick:u64`、`ProtectedUntilTick:u64` | §9 / §12 |
| `BomberBombState` | `BomberBombEntity` | `OwnerNetEntityIdRaw:u64`、`FuseEndTick:u64`、`Power:i32`、`ChainId:u64`、`BombKind:i32`（0 标准/1 冰冻/2 火焰/3 穿透/4 分裂）、`PierceLayers:i32`、`ExplodedAtTick:u64`、`DangerUntilTick:u64`、`BurnUntilTick:u64`、`ReachUp/ReachDown/ReachLeft/ReachRight:i32` | §7.1 / §7.2 / §7.3 / §7.5 |
| `BomberHatPile` | `BomberHatPileEntity` | `Count:i32`、`ExpireAtTick:u64` | §9.2 |
| `BomberPickupItem` | `BomberPickupItemEntity` | `Kind:i32`（0 FirePlus/1 BombPlus/2 SpeedPlus） | §7.4 / §8.5 |

`HatCount` / `RespawnAtTick` / `ProtectedUntilTick` **不是属性**（不参与两本账、不被 Effect 修饰），继续做 `BomberPlayerState` 的普通 `Sync` 字段。

**炸弹兼任它自己的爆炸**（ADR 0017）：引信到点后不销毁，`ExplodedAtTick` 起至 `DangerUntilTick` 为火焰阶段、至 `BurnUntilTick` 为留火阶段（Stage 5），随后销毁。`Reach*` 存的是传播算完后的**实际臂长**（已含地形阻断），客户端据此直接绘制火焰。

**同弹命中记忆改为炸弹实体的普通字段**（v2）：§7.5「同一颗炸弹对同一玩家最多命中一次」的已命中集合，做成炸弹实体上的普通字段（不上网、不存档、不进 `Sync`），随炸弹销毁而消失。v1.3.0 的「落服务端临时结构」口径作废——临时结构在系统化之后没有归属。

### 1.1 实体类型（`Bomber/Contracts/EntityTypes/`）

| EntityType | 组成 |
|---|---|
| `BomberWorldEntity` | `[EntityType(Mode.CS, World = true)]` + `[Has(BomberMatchState)]` |
| `BomberPlayerEntity` | `[EntityType(Mode.CS)]` + `[Has(ObserverComponent)]` + **`[Has(LogicTransform)]`** + `[Has(BomberPlayerState)]`（+ `玩家属性` / `AbilityComponent` / `EffectComponent`，随 R-00468 / R-00480 落） |
| `BomberBombEntity` | `[EntityType(Mode.CS)]` + `[Has(ObserverComponent)]` + **`[Has(LogicTransform)]`** + `[Has(BomberBombState)]` |
| `BomberHatPileEntity` | `[EntityType(Mode.CS)]` + `[Has(ObserverComponent)]` + **`[Has(LogicTransform)]`** + `[Has(BomberHatPile)]` |
| `BomberPickupItemEntity` | `[EntityType(Mode.CS)]` + `[Has(ObserverComponent)]` + **`[Has(LogicTransform)]`** + `[Has(BomberPickupItem)]` |

World 实体不挂 `LogicTransform`（它没有位置），也不需要 `ObserverComponent`。

### 1.2 所在格怎么来（`movement.md` §9.1 第 3 条）

`LogicTransform` 的真值是 `LocalPosition` / `WorldPosition`（`Vector3`，**米，Y 轴朝上、XZ 水平**）。**格子不存字段，由逻辑位置推导**；占格与放弹中心规则归 Game，`LogicTransform` 不做吸附。本卡只定签名，函数体归 G-1：

```csharp
// Bomber/Rules/格子.cs（G-1 落地；本卡只冻结签名）
public static (int X, int Y) 所在格(in Vector3 世界位置);   // 数学 floor，负坐标不得用截断
public static Vector3 格心(int 格X, int 格Y);               // 格中心的世界位置，放弹落点用
```

**必须用数学 floor**（`MathF.Floor`），不得用 `(int)` 截断——截断在负坐标上把 −0.3 变成 0，两格并成一格。

游戏格 (X, Y) 与引擎坐标的映射照 ADR 0019 保留：**游戏 (X, Y, Z) → 引擎 (x = X, z = Y, y = Z + 1)**。Stage 0 实体恒在游戏 `Z = 0`（引擎 `y = 1`）平面上。

### 1.3 玩家属性（`AttributeComponent` 两本账）

一处声明，生成器展开成两本账（架构 `gas.md` M5、ADR-064 第 2 条；`bomber-slice.md` §4 ③）。**代码随 R-00468 落，本卡只定形**：

```csharp
// Bomber/Contracts/Components/玩家属性.cs（随 R-00468 落）
[EcsComponent]
public sealed partial class 玩家属性 : AttributeComponent
{
    public Attribute 血量 = new(初值: 6);         // 半心点；6 点 = 3 颗心
    public Attribute 火力 = new(初值: 2);         // 十字每臂格数
    public Attribute 移速 = new(初值: 3500);      // 千分格 / 秒
    public Attribute 手上炸弹数 = new(初值: 1);   // 同时在场上限
}
```

生成器逐条展开为两个字段，**Scope 由生成器定死，玩法不得自选**：

| 账 | 生成字段 | Scope | 落档 | 谁读 |
|---|---|---|---|---|
| 基础账 | `X基础` | `Scope.Owner` | `[Persist]` | 准入判定、瞬时 Effect、生死判定；只给绑定者自己——**预测世界要跑同一段准入与扣减** |
| 当前账 | `X当前` | `Scope.Aoi` | 不落档 | 表现与 AOI 内其他人；**永为推导值**，第 9 相尾按拓扑序重算一次 |

四条声明的单位与默认值与 [`design.md`](design.md) §7.1 / §12 一致，**数值归 design.md，本契约不复述来源**（见 §5 配表）。

**血量不得再挂持续修饰**（`gas.md` M3）：能被瞬时效果直接改的属性不挂 Modifier，护盾另开属性。所以血量恒有「基础 = 当前」，`死亡态 = 血量基础 ≤ 0`，不另设死亡字段。

## 2. 技能、系统与伤害

### 2.1 技能（`AbilityType`，取代 v1.3.0 的 `Commands/` DTO）

`Bomber/Contracts/Commands/` **整目录已删除**（原本放移动意图与放弹意图两个 DTO）。移动与放弹是**实体上的 GAS Ability**，共享文件两端编译、两端跑同一段代码，档位「逻辑预测」。入口一律 `Get<AbilityComponent>().Activate<T>(in T.输入)`——客户端调用即上行（生成的 ServerRpc，信封带 `sequence`），服务器在 `ApplyInputs` 相跑准入五步。**代码随 R-00468 落，本卡定形**：

| | `移动技能` | `放弹技能` |
|---|---|---|
| `TypeId` | `1` | `2` |
| 档位 | `档位.逻辑预测` | `档位.逻辑预测` |
| `消耗` | 无 | `nameof(玩家属性.手上炸弹数)`（准入第 ③ 步查基础账 ≥ 1，Commit 复查后才 −1） |
| `输入` | `struct 输入 { 方向 方向; bool 按了转弯; }` | `struct 输入 { }`（无参；落点由服务器按 §6.1「炸弹总是落在最近的合法格中心」算） |
| `可以激活吗`（准入第 ⑤ 步） | `Get<玩家属性>().血量基础 > 0`——死人不能动 | `!这格已有炸弹(Get<LogicTransform>() 的所在格)` |
| `执行` | 按 §6.1 手感规则推进 `LogicTransform` 的逻辑位置，速率取 `Get<玩家属性>().移速当前` | `World.Commands.Create<BomberBombEntity>()`，写 `BomberBombState` 的主人 / 到期帧 / 火力，位置写新实体的 `LogicTransform` |

```csharp
[AbilityType(TypeId = 1, Prediction = 档位.逻辑预测)]
public sealed partial class 移动技能 : AbilityType
{
    public struct 输入 { public 方向 方向; public bool 按了转弯; }
    public int 转角缓冲剩余帧;   // 普通字段：两端各算各的，不上网、不存档
    public override bool 可以激活吗(in 输入 输入);
    public override void 执行(in 输入 输入);
}

[AbilityType(TypeId = 2, Prediction = 档位.逻辑预测, 消耗 = nameof(玩家属性.手上炸弹数))]
public sealed partial class 放弹技能 : AbilityType
{
    public struct 输入 { }
    public override bool 可以激活吗(in 输入 _);
    public override void 执行(in 输入 _);
}
```

**`design.md` §6.1 的手感规则（转角缓冲）落为技能的普通字段**（上面的 `转角缓冲剩余帧`）：两端各算各的，不进 `Sync`、不存档。v1.3.0 把它藏在规则内核函数的局部状态里，系统化之后没有归属。

**准入失败给步序号**（`gas.md` M2）：手上炸弹数为 0 → 步序号 3（消耗）；这格已有炸弹 → 步序号 5（内容层自定义）。**两者都不扣消耗。**

**`方向` 只有四向 + 停**：v1.3.0 的移动意图 DTO 是 `(DirX, DirY)` 两个分量、八向自由组合，与 §6.1「到路口自动转」的手感规则冲突（斜向没有路口语义）。`方向` 是枚举，不是两个分量。**无垂直分量**——Stage 0 实体恒在游戏 `Z = 0`。

### 2.2 系统清单（`[System(Phase.ProcessorPlan)]`，取代宿主手调）

v1.3.0 的「规则内核由 Scenario 宿主在 `Tick()` 前后按固定顺序手调」**已作废**。五个系统注册进 13 相的**第 4 相**（`Phase.ProcessorPlan`），`WorldManager.Tick()` 是唯一路径；注册表由生成器产出（`GeneratedSystemRegistry`，R-00462 Produces），**不手写注册、不反射发现**。`ApplyInputs` 相只放技能，不放系统。

| 系统 | 相 | `[Reads]` | `[Writes]` | `[After]` | 职责 |
|---|---|---|---|---|---|
| `爆炸系统` | `ProcessorPlan` | `BomberBombState`、`LogicTransform`、`玩家属性` | `BomberBombState` | — | 帧初批量读整图 → 到期炸弹入队、连锁同帧算完 → 十字传播算四臂长度 → 命中只 `Effects.Apply<伤害>` 下单 → 软砖入写批 → 帧末一批交（§6） |
| `掉落系统` | `ProcessorPlan` | `BomberBombState` | — | `[After(爆炸系统)]` | 软砖被摧毁按 `dropRatePermille` 生成 `BomberPickupItemEntity` 结构单 |
| `帽子系统` | `ProcessorPlan` | `BomberPlayerState`、`LogicTransform` | `BomberPlayerState`、`BomberMatchState` | `[After(爆炸系统)]` | 铸帽、散落 `BomberHatPileEntity`、超时回收、退出回流、帽王判定 |
| `拾取系统` | `ProcessorPlan` | `LogicTransform`、`BomberHatPile`、`BomberPickupItem` | `BomberPlayerState` | `[After(掉落系统)]`、`[After(帽子系统)]` | 竞争判定（只成功一次）、帽堆整堆转移、糖果生效（改基础账的瞬时 Effect） |
| `死亡系统` | `ProcessorPlan` | `玩家属性`、`LogicTransform` | — | — | 读到 `血量基础 ≤ 0` 才下结构单（掉落 + `World.Commands.Destroy`）。**晚一帧**：伤害在上一帧的提交相结算，本帧才看得到 |

**顺序**：爆炸 → 掉落 / 帽子 → 拾取；死亡系统独立、天然晚一帧。同一相内顺序 = 声明序 + `[After]` 依赖声明，编译期算死、成环报错；读写集互不重叠的系统才允许并行，语义顺序不变。

**死亡为什么晚一帧**：伤害是瞬时 Effect，在 `EcsCommandBufferCommit` 相尾按单序结算基础账；死亡系统跑在业务相，本帧读到的是上一帧结算后的值。**钩子里不下结构单是 `ecs.md` §6 红线**，所以不能在 Effect 结算回调里直接销毁。20 Hz 下晚 50 ms 不可感知。

**帧计数换算**：`fuseMs` 等毫秒配表值一律经 `Ticks.FromMilliseconds(ms)` 换算（换算率 = `WorldEntity.TickRate`，R-00462 Produces），**不在玩法里手写 `ms / 50`**。

### 2.3 伤害（瞬时 `EffectType`）

```csharp
[EffectType(TypeId = 10, 瞬时 = true)]
public sealed partial class 伤害 : EffectType
{
    public struct 参数 { public long 点数; }
    public override void 应用(在 目标, in 参数 p);   // 改基础账：目标.Get<玩家属性>().血量基础 -= p.点数
}
```

- 业务相只 `Effects.Apply<伤害>(目标, new 伤害.参数 { 点数 = 2 }, 来源: 弹.主人)` **下单**，不当场改血。
- `EcsCommandBufferCommit` 相尾按单序**在结算中的基础账上**结算；**击杀 = 跨零由引擎判**——让 `血量基础` 从 `> 0` 变 `≤ 0` 的那张单是击杀单，来源即击杀者，`OnFx` 带跨零标记。
- **对基础账已 `≤ 0` 的目标，后续单一律 Rejected**——「同帧两道火只记一次击杀」靠这条，不靠玩法自己去重。
- 三糖果（火力 / 手上炸弹数 / 移速）同样是改基础账的瞬时 Effect，上限判定在准入里（G-3，随 R-00468）。

## 3. 事件（`Bomber/Contracts/Events/`）

服务器权威事件，Game 内部 DTO，经 `IBomberTelemetrySink` 落遥测（G-7），网络包络由 C-1 登记。**字段形状不变**；**产生点变了**——`DamageApplied` / `PlayerDied` 不再由规则内核直接产出，改为读 Effect 单结算的 `OnFx` 记录（R-00480 Produces）转译：击杀由 `OnFx` 的跨零标记识别，来源即下单时给的「来源」。其余事件由对应系统产出。

| 事件 | 字段 | 产生点 | design.md 出处 |
|---|---|---|---|
| `BombPlaced` | `OwnerNetEntityIdRaw, Cell, FuseEndTick, Tick` | `放弹技能.执行` | §7.1 |
| `BombExploded` | `ChainId, SourceBombOwnerNetEntityIdRaw, CellCount, Tick` | `爆炸系统` | §7.2 |
| `DamageApplied` | `VictimNetEntityIdRaw, SourceBombNetEntityIdRaw, SourceBombOwnerNetEntityIdRaw, ChainId, HealthPointsLeft, Tick` | **`OnFx` 转译** | §7.5（同一颗炸弹对同一玩家只出现一次；单位半心点） |
| `PlayerDied` | `VictimNetEntityIdRaw, KillerNetEntityIdRaw, ChainId, Cause, Cell, Tick` | **`OnFx` 跨零标记转译** | §9.1（自杀与溺死时 Killer==Victim；`Cause` 0=爆炸 1=溺水 2=燃烧） |
| `PlayerRespawned` | `NetEntityIdRaw, Cell, Tick` | `帽子系统` 之外的重生逻辑（G-1） | §12 |
| `HatPileSpawned` | `Cell, Count, ExpireAtTick, Tick` | `帽子系统` | §9.2 |
| `HatPilePicked` | `PickerNetEntityIdRaw, Count, Tick` | `拾取系统` | §9.2 |
| `HatPileExpired` | `Count, Tick` | `帽子系统` | §9.2 |
| `PickupTaken` | `PickerNetEntityIdRaw, Kind, Tick` | `拾取系统` | §7.4 |
| `HatKingChanged` | `PreviousHatKingNetEntityIdRaw, NewHatKingNetEntityIdRaw, Tick` | `帽子系统` | §9.3（0=无帽王） |
| `MatchEnded` | `Tick` | 对局阶段机（G-1） | §4.1 |

事件里的 `Cell` 是 **`BomberCell(int X, int Y)` 载荷字段**，由产生方按 §1.2 从 `LogicTransform` 推导后写入——它不是组件字段、不参与复制或存档，与「位置唯一真值是 `LogicTransform`」不冲突。v1.3.0 的三个松散 `int` 分量已收敛成一个值类型：Stage 0 实体恒在游戏 `Z = 0`，第三个分量恒为 0。

## 4. 端口（`Bomber/Contracts/Ports/`）

| 接口 | 方法 | 说明 |
|---|---|---|
| `IBomberTelemetrySink` | `Emit(string eventName, ulong tick, string payloadJson)` | G-7 实现 JSONL Sink；实现不得阻塞 Simulation Thread（须缓冲 / 批刷） |
| `IBomberRandom` | `NextInt(minInclusive, maxExclusive)`、`NextDouble()` | 确定性随机源；同一 Seed 派生的调用序列必须逐次产出相同结果，不得读取系统时钟 / GUID |

**`ITerrainStore` 已删除**（ADR 0021，取代 0016 / 0019 的接口条款）：地形不再有 Game 侧抽象，直接走引擎体素读写（§6）。`InMemoryChunkStore`、`GetCell` / `GetColumn` / `GetBox` / `ApplyBatch` 一并作废。v1.3.0 §4 那条「G-1/G-2/G-3 与 G-4 不能真正并行」的 wave 编排提醒随之失效——地形接口归引擎，不再是 Game 的 wave 依赖。

## 5. Config Schema（G-5 落地，键名与默认值冻结）

全部整数（时间用毫秒或 Tick 整数，速度用 Tier + 换算表）；来源标注见 design.md §15 数值来源纪律。**四个属性初值（`maxHealthPoints` / `initialBombPower` / `initialBombCapacity` / `speedTierToCellsPerSecond[0]`）同时是 §1.3 四条 `Attribute` 声明的初值**，两处必须一致，以本表为准。

| 键 | 类型 | 首轮默认值 | design.md 出处 |
|---|---|---|---|
| `fuseMs` | int | 2100 | §7.1（A/B：1800/2400） |
| `dangerWindowMs` | int | 400 | §7.1（ADR 0018 由区间 350–400 收敛） |
| `initialBombPower` | int | 2 | §7.1（A/B：1） |
| `initialBombCapacity` | int | 1 | §7.1（固定） |
| `speedTierToCellsPerSecond[]` | int[] | Tier0=3500（milli-格/秒） | §7.1（A/B：3300/3800） |
| `respawnMs` | int | 3000 | §12（A/B：4000） |
| `respawnProtectionMs` | int | 3000 | §12（ADR 0017 由 1500 抬到 3000；放弹即解除必须保留） |
| `hatPileExpireMs` | int | 15000 | §9.2（A/B：12000/20000） |
| `matchDurationMs` | int | 360000（6 分钟） | §4（A/B：300000/480000） |
| `inputBufferMs` | int | 125 | §6.1（ADR 0018 由区间 100–150 收敛） |
| `tickRateHz` | int | 20 | Gate 0（推断待验证） |
| `maxHealthPoints` | int | 6 | §12（ADR 0017；6 个半心点 = 3 颗心） |
| `healthPointsPerHeart` | int | 2 | §12（表现层 `hearts = floor(HealthPoints / 2)`） |
| `drownIntervalMs` | int | 1000 | §12 |
| `drownPointsPerInterval` | int | 1 | §12（1000 ms / 1 点 = 每秒 −0.5 心，满血 6 秒溺死） |
| `dropRatePermille` | int | 300 | §7.4 |
| `hatPileMinStacks` / `hatPileMaxStacks` | int | 3 / 6 | §9.2 |
| `mapSize` | int | 19 | §5（Stage 0 固定，无分区档位） |
| `coverReachCells` | int | 10 | §5.3 断言 4 |

A/B 变体文件（每个只改一键）：`fuse-1800`、`fuse-2400`、`power-1`、`speed-3300`、`speed-3800`、`respawn-4000`、`hat-expire-12000`、`hat-expire-20000`、`match-300000`、`match-480000`、`protect-1500`、`protect-2500`、`protect-4000`、`drown-2s`、`danger-300`、`danger-500`、`buffer-100`、`buffer-150`——**共 18 个**。

> 溺水速率**必须拆成间隔 + 点数两个键**：全表整数（IntegerOnly 纪律），若只留一个「每秒扣几点」的整数键，则「每 2 秒 −0.5 心」这一档改任何单键都表达不出来，而变体纪律要求「每个只改一键」。

**`tickRateHz` 与 `WorldEntity.TickRate` 是同一个数**：配表是来源，世界实体上的 `TickRate` 是运行时读取点，`Ticks.FromMilliseconds` 用它换算。不得两处各写一份。

## 6. 地形与 StateHash

### 6.1 地形走引擎体素

地形是**体素**，不是 Component、也不再有 Game 侧的 `ITerrainStore` 抽象（ADR 0021）。消费口径照架构仓 `voxel.md`：

- **帧初批量读整图**（M7a）：小地图 19×19×2 只覆盖少数 Section，一次矩形请求拿回全图照片；结果按 Section 分段带 `sectionRevision` 与四态（Ready / Unchanged / Pending / Unavailable），单次上限 262144 格。
- **区域 pin 常驻**（M8 ③a）：整张小地图声明 pin。**pin 就绪之后，落在里面的批量读与物理查询永不返回「还没到」**——爆炸结算这类同 tick 必须算完的事才挂得住。pin 有明确就绪信号，**玩法必须等信号才进场**；pin 装不下当场失败，不静默降级。
- **帧末一批写**（M6 ①a / ①c）：写条目 `{sectionKey, cellOffset, blockId, expectedSectionRevision}`，`expectedSectionRevision` 取**帧初读到的那个**；整批 all-or-nothing、幂等，上限 65536 条。同一 tick 内各系统下的单在 `VoxelCommit` 前合成一批一次提交；**同帧同格只下一条**（靠写批自身去重）。
- **帧内不提供「读到本帧已下单改动」的读法**：连锁传播在**帧初照片 + 自己的帧内工作集**上算，不回读体素。

**格值是 32 位无符号 `BlockId`** = `BlockType << 8 | BlockState`。玩法层**不得对 `BlockId` 直接做位运算**，一律走转换函数。九种方块（Air / 铁皮 / 积木 / 木箱 / 木头 / 鞭炮 / 地面 / 水 / 冰）登记进**官方全局段**（作用域位 = 0，256 起连号稠密），材质类只用 Solid 与 Liquid 两类——**目录行内容归本仓**（ADR 0019 保留）。

**「阻断爆炸」不是引擎的轴**：引擎材质类只声明 mesh / renderPass / collision / lightAttenuation 四轴，且 `Liquid.collision = passable`——**引擎的水不挡路**。水阻断爆炸、禁止放弹、溺水全是本仓配表的玩法列，读 `BlockId` 后自己判。

**坐标映射照 ADR 0019 保留**：游戏 (X, Y, Z) → 引擎 (x = X, z = Y, y = Z + 1)。地形两层：游戏 `z = -1` 地面层（地面 / 水方格 / 冰面）→ 引擎 `y = 0`；游戏 `z = 0` 砖层（Air / 铁皮 / 积木 / 木箱 / 木头 / 鞭炮）→ 引擎 `y = 1`。**爆炸传播每步要同时读两层**——水方格在地面层却要挡火；帧初的整图批量读一次覆盖两层，不需要逐格或逐列再读。

### 6.2 Scenario / 命令流 / StateHash 文件格式（G-6 落地）

三个文件，均带 `schemaVersion: 1`：

- `scenario.json`：`{schemaVersion, seed, configVersion, mapSeed, map, bots:[{name, behavior, params}], durationTicks}`。**`map` 携带地形数据本身**——地图不再每次从 `mapSeed` 重生成，否则改一行生成器代码就会让全部历史回放基线静默失效；`mapSeed` 保留作为来源记录。**`map` 的格式是「按 Section 的 `BlockId` 数组」**（v2，取代 v1.3.0 的「由 G-4 定」）：每个 Section 一条 `{sectionKey, blockIds:[4096]}`，顺序按 `cellOffset` 升序——**可直接喂 `blockWrite`**，装载时不需要转换层。须与 L1 编辑器复用同一格式（[`../ugc-ladder.md`](../ugc-ladder.md) L1）。
- `commands.ndjson`：每行 `{tick, netEntityIdRaw, ability: "移动"|"放弹", 方向?}`。**v2 改动**：命令流是 `Activate<T>` 的输入序列，不再是内部命令 DTO；`方向` 是四向枚举名，不是 `dirX` / `dirY` 两个分量。
- `statehash.ndjson`：每行 `{tick, sha256Hex}`。

**StateHash**（v2，取代 v1.3.0 的「快照 ‖ box 读结果」）：

```text
sha256Hex = SHA256( manager.CaptureSnapshot() ‖ 各 Section 的 (sectionKey, sectionRevision) 升序拼接 )
```

地形那一半改用 **Section revision**，不再是全图 `BlockId` 数组的哈希。理由：revision 是引擎权威的版本锚点，读一次批量读就随结果带回，不需要为了做哈希再拉一次全图；而 `blockWrite` 的 `expectedSectionRevision` 本就以它为准，两者同源。地形只要有一格变了，覆盖它的 Section revision 必变，哈希随之变。**位置真值已在 `LogicTransform` 里，随 `CaptureSnapshot()` 一起拍到**，不需要单独哈希。

回放 oracle 判据：两次运行的 `statehash.ndjson` 逐行相等（不得只比行数）；空文件或截断文件必须 FAIL（oracle 纪律沿用自已退役的 entity-chat harness，见 ADR 0022；判据以本节所写为准）。

## 7. 已知缺口

v1.1.0 登记的 K1 / K2 已由 ADR [0018](../../../.spec/decisions/0018-bomber-k1-k2-resolution.md) 在 v1.2.0 关闭（`DamageApplied` 补 `SourceBombNetEntityIdRaw`；`dangerWindowMs` = 400、`inputBufferMs` = 125，变体增至 18）。

**v2.0.0 当前无未决缺口。** 本版定形的四处（技能 / 系统 / 属性两本账 / 体素读写）签名取自架构仓 R-00462 / R-00468 / R-00469 / R-00480 四张卡的「接口 · Produces」，**不是自拟**；代码随那四张卡合入后由批 B 的 G-1 / G-3 / G-6 落地。这是排期，不是缺口。

## 8. 与 design.md 待验证项的对应

本契约冻结的是**类型形状**，不是数值；本文档的默认值全部来自 design.md §15「首轮可测默认值」，验证方式与阶段仍以 design.md §15 为准，不在本文档重复。
