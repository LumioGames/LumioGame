# 0005 · skill 的 description 改为「宿主路由依据」口径

- 日期:2026-08-28
- 状态:生效

## 背景

`spec-steward` 原规则要求 skill 的 description「只写触发条件、不概括流程」,理由是防止 agent 照描述走捷径、跳过正文。

但这条规则与实践长期背离:8 份 art-* / design-* 的 description 全部违反了它——因为**宿主是靠 description 决定要不要把 skill 加载进上下文的**。纯触发条件(「当讨论美术风格时使用」)不足以让宿主和主 loop 判断这个 skill 能干什么,结果是 skill 根本不被发现。且 spec-lint 对 skill description 不做任何校验(长度与单行校验只作用于 `knowledge/`),这条规则等于一条无人遵守、也无人能查的死条款。

## 决策

- description 的定位改为**宿主的路由依据**:必须让人一眼判断「什么时候该加载我」。
- 冻结句式 `<做什么>[——<范围 / 边界>]。当<触发场景>时使用。`,破折号段可选——现有 8 份 art-* / design-* 中 4 份带、4 份不带,规则按实际写,不制造新的规则与实践落差。
- 保留原规则要防的东西,但收窄到真正有害的部分:**不写操作步骤与判据数值**——那些进正文,写进 description 才会导致照描述走捷径。
- 长度自觉遵守 ≤120 字符,与 `knowledge/` 同口径;机器不强制。

## 后果

- 规则向实践对齐,现有 8 份 art-* / design-* description 无需改动。
- 「概括职能」与「概括流程」的边界靠人判断,机器仍不校验;若日后再出现照 description 走捷径的情况,应收紧的是正文「操作步骤」的表达,而不是退回禁止概括职能。
- 其余从上游 LumioAgent 继承的英文 skill(brainstorming / writing-plans / SDD / TDD 等)description 未逐一复核,不符新句式的留待各自迭代时对齐,不在本条范围内。
