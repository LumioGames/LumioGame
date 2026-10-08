# Host 输入缓存窄审：PASS

范围：Root Server `Application/HostEntry/src/Lumio.Server.HostEntry/HostEntry.cs` 的 native 缓存重试输入借用，以及 `Application/HostEntry/tests/Lumio.Server.HostEntry.Tests/SuccessorResponseCacheTests.cs`。只读必要 successor debt 和 admission receipt handoff 上下文，未修改 Server 或 Runtime 源码、构建输出。

审查源 SHA256：HostEntry.cs `4a31d85a1930b950a92d8289630058ef416218dadcd158799327248c8712fc06`；测试 `562543ede65aa1c9baf14cb3bc73239bfc98fd54ffe0bf58ffe151bc4091e23a`。独立执行前后源字节一致。

缓存重试在原 Gate 内比较调用期间有效的 Native input span，仅新操作分支 ToArray。相同请求复用 PendingRequest 原数组；短输出再次停放同一响应和请求。不同请求不执行、不更换原缓存。存在 successor 行或 admission 三类 owner receipt（包括 Released）时，discard 不能删除唯一对账证据；空 successor lanes 保留既有 discard 行为。span 没有逃逸本次 unmanaged 调用。未发现本窄改动的阻断项。

独立执行：复制 Root 已建 source-backed 独立测试项目的实际依赖闭包到 GTCG `.artifacts/resume-20261002/server-host-cache-review-01/bin`，记录全部 121 文件 hash，直接 dotnet 执行。**14/14 通过，0 失败、0 跳过，exit 0，832ms**。证据绝对根为 `C:/Work/LumioGames/probe/bomber-terrain-growth-credit-corrective/games/101-bomber/.artifacts/resume-20261002/server-host-cache-review-01`，含 `proof.json`、`test.log`、`test.exit` 和两份只读源副本。

核对 Root 的原 RED `.run/101-root-host-cache-review/cache-red-01.log`：1MiB retained request 的相同请求重试额外分配 1,048,632 bytes，断言真实失败。当前同一用例通过且验证原 request/response 数组身份仍相同。这里证明 transport cache，不把反射注入响应升级为真实权威准入，也不声称已覆盖 DOM/DTO 或整体 Host 内存预算。
