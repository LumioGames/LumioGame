using System;
using System.Collections.Generic;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Config;

namespace Lumio.Bomber.Gameplay;

/// <summary>Placement derives its position, power and kind from the authoritative player.</summary>
[AbilityType(2u, Prediction = PredictionKind.LogicPredict)]
public sealed partial class PlaceBombAbility : AbilityType<PlaceBombAbility.Input>
{
    public const uint TypeId = 2u;

    public struct Input : IAbilityInput
    {
        // Set only by the authority's buffered-input system; the wire input stays empty.
        internal bool ContinueBuffered;
        public void Write(IList<object?> args) { }
        public bool TryRead(IReadOnlyList<object?> args, int start) =>
            args is not null && start >= 0 && start == args.Count;
    }

    public override bool CanActivate(in Input input, AbilityComponent owner, out string? failureCode)
    {
        if (!CanAcceptIntent(owner, out failureCode)) return false;
        BomberPlayerState player = owner.World.Get<BomberPlayerState>(owner.Entity);
        if (input.ContinueBuffered && (player.InputMemoryMatchId.Value != owner.World.Single<BomberMatchState>().MatchId.Value ||
            player.PendingPlaceUntilTick.Value <= owner.World.Tick))
        { failureCode = "bomb_input_expired"; return false; }
        return true;
    }

    private static bool CanAcceptIntent(AbilityComponent owner, out string? failureCode)
    {
        failureCode = null;
        if (owner is null) { failureCode = "ability_owner_missing"; return false; }
        World world = owner.World;
        if (!BomberMatchRules.IsPlayerInputOpen(world, owner.Entity))
        { failureCode = "bomber_match_not_ready"; return false; }
        BomberPlayerState player = world.Get<BomberPlayerState>(owner.Entity);
        if (player.Participant.Value.IsDefault || !world.IsLive(player.Participant.Value) ||
            player.LifeGeneration.Value == 0)
        { failureCode = "bomb_source_invalid"; return false; }
        BomberParticipantState participant = world.Get<BomberParticipantState>(player.Participant.Value);
        if (participant.MatchId.Value != world.Single<BomberMatchState>().MatchId.Value ||
            participant.CurrentLife.Value != owner.Entity ||
            participant.LifeGeneration.Value != player.LifeGeneration.Value)
        { failureCode = "bomb_source_invalid"; return false; }
        BomberSkillState skills = world.Get<BomberSkillState>(owner.Entity);
        if (!TryResolvePlacementSlot(BomberConfigBinding.For(world), skills,
                BomberFrenzy.IsActive(world, participant, owner.Entity), out _))
        { failureCode = "bomb_skill_invalid"; return false; }
        if (BomberFiniteSkills.HasBubble(world, owner.Entity) || BomberFiniteSkills.HasFreeze(world, owner.Entity))
        { failureCode = "player_control_locked"; return false; }
        var position = world.Get<LogicTransform>(owner.Entity).LocalPosition;
        int x = BomberMatchRules.CellX(position);
        int z = BomberMatchRules.CellZ(position);
        if (!IsPlacableTerrain(world, x, z))
        { failureCode = "bomb_terrain_blocked"; return false; }
        return true;
    }

    internal static bool CanPlace(AbilityComponent owner, out string? failureCode)
    {
        if (!CanAcceptIntent(owner, out failureCode)) return false;
        World world = owner.World;
        AttributeComponent attributes = world.Get<AttributeComponent>(owner.Entity);
        BomberPlayerState player = world.Get<BomberPlayerState>(owner.Entity);
        BomberParticipantState participant = world.Get<BomberParticipantState>(player.Participant.Value);
        bool frenzy = BomberFrenzy.IsActive(world, participant, owner.Entity);
        if (frenzy)
        {
            if (!CanProduceFrenzy(world, participant, out failureCode)) return false;
        }
        else if (attributes.GetBaseValue(BomberAttributeNames.AvailableBombs) <= 0 ||
            attributes.GetCurrentValue(BomberAttributeNames.AvailableBombs) <= 0)
        { failureCode = "bomb_capacity_empty"; return false; }
        var position = world.Get<LogicTransform>(owner.Entity).LocalPosition;
        int x = BomberMatchRules.CellX(position), z = BomberMatchRules.CellZ(position);
        if (HasFuseBombAt(world, x, z))
        { failureCode = "bomb_cell_occupied"; return false; }
        BomberWorldRuntime runtime = world.Single<BomberWorldRuntime>();
        ulong matchId = world.Single<BomberMatchState>().MatchId.Value;
        TryResolvePlacementSlot(BomberConfigBinding.For(world), world.Get<BomberSkillState>(owner.Entity), frenzy, out int kind);
        if (!CanReserve(world, runtime, matchId, z * BomberConfigBinding.For(world).Map.Width + x,
                world.Get<BomberPlayerState>(owner.Entity).Participant.Value, kind == (int)BomberBombKind.ReservedSplit ? 4 : 0))
        { failureCode = "bomb_cell_reserved"; return false; }
        return true;
    }

    public override void Execute(in Input input, AbilityComponent owner)
    {
        if (!CanActivate(input, owner, out _)) return;
        World world = owner.World;
        AttributeComponent attributes = world.Get<AttributeComponent>(owner.Entity);
        BomberPlayerState player = world.Get<BomberPlayerState>(owner.Entity);
        BomberInputMemory.Prepare(world, player);
        IBomberConfig config = BomberConfigBinding.For(world);
        if (!input.ContinueBuffered)
            player.PendingPlaceUntilTick.Value = checked(world.Tick +
                Ticks.FromMilliseconds(config.Movement.PlaceBufferMs, config.Game.TickRateHz));
        if (!CanPlace(owner, out _)) return;
        // No automatic replay after entering placement, even if a later owner operation throws.
        // Only the side-effect-free transient refusals above retain the original intent.
        player.PendingPlaceUntilTick.Value = 0;
        BomberSkillState skills = world.Get<BomberSkillState>(owner.Entity);
        BomberParticipantState participant = world.Get<BomberParticipantState>(player.Participant.Value);
        bool frenzy = BomberFrenzy.IsActive(world, participant, owner.Entity);
        if (!TryResolvePlacementSlot(config, skills, frenzy, out int skillKind)) return;
        var position = world.Get<LogicTransform>(owner.Entity).LocalPosition;
        int x = BomberMatchRules.CellX(position);
        int z = BomberMatchRules.CellZ(position);
        BomberWorldRuntime runtime = world.Single<BomberWorldRuntime>();
        ulong matchId = world.Single<BomberMatchState>().MatchId.Value;
        int cell = checked(z * config.Map.Width + x);
        int power = checked((int)attributes.GetCurrentValue(BomberAttributeNames.BombPower));
        uint fuseMs = frenzy ? config.Game.FrenzyFuseMs :
            skillKind == 7 ? config.SkillLevel(skills.BombSkillId.Value, 1).DurationMs : config.Bomb.FuseMs;
        ulong fuseEnd = checked(world.Tick + Ticks.FromMilliseconds(fuseMs, config.Game.TickRateHz));
        ulong nextChain = checked(runtime.NextChainId.Value + 1UL);
        BomberStatistics statistics = world.Get<BomberStatistics>(participant.Entity);
        int bombCount = checked(statistics.Bombs.Value + 1);
        long available = frenzy ? attributes.GetBaseValue(BomberAttributeNames.AvailableBombs) :
            checked(attributes.GetBaseValue(BomberAttributeNames.AvailableBombs) - 1);
        Reserve(world, runtime, matchId, cell, participant.Entity);
        if (frenzy)
        {
            _ = CreateFrenzyBomb(world, participant, player, power, nextChain, x, z, position.Y, fuseEnd);
            statistics.Bombs.Value = bombCount;
            return;
        }
        EntityOrder order = CreateBomb(world, skillKind == (int)BomberBombKind.ReservedSplit ? 4 : 0);
        BomberBombState bomb = order.Get<BomberBombState>();
        bomb.Owner.Value = participant.Entity;
        bomb.SourceLife.Value = owner.Entity;
        bomb.SourceLifeGeneration.Value = player.LifeGeneration.Value;
        bomb.Power.Value = power;
        bomb.BombKind.Value = skillKind;
        bomb.PierceLayers.Value = skillKind == (int)BomberBombKind.Pierce ? 1 : 0;
        bomb.SkillLevel.Value = skillKind == 0 ? 0 : 1;
        bomb.Phase.Value = (int)BomberBombPhase.Fuse;
        bomb.FuseEndTick.Value = fuseEnd;
        bomb.PlacedAtTick.Value = world.Tick;
        bomb.ChainId.Value = nextChain;
        runtime.NextChainId.Value = nextChain;
        EcsRegistry.Generated(order.Get<LogicTransform>())!.WriteField("localPosition",
            FormattableString.Invariant($"{x + 0.5f:R},{position.Y:R},{z + 0.5f:R}"), silent: true);
        statistics.Bombs.Value = bombCount;
        attributes.SetBaseValue(BomberAttributeNames.AvailableBombs, available);
    }

    internal static partial bool IsPlacableTerrain(World world, int x, int z);
    private static partial EntityOrder CreateBomb(World world, int futureChildren);
    private static partial bool CanProduceFrenzy(World world, BomberParticipantState participant, out string? failureCode);
    private static partial EntityOrder CreateFrenzyBomb(World world, BomberParticipantState participant,
        BomberPlayerState life, int power, ulong nextChain, int x, int z, float y, ulong fuseEnd);
    private static partial bool CanReserve(World world, BomberWorldRuntime runtime,
        ulong matchId, int cell, NetEntityId participant, int futureChildren);
    private static partial void Reserve(World world, BomberWorldRuntime runtime,
        ulong matchId, int cell, NetEntityId participant);

    private static bool TryResolvePlacementSlot(IBomberConfig config, BomberSkillState slot, bool frenzy, out int kind)
    {
        if (BomberSpecialBombResolver.TryResolveSlot(config, slot, out kind))
        {
            if (frenzy) kind = (int)BomberBombKind.Standard;
            return true;
        }
        if (!frenzy) return false;
        // An enabled, configured held slot is still required. Frenzy produces
        // Standard independently of the ordinary producer's supported shapes.
        foreach (var skill in config.Tables.Skills.Rows)
        {
            if (skill.Id != slot.BombSkillId.Value || skill.Slot != "Bomb" || skill.Trigger != "PlaceBomb" || skill.IsCombo)
                continue;
            bool validLevel = false;
            foreach (var level in config.Tables.SkillLevels.Rows)
                if (level.SkillId == skill.Id && level.Level == slot.BombSkillLevel.Value) validLevel = true;
            if (!validLevel) return false;
            foreach (var bomb in config.Tables.BombKinds.Rows)
                if (bomb.KindCode == skill.BombKindCode && bomb.Enabled)
                { kind = (int)BomberBombKind.Standard; return true; }
        }
        return false;
    }

    private static bool HasFuseBombAt(World world, int x, int z)
    {
        foreach (BomberBombState bomb in world.Each<BomberBombState>())
        {
            if (bomb.Phase.Value != (int)BomberBombPhase.Fuse) continue;
            var position = world.Get<LogicTransform>(bomb.Entity).LocalPosition;
            if (BomberMatchRules.CellX(position) == x && BomberMatchRules.CellZ(position) == z)
                return true;
        }
        return false;
    }
}
