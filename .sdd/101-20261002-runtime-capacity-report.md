# Runtime finite/successor 容量修复交回记录

工作树：`C:/Work/LumioGames/LumioGameRuntime-101-finite-successor-capacity`，分支 `codex/101-finite-successor-capacity`。基线 `2ab1deeb2abd5b34cb6d722136b2225d120df97a` 为已核验 RFC final2；主协调者负责随后合流最新 main B3、hydration 与 RVP，不把本分支的旧启动面恢复为主线。

## 已实现的行为

- Binding 使用真实 detached EntityOrder 初始化并测量完整当前/待创建 census，在结构队列、实体 allocator、live route 或 revision 变化之前拒绝超限。实体组件只在提交时绑定 Sync host；原有 live write guard 保持。
- ECS 从 Engine owning `world-change-parts-v1.json` 的嵌入资源读取 parts 逻辑上限；普通 profile 维持 65536。超出物理帧但未超逻辑上限的完整 baseline 可以交由所属 Host 分片，不丢 census。
- GAS 临时计算 resident/pending Effect、普通同步变化、RPC 与完整准入 census 的投影边界。Apply/Refresh 在当前准入组合不容纳时返回容量错误，保持旧 Tick/ordinal、handle allocator、原行、route 和 publication/result credits 不变。
- 准入按实际 census/effect bound 加 sender scratch 保留累计 publication debt，支持八个未 drain 的 parts 准入；不对每个观察者固定扣除完整 4 MiB 上限。
- 最终投影超限守卫保留。预测不了以后任意 Gameplay 写入不是已证明全覆盖的内容；这次针对实际 census、PendingCreates 与已知 GAS 工作做提交前预算，不能在报告中扩大成任意未来写入无故障保证。

F2 周期致死由 Root 同时修复，独立审查见 `101-20261002-runtime-f2-independent-review.md`。

## 恢复后实际验证

原始 F1 Native RED 见 `.sdd/runtime-capacity-probe-20261002/native-red-01.json`：实体 102→104、revision 102→104、route 已建立后才在投影抛出超限。原输入为 parts profile，正确修复应容纳完整逻辑 census；非 parts 与超过逻辑上限另有明确拒绝用例。

本次接续先确认无 capacity 工作树测试/构建进程存活，并读取当前 all-TFM build 与 GAS 905/905 终态记录。没有重新复制完整源树。

| 本次执行 | Total | Passed | Failed | Skipped | Exit | 证据 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 容量首次有效复测 | 6 | 0 | 6 | 0 | 2 | `capacity-focused-02.log` |
| 修正新 fixture 预算后的容量复测 | 6 | 6 | 0 | 0 | 0 | `capacity-focused-03.log` |
| 完整 Replication | 193 | 193 | 0 | 0 | 0 | `replication-full-01.log` |
| F2 独立定向复测 | 1 | 1 | 0 | 0 | 0 | `finite-final-independent-01.log` |
| ECS 完整首次执行 | 496 | 495 | 1 | 0 | 2 | `ecs-full-01.log` |
| 真实生成管线依赖路径复测 | 1 | 1 | 0 | 0 | 0 | `ecs-generator-pipeline-02.log` |
| ECS 完整修正环境后的执行 | 496 | 496 | 0 | 0 | 0 | `ecs-full-02.log` |

证据目录为工作树 `.artifacts-capacity/capacity-resume-evidence/`，每项有单独 exit 文件。首次容量失败为新 fixture 的 ResultRecords=304 超过既有生成 reducer 的 3168 写入声明（288×11）；将仅测试 CapacityHarness 的 256 requests 划为 240 requests + 16 controls，总结果上限仍为 288。没有调整生产限制、生成 reducer 声明或测试容量断言。全量 ECS 唯一失败为其真实生成管线子进程未继承命令行 LumioArchRoot，错误引用父仓旧 Engine；按同名 MSBuild 环境变量传递正确 AFC 依赖后，该实际管线和完整 496 例均通过，未删除或放宽测试。

附加验证：

- `build-fixture-01.log`：相关构建 exit0，0 warnings/errors；之前 Root `f2-evidence/build-solution-all.log` 全 TFM 构建同为 0 warnings/errors。
- 官方声明生成器重新输出 successor 21 个文件，与 checked-in generated/server SHA-256 全相同；`generator-consistency-01.json`、generator exit0。
- 修改过的非生成 C# 文件 whitespace 检查 `format-whitespace-03.log` exit0；`git diff --check` exit0。这不是完整 solution analyzer/format。
- 两次命令行使用错误（filter-method OR、folder+no-restore）保留日志，不计为测试通过；已按工具帮助修正后执行以上有效验证。

容量代码须由 Root 独立复审；当前记录只支持上述覆盖范围。Host parts 输出、真实 Platform/DS/浏览器、八 Bot 长稳、101 完整两局等仍由整体交付验收，不能由这些测试替代。

## 固定交回身份

已将明确的 26 个生产/fixture/生成/测试文件提交为 `1907290daeaa12a8061a2cc0412c3065b62b8453`，父提交为 `2ab1deeb2abd5b34cb6d722136b2225d120df97a`，提交标题 `fix(runtime): reserve admission projections and report periodic lethal crossings`。包含 Root 的 F2 修复与完整测试，未遗漏混合所有权的 FiniteEffectSettlement.cs。未提交 `.run/` 或 `.artifacts-capacity/`；当前 tracked tree 干净，只有上述两个证据目录为 untracked。

26 个文件的工作区 byte SHA-256/长度见 `.artifacts-capacity/capacity-resume-evidence/delivery-files.json`；生成文件入 Git 按既有 `.gitattributes` 规范化 CRLF→LF。没有复制全树或创建另一套合同真值。

主协调者可审查 `git diff 2ab1deeb 1907290` 并在最新 main 合流分支明确移植；该提交本身不改变原基线的 B3 状态，不应直接覆盖 latest-main 实现。
