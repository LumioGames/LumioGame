using Lumio.GameRuntime.Ecs;
using Lumio.Game.ServerGameplay.Bomber.Contracts.Components;

namespace Lumio.Game.ServerGameplay.Bomber.Contracts.EntityTypes;

/// <summary>Stage 0a 内核接入核验：玩家实体，仅挂 <see cref="BomberPlayerState"/>，不含 Chat/Identity。</summary>
[EntityType(Mode.CS)]
[Has(typeof(BomberPlayerState))]
public abstract class BomberPlayerEntity
{
}
