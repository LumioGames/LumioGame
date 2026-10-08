# Client 同世界只读接面独立审查

Root 对 `LumioClient-101-composition` 的 `70201c909d096eccf23c9009567d75ef49940232`（base `ecd88285`）8 路径增量结论为限定 PASS。

独立阅读新增 ReadBox、full KernelHandle 输出、数组解码、只读 replica-grid、抽出的 surface 投影及测试。ReadBox 在分配前检查 canonical 262144 cell 上限，调用现有正式 world 的 Native box read，拒绝不完整结果和越界 segment；revision 保留 ulong。JS 只接受该世界的读取观察，不拥有 Section 写入、第二世界或复制消息入口。full handle 是脱离托管内部存储的复制，实际资源权限仍由 Engine 验证。

Root 实际独立执行 `replica-voxel-grid.test.mjs`：5 pass、0 fail、0 skip、exit 0；日志在 Client `.run/composition-20261002/root-read-box-independent-js.log`。作者另有实际浏览器和完整 1235 测试证据，本次不重复计入独立执行数。

此结论仅覆盖该接面。官方统一组合构建、Game 单 Session 接线、真实 DS 对局和最终表现验收仍需继续完成。
