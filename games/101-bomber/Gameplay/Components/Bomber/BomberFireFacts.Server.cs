using System;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberFireFacts
{
    protected override void OnHydrate()
    {
        int count = FireStatus.Count;
        if (count > 1 || FireHandleWorld.Count != count || FireHandleInstance.Count != count || FireHandleGeneration.Count != count ||
            FireTypeId.Count != count || FireTarget.Count != count || FireSource.Count != count || FireTick.Count != count ||
            FireMatchId.Count != count || FireParticipant.Count != count || FireLife.Count != count || FireGeneration.Count != count ||
            FireSourceParticipant.Count != count || FireSourceLife.Count != count || FireSourceGeneration.Count != count ||
            FireFamily.Count != count || FireChainId.Count != count || FireX.Count != count || FireZ.Count != count ||
            FireCause.Count != count || FireSourceKind.Count != count || FirePulse.Count != count || FireBefore.Count != count ||
            FireAfter.Count != count || FireActual.Count != count || FireReady.Count != count)
            throw new InvalidOperationException("Fire fact columns disagree within the single pending slot.");
        if (count == 1 && (FireStatus[0] is < 0 or > 2 || FireTypeId[0] != 10110 ||
            FireTarget[0] != FireLife[0] || FireLife[0].IsDefault || FireLife[0].InstanceId != Entity.InstanceId || FireMatchId[0] == 0 || FireGeneration[0] == 0 ||
            FireSourceGeneration[0] == 0 || FireCause[0] != (int)BomberDamageCause.Fire || FireSourceKind[0] is < 1 or > 3 ||
            FirePulse[0] == 0 || (World.IsLive(FireLife[0]) && FirePulse[0] > World.Get<BomberSkillState>(FireLife[0]).FirePulseSequence.Value) ||
            FireParticipant[0] != Entity ||
            FireSource[0].IsDefault || FireSource[0].InstanceId != Entity.InstanceId ||
            FireSourceParticipant[0].IsDefault || FireSourceParticipant[0].InstanceId != Entity.InstanceId ||
            FireSourceLife[0].IsDefault || FireSourceLife[0].InstanceId != Entity.InstanceId ||
            (FireStatus[0] != 2 && (FireHandleWorld[0] == 0 || FireHandleInstance[0] == 0 || FireHandleGeneration[0] == 0)) ||
            (FireStatus[0] == 1 && (!FireReady[0] || FireBefore[0] < 0 || FireAfter[0] < 0 ||
                FireActual[0] < 0 || FireActual[0] != FireBefore[0] - FireAfter[0]))))
            throw new InvalidOperationException("Fire fact has malformed original identity or settlement.");
    }
}
