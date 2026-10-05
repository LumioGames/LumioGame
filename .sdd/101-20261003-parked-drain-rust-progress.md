# 101 关闭时原始整批交接：Rust 窄切片

2026-10-03。范围是 Server 私有 CLR 桥，尚未完成新 Host 的真实整批联调，不能据此认定整局或最终发布通过。

- 冻结源码：`C:/Work/LumioGames/LumioServer-101-composition/.run/101-controlled-real-clr/parked-bounded-freeze-01/manifest.json`，SHA256 `a1e21bd955699b9b0ea6bc2419b2cdea76c1d7a320500e2b9c0afd4645470d7e`。
- 生产入口：`Engine/src/clr/admission_drain.rs`；`clr.rs` 和 `clr/admission_arena.rs` 接入原 `drainPending` 分支。现有 `ShutdownRuntimeDrain` 继续持完整原始窗口及各 lane 数量，仅额外解析终结记录。Root Owner 的保留/清理规则不变。
- 原始批次通过同一 incarnation、32 位小写 hex token、十进制完整长度核对。Measure 为 2048 字节受限窗口；Take 为 max(实际编码长度, 2048)；ACK 为 2048。所有双边编码 backing、managed 临时峰值、Rust 终结存储/解析 scratch 及 ACK 窗口，在 Take 前预付。
- Take 与 ACK 遇到不确定返回均保留原请求、窗口和资源；Host 的完整 `Transferred` 回执到达前不会交给 Root。只有匹配原身份的 `Retained` + `Changed/Capacity` 拒绝能释放该未消费调用并重新计量。错误回包留在原拥有者，不读取下一批，不销毁 Host。

实际证据均位于上述 Server `.run/101-controlled-real-clr/`：

| 证据 | 实际结果 |
|---|---|
| parked-bounded-red-02 | 原批次无法交回、预算缺口：2 失败，0 忽略，exit 101 |
| parked-ack-red-01 | 仅成功复制便交接：1 失败，exit 101 |
| parked-ack-credit-red-01 | 领取后无额度确认：1 失败，exit 101 |
| parked-retained-red-01 | 确定未消费后不能重测：1 失败，exit 101 |
| parked-bounded-green-02 | 6 通过，0 失败/忽略，exit 0 |
| parked-bounded-full-02 | Engine 387 通过，0 失败，1 项既有忽略，exit 0 |
| parked-bounded-clippy-05 / format-01 | 严格检查均 exit 0，无新增 allow |
| parked-real-eight-02 | 当前正式 Host24/b213 + 真实 CLR + 八个原 socket，receipts-parts profile：1 通过，0 失败/忽略，exit 0 |

`parked-real-eight-01` 用错精确筛选名称，实际为零测试，明确不算通过；保留原日志，并给 runner 增加恰好一项执行门。前两次检查编译/格式修正失败日志同样保留。

待办：Gameplay 的同源 Runtime no-copy codec、Host Measure/Take/ACK 冻结并官方发包后，重建 Host 与 Game，执行实际 parked batch → 原 Root Owner → 关闭清理，随后实际 Platform/DS/Bot 完整对局。当前 b213 缺已批准 100e fact verifier，两文件正在上游组合，禁止混用旧 SDK189 DLL。

### 独审 P1 修正（freeze02）

Capacity 的 Owner + CLR 组合独审证实：旧 freeze01 在已知成功的 Measure/Take 阶段之间等待外部 Retry，单次 shutdown 会卡住。新增 one_shutdown_poll_delivers 用例真实 RED 后，poll 改为单次最多顺序执行已知成功的 Measure→Take→ACK；没有循环，Unknown/预算失败立即返回，Retained 不自旋。

新定向7/7、Engine388通过/0失败/1既有忽略、严格Clippy06通过。冻结 `.run/101-controlled-real-clr/parked-bounded-freeze-02/manifest.json` SHA `3c1fcc1afce4296b69ce9ca588f35036cd0da5cf78f88cfdc0f9fffebc24f586`。Capacity 独立组合1RED→1GREEN及parked7/window6/shutdown14均通过；其独审报告随后归档。新Host真实整批端到端仍待官方组合。
