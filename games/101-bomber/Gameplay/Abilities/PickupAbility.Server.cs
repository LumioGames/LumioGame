using System;
using System.Collections.Generic;
using System.Globalization;
using System.Numerics;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;

namespace Lumio.Bomber.Gameplay;

public sealed partial class PickupAbility
{
    partial void ExecuteAuthoritative(in Input input, AbilityComponent owner)
    {
        if (!CanActivate(input, owner, out _)) return;
        World world = owner.World;
        BomberPickupItem item = world.Get<BomberPickupItem>(input.Target);
        if ((BomberPickupKind)item.Kind.Value == BomberPickupKind.Skill)
        {
            BomberSkillState slot = world.Get<BomberSkillState>(owner.Entity);
            uint outgoing = slot.BombSkillId.Value;
            item.ClaimedBy.Value = owner.Entity;
            RecordPickup(world, owner.Entity, input.Target, item);
            slot.BombSkillId.Value = item.SkillId.Value;
            slot.BombSkillLevel.Value = 1;
            slot.BombSkillBound.Value = false;
            slot.ComboSourceA.Value = slot.ComboSourceB.Value = 0;
            slot.ComboLevelA.Value = slot.ComboLevelB.Value = 0;
            if (outgoing == 0)
            {
                world.Commands.Destroy(input.Target);
                BomberTerrainTransactions.RetireConsumedPickupCredit(world, input.Target);
            }
            else
            {
                BomberPlayerState player = world.Get<BomberPlayerState>(owner.Entity);
                Vector3 feet = world.Get<LogicTransform>(owner.Entity).LocalPosition;
                MoveAbility.WritePosition(world, input.Target, feet, nameof(PickupAbility));
                item.SkillId.Value = outgoing;
                item.SkillLevel.Value = 1;
                item.ComboSourceA.Value = item.ComboSourceB.Value = 0;
                item.ComboLevelA.Value = item.ComboLevelB.Value = 0;
                item.DroppedBy.Value = owner.Entity;
                item.ProtectedUntilTick.Value = 0;
                item.SpawnTick.Value = world.Tick;
                item.Phase.Value = 0;
                item.ExcludedLife.Value = owner.Entity;
                item.ExcludedLifeGeneration.Value = player.LifeGeneration.Value;
                item.ClaimedBy.Value = default;
            }
            return;
        }
        _ = BomberHealthBusiness.SubmitPickup(world, world.Get<BomberPlayerState>(owner.Entity), item);
    }

    private static partial bool CanExchangeAt(World world, Vector3 position) =>
        PlaceBombAbility.IsPlacableTerrain(world, BomberMatchRules.CellX(position), BomberMatchRules.CellZ(position)) &&
        BomberMatchRules.FindBombAt(world, BomberMatchRules.CellX(position), BomberMatchRules.CellZ(position)) is null;

    internal static void ReleaseDropperOnExit(World world, NetEntityId life, Vector3 before, Vector3 after)
    {
        if (BomberMatchRules.CellX(before) == BomberMatchRules.CellX(after) &&
            BomberMatchRules.CellZ(before) == BomberMatchRules.CellZ(after)) return;
        foreach (BomberPickupItem item in world.Each<BomberPickupItem>())
        {
            if (item.ExcludedLife.Value != life) continue;
            Vector3 position = world.Get<LogicTransform>(item.Entity).LocalPosition;
            if (BomberMatchRules.CellX(position) == BomberMatchRules.CellX(before) &&
                BomberMatchRules.CellZ(position) == BomberMatchRules.CellZ(before))
            {
                item.ExcludedLife.Value = default;
                item.ExcludedLifeGeneration.Value = 0;
            }
        }
    }

    static partial void RecordPickup(World world, NetEntityId playerId, NetEntityId itemId, BomberPickupItem item)
    {
        BomberPlayerState player = world.Get<BomberPlayerState>(playerId);
        BomberStatisticsBusiness.AppliedPickup(world, player.Participant.Value,
            world.Single<BomberMatchState>().MatchId.Value, player.HatCount.Value, item.Kind.Value, item.SkillId.Value);
        var position = world.Get<LogicTransform>(itemId).LocalPosition;
        world.Single<BomberPresentationJournal>().Append(world, "pickup_taken",
            world.Single<BomberMatchState>().MatchId.Value,
            world.Single<BomberWorldRuntime>().AllocateEventSequence(),
            player.Participant.Value, playerId, player.LifeGeneration.Value,
            entity: itemId, x: BomberMatchRules.CellX(position), z: BomberMatchRules.CellZ(position),
            data: new Dictionary<string, string> { ["pickupKind"] = item.Kind.Value.ToString(CultureInfo.InvariantCulture),
                ["skillId"] = item.SkillId.Value.ToString(CultureInfo.InvariantCulture),
                ["skillLevel"] = item.SkillLevel.Value.ToString(CultureInfo.InvariantCulture) });
    }
}
