// 兄弟文件：IdentityComponent.cs · generated/server/IdentityComponent.g.cs（生成物，不手改）
// 服务器文件：客户端读不到、不上网。
using Lumio.GameRuntime.Ecs;

namespace Lumio.Game.ServerGameplay;

public sealed partial class IdentityComponent
{
    /// <summary>
    /// 持久业务身份：服务器私有、进快照。字段线名必须是 <c>accountId</c>——Runtime 的准入绑定与账号索引按这个字段名认账号组件。
    /// </summary>
    [Persist] public Sync<string> AccountId = new(Scope.None);
}
