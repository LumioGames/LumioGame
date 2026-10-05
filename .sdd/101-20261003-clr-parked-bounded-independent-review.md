# CLR parked ordinary drain：独立审查与组合回归

日期：2026-10-03。审查者：capacity_resume；作者：client_composition。审查者未修改正式 Server、Host 或 Runtime 源码；仅在 `.run` 隔离副本增加组合回归。

## 裁决

**freeze-01：NEEDS CHANGES；发现的 P1 已由作者修复。freeze-02：限定 Rust 源码、预算顺序及受测组合范围 PASS。**

这不是新版 Host Measure → Take → ACK 的端到端验收。Host 新协议尚未在这次审查中构建、加载或实际执行；旧 Host24 的真实 8 连接只证明原 ordinary admission 回归，不能证明新 parked 协议、Host 计数器或其托管分配预算。

## 精确输入

Server 根：`C:/Work/LumioGames/LumioServer-101-composition`。

- 初始清单：`.run/101-controlled-real-clr/parked-bounded-freeze-01/manifest.json`，独立核对 6/6 源文件和 18/18 证据哈希一致。
- 修后清单：`.run/101-controlled-real-clr/parked-bounded-freeze-02/manifest.json`，SHA256 `3c1fcc1afce4296b69ce9ca588f35036cd0da5cf78f88cfdc0f9fffebc24f586`。独立核对 6/6 源文件和 26/26 证据哈希一致。
- 独立核对结果：`.run/101-controlled-real-clr/capacity-parked-freeze02-verification.json`。
- 审查输入另包含 Owner 集成三文件；九文件完整哈希：`.run/101-controlled-real-clr/capacity-parked-review-inputs.json`。

六文件范围为 `Engine/src/clr.rs`、`clr/admission_arena.rs`、`clr/admission_drain.rs`、`clr/admission_drain_tests.rs`、`runtime.rs`、`admission_window.rs`。

修后 `admission_drain.rs` SHA256 为 `89da32cdb9667569a752185ab0fcbcbbc192747ecd33876636cd02d34570ad95`；测试文件为 `bb40a21186ce8368d39a6fae1d50de43115aaa1286b615a6600411c914b7776c`。其余四文件保持 freeze-01 身份。

## P1：正常阶段进展被当作必须外部唤醒的阻塞

原 `poll_parked_runtime_drain` 在 Measure 成功、Take 成功但尚未 ACK 时都返回 `Ok(false)`。`shutdown_admission_owner` 将其转成等待错误；Owner `finish_controlled_shutdown` 只有取得 batch/terminal 或处理实际 owner 结果才认定 `advanced`，因此进入 `receiver.recv()`。

`DsHost.shutdown` 只排入一次 `CleanupCommand::Retry`。首次 shutdown 得到 `drainPending` 后，正常 Measure 消耗该唤醒；Take 完成后再次等待，ACK 永远没有被调用，直到调用者另外发起一次关闭。原 CLR 测试手工多次调用 `shutdown`，原 Owner 测试使用一步交付夹具，未覆盖两者组合。

独立组合测试使用原生产 Owner 和 freeze-01 CLR。测试夹具只改成合法零 terminal，保留其他六车道，避免不相关 unmatched terminal 阻塞。唯一初始唤醒与 `DsHost.shutdown` 相同，未执行 Tick。

- 实际 RED：`capacity-parked-owner-red-02.log/.exit`，1 失败、0 跳过、exit 101。两秒后记录只有原 Measure、Take 请求，没有 ACK。失败记录后额外 Retry 仅用于退出隔离测试线程。
- 作者窄修：一次调用顺序完成已知成功的 Measure → Take → ACK；没有循环。Unknown 立即返回并保留原窗口，明确 Retained/Changed/Capacity 返回等待而不自行重测。
- 独立 GREEN：仅将修后的 `admission_drain.rs` 放进同一个隔离副本，同一组合测试 1/1、0 失败/跳过、exit 0。
- RED/GREEN 副本：`.run/101-controlled-real-clr/capacity-parked-owner-review/`；原生产文件保存在 `freeze01-admission_drain.rs`。建副本脚本：`setup-capacity-parked-review.py`。

`capacity-parked-owner-red-01` 是测试辅助代码缺少 Debug 约束导致的编译失败，不计逻辑 RED。`capacity-parked-owner-green-01` 因复制文件保留旧时间戳导致 Cargo 复用旧测试程序，仍跑出旧失败；只更新隔离文件时间戳并确认重新编译后的 `green-02` 才计 GREEN。两份诊断均保留。

## 源码核对

- Measure 绑定原 world incarnation、32 字符小写 hex token；所有十进制数量执行格式、溢出和上限检查。测量响应没有生成或消费原批次的权力。
- Take 前先预付托管临时峰值、Rust 解码驻留、完整双侧输入/输出 backing，以及后续 ACK 窗口。任一预留失败都没有执行 Take；已创建的局部窗口和 charge 按作用域退回。
- `AdmissionCallWindow` 在分配 Vec 前向实际同一个 PublicationBudget 收费；输出不得扩容。Unknown、超窗或无效 UTF-8 保留原请求及 charge。后续调用使用原始请求字节，不重新生成 Take。
- Take 读取原响应。六条 opaque 车道使用借用 RawValue 计数，未构建 Value DOM、未重编码；terminal 使用测量数量精确分配 Vec。完整编码字节数、七车道数量及原 token/incarnation 都必须匹配。
- Rust 解码预付由 `3 × replyBytes + terminalCount × size_of(record) + size_of(batch)` 组成：所有保留字符串不超过编码总字节，serde 临时字符串缓冲的几何增长另留两倍编码字节；terminal 记录内的可选 attachment 是内联类型。该预付发生在任何 terminal 行解码前。
- 收到并验证 Take 不能向 Owner 交付。必须收到原 token 的 `Transferred` ACK；ACK 未知保留原 ACK 窗口和完整 batch。只有明确原 token 的 `Retained` 且 reason 为 Changed/Capacity 才放弃本次测量并允许后续重测，不能把一般拒绝或未知解释为未消费。
- batch 是 move-only。原 response window、terminal 和解码 charge 一起进入 Owner，重复 take 返回 None。Owner 只消费匹配原身份的 terminal；未匹配记录连同所有 opaque 车道继续保留。
- Owner 到真实 Runtime teardown 完成、所有受控 admission owner 退清、所有 retained terminal 已处理、Egress 停止接受发送后才释放 opaque batch。`Egress.is_closed()` 并不等于 TCP/listener 线程已 join；外围 `DsHost.shutdown` 仍负责真实 listener、forward、owner join。这一区分与此前 Owner 独审一致。

## 独立执行

以下日志均位于 Server `.run/101-controlled-real-clr/`，每份都有真实 `.exit`。命令筛选数量存在重叠，不相加成独立用例总数。

| 回归 | 通过 | 失败 | 跳过 | 退出码 | 证据前缀 |
|---|---:|---:|---:|---:|---|
| 原 freeze-01 parked | 6 | 0 | 0 | 0 | capacity-parked-review-01 |
| 双侧 buffer/未知窗口 | 6 | 0 | 0 | 0 | capacity-window-review-01 |
| Owner + 旧 CLR 组合 RED | 0 | 1 | 0 | 101 | capacity-parked-owner-red-02 |
| Owner + 修后 CLR 组合 | 1 | 0 | 0 | 0 | capacity-parked-owner-green-02 |
| 修后 parked | 7 | 0 | 0 | 0 | capacity-parked-review-02 |
| 修后关闭相关 | 14 | 0 | 0 | 0 | capacity-shutdown-review-02 |

标准命令为 `cargo test -p lumio-server-engine --lib <filter> -- --test-threads=1`，filter 分别为 `clr::admission_drain_tests`、`admission_window::tests`、`shutdown_`。组合测试额外传隔离副本 Cargo.toml，并筛选 `review_one_owner_shutdown`。

独立构建目录 `.run/101-section-budget-target`；`LUMIO_ENGINE_ROOT=C:/Work/LumioGames/LumioGameEngine-101-binding-context-budget`（6f625）；Native 环境仍为官方 b213 SDK 对应的 `C:/Work/LumioGames/.101-clr/host-sdk-5cLH2H/packages/lumio.engine.sdk/0.1.0-dev.b213f7dedd804d9384a3ba3b3d97bb472a23abcbf8efabc9b2a521811c3acb51/runtimes/win-x64/native/lumio_engine_native.dll`。这些窄回归中的 CLR 入口为受控 port 夹具，不宣称加载真实 Host。

作者修后完整 Engine 388 通过、0 失败、1 个既有 ignored，以及 strict Clippy/format 结果的日志哈希已核对；本审查未冒充独立重跑该完整套件。

## 必须继续的真实链路验收

新版 Host 需要实际证明 Measure 不分配/不移除原批次，`managedPeakBytes` 覆盖真实托管临时对象且不重复借用长期预算，Take/ACK 共享原 token 和原请求缓存，短缓冲及传输未知只重放缓存。当前 Rust 对该 Host 测量值的消费不是 Host 测量正确性的证据。

后续应在同一官方 SDK、真实 Host、CLR、Owner、socket 下制造 parked ordinary batch，完成原批次测量/领取/ACK、World shutdown、终结与旧 owner 清债、socket 关闭及最终预算归零。需要包含未知 Take/ACK、容量拒绝、所有车道和 unmatched terminal；不得以本报告的 port 夹具或旧 Host24 admission 成功替代。
