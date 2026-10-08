# 101 浏览器 F2 绑定读取执行计划

基线：Voxel `1d8a2db8fdabc4e77f22bc1cab5820afd815427c`，隔离树 `LumioVoxelEngine-101-browser-bindings`。Engine `0a265f4` 的 `voxel-world-v1.json` 已明确 count/read 签名和 24/16 字节布局，本任务只实现既有契约，不修改公开含义。

1. 在真实已构建 WASM 上先验证两个导出缺失，保留失败日志。
2. 编写 Native ABI 行为测试，覆盖 UTF-8、完整 uint64 revision、排序、空表、失败原子性、容量、8 字节对齐、失效句柄、不可用 Section 与释放后重入。
3. 安全 bridge 只调用既有 `world::read_section_binding` 获取单次已提交观察；FFI 预检全部容量后才写调用方缓冲区。不得缓存或重新解析业务身份。
4. 官方构建入口生成新 WASM，并在该真实模块上执行相同输入输出与错误路径；运行 Rust 全套、格式、静态检查、契约镜像一致性、规范检查。
5. 冻结源码提交与输入/输出 SHA256，交 Root 独审后进入正式候选发布。此前 release 冻结树保持只读。

并行后续：Client 会话 owner-thread 清理、预测驱动 Attach/Retire 生命周期按审查反馈逐项先复现；Game Session 入口消费候选发布物，保留表现层。
