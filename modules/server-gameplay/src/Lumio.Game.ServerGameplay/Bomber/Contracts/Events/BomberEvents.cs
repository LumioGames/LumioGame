namespace Lumio.Game.ServerGameplay.Bomber.Contracts.Events;

/// <summary>
/// 服务器权威事件，Game 内部 DTO（design.md §7.2/§7.5/§9/§17.1）。由 G-1/G-2/G-3 的规则内核产出，
/// 经 G-0 的 <see cref="Ports.IBomberTelemetrySink"/> 落遥测，网络包络由 C-1 登记。
/// </summary>
public readonly record struct BombPlaced(ulong OwnerNetEntityIdRaw, int CellX, int CellY, ulong FuseEndTick, ulong Tick);

public readonly record struct BombExploded(ulong ChainId, ulong SourceBombOwnerNetEntityIdRaw, int CellCount, ulong Tick);

/// <summary>单次扣心事件；同一 SourceBombId 对同一玩家只出现一次（§7.5 连锁结算口径）。</summary>
public readonly record struct DamageApplied(ulong VictimNetEntityIdRaw, ulong SourceBombOwnerNetEntityIdRaw, ulong ChainId, int HeartsLeft, ulong Tick);

/// <summary>Killer = 打掉最后一颗心的炸弹主人；自杀时 KillerNetEntityIdRaw == VictimNetEntityIdRaw（§9.1）。</summary>
public readonly record struct PlayerDied(ulong VictimNetEntityIdRaw, ulong KillerNetEntityIdRaw, ulong ChainId, int CellX, int CellY, ulong Tick);

public readonly record struct PlayerRespawned(ulong NetEntityIdRaw, int CellX, int CellY, ulong Tick);

public readonly record struct HatPileSpawned(int CellX, int CellY, int Count, ulong ExpireAtTick, ulong Tick);

public readonly record struct HatPilePicked(ulong PickerNetEntityIdRaw, int Count, ulong Tick);

public readonly record struct HatPileExpired(int Count, ulong Tick);

public readonly record struct PickupTaken(ulong PickerNetEntityIdRaw, int Kind, ulong Tick);

/// <summary>NewHatKingNetEntityIdRaw == 0 表示当前无帽王（§9.3）。</summary>
public readonly record struct HatKingChanged(ulong PreviousHatKingNetEntityIdRaw, ulong NewHatKingNetEntityIdRaw, ulong Tick);

public readonly record struct MatchEnded(ulong Tick);
