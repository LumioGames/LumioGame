using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Lumio.Game.ServerGameplay;
using Xunit;

namespace Lumio.Game.ServerGameplay.Tests;

public sealed class EntityChatAcceptanceTests
{
    private const string MainRoom = "room-main";
    private const string IsoRoom = "room-iso";
    private const string BrowserName = "Browser01";
    private const string TestPassword = "123456";

    [Fact]
    public void Scenario1_LoginOrRegisterCreatesStableAccountAndRejectsWrongPassword()
    {
        Assert.Equal("123456", TestPassword);
        Assert.True(BotLaunchNames.IsBotNamespace("Bot01"));

        var host = NewHost();
        VerifiedAdmission first = BotAdmission("Bot01");
        RoomAdmitResult created = host.Admit(MainRoom, "c-bot01-a", first);
        Assert.True(created.Accepted);
        ConnectionBinding createdBinding = MustBinding(created);
        Assert.Equal(GameEntityKind.Bot, createdBinding.EntityType);
        string accountId = createdBinding.AccountId;
        Assert.StartsWith("acct_", accountId, StringComparison.Ordinal);

        RoomAdmitResult repeat = host.Admit(MainRoom, "c-bot01-b", first);
        Assert.True(repeat.Accepted);
        ConnectionBinding repeatBinding = MustBinding(repeat);
        Assert.Equal(accountId, repeatBinding.AccountId);
        Assert.Equal(createdBinding.NetEntityId, repeatBinding.NetEntityId);
        Assert.True(repeat.Takeover);
        Assert.True(repeatBinding.ConnectionGeneration > createdBinding.ConnectionGeneration);

        Assert.False(host.TryAdmitUsernamePassword(MainRoom, "c-evil", "Bot01", "wrong"));
    }

    [Fact]
    public void Scenario2_BotLaunchCreatesExactly100BotEntitiesInOneRoom()
    {
        var host = NewHost();
        AdmitBots(host, MainRoom, 100);

        RoomCensus census = host.Census(MainRoom);
        Assert.Equal(100, census.BotCount);
        Assert.Equal(0, census.PlayerCount);
        Assert.Equal(100, census.Total);
        Assert.Equal(100, census.NetEntityIds.Distinct().Count());
    }

    [Fact]
    public void Scenario3_BrowserAdmissionBringsRoomTo101GameEntities()
    {
        var host = NewHost();
        AdmitBots(host, MainRoom, 100);
        RoomAdmitResult browser = host.Admit(MainRoom, "c-browser", PlayerAdmission(BrowserName));

        Assert.True(browser.Accepted);
        Assert.Equal(GameEntityKind.Player, MustBinding(browser).EntityType);
        Assert.False(BotLaunchNames.IsBotNamespace(BrowserName));

        RoomCensus census = host.Census(MainRoom);
        Assert.Equal(100, census.BotCount);
        Assert.Equal(1, census.PlayerCount);
        Assert.Equal(101, census.Total);
    }

    [Fact]
    public void Scenario4_EveryAdmittedConnectionResolvesSelfAndServerBinding()
    {
        var host = NewHost();
        Dictionary<string, RoomAdmitResult> admitted = AdmitFullRoom(host);

        foreach (KeyValuePair<string, RoomAdmitResult> pair in admitted)
        {
            ConnectionBinding expected = MustBinding(pair.Value);
            Assert.True(host.TrySelfLookup(pair.Key, out ConnectionBinding self));
            Assert.Equal(expected.NetEntityId, self.NetEntityId);
            Assert.Equal(expected.AccountId, self.AccountId);
            Assert.Equal(MainRoom, self.RoomId);
            Assert.Equal(expected.EntityType, self.EntityType);

            Assert.True(host.TryResolveByConnection(MainRoom, pair.Key, out ConnectionBinding byConn));
            Assert.Equal(self.NetEntityId, byConn.NetEntityId);

            Assert.True(host.TryResolveByNetEntityId(MainRoom, self.NetEntityId, out EntityResolution byId));
            Assert.Equal(self.AccountId, byId.AccountId);
            Assert.Equal(self.EntityType, byId.EntityType);
            Assert.Equal(self.NetEntityId, byId.NetEntityId);
        }
    }

    [Fact]
    public void Scenario5_AttributeQueryReturnsExplicitFailuresAndNeverAliases()
    {
        var host = NewHost();
        Dictionary<string, RoomAdmitResult> admitted = AdmitFullRoom(host);
        ConnectionBinding browser = MustBinding(admitted["c-browser"]);
        ulong n1 = browser.NetEntityId;

        AttributeQueryResult ok = host.QueryAttribute(new AttributeQueryRequest(
            AttributeQueryScope.ServerAuthoritative,
            MainRoom,
            n1,
            "EntityIdentity.entityType"));
        Assert.Equal(AttributeQueryOutcome.Ok, ok.Outcome);
        Assert.Equal("player", ok.Value);
        Assert.True(ok.ObservedTick >= 0);

        AttributeQueryResult invisible = host.QueryAttribute(new AttributeQueryRequest(
            AttributeQueryScope.ClientReplica,
            MainRoom,
            n1,
            "ChatComponent.lastMessageText"));
        Assert.Equal(AttributeQueryOutcome.Invisible, invisible.Outcome);
        Assert.Null(invisible.Value);

        AttributeQueryResult unauthorized = host.QueryAttribute(new AttributeQueryRequest(
            AttributeQueryScope.ClientReplica,
            MainRoom,
            n1,
            "EntityIdentity.restrictedFlag"));
        Assert.Equal(AttributeQueryOutcome.Unauthorized, unauthorized.Outcome);

        AttributeQueryResult missing = host.QueryAttribute(new AttributeQueryRequest(
            AttributeQueryScope.ServerAuthoritative,
            MainRoom,
            999999UL,
            "EntityIdentity.entityType"));
        Assert.Equal(AttributeQueryOutcome.NonExistent, missing.Outcome);

        AttributeQueryResult stale = host.QueryAttribute(new AttributeQueryRequest(
            AttributeQueryScope.ServerAuthoritative,
            MainRoom,
            n1,
            "EntityIdentity.entityType",
            ConnectionGeneration: 0));
        Assert.Equal(AttributeQueryOutcome.StaleGeneration, stale.Outcome);

        host.Disconnect("c-bot01");
        host.AdvanceMonotonic(TimeSpan.FromMinutes(6));
        Assert.Equal(1, host.ExpireDue());
        ulong tombstonedId = MustBinding(admitted["c-bot01"]).NetEntityId;
        RoomAdmitResult reincarnated = host.Admit(MainRoom, "c-bot01-new", BotAdmission("Bot01"));
        Assert.True(reincarnated.Accepted);
        Assert.NotEqual(tombstonedId, MustBinding(reincarnated).NetEntityId);

        AttributeQueryResult tombstoned = host.QueryAttribute(new AttributeQueryRequest(
            AttributeQueryScope.ServerAuthoritative,
            MainRoom,
            tombstonedId,
            "EntityIdentity.entityType"));
        Assert.Equal(AttributeQueryOutcome.Tombstoned, tombstoned.Outcome);
        Assert.NotEqual(tombstonedId, MustBinding(reincarnated).NetEntityId);

        AttributeQueryResult sql = host.QueryAttribute(new AttributeQueryRequest(
            AttributeQueryScope.ServerAuthoritative,
            MainRoom,
            n1,
            "SELECT * FROM entities"));
        Assert.Equal(AttributeQueryOutcome.RequestError, sql.Outcome);
        Assert.Equal("invalid_attribute_id", sql.ErrorCode);

        AttributeQueryResult storage = host.QueryAttribute(new AttributeQueryRequest(
            AttributeQueryScope.ServerAuthoritative,
            MainRoom,
            n1,
            "Storage.row"));
        Assert.Equal(AttributeQueryOutcome.RequestError, storage.Outcome);
        Assert.Equal("storage_access_forbidden", storage.ErrorCode);
    }

    [Fact]
    public void Scenario6_ChatPathUpdatesSenderAtNextTickAndAllRoomClientsDisplay()
    {
        var host = NewHost();
        AdmitFullRoom(host);

        ChatOperationResult admitted = host.AdmitChatInput("c-bot01", "gg from bot");
        Assert.Equal(ChatOperationKind.Admitted, admitted.Kind);
        Assert.Empty(host.ClientChatWindow("c-browser"));

        RoomTickResult tick = host.RunTick(MainRoom);
        Assert.Equal(1UL, tick.AppliedTick);
        ChatMessageEvent emitted = Assert.Single(tick.Events);
        Assert.Equal("gg from bot", emitted.Text);
        Assert.Equal(tick.AppliedTick, emitted.AppliedTick);
        Assert.Equal(host.MustSelf("c-bot01").NetEntityId, emitted.SenderNetEntityId);

        ChatMessageEvent browserView = Assert.Single(host.ClientChatWindow("c-browser"));
        Assert.Equal(emitted, browserView);
        ChatMessageEvent otherBot = Assert.Single(host.ClientChatWindow("c-bot02"));
        Assert.Equal(emitted.MessageId, otherBot.MessageId);
        Assert.Equal(emitted.RoomSequence, otherBot.RoomSequence);

        ChatOperationResult browserChat = host.AdmitChatInput("c-browser", "hello from browser");
        Assert.Equal(ChatOperationKind.Admitted, browserChat.Kind);
        RoomTickResult tick2 = host.RunTick(MainRoom);
        Assert.Equal(2, host.ClientChatWindow("c-bot01").Count);
        Assert.Equal("hello from browser", host.ClientChatWindow("c-bot01")[1].Text);
        Assert.Equal(tick2.AppliedTick, host.ClientChatWindow("c-bot01")[1].AppliedTick);
    }

    [Fact]
    public void Scenario7_PersistSnapshotRestoresLastMessageWithoutChatHistory()
    {
        var host = NewHost();
        AdmitFullRoom(host);
        Assert.Equal(ChatOperationKind.Admitted, host.AdmitChatInput("c-bot01", "keep-me").Kind);
        RoomTickResult tick = host.RunTick(MainRoom);
        Assert.Equal("keep-me", Assert.Single(host.ClientChatWindow("c-browser")).Text);

        ChatPersistSnapshot snapshot = host.CapturePersistSnapshot(MainRoom);
        ChatPersistEntity bot1 = snapshot.Entities.Single(e => e.NetEntityId == host.MustSelf("c-bot01").NetEntityId);
        Assert.Equal("keep-me", bot1.LastMessageText);
        Assert.Equal(tick.AppliedTick, bot1.LastMessageTick);

        var restored = NewHost();
        restored.RestorePersistSnapshot(MainRoom, snapshot);
        RoomCensus census = restored.Census(MainRoom);
        Assert.Equal(101, census.Total);
        Assert.True(restored.TryGetLastMessage(bot1.NetEntityId, MainRoom, out ChatComponent? component));
        Assert.Equal("keep-me", component!.LastMessageText);
        Assert.Equal(tick.AppliedTick, component.LastMessageTick);
        Assert.Empty(restored.ClientChatWindow("c-browser"));
        Assert.DoesNotContain(snapshot.Entities, e => e.HistoryCount != 0);
    }

    [Fact]
    public void Scenario8_ReconnectWithinFiveMinutesRebindsEntityAAndClearsWindow()
    {
        var host = NewHost();
        AdmitFullRoom(host);
        Assert.Equal(ChatOperationKind.Admitted, host.AdmitChatInput("c-bot01", "before-disconnect").Kind);
        host.RunTick(MainRoom);
        Assert.Single(host.ClientChatWindow("c-bot01"));
        ulong entityA = host.MustSelf("c-bot01").NetEntityId;

        Assert.True(host.Disconnect("c-bot01"));
        ChatOperationResult rejected = host.AdmitChatInput("c-bot01", "while-down");
        Assert.Equal(ChatOperationKind.Rejected, rejected.Kind);
        Assert.Equal(ChatOperationKind.Admitted, host.AdmitChatInput("c-browser", "room-continues").Kind);
        RoomTickResult continued = host.RunTick(MainRoom);
        Assert.Equal("room-continues", Assert.Single(continued.Events).Text);
        Assert.Equal(101, host.Census(MainRoom).Total);

        host.AdvanceMonotonic(TimeSpan.FromMinutes(1));
        RoomAdmitResult rebind = host.Admit(MainRoom, "c-bot01-re", BotAdmission("Bot01"));
        Assert.True(rebind.Accepted);
        Assert.True(rebind.Reconnected);
        Assert.Equal(entityA, MustBinding(rebind).NetEntityId);
        Assert.True(rebind.ClientWindowCleared);
        Assert.Empty(host.ClientChatWindow("c-bot01-re"));
        Assert.True(host.ClientChatWindow("c-browser").Count >= 1);
    }

    [Fact]
    public void Scenario9_ExpiryTombstonesAAndLaterLoginCreatesEntityB()
    {
        var host = NewHost();
        AdmitFullRoom(host);
        ulong entityA = host.MustSelf("c-bot01").NetEntityId;
        string accountId = host.MustSelf("c-bot01").AccountId;

        Assert.True(host.Disconnect("c-bot01"));
        host.AdvanceMonotonic(TimeSpan.FromMinutes(5) + TimeSpan.FromSeconds(1));
        Assert.Equal(1, host.ExpireDue());
        Assert.Equal(100, host.Census(MainRoom).Total);

        RoomAdmitResult next = host.Admit(MainRoom, "c-bot01-b", BotAdmission("Bot01"));
        Assert.True(next.Accepted);
        Assert.False(next.Reconnected);
        Assert.Equal(accountId, MustBinding(next).AccountId);
        Assert.NotEqual(entityA, MustBinding(next).NetEntityId);
        Assert.Equal(101, host.Census(MainRoom).Total);

        AttributeQueryResult tombstoned = host.QueryAttribute(new AttributeQueryRequest(
            AttributeQueryScope.ServerAuthoritative,
            MainRoom,
            entityA,
            "EntityIdentity.entityType"));
        Assert.Equal(AttributeQueryOutcome.Tombstoned, tombstoned.Outcome);
        Assert.NotEqual(entityA, MustBinding(next).NetEntityId);
    }

    [Fact]
    public void Scenario10_IsolationDoesNotCrossRoomBoundaries()
    {
        var host = NewHost();
        AdmitFullRoom(host);
        RoomAdmitResult isoA = host.Admit(IsoRoom, "iso-a", PlayerAdmission("IsoPlayerA"));
        RoomAdmitResult isoB = host.Admit(IsoRoom, "iso-b", PlayerAdmission("IsoPlayerB"));
        Assert.True(isoA.Accepted);
        Assert.True(isoB.Accepted);
        Assert.Equal(2, host.Census(IsoRoom).Total);
        Assert.Equal(101, host.Census(MainRoom).Total);

        Assert.Equal(ChatOperationKind.Admitted, host.AdmitChatInput("c-bot01", "main-only").Kind);
        host.RunTick(MainRoom);
        Assert.Equal(ChatOperationKind.Admitted, host.AdmitChatInput("iso-a", "iso-only").Kind);
        host.RunTick(IsoRoom);

        Assert.Equal("main-only", Assert.Single(host.ClientChatWindow("c-browser")).Text);
        Assert.DoesNotContain(host.ClientChatWindow("iso-a"), e => e.Text == "main-only");
        Assert.Equal("iso-only", Assert.Single(host.ClientChatWindow("iso-b")).Text);
        Assert.DoesNotContain(host.ClientChatWindow("c-browser"), e => e.Text == "iso-only");

        AttributeQueryResult cross = host.QueryAttribute(new AttributeQueryRequest(
            AttributeQueryScope.ServerAuthoritative,
            IsoRoom,
            host.MustSelf("c-browser").NetEntityId,
            "EntityIdentity.entityType"));
        Assert.Equal(AttributeQueryOutcome.RequestError, cross.Outcome);
        Assert.Equal("cross_room_reference", cross.ErrorCode);

        RoomAdmitResult crossAdmit = host.Admit(IsoRoom, "c-browser-cross", PlayerAdmission(BrowserName));
        Assert.False(crossAdmit.Accepted);
        Assert.Equal("invalid_request", crossAdmit.ErrorCode);
        Assert.Equal(MainRoom, host.MustSelf("c-browser").RoomId);
    }

    [Fact]
    public void Scenario11_TwoIdenticalRunsMatchEntityCountsEventOrderAndAppliedTick()
    {
        ScaleEvidence first = CaptureScaleRun();
        ScaleEvidence second = CaptureScaleRun();

        Assert.Equal(101, first.TotalEntities);
        Assert.Equal(100, first.BotCount);
        Assert.Equal(1, first.PlayerCount);
        Assert.Equal(first.TotalEntities, second.TotalEntities);
        Assert.Equal(first.BotCount, second.BotCount);
        Assert.Equal(first.PlayerCount, second.PlayerCount);
        Assert.Equal(first.EventOrder, second.EventOrder);
        Assert.Equal(first.AppliedTicks, second.AppliedTicks);
        Assert.Equal(101, first.EventOrder.Count);
        Assert.All(first.AppliedTicks, tick => Assert.Equal(1UL, tick));
    }

    private static ScaleEvidence CaptureScaleRun()
    {
        var host = NewHost();
        AdmitFullRoom(host);
        foreach (string name in BotLaunchNames.All)
        {
            string connection = "c-" + name.ToLowerInvariant();
            Assert.Equal(ChatOperationKind.Admitted, host.AdmitChatInput(connection, "hello-" + name).Kind);
        }

        Assert.Equal(ChatOperationKind.Admitted, host.AdmitChatInput("c-browser", "hello-browser").Kind);
        RoomTickResult tick = host.RunTick(MainRoom);
        IReadOnlyList<ChatMessageEvent> window = host.ClientChatWindow("c-browser");
        RoomCensus census = host.Census(MainRoom);
        return new ScaleEvidence(
            census.Total,
            census.BotCount,
            census.PlayerCount,
            window.Select(e => e.SenderNetEntityId.ToString(CultureInfo.InvariantCulture) + ":" + e.Text + ":" + e.RoomSequence).ToArray(),
            window.Select(e => e.AppliedTick).ToArray(),
            tick.AppliedTick);
    }

    private static GameRoomHost NewHost() => new(TimeSpan.FromMinutes(5), new ManualMonotonicClock());

    private static Dictionary<string, RoomAdmitResult> AdmitFullRoom(GameRoomHost host)
    {
        Dictionary<string, RoomAdmitResult> admitted = AdmitBots(host, MainRoom, 100);
        admitted["c-browser"] = host.Admit(MainRoom, "c-browser", PlayerAdmission(BrowserName));
        Assert.True(admitted["c-browser"].Accepted);
        Assert.Equal(101, host.Census(MainRoom).Total);
        return admitted;
    }

    private static Dictionary<string, RoomAdmitResult> AdmitBots(GameRoomHost host, string roomId, int count)
    {
        var admitted = new Dictionary<string, RoomAdmitResult>(StringComparer.Ordinal);
        for (int i = 1; i <= count; i++)
        {
            string name = BotLaunchNames.Format(i);
            string connection = "c-" + name.ToLowerInvariant();
            RoomAdmitResult result = host.Admit(roomId, connection, BotAdmission(name));
            Assert.True(result.Accepted, name);
            Assert.Equal(GameEntityKind.Bot, MustBinding(result).EntityType);
            admitted[connection] = result;
        }

        return admitted;
    }

    private static VerifiedAdmission BotAdmission(string loginName)
    {
        return new VerifiedAdmission(AccountIdFor(loginName), loginName, BotToolContext: true);
    }

    private static VerifiedAdmission PlayerAdmission(string loginName)
    {
        return new VerifiedAdmission(AccountIdFor(loginName), loginName, BotToolContext: false);
    }

    private static ConnectionBinding MustBinding(RoomAdmitResult result)
    {
        Assert.True(result.Binding.HasValue);
        return result.Binding.Value;
    }

    private static string AccountIdFor(string loginName)
    {
        string hex = Convert.ToHexString(System.Text.Encoding.UTF8.GetBytes(loginName.PadRight(16, 'x'))).ToLowerInvariant();
        if (hex.Length < 32)
        {
            hex = hex.PadRight(32, '0');
        }

        return "acct_" + hex[..32];
    }

    private sealed class ManualMonotonicClock : IHostMonotonicClock
    {
        private long _ms;

        public long Milliseconds => _ms;

        public void Advance(TimeSpan delta) => _ms += (long)delta.TotalMilliseconds;
    }

    private sealed record ScaleEvidence(
        int TotalEntities,
        int BotCount,
        int PlayerCount,
        IReadOnlyList<string> EventOrder,
        IReadOnlyList<ulong> AppliedTicks,
        ulong AppliedTick);
}
