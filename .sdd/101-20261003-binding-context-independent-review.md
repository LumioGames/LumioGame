# BindingContext 容量拒绝独立审查

限定结论：Engine `ad8106809b549231813af56e345665215c0ba80b` 与 Runtime `9a76038d88d67092e28674fb6348ece4be3c47ad` 的 policy-only/typed refusal 窄修通过本次源码审查和独立真实 Native 定向回归。不是最终 SDK、provider 或 101 整局验收。

## 审查发现与修复

初始 `ba292b68` 修复 managed policy 先发布造成的部分修改：先验证 Runtime 派生的真实 live candidates 和容量，单次 Native 替换成功后才发布 managed policy。Try 只将既有容量拒绝转为 false，旧 void 仍抛原容量异常；owner、pending、非法声明和 Native 故障保持异常。候选实体不由 Gameplay 提供，未增加 ABI 或伪造第二份实体表。

Root 独审发现其仍在 B 拒绝前按 C 分配 policy 数组/HashSet。作者真实 Native RED：C=65536/B=200，拒绝前分配 3,376,088B。`9a76038d` 加无容器预检：fixed64 与 88/row 最小值来自原 `TextBytes = 4 + UTF8` 计费，随后按每行实际文本再检查；通过后才分配。未增加 C/B、吞掉 Native 错误或在 Game 捕获异常消息。

## Root 独立验证

- 独立输出目录：`C:/Work/LumioGames/LumioGameRuntime-101-binding-context-budget/.run/binding-context/root-independent-artifacts`。
- 实际重新构建 Coordination.Tests 及依赖，exit0，0警告、0错误，27.53秒；日志 `root-independent-build-01.log`。
- 实际运行 `NativeBindingContextAtomicityTests`：17/17，Errors0、Failed0、Skipped0、NotRun0，exit0，6.372秒；日志 `root-independent-native-01.log`。
- Native 使用原 a5fa 发布物 `lumio_engine_native.dll`，buildId `2020bcc47cee042330ff5a8d949ada92`，ABI `c5f276c855bcb71fd9b04dcd546d1dd925ac408fd6303d56e30a2c044946a2f3`。该修复无 Native ABI 变更，新增正式 SDK 的 Native 仍需在 Game 实际回接验证。
- 生产源码 SHA256：`2fadd9673bf6e86ca4c57a44c845114e1d1e2821c661867fa44bb6eb3e504001`，与 frozen-02 一致。
- 覆盖 C/B 拒绝及恢复、managed/Native 原状态、pending mutation/未 drain Original、声明/owner/Native异常，以及高C低B、文本超B、空policy固定开销超B三种分配前拒绝。

作者另有全 Runtime2705/2705、零失败跳过及 allTFM/format 证据；本报告不把作者全量结果称为 Root 独立全量重跑。新 SDK `189b3f3b…` 已由作者进行强箱11/11真实回接，完整 Gameplay、provider合并及整局仍待完成。
