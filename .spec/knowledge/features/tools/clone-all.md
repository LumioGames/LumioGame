---
name: clone-all
description: 组织仓一次性 clone 工具——查失败分级(远端授权 vs 本地/网络)、退出码语义与清单维护纪律
metadata:
  type: doc
  status: 已交付
---

# clone-all

简介：`clone-all.mjs` 把 LumioGames 组织的仓一次性 clone 到本仓同级目录，是外部开发者拿到全部公开源码的入口。清单手写在脚本里，刷新命令见文件头注释。

## 背景 / 目标

外部开发者只能拿到公开仓，私有仓（Runtime / Server / Engine 等）经 NuGet 包分发。工具要在「私有仓拿不到属正常」与「真出了故障」之间划出机器可判的界线——把故障说成正常跳过，包装脚本与 CI 就会静默当成功。

## 设计

- **失败分级（`classifyFailure`）**：本地故障模式**优先于**远端授权模式匹配。
  - `no-access`（可跳过）：只认确证的远端授权失败——401/403、repository not found、authentication failed、could not read username/password、terminal prompts disabled。
  - `error`（真实失败）：本地文件系统故障（工作树 / 目录创建失败、`no space left on device`、只读文件系统、`EACCES|ENOSPC|EROFS|EPERM`）、网络故障，以及**任何未匹配**的 stderr（默认分支就是 error）。
  - 不得用裸 `permission denied` 之类含混关键字判授权——git 建工作树目录失败用的是同一个词。
- **退出码语义**：公开仓落进 `no-access` 时在逐仓结果处**改判为 `error`**（公开仓匿名即可 clone，判成无权限只可能是代理 / 陈旧凭据），因此逐仓行、汇总计数、退出码三者由同一份 tally 派生，不会出现「汇总失败 0 但退出 1」。只有清单里 `visibility: private` 的仓允许被 `🔒 跳过(无权限,私有仓)` 且不影响退出码。有任何失败即 exit 1。
- **可测性**：`main(argv, { run, log, error })` 允许注入 git 执行器与输出，退出码与措辞可离线确定性测试；真实 `runGit` 由无凭据环境实跑覆盖。

## 维护纪律

- **清单漂移会波及所有外部开发者**：`REPOS` 手写。某个已登记的公开仓一旦在上游被改私有 / 改名 / 删除，它会落进 `no-access` 并被改判失败，于是**所有人**的 clone-all 都 exit 1，即使其余仓全部拉全。这是有意取舍（响 > 哑）。
- 因此改动组织仓的可见性 / 仓名，或增删仓，必须同步刷新 `REPOS`；刷新命令在 `clone-all.mjs` 文件头注释里，`visibility` 记实测值不记规划值。

## 相关

- 代码：`clone-all.mjs`、`clone-all.test.mjs`（`node --test clone-all.test.mjs`）。
- 仓库边界与发布组合：[`repository-architecture.md`](../../standards/repository-architecture.md)。
