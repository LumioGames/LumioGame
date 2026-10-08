# Sender queue reservation 窄独审：PASS

冻结输入：Server `.run/101-server-composition/admission-sender-reservation/manifest.json`，SHA256 `36aa435d03ede5664faf78ea034b56a58266547ba67c7a2e8fd4a7ec86d68627`。四文件冻结副本、当前源均逐字节符合 manifest，执行前后不变。未修改 Server 源码或构建输出。

审查范围：`Platform/src/channel.rs`、`Platform/src/lib.rs`、`Platform/src/transport.rs`、`Network/src/wire.rs` 的共享槽位与发送预算消费；只读 publication budget 和 reactor write/drop 必要上下文。

- 普通 send、try_send、send_timeout、try_reserve 在同一 Capacity 锁内核算 queued + reserved。预订持有原 Sender；未发送 Drop 退槽并通知阻塞发送者；成功发送只移交已占槽，不二次计数，真实 recv 退槽。接收端关闭拒绝新预订；已占 permit 返回原值并释放一次。并发 receive 先移出队列再退槽期间仅保守拒单，不可能超发。未见丢失唤醒或重复退槽。
- ReservedPublication 同时占实际 queue permit 和原 connection/process PublicationCharge；任一失败返回自然释放另一份所有权。准确 socket 与 observer identity 随原 sender 保留。oversize、非法 UTF8、关闭拒绝不入队；成功只证明 enqueue。消息出队后，charge 随实际输出继续保留至 writer 完成或释放，而非 recv 时提前退款。
- 已排队后 receiver 关闭的竞态允许先 enqueue、后 drop，这是既有 Result 成功仅证明入队的契约；输出 charge 随销毁释放，未误宣称写上 wire。Completion fence 仍由真实 sink.flush 成功发布 Written。

独立验证：复制 Root 的实际测试 exe 到 GTCG `.artifacts/resume-20261002/server-sender-reservation-review-01` 后直接执行 `--test-threads=1`，**Platform 55/55 + Network 55/55，合计 110/110，0 fail、0 ignored，均 exit 0**。包含 clone 并发 800 条、permit Drop 唤醒两类 sender、关闭/非法帧、真实 charge 保留/释放及 socket shutdown。证据 `proof.json`、`platform.log/.exit`、`network.log/.exit`；exe hash 为 `a9ab30b29fc6753f90ff1755a2e5ed4bb170214fb709ca2dc9a8e5986701154f` / `1614fa105f472f03441a3d9842ac64d51747d72d2c7289f4bcd55d930117e975`。

已核 Root 原 RED：普通 send 抢占已预订槽得到 Ok 而非 Full，及 Network reserve 非 current；修后断言未移除。Root full-02 的 Engine 315 pass / 1 原有 ignore 与 clippy01 exit0作为关联证据读取，本次未重新运行 Engine，也不把本窄审替代完整准入链验收。
