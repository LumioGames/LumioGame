# CLAUDE.md

Claude Code entrypoint. The `@import` lines below **force-load** their content into every session context. The authoritative source is `.spec/`; this file only loads, it defines no rules of its own.

Central doc (项目介绍 + 本仓专有路由):

@.spec/AGENTS.md

Knowledge navigation (force-loaded so the agent always knows what knowledge exists and where):

@.spec/knowledge/README.md

通用调度规则与硬红线由 Workflow 插件经 SessionStart 常驻注入(ADR-089 第二步),本仓不再自带一份。

> **Maintenance:** every force-loaded file needs a matching `@.spec/<path>.md` line above, or it won't load at init. This completeness is machine-checked by `node .spec/tools/lint-extensions.mjs` — run it after any `.spec/` change.

Claude-specific:

- 本仓自有技能经软链暴露:`.claude/skills -> ../.spec/skills`(通用技能与子 Agent 由插件提供,本仓不重复维护)。
- Do not maintain any Claude-only rules here. When behavior changes, edit `.spec/`; this file is just a pointer.
