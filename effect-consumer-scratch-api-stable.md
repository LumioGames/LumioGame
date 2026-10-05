# Effect consumer scratch API — stage v4

2026-09-30. Architecture source/API handoff for main and generator, pending root independent review; readiness remains false. A = `C:/Work/LumioGames/LumioGameEngine-101-container-wire`. Exact frozen source: `C:/Work/LumioGames/LumioGameRuntime-101-effect-integrated-evidence/consumer-completion/architecture/stage-v4/after`.

Authoritative source is `engine/wire/effect-lifecycle-v1.json`; supported `node eng/generate-abi.mjs` projects `engine/wire/generated/EffectLifecycleContract.g.cs`:

| Generated constant | Value |
| --- | ---: |
| PlanScratchLocalBytes | 128 |
| PlanScratchClaimBytes | 256 |
| PlanScratchFrameBytes | 32 |
| PlanScratchClaimColumnBytes | 32 |
| PlanScratchFieldCounterBytes | 8 |
| FactAssociationHeaderBytes | 64 |
| FactAssociationBindingReferenceBytes | 8 |
| FactCertificateFixedBytes | 84 |
| FactCertificateColumnHeaderBytes | 8 |

For every root or hook program P:

`scratch(P) = 128*declaredLocals + 256*declaredRowClaimLocals + 32*sum(maxColumns(local)) + 8*declaredFields + 32*maximumStructuralDepth + max(simultaneouslyActiveHookScratch)`.

Derive `maxColumns(local)` from validated Claim sites assigning that local and actual permitted row schemas. Sum independently for all claim locals, including two locals claiming the same row. No Claim site means zero columns but still local128 + header256. Branch allocations stay reserved. Loop iterations reuse only after lexical retirement. Root fields include the complete transitive hook field closure; each active hook also charges its own declared field counters. All arithmetic is checked u64, then compared to the unchanged 16,777,216 scratch cap and declared maximum before Ready. Frame depth follows validated statement/expression syntax; active nested hooks add recursively.

ClaimColumn32 = storage reference8 + fixed scalar16 (two u64, including entity) + attempted-write count8. Codec/field identity/permissions are shared frozen metadata. FieldCounter8 = attempted-write count8. No caller-provided scratch estimate can establish these maxima.

For each validated fact:

- `certificateBytes = 84 + sum(8 + codecWidth)` over fact-written captured/output/ready columns only.
- `associationBindingBytes = 8 * row.columns.length`, including status columns.
- `scratchBytes = certificateBytes + 64 + associationBindingBytes`.
- `settlementFactScratchBytes >= checked(pendingRequests * max(fact.scratchBytes))`; empty fact set has maximum zero. The original eleven D1 inequalities are unchanged.

AssociationHeader64 = six reference8 slots (storage, record identity, generation/storage token, frozen schema, admitted snapshot, slice owner) + captured extent4 + index4 + lifecycle flags8. Canonical certificate storage and admitted snapshot retain identity/owner/index values; do not hide another variable scalar array behind this header. Example: 14-column fixture, 13 written columns: certificate297 + header64 + bindings112 = **473**. Adding three status columns leaves certificate297 and gives scratch **497**.

Reserve full per-request slices before eligibility and retain through the entire reducer round, including Rejected requests without a completed certificate. Retained admitted payload/identity keeps its original pending-snapshot byte credit independently. Completion spends only transient writes/indexed/bytes, never releases retained scratch. The oracle's `budget.scratch` denotes an already reserved per-request envelope, not a global available-byte counter. Aggregate pool occupancy and whole-round disposal remain Runtime responsibilities.

Oracle `validateEffectFact` now returns `associationBindingBytes` and `scratchBytes` alongside unchanged `certificateBytes`. `captureAdmittedEffectRequest(plan, registry, storage, request, budget)` now requires the retained scratch envelope as fifth argument; preflight supplies it internally. Existing preflight/Claim/SetAt signatures otherwise remain. No opcode, tuple revision, result90 or certificate encoding change.

Validated plan/registry metadata is immutable startup storage bounded by existing source/registry caps. Allocate dense arrays from derived maxima outside F, reuse them, and avoid per-write allocation. These are logical interpreter payload charges, not exact CLR object/array headers or stack sizes. Runtime must separately bound allocator framing, alignment, pools and actual stack implementation from caps/counts; JS oracle Maps/copies are behavioral models, not evidence of allocation-free Runtime execution.
