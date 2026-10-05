namespace Lumio.Bomber.Gameplay;

/// <summary>Stable gameplay codes; reserved entries retain their identity without enabling content.</summary>
public enum BomberDirection { None, Up, Right, Down, Left }
public enum BomberMatchPhase { WaitingForWorldReady, Warmup, Running, FinalCircle, Podium, Results }
public enum BomberLifePhase { Protected, Vulnerable, AwaitingRespawn, Eliminated }
public enum BomberBombPhase { Fuse, Danger, Burn, Extinguished, Expired }
public enum BomberBombKind { Standard, Freeze, ReservedFire, Pierce, ReservedSplit, Toxin, Shock }
public enum BomberDamageCause { Explosion, Drown, Fire, RingPoison, Toxin }
public enum BomberPickupKind { Power = 0, Capacity = 1, Speed = 2, Health = 3, Skill = 4, GoldenHeart = 5, Kick = 6, Frenzy = 7 }
public enum BomberEndReason { None, LastSurvivor, SimultaneousElimination, TimeLimit }
public enum BomberCircleTriggerReason { None = 0, TimeLimit = 3, ResourceThreshold = 4 }
