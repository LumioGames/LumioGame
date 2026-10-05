# 宝箱绑定位置投影独立窄审

2026-10-03，限定 PASS。只读核查 PresentationDump.cs、PresentationDumpTests.cs、README.md；没有修改生产源。

宝箱是没有 LogicTransform 的 BlockEntity，旧投影因此始终丢失位置。修复沿原 replica Manager 的 VoxelGameplayBinding 批读地图内 Section 的已提交绑定，以完整 NetEntityId 与复制中的 BomberChestState 关联；cell 索引 x/z/y 解码符合既有 Native 编码，越界和非障碍层不投影。每次 Dump 读取当前状态，不增加位置组件、不保留旧绑定缓存、不从顺序猜身份。Section 未就绪/释放后会回到 unpositioned；同身份重复绑定失败，不静默选位置。requiredHits/remainingHits 直接来自复制组件。

独立执行官方 SDK189 对应原测试 DLL 与同包 Native 的两条首/跨 Section 用例：2/2，0 errors/failed/skipped/not run，exit 0。日志 `games/101-bomber/.run/chest-binding-display/client-independent-01.log/.exit`。3源码、测试 DLL、Native 的精确 SHA 为同目录 `client-independent-01.json`。

实际覆盖无 LogicTransform、绑定前不可定位、Native Section 到达后正确位置/击打次数、释放后失效。此为真实 Native 客户端投影，未执行新 Client39b WASM 的真实浏览器宝箱画面；最终统一包后仍须对照原型同状态验证。
