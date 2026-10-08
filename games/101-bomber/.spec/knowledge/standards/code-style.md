---
name: code-style
description: 代码与文档风格——语言约定、命名、注释原则、生成物纪律;写代码/建文档时查
metadata:
  type: doc
  status: 已交付
---

# 代码与文档风格

> 能交给工具（formatter / linter）强制的，优先交给工具；本文只写工具管不了、需要人 / Agent 判断的部分。

## 语言与文件命名（通用）

- **规范主体使用中文**（`.spec/` 下全部文档）；例外：根 `CLAUDE.md`（宿主入口惯例）与 `skills/` 下允许英文技能文档（中英以该技能既有语言为准，不混写）。若改用其他语言，需全仓一致——注意 LumioAgentSpec 插件的 spec-lint 内置中文 status 枚举，换语言需同步上游。
- 文件与目录命名一律 **kebab-case**；ADR `NNNN-<slug>.md`（agent 与 skill 的命名约定属插件资产，见插件 `rules/dispatch.md`）。

## 注释原则（通用）

- 注释只写**代码表达不了的约束**（为什么这样做、边界条件、外部依赖的坑）。
- 不写「改动说明」式注释（改了什么、为什么正确）——那是给评审人的话，进交回物或提交信息，不进代码。
- 注释密度、命名、习语向**周边既有代码**看齐。

## 生成物纪律（通用）

- 生成物不得手改，只能经生成源与生成命令更新，并与生成源一起提交。配表源在 `Gameplay/Tables/`，typed Reader 与两端投影由 `node Tools/sync-config-readers.mjs` 驱动 LumioConfig 生成；ECS 声明由本工作区 SDK 构建目标生成。

## 语言与框架

C# 声明与系统沿用 Sample 的目录和命名约定，服务端系统为 `Gameplay/*System.Server.cs`，两端公共类型留 `.cs`，端专用代码使用 `.Server.cs` / `.Client.cs`。数值从生成 Reader 读取，完整实体身份使用 `NetEntityId`，规则时间使用世界 `ulong Tick`。JS 工具使用 `.mjs`；它们编排与校验证据，不承载游戏模拟。浏览器原型保留独立目录，生产逻辑不得引用其 `src/sim/`。
