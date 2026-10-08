# Decisions(决策记录 · ADR)

用 ADR(Architecture Decision Record)记录本游戏工作区的配置、构建与消费决策。父仓框架、产品和玩法方向决策继续落父仓 `.spec/decisions/`；feature 文档只描述当前设计，不复制决策历史。

本目录记录游戏工作区的配置与引擎消费决策；玩法与产品方向继续引用仓根 ADR 0011–0046，不复制第二份。

## 怎么写一条 ADR

- 一个决策 = 一个文件 `NNNN-<slug>.md`,编号从 `0001` 递增;写完在下方索引加一行。
- **一旦记录不改写**:被推翻就新增一条,把旧的状态标成「被 NNNN 取代」,历史留痕。被取代的状态行必须链接取代者(spec-lint 强制)。
- 无 frontmatter。格式照抄:

  ```markdown
  # NNNN · <一句话决策>

  - 日期:YYYY-MM-DD
  - 状态:生效 | 被 [NNNN](NNNN-<slug>.md) 取代(部分取代加前缀「部分」)

  ## 背景
  面对什么问题。

  ## 决策
  定了什么。

  ## 后果
  接受了什么代价。
  ```

## 索引

| 编号 | 决策 | 状态 |
|------|------|------|
| [0001](0001-bomber-config-is-json-files.md) | 玩法数值由源表生成并在启动时绑定 | 生效 |
| [0002](0002-generated-declarations-owned-by-sdk.md) | 组件声明生成只由发布 SDK 执行 | 生效 |
| [0003](0003-engine-from-submodule-only.md) | 引擎只从子模块 Engine/ 的完整发布布局读取 | 生效 |
