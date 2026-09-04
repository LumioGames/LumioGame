namespace Lumio.Game.ServerGameplay.Bomber.Contracts.Events;

/// <summary>
/// 服务器权威事件，Game 内部 DTO（design.md §7.2/§7.5/§9/§17.1）。由 G-1/G-2/G-3 的规则内核产出，
/// 经 G-0 的 <see cref="Ports.IBomberTelemetrySink"/> 落遥测，网络包络由 C-1 登记。
/// </summary>
public readonly record struct BombPlaced(ulong OwnerNetEntityIdRaw, int CellX, int CellY, int CellZ, ulong FuseEndTick, ulong Tick);

public readonly record struct BombExploded(ulong ChainId, ulong SourceBombOwnerNetEntityIdRaw, int CellCount, ulong Tick);

/// <summary>
/// 单次扣血事件；同一颗炸弹对同一玩家只出现一次（§7.5 连锁结算口径）。HealthPointsLeft 单位是半心点（ADR 0017）。
/// SourceBombNetEntityIdRaw 是来源炸弹本身的身份（ADR 0018 补齐）——§9.6 的死亡回顾要逐炸弹归因，
/// 只有主人分不开同一人在同一 Tick 放的两颗弹。
/// </summary>
public readonly record struct DamageApplied(ulong VictimNetEntityIdRaw, ulong SourceBombNetEntityIdRaw, ulong SourceBombOwnerNetEntityIdRaw, ulong ChainId, int HealthPointsLeft, ulong Tick);

/// <summary>
/// Killer = 打掉最后一点血的炸弹主人；自杀与溺死时 KillerNetEntityIdRaw == VictimNetEntityIdRaw（§9.1）。
/// Cause: 0=爆炸 1=溺水 2=燃烧——溺水是 ADR 0017 新增的死因，§9.6 要求死亡可解释，
/// 只靠 Killer == Victim 分不出「自己炸死」和「淹死」。
/// </summary>
public readonly record struct PlayerDied(ulong VictimNetEntityIdRaw, ulong KillerNetEntityIdRaw, ulong ChainId, int Cause, int CellX, int CellY, int CellZ, ulong Tick);

public readonly record struct PlayerRespawned(ulong NetEntityIdRaw, int CellX, int CellY, int CellZ, ulong Tick);

public readonly record struct HatPileSpawned(int CellX, int CellY, int CellZ, int Count, ulong ExpireAtTick, ulong Tick);

public readonly record struct HatPilePicked(ulong PickerNetEntityIdRaw, int Count, ulong Tick);

public readonly record struct HatPileExpired(int Count, ulong Tick);

public readonly record struct PickupTaken(ulong PickerNetEntityIdRaw, int Kind, ulong Tick);

/// <summary>NewHatKingNetEntityIdRaw == 0 表示当前无帽王（§9.3）。</summary>
public readonly record struct HatKingChanged(ulong PreviousHatKingNetEntityIdRaw, ulong NewHatKingNetEntityIdRaw, ulong Tick);

public readonly record struct MatchEnded(ulong Tick);
