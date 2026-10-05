using System.Collections.Generic;
using System.Numerics;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.Bomber.Gameplay.Contracts.EntityTypes;

namespace Lumio.Bomber.Gameplay;

/// <summary>Authoritative pickup claim; the complete target identity travels through GAS.</summary>
[AbilityType(3u, Prediction = PredictionKind.AuthorityOnly)]
public sealed partial class PickupAbility : AbilityType<PickupAbility.Input>
{
    public const uint TypeId = 3u;
    public struct Input : IAbilityInput
    {
        public NetEntityId Target;
        public void Write(IList<object?> args) => args.Add(Target.ToHex());
        public bool TryRead(IReadOnlyList<object?> args, int start) =>
            args is not null && start >= 0 && start == args.Count - 1 &&
            NetEntityId.TryParse(args[start]?.ToString() ?? string.Empty, out Target);
    }

    public override bool CanActivate(in Input input, AbilityComponent owner, out string? failureCode)
    {
        failureCode = null;
        if (owner is null) { failureCode = "ability_owner_missing"; return false; }
        if (!BomberMatchRules.IsPlayerInputOpen(owner.World, owner.Entity))
        { failureCode = "bomber_match_not_ready"; return false; }
        if (!owner.World.IsLive(input.Target) || !owner.World.TypeOf(input.Target).Is<BomberPickupItemEntity>())
        { failureCode = "pickup_missing"; return false; }
        World world = owner.World;
        BomberPlayerState player = world.Get<BomberPlayerState>(owner.Entity);
        if (player.Participant.Value.IsDefault || !world.IsLive(player.Participant.Value) ||
            !world.TypeOf(player.Participant.Value).Is<BomberParticipantEntity>() ||
            player.LifeGeneration.Value == 0)
        { failureCode = "pickup_source_invalid"; return false; }
        BomberParticipantState participant = world.Get<BomberParticipantState>(player.Participant.Value);
        if (participant.MatchId.Value != world.Single<BomberMatchState>().MatchId.Value ||
            participant.CurrentLife.Value != owner.Entity ||
            participant.LifeGeneration.Value != player.LifeGeneration.Value)
        { failureCode = "pickup_source_invalid"; return false; }
        var from = world.Get<LogicTransform>(owner.Entity).LocalPosition;
        var to = world.Get<LogicTransform>(input.Target).LocalPosition;
        float radius = BomberConfigBinding.For(world).Drops.PickupDistanceMilli / 1000f;
        if (Vector3.DistanceSquared(from, to) > radius * radius)
        { failureCode = "pickup_out_of_range"; return false; }
        BomberPickupItem item = world.Get<BomberPickupItem>(input.Target);
        if (!item.ClaimedBy.Value.IsDefault) { failureCode = "pickup_claimed"; return false; }
        if (item.ExcludedLife.Value == owner.Entity &&
            item.ExcludedLifeGeneration.Value == player.LifeGeneration.Value &&
            BomberMatchRules.CellX(from) == BomberMatchRules.CellX(to) &&
            BomberMatchRules.CellZ(from) == BomberMatchRules.CellZ(to))
        { failureCode = "pickup_dropper_in_cell"; return false; }
        if ((BomberPickupKind)item.Kind.Value == BomberPickupKind.Skill)
        {
            IBomberConfig config = BomberConfigBinding.For(world);
            if (!config.Game.SkillsEnabled ||
                !BomberSpecialBombResolver.TryResolve(config, item.SkillId.Value, out int incoming))
            { failureCode = "pickup_skill_invalid"; return false; }
            BomberSkillState slot = world.Get<BomberSkillState>(owner.Entity);
            if (!BomberSpecialBombResolver.TryResolveSlot(config, slot, out int held))
            { failureCode = "pickup_slot_invalid"; return false; }
            if (held == incoming)
            { failureCode = "pickup_same_kind"; return false; }
            if (held != 0 && !CanExchangeAt(world, from))
            { failureCode = "pickup_exchange_blocked"; return false; }
        }
        else
        {
            AttributeComponent attributes = world.Get<AttributeComponent>(owner.Entity);
            if (player.RestorePending.Value || attributes.GetBaseValue(BomberAttributeNames.HealthPoints) <= 0)
            { failureCode = "pickup_life_not_ready"; return false; }
            string? attribute = BomberGrowth.UpgradeAttribute(item.Kind.Value);
            if (attribute is not null)
            {
                if (attributes.GetBaseValue(attribute) >= BomberConfigBinding.For(world).Attribute(attribute).Maximum)
                { failureCode = "pickup_at_cap"; return false; }
            }
            else if (item.Kind.Value == (int)BomberPickupKind.GoldenHeart)
            {
                if (player.GoldenHeartCount.Value >= BomberGrowth.MaximumGoldenHearts)
                { failureCode = "pickup_at_cap"; return false; }
            }
            else if (item.Kind.Value == (int)BomberPickupKind.Health)
            {
                if (attributes.GetBaseValue(BomberAttributeNames.HealthPoints) == player.MaximumHealth.Value)
                { failureCode = "pickup_at_cap"; return false; }
            }
            else if (item.Kind.Value == (int)BomberPickupKind.Frenzy)
            {
                if (!BomberConfigBinding.For(world).Game.FrenzyEnabled)
                { failureCode = "pickup_frenzy_disabled"; return false; }
                if (BomberFrenzy.IsActive(world, participant, owner.Entity))
                { failureCode = "pickup_frenzy_active"; return false; }
            }
            else { failureCode = "pickup_kind_invalid"; return false; }
        }
        return true;
    }
    public override void Execute(in Input input, AbilityComponent owner) => ExecuteAuthoritative(input, owner);

    partial void ExecuteAuthoritative(in Input input, AbilityComponent owner);
    private static partial bool CanExchangeAt(World world, Vector3 position);
    static partial void RecordPickup(World world, NetEntityId playerId, NetEntityId itemId, BomberPickupItem item);
}
