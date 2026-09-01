using System;
using System.Collections.Generic;

namespace Lumio.Game.ServerGameplay;

/// <summary>Persistence dimension of a Chat component field.</summary>
public enum ChatFieldPersistence
{
    /// <summary>Not persisted.</summary>
    None = 0,

    /// <summary>Eligible for ECS snapshot/restore; not a live client stream.</summary>
    PersistOnly = 1,

    /// <summary>Explicitly excluded from persistence (events / history).</summary>
    Excluded = 2
}

/// <summary>Replication dimension of a Chat component field.</summary>
public enum ChatFieldReplication
{
    /// <summary>Not replicated; never appears in the client property-sync stream.</summary>
    None = 0,

    /// <summary>Live delta notification (ChatMessageEvent, not component fields).</summary>
    LiveDelta = 1
}

/// <summary>Visibility dimension of a Chat component field.</summary>
public enum ChatFieldVisibility
{
    /// <summary>Visible only to the sending connection.</summary>
    SenderOnly = 0,

    /// <summary>Visible to the current Room.</summary>
    Room = 1,

    /// <summary>Authoritative server only.</summary>
    ServerOnly = 2
}

/// <summary>One declared Chat component/event/input field and its dimensions.</summary>
/// <param name="Name">Mapping field name as frozen in the envelope.</param>
/// <param name="TypeName">Envelope type token (<c>utf8-string</c> or <c>u64</c>).</param>
/// <param name="Persistence">Persistence dimension.</param>
/// <param name="Replication">Replication dimension.</param>
/// <param name="Visibility">Visibility dimension.</param>
public readonly record struct ChatFieldDeclaration(
    string Name,
    string TypeName,
    ChatFieldPersistence Persistence,
    ChatFieldReplication Replication,
    ChatFieldVisibility Visibility);

/// <summary>ECS field declarations for <see cref="ChatComponent"/>. Persist-only; not a client property-sync stream.</summary>
public static class ChatComponentSchema
{
    private static readonly ChatFieldDeclaration[] DeclaredFields =
    {
        new(
            "lastMessageText",
            "utf8-string",
            ChatFieldPersistence.PersistOnly,
            ChatFieldReplication.None,
            ChatFieldVisibility.ServerOnly),
        new(
            "lastMessageTick",
            "u64",
            ChatFieldPersistence.PersistOnly,
            ChatFieldReplication.None,
            ChatFieldVisibility.ServerOnly)
    };

    private static readonly ChatFieldDeclaration[] SyncStream = BuildClientPropertySyncStream();

    /// <summary>Declared last-message fields in mapping fieldOrder.</summary>
    public static IReadOnlyList<ChatFieldDeclaration> Fields => DeclaredFields;

    /// <summary>Declared field names in mapping fieldOrder.</summary>
    public static IReadOnlyList<string> FieldOrder => ChatMapping.ComponentFieldOrder;

    /// <summary>
    /// Fields that would appear in a client property-sync stream.
    /// Last-message state must not appear here (replication = none).
    /// </summary>
    public static IReadOnlyList<ChatFieldDeclaration> ClientPropertySyncStream => SyncStream;

    private static ChatFieldDeclaration[] BuildClientPropertySyncStream()
    {
        int count = 0;
        for (int i = 0; i < DeclaredFields.Length; i++)
        {
            if (DeclaredFields[i].Replication != ChatFieldReplication.None)
            {
                count++;
            }
        }

        if (count == 0)
        {
            return Array.Empty<ChatFieldDeclaration>();
        }

        var sync = new ChatFieldDeclaration[count];
        int written = 0;
        for (int i = 0; i < DeclaredFields.Length; i++)
        {
            if (DeclaredFields[i].Replication != ChatFieldReplication.None)
            {
                sync[written++] = DeclaredFields[i];
            }
        }

        return sync;
    }
}
