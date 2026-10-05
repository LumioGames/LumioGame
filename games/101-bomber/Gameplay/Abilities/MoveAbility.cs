using System;
using System.Collections.Generic;
using System.Globalization;
using System.Numerics;
using Lumio.GameRuntime.Ecs;
using Lumio.GameRuntime.Gas;
using Lumio.Bomber.Gameplay.Contracts.Components;

namespace Lumio.Bomber.Gameplay;

/// <summary>Shared GAS input for continuous movement and perpendicular fallback.</summary>
[AbilityType(1u, Prediction = PredictionKind.LogicPredict)]
public sealed partial class MoveAbility : AbilityType<MoveAbility.Input>
{
    public const uint TypeId = 1u;
    public struct Input : IAbilityInput
    {
        public BomberDirection PrimaryDirection;
        public BomberDirection SecondaryDirection;
        public bool TurnPressed;
        public void Write(IList<object?> args)
        {
            args.Add(((int)PrimaryDirection).ToString(CultureInfo.InvariantCulture));
            args.Add(((int)SecondaryDirection).ToString(CultureInfo.InvariantCulture));
            args.Add(TurnPressed.ToString(CultureInfo.InvariantCulture));
        }
        public bool TryRead(IReadOnlyList<object?> args, int start)
        {
            if (args is null || start < 0 || args.Count - start != 3 ||
                !int.TryParse(args[start]?.ToString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out int primary) ||
                !int.TryParse(args[start + 1]?.ToString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out int secondary) ||
                !bool.TryParse(args[start + 2]?.ToString(), out bool turn) ||
                !Enum.IsDefined(typeof(BomberDirection), primary) || !Enum.IsDefined(typeof(BomberDirection), secondary))
                return false;
            PrimaryDirection = (BomberDirection)primary;
            SecondaryDirection = (BomberDirection)secondary;
            TurnPressed = turn;
            return true;
        }
    }
    public override bool CanActivate(in Input input, AbilityComponent owner, out string? failureCode)
    {
        failureCode = null;
        if (owner is null) { failureCode = "ability_owner_missing"; return false; }
        if (!BomberMatchRules.IsPlayerInputOpen(owner.World, owner.Entity))
        { failureCode = "bomber_match_not_ready"; return false; }
        if (BomberFiniteSkills.HasFreeze(owner.World, owner.Entity))
        { failureCode = "player_frozen"; return false; }
        BomberPlayerState player = owner.World.Get<BomberPlayerState>(owner.Entity);
        if (!BomberInputMemory.IsCurrent(owner.World, player))
        { failureCode = "move_source_invalid"; return false; }
        bool buffered = player.InputMemoryMatchId.Value == owner.World.Single<BomberMatchState>().MatchId.Value &&
            player.PendingTurnUntilTick.Value > owner.World.Tick;
        if (input.PrimaryDirection == BomberDirection.None && input.SecondaryDirection == BomberDirection.None && !buffered)
        { failureCode = "move_direction_missing"; return false; }
        return true;
    }
    public override void Execute(in Input input, AbilityComponent owner)
    {
        World world = owner.World;
        if (!CanActivate(input, owner, out _)) return;
        BomberDirection direction = input.PrimaryDirection != BomberDirection.None
            ? input.PrimaryDirection : input.SecondaryDirection;
        BomberDirection secondary = input.PrimaryDirection != BomberDirection.None
            ? input.SecondaryDirection : BomberDirection.None;
        if (direction != BomberDirection.None)
            world.Get<BomberPlayerState>(owner.Entity).Facing.Value = (int)direction;
        ExecuteMovement(world, owner.Entity, direction, secondary, input.TurnPressed);
    }

    internal static void WritePosition(World world, NetEntityId entity, Vector3 position, string controller)
    {
        LogicTransform transform = world.Get<LogicTransform>(entity);
        Vector3 before = transform.LocalPosition;
        TransformController token = world.RegisterTransformController(entity, controller);
        using (transform.BeginWrite(token)) transform.SetLocalPosition(position);
        ReleasePickupExclusionOnExit(world, entity, before, position);
    }

    static partial void ReleasePickupExclusionOnExit(World world, NetEntityId entity,
        Vector3 before, Vector3 after);
    static partial void ExecuteMovement(World world, NetEntityId player,
        BomberDirection primary, BomberDirection secondary, bool turnPressed);
}
