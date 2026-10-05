# Runtime controlled admission provider independent review

Status: the reviewed Runtime production candidate and independent complete test run pass. This is not approval of the pending public contracts, Server composition, or Game delivery.

## Identity and scope

- Runtime production source: `3c4aa21c470159e384c0ba7fd88d62c5604c270a`, parent `215b7cf1a97c877d3bbecf1fdd1c11516dbcf7e0`.
- Author's 108-file manifest: `C:/Work/LumioGames/LumioGameRuntime-101-hydration-complete-world/.run/101-controlled-admission-provider/runtime-3c4-manifest.json`. Root independently checked every listed SHA256: 108 matched, zero mismatches after regeneration.
- Independent first build used `C:/Work/LumioGames/LumioGameRuntime-101-provider-freeze3c4`, Engine source `C:/Work/LumioGames/LumioGameEngine-101-binding-context-budget`, and a fresh ArtifactsPath. All target frameworks built with locked restore, zero warnings/errors, exit 0.
- Root inspected complete Native Section acquisition/revalidation/release, full entity and Effect read sets, creation preparation and queued predecessors, retained codec work, terminal/transfer/retirement ownership, process arena and private grant/publication receipts, and bounded frame encoding. Previously identified BindingContext allocation-before-refusal is fixed and independently tested in its separate report.

## Independently reproduced and fixed test harness failure

The first complete run had **2843 tests: 2841 passed, 2 failed, 0 skipped, exit 2**. Both failures were `PrimeJitInvariantTests`: `LocateProbe()` assumed `bin/<configuration>/<framework>` and misread the isolated `bin/<project>/<pivot>` layout. The exact probe had been built but was not found. This was a real harness failure, not a startup-performance pass.

Root fixed only the test's lookup: use the exact sibling project and pivot in the current artifact set, and fail if that sibling is absent. It cannot fall back to an older source-tree build. Production files and both zero-tolerance JIT assertions remain unchanged. The change is Runtime commit `f70842e` (`test(simulation): locate prime probe in isolated artifacts`).

After rebuilding all frameworks into another fresh output tree, the complete run had **2843 passed, 0 failed, 0 skipped, exit 0**, duration **1m35.125s**. The targeted format verification exited 0; it reported a workspace-load warning, not a source-format violation. Build had zero warnings/errors.

## Evidence

All following paths are relative to the active Runtime's `.run/101-controlled-admission-provider/`:

- `root-provider-build-01.log` and `.log.exit`: first independent frozen build.
- `root-provider-tests-01.log` and `.log.exit`: retained two-failure run.
- `root-provider-build-02.log` and `.log.exit`: all-framework rebuild after the harness fix.
- `root-provider-tests-02.log` and `.exit`: final complete green run.
- `root-prime-format-01.log` and `.exit`: targeted format verification.
- `run-root-provider-tests.ps1`: exact native identity validation and test invocation.
- `root-provider-artifacts-02/`: independently built assemblies used by the final run.

Native and support binaries were checked against their build-info hashes and common source identity before execution. These Runtime tests used the existing real Native build `2020bcc47cee042330ff5a8d949ada92` and its same-source HFSM/prediction support build. They are not claimed to be a test of the newly packaged b213 SDK's Native payload.

## Remaining boundaries

Native zero revisions, an empty closure's actual Native cut, and the 16-slot public declaration change remain unapproved and are still refused. The current source does not fabricate positive revisions. The official b213 candidate combines Engine ad810 and Runtime3c4, but its real CLR/Host/Owner/socket and browser acceptance remains separate.

Server shutdown with a previously parked ordinary drain and Server Section/deferred-output budget findings are still being fixed. This Runtime result does not close those defects, the Game strong-chest next-round regression, or full match/replay/soak/visual/audio acceptance.
