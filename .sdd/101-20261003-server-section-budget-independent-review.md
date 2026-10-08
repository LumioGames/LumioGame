# Section publication budget independent review

Root reviewed the seven exact source hashes in Server `.run/101-server-composition/section-budget-freeze-01/manifest.json` and confirmed no source drift before running the focused regressions. The implementation closes the three findings in `101-20261003-server-initial-publication-budget-review.md`; no new blocking issue was found in the reviewed scope.

- Initial Ready storage is reserved before Arc/map/key allocation. The retained storage and transient initial cursor have separate lifetimes; releasing the cursor does not refund the index.
- Initial Section validation borrows closed headers and streams the hex digest. Follow-up parsing, candidate state copies, output buffers and JSON scratch are reserved before allocation. Overflow rejects before mutation. The original 4 KiB positive case still passes.
- Deferred raw groups keep their original charge during routing. Planned output owns its reservation through sender handoff; successor correlation IDs retain a smaller reservation until the original publication debt is actually removed. Production no longer clones every encoded write merely to iterate it.

Root independently ran Section 57/57 and controlled Owner flow 10/10, with zero failures or ignored tests and exit 0. Evidence: Server `.run/101-server-composition/root-section-budget-independent-02.{log,exit}` and `root-section-owner-independent-01.{log,exit}`. The first independent invocation omitted the Engine contract root and failed in the build script; `root-section-budget-independent-01` preserves that setup failure. The corrected invocation supplies the required source root and uses Root's separate Cargo output.

The author's full Engine 381 passed / 0 failed / 1 existing ignored and strict Clippy evidence is recorded in the implementation report. Those totals are author evidence, not a second independent full-suite run. This review does not claim the unfinished ordinary Host drain bridge, the full Game session, or final unified release acceptance.
