// 兄弟文件：IdentityComponent.Server.cs · generated/server/IdentityComponent.g.cs（生成物，不手改）
// 共享文件：只放 Sync 字段；服务器私有字段在 .Server.cs。
using Lumio.GameRuntime.Ecs;

namespace Lumio.Game.ServerGameplay;

/// <summary>
/// 玩家身份组件，归本仓所有（ADR-117 决策 4）。实体是真人还是机器人看 EntityType，不另设字段。
/// </summary>
[EcsComponent]
public sealed partial class IdentityComponent : Component
{
    /// <summary>显示名：房间内公开、进快照。只由服务器写——名字来自账号权威，客户端不能自改。</summary>
    [Persist] public Sync<string> Name = new(Scope.Room, Authority.Server);
}
