using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Lumio.Bomber.Bots;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Client.Bot;
using Lumio.GameRuntime.Ecs;
using Xunit;

namespace Lumio.Bomber.Client.Application.Tests;

public sealed class BomberAdmissionScenarioTests
{
    private const int MatchPlayers = 8; // Test fixture expectation; production reads game.player_count.
    private static string Self => new NetEntityId(1, 1).ToHex();
    private const string Room = "admission-room";

    [Fact]
    public void CompleteRequiresEightDistinctFullIdentitiesWithSelfVisible()
    {
        // Equal counters with different instance IDs must remain eight different players.
        var evidence = Observe(Census(MatchPlayers));
        Assert.True(evidence.Complete);
        Assert.Equal(MatchPlayers, evidence.PlayerCount);
        Assert.True(evidence.SelfVisible);
    }

    [Fact]
    public void SevenPlayersAndOtherEntityTypesDoNotMeetThePlayerThreshold()
    {
        var census = Census(MatchPlayers - 1);
        census.Add(new BomberAdmissionIdentity(new NetEntityId(20, 1).ToHex(), "bomberBomb"));
        var evidence = Observe(census);
        Assert.False(evidence.Complete);
        Assert.Equal(MatchPlayers - 1, evidence.PlayerCount);
    }

    [Fact]
    public void DuplicateAndMalformedIdsCannotInflateTheCensus()
    {
        var census = Census(MatchPlayers - 1);
        census.Add(census[0]);
        census.Add(new BomberAdmissionIdentity("0000000000000001", "player"));
        var evidence = Observe(census);
        Assert.False(evidence.Complete);
        Assert.Equal(MatchPlayers - 1, evidence.PlayerCount);
    }

    [Theory]
    [InlineData("")]
    [InlineData("0000000000000001")]
    [InlineData("00000000000000000000000000000000")]
    public void MissingTruncatedOrDefaultSelfIdentityCannotPass(string self)
    {
        var evidence = Observe(Census(MatchPlayers), self: self);
        Assert.False(evidence.Complete);
        Assert.False(evidence.ValidSelfId);
    }

    [Fact]
    public void SelfBindingTypeAndSelfPresenceAreIndependentRequiredFacts()
    {
        var census = Census(MatchPlayers);
        Assert.False(Observe(census, hasSelf: false).Complete);
        Assert.False(Observe(census, selfType: "bomberBomb").Complete);
        census.RemoveAt(0);
        census.Add(new BomberAdmissionIdentity(new NetEntityId(20, 1).ToHex(), "player"));
        var missing = Observe(census);
        Assert.Equal(MatchPlayers, missing.PlayerCount);
        Assert.False(missing.SelfVisible);
        Assert.False(missing.Complete);
    }

    [Fact]
    public void CensusAloneCannotPassWithoutRoomAndCommittedSelfFields()
    {
        var census = Census(MatchPlayers);
        var noRoom = Observe(census, room: "");
        Assert.False(noRoom.ValidRoomId);
        Assert.False(noRoom.Complete);

        var noFields = Observe(census, name: new BomberAdmissionField(), nextCharacter: new BomberAdmissionField());
        Assert.Equal(MatchPlayers, noFields.PlayerCount);
        Assert.False(noFields.NameReadable);
        Assert.False(noFields.NextCharacterReadable);
        Assert.False(noFields.Complete);
    }

    [Fact]
    public void FieldDenialOrWrongIdentityCannotPass()
    {
        var census = Census(MatchPlayers);
        Assert.False(Observe(census, name: NameField() with { Found = false }).Complete);
        Assert.False(Observe(census, nextCharacter: NextCharacterField() with { Found = false }).Complete);
        Assert.False(Observe(census, name: NameField() with { RoomId = "another-room" }).Complete);
        Assert.False(Observe(census, nextCharacter: NextCharacterField() with { NetEntityId = new NetEntityId(2, 1).ToHex() }).Complete);
        Assert.False(Observe(census, name: NameField() with { Kind = "int32", Text = null }).Complete);
        Assert.False(Observe(census, nextCharacter: NextCharacterField() with { Kind = "int64" }).Complete);
    }

    [Fact]
    public void ScenarioWithNoWorldEvidenceContinuesAndAssertsRedEvenWithUplinks()
    {
        var scenario = new BomberAdmissionScenario(MatchPlayers);
        var context = new BotDriverContext(42, BotWorldView.Empty, BotInputVocabulary.FromRegistry(null), new RejectEveryCommand(), 999);
        Assert.Equal(BotStepStatus.Continue, scenario.Step(in context).Status);
        var sink = new BotAssertionSink();
        scenario.Assert(in context, sink);
        Assert.False(sink.Passed);
        Assert.Contains("bomber_admission_self_bound", sink.Failed);
        Assert.Contains("bomber_admission_full_self_id", sink.Failed);
        Assert.Contains("bomber_admission_self_visible", sink.Failed);
        Assert.Contains("bomber_admission_self_room", sink.Failed);
        Assert.Contains("bomber_admission_self_name_readable", sink.Failed);
        Assert.Contains("bomber_admission_self_next_character_readable", sink.Failed);
        Assert.Contains("bomber_admission_zero_uplinks", sink.Failed);
        Assert.Contains(sink.Failed, failure => failure.StartsWith("bomber_admission_players_at_least_", StringComparison.Ordinal));
    }

    [Fact]
    public void CompleteCachedEvidenceStillRejectsAnyUplink()
    {
        var scenario = new BomberAdmissionScenario(MatchPlayers);
        var complete = Observe(Census(MatchPlayers));
        Assert.True(complete.Complete);
        typeof(BomberAdmissionScenario).GetField("observed", BindingFlags.Instance | BindingFlags.NonPublic)!
            .SetValue(scenario, complete);

        var zeroInput = new BotDriverContext(42, BotWorldView.Empty, BotInputVocabulary.FromRegistry(null), new RejectEveryCommand(), 0);
        var passingSink = new BotAssertionSink();
        scenario.Assert(in zeroInput, passingSink);
        Assert.True(passingSink.Passed);

        var oneUplink = new BotDriverContext(42, BotWorldView.Empty, BotInputVocabulary.FromRegistry(null), new RejectEveryCommand(), 1);
        var failingSink = new BotAssertionSink();
        scenario.Assert(in oneUplink, failingSink);
        Assert.False(failingSink.Passed);
        Assert.Equal("bomber_admission_zero_uplinks", Assert.Single(failingSink.Failed));
    }

    [Fact]
    public void ParameterlessHostScenarioReadsTheHostConfigAndFailsWhenItIsMissing()
    {
        var variable = BomberAdmissionScenario.ConfigDirectoryVariable;
        var original = Environment.GetEnvironmentVariable(variable);
        try
        {
            Environment.SetEnvironmentVariable(variable, null);
            Assert.Throws<InvalidOperationException>(() => new BomberAdmissionScenario());
            var directory = Path.Combine(AppContext.BaseDirectory, "config");
            Environment.SetEnvironmentVariable(variable, directory);
            var scenario = new BomberAdmissionScenario();
            Assert.Equal(BomberConfigBinding.Read(directory).Game.PlayerCount, scenario.ExpectedPlayers);
            Assert.Equal(MatchPlayers, scenario.ExpectedPlayers);
        }
        finally { Environment.SetEnvironmentVariable(variable, original); }
    }

    private static BomberAdmissionEvidence Observe(IReadOnlyList<BomberAdmissionIdentity> census,
        bool hasSelf = true, string? room = Room, string? self = null, string selfType = "player",
        BomberAdmissionField? name = null, BomberAdmissionField? nextCharacter = null) =>
        BomberAdmissionEvidence.Evaluate(hasSelf, room, self ?? Self, selfType, census,
            name ?? NameField(), nextCharacter ?? NextCharacterField(), MatchPlayers);

    private static BomberAdmissionField NameField() => new(true, Room, Self, "string", "bomber-one", null);
    private static BomberAdmissionField NextCharacterField() => new(true, Room, Self, "int32", null, 0);

    private static List<BomberAdmissionIdentity> Census(int count) => Enumerable.Range(1, count)
        .Select(instance => new BomberAdmissionIdentity(new NetEntityId((ulong)instance, 1).ToHex(), "player")).ToList();

    private sealed class RejectEveryCommand : IBotCommandSink
    {
        public BotIssueResult Issue(in BotIssuedCommand command) => throw new InvalidOperationException("Admission must never issue gameplay commands.");
    }
}
