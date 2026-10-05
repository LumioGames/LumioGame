using System;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

internal static partial class BomberBombButton
{
    private const int Ordinary = 1, Remote = 2, Detonated = 3;

    static partial void ProcessAuthoritative(AbilityComponent owner, int phase)
    {
        World world = owner.World;
        BomberPlayerState player = world.Get<BomberPlayerState>(owner.Entity);
        if (phase == 4) { Clear(player); return; }
        if (!CanPress(owner, out _)) { Clear(player); return; }
        BomberInputMemory.Prepare(world, player);
        Expire(world, player);
        if (phase == 1)
        {
            if (player.BombButtonMode.Value != 0) return;
            _ = BomberSpecialBombResolver.TryResolveSlot(BomberConfigBinding.For(world),
                world.Get<BomberSkillState>(owner.Entity), out int kind);
            player.BombButtonMode.Value = kind == 7 ? Remote : Ordinary;
            player.BombButtonStartedTick.Value = player.BombButtonLastInputTick.Value = world.Tick;
            player.BombButtonLifeGeneration.Value = player.LifeGeneration.Value;
            if (player.BombButtonMode.Value == Ordinary)
                owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
            return;
        }
        if (player.BombButtonMode.Value == 0) return;
        player.BombButtonLastInputTick.Value = world.Tick;
        if (player.BombButtonMode.Value == Remote)
        {
            uint hz = BomberConfigBinding.For(world).Game.TickRateHz;
            // Cross multiplication preserves >=300 ms at every supported tick rate.
            // No client duration is accepted, and missing input never triggers this branch.
            bool longPress = checked((world.Tick - player.BombButtonStartedTick.Value) * 1000UL) >= checked(hz * 300UL);
            if (longPress)
            {
                player.BombButtonMode.Value = Detonated;
                DetonateOwned(world, player.Participant.Value);
            }
            else if (phase == 3)
            {
                // Clear first: failed/uncertain placement cannot replay an end edge.
                Clear(player);
                owner.Activate<PlaceBombAbility, PlaceBombAbility.Input>(default);
                return;
            }
        }
        if (phase == 3) Clear(player);
    }

    internal static void Expire(World world, BomberPlayerState player)
    {
        if (player.BombButtonMode.Value == 0) return;
        if (player.BombButtonLifeGeneration.Value != player.LifeGeneration.Value ||
            player.BombButtonStartedTick.Value > world.Tick || player.BombButtonLastInputTick.Value > world.Tick ||
            world.Tick - player.BombButtonLastInputTick.Value > 2 ||
            BomberFiniteSkills.HasBubble(world, player.Entity)) Clear(player);
    }

    internal static void DetonateOwned(World world, NetEntityId participant)
    {
        BomberWorldRuntime runtime = world.Single<BomberWorldRuntime>();
        ulong chain = 0;
        foreach (BomberBombState bomb in world.Each<BomberBombState>())
        {
            if (bomb.Owner.Value != participant || bomb.BombKind.Value != 7 ||
                bomb.Phase.Value != (int)BomberBombPhase.Fuse) continue;
            if (chain == 0) chain = checked(runtime.NextChainId.Value + 1);
            bomb.ChainId.Value = chain;
            bomb.FuseEndTick.Value = world.Tick;
        }
        if (chain != 0) runtime.NextChainId.Value = chain;
    }
}
