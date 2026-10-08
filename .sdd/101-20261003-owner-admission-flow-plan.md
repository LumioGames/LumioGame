# Controlled admission port-flow verification

Scope: Server composition, test-only `owner/admission/flow_tests.rs`, plus its module declaration. The actual production Owner, Prebind, binding window, publication cursor, writer fence, Section frontier and cleanup owners must execute. ProtocolRuntime supplies managed-port replies; these tests do not claim CLR/Native integration.

1. Construct the verified original socket/session and real Owner fixture. Echo the actual acquired context and capacity; no direct ValidatedPlan factory.
2. Exercise Acquire, Reserve, Validate and ordinary enqueue, then deliver the original initial facts and terminal through Owner's existing drain-consumption path.
3. Include one actual encoded initial Section; park a newer delta while the sender is full. Assert exact initial order, real Ready transition, baseline fence and Session timing.
4. Inject an unknown ACK and original socket closure, retaining original requests, credits and cleanup until actual replies resolve. Record any production defects for Root to fix.
5. Separately verify the CLR shutdown exit preserves the actual terminal drain. Add a failing test before any narrow CLR fix, coordinated with Runtime's actual post-close API.
6. Run scoped port tests and lint, retain failures and exact counts. Full production/native acceptance remains separate.
