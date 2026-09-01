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

- **规范主体使用中文**（`.spec/` 下全部文档）；例外是根 `CLAUDE.md` 与既有英文 Skill。单份文档内保持语言一致，状态枚举沿用本仓中文定义。
- 文件与目录命名一律 **kebab-case**；agent 文件 `<name>.agent.md`、skill 目录 `skills/<name>/`、ADR `NNNN-<slug>.md`。

## 注释原则（通用）

- 注释只写**代码表达不了的约束**（为什么这样做、边界条件、外部依赖的坑）。
- 不写「改动说明」式注释（改了什么、为什么正确）——那是给评审人的话，进交回物或提交信息，不进代码。
- 注释密度、命名、习语向**周边既有代码**看齐。

## 生成物纪律（通用）

- 生成物不得手改，只能经生成源与生成命令更新，并与生成源一起提交（红线见 [`rules/system.md`](../../rules/system.md)）。

## 语言 / 框架特定风格

- 产品逻辑使用 C#/.NET；Server Gameplay 与 Client Gameplay 必须保持独立程序集和 Role 边界，Unity/HybridCLR 类型只能留在客户端内容或适配层。
- SDK 基线：根 `global.json` pin `10.0.100` + `rollForward: latestFeature`（Windows 实测 `dotnet --version` = `10.0.111`）。C# `LangVersion` 14.0；`.editorconfig` 与 GameRuntime 对齐。生产工程 `GameProductionProject=true`（双 TFM、文档 XML、0 warning）；测试工程 `GameTestProject=true`。验证命令见 [`testing.md`](./testing.md)。
- C# 公共类型、成员与 Schema 类型使用 `PascalCase`，局部变量和参数使用 `camelCase`；协议、Schema、Manifest 中已经发布的标识符保持原有大小写，不做风格性改名。
- 规范正文使用中文，代码标识符、协议字段和可执行命令保留其原始英文拼写；Markdown 与结构化文本保持 LF（见根 `.gitattributes`）。
- Component/RPC/Mapping/Serializer/Manifest 等生成物只从架构源 Schema 与锁定输入生成，记录 Compiler/Input/Output Hash。`lumio.gameplay-envelope.v1` 按架构源 `downstreamConsumption` 手写类型面并对齐 JSON 字段/哈希例，不得另写第二套协议或扩展 hello-wire-v1。
