# Query 有界值输出候选（待 Owner 裁定，未实施公共变更）

## 实际缺口

`LumioGameEngine-101-binding-context-budget/engine/wire/entity-binding-and-query-v1.json` 的 `limits.maxValueBytes`（约837行）已经是65536。当前 Runtime `EntityBindingQuery.QueryCore` 成功出口没有执行该上限。实际 Native 世界准入、Tick 后读取 `IdentityComponent.Name` 的65537个ASCII字符，返回 `ok`，原默认 System.Text.Json 的 value 编码65539字节。证据：`C:/Work/LumioGames/LumioGameRuntime-101-terminal-receipt-window/.run/query-limit/`。这不是手工构造查询结果。

同契约 `queryResult.success.value` / 查询成功结果（约551行）为 `declared-type`；失败与成功互斥（约579行）。`errorCodes`（约740行）没有大小或容量失败码。`invalid_binding_shape` 明确限坏请求、禁止引用、必要身份缺失，不能拿它表示合法已声明属性的值太大。此项需要新增公共结局码的裁定；不能仅补实现自行选择一个错误码。

## 最小公共候选

新增 outcome code `value_too_large`，仅用于完成原权限、实体状态和已声明属性检查之后，该**完整 value 按既有查询 JSON 表示**超过65536 UTF-8字节。包括字符串引号、转义、对象/容器内部标点；不含外层 requestId、outcome、revision、tick。65536允许，65537拒绝。不能截断、删除容器属性、换用 F2、改成字符串或通过省略 value 伪造成功。

具体规范变更点（只在 Engine 权威源，经 Owner 批准后实施）：

- `errorCodes.outcomeCodes` 增加 `value_too_large`，语义说明它是值结局，不是请求形错误。
- 查询 failure outcome 枚举/引用、查询结果生成声明及相关机械校验同步增加这一项；请求错误优先级与原 outcome 判定顺序保持。新大小判定排在原成功取值之后，不能越过 invisible/unauthorized/non_existent 等既有拒绝。
- `limits.maxValueBytes` 的说明钉明上述 JSON UTF-8计量口径；原65536数值不变。
- 正例增加完整 JSON 恰65536；反例增加65537、转义导致原字符串短于65536但 JSON 超限、容器整体超限。增加同时 invisible + oversize 仍 invisible、合法字段名 + oversize 不得 invalid_binding_shape。
- 旧可成功值的属性名、属性顺序、数值表示、默认转义、字典既有插入次序和 null 省略规则全部保持；普通 drain 与关闭 drain 输出同字节。所有其它 query lane 字节保持。

此候选只裁定**结构超限**。队列/进程预算不足不是 value_too_large，不得拿这个码吞掉内存所有权问题。预算不足应在产生成功值和消耗查询之前沿既有入队 Backpressured 保留/重试；下节说明还缺的接面。

## 冻结与预算：当前不能声称已有可用额度

现 `WorldManager.TryEnqueue` 只按 `WorldIngressSnapshot.Bytes` 预付请求字节；默认 `WorldIngressBudget` 是256条/1MiB，其注释限定保留序列化输入和每Tick工作。`WorldManager._queries` 是单独 List，`DrainOutbox` 复制结果后清空。**不存在已核实的查询值保留预算或从原入队到 Host ACK 的租约**。不能把刚腾出的输入额度、Rust2048控制窗口或534B Host固定元数据再花一次；不能将65536×所有待处理查询直接新增无界数组。

建议实现接面是一个由实际 Host 进程额度预留并交给 World 的查询结果窗口：入队时预付该请求允许的value上限、编码工作区、记录/数组头；查询执行时冻结到该窗口；queryResult / WorldDrainResponse 只转移该同一窗口所有权。普通 drain 的实际handoff或关闭Take的明确ACK后才能释放原冻结窗口；短缓冲、Unknown、编码失败、关闭仍保持旧租约。没有额度时原请求不消耗，沿现入队Backpressured。直接同步 QueryAttribute 的调用方也必须有明确局部窗口/使用期，不能通过 struct 返回值隐式永久占用进程额度。

此处尚未有可复用生产接口，需在实现前把 Host / Runtime 的准确保留与释放点写清。新接口若只是补既有容量拒绝的私有所有权实现，可在当前授权内实施；若要改变 public QueryAttribute 成功类型、调用规则或预算配置语义，必须另交精确签名候选，不能藏在错误码批准里。

## CustomRow 与默认序列化的真实边界

官方 generator 已接受 `SyncList<CustomRow>` 与 `SyncDict<string,CustomRow>`，generated.ReadField 返回原容器。证据：上述 Runtime 树 `.run/query-generic/source/generated`、`generate-01` exit0。既有普通 Sync 标量闭集不能用于缩小容器T。

原默认STJ对 SyncList 输出 MaxCapacity、MaxElementUtf8Bytes、Scope、Authority、Notify、ClaimBy、Count、Values；对 SyncDict 不含 MaxElementUtf8Bytes。`Values` 本身会复制托管集合；默认STJ还会读取 CustomRow 的公共 getter、运行 converter、建立序列化元数据。65536输出上限**不能界定 getter 分配/副作用或这些临时集合与元数据的峰值**。不可先调用 Values/STJ 然后才计费，也不可拿任意倍数65536声称已预付。

最小可审实现方向：在所属 Runtime 为既有 SyncList/SyncDict 提供借用原backing的只读遍历，完整保持旧属性形状；由已生成字段类型元数据选择实际的 value 编码器。普通标量、NetEntityId、nullable及已声明纯字段/自动属性结构可以给出精确或可证明的有界工作区。对于当前生成器接受但没有纯度/工作区证明的自定义 getter/converter，需要先核现有声明规范能否拒绝这类声明；如无依据，则不能自行缩面，必须保留明确未闭合项并提交最小声明约束候选。不能把这一问题与当前已经实证的普通字符串超限混为同一类。

## 验证清单

1. 保留实际Native65537当前RED，再验证65536/65537及转义/多字节边界；完整授权/失败顺序回归。
2. 原默认STJ逐字差分：全部标量（含char、nullable、实体号对象）、list/dict metadata、CustomRow、键顺序、合法null。旧不可序列化值继续原异常语义，不静默转null。
3. 真实入队→读取→冻结后修改源容器→原查询结果不变；普通drain与关闭drain一致。
4. 原请求入队容量、输出窗口不足、已冻结旧批持有、下一批、关闭、Unknown和重复ACK均不双花额度/丢原批。
5. 无分配Measure、Take只分配已付返回数组必须用完整合法类型矩阵证明，不能只测scalar。

当前其余 Host lanes 与真正Native ACK修复继续推进；本候选不表示公共变更已批准或Query完整闭合。
