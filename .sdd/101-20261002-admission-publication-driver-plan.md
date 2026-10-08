# Admission publication and cleanup implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Drive the retained actual plan through one-frame Read/queue/ACK, actual writer fence, private settlement and exact old-owner cleanup.

**Architecture:** Root owns PendingAdmission and actual logical Room/Section counters, authenticated transport and independent Runtime owner records. This slice owns `admission_attempt.rs` and child protocol modules, plus the private grant/window borrowing seam. It never accepts public DTOs as authorizing capabilities. Original unknown requests and remote resources survive errors, cancellation and closed-world cleanup.

**Tech Stack:** Rust bounded windows, borrowed serde RawValue, actual ReservedPublication and PublicationFence, synchronous Runtime admission services.

## Global Constraints

- Keep canonical Engine successor-binding-v1 Read/ACK/reconciliation/debt schemas unchanged.
- Actual issuer is VerifiedHostSession plus independently drained InitialOwnerProjection/CurrentOwnerAttachment and actual socket/tick. Compare cursor0 bytes exactly; cursor1 uses existing initial_welcome_matches.
- Read requires an actual original socket sender reservation and prepaid caller frame/window storage. No all-frames buffering. Queue acceptance only authorizes ACK, never Written.
- Only actual fence Written or proven original-socket undeliverability permits private publication settlement. ACK and terminal receipt cannot release independent Native/structural debt.
- Actual Retained grant receipt may privately lend its CLR encoded reply extent once. Rust reply and both request backing stores remain separately charged; recover has no borrowing proof until original owner receipt is refreshed. No public flags to waive accounting.
- No Game/browser edits or publications. Root owns admission_owner/Owner and current actual-CLR integration; capacity owns Runtime/HostEntry.

## Task 1: exact owner and read credit

- [x] Real format regression for publication reservation IDs; Runtime currently accepts exactly32 lowercase hex, while former Rust prefix is invalid. Generate hash16+sequence16 from original incarnation under existing owner sequence.
- [x] Extend actual grant with accepted bridge extent and one noncopyable borrowed reply capability. Reserve before allocation; second concurrent borrow, foreign budget/connection, excessive response and unknown recovery must refuse. Pending/Released cannot forge retained credit.
- [x] Guard borrowed windows to Read only; release the borrow only after actual backing storage drops. Do not accept Released while a borrowed remote reply/cache remains live.

## Task 2: one-frame publication

- [x] `AdmissionPublication` retains ValidatedPlan, prepaid read/control windows, a precharged decoded frame buffer and actual socket/fence state. Its step method receives real verified session + owner facts/tick. Preserve original operation/window through unknown responses.
- [x] Check cursor identity/plan/digest/nextCursor/kind/sha/decoded length; auth/welcome validation precedes any send. Reserve next sender slot before next Read. Only actual successful send queues the ACK; failed enqueue retains or enters explicit undeliverable cleanup.
- [x] Final contiguous ACK verifies total records/bytes, then uses actual PublicationFence. Do not send settlement until Written/real failure evidence. Retain uncertain settlement and actual budget through retries.

## Task 3: cancellation and old-owner retirement

- [x] Rejected unused plan goes through exact Release, without fabricated gameplay terminal. Registered plan cancellation uses exact identity; ACK only a truly drained terminal supplied by Root.
- [x] Keep metadata, publication settlement, structural cleanup and snapshot Released independent. RetryCleanup/Retire route exact old incarnation with exportId0/digestnull for actual-drain path; never create a fake receiver or Export to mask provider gaps.
- [x] Add real bounded-queue/fence regressions and original-request failure injection; final strict suite/lint waits for Owner wiring so no permanent dead-code suppression is introduced.

## Located upstream discrepancy

The original no-Export RetryCleanup refusal was reproduced and fixed upstream for actual-drain NotApplied cleanup. Unknown precommit retains its full publication obligation and requires real Export/AcceptTransfer before settlement and cleanup; that path is now implemented here and has separate actual Host evidence from capacity_resume. Full composed-provider acceptance remains outstanding. See 101-20261003-owner-admission-flow-report.md for exact current proof and limits.
