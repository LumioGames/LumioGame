# 0002 · 策划案与美术规范统一落 docs/specs/

- 日期:2026-08-28
- 状态:生效

## 背景

[0001](0001-art-director-skill-family.md) 把美术规范的唯一落点定在 `knowledge/standards/art-direction.md`。但实际建档时,美术规范落在了 `docs/specs/art-direction.md`,并被 4 份产品策划案当作上游引用;`knowledge/standards/` 下并不存在该文件。两条路径同日产生,art-* 技能族全文未提 `docs/specs/`——照 0001 的落点走会凭空生出第二份美术规范。

新增 design-* 技能族时必须写死策划案落点,这个矛盾会变得显性:两个技能族给出互相冲突的落点规则。

## 决策

- 策划案与美术规范统一落 `docs/specs/`,**修订 0001 中的落点条款**;0001 的其余决策(以技能族而非子 Agent 承载、persona 只放标题、单一权威分工)继续生效。
- 理由三条:`AGENTS.md`「调度核心」已明写「设计落 `docs/specs/`」,是强制载入的权威口径;`knowledge/` 每篇文档进强制载入上下文,而策划案与美术规范会随产品数量线性增长,不该付这笔导航税;现有 7 份策划案已在 `docs/specs/` 形成上下游 DAG。
- `docs/specs/` 不受 spec-lint 的 frontmatter 校验,元信息改用 H1 下的引用块(状态 / 适用范围 / 上游),状态沿用本仓中文枚举。
- 导航由 `docs/specs/README.md` 承担,不进 `knowledge/README.md`。

## 后果

- `docs/specs/` 的文档不受 spec-lint 的 frontmatter 与 description 长度校验,一致性靠 design-doc / art-bible 的「验证」节自觉,机器兜底只剩链接可达。
- `knowledge/standards/` 从此只放工程规范(workflow / code-style / testing / dispatch / repository-architecture),不放内容型规范,边界更清晰。
- art-bible、art-prompt、art-review 与 `AGENTS.md` 美术路由中的落点表述随本条同步修订。
