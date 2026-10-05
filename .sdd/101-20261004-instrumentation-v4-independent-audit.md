# Private profiler v4 独立启动前核验

结论：**ACCEPT_PRIVATE_INSTRUMENTATION_IDENTITY / NARROW_PRESTART_ACCEPT**，限定下列精确私有 v4 字节。允许 Root 用新 `measured08d-wwwroot` 启动真实浏览器取证；此裁决不代表浏览器体验通过，也不发布仪器为正式产品实现。本独审只读生产及作者私有候选，只写自己的报告和证据，没有重跑完整包、构建或测试。

证据目录：[instrumentation-v4-independent-audit-01](C:/Work/LumioGames/LumioGame/.run/instrumentation-v4-independent-audit-01/)。最终 [verification-final.json](C:/Work/LumioGames/LumioGame/.run/instrumentation-v4-independent-audit-01/verification-final.json) SHA256 为 `ef9abc0910902d34a096d9eba407454cd4c6b8635300ab20518bdb16eae7f895`，报告、冻结输入与全副本清单由同目录 `manifest.json` 封存。

## 精确接受范围

根目录 `C:/Work/LumioGames/LumioGame/games/101-bomber/.run/browser-experience-repair-01` 下：

| 私有输入 | SHA256 |
|---|---|
| `instrument-current-publish-v4.mjs` | `76ea337dd8c4c757621027a6b4d7f68044a356bb55b103f9c231e4455dd4f466` |
| `measured08d-wwwroot/main.js` | `3d16f749d8cebc5c20351b659f0e1b098ab49442941a484e480f3df230d07a25` |
| `measured08d-wwwroot.identity.json` | `3d3cd7fb622bd29605d2432e25c0015591a1dcef417967430a97122a4114b292` |

当前正式 source/main 与正式发布 main 均仍为已审 `25765c149ee6f2f51e12ce2a26f0884506a691688b8e217a63e938067f170f3c`，SpectatorDump source 仍为已审 `599609920469e0ba2eec906ba7425c678d6b128556cb6a548f2fefaf18ae25c9`。其余 complete08 完整身份证据已有 [08 独审](C:/Work/LumioGames/LumioGame/.sdd/101-20261004-candidate08-identity-audit.md)，本次没有重复完整包验证。

与前审冻结的正式 publish `wwwroot` 全路径清单比较，v4 有 **835 个文件**，无新增、无缺失，**834 个非 main 文件 SHA 和大小相同**。正式 WASM、managed/WebCIL、Engine 模块和资源目录命名完整保留；唯一变化是 private `main.js`。实际输出 main 可以用 frozen v4 的完整 `String.raw` 诊断前缀加正式 main 三个 seam 精确重建：绑定导出后附计时包装、状态变化附记录、加载 Engine callable 后附 native 计时包装。没有新增 Tick、输入、world 创建或其他玩法调用来取样。

v3→v4 全文件精确变换仅含 `compact-v3`→`compact-v4` schema 名及修复 native 包装返回：新局部 `measuredInvoke` 最终 `return Object.assign(measuredInvoke, invoke)`。因此附于官方 callable 的可枚举自身属性 `createVoxelPresentation` 随函数一起保留，入口没有被新的裸函数替代丢失。

## 实际针对性证据与行为检查

作者冻结的 `instrument-v4-verification.json` 九个 artifact 的当前长度及 SHA 全部匹配。`check-engine-profiler-seam.mjs` SHA `bb62ad6a68eb63d57224fc884424acc958ce1fb4d42133dd4bda9b8bacd0f9c8` 从**实际 emitted main** 中抽出真正 `attachEngineProfiler` 函数，在独立 VM 中用惰性 sentinel 运行：

- 实际 v3 RED 退出 **1**，准确失败断言为 `Wrapped invoke must keep attached createVoxelPresentation`，实际为 `undefined`。
- 实际 v4 GREEN 退出 **0**。原属性函数引用保留并实际调用一次，handle 原对象传递，附加 capability 也保留。
- 正常和抛异常两次 native 调用分别只委托一次，packet、返回对象及抛出异常对象身份均保留；两 operation 记录数各 1，Tick 边界计数为 2。

这是包装 seam 检查，没有创建或执行 Engine/World、浏览器、输入、玩法。语法检查 raw0 不是该实际 seam 检查的替代；该 seam 检查也不是实际浏览器启动通过。

静态阅读发现原 managed export 用 `invoke.apply(this,args)` 调用一次，导出正常返回值保持；原错误记录后仍抛出同一错误。额外诊断 projection 在原 export 结束计时后进行，projection 的 JSON/筛选错误只记录到诊断数据，不替换原导出结果。Native 仅一次 `invoke(operation,packet)`，observer bookkeeping 位于其 `finally`。Socket send 与 fetch 委托原函数，不重写 wire 或引入输入。

## 计时口径必须保留

这些字段能帮助定位，但**没有扣除全部测量开销**：

| 字段/观测 | 实际边界与限制 |
|---|---|
| `calls[name]` | 原 export 委托至返回/异常的 elapsed，额外诊断 JSON projection 在此 elapsed 后，单独记到 `observer.exportProjection`。 |
| `native[operation].durations` / Tick native ms | operation 委托完成后即停止计时，之后才更新诊断记录；因此自身 bookkeeping 不在该 operation ms 内。 |
| managed `tick` / `tickNative.duration` | 包含该 Tick 中嵌套 native wrapper 的 bookkeeping。不能称为完全无仪器的 Tick CPU 或把它和 native subtotal 的差全归给 Gameplay。 |
| `serialization.stringifyMs` | 仅主 `JSON.stringify(browserProbe)` 各轮及 fallback stringify 累计；不含 TextEncoder、裁剪、metric suffix stringify、DOM 写入。它不是整个取样回调成本。 |
| Tick gaps / frame gaps / long tasks | 仪器所在页面实测，仍含仪器、Runtime、浏览器调度和后台标签影响。 |

标量性能尾部 600、实体状态/pose/presentation 尾部 80；诊断 DOM 有 1 MiB 明确字节检查和裁剪记录。这里审核了约束与代码口径，没有在真实浏览器量测或证明实际 observer 总成本、所有极端数据下的成本上界。正式未测量页面的独立对照仍是最终生产性能归因的必要证据。

identity 文件的简短 `observer overhead is measured` 必须按上述**部分测量**边界解读，不能引用为所有 observer 代价均记录或全排除。作者交回也明确承认这些边界；本审接受的是工具的狭窄身份和 delegate/property 修复，无零观测开销声明。

## 保留的失败与审查校正

v3 的旧 `measured08c` 和 live07 不接受为有效体验结果。实际 root 的 `first-A-console.json` 再次报告 `formal_voxel_world_unavailable`，probe socket 数为 0；源码裸 native wrapper 再次丢失上述附属性。作者 `instrument-v3-failure-frozen.json` 以 `REGRESSION_CONFIRMED_BY_REAL_BROWSER` 保留失败并纠正此前仅凭语法声称 ready 的口径。该测量候选错误不能归为 complete08 的正式回归。

本独审首次自动重建脚本也漏掉 `String.raw` 结束 backtick 之前属于字面量的单个换行，产生自己的唯一重建拒绝。原 `verification.json` 保留；`verify-final.mjs` 按完整字面量读回、精确重建成功，最终文件记录了这个审查工具校正。没有改写候选源或以换 hash 替代核验。

Root 必须在新的真实浏览器中独立确认进入阶段、体素入口、socket、active 及双玩家行为。v4 的启动前接受不能替代该观察，也不能用本报告关闭移动、帧率、同步或十次关闭重进的体验门。
