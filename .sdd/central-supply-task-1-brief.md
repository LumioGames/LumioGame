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

