---
name: knowledge
description: 项目知识库导航——查"某事怎么做"(standards)或"某功能怎么设计的"(features)时,从这里找到对应 .md
metadata:
  type: index
---

# Knowledge(项目知识库 · 导航)

本文件是 `knowledge/` 下所有 .md 的导航 meta:一行描述 + 路径,按需下钻。

> **导航行与各文档 frontmatter `description` 同一句话口径,只写「是什么 + 何时查」。** 交付历史在 git,不进文档;长度 / status 枚举 / 登记覆盖 / 链接可达由 `/lumio:lint` 机械校验。

## standards/(开发规范 · 要遵守的「怎么做」)

| 文档 | 一句话 |
|------|--------|
| [`standards/workflow.md`](standards/workflow.md) | 开发工作流——101 分支、merge commit、四轮执行与知识同步；提交和合并前查 |
| [`standards/code-style.md`](standards/code-style.md) | 代码与文档风格:语言约定、命名、注释原则、生成物纪律——写代码/建文档时查 |
| [`standards/testing.md`](standards/testing.md) | 测试与验收——101 发布物构建、真实 Native 测试、八 Bot 与完整局证据；验证改动时查 |

## features/(功能设计与记录 · 供了解)

| 文档 | 一句话 |
|------|--------|
| [`features/_TEMPLATE.md`](features/_TEMPLATE.md) | 新功能文档模板——新增功能记录时照此建,放对 领域 / 模块 |
| [`features/bomber-gameplay.md`](features/bomber-gameplay.md) | 炸弹人玩法与世界模型——查实体、配表、原型取舍和 Sample 省略项时使用。 |
| [`features/bomber-tour.md`](features/bomber-tour.md) | 炸弹人启动与取证——查三档正常入口、整局十四步、回放和真实玩家证据时使用。 |

## lessons(经验教训 · 复发问题暂存区)

| 文档 | 一句话 |
|------|--------|
| [`lessons.md`](lessons.md) | 经验教训:reviewer 反复退回的同类问题与 Agent 常犯坑——开工前与复盘沉淀时查 |

---

新增 / 修改 / 维护知识文档(放哪、frontmatter、同步本导航)→ 用 `spec-steward` 技能;决策记录(唯一落点)→ [`../decisions/`](../decisions/README.md)。
