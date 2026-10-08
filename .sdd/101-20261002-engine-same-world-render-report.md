# Engine 同世界 WASM 表现桥交回

候选冻结提交 `f53d6ad806e252f8d5bb210e1ddda9e34181c4a1`，基线 `58f65709e053dfa396ec0daab3760d9b2f5c500c`，独立树 `C:/Work/LumioGames/LumioGameEngine-101-wasm-render-world`。8 路径窄增量，工作树 clean；未发布、未写主 checkout。待 Root 独审及正式组合发布。本报告不表示完整 Game 对局已验收。

源 manifest：该树 `.run/101-same-world-render/source-manifest.json`，969 文件；SHA256 `3a34de71b901db17c6ee74a77bc4ef5a66f4160dcd61038a9bbb7a15e740b2a4`。依赖 Voxel `2ba61e431d8080ff6450a07e6ee447e3f0994e0b`、NativeCore `c93b5c62ebd6dab32a92f70efef3e5d07151f689`。

## 实现与边界

- 正式 KernelHandle 的五字段经现有 `world_call` admission/lifetime/fault 验证；8 个 meshOutput/lighting 适配入口用 provider 已有 `current_cut()` 和 catalog，调用 VoxelProject 的 Mesher/LightField。
- 派生缓存只保留 cut 身份、section revision、remesh 键、灯光和 Mesh 所有权。没有 section payload 副本、第二世界、额外复制输入或 Game 规则。
- JS `createEngineBridge(...).createVoxelPresentation(fullHandle)` 暴露同一 WASM memory，适配现有 renderer 的 ABI 形状；句柄原始字节严格校验。Mesh 归所属 world 的 mesher 持有，release 或 world/context 销毁回收，旧句柄不可再次使用。
- 地形展示明确选择 confirmed cut。真实预测 session 发布覆盖层后，预测读已变化，原生 confirmed read 和地形 mesh 均保持原值。角色预测仍由现有正式预测链路处理。
- Native ABI 输入及 hash 保持 `c5f276c855bcb71fd9b04dcd546d1dd925ac408fd6303d56e30a2c044946a2f3`。Native 构建不包含 WASM-only 表现资源；world_call 保留同一生命周期入口。

## 实际验证

证据均在该树 `.run/101-same-world-render/`。

| 验证 | 实际结果 |
|---|---|
| 原 full SDK 缺表现入口 | `missing-entry-red.log`：0/1，通过数为零，exit 1 |
| WASM 新表现 + 原 bridge | `wasm-green-04.log`：12/12，0 fail/skip，exit 0 |
| 实际 Chromium | `browser.json`、`browser.png`、`browser.log`：真实 section_delivery → 同世界 mesh/light → release → world/context retirement；console/network 均空，exit 0 |
| Native root API | `native-root-api.log`：95/95，0 fail/ignored/filtered，exit 0 |
| 当前 wire 验证 | `wire.log`：643/643，0 fail/skip，exit 0 |
| 生成一致 | `generated.log`：checked-in ABI 等于隔离生成器输出，exit 0 |
| 新 Rust 格式与 JS 语法 | `format.log` + 实际 node --check；均 exit 0；staged diff --check exit 0 |
| 严格规范检查 | `spec-lint-02.log`：12 通用 + 7 扩展，0 报告/跳过/禁用，exit 0 |

表现测试包括 u64 上边界 revision、实际增量、未 release Mesh 经 memory grow 保持、重复 release、release/reentry 缓存失效、相邻光传播/撤光、全部 world 字段伪造、两个 world 隔离、32 次 world 生命周期并保留未释放 Mesh、context_close 后访问拒绝、短 buffer 不写/不消费、对齐、非法字节身份。

实际同步 WASM context_close 返回完成（done=1）；没有制造 pending 状态并声称测过。源码继续依赖现有 owner admission/resource 的关闭边界，未加绕过。完整 Host 非同步 pending 和 Game 整局由后续组合验证覆盖。

官方 full SDK WASM 构建 `build-03.log` exit 0，13 条既有 cfg(test-support) 警告完整保留。产物 `web-02/lumio_engine_wasm_bg.wasm`，1770649 bytes，SHA256 `1c9334d8c6af002bcfde986fd4a9a63c2aeeee1d33ecc7ab2f07a818e5aec2d8`，配套官方 sidecar 同目录。构建后仅增加/修正测试与文档，生产源无变化；Root 发布应再按冻结源统一重建。

官方 Native `native-build.log` exit 0（60 条编译/链接告警保留，不声称零告警）：`.run/47687d9101fcab4be3f81fd4a6a55658/win-x64/run-WMFtUy/lumio_engine_native.dll`，SHA256 `1825d84dd310ece29101dbcc2c1fdb10e553f72a0850ca28e9d630a0e20ff25d`，完整官方 build-info 同目录。

## 失败处理记录

- `build-01.log`：首次错用 WorldY.raw，按现有 value API 修正后官方构建通过。
- `render-01.log`：测试 fixture 给 section_request 错误参数个数；修 fixture，未改生产调用语义。
- `render-extended-red.log`：新增真实 prediction 读测暴露测试输出槽误为 16 字节（ABI 实为 24）导致 heap 错误。修正新增 fixture，同时修旧 `bridge.test.mjs` 同样的分配错误；不是通过减少断言规避。
- `render-extended-red-02.log`：非法 handle 字节被截断而非拒绝，保存 RED 后修 JS 验证。错误复制 null buffer 也按 canonical InvalidArgument 处理。
- `wasm-green-03.log`：测试把不存在 mesh 的 canonical InvalidHandle 错写为通用错误，修正为精确 -2 后 12/12。
- `spec-lint.log`：新 Windows checkout 以文本物化 143 个 Git 120000 链接。逐项核对 Git target 后仅修本隔离树的文件系统物化，未改 Git 内容/规则；严格检查全部通过。

下一步：Root 独审并将此源加入官方候选 builder；Client 暴露自身正式 world handle，Game 单 ClientSession 接线及真实全链路验收继续，不安装此散装 WASM 到 Game。
