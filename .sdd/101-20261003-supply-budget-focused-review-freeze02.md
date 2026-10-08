# Supply freeze02 与 Budget 专项复核

2026-10-03。本轮先按 Root 的精确授权增强本人所写 Supply 测试的一条断言并封存，随后以非 Budget 作者身份只读复核指定生产候选。没有执行 build、test、Native、GEN、format 或 index 操作；封存后没有继续修改任何源码。

## Supply17 source fence

`games/101-bomber/Server/Tests/Gameplay/BomberCentralSupplyBoundaryTests.cs:375` 保留 `Assert.Throws<InvalidOperationException>`，仅接收异常并在下一行增加 `Assert.Contains("byte budget", error.Message, StringComparison.Ordinal)`。因此 `é×4097` 的 8194 UTF8 bytes 必须命中预算拒绝，不能被普通 JSON 解析失败替代。其他断言、生产和旧 freeze01 均未改。

- 当前与 freeze02 副本 source SHA256：`aef1278753d2b5a42988285f25dc189cfc343a8e535360db81132675e92ef29f`。
- 新 freeze：`games/101-bomber/.run/central-supply-task2-test-source-02/source-freeze.json`，SHA256 `67d0465719c24d8afa8cd174aec9f7a95bb93e2d30c44cdd31d31892c6a37014`。
- 精确一处 delta：同目录 `source-diff.patch`，SHA256 `e70ff7e03a80e0c0cbd9b6e9fbd22e4dd59c6915c9720738a1e643aa76347f90`。
- 旧 freeze01 manifest SHA256 `b696c4fd090c94f8c6ff3fac87bb32b7d1d9980922abbd5c24e9f60d85f2ac8c`，旧 source SHA256 `4104f5bb8249a136d3be42c57b8d57d751745eef73e3d891682aa702a3ece139`，在新 manifest 中保留。
- 静态数量仍为 4 Facts + 4 Theories / 13 InlineData = 17 cases；过滤类 `Lumio.Bomber.Gameplay.Tests.BomberCentralSupplyBoundaryTests`。

本轮没有运行这 17 项，不能称 GREEN。之前原 Supply2 的实际 2/2 也不能替代这 17 项的新二进制结果。本段是作者交接，不能作为本人对这 17 项的独立质量审查。

## Budget 独立专项 verdict

**Spec PASS；本轮限定源码 Quality PASS；无新增 actionable finding。运行验收 pending。** 当前 `games/101-bomber/Gameplay/Config/BomberObjectBudgets.cs` SHA256 重新核为 `2b2285078879efd035bfe4fd70840fadf60cb1034c860ded9fd76b4701cad94a`，与 Root 指定候选和已存在的独立报告一致。本轮复用 `.sdd/101-20261003-supply-frenzy-budget-independent-review.md`（当前 SHA256 `afa52c542f892a6c6b20fcf041eb306ca73276f1e647e81d0a6c94b6b85a202e`）的完整 delta/边界审查，仅独立重新核对以下调用链与重点，没有覆盖或重写该报告。

1. `BomberObjectBudgets.cs:132–171` 的五种 source 计数对应 `BomberCentralSupply.Server.cs:65–79` 的真实 Count/KindAt。默认 5 strengthening + 2 health + 1 frenzy + 1 golden = **skills-off 9**；skills-on 才加入 2 special，成为 11。预算没有用 skills-on 11 替代 skills-off 9；FrenzyEnabled 独立于 SkillsEnabled。发行关闭时新增预算为零，但不能据此丢弃运行中的旧 owner 债务。
2. `BomberFrenzy.Server.cs:25–39` 使用实际 Applied fact Tick 定义 `until=a+T`；`BomberFrenzy.cs:9–12` 的活动条件是 `until > world.Tick`；`BomberFrenzy.Server.cs:47–51` 保留至少 I ticks 的间隔和实际并发限制。默认 20Hz / 6000ms 得 T=120，I=5，每颗来源整个活动期最多 `ceil(120/5)=24` 次 accepted placement。`Concurrent`（同文件 :217–225）只计算该 owner 的实际 live primary Frenzy Fuse 和尚无 publication 的 promises，所以 **ConcurrentLimit=6 是当前准入限制，不是 lifetime24 的替代值**。Danger 可以释放 Fuse 并发而继续占实体；未知 retirement 也没有定时释放保证。预算按每个真实 candy 来源保留最多 24 份 live/promise credit 的上界合理，不再额外乘 6 或参与者数。
3. `BomberObjectBudgets.cs:110–117` 将新增源信用加入原最低值，再执行 RequireCapacity 后 checked int 转换。:126–130 的 quotient/remainder ceiling 避免 `value+divisor-1` 溢出；:169–171 checked source multiplication 保留旧统一 overflow 拒绝。公共 `BomberBombAdmissions.Server.cs:36–38` 的 actual occupancy + newCredits hard cap 仍是运行准入；预算计算没有取代它。这里只验证 conservative source 上界，没有声称实际 Native 已完成 24 次或达到 6 并发。
4. **旧准入 guard 未解除**：`BomberObjectBudgets.cs:40–56` 仍限定 LegacyPillars/19×19/8 participants；:174 起的 producer guard 仍要求 Fire/Split dormant，并限定 enabled bomb kinds。`BomberCentralSupply.Server.cs:84–90` 的 special content 仍要求对应 BombKind enabled，:211 的选择池仍来自完整 SpecialNames。故本预算通过不意味着六种 special pool 的全部选中分支可通过，也不证明 full skills-on 11 与实际交换交付。正式 server/default 与 skills-off 表中 `central_supply_enabled` 仍为 false；预算本身没有启用 producer。以上均是本轮保留的验收边界，不是该增量引入的新缺陷。

本轮只读代码与轻量 hash，沿用原独立报告的原 RED 证据，没有生成新的运行证据。Root 的 fresh build14、Budget22、新 Supply17 和相关回归尚需用各自实际 child exit / pass / fail / skip 记录判定；不能将任何一组源码 PASS 扩大为全 Client、16 人业务、整局或完整 Native producer 验收。Goal101 未完成。
