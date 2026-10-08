# Bomber IceBridge First-Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking. Root presently authorizes only the test source and this plan; no production, spawn, build, GEN or commit is authorized by this document. Root assigns the actual implementation and serial heavy windows.

**Goal:** Produce a real, bounded Native ice bridge from Freeze contact, preserve its original eight-second deadline, and settle atomic return-to-water plus exact bridge retirement and all Fuse occupants once.

**Architecture:** Native owns all current cell materials and bindings. Existing WorldRuntime/bridge Persist fields own structural and Native obligations; the single TerrainTransactions consumer accepts Original receipts and only then settles water cleanup. Per-tick contact collections are temporary requests, never recovery truth.

**Tech Stack:** C# Gameplay, generated v14 declarations, official package SDK, Native Voxel/HFSM, WorldManager.Tick, xUnit.

## Global Constraints

- Authoritative requirements: `C:/Work/LumioGames/LumioGame/docs/specs/bomber/design.md` §§5.1–5.3/7.3 and `.spec/decisions/0048-bomber-m2-map-packages-and-interaction-boundaries.md`. Duration remains8 seconds, water counts28/44/60; hard maximum60 bridge records and65536 UTF8 bytes. FreezeToken≤128 UTF8 bytes.
- Repeat Freeze does not renew a bridge. Fire/retained fire and expiry melt; Standard/Freeze danger does not. Melt wins same-tick competition before any losing Freeze submission.
- Only accepted actual water change extinguishes **every** colocated Fuse bomb, including stationary/Remote/Frenzy. Danger/Burn/Expired bombs are not extinguished by this rule. Refund belongs to the original full Life/generation or existing Frenzy account exactly once; a successor cannot receive an old-life ordinary refund.
- Preserve formal admission/M2/ice enabled guards, configured array/byte/object maxima and schema identity history. No Runtime/Engine contract changes, shadow terrain, fake binding/receipt/phase, authoring-source bypass or second result consumer.
- Declarations already exist: `BomberIceBridgeState` ResourceGeneration/MatchId/FreezeToken/AppliedTick/ExpiresAtTick; `BomberIceBridgeEntity`; `BomberWorldRuntime.IceBridgePromises` and shared NextResourceGeneration. No extra ECS declaration or GEN is planned.
- Pending/Unknown structural submissions and Native obligations retain all credit. No timeout, retry of unknown create, fresh deadline or live-service dictionary substitutes for persisted ownership.
- Root owns config/source export, release, comprehensive budgets and heavy operations. Coordinate all shared TerrainTransactions/WorldRuntime/Round edits with the current regeneration writer before any production authorization.

## Reviewed basis and first-wave fixture scope

The old `.sdd/101-20261003-regeneration-bridge-v14-plan.md` bridge sequence is refined by `.sdd/101-20261003-barrel-review-red-and-bridge-investigation.md`: supported atomic `TryStageMutation` writes1027 water and clears the1031 binding in one Native batch. It does **not** automatically destroy ECS. `DigThrough` is air+clear+automatic destroy and cannot be used for a nonair water replacement. After accepted Original, ordinary structural destroy retires the exact already-unbound bridge; persist retirement debt until actual retirement. These are two owned obligations, not a claim of atomic Native+ECS retirement in one call.

The current proposed source is `C:/Work/LumioGames/LumioGame/games/101-bomber/Server/Tests/Gameplay/BomberIceBridgeProductionTests.cs`, SHA256 `92eba733105e66e3c2b2a6f1bb1b075f4d45dd12e59e5165cc9a8e43c7263a08`, seven Facts and two two-row Theories =11 cases. Full725f before and current after are in root `.run/ice-bridge-first-wave-test-source-01/`. Root first build found only CA1859 at BindCandidate; this compiler failure is not gameplay RED. The three approved fixture corrections are documented in the source report. No reviewer build/test has been run.

The fixture uses an actually admitted Legacy19/8 Native Scene, keeps ice.enabled=false and formal M2 guard, and privately enables Remote through the same real authoring CLI as existing Remote production tests. Freeze/Fire sources are actual bomb EntityOrders with configured shape input before publication, processed by ordinary Tick+Native HFSM. It does not prove the public Freeze/Fire placement path. All material inputs are real Native commits. Public standard/Remote/Frenzy placements use actual CanPlace/Activate; the multi-occupant test then places their real published transforms at the same cell as explicit geometry input. It does not prove public movement, kick or stacked placement. Actual Original bytes/status/section revision/token identity are copied from CaptureResultCheckpoint; replay uses a fresh adapter and preserves policy. No result is forged.

## Task 1: Preserve and run the missing-producer RED

**Files:** Test source above; report `C:/Work/LumioGames/LumioGame/.sdd/101-20261003-ice-bridge-first-wave-test-source-report.md`. Root creates fresh isolated build/run evidence.

- [x] Author11 independent cases without changing shared tests/production. Preserve exact full IDs before component detachment, observable original-life inventory and journal source tuple, and natural Fire retirement before replacement Freeze.
- [ ] Root builds the frozen source using the official complete07 runner and saves exact CLI, all source/DLL/Native identities, raw child exit and zero skips.
- [ ] Run the class with `--filter-class *BomberIceBridgeProductionTests --minimum-expected-tests 11` against that fresh DLL. Expected static pattern while bridge production is missing: eight failures at real water→ice prerequisites and three passing no-bridge controls. This is a prediction, not actual RED evidence.
- [ ] Independently inspect that failures reach real Native assertions; compiler/authoring/fixture failures must be fixed narrowly and preserved separately. First missing Freeze prerequisite prevents later refund/expiry branches from running; do not claim their RED independently until prerequisites pass.

| Case group | Count | Real witnesses / closing requirement |
|---|---:|---|
| First freeze source/Native binding/persisted debt |1| actual1031, exact live bridge fullID/type/gen/match/token; SourceBomb/Life/gen/Participant/chain; retained Original; AppliedTick=submitted clock and fixed8s; snapshot contains token |
| Repeat Freeze |1| same identity/gen/token/deadline and no Native revision/transaction change |
| Standard/Freeze danger |2| real bridge survives with original deadline |
| Fire melt |1| water+binding clear atomic; no DigApplied/automatic ECS destroy; live bridge/debt before Original; exact retirement after Original |
| Same-tick order reversal |2| actual Fire wins in both bomb creation orders; no late losing Freeze record |
| Expiry all Fuse occupants |1| real stationary/Remote/Frenzy publishes; withheld Original cannot refund/retire; accepted/re-delivered exact Original yields retirement + one full-source extinguish occurrence + ordinary1 and unchanged Frenzy inventory/promise0 |
| Old-life Remote |1| real oldLife death and authenticated successor landing; no refund to successor; original-source extinguish once under re-delivery |
| Old Original vs replacement generation |1| actual Fire fully retires naturally first; replacement has new fullID/gen/token; old Original cannot clear/retire/renew it |
| Standard water |1| real blast contact remains water with no bridge/debt |

## Task 2: Persist owner state and merge the real binding policy

**Create:** `C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BomberIceBridges.Server.cs`.

**Later narrow edits, requiring Root ownership clearance:** `Gameplay/Components/Bomber/BomberWorldRuntime.Server.cs`, `Gameplay/BomberTerrainTransactions.Server.cs`, `Gameplay/BomberInitialResources.Server.cs`, `Gameplay/BomberTerrainRead.Server.cs`, `Gameplay/BomberRoundTransition.Server.cs` under the same game root. Config source row1031's sparse binding is a separate Root-owned official authoring/export action; keep enabled=false.

**Proposed internal interfaces, not existing APIs:**

```csharp
internal static class BomberIceBridges
{
    internal static void Begin(World world);
    internal static void RequestFreeze(World world, BomberBombState source, int x, int z);
    internal static void RequestMelt(World world, BomberBombState source, int x, int z);
    internal static void End(World world);
    internal static void Validate(World world);
    internal static void ValidatePending(World world, int index, bool applied);
    internal static void Accept(World world, string transactionId);
    internal static void Reject(World world, string transactionId);
}
```

Begin reconciles published/unbound retirement owners after ordinary structural commit; it never restores Unknown by blindly creating again. Request methods capture source full tuple from the actual live producer at contact. End resolves all contacts before staging. Validate performs bounded pure shape/correlation checks without mutation. TerrainTransactions remains the sole DrainResults consumer and calls ValidatePending for the whole batch before Accept/accounting.

- [ ] Define a typed bounded codec in the new helper. Each row owns immutable FreezeToken, Bridge(full NetEntityId), Generation, Match, SourceBomb, SourceLife, SourceLifeGeneration, SourceParticipant and ChainId. Store exact Native input section/offset/expectedRevision and operation provenance, not current material truth. Required first-wave JSON properties are these names plus TransactionId, MutationSubmitted and ExpiresAtTick. The persistent row must additionally distinguish creation submitted/observed, freeze submitted/accepted, water submitted/accepted and retirement queued/completed; transactions must have distinct exact IDs and submitted clocks. No source-coordinate clone replaces current Native binding/transform truth.
- [ ] Encode the complete replacement value and validate row count/UTF8/token/checked clocks **before** generation allocation, birth or Native staging. Every later state transition must preflight its complete encoding as well. Refuse a new producer on capacity, do not write a partial owner then discover the string is too large. Empty storage is empty string; malformed/duplicate fullID/token/gen/cell/match/clock rows fail closed.
- [ ] Share the real NextResourceGeneration allocator with initial/regeneration producers; reserve monotonic generations without a separate counter/service truth. At most one unresolved operation per current exact cell/generation; retain a retiring generation's slot until exact retirement. Full supported profiles must fit all objects/pending/bytes before formal admission is widened.
- [ ] Merge1031→actual registry BomberIceBridgeEntity wire into the existing chest/barrel BindingPolicy. Preserve other entries and only change policy when the adapter's real pending state permits. InitialResources/StrongChest paths must not subsequently replace the bridge entry. Ground reader validates actual binding entity type/gen/Match without treating disabled source row as permission to invent an unbound ice cell.
- [ ] Add private intent enum values at its tail only after Root approves exact values and shared writer integration. Existing1..8 stay stable. Freeze/write and water/clear need explicit validation/settlement/rejection branches; never fall through ordinary chest dig/source destruction accounting. No new public wire/schema is introduced.

**Deliverable:** Pure codec/owner validation and exact policy integration with guards intact. Additional corruption/hydration/encoding-bound cases are required before this task closes;11 first-wave cases do not replace them.

## Task 3: Collect contacts, publish freeze and fix its clock

**Later narrow edit:** `C:/Work/LumioGames/LumioGame/games/101-bomber/Gameplay/BombSystem.Server.cs`, actual reached-cell path/ProcessBombs only; coordinate with Fire/Aura and regeneration owners.

- [ ] At actual Freeze blast reach call RequestFreeze for reached water; at actual Fire explosion and retained Bomb Burn reach call RequestMelt. Never use ordinary Danger's visual flame or Aura as a terrain writer. Use actual Native obstacle occlusion and existing blast reach; no extra unreachable cells from a mirrored/material cache.
- [ ] Collect all Tick sources before End. Union melt/expiry cells; remove new unsubmitted Freeze losers before structural publication or Native submission. Do not retain a losing Freeze to apply after the melt. A repeat request on an accepted current bridge is a no-op, including token/clock/generation.
- [ ] With fresh actual Native water/no-binding evidence, persist full owner and mark submission before ordinary bridge create. Observe the precise fullID/generation and stage water→ice plus exact binding in the existing single terrain writer. Unknown publication never retries; known unsubmitted/rejected birth cleanup requires ownership and actual no-binding evidence.
- [ ] On matching Original validate the complete batch's token/Status0/Applied/Original/TokenConsumed/raw bytes/all exact sections/revision advance/full owner tuple before any field update. For the selected synchronous HostAdapter the proved successful clock is the persisted submitted Tick, not the later delivered Tick. Set AppliedTick once and ExpiresAtTick=checked(AppliedTick+Ticks.FromMilliseconds(8000, actual tick rate)). Retain late/Unknown obligations; if deadline has already passed when Original arrives, queue expiry immediately without a new8s period.
- [ ] Root runs the frozen first/repeat/danger controls, then adds actual delayed Original and rejected/stale-revision tests. Require source provenance after old sourceLife death and after sourceBomb retirement once freeze is accepted; no dependency on a dead Life's body for active bridge restoration.

## Task 4: Return to water, settle all Fuse occupants and retire exact owner

**Interfaces consumed:** Task2 helper calls; real `HostVoxelWorldAdapter.TryStageMutation`, single TerrainTransactions validation; existing `BomberBombLifecycle.Ensure/Send` and `BombSystem.ReturnBombCapacity`.

The supported Native mutation shape, with the actual address/revision and exact transaction ID supplied by the owner, is:

```csharp
adapter.TryStageMutation(
    new[] { new VoxelWriteEntry(section, offset, 1027u << 8, revision) },
    new[] { new VoxelBindingOp(section, offset, null) { ExpectedSectionRevision = revision } },
    transactionId);
```

- [ ] At expiry or winning Fire request validate exact current Native ice/full binding/full bridge generation and fixed deadline; persist water operation debt before staging this one atomic material+clear batch. No interim air, fake water, removal of global policy or destroy while Native still binds the bridge. Stage/Unknown/rejection cannot refund, extinguish or retire.
- [ ] Matching accepted Original requires all existing raw receipt guards plus current Native water/no-binding and full persisted operation/bridge generation match. First validate **every** pending row/occupant obligation in the batch, then apply business effects; no partial refund before a later row fails. An old result without matching current transaction is ignored by existing exact correlation, not permitted to mutate a replacement.
- [ ] Enumerate current live BomberBombState whose Phase is Fuse and actual LogicTransform is the affected cell. Ensure actual Native HFSM correspondence and send existing Extinguish event through ordinary lifecycle; ReturnCapacity acts once before actual `bomb_extinguished` with full old entity/Participant/Life/gen. Do not manually set Phase/CapacityReturned or issue new ordinary inventory for Frenzy. Existing Frenzy concurrency counts live Fuse plus durable promises; exiting Fuse removes its actual primary credit without refunding ordinary Available.
- [ ] Queue exact now-unbound bridge destroy after accepted water. Preserve retirement row/credit until World.IsLive(oldFullID)==false; removal must be generation-specific and cannot affect a new bridge. Retain known accepted-water state so any repeat delivery cannot re-run refunds or events. Read source tuple from durable owner, not detached components.
- [ ] Root runs all11 unchanged cases and confirms both priority negatives reach their actual controls, all refund/source/re-delivery assertions execute, and replacement follows genuine Fire retirement. Add Dangerous/Burn occupant preserved, retained Zone fire, rejected/stale mutation, overdue freeze receipt and multiple affected cells before broader acceptance.

## Task 5: Recovery, round cleanup and bounded closing gates

- [ ] Add actual supported Capture/RestorePaired cuts for accepted bridge, pending exact Native result and accepted water awaiting structural retirement. Capture is not assumed to support pending creates; if the official API refuses that cut, preserve its actual refusal and clearly label corruption fixtures separately. Never forge an Effect/Native Original to manufacture recovery evidence.
- [ ] Validate full owner/Match/gen/source tuple/deadlines, bounded encoding, current Native binding and shared pending columns in hydration/resume with correct component ordering. No timeout-based deletion of Unknown. Restore cannot renew, allocate another generation, retire still-bound ECS or reapply returned credits.
- [ ] Round transition cannot discard unresolved freeze/water/retirement debt. Accepted live bridges require owned water+clear+retire through the ordinary cleanup protocol before next-map binding restore; never reset only a Game string and leave Native ice. Ordinary source/chest/barrel/reward accounting remains unchanged.
- [ ] Root retains actual same-source RED→GREEN, zero-skip11, Native receipt/round/Terrain/regeneration/Frenzy/Fire regressions, byte/object budget rejection and exact source/DLL/package identities. Formal12/23 and16/27 require complete producer budgets and real whole-game/next-round/long-run gates. No first-waveGREEN closes these.

## Plan review and handoff limits

Task3 covers successful clock/repeat/priority, Task4 covers atomic water/retirement/refund, Task2/5 cover durable source/debt/bounds/recovery/round ownership. Existing v14 declarations suffice; Native+ECS retirement is explicitly two stages. First-wave11 does not yet witness retained FireZone, dangerous occupant preservation, worst-case60/UTF8, abort/rejection, corruption, unknown births, paired Native restore, all profiles or full next round. These are required follow-up tests, not inferred successes. Production author must refine the new helper's codec into complete code and obtain Root's shared-file scope; this plan does not claim an unseen implementation or advance the formal guard.
