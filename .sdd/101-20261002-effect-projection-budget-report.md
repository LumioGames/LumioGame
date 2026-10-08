# 有限 Effect 下私有状态复制预算修复

Runtime 独立修复提交 `02888789c3790af5c24c253feae57b82e84c59a7`，工作树 `C:/Work/LumioGames/LumioGameRuntime-101-effect-projection-budget`。Game 启用有限 Bubble 后，Instant 伤害准入触发复制投影预检；预检错误地包含 Scope.None 的服务器私有标量和容器，导致实际不会上网的数据用尽帧预算并拒绝伤害。

修复只在复制投影排除 Scope.None，保留私有 Dirty、持久化与真实结算，不改 65536 上限。新增真实 Native 世界中有限 Effect + 70KB 私有/公开标量、容器四用例；私有值保留且实际 Tick 伤害 10→7，公开大载荷仍拒绝且生命值保持 10。

证据均位于该 Runtime 工作树 `.run/101-effect-projection-budget/`：

- `red-01`：4 项，2 通过、2 失败、0 跳过，exit 2；失败为私有数据错误拒绝。
- `green-01`：4/4，0 失败/跳过，exit 0。
- `ecs-alltfm-01`：双目标 Release 构建，0 警告/错误，exit 0。
- `gas-full-01`：905 通过、4 失败；首次未给 Prediction Native 路径，另误设 minimum 911，日志保留，不计行为 RED。
- `gas-full-02`：909/909、0 失败/跳过，exit 0。冻结基线是 905，加本次 4；先前 active 树 907 还包含未冻结的两项 AdmissionAttributePreparationTests。

capacity_resume 对 3 文件独立窄审 PASS：Scope.None 与实际复制可见性规则一致，测试包含真实 Tick、私有值保留及公开数据继续拒绝。该结论不覆盖完整准入 provider 或正式整局。

官方 Engine `pack-sdk.mjs`（Engine f53d6ad、Voxel 2ba61e4、上述 Runtime）成功，证据在 `C:/Work/LumioGames/LumioGameEngine-101-wasm-render-world/.run/101-effect-projection-sdk/pack-01.*`。SDK identity：同目录 `sdk/identity.json`，版本 `0.1.0-dev.cc172a5377012fa0d9f5266bc7ba97c0a871ceab10056e096a4696130e1d1ae2`。Game 正式消费者和浏览器 replica 正在回接，尚不计它们通过。
