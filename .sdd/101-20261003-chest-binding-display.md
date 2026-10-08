# 宝箱正式绑定投影修复

表现基准仍为原型 `af385a9cd0f261317e97240a7e55accdda8d01d5`；已废止的旧美术方向文档不作为新标准。本次没有新增玩法状态或修改公共 API。

## 根因与修复

`BomberChestEntity` 是 BlockEntity，没有 LogicTransform。原 `PresentationDump` 只从 LogicTransform 字典找位置，导致所有复制宝箱落入 unpositioned 列表，表现只能依赖体素格子显示模型而隐藏剩余击打次数。

正式投影现逐地图 Section 调用 Runtime 已有 `TryReadSectionBindings`，只关联当前复制中的宝箱完整身份，从绑定 cell 派生当次位置，再投影复制的 requiredHits/remainingHits。没有缓存绑定、按顺序猜身份、添加位置组件或逐格调用。未到达或释放的 Section 保持不可定位；同一身份重复出现会拒绝，不静默选位置。

同时修正 Client 已存在的 WASM 绑定读取实现，对元数据、分区、长度、条数、完整身份、顺序和尾字节做有界校验。该上游修复已独审，冻结 `LumioClient-101-composition` / `39b950fe7ad2229c34a6475a3ad5ec4a6da30ada`；将随完整发行回接。当前 Game Native 测试使用官方 SDK189，不能当成这个新 Client 的实际浏览器证据。

## 实际验证

- Game `.run/chest-binding-display/red-02.log/.exit`：真实 Native 接受 Section 后，复制投影仍无宝箱，**1 例失败**。更早 red-01 是测试载荷格式错误，透明保留，不当作行为 RED。
- `build-green-02.log/.exit`：零警告错误，exit 0。
- `full-green-02.log/.exit`：**39/39**，0 failed/skipped/not run/errors，exit 0；含两个真实 Native 用例覆盖首 Section 和跨 Section 格子，在绑定前、到达后、释放后三个阶段验证显示与完整身份，无 LogicTransform。
- `presentation-tests-01.log/.exit`：**652/652**、52 文件，0 fail/skip，exit 0。
- Client `.run/101-wasm-binding-read/red-01`：7 例中 5 条畸形回复原实现错误放行，2 条已有正常行为通过。`full-01`：**76/76** 零失败跳过；独立审查及 9 条窄复验证据为同目录 `client-independent-01` 与 Game `.run/wasm-binding-client-review-01.json`。

待最终完整发行接入后执行浏览器真实绑定显示和原型同状态视觉验收；上述 Native/transport 测试不替代该项。

## 动态生命与资源箱投影增量

继续核对发现复制中已有 `MaximumHealth`、`GoldenHeartCount` 和宝箱 `ResourceTier`，但投影未传给表现。前两者使成长后的心条、金心和 Boss 表现不准确；后者使木／铁／金资源箱进入仅供强力宝箱的六槽模型池。

投影现直接输出三个复制字段及真实 Chest 配表行。适配器读取动态上限和金心数；资源箱依据配表进入原有三级资源箱模型，只有 tier=0 才进入强力宝箱模型。地形适配只将 Native 已 Ready、确为箱子的格子分入资源箱显示，未改变规则地形。分类变化参与显示版本，旧帧保持不变；未知资源 tier 明确拒绝。

- `growth-projection-red-01`：1/1 失败（缺少生命字段），修复后 `growth-projection-green-01` 1/1。
- `growth-adapter-red-01`：17 项中 16 通过、1 失败；`growth-adapter-green-01` 17/17。含死亡与新生命替换，防止沿用旧生命数据。
- `tier-projection-red-01`：2/2 失败（缺少资源 tier）；`tier-build-green-01` 零警告错误、`tier-full-green-01` 完整 39/39，零失败跳过，exit 0，消费官方 SDK189。
- `tier-adapter-red-01`：18 项中 17 通过、1 失败；修复后的 adapter/config 窄回归 22/22，覆盖三种箱、原强箱、未知 tier、绑定消失、缓存与旧帧。
- `tier-presentation-full-01`：52 文件 654/654，零失败跳过，exit 0；`tier-typecheck-01` 与 `tier-presentation-build-01` exit 0。
- 页面完整测试最初两次因缺失候选根及误传候选父目录失败，保留 `tier-ui-js-01/02`，不当作行为 RED。正确使用官方74546候选 `browser-candidate/selection` 后，`tier-ui-js-03` **64/64**、零失败跳过、exit 0，含实际 WASM。

以上证据均在 Game `.run/chest-binding-display/`。十个源文件冻结为 `growth-tier-freeze-01.json`，SHA256 `7252182f68dc680c5b100142c15b3162973fa7d282a19e3e8cf6f1936fcf94e9`，已交独审及统一74546三端回归。未将该增量计为真实浏览器整局验收。
