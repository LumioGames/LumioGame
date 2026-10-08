using System;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Lumio.Bomber.Gameplay.Config;
using Lumio.Bomber.Gameplay.Contracts.Components;
using Lumio.GameRuntime.Ecs;

namespace Lumio.Bomber.Gameplay;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
internal sealed record BomberDeathDebt(ulong Match, string Life, ulong Generation, ulong Occurred,
    int X, int Z, int Power, int Capacity, int Speed, int Hearts, uint Skill, int Level, int Selected, int Placed)
{
    private static readonly JsonSerializerOptions Options = new() { RespectRequiredConstructorParameters = true };
    internal int Pending => checked(Power + Capacity + Speed + Hearts + (Skill == 0 ? 0 : 1));
    internal string Encode() => JsonSerializer.Serialize(this, Options);
    internal static BomberDeathDebt Decode(string value)
    {
        if (value.Length > 4096) throw new InvalidOperationException("Death debt encoding exceeds its bounded row size.");
        return JsonSerializer.Deserialize<BomberDeathDebt>(value, Options) ?? throw new InvalidOperationException("Death debt is missing.");
    }

    internal static BomberDeathDebt Read(BomberRespawnCarry carry) => new(carry.DropMatchId.Value,
        carry.DropLife.Value.ToHex(), carry.DropGeneration.Value, carry.DropOccurrenceTick.Value,
        carry.DropOriginX.Value, carry.DropOriginZ.Value, carry.PendingPower.Value, carry.PendingCapacity.Value,
        carry.PendingSpeed.Value, carry.PendingGoldenHearts.Value, carry.PendingBombSkill.Value,
        carry.PendingBombLevel.Value, carry.SelectedDropCount.Value, carry.PlacedDropCount.Value);

    internal void StoreCounts(BomberRespawnCarry carry)
    {
        carry.PendingPower.Value = Power;
        carry.PendingCapacity.Value = Capacity;
        carry.PendingSpeed.Value = Speed;
        carry.PendingGoldenHearts.Value = Hearts;
        carry.PendingBombSkill.Value = Skill;
        carry.PendingBombLevel.Value = Level;
        carry.PlacedDropCount.Value = Placed;
    }

    internal void Validate(World world, bool deferred)
    {
        IBomberConfig config = BomberConfigBinding.For(world);
        static int Limit(AttributesRow row) => checked((int)(row.Maximum - row.Initial));
        if (Hearts < 0 || Hearts > BomberGrowth.MaximumGoldenHearts || Power < 0 || Power > Limit(config.Attribute(BomberAttributeNames.BombPower)) ||
            Capacity < 0 || Capacity > Limit(config.Attribute(BomberAttributeNames.BombCapacity)) ||
            Speed < 0 || Speed > Limit(config.Attribute(BomberAttributeNames.SpeedTier)))
            throw new InvalidOperationException("Pending death wealth exceeds the configured life holdings.");
        if (Selected > config.ObjectBudgets.DeathOutputLimit || Placed < 0 || Selected != checked(Pending + Placed) ||
            (Skill == 0) != (Level == 0) || deferred && Pending == 0)
            throw new InvalidOperationException("Death wealth transfer is not conserved.");
        if (Skill != 0 && (!BomberSpecialBombResolver.TryResolve(config, Skill, out _) || Level <= 0 ||
            !config.Tables.SkillLevels.Rows.Any(row => row.SkillId == Skill && row.Level == Level)))
            throw new InvalidOperationException("Pending death bomb skill is not supported by the effective configuration.");
        if (Selected > 0 && (Match == 0 || !NetEntityId.TryParse(Life, out var life) || life.IsDefault ||
            life.InstanceId != world.InstanceId || Generation == 0 || Occurred == 0))
            throw new InvalidOperationException("Selected death wealth must retain its original life tuple.");
        if (deferred && (Occurred > world.Tick || Match > world.Single<BomberMatchState>().MatchId.Value ||
            X < 0 || X >= config.Map.Width || Z < 0 || Z >= config.Map.Depth))
            throw new InvalidOperationException("Deferred death wealth has an invalid origin.");
    }
}
