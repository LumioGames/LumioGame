using Lumio.GameRuntime.Ecs;
using Lumio.Bomber.Gameplay.Contracts.Components;

namespace Lumio.Bomber.Gameplay.Contracts.EntityTypes;

/// <summary>一颗放置在棋盘上、正在计时的炸弹。design.md §7。位置归 <see cref="LogicTransform"/>。</summary>
[EntityType(Mode.CS)]
[Has(typeof(ObserverComponent))]
[Has(typeof(LogicTransform))]
[Has(typeof(BomberBombState))]
[Has(typeof(BomberHfsmState))]
[Has(typeof(BomberDamageFacts))]
public abstract class BomberBombEntity
{
}
