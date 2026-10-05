# Admission container F2 窄增量独审

限定范围 SPEC / QUALITY PASS，未发现源码阻断。只读审查 `C:/Work/LumioGames/LumioGameRuntime-101-admission-container`，基底 a07f6e5，生产仅 `WireCodec.AdmissionSizing.cs`，测试 `AdmissionContainerEncodingTests.cs`。未实现此修改，也未构建共享输出。

旧 FreezeAdmissionValue 将 ISyncContainer 捕获为 List/Dictionary 后走 legacy enumerable ValueText，丢失普通 full container 的 F2 envelope。修复在此专门分支复用 owning IWireContainerWriter.WriteFull，count 与 write 都使用同一格式；返回冻结字符串，之后 ValueText 保持它原样。旧 IEnumerable / IDictionary 分支没有修改。

读取先调用 sync.Owner?.EnsureReadable，保留 detached/prediction 可读边界。两个实际准入调用链 CaptureAdmissionEntities / AdmissionCreationPreparation 已限制 server authority，creation 另拒预测 clone；既有预测读取函数没有被新旁路改写。只声明此权威准入上下文内的预分配保证，不把它扩称任意预测世界的通用无分配读取API。

合法权威容器先用 stack/count writer 测量，随后 reserve(128 + 3 * UTF8 bytes)，再分配 UTF8数组与最终 UTF16字符串。UTF16所需字节不超过UTF8字节的两倍，128覆盖这两对象的固定开销/对齐；没有先Values/BoxedValue克隆。Strict=true 拒绝孤立surrogate，避免把替换文本冻结为另一值。第二遍长度差异显式拒绝；合法owner独占期间不允许其他线程变更。

实际独跑：`.run/admission-container/review-container-01.log/.json`，7/7成功、0失败/跳过、exit0。沿作者已完成的测试DLL直接运行，无build；runner记录生产/测试SHA与环境。覆盖空/有值 list/dict 对普通EncodeFull字节等值、真实DecodeRemote full成功、随后原容器变更不影响冻结值、拒绝预算前不分配大输出、合法实际分配不超过预扣以及坏UTF16拒绝。

边界：上述7项是 owning编码/容量用例，不是实际新玩家准入整链。作者4个真实解码RED与全Runtime由作者记录；本报告不冒称重新执行完整Host/Native链，也不将此F2格式用于Host Query的STJ旧格式。
