using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;

namespace Lumio.Game.ServerGameplay;

/// <summary>
/// C# MVP Room host for the 101-entity chat slice: admission, binding, query, chat, reconnect, isolation.
/// Does not accept username/password; callers must pass a C-3 verified admission payload.
/// </summary>
public sealed class GameRoomHost : IDisposable
{
    /// <summary>Production reconnect retention window.</summary>
    public static readonly TimeSpan DefaultReconnectWindow = TimeSpan.FromMinutes(5);

    private readonly object _gate = new();
    private readonly IHostMonotonicClock _clock;
    private readonly long _reconnectWindowMs;
    private readonly Dictionary<string, RoomState> _rooms = new(StringComparer.Ordinal);
    private readonly Dictionary<string, LiveEntity> _byConnection = new(StringComparer.Ordinal);
    private readonly Dictionary<string, LiveEntity> _byAccount = new(StringComparer.Ordinal);
    private readonly Dictionary<ulong, Tombstone> _tombstones = new();
    private readonly Dictionary<string, List<TakeoverNotice>> _notices = new(StringComparer.Ordinal);
    private readonly BlockingCollection<Action> _ownerQueue = new();
    private readonly Thread _ownerThread;
    private ulong _nextNetEntityId = 1;

    /// <summary>Runs every Room world on a dedicated Simulation Owner Thread.</summary>
    public GameRoomHost(TimeSpan? reconnectWindow = null, IHostMonotonicClock? clock = null)
    {
        _clock = clock ?? new SystemMonotonicClock();
        TimeSpan window = reconnectWindow ?? DefaultReconnectWindow;
        if (window <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(reconnectWindow));
        }

        _reconnectWindowMs = (long)window.TotalMilliseconds;
        _ownerThread = new Thread(OwnerLoop)
        {
            IsBackground = true,
            Name = "lumio-game-room-host"
        };
        _ownerThread.Start();
    }

    /// <inheritdoc />
    public void Dispose()
    {
        _ownerQueue.CompleteAdding();
        if (!_ownerThread.Join(2000))
        {
            _ownerQueue.Dispose();
            return;
        }

        _ownerQueue.Dispose();
    }

    private bool IsOwnerThread() => ReferenceEquals(Thread.CurrentThread, _ownerThread);

    private void OwnerLoop()
    {
        foreach (Action work in _ownerQueue.GetConsumingEnumerable())
        {
            work();
        }
    }

    private T OnOwner<T>(Func<T> action)
    {
        if (IsOwnerThread())
        {
            return action();
        }

        var done = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        _ownerQueue.Add(() =>
        {
            try
            {
                done.SetResult(action());
            }
            catch (Exception ex)
            {
                done.SetException(ex);
            }
        });
        return done.Task.GetAwaiter().GetResult();
    }

    /// <summary>Admits a verified account into <paramref name="roomId"/>.</summary>
    public RoomAdmitResult Admit(string roomId, string connectionId, VerifiedAdmission admission)
    {
        if (!IsOwnerThread())
        {
            return OnOwner(() => Admit(roomId, connectionId, admission));
        }

        if (string.IsNullOrEmpty(roomId) || string.IsNullOrEmpty(connectionId)
            || string.IsNullOrEmpty(admission.AccountId) || string.IsNullOrEmpty(admission.LoginName))
        {
            return RoomAdmitResult.Reject("invalid_request");
        }

        if (BotLaunchNames.IsBotNamespace(admission.LoginName) && !admission.BotToolContext)
        {
            return RoomAdmitResult.Reject("bot_namespace_admission_forbidden");
        }

        GameEntityKind kind = GameEntityKindRules.Classify(admission.LoginName, admission.BotToolContext);
        lock (_gate)
        {
            ExpireDueLocked();
            if (_byConnection.ContainsKey(connectionId))
            {
                return RoomAdmitResult.Reject("invalid_request");
            }

            if (_byAccount.TryGetValue(admission.AccountId, out LiveEntity? existing))
            {
                if (!string.Equals(existing.RoomId, roomId, StringComparison.Ordinal))
                {
                    return RoomAdmitResult.Reject("invalid_request");
                }

                if (existing.Presence == BindingPresence.Active)
                {
                    return TakeoverLocked(existing, connectionId);
                }

                return RebindLocked(existing, connectionId, reconnected: true, takeover: false);
            }

            RoomState room = GetOrCreateRoomLocked(roomId);
            ulong netEntityId = _nextNetEntityId++;
            if (!room.World.TryCreateEntity(netEntityId))
            {
                return RoomAdmitResult.Reject("invalid_request");
            }

            var live = new LiveEntity(
                admission.AccountId,
                admission.LoginName,
                roomId,
                netEntityId,
                kind,
                generation: 1UL);
            live.Bind(connectionId);
            room.Entities[netEntityId] = live;
            _byAccount[admission.AccountId] = live;
            _byConnection[connectionId] = live;
            return RoomAdmitResult.Ok(live.Binding(), reconnected: false, takeover: false);
        }
    }

    /// <summary>Game Server never accepts username/password as a substitute for Account Server admission.</summary>
    public bool TryAdmitUsernamePassword(string roomId, string connectionId, string loginName, string password)
    {
        _ = roomId;
        _ = connectionId;
        _ = loginName;
        _ = password;
        _ = _clock;
        return false;
    }

    /// <summary>Disconnects a live connection and starts the reconnect window. The entity is retained.</summary>
    public bool Disconnect(string connectionId)
    {
        if (!IsOwnerThread())
        {
            return OnOwner(() => Disconnect(connectionId));
        }

        if (string.IsNullOrEmpty(connectionId))
        {
            return false;
        }

        lock (_gate)
        {
            ExpireDueLocked();
            if (!_byConnection.TryGetValue(connectionId, out LiveEntity? live)
                || live.Presence != BindingPresence.Active
                || !string.Equals(live.ConnectionId, connectionId, StringComparison.Ordinal))
            {
                return false;
            }

            _byConnection.Remove(connectionId);
            live.Disconnect(_clock.Milliseconds);
            return true;
        }
    }

    /// <summary>Advances the host monotonic clock (tests and harness expiry).</summary>
    public void AdvanceMonotonic(TimeSpan delta) => _clock.Advance(delta);

    /// <summary>Destroys disconnected entities whose retention window has elapsed.</summary>
    public int ExpireDue()
    {
        if (!IsOwnerThread())
        {
            return OnOwner(ExpireDue);
        }

        lock (_gate)
        {
            return ExpireDueLocked();
        }
    }

    /// <summary>
    /// Decodes a frozen InputCommand (chat.input) envelope, then queues ChatInput for the next tick.
    /// Hash mismatch is rejected before any room/chat state is read.
    /// </summary>
    public ChatOperationResult AdmitChatInput(string connectionId, InputCommandEnvelope envelope)
    {
        if (!IsOwnerThread())
        {
            return OnOwner(() => AdmitChatInput(connectionId, envelope));
        }

        if (!InputCommandEnvelope.TryDecodeChatText(envelope, out string text, out string envelopeError))
        {
            return ChatOperationResult.Rejected(envelopeError);
        }

        if (string.IsNullOrEmpty(connectionId))
        {
            return ChatOperationResult.Rejected("invalid_request");
        }

        lock (_gate)
        {
            ExpireDueLocked();
            if (!_byConnection.TryGetValue(connectionId, out LiveEntity? live)
                || live.Presence != BindingPresence.Active)
            {
                return ChatOperationResult.Rejected("disconnected");
            }

            RoomState room = _rooms[live.RoomId];
            return room.World.AdmitChatInput(live.NetEntityId, new ChatInput(text));
        }
    }

    /// <summary>Advances one fixed tick in <paramref name="roomId"/> and broadcasts live events to Room members.</summary>
    public RoomTickResult RunTick(string roomId)
    {
        if (!IsOwnerThread())
        {
            return OnOwner(() => RunTick(roomId));
        }

        if (string.IsNullOrEmpty(roomId))
        {
            return new RoomTickResult(0, Array.Empty<ChatMessageEvent>());
        }

        lock (_gate)
        {
            ExpireDueLocked();
            if (!_rooms.TryGetValue(roomId, out RoomState? room))
            {
                return new RoomTickResult(0, Array.Empty<ChatMessageEvent>());
            }

            ChatTickResult tick = room.World.RunTick();
            room.Revision++;
            for (int i = 0; i < tick.Events.Length; i++)
            {
                ChatMessageEvent ev = tick.Events[i];
                foreach (LiveEntity live in room.Entities.Values)
                {
                    if (live.Presence == BindingPresence.Active && live.ConnectionId is not null)
                    {
                        live.Window.Add(ev);
                    }
                }
            }

            return new RoomTickResult(tick.AppliedTick, tick.Events);
        }
    }

    /// <summary>Client self-lookup of the current binding.</summary>
    public bool TrySelfLookup(string connectionId, out ConnectionBinding binding)
    {
        if (!IsOwnerThread())
        {
            (bool ok, ConnectionBinding b) = OnOwner(() =>
            {
                bool inner = TrySelfLookup(connectionId, out ConnectionBinding found);
                return (inner, found);
            });
            binding = b;
            return ok;
        }

        lock (_gate)
        {
            if (_byConnection.TryGetValue(connectionId, out LiveEntity? live)
                && live.Presence == BindingPresence.Active)
            {
                binding = live.Binding();
                return true;
            }

            binding = default;
            return false;
        }
    }

    /// <summary>Returns the current binding or throws if the connection is not admitted.</summary>
    public ConnectionBinding MustSelf(string connectionId)
    {
        if (!TrySelfLookup(connectionId, out ConnectionBinding binding))
        {
            throw new InvalidOperationException("connection is not bound: " + connectionId);
        }

        return binding;
    }

    /// <summary>Server resolve of an admitted connection in a Room.</summary>
    public bool TryResolveByConnection(string roomId, string connectionId, out ConnectionBinding binding)
    {
        if (!IsOwnerThread())
        {
            (bool ok, ConnectionBinding b) = OnOwner(() =>
            {
                bool inner = TryResolveByConnection(roomId, connectionId, out ConnectionBinding found);
                return (inner, found);
            });
            binding = b;
            return ok;
        }

        lock (_gate)
        {
            if (_byConnection.TryGetValue(connectionId, out LiveEntity? live)
                && live.Presence == BindingPresence.Active
                && string.Equals(live.RoomId, roomId, StringComparison.Ordinal))
            {
                binding = live.Binding();
                return true;
            }

            binding = default;
            return false;
        }
    }

    /// <summary>Server resolve of a NetEntityId in a Room. Tombstoned ids never alias a replacement.</summary>
    public bool TryResolveByNetEntityId(string roomId, ulong netEntityId, out EntityResolution resolution)
    {
        if (!IsOwnerThread())
        {
            (bool ok, EntityResolution r) = OnOwner(() =>
            {
                bool inner = TryResolveByNetEntityId(roomId, netEntityId, out EntityResolution found);
                return (inner, found);
            });
            resolution = r;
            return ok;
        }

        lock (_gate)
        {
            if (_rooms.TryGetValue(roomId, out RoomState? room)
                && room.Entities.TryGetValue(netEntityId, out LiveEntity? live))
            {
                resolution = new EntityResolution(live.NetEntityId, live.RoomId, live.EntityType, live.AccountId);
                return true;
            }

            resolution = default;
            return false;
        }
    }

    /// <summary>C-2 Attribute Query with explicit failure outcomes.</summary>
    public AttributeQueryResult QueryAttribute(AttributeQueryRequest request)
    {
        if (!IsOwnerThread())
        {
            return OnOwner(() => QueryAttribute(request));
        }

        if (request.AttributeId is null || request.RoomId is null)
        {
            return AttributeQueryResult.RequestError("invalid_request");
        }

        lock (_gate)
        {
            ExpireDueLocked();
            if (ClassifyAttributeId(request.AttributeId, out AttributeQueryResult classified))
            {
                return classified;
            }

            if (_tombstones.TryGetValue(request.NetEntityId, out Tombstone tombstone))
            {
                if (!string.Equals(tombstone.RoomId, request.RoomId, StringComparison.Ordinal))
                {
                    return AttributeQueryResult.RequestError("cross_room_reference");
                }

                return AttributeQueryResult.Fail(AttributeQueryOutcome.Tombstoned);
            }

            LiveEntity? live = FindEntityLocked(request.NetEntityId);
            if (live is null)
            {
                return AttributeQueryResult.Fail(AttributeQueryOutcome.NonExistent);
            }

            if (!string.Equals(live.RoomId, request.RoomId, StringComparison.Ordinal))
            {
                return AttributeQueryResult.RequestError("cross_room_reference");
            }

            if (request.ConnectionGeneration is ulong generation && generation < live.Generation)
            {
                return AttributeQueryResult.Fail(AttributeQueryOutcome.StaleGeneration);
            }

            return ReadAttributeLocked(live, request);
        }
    }

    /// <summary>Captures persist-only last-message fields. Chat history is omitted.</summary>
    public ChatPersistSnapshot CapturePersistSnapshot(string roomId)
    {
        if (!IsOwnerThread())
        {
            return OnOwner(() => CapturePersistSnapshot(roomId));
        }

        lock (_gate)
        {
            if (!_rooms.TryGetValue(roomId, out RoomState? room))
            {
                return new ChatPersistSnapshot(Array.Empty<ChatPersistEntity>());
            }

            ChatPersistEntityState[] states = room.World.CapturePersistState();
            var entities = new ChatPersistEntity[states.Length];
            for (int i = 0; i < states.Length; i++)
            {
                ChatPersistEntityState state = states[i];
                LiveEntity live = room.Entities[state.NetEntityId];
                entities[i] = new ChatPersistEntity(
                    state.NetEntityId,
                    live.AccountId,
                    live.EntityType,
                    state.LastMessageText,
                    state.LastMessageTick);
            }

            return new ChatPersistSnapshot(entities);
        }
    }

    /// <summary>Restores persist-only last-message fields into a Room. Does not restore chat windows.</summary>
    public void RestorePersistSnapshot(string roomId, ChatPersistSnapshot snapshot)
    {
        if (!IsOwnerThread())
        {
            OnOwner(() =>
            {
                RestorePersistSnapshot(roomId, snapshot);
                return 0;
            });
            return;
        }

        if (string.IsNullOrEmpty(roomId) || snapshot.Entities is null)
        {
            return;
        }

        lock (_gate)
        {
            RoomState room = GetOrCreateRoomLocked(roomId);
            foreach (ChatPersistEntity entity in snapshot.Entities)
            {
                if (!room.World.TryCreateEntity(entity.NetEntityId))
                {
                    continue;
                }

                room.World.TryRestoreLastMessage(entity.NetEntityId, entity.LastMessageText, entity.LastMessageTick);
                if (entity.NetEntityId >= _nextNetEntityId)
                {
                    _nextNetEntityId = entity.NetEntityId + 1;
                }

                var live = new LiveEntity(
                    entity.AccountId,
                    loginName: string.Empty,
                    roomId,
                    entity.NetEntityId,
                    entity.EntityType,
                    generation: 1UL);
                room.Entities[entity.NetEntityId] = live;
                if (!string.IsNullOrEmpty(entity.AccountId))
                {
                    _byAccount[entity.AccountId] = live;
                }
            }
        }
    }

    /// <summary>Reads restored or live last-message component state.</summary>
    public bool TryGetLastMessage(ulong netEntityId, string roomId, out ChatComponent? component)
    {
        if (!IsOwnerThread())
        {
            (bool ok, ChatComponent? found) = OnOwner(() =>
            {
                bool inner = TryGetLastMessage(netEntityId, roomId, out ChatComponent? value);
                return (inner, value);
            });
            component = found;
            return ok;
        }

        lock (_gate)
        {
            if (_rooms.TryGetValue(roomId, out RoomState? room)
                && room.World.TryGetComponent(netEntityId, out ChatComponent found))
            {
                component = found;
                return true;
            }

            component = null;
            return false;
        }
    }

    /// <summary>Live BotEntity plus PlayerEntity counts. Tombstones are excluded.</summary>
    public RoomCensus Census(string roomId)
    {
        if (!IsOwnerThread())
        {
            return OnOwner(() => Census(roomId));
        }

        lock (_gate)
        {
            ExpireDueLocked();
            if (!_rooms.TryGetValue(roomId, out RoomState? room))
            {
                return new RoomCensus(0, 0, 0, Array.Empty<ulong>(), Array.Empty<GameEntityKind>());
            }

            int bots = 0;
            int players = 0;
            var ids = new ulong[room.Entities.Count];
            var kinds = new GameEntityKind[room.Entities.Count];
            int i = 0;
            foreach (LiveEntity live in room.Entities.Values)
            {
                ids[i] = live.NetEntityId;
                kinds[i] = live.EntityType;
                i++;
                if (live.EntityType == GameEntityKind.Bot)
                {
                    bots++;
                }
                else
                {
                    players++;
                }
            }

            return new RoomCensus(bots, players, bots + players, ids, kinds);
        }
    }

    /// <summary>Client-local chat window. Independent of persist-only last-message fields.</summary>
    public IReadOnlyList<ChatMessageEvent> ClientChatWindow(string connectionId)
    {
        if (!IsOwnerThread())
        {
            return OnOwner(() => ClientChatWindow(connectionId));
        }

        lock (_gate)
        {
            if (_byConnection.TryGetValue(connectionId, out LiveEntity? live))
            {
                return live.Window.ToArray();
            }

            return Array.Empty<ChatMessageEvent>();
        }
    }

    /// <summary>Drains takeover notices queued for a kicked connection.</summary>
    public IReadOnlyList<TakeoverNotice> TakeTerminationNotices(string connectionId)
    {
        if (!IsOwnerThread())
        {
            return OnOwner(() => TakeTerminationNotices(connectionId));
        }

        lock (_gate)
        {
            if (_notices.TryGetValue(connectionId, out List<TakeoverNotice>? list))
            {
                _notices.Remove(connectionId);
                return list;
            }

            return Array.Empty<TakeoverNotice>();
        }
    }

    private RoomAdmitResult TakeoverLocked(LiveEntity existing, string newConnectionId)
    {
        string? oldConnection = existing.ConnectionId;
        if (oldConnection is not null)
        {
            _byConnection.Remove(oldConnection);
            QueueNoticeLocked(oldConnection, reconnectEligible: true);
        }

        return RebindLocked(existing, newConnectionId, reconnected: false, takeover: true);
    }

    private RoomAdmitResult RebindLocked(LiveEntity existing, string newConnectionId, bool reconnected, bool takeover)
    {
        existing.Bind(newConnectionId);
        existing.Generation++;
        existing.Window.Clear();
        _byConnection[newConnectionId] = existing;
        return RoomAdmitResult.Ok(existing.Binding(), reconnected, takeover);
    }

    private void QueueNoticeLocked(string connectionId, bool reconnectEligible)
    {
        if (!_notices.TryGetValue(connectionId, out List<TakeoverNotice>? list))
        {
            list = new List<TakeoverNotice>();
            _notices[connectionId] = list;
        }

        list.Add(new TakeoverNotice(
            "connection_superseded",
            reconnectEligible,
            (ulong)Math.Max(0, _clock.Milliseconds / 1000)));
    }

    private int ExpireDueLocked()
    {
        long now = _clock.Milliseconds;
        var due = new List<LiveEntity>();
        foreach (LiveEntity live in _byAccount.Values)
        {
            if (live.Presence == BindingPresence.Disconnected
                && live.DisconnectedAtMs is long at
                && now - at >= _reconnectWindowMs)
            {
                due.Add(live);
            }
        }

        for (int i = 0; i < due.Count; i++)
        {
            DestroyLocked(due[i]);
        }

        return due.Count;
    }

    private void DestroyLocked(LiveEntity live)
    {
        if (_rooms.TryGetValue(live.RoomId, out RoomState? room))
        {
            room.World.DestroyEntity(live.NetEntityId);
            room.Entities.Remove(live.NetEntityId);
        }

        _tombstones[live.NetEntityId] = new Tombstone(live.RoomId, live.AccountId);
        _byAccount.Remove(live.AccountId);
        if (live.ConnectionId is not null)
        {
            _byConnection.Remove(live.ConnectionId);
        }
    }

    private RoomState GetOrCreateRoomLocked(string roomId)
    {
        if (!_rooms.TryGetValue(roomId, out RoomState? room))
        {
            room = new RoomState(new ChatRoomWorld());
            _rooms[roomId] = room;
        }

        return room;
    }

    private LiveEntity? FindEntityLocked(ulong netEntityId)
    {
        foreach (RoomState room in _rooms.Values)
        {
            if (room.Entities.TryGetValue(netEntityId, out LiveEntity? live))
            {
                return live;
            }
        }

        return null;
    }

    private AttributeQueryResult ReadAttributeLocked(LiveEntity live, AttributeQueryRequest request)
    {
        RoomState room = _rooms[live.RoomId];
        ulong tick = room.World.CurrentTick;
        ulong revision = room.Revision;
        bool client = request.CallerScope == AttributeQueryScope.ClientReplica;
        switch (request.AttributeId)
        {
            case "EntityIdentity.entityType":
                return AttributeQueryResult.Ok(
                    live.EntityType == GameEntityKind.Bot ? "bot" : "player",
                    tick,
                    revision);
            case "EntityIdentity.accountId":
                return client
                    ? AttributeQueryResult.Fail(AttributeQueryOutcome.Invisible)
                    : AttributeQueryResult.Ok(live.AccountId, tick, revision);
            case "EntityIdentity.restrictedFlag":
                return client
                    ? AttributeQueryResult.Fail(AttributeQueryOutcome.Unauthorized)
                    : AttributeQueryResult.Ok("0", tick, revision);
            case "EntityPresence.disconnected":
                return AttributeQueryResult.Ok(
                    live.Presence == BindingPresence.Disconnected ? "true" : "false",
                    tick,
                    revision);
            case "ChatComponent.lastMessageText":
            case "ChatComponent.lastMessageTick":
                if (client)
                {
                    return AttributeQueryResult.Fail(AttributeQueryOutcome.Invisible);
                }

                if (!room.World.TryGetComponent(live.NetEntityId, out ChatComponent component))
                {
                    return AttributeQueryResult.Fail(AttributeQueryOutcome.NonExistent);
                }

                string value = request.AttributeId == "ChatComponent.lastMessageText"
                    ? component.LastMessageText
                    : component.LastMessageTick.ToString(CultureInfo.InvariantCulture);
                return AttributeQueryResult.Ok(value, tick, revision);
            default:
                return AttributeQueryResult.RequestError("undeclared_attribute");
        }
    }

    private static bool ClassifyAttributeId(string attributeId, out AttributeQueryResult result)
    {
        if (attributeId.Contains('(')
            || attributeId.StartsWith("Storage.", StringComparison.Ordinal)
            || attributeId.Contains('/')
            || attributeId.Contains('\\'))
        {
            result = AttributeQueryResult.RequestError("storage_access_forbidden");
            return true;
        }

        if (!IsDeclaredAttributeGrammar(attributeId))
        {
            result = AttributeQueryResult.RequestError("invalid_attribute_id");
            return true;
        }

        result = default;
        return false;
    }

    private static bool IsDeclaredAttributeGrammar(string attributeId)
    {
        int dot = attributeId.IndexOf('.');
        if (dot <= 0 || dot != attributeId.LastIndexOf('.') || dot == attributeId.Length - 1)
        {
            return false;
        }

        char first = attributeId[0];
        if (first < 'A' || first > 'Z')
        {
            return false;
        }

        for (int i = 1; i < dot; i++)
        {
            if (!IsAttrChar(attributeId[i]))
            {
                return false;
            }
        }

        char attr = attributeId[dot + 1];
        if (attr < 'a' || attr > 'z')
        {
            return false;
        }

        for (int i = dot + 2; i < attributeId.Length; i++)
        {
            if (!IsAttrChar(attributeId[i]))
            {
                return false;
            }
        }

        return true;
    }

    private static bool IsAttrChar(char c)
        => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');

    private enum BindingPresence
    {
        Active = 0,
        Disconnected = 1
    }

    private sealed class RoomState
    {
        public RoomState(ChatRoomWorld world)
        {
            World = world;
        }

        public ChatRoomWorld World { get; }

        public Dictionary<ulong, LiveEntity> Entities { get; } = new();

        public ulong Revision { get; set; }
    }

    private sealed class LiveEntity
    {
        public LiveEntity(
            string accountId,
            string loginName,
            string roomId,
            ulong netEntityId,
            GameEntityKind entityType,
            ulong generation)
        {
            AccountId = accountId;
            LoginName = loginName;
            RoomId = roomId;
            NetEntityId = netEntityId;
            EntityType = entityType;
            Generation = generation;
        }

        public string AccountId { get; }

        public string LoginName { get; }

        public string RoomId { get; }

        public ulong NetEntityId { get; }

        public GameEntityKind EntityType { get; }

        public ulong Generation { get; set; }

        public BindingPresence Presence { get; private set; }

        public string? ConnectionId { get; private set; }

        public long? DisconnectedAtMs { get; private set; }

        public List<ChatMessageEvent> Window { get; } = new();

        public void Bind(string connectionId)
        {
            ConnectionId = connectionId;
            Presence = BindingPresence.Active;
            DisconnectedAtMs = null;
        }

        public void Disconnect(long nowMs)
        {
            Presence = BindingPresence.Disconnected;
            ConnectionId = null;
            DisconnectedAtMs = nowMs;
        }

        public ConnectionBinding Binding()
            => new(AccountId, RoomId, NetEntityId, EntityType, Generation);
    }

    private readonly struct Tombstone
    {
        public Tombstone(string roomId, string accountId)
        {
            RoomId = roomId;
            AccountId = accountId;
        }

        public string RoomId { get; }

        public string AccountId { get; }
    }
}

/// <summary>C-3 takeover termination notice delivered on the kicked Game connection.</summary>
/// <param name="ReasonCode">Always <c>connection_superseded</c>.</param>
/// <param name="ReconnectEligible">Whether the kicked client may re-login into the window.</param>
/// <param name="IssuedAt">Host epoch seconds for the notice.</param>
public readonly record struct TakeoverNotice(string ReasonCode, bool ReconnectEligible, ulong IssuedAt);
