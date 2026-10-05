# Container Replication Repair Implementation Plan

> **For agentic workers:** Use subagent-driven-development for scoped implementation and independent review. Execute continuously under the user's agile repair authorization.

**Goal:** Repair the generic Runtime container publication that makes legal Bomber journal mutations exceed the 65536-byte production frame limit.

**Architecture:** Implement the existing container-delta-v1 contract through authority publication and replica transactions. Assess oversized atomic baselines separately and resolve any contract gap at the architecture source before extending production semantics.

**Tech Stack:** C# Runtime ECS, generated declarations, JSON WorldChange, Rust Server and the official SDK packer.

## Global Constraints

- Official v0.0.4 Engine bytes remain unchanged. Use Runtime d287bcd009a740de45fb279f26aa145ea1d200d5 as the isolated repair baseline.
- No commits, push, public release, weakened assertions, event dropping, higher transport limit, remote-write bypass or forced ticks.
- Public wire semantics have one source: LumioGameEngine/engine/wire. Existing container-delta-v1 requires full baselines, folded deltas and atomic application with scalar fields.
- Validate Game semantics through the official replica path. An authored preview is not live gameplay evidence.

## Task 1: Ordinary Container Publication

Files: Runtime Sync/SyncTypes.cs, World/WireValueCodec.cs, World/WorldManager.Visibility.cs, World/WorldManager.cs and focused ECS tests. Add narrowly scoped helpers beside the owner modules if needed.

- [ ] Reproduce repeated list writes and cover list/dictionary net operations, observer baselines, claim grant/revoke and malformed rollback.
- [ ] Implement existing wire payloads and one folded publication per dirty container, preserving callback and prediction semantics.
- [ ] Run covering tests and record the precise remaining baseline/contract limitations.
- [ ] Independent specification and quality review.

## Task 2: Atomic Baseline And Byte Budget

Files: architecture wire/feature/ADR sources only if required, then Runtime/Server/Client owner modules identified by the source trace.

- [ ] Trace existing packet size, staging and transport behavior against an individual oversized baseline.
- [ ] Record the defect and define bounded, atomic delivery at the owning layer before implementation.
- [ ] Implement and test the supported path with late-join and reconnect during journal expiry.

## Task 3: Candidate And Game Validation

Files: official SDK packaging inputs in isolated workspaces; BomberJournalWireBudgetTests.cs consumes the actual replica API.

- [ ] Build a separate immutable local candidate through the official packer and verify artifacts with protection enabled.
- [ ] Verify journal occurrence identity, retention and expiry with eight observers at the 65536-byte limit.
- [ ] Run bounded actual eight-Bot diagnostics, then continue the documented damage and respawn defects before full-match acceptance.
