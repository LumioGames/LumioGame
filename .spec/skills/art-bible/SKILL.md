---
name: art-bible
description: 把已定调的美术决策沉淀为美术规范文档并长期维护——含落点、结构与导航同步。当美术讨论出了需要写进规范的结论、或要修订既有美术规范时使用。
---

# Art Bible(美术规范维护)

把 [art-director](../art-director/SKILL.md) 定调的结论写成可对照执行的美术规范文档,并长期维护。规范是 art-prompt 与 art-review 的共同基准——只沉淀已定调的结论,不收探索中的想法。

## 何时使用

- 美术讨论定调,结论需要落档。
- 既有美术规范要修订(风格变更提案通过、审查回流补条款)。
- 需要查「美术规范放哪、长什么样」时(本技能是落点定义的单一权威)。

## 操作步骤

1. **判落点(单一权威)。** 美术规范总纲落 `knowledge/standards/art-direction.md`;初期只建这一份,五域各占一节。拆分判据:某域条款膨胀到总纲难以维护(该域小节超过总纲一半篇幅)才拆出独立文档(如 `art-ui.md`),并在总纲留链接。建档与修订整体走 [spec-steward](../spec-steward/SKILL.md) 的沉淀流程。
2. **写 frontmatter。** 按 knowledge/standards 契约(name、description ≤120 字符单行明文「是什么 + 何时查」、metadata)——字段口径以 [spec-steward](../spec-steward/SKILL.md) 与 spec-lint 为单一权威,此处不复述。
3. **写正文。** 结构见快速参考骨架。每条规范必须是**可对照判据**(供 art-review 直接引用),并附一句「为什么」;只保留当前有效结论,历史在 git;域分类指回 [art-director](../art-director/SKILL.md) 快速参考,此处不复述。
4. **同步导航。** 在 [knowledge/README.md](../../knowledge/README.md) standards 表加导航行,与 frontmatter description 同一句话口径。
5. **校验。** `node .spec/tools/spec-lint.mjs` 通过。

## 快速参考(art-direction.md 骨架)

```markdown
---
(frontmatter 按 knowledge/standards 契约)
---
# 美术方向(Art Direction)
## 0 版本与决策日志   ← 版本号;每条规范附「为什么」;方向级决策指回 decisions/
## 1 风格总纲         ← 3-5 条可证伪支柱;一句话定位;竞品坐标落点
## 2 色彩系统         ← 主色 1 + 辅色 2-3 + 灰阶 5 级;语义功能色独立轨道(HP 红/警示黄/稀有度色阶不随风格变);60-30-10 占比;色盲禁用组合;户外强光对比度与 OLED 大面积饱和度上限
## 3 2D UI            ← 栅格间距 token;字体表 + 字号阶梯;圆角/描边/投影 token;图标规范;控件状态;动效缓动曲线
## 4 原画             ← 头身比模板;线条上色规范;材质表现词典;分层 PSD 交付格式
## 5 特效             ← 元素形状词典;三段节拍模板;色彩编码表;粒子/序列帧技术规格
## 6 3D 场景          ← 套件规则;texel density 标准;光照后处理基调;(含体素则加体素分辨率与调色板)
## 7 技术约束(TA 主责)← 按机型档位的预算表:图集/压缩/粒子/draw call/面数/shader 白名单
## 8 管线与命名       ← 目录结构;命名前缀(UI_/CH_/ENV_/FX_);Unity 导入 Preset;提交流程
```

**渐进式建立**:P0(定调即立)= 1 风格总纲 + 2 色彩系统 + 7 的机型预算表;P1(首批资产开工前)= 3 的 UI token + 8 命名目录 + AI 出图风格锚(与 [art-prompt](../art-prompt/SKILL.md) 共享同一条目);P2 = 各域细则由**该域首个过审资产反推成文**,不空想规范。

### 移动端硬约束速查(供第 7 章取用,建档时按项目实测取舍)

| # | 约束 |
|---|---|
| 1 | UI 图集单张 ≤2048×2048,按界面生命周期分图集(常驻/战斗/活动);跨图集引用打断合批 |
| 2 | 纹理压缩双端统一 ASTC(UI 4×4 或 6×6,场景 6×6/8×8);大面积 alpha 渐变慎用高压缩块 |
| 3 | 可拉伸控件一律九宫格(sliced),禁整图拉伸;九宫格边距在源文件标注交付 |
| 4 | Safe area 适配:刘海/挖孔/圆角;关键交互留物理边距,iOS home indicator 区不放按钮 |
| 5 | 触控热区 ≥44pt(iOS)/48dp(Android),热区允许大于视觉尺寸 |
| 6 | 字体:TMP + 中文子集化或动态 SDF;全局字体 ≤2 套(标题+正文);规定最小正文字号 |
| 7 | 粒子按机型档位限:单特效粒子数/材质数上限、同屏总量上限;Lights/Collision 模块默认禁用 |
| 8 | Overdraw:全屏半透明叠层 ≤2-3 层;全屏泛光/全屏序列帧类效果需 TA 审批 |
| 9 | UI draw call 预算(单屏 batch 上限);Mask 用 RectMask2D 替代;Canvas 动静分离 |
| 10 | 角色预算按档位分表:面数/骨骼数/材质数上限(主角与群怪分档) |
| 11 | 贴图 POT + mipmap 策略(UI 关、场景开);全场景 texel density 统一标准 |
| 12 | Shader 白名单 + 变体数控制;白名单外材质需 TA 审批后入库 |
| 13 | 命名前缀(UI_/CH_/ENV_/FX_)+ 目录结构;导入设置由 Preset/AssetPostprocessor 强制,不靠口头约定 |
| 14 | HybridCLR 热更:图集/资源的分包归属规则入规范;若启用体素世界,体素分辨率与调色板是场景域硬约束 |

## 注意事项(Pitfalls)

- **未定调不入库。** 只写用户拍板过的结论;探索假设留在会话。
- **规范必须可判。** 「要有高级感」不行,「主色相 ≤3 组、正文对比度 ≥4.5:1」才行——写不成判据的条款 art-review 用不了。
- **单一权威。** 域分类在 art-director、落点定义在本技能第 1 步,同一规则不写两处。
- **导航行膨胀 = 每会话永久付费。** README 导航一行说完;修订规范不新增导航行。
- **维护有触发器。** [art-review](../art-review/SKILL.md) 同类退回 3 次 → 必须补条款,不靠口头传承。

## 验证

- spec-lint 通过;README 导航行与 description 同口径。
- 每条新条款可被 art-review 直接引用对照。
- 文档里只有已定调结论,无「待定」「可能」类条款。
