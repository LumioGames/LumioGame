# M2 real barrel production and promises

Continue the user's complete 101 formal delivery without lowering requirements. Read parent `.spec/AGENTS.md`, knowledge nav and standards, Game core docs and ROOT `.spec/decisions/0048-bomber-m2-map-packages-and-interaction-boundaries.md`. Use systematic-debugging, writing-plans and TDD. This brief is task assignment, not public approval.

## Ownership

Implement real barrels in `games/101-bomber/Gameplay/Components/Bomber/BomberBarrelState{,.Server}.cs`, `Gameplay/EntityTypes/Bomber/BomberBarrelEntity.cs`, new `Gameplay/BomberBarrelBombPromises.Server.cs`, existing `BomberInitialResources.Server.cs`, `BomberTerrainTransactions.Server.cs`, `Config/BomberTerrainBudget.cs`, and focused Server tests. Narrow append declaration `BomberWorldRuntime.BarrelBombPromises` coordinated with capacity agent, plus enum kind/hydration. Root yields these write areas. Capacity owns bomb declarations/generation/schema, generic admissions, ProcessBombs/Blast/ApplyDanger/Split. Coordinate hooks with `/root/capacity_schema`; do not edit its methods or generated files. Root owns browser/launcher/release integration.

## Exact source and consumption

Official complete06 at `.run/20261003-controlled-game/complete-release-06`, manifest SHA8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4; SDK/native hashes in handoff. All Game compilation uses this SDK, private NuGet/cache/artifacts. No sibling source references/generated output patches. There are hundreds of preexisting uncommitted changes; don't reset/clean/all-add or commit unrelated work. Serialize heavy build with Root; Runtime agent currently owns build slot.

## Required behavior

Current InitialResources only records 4/8 barrel indices and leaves Native empty. Add actual sparse-bound BlockEntity barrels, Native position sole truth. Preserve author firecracker1030 historical name; author fresh block1032 `barrel` and stable catalog row109012 using `Tools/official-catalog.mjs` (read authority mint API), officially regenerate tables. No direct generated edits. Initial19/23/27 counts4/8/8 and cap4/8/8; include barrels in initial batches and exact Native source validation; maintain mirror groups and 65% destructible budget. Do not remove M2 formal admission guard until all producers complete.

When actual explosion hits barrel, pre-reserve bomb credits before staging its Native destruction: original accepted transaction token + full barrel identity/generation + original source bomb/life/participant/life-generation/match/chain/shape, exact coordinates as input provenance only. Retain promise for Staged/Unknown; Rejected must not retain. The power3 inherited bomb must actually explode 100ms after Original Applied (2ticks at20Hz), so normal delivery creates/publishes earlier and fixes FuseEndTick=applyTick+2. The selected HostVoxelWorldAdapter synchronously commits staged mutations in the submitted ordinary Tick; use that persisted causal Tick only with exact source/timing proof, not for arbitrary async providers. Late Original delivery never restarts the delay; when due has passed, execute at first legally published/processed opportunity and retain the actual delay evidence, never fabricate earlier damage. No loot, no inventory credit refunded for barrel-produced bomb. Real Native binding destroyed/consumed exactly once; unknown/recovery cannot duplicate production or free credits.

World owns bounded promises after source barrel destruction, persisted `Sync<string>` default empty, <=8 records and UTF8<=16384 checked Encode/Hydrate. Sync<string> has no Engine field-length attribute; do not invent public limit. Stable promise token<=128bytes persisted on produced bomb; retain submitted promise through unknown creation and remove only exact actual matching bomb publication via Awake or hydration recovery. Do not use service-only state as durable capacity truth.

Capacity generic APIs being added: `CanReserve(World,int newCredits)`, `CreatePrimary(World,int futureChildren=0)`, `CreateFromPromise(World,string token)`. Root helper contract `BomberBarrelBombPromises.ReservedCount(World)` and `ObservePublished(World,BomberBombState)`. **Split sourceShape=4 promise reserves5 credits (primary+4 future children); others1.** Publication transfers those into mother+future4, no new capacity. Coordinate actual signature/recovery ordering with capacity.

## Verification

Write meaningful real Native RED first: no placeholder barrel at planned Native cells, binding identity/generation, actual trigger/100ms delay/source lineage/no loot/no inventory refund. Capacity pending/full/unknown/rejected/exact publication recovery cases, bound memory overflow/corrupt decode cases. Preserve original failed logs, no assertion deletion. Then implement and run relevant Terrain31/Corrective28, initial resource/round/layout and new barrel cases with exact source/DLL/package identity, zero skip. Original HFSM intermittent status1 remains unclosed; report any recurrence rather than classify environment. Emit exact report/freeze with implementation and all remaining dependencies. Need fresh independent review later, not whole Game approval.

## Immediate coordination

Tell capacity when all new persisted/entity declarations are ready for ONE official v13 generation and preserve v12 history/freeze. Root has not added Barrel declarations yet. Capacity already appended bomb FutureChildren/SplitSubmittedMask/SplitResolvedMask/ChildDirection/PromiseToken; no generation/build until declaration window closes.
