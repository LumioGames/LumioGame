# 停放原批 Host 控制元数据预付独审

限定范围 PASS：`LumioServer-101-composition` 的 `Engine/src/clr/admission_drain.rs` 与 `admission_drain_tests.rs`，对应 `.run/101-controlled-real-clr/parked-control-metadata-freeze-01/manifest.json` SHA256 `1bf1cd66e3ff193329ddbddf6dd4c86908ccd916ecb2297414fb194155f99254`。Root没有实现这两文件。

首次进入 managed Measure 前，Rust process budget 在原 Rust parser/scratch 与双端 payload backing 之外另预付534字节。来源为 Changed 路径两份104字节cut、两份88字节token、一个88字节world字符串和两份31字节数组头/对齐。费用跟随原 lane 保留，Delivered 后才释放；Take、未知结果和 ACK retry 未提前归还。默认预算与 public wire 未改变。

Root校验冻结两文件SHA与当前源码一致，并直接执行已构建 `lumio_server_engine-6daa925ca01765f2.exe` 的8个 `clr::admission_drain_tests`：**8通过、0失败/忽略、exit0**。没有重复构建或修改源码。证据在上述冻结目录 `root-independent-01.json/.log`，含实际测试exe与日志SHA。

限制：这是额外控制元数据预付的窄审查，不代替新Host真实多lane和Native桥联调。后续Host cut字段或字符串形状改变须重核104/88/31上界，最终组合仍需按真实Measure→Take→ACK全链验证。
