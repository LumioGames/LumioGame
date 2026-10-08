using System;
using System.Linq;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;
using Lumio.Bomber.Gameplay.EntityTypes;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

/// <summary>Deterministic geometry and lifecycle predicates shared by server and client abilities.</summary>
internal static partial class BomberMatchRules
{
    internal const int HalfHeartsPerBomb = 2;
    internal static bool IsPlayerInputOpen(World world, NetEntityId player)
    {
        if (world is null || !world.IsLive(player) || !world.TypeOf(player).Is<PlayerEntity>()) return false;
        BomberMatchPhase phase = (BomberMatchPhase)world.Single<BomberMatchState>().Phase.Value;
        BomberLifePhase life = (BomberLifePhase)world.Get<BomberPlayerState>(player).LifePhase.Value;
        return phase is BomberMatchPhase.Warmup or BomberMatchPhase.Running or BomberMatchPhase.FinalCircle
            && life is BomberLifePhase.Protected or BomberLifePhase.Vulnerable;
    }

    internal static bool IsInFinalCircle(World world) =>
        (BomberMatchPhase)world.Single<BomberMatchState>().Phase.Value == BomberMatchPhase.FinalCircle;

    internal static int CellX(System.Numerics.Vector3 position) => (int)MathF.Floor(position.X);
    internal static int CellZ(System.Numerics.Vector3 position) => (int)MathF.Floor(position.Z);

    internal static NetEntityId FindPlayerAt(World world, int x, int z)
    {
        foreach (BomberPlayerState player in world.Each<BomberPlayerState>())
        {
            if ((BomberLifePhase)player.LifePhase.Value is BomberLifePhase.Eliminated or BomberLifePhase.AwaitingRespawn) continue;
            var position = world.Get<LogicTransform>(player.Entity).LocalPosition;
            if (CellX(position) == x && CellZ(position) == z) return player.Entity;
        }
        return default;
    }

    internal static BomberBombState? FindBombAt(World world, int x, int z, NetEntityId exclude = default)
    {
        foreach (BomberBombState bomb in world.Each<BomberBombState>())
        {
            if (bomb.Entity == exclude) continue;
            var position = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
            if (CellX(position) == x && CellZ(position) == z && bomb.Phase.Value < (int)BomberBombPhase.Expired)
                return bomb;
        }
        return null;
    }

    internal static int CountAlive(World world) => world.Each<BomberPlayerState>()
        .Count(player => (BomberLifePhase)player.LifePhase.Value is BomberLifePhase.Protected or BomberLifePhase.Vulnerable);

    internal static int HatCount(AttributeComponent attributes)
    {
        long power = attributes.GetCurrentValue(BomberAttributeNames.BombPower);
        long capacity = attributes.GetCurrentValue(BomberAttributeNames.BombCapacity);
        long speed = attributes.GetCurrentValue(BomberAttributeNames.SpeedTier);
        return checked((int)Math.Max(0, BomberConfigBinding.For(attributes.World).HatCount(power, capacity, speed)));
    }

    internal static void SyncDerivedPlayerState(World world, BomberPlayerState player)
    {
        player.HatCount.Value = HatCount(world.Get<AttributeComponent>(player.Entity));
        if (player.MaximumHealth.Value == 0)
            player.MaximumHealth.Value = BomberGrowth.MaximumHealth(player.HatCount.Value, player.GoldenHeartCount.Value);
    }
}
