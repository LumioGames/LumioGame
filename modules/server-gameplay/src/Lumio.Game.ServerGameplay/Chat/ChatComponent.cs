// 兄弟文件：ChatComponent.Server.cs · generated/server/ChatComponent.g.cs（生成物，不手改）
// 共享文件：只放 RPC 声明；服务器私有状态与 ServerRpc 处理体在 .Server.cs。
using Lumio.GameRuntime.Ecs;

namespace Lumio.Game.ServerGameplay;

/// <summary>
/// 玩家实体上的聊天组件。聊天是玩法语义，组件归本仓所有（ADR-117 决策 4）；
/// 引擎测试夹具里的同名组件只服务引擎自己的测试，与本类互不依赖。
/// </summary>
[EcsComponent]
public sealed partial class ChatComponent : Component
{
    /// <summary>客户端 → 服务器的发言意图，映射公共契约 <c>chat.input</c>。处理体在 ApplyInputs 相执行，见 .Server.cs。</summary>
    [ServerRpc("chat.input")] public partial void SendMessage(string text);

    /// <summary>服务器 → 房间内客户端的一次性通知。line 由服务器拼成「名字: 内容」，随 WorldChange 下发，不存不回放。</summary>
    [ClientRpc(Scope.Room)] public partial void OnChatMessage(string line);
}
