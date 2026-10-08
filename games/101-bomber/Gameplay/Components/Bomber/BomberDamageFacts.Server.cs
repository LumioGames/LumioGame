using System;
using Lumio.GameRuntime.Ecs;
namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberDamageFacts
{
    internal void Reserve()
    {
        HandleWorld.Add(default);
        HandleInstance.Add(default);
        HandleGeneration.Add(default);
        TypeId.Add(default);
        Target.Add(default);
        Source.Add(default);
        Tick.Add(default);
        MatchId.Add(default);
        Participant.Add(default);
        Life.Add(default);
        Generation.Add(default);
        SourceParticipant.Add(default);
        SourceLife.Add(default);
        SourceGeneration.Add(default);
        Family.Add(default);
        ChainId.Add(default);
        X.Add(default);
        Z.Add(default);
        Cause.Add(default);
        Before.Add(default);
        After.Add(default);
        Actual.Add(default);
        Ready.Add(default);
        Status.Add(default);
    }
    internal void Remove(int index)
    {
        HandleWorld.RemoveAt(index);
        HandleInstance.RemoveAt(index);
        HandleGeneration.RemoveAt(index);
        TypeId.RemoveAt(index);
        Target.RemoveAt(index);
        Source.RemoveAt(index);
        Tick.RemoveAt(index);
        MatchId.RemoveAt(index);
        Participant.RemoveAt(index);
        Life.RemoveAt(index);
        Generation.RemoveAt(index);
        SourceParticipant.RemoveAt(index);
        SourceLife.RemoveAt(index);
        SourceGeneration.RemoveAt(index);
        Family.RemoveAt(index);
        ChainId.RemoveAt(index);
        X.RemoveAt(index);
        Z.RemoveAt(index);
        Cause.RemoveAt(index);
        Before.RemoveAt(index);
        After.RemoveAt(index);
        Actual.RemoveAt(index);
        Ready.RemoveAt(index);
        Status.RemoveAt(index);
    }
    internal void Validate(int count)
    {
        if (HandleWorld.Count != count || HandleInstance.Count != count || HandleGeneration.Count != count || TypeId.Count != count || Target.Count != count || Source.Count != count || Tick.Count != count || MatchId.Count != count || Participant.Count != count || Life.Count != count || Generation.Count != count || SourceParticipant.Count != count || SourceLife.Count != count || SourceGeneration.Count != count || Family.Count != count || ChainId.Count != count || X.Count != count || Z.Count != count || Cause.Count != count || Before.Count != count || After.Count != count || Actual.Count != count || Ready.Count != count || Status.Count != count)
            throw new InvalidOperationException("Damage fact columns must match the reserved bomb hit rows.");
    }
    protected override void OnHydrate() => Validate(World.Get<BomberBombState>(Entity).HitParticipants.Count);
}
