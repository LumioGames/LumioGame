using Lumio.GameRuntime.Ecs;
using Lumio.Game.ServerGameplay.Bomber.Contracts.Components;

namespace Lumio.Game.ServerGameplay.Bomber.Contracts.EntityTypes;

/// <summary>Stage 0a 内核接入核验：世界级组件挂载点，单例，World Manager 建世界时随之创建。</summary>
[EntityType(Mode.CS, World = true)]
[Has(typeof(BomberMatchState))]
public abstract class BomberWorldEntity
{
}
