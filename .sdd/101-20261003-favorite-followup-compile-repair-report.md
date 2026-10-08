# Favorite Fire follow-up 九处编译/API 修订候选

2026-10-03，作者 `/root/frozen_v14_suite_adapter`。**私有单文件候选，生产修改 0；C# 编译及 21 个实际用例、Native 均 UNRUN，由 Root 串行执行。**

根因证据是 `games/101-bomber/.run/v14-fullpack07-native-20261003/build54-v15-foundation-api-repairs.log` 的九条唯一诊断（日志最终汇总再次列出相同九条，不能计为 18 处）：五条 CS1503、CS0104、CA1305、CA1829、CA1859。当前文件确认为 `5bdf934c11cead12e3779c034f76b4b16d3e66e9cae9a48e105342e8d15ec4f9`，没有借旧二进制替代源码。

完整 before/draft/forward/inverse 与库存 proof 落父仓 `.run/favorite-followup-compile-repair-draft-01/`。唯一候选路径 `draft/Server/Tests/Gameplay/BomberFavoriteFireFollowupProductionTests.cs`，SHA256 **`3e67509385c6ea8232e5d0f15298745db0cd85eb64c137b13aff6ee55af1b57b`**。

修订限定于诊断对应 API 使用：

- 原第 338/408/422/426 行四处 SyncList `Assert.Empty` 改为同一原对象的 `Assert.Equal(0, ...Count)`；原第 374 行实际是严格 `Assert.Single`，改为 `Assert.Equal(1, ...Count)`，保留恰好一条的标准，未放宽为非空。
- 第 378 行通过既有其他真实 Voxel 测试所用的 alias 明确选择 `Lumio.GameRuntime.Coordination.VoxelCommitDisposition`。未换为 SDK 另一枚举或改 expected Original。
- 第 418 行同一 ulong 身份使用 `CultureInfo.InvariantCulture` 序列化，保留原字符串身份比较。
- 第 427 行 `BomberEffectIntegrationTests.Events` 的生产测试辅助返回类型已确认为 `JsonElement[]`，同一返回数组用 `.Length` 替代 `.Count()`；expected 3 不变。
- 私有 `BindAdapter` 返回类型从 `IDisposable` 收紧为其实际创建的 `AdapterBinding`；构造、binding 和 `Dispose` body 均不变。

原 **17 Fact、1 Theory 的 4 行，总计 21 用例**均在同一原类、名称和顺序保留。完整文件的 **229 个 Assert 调用保留为 229 个**；仅五处 cardinality 断言按上述等价 API 改写，所有其他原表达式逐字保留。全部真实 World/Tick/Native、ReceiptProbe、未知回执、配对恢复、原 Life/后继、whole-cast 110 及 finite/handle/source probes 都保留；无 skip、移除断言、规则更改或额外运行替身。

`prepare.mjs` 实际 raw0：原 source pin、全方法列表、Fact/Theory/InlineData 库存、229 Assert 库存、精确 token inverse 与生产源前后 hash 全部通过。`verify.mjs` 在专属新 `patch-check-01/` 实际应用 forward 和 inverse 各 raw0，forward 完整 bytes 等于候选 SHA，inverse 完整 bytes 还原 `5bdf...`，production source 0 drift。为保留当前源 LF，patch 验证明确使用 `core.autocrlf=false` 与 `core.eol=lf`；Root 可按 hash 直接复制完整候选字节。

这些结果只证明修改范围、可逆性与源库存；**不声称九个编译错误已由实际重建消失，也不声称任何玩法测试已通过**。Root 独审后应正式发布这一份源码，运行所选完整包的实际构建及原类全部 21 个用例，再读取实际 raw exit、成功/失败/跳过和当前程序集/source identity。
