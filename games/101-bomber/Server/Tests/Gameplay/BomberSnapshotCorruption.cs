using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.Text;
using System.Text.Json.Nodes;
using Xunit;

namespace Lumio.Bomber.Gameplay.Tests;

/// <summary>Corrupts serialized input without bypassing live container capacity enforcement.</summary>
internal static class BomberSnapshotCorruption
{
    internal static byte[] AppendListEntries(byte[] snapshot, string fieldId, int expectedCount,
        params string[] entries)
    {
        byte[] key = Encoding.UTF8.GetBytes(fieldId);
        var matches = new List<(int Offset, int Length, JsonObject Payload)>();
        for (int start = 4; start <= snapshot.Length - key.Length - 5; start++)
        {
            if (BinaryPrimitives.ReadInt32LittleEndian(snapshot.AsSpan(start - 4)) != key.Length
                || !snapshot.AsSpan(start, key.Length).SequenceEqual(key)
                || snapshot[start + key.Length] != 4) continue;
            int offset = start + key.Length + 1;
            int length = BinaryPrimitives.ReadInt32LittleEndian(snapshot.AsSpan(offset));
            Assert.InRange(length, 0, snapshot.Length - offset - 4);
            JsonObject payload = JsonNode.Parse(snapshot.AsSpan(offset + 4, length))!.AsObject();
            Assert.Equal("SyncList", payload["containerType"]!.GetValue<string>());
            if (payload["fullEntries"]!.AsArray().Count == expectedCount)
                matches.Add((offset, length, payload));
        }
        var match = Assert.Single(matches);
        JsonArray values = match.Payload["fullEntries"]!.AsArray();
        foreach (string entry in entries) values.Add(entry);
        byte[] replacement = Encoding.UTF8.GetBytes(match.Payload.ToJsonString());
        byte[] malformed = new byte[checked(snapshot.Length - match.Length + replacement.Length)];
        snapshot.AsSpan(0, match.Offset).CopyTo(malformed);
        BinaryPrimitives.WriteInt32LittleEndian(malformed.AsSpan(match.Offset), replacement.Length);
        replacement.CopyTo(malformed.AsSpan(match.Offset + 4));
        snapshot.AsSpan(match.Offset + 4 + match.Length)
            .CopyTo(malformed.AsSpan(match.Offset + 4 + replacement.Length));
        return malformed;
    }
}
