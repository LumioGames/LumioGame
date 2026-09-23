// EntityType 声明：abstract、无成员，玩法代码不经它读数据；生成器据此产出模板与注册表。
using Lumio.GameRuntime.Ecs;

namespace Lumio.Game.ServerGameplay;

/// <summary>
/// 连接绑定的真人玩家：身份 + 聊天。类型名决定线名 <c>player</c>，这是 Runtime 准入闭集（player | bot）要求的拼写。
/// 炸弹人对局里的 <see cref="Bomber.Contracts.EntityTypes.BomberPlayerEntity"/> 是 Stage 0 冻结契约里的另一类实体，本类不改动它。
/// </summary>
[EntityType(Mode.CS)]
[Has(typeof(ObserverComponent))]
[Has(typeof(IdentityComponent))]
[Has(typeof(ChatComponent))]
public abstract class PlayerEntity
{
}
