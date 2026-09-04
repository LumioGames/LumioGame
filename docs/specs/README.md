# Specs(策划案与设计文档 · 导航)

本目录是**功能级工作产物**的落点:策划案、美术规范、产品方向文档。一行一篇,按需下钻。

> 落点规则、文档骨架与数值来源纪律以 `design-doc` 技能为单一权威,此处不复述。
> 决策记录不放这里——ADR 的唯一落点是 [`.spec/decisions/`](../../.spec/decisions/README.md)。

## 平台级(跨产品共用)

| 文档 | 状态 | 一句话 |
|---|---|---|
| [product-direction.md](product-direction.md) | 设计中 | 产品定位、三层目标用户、差异化与三款产品阶梯——定方向、判取舍前查 |
| [worldview.md](worldview.md) | 设计中 | 世界观设定「动物玩偶派对」:世界规则、表现基线与三款产品落地——做内容与美术决策前查 |
| [art-style-pitch.md](art-style-pitch.md) | 比稿中 | 美术风格三方向比稿探索稿:比稿边界、方向深描、引擎成本、评估维度表与推荐排序——比稿期做美术判断、拍板方向前查 |
| [art-style-prompts.md](art-style-prompts.md) | 比稿中 | 比稿出图 prompt 包 v0.1:三方向 × 九条 prompt 全文与变体——拿去 AI 出图时查 |
| [art-direction.md](art-direction.md) | 已推翻·存档 | 旧美术风格规范,降级为比稿方向 B 详细参考(ADR 0007)——仅存档,不构成生产依据 |
| [ugc-ladder.md](ugc-ladder.md) | 设计中 | UGC 五级阶梯与开放节奏——设计创作能力、判断开放时机时查 |
| [risks-and-engine-asks.md](risks-and-engine-asks.md) | 设计中 | 策划侧风险清单与提给引擎侧的硬需求——立项前确认可行性时查 |

## 工程(本仓 C# 落地)

| 文档 | 状态 | 一句话 |
|---|---|---|
| [engineering/module-scaffolding-design.md](engineering/module-scaffolding-design.md) | 设计中 | 模块脚手架设计:10 子模块目录、C# 工程基线(global.json/Build.props 族)、依赖边界与首批拆卡蓝图——建工程、拆脚手架卡前查 |
| [engineering/mvp-placevoxel-content-spec.md](engineering/mvp-placevoxel-content-spec.md) | 设计中 | MVP 内容规格:PlaceVoxelAbility(挖/放方块)GAS 内容、Mapping、最小 config/content 面与 Runtime 接口假设——做 MVP 内容卡前查 |

## 产品

| 文档 | 状态 | 一句话 |
|---|---|---|
| [bomber/design.md](bomber/design.md) | 设计中 | 体素炸弹人完整设计稿:100 人 .io 帽子乱斗与滚动房间、三心血量与连锁结算、人数-地图联动与双密度指标、场景材质、分区补给箱与中央定时补给、3 槽装备(Stage 5)、可读性功能、首轮默认值、Gate 0 + Stage 0–6 切片与遥测门槛——首发产品(阶梯 ①) |
| [bomber/stage0-kernel-contract.md](bomber/stage0-kernel-contract.md) | 已冻结 v1.0.0 | Stage 0a 内核契约:Runtime 接入核验结论(ADR 0015)、6 个 Component/EntityType、命令/事件/端口、Config Schema、Scenario 文件格式——做 G-1..G-7/C-1 实现卡前查 |
| [bomber/stage0-test-matrix.md](bomber/stage0-test-matrix.md) | 已冻结 v1.0.0 | Stage 0a 风险驱动用例矩阵,按传播/连锁/血量/帽子/拾取/地图/回放/遥测分组,每条标消费卡与自动化层级——G-1..G-7 写测试前查 |
| [bedwars/direction.md](bedwars/direction.md) | 设计中(方向级) | 起床战争俯视改编方向稿:以水平空隙替代垂直落差——阶梯 ② |
| [duckoff/direction.md](duckoff/direction.md) | 设计中(方向级) | 逃离鸭科夫方向稿:撤离玩法与跨局存档诉求——阶梯 ③ |
