# Host 有界 Drain 的实际值与异常边界

只读调查 Runtime `LumioGameRuntime-101-drain-codec-window` 与 Server `LumioServer-101-composition`；没有修改两树生产源。额外两个私有探针仅引用已冻结 receipt 80eed3c 的 Runtime DLL，不重建共享生产输出，不代表完整 Host/Native 验收。

## Query 的既有输出面

`EntityBindingQuery.QueryCore` 只有 `!World.IsServer` 才建立 replica visibility 并经 CopyObservation。DS 即使请求 callerScope=client-replica，也不因此自动走这个复制分支。server-authoritative 容器由 generated.ReadField 直接返回 SyncList/SyncDict 本体；CodeEmitter 的 ReadField 对容器不取 BoxedValue。标量 field.BoxedValue 和 ordinary generated.ReadField 是另外两条路径。

旧 `HostEntry.EncodeQueries → Json(payload)` 使用默认 System.Text.Json，无 camelCase、无 IncludeFields、无 NetEntityId converter。不能借用 WorldChange 的 F2/containerType/fullEntries 编码替换 Query JSON。实际私有探针位置：`C:/Work/LumioGames/LumioGameRuntime-101-terminal-receipt-window/.run/query-shape/`，build0warning/error、运行exit0，`shape.ndjson` 记录12种结果：

| 输入 | 旧 JSON 形状 / 结果 |
|---|---|
| NetEntityId(maxUInt64,2) | `{ "InstanceId":18446744073709551615,"Counter":2,"IsDefault":false }`，原数值不改字符串/hex |
| default NetEntityId | 上述两整数0、IsDefault=true |
| SyncList<int> | `{MaxCapacity,MaxElementUtf8Bytes,Scope,Authority,Notify,ClaimBy,Count,Values:[3,1]}`，属性按声明顺序、enum为整数 |
| SyncList<string> | 同上，MaxElementUtf8Bytes可能非null，字符串保留STJ默认转义 |
| SyncDict<int,string> | 无MaxElementUtf8Bytes，其Values为JSON对象；插入3后1产生`{"3":"first","1":"second"}`，不能改canonical排序 |
| SyncList<NetEntityId> | Values每项保留完整PascalCase对象 |
| SyncList<Vector3> / Vector3 | 旧默认STJ分别Values:[{}] / {}（public字段默认不包括） |
| SyncDict<NetEntityId,int> | 旧STJ原本NotSupportedException，不属于已有可成功输出 |
| char / float / decimal | 字符字符串、1E+20、1.2300；nullable装箱为空或底层值 |

LogicTransform 不是 Vector3 反例：其正式 IGeneratedComponent.ReadField 返回 SerializedLocalPosition / SerializedLocalRotation / SerializedParent / SerializedTeleport 字符串。

普通字段生成闭集见 PredictionSchemaValidation.IsScalarType / CodeEmitter.ValueType：string、bool、char、sbyte/byte/short/ushort/int/uint/long/ulong、float/double/decimal、NetEntityId 和 nullable。普通 Sync<T> 的允许面较窄。**容器不应从该普通标量列表自动推定闭集**：当前 SourceModel 容器扫描接受非嵌套泛型参数文本，CodeEmitter.ValueType 只以 SyncList/SyncDict 前缀认类型，没有递归元素类型检查。本次没有另造生成器编译测试证明任意自定义对象均为已批准合同；上表 Vector3 是实际 Runtime 泛型实例探针。规范 container-delta-v1 的 itemEncoding 声明 canonical scalar text，但 Query 旧STJ与容器传输是不同面，不能据此无声删除已有 Query 路径。

后续补证：同树 `.run/query-generic/source/` 声明 `CustomRow(int Count,string Label)`、`SyncList<CustomRow>` 与 `SyncDict<string,CustomRow>`；正式已构建 generator 对该真实源执行成功（`generate-01.log/.exit`，exit0），生成 ReadField 返回原容器，未拒绝 custom element。此为生成器实际接受证据，未扩称任意自定义 getter 的安全冻结已实现。

## maxValueBytes 实际可达反例

规范 `entity-binding-and-query-v1.json` limits.maxValueBytes 为65536，当前 QueryCore 成功出口没有对应大小验证。独立 `.run/query-limit/Program.cs` 调用已有测试工厂的真实 Native World，实际 Admit → Tick → Resolve，再向真实 `IdentityComponent.Name` 写65537个ASCII字符，随后调用真实 server-authoritative QueryAttribute。`query-01.log` 返回 `Outcome=ok, chars=65537, jsonBytes=65539`，exit0；独立helper `build-01.log` 0warning/error。未手造 BindingQueryResult，也未改生产源。

因此不能声称原 Query producer 已保证65536。Root/Gameplay 正评估 owning Query 成功前预付并冻结原 STJ JSON 字节，后续Host只测量/写入该冻结值；需要保留既有字段形状、顺序和失败顺序，不截断值、不缩小声明类型集。当前证据只定位缺口，未声称该方案已实现或预算闭合。

## 必要 owning 接面建议

新 Host scalar-only writer 会拒绝既有容器与 NetEntityId，不能发布。应由 Runtime 持有泛型容器的只读无拷贝遍历与精确 Query JSON 编码能力，Host 消费一个 measure/trywrite 接口，不在 Host 反射猜泛型或调用 Values/BoxedValue。SyncList.Values 明确 new List + ReadOnlyCollection；SyncDict.Values 也包装、预测路径可能复制，均不适于未预付的 Measure。

不得直接复用 IWireContainerWriter.WriteFull：它输出复制 F2 的形状和排序，Query 需保留 STJ 对象、数值和插入次序。只读遍历必须保留 EnsureReadable/owner-thread/预测读取语义；冻结 Query 的可变容器不能让 Measure 与 Take 跨变更读到不同值。选定可审闭集时需同时确认 generation 允许面与 owning 手写组件；未覆盖类型不得被包装成已完成的合法值支持。若采用预先冻结数据，预留必须早于 Values/枚举克隆、JSON缓存等实际分配，且旧owner保留至实际ACK；不是先构造再计费。

## Terminal receipt 真实反例

`WorldManager.TryDeferOperation` 只校验非空 transactionId 和 ingress 总字节预算，没有1024B上限；`CompleteDeferredOperation → FinishOperation` 只验证 Outcome.Code/enum。`OperationReceiptMessage.ValidateTerminal` 另要求 transactionId <=1024严格UTF8字节。因此“真实 Requested 终结一定能编码”为假。

私有探针 `.run/receipt-invalid/Program.cs` 走真实 TryEnqueue → CaptureIngress → ApplyCapturedInputs → TryDeferOperation → CompleteDeferredOperation → DrainOutbox，registry只提供实际映射回调，没有构造 WorldOperationResult：

- 1024B：Accepted、deferred=true、ReceiptRequested=true、Succeeded/Applied；FromTerminal 成功。
- 1025B：同样全链接受并产生 Requested Succeeded/Applied，FromTerminal 抛 ArgumentException：Receipt text exceeds its UTF8 bound。

`boundary.ndjson` / `boundary.exit`，2边界符合预期、exit0。初次私有helper编译遗漏引用/using日志保留，最终build03为0warning/error。这不是Native或Host整链测试，但已否定异常分支不可达。Host目前 catch 后输出receiptBase64:null是既有语义；Measure路径不能靠制造异常和日志声称0alloc。最小修复应是 owning receipt 无异常验证/try-measure，保留原抛异常API的顺序/类型/文本，也保留TryDefer现有接受范围；不要在Host复制验证器。
