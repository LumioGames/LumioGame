# 六箱真实 Native RED 后继更正

本报告追加于原 [容量与私有草稿报告](101-20261003-capacity-native-six-report.md)，原文及私有 manifest/hash 保留，不反写历史证据。子代理未执行 build、GEN 或 Native；以下执行结果由唯一重型执行者 Root 提供。

## 实际结果优先于先前静态预期

Root 的 `public-pierce-six-native-cap5-red-57` 实际结果为 **0 pass / 1 fail / 0 skip，raw=2，6.145s**。公共 Power拾取、Pierce拾取、PlaceBomb 与真实 Native生产前置均已进入测试业务链，失败栈是 `BomberTerrainTransactions.Begin:180 → BomberBombState.TryObserveChest:96 → SyncList.Add` 的五槽越界。它是实际 Native结果消费进入接触入账时的失败，不是直接调用 capacity helper、手填第六槽或模型模拟的 RED。

我此前发给 Root 的“当前 physical InspectChest 会按 ContactedChests.MaxCapacity5 在第六 Native提交前直接拒绝”推断错误。此次重新读取 physical `BomberBombState.Server.cs:101` 确认它实际按 `ObjectBudgets.ChestLimit` 检查；Root报告该资源发行公式值当前为245，区别于 ContactedChests实际声明5。因此第六请求仍可通过旧 InspectChest、获得 Native结果，随后 TryObserveChest调用真实 SyncList.Add 才暴露声明溢出。不得用旧静态预期解释或覆盖真实执行结果。

六个 Original 的总数及所有最终6断言没有在故障前持久打印；异常先于测试末尾强断言。故本报告只登记上述实际失败路径与 Native消费事实，不声称最终 `originals.Count=6`、所有六箱解绑/统计6/来源不变等断言已通过。

## 编译修订与执行身份

Root 首次 `build47` 得到两个 uint/int receipt-length Equality 编译错误，原件保留；这是编译失败，不是上述业务RED。Root仅将长度显式 `checked((uint)...)` 作机械修订，没有删/降低业务断言。Root的 `build48` 为 **0 warnings / 0 errors、raw=0、386 sources[]**；这次成功构建才供上面的Native RED运行。

Root实际发布主测试源码 SHA256 为 `f4edd19ab4c6b4d3250314f0fa31153b3fb382d40fd168679b6efed5aa076e73`，本子代理已只读复核该源码hash。Root报告 Tests assembly SHA256 为 `6c68fa9981f95efd89a0ea8119b36837a8105932ffc29954094ac6177f134a5d`，Game assembly提供前缀 `50802758`；这里不补写未提供的完整Game hash。执行日志与重型产物仍以Root持有的原件为准，本子代理未读取不存在于自身 `.run` 列表的假想log路径。

私有主稿079122...及 main manifest bf1722... 保留其未运行地位；Root发布机械版本与私有稿hash不同，不能把两者混称同一源码。本次后继更正不覆盖原55项作者fence、不改生产及生成物。

## 后续闭合

TRV03已把单弹接触 admission 改为实际声明MaxCapacity，并在接受 Native mutation 前作整体容量/来源预检，故相同五槽下失败位置可能改变。Root准备以52作为19/23/27、B≥0、TRV03四臂单颗弹条件下的保守容量，不把它称为M2 tight或UGC上限，不改现有Map/Power/M2批准门；正式DECL独审、GEN及后续真实同一六箱测试GREEN均由Root完成。本报告不提前登记52已实施或GREEN。

补充历史两Fact仍为私有 **UNRUN**，需容量≥7与其完整真实配置准入前提；它们不代替本次最小六箱真实RED。原Resource10 liveECS capacity fixture9/1仍未被本子代理修改。
