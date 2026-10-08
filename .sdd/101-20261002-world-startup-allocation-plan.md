# World startup allocation investigation

Scope: isolated Runtime tree from frozen 4c9e654f; no Root Gameplay, generated files, active provider tree, timeout or product rule changes.

Evidence: official a5fa SDK Native and frozen Resume6 Gameplay/host04. Browser21 startup failed at 15 seconds; Engine+registry+config+assets 507ms, CreateWorld total 13187ms and 21.204GB managed allocations. Repeat22 passed with World7837ms but same21.204GB. Repeat23 internal diagnostic test-hook markers localize it after step tick: before864ms/6.68MB, after8533ms/21.204GB. The observer exists only in private diagnostic producer; it is not production glue.

1. Capture actual managed stack and allocation source inside WorldManager.Start or following tick binding; distinguish work from JIT/IO.
2. Write a focused Runtime regression proving excessive allocation/work while retaining the exact validation outcome. Run RED against frozen baseline.
3. Repair only the owning algorithm; preserve all capacity limits, side effects, failure checks and public schema.
4. Run narrow negative/boundary regressions, full affected module, all-TFM compile, then independent review with explicit commit and hashes.
5. Use official SDK producer/consumer flow for actual frozen browser repeat; no DLL replacement or Runtime project reference in Game. Retain15second condition and all original evidence.

Entry04 lifecycle review resumes after this major startup defect is fixed. Formal Platform/DS/full match proof remains separate and incomplete.
