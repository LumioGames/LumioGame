---
name: workflow
description: 开发工作流——101 分支、merge commit、四轮执行与知识同步；提交和合并前查
metadata:
  type: doc
  status: 已交付
---

# 101 开发工作流

本目录属于 LumioGame 同一个 Git 仓库，使用父仓分支、PR 与提交记录。职责与路径见[项目中心文档](../../AGENTS.md)，通用流程见[父仓工作流](../../../../../.spec/knowledge/standards/workflow.md)。

## 分支与合并

任务在短期分支实施，所有 main 改动经 PR 和 merge commit；不直推 main，不使用 --admin。并行任务按文件集划分所有权，有交叠则串行。引擎实现留在对应上游仓，经上游 PR 合入后按完整发布物消费，不拼装 DLL、不改同级源码引用。

提交使用 type(scope): subject。PR 描述包含具体问题、最终行为、改动范围、验证命令与实际结果、已知缺口和知识落点。不读取未要求的 CI 状态充当本地验证，也不把文档检查当作产品验收。

## 当前四轮任务

父仓[开工提示词](../../../../../.spec/plans/2026-09-27-101-bomber-engine-build-prompt.md)给出常设授权和四轮顺序，优先于通用默认流程。前三轮不看不等 CI；第一轮骨架须本地编译、八 Bot 实际进房，接口冻结且第二轮线上单就绪后才能进入实现轮。第四轮仅在合入后的 main 本地全绿后触发 CI。

发现问题当轮登记 Workflow；合入、证据和未决边界及时更新[执行账本](../../plans/2026-09-27-engine-build-progress.md)。轮次完成时更新 RM-00013，不能把部分交付标为整轮完成。

## 知识同步

当前玩法与工具行为分别同步 features/bomber-gameplay.md、features/bomber-tour.md；产品规则真值在父仓 docs/specs/bomber/。方向决策落相应 ADR，已接受历史不改写。新增或变更知识文档同步本目录导航，运行 node eng/spec-lint.mjs 和父仓 .spec/tools/lint-extensions.mjs。
