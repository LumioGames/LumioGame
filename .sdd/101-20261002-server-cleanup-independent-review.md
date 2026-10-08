# Server 关闭生命周期独立审查（2026-10-02）

结论：**退回一项 P2，修复后复审**。managed registry 单独守门、原 owner 保留及调用方有限超时路径未发现额外阻断缺陷；实际针对性复跑16/16，不能掩盖以下明确规范冲突。

## P2：生产关闭重试不得使用 thread::sleep 轮询

- 位置：`C:/Work/LumioGames/LumioServer-101-composition/Engine/src/owner.rs:1571–1574` 与 `1766–1772`。Kernel 构造失败和常规关闭都以 `while has_pending_shutdown` 加50ms `std::thread::sleep` 反复重入 Runtime。
- 依据：本仓 `.spec/knowledge/standards/repository-architecture.md:49` 明确生产代码不得直接 `sleep` 或轮询，要求 `host-runtime` 监督与有界口。Root已确认没有已批准例外。
- 所需修改：保留同一原 executor/runtime/kernel，以既有有界 owner 控制口接收显式 cleanup retry；正常 Gameplay 工作仍关闭。原 deadline 只能报告失败，不得退还未确认债务。关闭接收口不能导致 pending owner 提前销毁或忙转；重复调用必须幂等，初始失败状态不得变成成功。
- Root已接受该项并准备修复；本审查未写 Server 源码。

## 已核查路径

1. `shutdown_admission_owner` 先完成原 mutation/query/description 的 read-once 续读，再关闭 World，再清理原 Native arena；不是仅以 arena数量0认定全部资源清完。
2. arena清理后调用仍存活的 managed registry `admissionOwnershipQuery`。回复布尔必填；缺失、拒绝或不确定传输返回 error，`AdmissionCallWindow` 连同原请求字节与预算保留。true 消费该条回复后仍保持 WorldClosed，下一次读取新的实际结果；false 才到 `release_host`。纯managed debt与Native debit有独立守门。
3. `ClrGameplay.has_pending_shutdown` 在 admission owner 未进入 Released 时保持true。常规owner及Kernel初始化失败均不因caller取消/超时跨线程销毁资源。`SupervisedTask.join_timeout` 超时保留join，Drop无法join时detach，资源留在线程；没有把超时当成已释放。
4. `release_host` 最终是 `ClrBridge.destroy`。其未知destroy失败遵循既有单次handle销毁政策，不能二次重放FFI；Released保存错误，Host仍Faulted。该终态错误与仍需重试的world/arena/registry debt分开。
5. 初次 Runtime shutdown失败被Host fault记录；即使后来清理完成，后续shutdown仍返回错误。永久未结债保持原线程及依赖，有限join报告deadline，不伪报stopped。测试用100ms Held前缀证明deadline与同线程，不把有限执行声称为无限时间稳定性。

## 输入身份

原树：`C:/Work/LumioGames/LumioServer-101-composition`，HEAD `b89b8dbcb6495a52839bc9dd36b508159218d22d`，有未提交组合变更。精确审查五文件取该树 `.run/101-server-composition/owner-cleanup-review-manifest.json`，读前/执行后均一致：

- owner.rs `3ed292c38935c8a802117d4c3fee49a81c7fae525227a5fd6b8cec0fdf59cb51`
- owner_hardening_tests.rs `5bc9212bd6e3ab29a854162c2f20a359724d14e9452fadfc16a494b097b99306`
- runtime.rs `68ccd3db83e42da02d0a7bbc886c9e1be15e84a37031038fce26dfa9c9ed7fc3`
- clr.rs `5e09d60952de9ea52b27630592ab3c5ed39b20dbfda3e2dad2e6385985dabd10`
- clr/admission_arena.rs `80b4acaae96d0a14874fb18a38a63f271f9a37c80f9c3387d08a3c28fb7dd40b`

额外只读必要上下文：Platform supervisor、CLR bridge销毁语义、HostEntry managed registry query。没有修改或构建Server，避免干扰组合输出。

## 实际证据

独立执行根：`C:/Work/LumioGames/probe/bomber-terrain-growth-credit-corrective/games/101-bomber/.artifacts/resume-20261002/server-cleanup-review-01`。复制已有实际测试exe为不可变审查输入，SHA、命令、五文件SHA及完整输出在 `proof.json`。直接执行（不重新编译）结果：managed arena14/14、Kernel初始化失败保留1/1、shutdown deadline保留1/1；全部0失败/0ignored/exit0。此为Rust owner/桥接协议测试，不冒充真实CLR端到端。

Root原红绿证据已读：managed-debt-shutdown-red-01 3总/1过/2失败/0ignored/exit101，green-01 14/14/exit0；owner-retained-cleanup-red-01 2总/0过/2失败/exit101，green-01 2/2/exit0。owner-cleanup-full-01 Platform50/50、Engine310/310、1既有明确realCLR专跑ignore、exit0；clippy02 exit0。旧ignore不算本次已执行的CLR验收。

## 有界关闭口修正复审：限定范围 PASS

上述 P2 已修复。当前精确五文件以 Server `.run/101-server-composition/owner-cleanup-port-review-manifest.json` 为准，独立读前哈希核对全部一致。owner.rs SHA256 `b7949457b886f64c622530cfa917322539b0e4b29932bdb7b56ce02036a1f4eb`，owner_hardening_tests.rs `3f46d38fb544072cc5cc6bb1d497483355b15e2b5c7954f3204adae485c2b4fc`；其余三文件保持上轮身份。

生产路径改为 host-runtime `bounded_channel(1)` 的幂等 Retry 控制口。原 executor 持有 sender lease，外层 DsHost Drop 不会令接收口 Closed 并销毁未结 Runtime；接收阻塞而非轮询，无新时钟或 Tick。每次显式 shutdown 投递 Retry，Full 仅表示已有相同请求待处理；普通 OwnerWork 不再由此路径执行。常规关闭及 Kernel 初始化失败仍保留原 runtime/native 依赖、同一线程、caller 有限超时和最初 Faulted 状态。永久拒绝时等待后续明确请求，不能将 timeout 当作资源释放。

独立再次复制现有测试 exe 到 GTCG `.artifacts/resume-20261002/server-cleanup-review-02`，直接实际运行 managed arena14、Kernel失败保留1、deadline保留1：**16/16，0失败、0ignored、全部 exit0**。完整命令、当前五文件身份及冻结 exe SHA 见其 `proof.json`。新增断言实际证明100ms没有显式 Retry 时调用数不变，以及 pending 期间排队的 Gameplay 不执行。只读复查 Root owner-cleanup-full-02（Platform50、Engine310过/1既有ignore，exit0）和 clippy-03 exit0；未重编译或修改 Server。本 PASS 仅覆盖原审查五文件关闭生命周期，不代表真实 CLR 全链或整个 Server 已验收。
