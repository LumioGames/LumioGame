# 本地验证报告 F3–F6 独审收据

日期：2026-10-08。Reviewer：`/root/runtime_review`。

被审文件：`repos/LumioGame/games/101-bomber/.spec/archive/reviews/2026-10-08-movement-code-review-local-validation.md`。

审阅 SHA256：`0d40f9c69d72ce088961ad93ed4f98a4a02d84043c87361d48151cf83d401ace`。

**PASS：限定于 F3–F6 的计算、触发条件、证据分级。未发现必修事实或计算错误。** 本次没有运行任何新测试/实验，也没有修改被审文件。

- F3：h=.05、v=2、τ=.10 的 .300/.286/.250/.200 与生产三角公式一致；已保留有效速度、零残差、目标不变的前提和待网页采样限制。
- F4：在声明的相邻、等长同向、及时完成、age=0、δ∈[0,2h] 条件下，`v·|δ−h|` 是向前断点，不能误写成向后。部分正向逻辑位移 `.20→.24` 与旧 Model `.30→.24` 的 `.06` 回跳也成立。验证配方显式要求 Accept 后 Update 再读，没有读同步中间态。
- F5：已正确限定保留原 ordinal 的未发布等待/重试记录，并要求旧尾、无位移 normal 和最终公开读取未被新结果覆盖。已排除将 `.175` 新输入人为留在 ordinal2 作为普通 Client 复现，也未把每次 0/2 批次都归因于此。HasNormalInput 可包含正常返回的 GAS 业务拒绝，源码链成立。
- F6：先 .05、再 .10 入队，在真实执行边界把注入时钟推进 .157，之后不再 Pump，公开 .157/.160 的 .086/.080 advance 以及 .006 回退与源码一致。配方要求输入成功、无权威/等待/fault，区分首次完成已迟与完成后别处耗时，并明确未执行，不是57ms WASM实测。

现有 Native SameSlotLateReplacement 测试中 moving=true 的第二次同 Tick clock-move 可被冷却拒绝，root 文稿已正确纠正“它必定又前进 .1”的旧 reviewer 误述。对应完整勘误与生产可达性限制保存在 `review-work/runtime/local-verification-addendum.md` 的 B4。

通过不代表这些候选都在用户现场出现，更不代表移动手感、构建/发布或 Owner 门通过。
