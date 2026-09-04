using Lumio.GameRuntime.Ecs;
using Lumio.Game.ServerGameplay.Bomber.Contracts.Components;

namespace Lumio.Game.ServerGameplay.Bomber.Contracts.EntityTypes;

/// <summary>爆炸覆盖的单元格，瞬时危险窗。design.md §7.2/§7.5。</summary>
[EntityType(Mode.CS)]
[Has(typeof(BomberExplosionCell))]
public abstract class BomberExplosionCellEntity
{
}
