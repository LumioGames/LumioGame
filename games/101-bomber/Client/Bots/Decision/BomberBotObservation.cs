using System;
using System.Collections.Generic;

namespace Lumio.Bomber.Bots;

internal enum BotBehavior { Farm, Hunt, Collect, Roam }
internal enum BotMove { None, Up, Right, Down, Left }
internal readonly record struct BotCell(bool Known, bool Passable, bool BlocksBlast, bool Destructible, bool Water);
internal readonly record struct BotActor(string Id, string Participant, int Cell, int Health, int Hats, bool Human,
    long InvulnerableUntil = 0);
internal readonly record struct BotBomb(string Id, string Owner, int Cell, int Power, int Pierce, long Explodes, long Ends,
    int Up = -1, int Right = -1, int Down = -1, int Left = -1);
internal readonly record struct BotPickup(int Cell, int Kind);
internal readonly record struct BotHazard(int Cell, long From, long Until);
internal readonly record struct BotDecision(BotMove Move, bool Bomb, bool Skill, BotBehavior Behavior, int Goal);
internal sealed record BotPolicy(int ReactionMin, int ReactionMax, int ThinkEvery, int NoisePermille,
    int AttackSkipPermille, int SkillUsePermille, int EscapeMarginTicks, int UnderestimatePermille,
    int RiskyPickupPermille, int AttackBombLimit, int SkillLeadTicks, int SkillRetryTicks,
    int HumanChasers, int HumanNearCells, int HumanPenalty, int BehaviorMinTicks, int BehaviorMaxTicks,
    int FarmWeight, int HuntWeight, int CollectWeight, int RoamWeight,
    bool OwnCellReaction = false, int BlastScalePermille = 1000, int EngageScalePermille = 1000,
    int TrapPermille = 0, bool FrenzyBypass = false, int TradePermille = 0,
    int ShowdownSide = 7, int TradeMinHealth = 2,
    int EngageSteps = 6, int EngageCheckTicks = 30, int EngageChancePermille = 1000,
    int EngageMinTicks = 60, int EngageMaxTicks = 120,
    int FarmBlastPermille = 1000, int HuntBlastPermille = 1000,
    int CollectBlastPermille = 1000, int RoamBlastPermille = 1000);

// Ephemeral projection of one confirmed client observation. No field is written back to gameplay.
internal sealed class BomberBotObservation
{
    public required int Width { get; init; }
    public required BotCell[] Cells { get; init; }
    public required BotActor Self { get; init; }
    public required IReadOnlyList<BotActor> Actors { get; init; }
    public IReadOnlyList<BotBomb> Bombs { get; init; } = Array.Empty<BotBomb>();
    public IReadOnlyList<BotPickup> Pickups { get; init; } = Array.Empty<BotPickup>();
    public IReadOnlyList<BotHazard> Hazards { get; init; } = Array.Empty<BotHazard>();
    public long Tick { get; init; }
    public int TicksPerCell { get; init; } = 5;
    public int WaterTicksPerCell { get; init; } = 5;
    public int FuseTicks { get; init; } = 36;
    public int FlameTicks { get; init; } = 8;
    public int DamagePoints { get; init; } = 2;
    public int BombPower { get; init; } = 2;
    public int AvailableBombs { get; init; } = 1;
    public int SafeSide { get; init; }
    public int NextSafeSide { get; init; }
    public long NextCircleTick { get; init; } = long.MaxValue;
    public string HatKing { get; init; } = string.Empty;
    public uint ActiveSkill { get; init; }
    public bool SkillReady { get; init; }
    public int ActiveRange { get; init; }
    public BotMove Facing { get; init; }
}
