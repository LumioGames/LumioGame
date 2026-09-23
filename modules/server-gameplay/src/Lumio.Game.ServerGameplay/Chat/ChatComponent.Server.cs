// 兄弟文件：ChatComponent.cs · generated/server/ChatComponent.g.cs（生成物，不手改）
// 服务器文件：last-message 状态与 SendMessage 处理体只在服务器存在。
using System.Text;
using Lumio.GameRuntime.Ecs;
using RuntimeChatMapping = Lumio.GameRuntime.Replication.Chat.ChatMapping;

namespace Lumio.Game.ServerGameplay;

public sealed partial class ChatComponent
{
    /// <summary>最后一句话：服务器私有、进快照、不同步（契约字段 <c>lastMessageText</c>）。</summary>
    [Persist] public Sync<string> LastMessageText = new(Scope.None);

    /// <summary>最后一句话提交时的权威 Tick（契约字段 <c>lastMessageTick</c>）。</summary>
    [Persist] public Sync<ulong> LastMessageTick = new(Scope.None);

    /// <summary>
    /// ServerRpc 处理体，也是 last-message 的唯一写入口：取同一实体的名字 → 拼行 → 校验 → 写字段 → 发事件。
    /// 空文本或拼好的行超过 <see cref="RuntimeChatMapping.MaxTextUtf8Bytes"/> 字节即拒绝：不写字段、不发事件。
    /// </summary>
    public partial void SendMessage(string text)
    {
        if (string.IsNullOrEmpty(text)) return;

        string name = Get<IdentityComponent>().Name;
        string line = $"{name}: {text}";
        if (Encoding.UTF8.GetByteCount(line) > RuntimeChatMapping.MaxTextUtf8Bytes) return;

        LastMessageText.Value = text;
        LastMessageTick.Value = World.Tick;

        OnChatMessage(line);
    }
}
