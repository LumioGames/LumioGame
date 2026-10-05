using System;
using System.Linq;
using System.Text;
using Lumio.Bomber.Gameplay.Config;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay.Contracts.Components;

public sealed partial class BomberPickupItem
{
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
}
