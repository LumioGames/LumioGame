# LumioAgent Entry

Compatibility entrypoint for agent tools. The authoritative spec lives under `.spec/`; this file only points, it defines no rules of its own.

Read these two in order — they are the always-in-context core (Claude Code force-loads them via `@import` in `CLAUDE.md`; Codex has no `@import`, so read them voluntarily here):

1. **`.spec/AGENTS.md`** — 项目介绍 + 本仓专有路由(中心文档,先读)。
2. **`.spec/knowledge/README.md`** — 项目知识导航(有哪些知识、在哪)。

通用调度规则、硬红线与通用技能由 Workflow 插件提供(ADR-089 第二步),本仓不再自带一份;本仓自有技能(美术 / 策划 / 计划执行)在 `.spec/skills/`。

Rules for all agents:

- **Read and follow `.spec/AGENTS.md` first.**
- Treat this file as a pointer only. Do not add project rules here.
- Tool-specific entries must point into `.spec/`; they must not define a second source of truth.

Note: Codex relies on voluntarily reading the two core docs after this pointer; Claude Code force-loads them via `@import`. Known asymmetry, acceptable.
