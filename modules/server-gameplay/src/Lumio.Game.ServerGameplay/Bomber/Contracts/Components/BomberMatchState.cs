using Lumio.GameRuntime.Ecs;

namespace Lumio.Game.ServerGameplay.Bomber.Contracts.Components;

/// <summary>
/// 世界级对局状态（design.md §4/§4.1/§13）。世界单例，随 World Manager 建世界诞生（唯一 World=true 挂载点）。
/// HatKingNetEntityId 以 NetEntityId 的裸 u64 编码存储（NetEntityId 不参与 Sync&lt;T&gt; 泛型约束，见 G-0 契约 §0）。
/// </summary>
[EcsComponent]
public sealed partial class BomberMatchState : Component
{
    [Persist] public Sync<ulong> MatchTick = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> StartTick = new(Scope.Room, Authority.Server);
    [Persist] public Sync<ulong> EndTick = new(Scope.Room, Authority.Server);

    /// <summary>0=Warmup, 1=Running, 2=Endgame, 3=Settlement(design.md §4.1)。</summary>
    [Persist] public Sync<int> Phase = new(Scope.Room, Authority.Server);

    /// <summary>当前帽王的 NetEntityId 裸编码；0 = 无帽王。</summary>
    [Persist] public Sync<ulong> HatKingNetEntityIdRaw = new(Scope.Room, Authority.Server);
}
