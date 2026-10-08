# 101 Voxel 浏览器 F2 绑定读取交回

源码树 `C:/Work/LumioGames/LumioVoxelEngine-101-browser-bindings`，提交 `2ba61e431d8080ff6450a07e6ee447e3f0994e0b`，基线 `1d8a2db8fdabc4e77f22bc1cab5820afd815427c`（此前批准来源的 release-section 修复）。未修改主 checkout、此前冻结树或公共契约。

实现 Engine `0a265f4` 既有 `voxel-world-v1.json#meshOutput.wasmInterop` 的 `lumio_voxel_section_binding_count` 与 `lumio_voxel_read_section_bindings`。24 字节 summary、16 字节 entry 均按 8 字节 staging 对齐；读取既有 `world::read_section_binding` 的一次提交观察。容量/指针/对齐检查完成前不写调用方任何缓冲区；身份保持任意有效 UTF-8、完整 uint64 revision，不设新限制或缓存。

实际证据位于该 Voxel 树 `.run/101-browser-bindings/`：

- `wasm-red.log`：旧正式 builder 产物缺导出，0/1，exit 1。
- `native-01.log`：导出 ABI 20/20，0 failed/ignored，exit 0；首次本机链接产生一条 MSVC 导入库文字 warning，未隐藏。
- `full-tests.log`：全 workspace **718 passed / 0 failed / 2 ignored**，exit 0；`explicit-perf.log` 显式执行原默认忽略的性能用例 **2/2 / 0 ignored**，exit 0。合计 720 项实际执行。
- `wasm-green-01.log`：测试辅助器误分配零长度错误字符串缓冲区，1/4，exit 1；按实际 ABI 零长度约束修测试辅助器后，`wasm-green-02.log` **4/4，0 skipped，exit 0**。
- `clippy.log`（all targets/all features、-D warnings）、`no-default.log`、`fmt.log`、`crate-dag.log`、`collision.log` 均 exit 0。`spec-strict-final.log` 12 通用 + 1 扩展全部通过，`spec-self.log` 19/19 通过。
- `official-web-build-01.log`：通过 Engine 官方 `defaultBuilders.web` 构建，exit 0；full SDK WASM 仍保留已有 13 条 cfg(test-support) warning。Voxel WASM 输出 `C:/Work/LumioGames/LumioClient-101-composition/.run/composition-20261002/official-web-bindings-build/web/lumio_voxel_wasm.wasm`，611289 bytes，SHA256 `49a8c2d8791fc088138f49d91f5310c3fa794878499de649180f827690b30c2b`。构建发生在冻结前，builder 记录的 Voxel HEAD 为 1d8a2db；实际工作区实现即本提交代码，最终 manifest 逐文件记录。
- `source-manifest.json`：全部跟踪源码 SHA256 与 WASM hash。未安装到 Game、未发布。

验证覆盖 UTF-8 中文/希腊身份、顺序与无间隙字节偏移、UINT64_MAX-3、额外容量原样保留、容量不足三缓冲区原子失败、null/4-byte misalignment、section Y=16、invalid/destroyed handle、Pending/Unavailable 与空表区分、释放后重入。该证明仅为真实 Voxel/WASM 导出契约，不替代 Game 全链或同世界 blocks 渲染验收。
