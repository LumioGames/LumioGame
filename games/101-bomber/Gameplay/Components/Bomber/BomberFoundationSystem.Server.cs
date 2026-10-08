using System;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Engine.NativeLoader;
using Microsoft.Extensions.Logging;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberWorldRuntime
{
    // Component instance lifetime follows the World; restored rows must validate again.
    private bool _foundationReady;

    internal void EnsureFoundation()
    {
        RequireSupportedResume();
        if (_foundationReady) return;
        ValidateRoster(BomberConfigBinding.For(World));
        BomberHfsmState match = World.Get<BomberHfsmState>(Entity);
        BomberFinalCircleHfsmState circle = World.Get<BomberFinalCircleHfsmState>(Entity);
        using NativeHfsmDefinition matchDefinition = BomberHfsmDefinitions.Compile(World, BomberHfsmKind.Match);
        using NativeHfsmDefinition circleDefinition = BomberHfsmDefinitions.Compile(World, BomberHfsmKind.FinalCircle);
        if (match.SnapshotPresent.Value)
        {
            _ = match.ReadSnapshot(matchDefinition, BomberHfsmKind.Match, match.MachineKey.Value);
            ValidateAllocatedKey(match.MachineKey.Value);
        }
        if (circle.SnapshotPresent.Value)
        {
            _ = circle.ReadSnapshot(circleDefinition, circle.MachineKey.Value);
            ValidateAllocatedKey(circle.MachineKey.Value);
        }
        if (match.SnapshotPresent.Value && circle.SnapshotPresent.Value && match.MachineKey.Value == circle.MachineKey.Value)
            throw new InvalidOperationException("World HFSM machines must have distinct allocated keys.");

        // Preflight both allocations so exhaustion cannot leave only one machine initialized.
        ulong missing = (match.SnapshotPresent.Value ? 0UL : 1UL) + (circle.SnapshotPresent.Value ? 0UL : 1UL);
        _ = checked(NextHfsmMachineKey.Value + missing);
        if (!match.SnapshotPresent.Value)
        {
            ulong key = AllocateHfsmMachineKey();
            HfsmPlan plan = matchDefinition.Start(key, 1);
            RequireIdleStart(plan);
            if (!match.StorePlan(plan, matchDefinition, BomberHfsmKind.Match, key))
                throw new InvalidOperationException("Native rejected Match initialization.");
            Log.LogInformation("BOMBER_HFSM_STARTED owner={Owner} kind=Match key={MachineKey} state={State} tick={Tick}",
                Entity, key, BomberHfsmDefinitions.State.MatchWaiting, World.Tick);
        }
        if (!circle.SnapshotPresent.Value)
        {
            ulong key = AllocateHfsmMachineKey();
            HfsmPlan plan = circleDefinition.Start(key, 1);
            RequireIdleStart(plan);
            if (!circle.StorePlan(plan, circleDefinition, key))
                throw new InvalidOperationException("Native rejected FinalCircle initialization.");
            Log.LogInformation("BOMBER_HFSM_STARTED owner={Owner} kind=FinalCircle key={MachineKey} state={State} tick={Tick}",
                Entity, key, BomberHfsmDefinitions.State.CircleInactive, World.Tick);
        }
        _foundationReady = true;
    }

    private void ValidateAllocatedKey(ulong key)
    {
        if (key == 0 || key > NextHfsmMachineKey.Value)
            throw new InvalidOperationException("World HFSM snapshot key exceeds the persisted allocator.");
    }

    private static void RequireIdleStart(HfsmPlan plan)
    {
        if (plan.Outcome != HfsmOutcome.Started || plan.Next is null || plan.Actions.Count != 0)
            throw new InvalidOperationException("World HFSM initialization requires a successful Native Start without actions.");
    }
}
