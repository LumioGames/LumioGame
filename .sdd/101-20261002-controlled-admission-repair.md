# Controlled admission owning repair (ACR3)

Root implementation source: `C:/Work/LumioGames/LumioGameEngine-101-controlled-admission-closure`, branch `codex/101-controlled-admission-closure`, based on reviewed Engine combination `0a265f4`. Canonical Native ABI remains c5f276c855bcb71fd9b04dcd546d1dd925ac408fd6303d56e30a2c044946a2f3. This is an owning model/API repair, not a provider, network, Game or profile acceptance claim.

The exact 19 paths of ACR2/905 were verified against its frozen manifest before a narrow merge. JavaScript CRLF-only conflicts were resolved by normalizing private merge inputs, not changing frozen sources. The canonical JSON retained current Chinese errorCodeSemantics and ADR-141 numbering. The removed runtime-manager-controls document was not restored: its controlled-admission additions and legacy ErrorMessage distinction were integrated into current ECS documentation. All four profile readiness gates remain closed.

## Findings repaired

- R1: registration always compares new identities to the monotonic high-water, independently of queued predecessors. The new public Cancel → terminal drain/ACK → old/fresh plan replay test stays before applying the predecessor. Real model RED was Queued instead of Refused; now no second terminal/allocator/route mutation.
- R2: retain the exact plan from successful Acquire, including unregistered work; precommit slots share actual configured admission/terminal capacity. Failed release after Cancel, stale preflight or Seal survives ACK. Closed Release routes by the original plan context through the incarnation registry without Tick or synthetic terminal. Four release cases and a configured-slot case have separate RED logs.
- R3: real ordinary drain can retire with exportId 0/digest null; no fictitious transfer required. A previously exported record can also retire after actual drain. Both ACK orders and sibling/precommit holds are covered. Incarnation unregister requires entries, acquired leases and exports all empty.
- R4: remove the undefined byte limit. Canonical text names existing HostLimitsConfig per-connection and checked process product, same ledger across acquired, deferred and old/new incarnations, with existing Section/Room budgets still binding. Model shares one exact charge ledger; retained old leases block replacement, failed release does not return capacity, actual release returns it once. Count, pre-existing Host debt and u64 product checks are included.
- Additional boundedness check: independent completion receipts were retained after settled open admissions; a 32-reconnect regression first failed and now verifies the receipt map retires each settled identity.

## Actual evidence

Evidence is this Engine tree `.run/101-acr3/`.

- `r1-red.log`, `r2-red.log`, `r3-red.log`, `r2-slots-red.log`, `completion-retention-red.log`: respectively 1/4/3/1/1 expected failing tests, exit 1, zero skips. R4 initial import RED was only missing API, and `r4-unwired-red.log` separately proves missing aggregate ownership charge (0 versus 3069 bytes).
- `model-final-03.log`: four complete successor suites, 474/474, zero failures/skips, exit 0.
- `wire-01.log`: complete wire verifier, 597/597, zero failures/skips, exit 0.
- `rust-code-build.log` and `rust-code-test.log`: actual generated Rust compiles; nullable registered-code round-trip tests 3/3, exit 0.
- `projection-build.log`: actual generated C# net10.0 + netstandard2.1 build, zero warnings/errors, exit 0.
- `generate-01.log`, `check-generated.log`: official generation and exact consistency, exit 0.
- `spec-lint.log`: strict 12 common + 7 extension checks, all pass, no skips/disabled, exit 0.
- `diff-check.log`: current 21-path delta has no whitespace diagnostics, exit 0.
- `loader-format.log`: official formatter fixes only NativeEngineLoader.cs and VoxelFacade.cs inherited formatting findings from Runtime verification. Non-whitespace text equality checked for both; formatter reported workspace warnings but exit 0. No Native ABI/source behavior change.

Independent review is pending. Runtime still needs the actual pure generated creation/allocator reservation, proposed observer/Section capture, frozen publication and process debt services; Server needs real verifier→CLR/Native→issuer/Section/parts/debt integration. Model tests do not prove those providers and cannot enable profiles.
