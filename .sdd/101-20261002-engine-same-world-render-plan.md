# 同一 Engine WASM 世界的表现桥执行计划

基线 Engine `58f65709e053dfa396ec0daab3760d9b2f5c500c`，新隔离树 `LumioGameEngine-101-wasm-render-world`。依赖 Voxel `2ba61e4`、NativeCore `c93b5c6`。本任务在 Engine SDK WASM 适配层补齐既有 `voxel-world-v1.json#meshOutput.wasmInterop` 的表现访问；不改 `native-abi.json`、Native ABI hash、玩法或第二份世界状态。

当前缺口：full SDK 模块的正式世界由五字段 KernelHandle 标识，旧 blocks 渲染器消费 voxel-only 模块的 u32 world。两个模块世界不能互换，复制 delivery 创建另一世界违反单一状态来源。

| 已批准语义 | SDK WASM 对应落点 | 验证 |
|---|---|---|
| meshOutput.faceTextureTable；mesher create/destroy | 既有 KernelHandle 定位 provider，在其资源内创建 VoxelProject 原生 Mesher，复制纹理层表；销毁 world/context 自动销毁派生资源 | 错误纹理表、外来 world、destroy、重复销毁 |
| mesh_section/release；64 字节 header、三渲染段、sectionRevision/meshSequence | 直接以 provider.world.current_cut()、相同 catalog 和 VoxelProject LightField 调用原生 Mesher；真实模块内存指针在 release 前有效 | 基线、delta、release/reentry、精确 revision、过期与重复释放 |
| remesh book；自身/26 邻居/灯光影响 Section | 从同一已提交 cut 的版本和驻留变化刷新派生 lighting/remesh，不复制 Section 存储、不保存 payload | 同世界传输后立即 count/drain、失败容量不消费、释放删网格 |
| lighting read/digest | VoxelProject 既有 lighting，读取实际 committed cut；缺 section 不当空气 | 发光方块、相邻传播、释放失效、无数据返回 unavailable |
| wasm caller buffers / staging alignment / memory growth | private SDK WASM 入口带完整 KernelHandle；JS provider facade 仅适配调用签名，并暴露同一真实 memory；不维护模拟网格或世界 | 8 字节、空指针、短容量、失败不写、memory grow 后重取 view |
| context ownership | 派生 Mesher/LightField 归 NativeVoxelProvider 生命周期；每个 world 独立，私有 entry 不绕过 world_call 的 admission/fault/lifetime 检查 | 两世界隔离、关闭 context、失效句柄、重复重建 |

实施次序：先保存真实旧 full SDK 模块缺失表现入口的 RED；补 owning Rust bridge 与 JS 签名适配，复用现有 VoxelProject 算法；用官方 builder 构建同源模块。实际 WASM 先从正式 context/world/create/section_delivery 进入，再从表现桥读取和网格化；同时跑 existing SDK bridge/generator/native/wire 回归，确认 Native ABI hash 不变。随后 Client/Game 接线只传该正式世界的完整 handle，保持 blocks 场景、素材与 HUD。

如果某项无法用上述既有语义表达，记录确切缺口交 Root，不用临时兼容入口或复制世界规避。此计划不是发布或完整对局通过证明。
