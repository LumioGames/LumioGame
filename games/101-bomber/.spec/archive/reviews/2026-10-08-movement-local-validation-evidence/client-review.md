# Root 本地验证报告独审收据

结论：**PASS；未发现本次指定范围内必须修正的问题。**

审查对象：`repos/LumioGame/games/101-bomber/.spec/archive/reviews/2026-10-08-movement-code-review-local-validation.md`。

审查时文件 SHA256：`280c3da47f9796640aebbd6d5548481ce072197ec9cca600d324453f8588a3ac`。

范围为 F2、F5、F6 与相关本地配方的证据/结论对应关系。没有运行新测试、构建、浏览器或 Native 调试，没有修改报告或生产代码。

- F2 说明的真实 cooldown 来源、typed layer 可见性、临时 Project(0) 不删除 survivor、当前 input Remove 不删除前序 layer 均与固定 Runtime 源码一致。普通分支条件已写清，不把共享 ordinal 单独当作拒绝证明。
- 时间表保持相同初始预热、相同四条入队输入、相同四次后续 pump、相同结束时刻；仅改变两次 pump 相位。以当前 fixture 明确 20Hz 和时钟初始锚点成立为前提，输入批次分别为 1/1/1/1 与 0/2/0/2。`.4m/.2m` 已明确为无障碍、无新增 authority 下的未执行源码推导，没有冒充公平机器负载或浏览器实测。
- Client 测试能力、测试专用 MovementLastTick guard 与真实 Game TypeId1 已区分；要求完整 RejectedStep 和 CanActivate/Execute 边界能隔离 guard。真实 Game 同批 SendMove 的配方没有声称已具备精确注入时钟接口，也提醒两次发送间不能使用自动 Pump 等待工具。
- F5 的组件反例使用更新后的 Model，正确地区分“已显示尾部后来被清掉”与“首次过期结果获得新尾”。正常 Client 会推进 ordinal 的限制已写清；等待/重试仅是待证明的可达入口，没有声称所有 0/2 输入都会触发。
- 已独立读回 `GasJointOwnerExpiryContinuityTests.cs:133–153` 与 `GasJointPredictionClockTests.cs` 的实际 Activate 路径。报告对 moving 分支不自动前进 `.1m` 的勘误正确；GAS cooldown BusinessReject 正常返回可令输入 Executed，HasNormalInput 不保证位移。
- F6 在 `.10` pump 内由 BeforeInput 将注入时间推进至 `.157`，再从公开 Update+Read 观察 `.157/.160`，符合现有 fixture 接口；期望与当前源码推导清楚分开。报告明确没有运行，并排除了把后续 JSON 耗时或人工时钟跳变当成已测 WASM 耗时。
- P1/P2 明确定义为本地验证/修复优先级，不代表发生率。Game35 使用 Client17 与已合入 Client18 的区分保留；报告完成没有改变前台验收 FAIL。

此 PASS 只批准上述报告表述与验证配方的准确性，不是新行为验证结果，也不是对整个移动任务或全部仓库代码的通过裁定。
