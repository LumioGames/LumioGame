# Bomber Central Supply Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在真实服务器 World.Tick 上，每局至多一次预告并公开发行中央补给，持续持有尚未发布的物品信用，恢复和下一局均不能重复发行或删除未知债务。

**Architecture:** 独立 `ProcessorPlan` 系统在 `BombSystem` 后调用持久补给 owner；它只消费已生成的 GameRow、Native 地形批读、LogicTransform 和现有结构创建入口。发行先一次预留完整奖励，实际发布通过 Pickup 的 Awake/OnHydrate 把同一信用从 pending 转交 live；Terrain、死亡掉落与补给共用本 Tick 的位置视图。预告和开启接既有日志及 presentation journal，事件目录中的两个 Excluded 条目转为 typed。

**Tech Stack:** C# Gameplay / .NET 10 server、xUnit v3、实际 Engine SDK Native World、Runtime DeterminismContext、System.Text.Json、PowerShell 私有证据 runner。

## Global Constraints

- 生效真值为 `docs/specs/bomber/design.md` §8.6/16、`.spec/decisions/0048-bomber-m2-map-packages-and-interaction-boundaries.md` 与 `.sdd/101-20261003-central-supply-brief.md`；历史设计表的「每局1–2次」不覆盖现行每局一次。
- 「23/27默认50秒预告、60秒公开喷发一次，19官方档关闭；自定义房可显式配置开启。」
- 参数：AnnounceMs=50000、OpenMs=60000、Strengthening=5、Health=2、Frenzy=1、Special=2、GoldenHeart=1；数量非负、总数≤11、announce<open<match duration。
- 技能关闭只省略两个 Special 位，发行9件；明确强化位仅 Power/Capacity/Speed 的既有权重，不触发随机糖果位的 Kick 替换。
- Pending最多11条、UTF8≤8192；SupplyAnnouncedMatchId/SupplyIssuedMatchId 为 Room 持久字段，SupplyPending、SupplyMatchId、SupplyOrdinal 为 None 持久字段；不新增实体、组件槽或 wire。
- 「每条pending在结构创建前持久标submitted；之后只在实际匹配SupplyMatch+Ordinal的item publication/hydration观察到时移除，未知创建不超时释放、不重复提交。」
- 唯一执行路径是 WorldManager.Tick；唯一地形真值是 Native，唯一位置真值是 LogicTransform；不手调 Advance 作为玩法测试。
- Running/FinalCircle 可以新发行；Waiting/Warmup/Podium/Results 不新发行。已发行债务仍按原身份结清；未知 submitted 债务阻止下一局。
- 本轮仅写本计划。Root 的真实 Supply2 RED 与后续生产授权到达前，禁止修改生产/测试、生成声明/配置、运行 C#/Rust 构建或改预算/包06。
- Runtime 与 Client 已完成冻结保持原样；不提交、不自行打包。Root 负责独立审查、窄提交和后续完整正式包。

## 读源结论与边界

`Server/Tests/Gameplay/BomberCentralSupplyProductionTests.cs` 已有两个真实 Native 用例：自定义19/8、skills-off档在50秒预告/60秒发行9件，及默认19档关闭。此计划未执行它们；没有提前宣布 RED。`BombSystem.ExecuteCore` 已在 Tick 初始清空 producer 的 frame 状态，并完成地形 transaction、死亡/后继和拾取处理；补给系统排在它之后，不插入第二 Tick。

`BomberTerrainTransactions.Occupied` 当前计 live 加 queued 的物理占位，`PickupCells` 同时防止不同 producer 选择相同坐标。Terrain/死亡掉落创建后立即减少自己的原 pending，而 Supply 的 submitted pending 要保留到真正发布，因此不能把 Supply 的 queued 位置重复当成一份新信用。保留 Occupied 的物理意义，新增专供 admission 的信用计算；不把 Supply 混进 `Reserved` 的地形专用债务含义。

`BomberPickupItem.OnHydrate` 的 terrain early-return 当前不能验证 Supply，需要在该 early-return 前验证独立 Supply 来源。现有 `BomberBombState.Awake` 已示范实际 publication callback 形状。`BomberWorldRuntime.OnHydrate` 调用 Terrain.Validate 的位置是新增 Supply.Validate 的窄接缝。

`BomberEventCatalog` 共60项：44 Typed、14 Derived、2 Excluded（supply_announced/opened）。转换后必须是60/46/14/0；独立 pinned descriptor 测试同步指定这两个 payload，不能从生产目录反推预期。

### 文件和写域

所有下列相对路径均相对 `C:/Work/LumioGames/LumioGame/games/101-bomber/`。

| 文件 | 责任/写入者 |
|---|---|
| `Gameplay/BomberCentralSupply.Server.cs`（新） | 本执行者：持久 owner、确定性选择、Native 落点、发行与确认、无重放 |
| `Gameplay/BomberCentralSupplySystem.Server.cs`（新） | 本执行者：唯一系统入口，After BombSystem |
| `Gameplay/Components/Bomber/BomberPickupItem.Server.cs` | 本执行者与 Root 协调：只增加 Supply 来源检查/actual publication hook，保留 terrain/death 分支 |
| `Gameplay/Components/Bomber/BomberWorldRuntime.Server.cs` | 本执行者与 Root 协调：OnHydrate 中一处 Supply.Validate 调用 |
| `Gameplay/BomberTerrainTransactions.Server.cs` | 本执行者与 Root 协调：prepaid queue 标记及 fresh admission 使用同一信用公式；其余 Barrel/terrain 分支不重构 |
| `Gameplay/Events/BomberEvents.cs`、`BomberEventCatalog.cs` | 本执行者：两个 Supply payload 与两个现有目录项 |
| `Server/Tests/Gameplay/BomberCentralSupplyProductionTests.cs` | 现有 Supply2 保留；授权后增加真实 Native 边界用例及私有测试 helper |
| `Server/Tests/Gameplay/BomberEventContractTests.cs` | 授权后更新两条 pinned descriptor、计数及 payload 值断言 |
| `Gameplay/Tables/schemas/game.json`、`tables/game.txt`、`pickup_kinds` 作者源 | Root；本执行者只消费 |
| `Gameplay/Config/BomberTypedTables.cs`、所有 generated 产物 | Root 经官方 mint；本执行者只读，禁止手改 |
| `Gameplay/Config/BomberObjectBudgets.cs` | Root 已知有界来源 admission；保持 M2/Fire/Split 等未完成 producer 守卫 |
| `Gameplay/BomberRoundTransition.Server.cs` | Root指定Capacity承接atomic/Barrel4接缝：集成HasPending与实际旧Supply退休门及下一局reset；本执行者交接口和测试，不并发写 |

执行前 Root 明确上述三个共享文件的窄写域。事件源码变更需 Root/Capacity 重新正式 mint 后才能作 schema 接回证据；本执行者不重造它们。Root已确认旧Barrel执行者结束，换局接缝由Root与Capacity串行协调；下文Barrel代表该所属逻辑，不表示原执行者仍在运行。

2026-10-03预检补充：实际 `SyncList<T>` 只有Count/index等显式容器API，不实现IEnumerable；所有SyncList查询使用Count/index，不使用LINQ/Assert.Single/Assert.Empty。Root已用Count/index修复Supply2的Occurrences编译，最新测试源SHA=`2c4124da0ff04bf86c10205f3382e0995ef06f4e914ba268b994df6fad7d92e9`；它是读取时身份，真实RED/GREEN须以运行manifest记录的最新一致测试源为准，不能沿用计划之前的hash。读取时官方Reducer OperationValidation仍阻断Native启动，Supply2业务RED未到，Task4没有完成。

## 固定验证入口与证据

以下命令从 `C:/Work/LumioGames/LumioGame` 执行，只有持有 heavy 窗口的执行者运行。真实入口是 Root 新增的 `games/101-bomber/.run/run-v14-native-production.ps1`，证据目录为 `games/101-bomber/.run/v14-native-production-20261003/`。它锁 `complete-release-06/manifest.json` SHA256=`8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`，隔离 NuGet/locks/artifacts，固定单编译进程，不修改发布物。

```powershell
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Mode build -Label 'build-01'
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-red-01' -Filter '*BomberCentralSupplyProductionTests'
```

Root 提供上述原始首失败后，执行者读取 `.log/.json/.exit`：确认测试确实运行、失败位于业务预期、source hashes 与 DLL identities 匹配。若首红是配置 Reader、schema、Native admission 或编译错误，先由对应 owner 收口；不能把这些错误当 Supply2 的业务 RED。业务入口就绪后的期望为自定义发行断言失败、默认19关闭用例通过，共2项、0skip；报告仍写真实计数和 raw child exit。

授权后的代码修改需要 fresh build。每次都用新 label，绝不覆盖首 RED：

```powershell
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Mode build -Label 'supply-build-green-01'
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-green-01' -Filter '*BomberCentralSupplyProductionTests'
```

未改变原始两项测试时预期2/2、failed=0、skipped=0、raw child exit=0。随后新增用例的每一 RED/GREEN 都记录完整测试源相同 SHA；必要的机械撤回/恢复仅在本 Gameplay 候选树进行，不动 Runtime/Client 冻结或完整包。

---

### Task 1: 一次性发行和持久 publication 转交

**Files:** 新建两个 Supply 文件；修改三个共享文件的窄接缝；保留现有 `BomberCentralSupplyProductionTests.cs` 不改断言。

**Interfaces:**

```csharp
internal static void BomberCentralSupply.Advance(World world);
internal static void BomberCentralSupply.Validate(World world);
internal static int BomberCentralSupply.ReservedCount(World world);
internal static void BomberCentralSupply.ObservePublished(World world, BomberPickupItem item);
internal static bool BomberCentralSupply.HasPending(World world);
internal static void BomberCentralSupply.ValidateItem(World world, BomberPickupItem item);
internal static int BomberTerrainTransactions.PickupCreditUsage(World world);
internal static void BomberTerrainTransactions.ReservePickup(World world, (int X, int Z) cell, bool prepaid = false);
```

- [ ] **Step 1: 接收 Root 的真实 Supply2 RED 和生产授权。** 保存两项现有测试的 SHA、完整源码清单、完整06 identity、实际 DLL SHA 和首失败，不为方便改50/60秒、数量或来源断言。
- [ ] **Step 2: 在 Terrain 中区分位置和信用，保留普通调用兼容。** 增加下列成员；`BeginFrame` 的既有 clear 区紧邻清空 prepaid。`TryDestroy` 的旧 admission 条件替换为最后一段，不改构造 reward 或 receipt 分支。

```csharp
private readonly HashSet<(int X, int Z)> prepaidPickupCells = new();

// In BeginFrame, after queuedPickupCells.Clear():
frame.prepaidPickupCells.Clear();

internal static void ReservePickup(World world, (int X, int Z) cell, bool prepaid = false)
{
    BeginFrame(world);
    var frame = For(world);
    if (!frame.queuedPickupCells.Add(cell))
        throw new InvalidOperationException("Pickup destination already reserved by this Tick's producer.");
    if (prepaid) frame.prepaidPickupCells.Add(cell);
}

internal static int PickupCreditUsage(World world)
{
    BeginFrame(world);
    var frame = For(world);
    return checked(Occupied(world) - frame.retiredPickupCredits.Count - frame.prepaidPickupCells.Count +
        BomberDeathDrops.HeldOutputs(world) + BomberDeathDrops.PendingOutputs(world) +
        Reserved(world) + BomberCentralSupply.ReservedCount(world));
}

// In TryDestroy, replacing only the old credit comparison:
if (checked(PickupCreditUsage(world) + reserved) > config.ObjectBudgets.PickupCapacity)
    return false;
```

`Occupied` 与 `PickupCells` 原样保持 live+queued 的物理视图。死亡与地形 materializer 继续共享它们；只有新信用 admission 用 PickupCreditUsage。Supply 保留 pending 的 queued 是 prepaid；普通 producer 已把 pending 转入 queued 的仍按普通位置计信用。消费后 retired 扣减只跟实际 committed settlement，不能因为 Claim 请求或估计效果提前扣减。

- [ ] **Step 3: 写入持久 owner 和唯一系统。** 以下是可执行设计的完整核心；与 Root 生成后的真实 GameRow 核对名称，生产实现保持同一签名/字段/状态转移，不新增测试专用入口。

```csharp
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Primitives;
using Lumio.GameRuntime.Simulation.Determinism;

namespace Lumio.Bomber.Gameplay;

internal sealed record BomberSupplyPromise(ulong Match, int Ordinal, int Kind, uint Skill,
    ulong Occurred, bool Submitted = false, int X = -1, int Z = -1, ulong SpawnTick = 0);

internal static class BomberCentralSupply
{
    internal const int MaximumRows = 11;
    internal const int MaximumBytes = 8192;
    private static readonly string[] SpecialNames =
        { "fireBomb", "freezeBomb", "remoteBomb", "splitBomb", "pierceBomb", "toxinBomb" };
    private static readonly string[] PropertyNames =
        { "Match", "Ordinal", "Kind", "Skill", "Occurred", "Submitted", "X", "Z", "SpawnTick" };

    internal static string Encode(BomberSupplyPromise[] rows)
    {
        if (rows.Length > MaximumRows) throw new InvalidOperationException("Supply exceeds its row budget.");
        if (rows.Length == 0) return "";
        string json = JsonSerializer.Serialize(rows);
        if (Encoding.UTF8.GetByteCount(json) > MaximumBytes)
            throw new InvalidOperationException("Supply exceeds its byte budget.");
        return json;
    }

    internal static BomberSupplyPromise[] Decode(string json)
    {
        if (json == "") return Array.Empty<BomberSupplyPromise>();
        if (Encoding.UTF8.GetByteCount(json) > MaximumBytes)
            throw new InvalidOperationException("Supply exceeds its byte budget.");
        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Array ||
                document.RootElement.GetArrayLength() is < 1 or > MaximumRows)
                throw new InvalidOperationException("Supply has invalid row memory.");
            foreach (var row in document.RootElement.EnumerateArray())
            {
                if (row.ValueKind != JsonValueKind.Object)
                    throw new InvalidOperationException("Supply row is not an object.");
                var names = row.EnumerateObject().Select(p => p.Name).ToArray();
                if (names.Length != PropertyNames.Length ||
                    !names.OrderBy(n => n, StringComparer.Ordinal).SequenceEqual(
                        PropertyNames.OrderBy(n => n, StringComparer.Ordinal)))
                    throw new InvalidOperationException("Supply row has missing, extra or duplicate fields.");
            }
            return JsonSerializer.Deserialize<BomberSupplyPromise[]>(json) ??
                throw new InvalidOperationException("Supply has invalid row memory.");
        }
        catch (JsonException error) { throw new InvalidOperationException("Supply has invalid JSON memory.", error); }
    }

    private static int Count(IBomberConfig config) => checked(config.Game.CentralSupplyStrengtheningCount +
        config.Game.CentralSupplyHealthCount + config.Game.CentralSupplyFrenzyCount +
        (config.Game.SkillsEnabled ? config.Game.CentralSupplySpecialCount : 0) +
        config.Game.CentralSupplyGoldenHeartCount);

    private static int KindAt(IBomberConfig config, int ordinal)
    {
        if (ordinal < config.Game.CentralSupplyStrengtheningCount) return -1;
        ordinal -= config.Game.CentralSupplyStrengtheningCount;
        if (ordinal < config.Game.CentralSupplyHealthCount) return (int)BomberPickupKind.Health;
        ordinal -= config.Game.CentralSupplyHealthCount;
        if (ordinal < config.Game.CentralSupplyFrenzyCount) return (int)BomberPickupKind.Frenzy;
        ordinal -= config.Game.CentralSupplyFrenzyCount;
        int special = config.Game.SkillsEnabled ? config.Game.CentralSupplySpecialCount : 0;
        if (ordinal < special) return (int)BomberPickupKind.Skill;
        return (int)BomberPickupKind.GoldenHeart;
    }

    private static bool ValidContent(IBomberConfig config, int ordinal, int kind, uint skill)
    {
        int expected = KindAt(config, ordinal);
        if ((expected == -1 ? kind is not (0 or 1 or 2) : kind != expected) ||
            !config.Tables.PickupKinds.Rows.Any(r => r.KindCode == kind)) return false;
        if (kind != (int)BomberPickupKind.Skill) return skill == 0;
        return config.Tables.Skills.Rows.Any(r => r.Id == skill && SpecialNames.Contains(r.Name) &&
            config.Tables.BombKinds.Rows.Any(b => b.KindCode == r.BombKindCode && b.Enabled));
    }

    internal static void Validate(World world)
    {
        var runtime = world.Single<BomberWorldRuntime>();
        var match = world.Single<BomberMatchState>();
        var config = BomberConfigBinding.For(world);
        int expected = Count(config);
        var rows = Decode(runtime.SupplyPending.Value);
        ulong announce = checked(match.StartTick.Value +
            Ticks.FromMilliseconds(config.Game.CentralSupplyAnnounceMs, config.Game.TickRateHz));
        ulong open = checked(match.StartTick.Value +
            Ticks.FromMilliseconds(config.Game.CentralSupplyOpenMs, config.Game.TickRateHz));
        if (expected is < 0 or > MaximumRows ||
            (runtime.SupplyAnnouncedMatchId.Value != 0 && runtime.SupplyAnnouncedMatchId.Value != match.MatchId.Value) ||
            (runtime.SupplyIssuedMatchId.Value != 0 && runtime.SupplyIssuedMatchId.Value != match.MatchId.Value) ||
            (runtime.SupplyAnnouncedMatchId.Value != 0 && world.Tick < announce) ||
            (runtime.SupplyIssuedMatchId.Value != 0 && (world.Tick < open ||
                runtime.SupplyAnnouncedMatchId.Value != runtime.SupplyIssuedMatchId.Value)) ||
            (!config.Game.CentralSupplyEnabled && (runtime.SupplyAnnouncedMatchId.Value != 0 ||
                runtime.SupplyIssuedMatchId.Value != 0 || rows.Length != 0)) ||
            rows.Length > expected || rows.Select(r => r.Ordinal).Distinct().Count() != rows.Length)
            throw new InvalidOperationException("Supply generation or count is invalid.");
        foreach (var row in rows)
            if (row.Match == 0 || row.Match != match.MatchId.Value || row.Match != runtime.SupplyIssuedMatchId.Value ||
                runtime.SupplyAnnouncedMatchId.Value != row.Match || row.Ordinal < 0 || row.Ordinal >= expected ||
                row.Occurred < open || row.Occurred > world.Tick || !ValidContent(config, row.Ordinal, row.Kind, row.Skill) ||
                (row.Submitted ? row.X < 0 || row.X >= config.Map.Width || row.Z < 0 || row.Z >= config.Map.Depth ||
                    row.SpawnTick < row.Occurred || row.SpawnTick > world.Tick : row.X != -1 || row.Z != -1 || row.SpawnTick != 0))
                throw new InvalidOperationException("Supply promise has invalid exact provenance.");
        foreach (var group in world.Each<BomberPickupItem>().Where(p => world.IsLive(p.Entity) && p.SupplyMatchId.Value != 0)
            .GroupBy(p => (p.SupplyMatchId.Value, p.SupplyOrdinal.Value)))
        {
            if (group.Count() != 1) throw new InvalidOperationException("Supply has duplicate live publication identities.");
            ValidateItem(world, group.Single());
        }
    }

    internal static void ValidateItem(World world, BomberPickupItem item)
    {
        if (item.SupplyMatchId.Value == 0)
        {
            if (item.SupplyOrdinal.Value != -1) throw new InvalidOperationException("Pickup has partial supply provenance.");
            return;
        }
        var match = world.Single<BomberMatchState>();
        var runtime = world.Single<BomberWorldRuntime>();
        var config = BomberConfigBinding.For(world);
        if (!config.Game.CentralSupplyEnabled || item.SupplyMatchId.Value != match.MatchId.Value ||
            item.SupplyMatchId.Value != runtime.SupplyIssuedMatchId.Value ||
            item.SupplyOrdinal.Value < 0 || item.SupplyOrdinal.Value >= Count(config) ||
            !ValidContent(config, item.SupplyOrdinal.Value, item.Kind.Value, item.SkillId.Value) ||
            item.SkillLevel.Value != (item.SkillId.Value == 0 ? 0 : 1) ||
            item.ComboSourceA.Value != 0 || item.ComboSourceB.Value != 0 || item.ComboLevelA.Value != 0 || item.ComboLevelB.Value != 0 ||
            !item.DroppedBy.Value.IsDefault || item.DropMatchId.Value != 0 || !item.DropParticipant.Value.IsDefault ||
            item.DropLifeGeneration.Value != 0 || item.DropOccurrenceTick.Value != 0 || item.ProtectedUntilTick.Value != 0 ||
            item.TerrainTransaction.Value != "" || !item.TerrainSourceBomb.Value.IsDefault ||
            !item.TerrainSourceFamily.Value.IsDefault || item.TerrainOrdinal.Value != 0 ||
            !item.ExcludedLife.Value.IsDefault || item.ExcludedLifeGeneration.Value != 0 ||
            item.SpawnTick.Value < checked(match.StartTick.Value + Ticks.FromMilliseconds(
                config.Game.CentralSupplyOpenMs, config.Game.TickRateHz)) || item.SpawnTick.Value > world.Tick)
            throw new InvalidOperationException("Supply pickup has invalid or mixed source provenance.");
    }

    private static bool Matches(World world, BomberSupplyPromise row, BomberPickupItem item)
    {
        if (!world.IsLive(item.Entity) || item.SupplyMatchId.Value != row.Match || item.SupplyOrdinal.Value != row.Ordinal) return false;
        ValidateItem(world, item);
        var position = world.Get<LogicTransform>(item.Entity).LocalPosition;
        if (!row.Submitted || item.Kind.Value != row.Kind || item.SkillId.Value != row.Skill ||
            item.SpawnTick.Value != row.SpawnTick || BomberMatchRules.CellX(position) != row.X || BomberMatchRules.CellZ(position) != row.Z)
            throw new InvalidOperationException("Supply publication does not match its submitted promise.");
        return true;
    }

    internal static bool HasPending(World world) => Decode(world.Single<BomberWorldRuntime>().SupplyPending.Value).Length != 0;

    internal static int ReservedCount(World world)
    {
        var items = world.Each<BomberPickupItem>().Where(p => world.IsLive(p.Entity)).ToArray();
        return Decode(world.Single<BomberWorldRuntime>().SupplyPending.Value).Count(row => !items.Any(item => Matches(world, row, item)));
    }

    internal static void ObservePublished(World world, BomberPickupItem item)
    {
        if (!world.IsLive(item.Entity) || item.SupplyMatchId.Value == 0) return;
        ValidateItem(world, item);
        if (world.Each<BomberPickupItem>().Any(other => world.IsLive(other.Entity) && other.Entity != item.Entity &&
            other.SupplyMatchId.Value == item.SupplyMatchId.Value && other.SupplyOrdinal.Value == item.SupplyOrdinal.Value))
            throw new InvalidOperationException("Supply has duplicate live publication identities.");
        var runtime = world.Single<BomberWorldRuntime>();
        var rows = Decode(runtime.SupplyPending.Value);
        var remaining = rows.Where(row => !Matches(world, row, item)).ToArray();
        if (remaining.Length != rows.Length) runtime.SupplyPending.Value = Encode(remaining);
    }

    private static BomberSupplyPromise[] Select(World world, ulong logicalOpenTick)
    {
        var config = BomberConfigBinding.For(world);
        var match = world.Single<BomberMatchState>();
        var rng = new DeterminismContext(match.Seed.Value, logicalOpenTick, RuntimeSchema.SchemaEpoch)
            .OpenRngStream("bomber.central-supply");
        var rows = new List<BomberSupplyPromise>(Count(config));
        void Add(int kind, uint skill = 0) => rows.Add(new(match.MatchId.Value, rows.Count, kind, skill, world.Tick));
        var reinforcement = config.Tables.PickupKinds.Rows.Where(r => r.KindCode is 0 or 1 or 2)
            .OrderBy(r => r.Id).ToArray();
        int weight = reinforcement.Sum(r => r.SoftWeight);
        if (reinforcement.Length != 3 || weight <= 0 || reinforcement.Any(r => r.SoftWeight < 0))
            throw new InvalidOperationException("Supply reinforcement has invalid configured weights.");
        for (int i = 0; i < config.Game.CentralSupplyStrengtheningCount; i++)
        {
            int choice = checked((int)(rng.NextUInt32() % (uint)weight));
            foreach (var row in reinforcement)
                if (choice < row.SoftWeight) { Add(checked((int)row.KindCode)); break; }
                else choice -= row.SoftWeight;
        }
        for (int i = 0; i < config.Game.CentralSupplyHealthCount; i++) Add((int)BomberPickupKind.Health);
        for (int i = 0; i < config.Game.CentralSupplyFrenzyCount; i++) Add((int)BomberPickupKind.Frenzy);
        if (config.Game.SkillsEnabled)
        {
            var pool = SpecialNames.Select(n => config.Tables.Skills.Rows.Single(r => r.Name == n)).OrderBy(r => r.Id).ToArray();
            for (int i = 0; i < config.Game.CentralSupplySpecialCount; i++)
                Add((int)BomberPickupKind.Skill, pool[rng.NextUInt32() % (uint)pool.Length].Id);
        }
        for (int i = 0; i < config.Game.CentralSupplyGoldenHeartCount; i++) Add((int)BomberPickupKind.GoldenHeart);
        return rows.ToArray();
    }

    private static void Emit(World world, string kind, int count, ulong open)
    {
        var config = BomberConfigBinding.For(world);
        ulong match = world.Single<BomberMatchState>().MatchId.Value;
        ulong sequence = BomberMatchRules.Emit(world, kind, match, FormattableString.Invariant($"issuedCount={count} openTick={open}"));
        world.Single<BomberPresentationJournal>().Append(world, kind, match, sequence,
            x: config.Map.Width / 2, z: config.Map.Depth / 2, data: new Dictionary<string, string>
            {
                ["issuedCount"] = count.ToString(CultureInfo.InvariantCulture),
                ["openTick"] = open.ToString(CultureInfo.InvariantCulture),
        }, occurredTick: world.Tick);
    }

    private static bool PendingBombAt(BomberWorldRuntime runtime, ulong tick, ulong match, int cell)
    {
        if (runtime.BombPlacementTick.Value != tick || runtime.BombPlacementMatchId.Value != match) return false;
        for (int i = 0; i < runtime.BombPlacementCells.Count; i++)
            if (runtime.BombPlacementCells[i] == cell) return true;
        return false;
    }

    internal static void Advance(World world)
    {
        Validate(world);
        foreach (var item in world.Each<BomberPickupItem>().Where(p => world.IsLive(p.Entity)).ToArray()) ObservePublished(world, item);
        var config = BomberConfigBinding.For(world);
        var match = world.Single<BomberMatchState>();
        var runtime = world.Single<BomberWorldRuntime>();
        if (!config.Game.CentralSupplyEnabled || match.MatchId.Value == 0) return;
        var phase = (BomberMatchPhase)match.Phase.Value;
        bool canIssue = phase is BomberMatchPhase.Running or BomberMatchPhase.FinalCircle;
        ulong announce = checked(match.StartTick.Value + Ticks.FromMilliseconds(config.Game.CentralSupplyAnnounceMs, config.Game.TickRateHz));
        ulong open = checked(match.StartTick.Value + Ticks.FromMilliseconds(config.Game.CentralSupplyOpenMs, config.Game.TickRateHz));
        if (canIssue && world.Tick >= announce && runtime.SupplyAnnouncedMatchId.Value != match.MatchId.Value)
        {
            runtime.SupplyAnnouncedMatchId.Value = match.MatchId.Value;
            Emit(world, "supply_announced", 0, open);
        }
        if (canIssue && world.Tick >= open && runtime.SupplyIssuedMatchId.Value != match.MatchId.Value)
        {
            int count = Count(config);
            if (checked(BomberTerrainTransactions.PickupCreditUsage(world) + count) > config.ObjectBudgets.PickupCapacity) return;
            string selected = Encode(Select(world, open));
            runtime.SupplyPending.Value = selected;
            runtime.SupplyIssuedMatchId.Value = match.MatchId.Value;
            Emit(world, "supply_opened", count, open);
        }
        // Requires Barrel's Prepare HasPending gate before the post-results exception is integrated.
        if (!BomberRoundTransition.CanMaterializePendingWealth(world) &&
            !(phase == BomberMatchPhase.Results && HasPending(world))) return;
        var rows = Decode(runtime.SupplyPending.Value);
        var occupied = BomberTerrainTransactions.PickupCells(world);
        foreach (var row in rows.OrderBy(r => r.Ordinal).ToArray())
        {
            if (row.Submitted) continue;
            (int X, int Z)? at = null;
            foreach (var cell in Enumerable.Range(0, checked(config.Map.Width * config.Map.Depth))
                .Select(i => (X: i % config.Map.Width, Z: i / config.Map.Width))
                .OrderBy(c => Math.Abs(c.X - config.Map.Width / 2) + Math.Abs(c.Z - config.Map.Depth / 2))
                .ThenBy(c => c.Z).ThenBy(c => c.X))
            {
                int index = checked(cell.Z * config.Map.Width + cell.X);
                if (occupied.Contains(cell) || !PlaceBombAbility.IsPlacableTerrain(world, cell.X, cell.Z) ||
                    BomberMatchRules.FindBombAt(world, cell.X, cell.Z) is not null ||
                    PendingBombAt(runtime, world.Tick, match.MatchId.Value, index)) continue;
                at = cell; break;
            }
            if (at is not { } destination) continue;
            var submitted = row with { Submitted = true, X = destination.X, Z = destination.Z, SpawnTick = world.Tick };
            rows = rows.Select(r => r.Ordinal == row.Ordinal ? submitted : r).ToArray();
            string encoded = Encode(rows);
            BomberTerrainTransactions.ReservePickup(world, destination, prepaid: true);
            runtime.SupplyPending.Value = encoded;
            var order = world.Commands.Create<BomberPickupItemEntity>();
            var item = order.Get<BomberPickupItem>();
            item.Kind.Value = row.Kind; item.SkillId.Value = row.Skill; item.SkillLevel.Value = row.Skill == 0 ? 0 : 1;
            item.SupplyMatchId.Value = row.Match; item.SupplyOrdinal.Value = row.Ordinal; item.SpawnTick.Value = world.Tick;
            EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition",
                FormattableString.Invariant($"{destination.X + 0.5f:R},{config.Map.ObstacleLayer + 0.5f:R},{destination.Z + 0.5f:R}"), silent: true);
            occupied.Add(destination);
        }
    }
}
```

系统文件的完整内容：

```csharp
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Primitives;
namespace Lumio.Bomber.Gameplay;
[System(TickPhase.ProcessorPlan)]
[After(typeof(BombSystem))]
public sealed class BomberCentralSupplySystem : EcsSystem
{
    public override void Execute(World world) => BomberCentralSupply.Advance(world);
}
```

- [ ] **Step 4: 接真正发布/恢复 hook，不以 AssignedId 当 published。** Pickup 的 existing terrain 校验原样保留。新增 Awake；OnHydrate 第一行 ValidateItem，原方法完成后调用 ObservePublished。为避免 terrain 分支的 early-return 跳过确认，把原方法抽成 `ValidateTerrainProvenance` 后用完整 wrapper；只移动既有方法体，不重写其语义。

```csharp
protected override void Awake()
{
    BomberCentralSupply.ValidateItem(World, this);
    BomberCentralSupply.ObservePublished(World, this);
}

protected override void OnHydrate()
{
    BomberCentralSupply.ValidateItem(World, this);
    ValidateTerrainProvenance();
    BomberCentralSupply.ObservePublished(World, this);
}

// Existing OnHydrate body is retained byte-for-byte inside this renamed method:
private void ValidateTerrainProvenance()
{
    if (TerrainTransaction.Value == "")
    {
        if (!TerrainSourceBomb.Value.IsDefault || !TerrainSourceFamily.Value.IsDefault || TerrainOrdinal.Value != 0)
            throw new InvalidOperationException("Pickup has a partial terrain provenance.");
        return;
    }
    var config = BomberConfigBinding.For(World);
    foreach (var id in new[] { TerrainSourceBomb.Value, TerrainSourceFamily.Value, DroppedBy.Value, DropParticipant.Value })
        if (id.IsDefault || id.Counter == 0 || id.InstanceId != World.InstanceId)
            throw new InvalidOperationException("Terrain pickup requires complete local source identities.");
    if (Encoding.UTF8.GetByteCount(TerrainTransaction.Value) > World.Manager.IngressBudget.MaxBytes ||
        TerrainOrdinal.Value is < 0 or >= BomberTerrainTransactions.MaxDestructions * 4 ||
        DropMatchId.Value == 0 || DropMatchId.Value != World.Single<BomberMatchState>().MatchId.Value ||
        DropLifeGeneration.Value == 0 || DropOccurrenceTick.Value > SpawnTick.Value || SpawnTick.Value > World.Tick ||
        !config.Tables.PickupKinds.Rows.Any(r => r.KindCode == Kind.Value) ||
        ((Kind.Value == (int)BomberPickupKind.Skill) != (SkillId.Value != 0)) ||
        (SkillId.Value != 0 && !config.Tables.Skills.Rows.Any(r => r.Id == SkillId.Value)))
        throw new InvalidOperationException("Terrain pickup has invalid receipt, content or occurrence provenance.");
}
```

在 WorldRuntime.OnHydrate 的 `BomberTerrainTransactions.Validate(World);` 紧后增加：

```csharp
BomberCentralSupply.Validate(World);
```

确认 hydrate 调用顺序以真实 paired restore 用例证明。Validate 允许匹配 submitted 与实际 live 行短暂并存；ReservedCount 对实际精确匹配行不重复计信用，ObservePublished 才删除持久行。错误 Kind/Skill/SpawnTick/坐标必须拒绝，不能只看分配 ID 或存在相同 ordinal。

- [ ] **Step 5: fresh build 并运行原 Supply2 GREEN。** 执行固定入口的 supply-build-green-01/supply-green-01；期望2/2且0skip，并核对 actual9个 live、9个 distinct ordinal、pending为空和单次事件。
- [ ] **Step 6: 暂存独立审查交付，不提交。** Root 审核心 source diff、两个 hook 与信用公式，记录 source/DLL hashes；后续 Task 的测试变更不能篡改本次原始 RED/GREEN。

### Task 2: 缺落点、恢复、未知提交与强校验回归

**Files:** 授权后仅扩展 `Server/Tests/Gameplay/BomberCentralSupplyProductionTests.cs`；若真实 RED 暴露 Task1实现问题，定位后仅修其所属 source，分别冻结。

**Interfaces:** 消费 Task1 的5个 owner 接口和生产 Encode/Decode（并非 test-only）；测试使用 Scene.Write 的实际 Native commit、WorldPersistenceSubsystem.Capture、Engine SDK CreateWorld 的 paired Snapshot+VoxelSnapshot。新增 private helper 全部留在本测试类，不修改通用 BomberTestWorld。

- [ ] **Step 1: 增加缺落点与恢复正向测试。** 在原测试类中增加下列完整代码和 using `System.IO`、`Lumio.Engine.SDK`、`Lumio.GameRuntime.Hosting`、`Lumio.GameRuntime.Persistence`、`Lumio.GameRuntime.Simulation`。OpenPlaza/Occurrences 使用本文件已有 private helper。

```csharp
private static void SealInterior(BomberTerrainProductionTests.Scene scene)
{
    var map = BomberConfigBinding.For(scene.World).Map;
    for (int z = map.BoundaryCells; z < map.Depth - map.BoundaryCells; z++)
    for (int x = map.BoundaryCells; x < map.Width - map.BoundaryCells; x++)
        scene.Write(x, map.ObstacleLayer, z, 1024u << 8);
}

private static void ReachOpening(BomberTerrainProductionTests.Scene scene)
{
    var game = BomberConfigBinding.For(scene.World).Game;
    ulong open = checked(scene.World.Single<BomberMatchState>().StartTick.Value +
        Ticks.FromMilliseconds(game.CentralSupplyOpenMs, game.TickRateHz));
    while (scene.World.Tick < open) scene.Manager.Tick();
    scene.Manager.Tick();
}

private static WorldManager RestorePairedWithConfig(BomberTerrainProductionTests.Scene scene, string configDirectory)
{
    Assert.True(scene.World.TryGetService<WorldPersistenceSubsystem>(out var persistence));
    var capture = persistence!.Capture();
    Assert.True(capture.Succeeded, capture.ErrorCode);
    var checkpoint = capture.Checkpoint!.Value;
    return BomberWorldNativeFixture.Engine.CreateWorld(new WorldCreationOptions(GeneratedRegistry.Instance)
    {
        InstanceId = 1, Config = BomberConfigBinding.Load(configDirectory),
        Catalog = File.ReadAllBytes(Path.Combine(Lumio.Bomber.Tests.EngineRelease.RepoRoot,
            "Server", "Assets", "Maps", "official-catalog.json")),
        Snapshot = checkpoint.Runtime, VoxelSnapshot = checkpoint.Voxel,
        Subsystems = new IWorldSubsystem[] { new WorldPersistenceSubsystem() },
    });
}

[Fact]
public void NoNativeDestinationRetainsTheExactNinePromisesThenPublishesOnce()
{
    using var config = new BomberObjectBudgetTests.AuthoredFixture(
        ("game", "default", "central_supply_enabled", "true"),
        ("game", "default", "skills_enabled", "false"));
    using var scene = new BomberTerrainProductionTests.Scene(0, configDirectory: config.Compile());
    SealInterior(scene);
    ReachOpening(scene);
    var runtime = scene.World.Single<BomberWorldRuntime>();
    var selected = BomberCentralSupply.Decode(runtime.SupplyPending.Value);
    Assert.Equal(9, selected.Length);
    Assert.All(selected, row => Assert.False(row.Submitted));
    Assert.Empty(scene.World.Each<BomberPickupItem>());
    Assert.Equal(9, BomberCentralSupply.ReservedCount(scene.World));
    for (int i = 0; i < 10; i++) scene.Manager.Tick();
    Assert.Equal(selected, BomberCentralSupply.Decode(runtime.SupplyPending.Value));
    OpenPlaza(scene);
    scene.Manager.Tick();
    var items = scene.World.Each<BomberPickupItem>().Where(p => scene.World.IsLive(p.Entity)).ToArray();
    Assert.Equal(9, items.Length);
    foreach (var row in selected)
    {
        var item = Assert.Single(items, p => p.SupplyMatchId.Value == row.Match && p.SupplyOrdinal.Value == row.Ordinal);
        Assert.Equal(row.Kind, item.Kind.Value); Assert.Equal(row.Skill, item.SkillId.Value);
        Assert.True(item.SpawnTick.Value >= row.Occurred);
    }
    Assert.Equal("", runtime.SupplyPending.Value);
    Assert.Equal(1, Occurrences(scene.World, "supply_opened"));
}

[Fact]
public void PairedCheckpointKeepsUnpublishedSupplySelectionWithoutDrawingAgain()
{
    using var config = new BomberObjectBudgetTests.AuthoredFixture(
        ("game", "default", "central_supply_enabled", "true"),
        ("game", "default", "skills_enabled", "false"));
    string directory = config.Compile();
    using var scene = new BomberTerrainProductionTests.Scene(0, configDirectory: directory, persistence: true);
    SealInterior(scene);
    ReachOpening(scene);
    string before = scene.World.Single<BomberWorldRuntime>().SupplyPending.Value;
    Assert.Equal(9, BomberCentralSupply.Decode(before).Length);
    using var restored = RestorePairedWithConfig(scene, directory);
    Assert.Equal(WorldRestoreCompletion.PairedCheckpoint, restored.CompletedRestore);
    Assert.Equal(before, restored.World.Single<BomberWorldRuntime>().SupplyPending.Value);
    for (int i = 0; i < 10; i++) restored.Tick();
    Assert.Equal(before, restored.World.Single<BomberWorldRuntime>().SupplyPending.Value);
    Assert.Empty(restored.World.Each<BomberPickupItem>());
    Assert.Equal(1, Occurrences(restored.World, "supply_opened"));
}

[Fact]
public void SubmittedUnknownPromiseSurvivesPairedRestoreWithoutResubmission()
{
    using var config = new BomberObjectBudgetTests.AuthoredFixture(
        ("game", "default", "central_supply_enabled", "true"),
        ("game", "default", "skills_enabled", "false"));
    string directory = config.Compile();
    using var scene = new BomberTerrainProductionTests.Scene(0, configDirectory: directory, persistence: true);
    SealInterior(scene);
    ReachOpening(scene);
    var runtime = scene.World.Single<BomberWorldRuntime>();
    var rows = BomberCentralSupply.Decode(runtime.SupplyPending.Value);
    rows[0] = rows[0] with { Submitted = true, X = 9, Z = 9, SpawnTick = scene.World.Tick };
    string unknown = BomberCentralSupply.Encode(rows);
    runtime.SupplyPending.Value = unknown;
    using var restored = RestorePairedWithConfig(scene, directory);
    for (int i = 0; i < 20; i++) restored.Tick();
    Assert.Equal(unknown, restored.World.Single<BomberWorldRuntime>().SupplyPending.Value);
    Assert.Equal(9, BomberCentralSupply.ReservedCount(restored.World));
    Assert.True(BomberCentralSupply.HasPending(restored.World));
    Assert.Empty(restored.World.Each<BomberPickupItem>());
}
```

unknown 用例明确是强制构造的有效 submitted checkpoint 状态，验证 owner 的 no-replay 守卫；不能将其报告成已捕获真实 Commands.Create 异常。真正 publication 正向来自首个用例的 WorldManager.Tick，不能用直接调用 ObservePublished 或伪造返回值代替。

- [ ] **Step 2: 增加强校验表驱动测试。** 每行使用实际已有 pending 后仅损坏对应字段，再经真实 owner hydrate 校验；不得删断言以兼容损坏数据。记录运行时 Native 和源码身份与父实验一致。

```csharp
[Theory]
[InlineData("invalid-json")]
[InlineData("too-many")]
[InlineData("duplicate-ordinal")]
[InlineData("wrong-match")]
[InlineData("future-occurrence")]
[InlineData("unsubmitted-position")]
[InlineData("wrong-kind")]
[InlineData("missing-field")]
[InlineData("utf8-over-budget")]
public void HydrationRejectsCorruptSupplyMemory(string corruption)
{
    using var config = new BomberObjectBudgetTests.AuthoredFixture(
        ("game", "default", "central_supply_enabled", "true"),
        ("game", "default", "skills_enabled", "false"));
    string directory = config.Compile();
    using var scene = new BomberTerrainProductionTests.Scene(0, configDirectory: directory);
    SealInterior(scene); ReachOpening(scene);
    var runtime = scene.World.Single<BomberWorldRuntime>();
    var rows = BomberCentralSupply.Decode(runtime.SupplyPending.Value);
    string damaged = corruption switch
    {
        "invalid-json" => "[",
        "too-many" => JsonSerializer.Serialize(Enumerable.Repeat(rows[0], 12).ToArray()),
        "duplicate-ordinal" => JsonSerializer.Serialize(new[] { rows[0], rows[0] }),
        "wrong-match" => JsonSerializer.Serialize(new[] { rows[0] with { Match = rows[0].Match + 1 } }),
        "future-occurrence" => JsonSerializer.Serialize(new[] { rows[0] with { Occurred = scene.World.Tick + 1 } }),
        "unsubmitted-position" => JsonSerializer.Serialize(new[] { rows[0] with { X = 9 } }),
        "wrong-kind" => JsonSerializer.Serialize(new[] { rows[0] with { Kind = (int)BomberPickupKind.Health } }),
        "missing-field" => "[{\"Match\":1}]",
        "utf8-over-budget" => new string('é', 4097),
        _ => throw new InvalidOperationException("Unlisted corruption."),
    };
    runtime.SupplyPending.Value = damaged;
    byte[] snapshot = scene.Manager.CaptureSnapshot();
    var error = BomberTestWorld.AssertOwnerFailure<InvalidOperationException>(() =>
        BomberTestWorld.Restore(snapshot, GeneratedRegistry.Instance, config: BomberConfigBinding.Load(directory)));
    if (corruption == "utf8-over-budget") Assert.Contains("byte budget", error.Message);
}
```

这组 RuntimeOnlySnapshot 测试只证明拒绝 hydration，正向恢复仍必须使用 paired checkpoint。8192 边界另加纯 codec 断言，证明按 UTF8 byte 而非 .NET char 计数：

```csharp
[Fact]
public void SupplyCodecUsesUtf8ByteBudgetAndAcceptsTheExactBoundary()
{
    var row = new BomberSupplyPromise(1, 0, 0, 0, 1200);
    string json = BomberCentralSupply.Encode(new[] { row });
    int bytes = System.Text.Encoding.UTF8.GetByteCount(json);
    string boundary = json + new string(' ', 8192 - bytes);
    Assert.Equal(new[] { row }, BomberCentralSupply.Decode(boundary));
    Assert.Throws<InvalidOperationException>(() => BomberCentralSupply.Decode(boundary + " "));
    Assert.Throws<InvalidOperationException>(() => BomberCentralSupply.Decode(new string('é', 4097)));
}
```

- [ ] **Step 3: 运行实际新增测试 RED；逐一核实根因后修最小 source。** 如果它们对完整核心即绿，报告「新增回归首跑绿」，不能伪造 RED。现有首 Supply2 RED 仍是发行功能的 TDD 证据。使用以下 fresh labels 与全类入口，预期15项（原2+新增3 Facts+9 Theory行+1 codec），0skip。

```powershell
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Mode build -Label 'supply-edge-build-01'
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-edge-01' -Filter '*BomberCentralSupplyProductionTests'
```

执行证据必须记录发现/运行的真实15项及任何新增后的真实计数；存在失败时保留首 log，不通过重跑覆盖。配置环境或 build 问题由对应 owner 修，不把 zero tests 算绿。

- [ ] **Step 4: 交 Root/Barrel 的 rollover 集成断言。** 仅由 Barrel 在 `Prepare` 拒绝路径加入 HasPending；`StartNextGeneration` 开头拒绝 HasPending，完成原旧物清理后再清零两项 match marker。所需窄代码如下，不能通过 reset 清除 SupplyPending：

```csharp
// Prepare: before any destructive cleanup:
if (BomberCentralSupply.HasPending(world)) return false;

// Prepare: after its existing loop has queued actual pickup retirement,
// before it can declare the old world clean or advance the MatchId:
if (world.Each<BomberPickupItem>().Any(item => world.IsLive(item.Entity) && item.SupplyMatchId.Value != 0))
    return false;

// StartNextGeneration: before changing match generation or authored plan:
if (BomberCentralSupply.HasPending(world))
    throw new InvalidOperationException("A new match cannot discard unpublished central supply.");
runtime.SupplyAnnouncedMatchId.Value = 0;
runtime.SupplyIssuedMatchId.Value = 0;
```

Barrel 集成时在 `Server/Tests/Gameplay/BomberRoundRolloverTests.cs` 的真实 next-round Native 测试里：先实际产生缺落点9条→推进 Results结束→多Tick仍同 MatchId/同9债务；提供合法Native落点→9份实际发布并结清→原清理流程且实际live Supply退休完成后才能进入新Match；新Match在50/60秒各出现一次，两个marker不能沿用旧Match。submitted unknown 用例必须保持同Match和同债务，即使超过 Results 时刻。补给的 post-results materialize 例外与这个 gate 必须一起集成，否则可能发生同Tick创建/清理；发行 phase predicate 只控制新发行，不能永久阻断已发行债务。仅队列中的 Destroy 还不是退休事实，不能在该Tick提早换Match令仍live的旧Supply来源失效。该集成发生前不能写「下一局验收绿」。

- [ ] **Step 5: 用真实完整信用边界补齐交接测试。** Root/Capacity 已知 producer 的 budget 测试入口是 `BomberObjectBudgetTests`，不能把正式 max_pickup_entities 调大以通过 Supply。测试通过已发布的实际 BomberPickupItemEntity 填充至 PickupCapacity−8，推进60秒：SupplyIssued仍0、pending空、无opened；真正消费/销毁一份并 finalization 后，下一Tick以实际Tick一次发行9件。若无法造该真实前置而不违反 Root 守卫，保留其首拒绝，并让 Root 的 budget owner 提供独立有界 profile；不能注入假的 ObjectBudgets 服务。这个测试随后用9份刚好余量再跑：全部9件实际发布、shared credit从pending转live，不因prepaid queue重复计数而被误拒。

在同一 Native 测试类增加 using `Lumio.Bomber.Gameplay.Contracts.EntityTypes`；新增完整 test如下。被填充的Health实体是测试前置，仍真实通过结构发布与Native World，不假造信用计数；每批32件，每批经一次实际Tick确认。当前作者预算703件使该前置在60秒之前完成。

```csharp
[Theory]
[InlineData(8)]
[InlineData(9)]
public void WholeSupplyAdmissionRequiresNineCreditsAndNeverDoubleChargesItsQueuedDestinations(int remaining)
{
    using var config = new BomberObjectBudgetTests.AuthoredFixture(
        ("game", "default", "central_supply_enabled", "true"),
        ("game", "default", "skills_enabled", "false"));
    using var scene = new BomberTerrainProductionTests.Scene(0, configDirectory: config.Compile());
    OpenPlaza(scene);
    var world = scene.World;
    int capacity = BomberConfigBinding.For(world).ObjectBudgets.PickupCapacity;
    int target = checked(capacity - remaining);
    for (int created = 0; created < target;)
    {
        int batch = Math.Min(32, target - created);
        for (int i = 0; i < batch; i++)
        {
            var order = world.Commands.Create<BomberPickupItemEntity>();
            order.Get<BomberPickupItem>().Kind.Value = (int)BomberPickupKind.Health;
            order.Get<BomberPickupItem>().SpawnTick.Value = world.Tick;
            EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition", "3.5,1.5,3.5", silent: true);
        }
        scene.Manager.Tick(); created += batch;
    }
    Assert.Equal(target, world.Each<BomberPickupItem>().Count());
    var game = BomberConfigBinding.For(world).Game;
    ulong scheduled = checked(world.Single<BomberMatchState>().StartTick.Value +
        Ticks.FromMilliseconds(game.CentralSupplyOpenMs, game.TickRateHz));
    Assert.True(world.Tick < scheduled);
    ReachOpening(scene);
    var runtime = world.Single<BomberWorldRuntime>();
    if (remaining == 8)
    {
        Assert.Equal(0UL, runtime.SupplyIssuedMatchId.Value);
        Assert.Equal("", runtime.SupplyPending.Value);
        Assert.Equal(0, Occurrences(world, "supply_opened"));
        world.Commands.Destroy(world.Each<BomberPickupItem>().First().Entity);
        scene.Manager.Tick(); scene.Manager.Tick();
    }
    var supplied = world.Each<BomberPickupItem>().Where(p => p.SupplyMatchId.Value != 0).ToArray();
    Assert.Equal(9, supplied.Length);
    Assert.Equal("", runtime.SupplyPending.Value);
    Assert.Equal(capacity, BomberTerrainTransactions.PickupCreditUsage(world));
    Assert.Equal(1, Occurrences(world, "supply_opened"));
    using var opened = JsonDocument.Parse(OccurrenceJson(world, "supply_opened"));
    ulong occurred = ulong.Parse(opened.RootElement.GetProperty("tick").GetString()!, System.Globalization.CultureInfo.InvariantCulture);
    Assert.True(remaining == 8 ? occurred > scheduled : occurred == scheduled);
}
```

同类加入完整解析 helper，临时文档用 using 释放：

```csharp
private static string OccurrenceJson(World world, string kind)
{
    var entries = world.Single<BomberPresentationJournal>().Entries;
    string? found = null;
    int count = 0;
    for (int i = 0; i < entries.Count; i++)
    {
        using var document = JsonDocument.Parse(entries[i]);
        if (document.RootElement.GetProperty("kind").GetString() != kind) continue;
        found = entries[i]; count++;
    }
    Assert.Equal(1, count);
    return found!;
}
```

该2行 Theory加入后整个Supply类预期17项。测试还核验延迟发行journal使用实际Tick而非scheduled；如果断言失败，保留首真实RED并按所属公式/owner最小修复。

### Task 3: 两个 typed Supply 事件与 pinned 目录回归

**Files:** `Gameplay/Events/BomberEvents.cs`、`BomberEventCatalog.cs`、`Server/Tests/Gameplay/BomberEventContractTests.cs`；Root/Capacity 负责正式 schema mint 和导出。

**Interfaces:** 两种 payload 只保存实际发生 stamp、captured context、中心 Cell 与 scheduled OpenTick/actual IssuedCount；不复制物品 inventory，不增 wire grammar。事件 occurrence tick 是实际发行Tick，OpenTick是计划时刻，两者不得混淆。

- [ ] **Step 1: 先把既有 pinned 测试的两条期望改为以下明确值。** 总数仍60，Typed46、Derived14、Excluded0；TelemetryMapping 中 supply_opened.Kind 期望 Typed。生产目录尚未改时应为实际 RED。

```csharp
new("supply_announced", typeof(SupplyAnnounced), BomberCatalogKind.Typed, "occurrence", "none"),
new("supply_opened", typeof(SupplyOpened), BomberCatalogKind.Typed, "occurrence", "none"),
// Counts inside CatalogHasUniqueNamesAndOneCanonicalEntryPerEvent:
Assert.Equal(60, rows.Count);
Assert.Equal(46, rows.Count(x => x.Kind == BomberCatalogKind.Typed));
Assert.Equal(14, rows.Count(x => x.Kind == BomberCatalogKind.Derived));
Assert.Equal(0, rows.Count(x => x.Kind == BomberCatalogKind.Excluded));
```

由于 payload 类型尚不存在，按TDD先加入值形状声明才能让目录行为测试编译；这是只供契约定义的必要最小步骤。随后运行目录测试实际 RED，不能将初始编译缺类型当目录行为 RED。

```csharp
/// <summary>Central supply notice captured at its actual occurrence tick.</summary>
public readonly record struct SupplyAnnounced(BomberEventStamp Stamp, BomberContext Context,
    BomberCell Cell, ulong OpenTick) : IBomberEvent;

/// <summary>One admitted public central-supply issuance, before its pending rows materialize.</summary>
public readonly record struct SupplyOpened(BomberEventStamp Stamp, BomberContext Context,
    BomberCell Cell, int IssuedCount) : IBomberEvent;
```

```powershell
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Mode build -Label 'supply-events-red-build-01'
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-events-red-01' -Filter '*BomberEventContractTests'
```

- [ ] **Step 2: 生产目录末尾两条 Excluded 替换成上面的 Typed descriptor。** 不增加发现式注册器，不修改其他58项。更新 summary 中「derived and excluded」为「derived telemetry names」。Root mint 前只宣称源目录测试，不能宣称官方发布 schema 已一致。
- [ ] **Step 3: 增加 lossless 形状事实测试并运行 GREEN。** 新Fact完整代码：

```csharp
[Fact]
public void SupplyPayloadSeparatesActualOccurrenceFromScheduledOpeningAndHasNoActorOwner()
{
    var stamp = new BomberEventStamp(ulong.MaxValue, 9007199254740993UL, ulong.MaxValue);
    var context = new BomberContext(60000, "center", null);
    var announced = new SupplyAnnounced(stamp, context, new BomberCell(11, 11), stamp.Tick + 1);
    var opened = new SupplyOpened(stamp, context, new BomberCell(11, 11), 11);
    Assert.Equal(stamp, announced.Stamp); Assert.Equal(stamp, opened.Stamp);
    Assert.Equal(stamp.Tick + 1, announced.OpenTick);
    Assert.Equal(11, opened.IssuedCount);
    Assert.Null(opened.Context.Subject);
    Assert.Equal(announced.Cell, opened.Cell);
    Assert.Equal(typeof(SupplyAnnounced), BomberEventCatalog.All.Single(x => x.Name == "supply_announced").PayloadType);
    Assert.Equal(typeof(SupplyOpened), BomberEventCatalog.All.Single(x => x.Name == "supply_opened").PayloadType);
}
```

```powershell
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Mode build -Label 'supply-events-green-build-01'
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-events-green-01' -Filter '*BomberEventContractTests'
```

期望所有既有7项加新1项=8项、0fail、0skip、child0，实际输出为证据。真实 journal 的 occurrenceTick/openTick/issuedCount 由Task1 Native tests核验，不以此值对象测试代替业务事实；实际事件log+journal分配同一 sequence，不能为同一次业务事件额外分配两次。

### Task 4: 组合验证与精确交回

**Files:** 私有 evidence、`docs/plans/2026-10-03-bomber-central-supply-production.md` checkbox、Root指定的 `.sdd` 实施报告；无额外生产重构。

**Interfaces:** 使用固定 runner、Root 的正式 Config/Schema双端mint证据和最终统一完整包；不将官方06上局部 Gameplay候选当正式产品发布。完整11份 Skill源测试等待真实六形态消费者/准入闭包，不取消其守卫。

- [ ] **Step 1: 在同一最终源码身份跑 Supply 全类、事件目录、Terrain/Death/Pickup/NextRound 相关真实回归。** 不手换Game依赖。逐类运行同一 DLL，日志fresh label如下：

```powershell
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-final-01' -Filter '*BomberCentralSupplyProductionTests'
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-final-events-01' -Filter '*BomberEventContractTests'
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-final-terrain-01' -Filter '*BomberTerrain*Tests'
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-final-death-01' -Filter '*BomberDeath*Tests'
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-final-pickup-01' -Filter '*BomberGrowthHealthTests'
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-final-credit-01' -Filter '*BomberSharedProducerCreditTests'
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-final-round-01' -Filter '*BomberRoundRolloverTests'
```

每类必须发现>0测试；若当前类命名不匹配，用实际 discovery清单选择真实类并保存命令更正，不能用空类结果当过门。上述命令仅执行测试；fresh final build在同一heavy窗口提前进行。Root要求的更宽全套在同一最终包身份另记counts，避免把子集合sum误认为完整solution。

- [ ] **Step 2: 完成授权写域的静态/格式和source检查。** 101既有入口与formatter如下，从 `games/101-bomber/` 执行；保持真实selection与私有artifacts属性解析，不回落Engine默认目录。先保留原失败，再机械纠正普通格式；仅本候选文件可变，生成物/旧freeze不可变。Source变化后重建并跑 affected suite，不用旧DLL冒充最终source。

```powershell
node --test Tools/*.test.mjs
node eng/spec-lint.mjs
$env:LumioEngineSelectionProps='C:/Work/LumioGames/LumioGame/games/101-bomber/.run/v14-native-production-20261003/selection.props'
$env:ArtifactsPath='C:/Work/LumioGames/LumioGame/games/101-bomber/.run/v14-native-production-20261003/artifacts'
dotnet format Tools/Lumio.Bomber.Gameplay.Tests/Lumio.Bomber.Gameplay.Tests.csproj --verify-no-changes --no-restore --include Gameplay/BomberCentralSupply.Server.cs Gameplay/BomberCentralSupplySystem.Server.cs Gameplay/Components/Bomber/BomberPickupItem.Server.cs Gameplay/Components/Bomber/BomberWorldRuntime.Server.cs Gameplay/BomberTerrainTransactions.Server.cs Gameplay/Events/BomberEvents.cs Gameplay/Events/BomberEventCatalog.cs Server/Tests/Gameplay/BomberCentralSupplyProductionTests.cs Server/Tests/Gameplay/BomberEventContractTests.cs
git diff --check
```
- [ ] **Step 3: 提交正式档交接需求到Root，保持产品验收分列。** 23/12和27/16各Native seeds1–100、skills开/关、11组成、完整局至下一局、determinism、8Bot30min与真实browser光柱/HUD/音效是必需的另组门；局部19/8 skills-off绿只能证明isolated producer。Root提供正式有界admission和最终完整包后，正式测试必须验证5强化不出现Kick、2独立等权六形态位、2Health/1Frenzy/1GoldenHeart真实留地可抢，不以新fixture绕过正式M2预算守卫。
- [ ] **Step 4: 交回精确冻结，由Root审查/提交/打包。** 记录每个源码与测试SHA、原始首RED与最终GREEN日志SHA、actual count/pass/fail/skip和rawchild exit、official06 Manifest/Native/DLL identities、最终source对应DLL hashes、共享文件最小diff与Root/Barrel接缝。分开列出已绿、仍待正式Native矩阵/表现证据的门；禁止把Node配置测试称为实际规则执行。

## 自检记录

已逐项覆盖：默认19关闭与UGC明确开启；50/60秒、实际occurrence、一次发行；5/2/1/2/1与skills-off9；确定性fixed stream与不重抽；≤11/UTF8≤8192强校验；Native中心排序与live/queued pickup和bomb排除；submitted-before-create、actual publication/hydration结清、unknown不重放；shared prepaid credit；typed目录；paired restore；nextRound pending门与正式档/完整产品门分列。

需要执行阶段真实证据补齐的明确项目：Root首Supply2 RED；Task2真实满容量/刚好9余量边界；Barrel实际nextRound集成；六形态及正式23/27 profile admission后的完整11组成和产品矩阵。它们是尚未执行的验证义务，不是本计划已通过的结果。计划不授权本轮启动实施，当前只写这一文档。
