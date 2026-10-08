# Client 生命周期与 Voxel 读取增量独审

Root 对 Client `95a4545..ecd88285c1a3e83a977d3630f263fe70357aa307` 七路径与 Voxel `1d8a2db..2ba61e431d8080ff6450a07e6ee447e3f0994e0b` 六路径作窄独审，结论限定 PASS；不等同最终正式整局验收。

Client 原先两项退回已处理：Session 的分片及准入资源只在 owner 且非 RPC 回调重入边界释放，off-owner RequestClose 不提前清理；prediction subsystem 在调用 Native 工厂前检查占用，按同一 driver 身份退休，Dispose 失败保留所有权。桌面 Application 与 portable Spectator 使用同一生命周期机制。Root 独立实际运行跨线程 Close/Dispose 2/2（`LumioClient-101-composition/.run/composition-20261002/root-lifecycle-session-03`）与 driver 退休/失败/重附着 1/1（`root-lifecycle-prediction-02`），全部 exit0、零跳过。前两次独立尝试因错误输出位置/缺契约环境未通过，原日志保留，未算业务 RED。

Voxel 两导出对应已有 canonical 24/16 字节布局，直接从真实已提交 binding reader 取一次观察；u64 revision 和 UTF-8 身份无损，容量与对齐先检查，失败不写任何输出。Root 阅读全部生产改动及边界测试后，独立运行同一正式产物的真实 WASM 4/4、exit0、零跳过，证据 `LumioVoxelEngine-101-browser-bindings/.run/101-browser-bindings/root-independent-wasm.*`。指针可写区/互不重叠仍是现有 unsafe ABI 调用方责任，没有扩大契约。

Client 实现者完整1235/1235、portable67/67及实际浏览器重附着证据；Voxel完整718加显式2性能、真实WASM4/4等证据见各自交回报告。本审查不将这些测试替代正式浏览器 Game/DS 整局，也不声称已完成同一 full Engine world 的 mesher/lighting 桥；后者在独立上游树继续实现。
