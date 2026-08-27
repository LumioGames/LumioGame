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
- 当前仓库尚未提交实现工程。首次引入代码时必须同时固定 SDK/语言版本、formatter、analyzer 与可复现的验证命令，并更新本文和 [`testing.md`](./testing.md)，不得依赖 Agent 猜测工具链。
- C# 公共类型、成员与 Schema 类型使用 `PascalCase`，局部变量和参数使用 `camelCase`；协议、Schema、Manifest 中已经发布的标识符保持原有大小写，不做风格性改名。
- 规范正文使用中文，代码标识符、协议字段和可执行命令保留其原始英文拼写；Markdown 与结构化文本保持 LF（见根 `.gitattributes`）。
- Component/RPC/Mapping/Serializer/Manifest 等生成物只从架构源 Schema 与锁定输入生成，记录 Compiler/Input/Output Hash，不在本仓手写第二套契约。
