# 美术风格比稿:三方向探索稿

> **状态**:比稿中(探索稿,定调后由正式美术规范取代)
> **适用范围**:Lumio 全线产品美术定调
> **上游**:[ADR 0007](../../.spec/decisions/0007-art-style-reset-three-way-pitch.md) · [`worldview.md`](worldview.md)

> **风格未锁定。** 本稿所有内容为比稿候选与探索假设,不构成资产生产依据;prompt 产出图仅作定调参考,不进包。

## 0. 比稿边界(已锁,候选不得越界)

- 卡通基调;休闲、轻松、愉快;娱乐社交向。
- 暖色调亲和情绪 + Q 版比例圆润造型(取自用户参考截图;不取其软渲染与 3D 角色)。
- 产线:**AI 主产能**(生图 / 生模型);场景体素 3D、单贴图、无 PBR;角色 2D + 少量动画,结构从简。
- 产品硬约束:俯视角玩法可读性、多人同屏识别、Windows 优先。
- 评估轴 = **AI 产线一致性 × 竞技可读性 × 情绪贴合**;运行时性能三方向几乎相同(单贴图体素 + billboard sprite),不作区分轴。

## 1. 三个候选方向

| | A · 暖软绘本 | B · 明快硬描边 | C · 玩具质感 |
|---|---|---|---|
| 一句话 | 奶油暖色 + 柔和有限明暗 + 细描边,绘本里走出来的派对 | 粗描边 + 高饱和色块 + 二值 cel,周六早晨动画能量感 | 塑胶 / 毛绒 / 木头伪立体质感,真实玩具摆上桌 |
| 参考锚 | 截图色彩情绪;动物森友会亲和力;Ooblets / Cozy Grove | Brawl Stars(只取可读性,不取美式脸);Castle Crashers 描边 | Yoshi's Crafted World;蛋仔软胶感(只取材质) |
| 角色 | 细棕描边 + 软色块 + 腮红 | 粗深描边 + 平涂 + 夸张表情 | 2D 手绘伪立体玩偶质感(毛绒 / 软胶高光) |
| 场景 | 体素微圆角 + 手绘笔触贴图 | 方块同带描边(描边是缝合 2D/3D 的针脚,旧框架核心洞见) | 体素贴图画成积木材质(木纹 / 塑料 / 毛毡) |
| 特效 | 软形状:星星 / 云朵烟,「泡芙感」爆炸 | 图形化漫画爆炸(星形 BOOM + 速度线) | 实体道具感:棉花 / 五彩纸屑 / 发条 |
| AI 单张可复现 | ●●●●○ | ●●●●● | ●●●●● |
| 批次 / 多向一致 | ●●●○○(软渐变易漂) | ●●●●● | ●●○○○(**最大风险**:立体感越强 8 向越难) |
| 竞技可读性 | ●●●○○(需饱和度纪律) | ●●●●● | ●●●●○ |
| 单资产工时 | 低–中 | 最低 | 中 |
| 皮肤扩展 | ●●●●○ | ●●●●○ | ●●●●●(换材质 = 换皮) |
| 主要风险 | 柔和色域下角色跳出度 | 情绪易滑向吵闹电竞感 | 8 向一致性;缓解 = 「AI 生简模 → 引擎渲 sprite」 |
| 反例(不是) | 莫兰迪性冷淡 / 水彩失控 / 低对比糊 | 冷色电竞 / 美式讽刺漫画 / 低幼贴纸 | 微缩摄影景深滥用 / 廉价 3D 渲染感 |

**共通产线保底**:8 向 sprite 一致性是 AI 生图公认短板,通用方案是「AI 出概念定风格 → AI 生简模(或人工低模)→ 引擎内渲 8 向 sprite sheet」;B 纯 2D 生图可撑,A / C 建议按渲染管线预留。

## 2. 竞品坐标结论

「极风格化 × 轻快」角落已拥挤(蛋仔 / 糖豆人 / Brawl Stars 均在附近)——**差异化不在情绪坐标,而在形态组合**:「俯视体素棋盘 + 2D 手绘角色」目前无人占据(最近的 Core Keeper 为纯 2D)。情绪上与头部派对游戏同区是有意为之:那是被验证的大众审美区。

## 3. 探索出图 Prompt 包 v0.1

统一测试主体(三方向同题才可比):**玩偶鸭**(圆滚滚布偶小鸭,缝线 / 豆豆眼 / 毡布翅膀)× **积木对战棋盘**(桌面软垫上)× **冒火花的圆炸弹**。
工具口径:GPT / Gemini 类,自然语言整段复制;无 seed,**批次一致性靠风格锚长句逐字复用,禁止改写**。每条生成 2–4 张,三方向同一批做完,存图带编号(如 `A3-v1-02`)。

### 风格锚(版本化,逐字复用)

- **ANCHOR-A v0.1**:`cozy storybook cartoon style, warm cream-and-honey palette, soft two-tone flat shading, thin warm-brown outlines, rounded chubby shapes, gentle picture-book warmth, clean hand-drawn finish`
- **ANCHOR-B v0.1**:`bold pop cartoon style, thick dark outlines on everything, flat saturated colors, crisp two-tone cel shading, chunky rounded shapes, energetic saturday-morning cartoon look, clean vector-like finish`
- **ANCHOR-C v0.1**:`tactile toybox style, plush felt and soft vinyl toy textures, rounded handcrafted forms, soft three-tone shading with small material highlights, miniature toy-shelf charm, warm and clean`

### 示意色板(v0.1 探索假设,非最终色板)

- A:cream `#FFF3DC` / honey `#FFD98E` / apricot `#FFB26B` / leaf green `#A8C686` / cocoa 描边 `#6B4E37`
- B:sunshine `#FFC93C` / tangerine `#FF7A3D` / sky `#3DB8DA` / grass `#6CC551` / ink 描边 `#2B2320`
- C:vanilla `#FFF0E0` / duck yellow `#FFD34D` / bubblegum `#FF8FA3` / mint `#7FD8C4` / wood `#C98F5A`

### 每方向三张(×2 变体)

| 编号 | 内容 | 测什么 |
|---|---|---|
| ×1 | 角色 keyframe,玩偶鸭,3/4 正面全身,1:1 | 气质与造型语言 |
| ×2 | 体素场景一角,约 60° 俯视,积木棋盘 + 可破坏块,16:9,无角色 | 棋盘读数 / 材质语言 |
| ×3 | **同屏组合**:2D 玩偶鸭站上 3D 积木棋盘 + 炸弹,接地阴影,16:9 | **「贴纸贴乐高」缝合测试——本轮唯一核心问题** |
| v2/v3 | 描边极端 / 主体换布偶兔 / 格线开关 / 缺格 / 双角色 | 无描边极限 · 家族感 · 棋盘读数 · 破坏读数 · 多角色识别 |

完整 prompt 文本(9 条 × 变体,含 avoid 负向与画幅)在 [`art-style-prompts.md`](art-style-prompts.md);本稿只锁骨架与风格锚,prompt 正文以该文件为单一落点。

### 回图评审判据(四关前的看点)

① 缝合感——3 号图里 2D 鸭与 3D 积木像一家人吗;② 棋盘读数——2 号图缩到 25% 还分得清能走 / 不能走吗;③ 角色跳出度——眯眼看角色能否从地形跳出;④ 家族感——鸭与兔像同一套玩具吗;⑤ 情绪——哪个方向最「休闲轻松愉快」;⑥ 陌生人测试——「这好看吗?这是什么游戏?」。评审走 art-prompt 四关(风格 / 结构 / 落地 / 合规)。

## 4. 比稿进度

- [x] 世界观收敛(W4,ADR 0008)
- [x] 三方向提案 + prompt 包 v0.1
- [ ] 出图与四关筛选
- [ ] 拍板方向 + 提炼 3–5 条可证伪风格支柱
- [ ] 新 ADR + art-bible 重建正式规范(取代本稿与旧 `art-direction.md` 存档)
- [ ] 风格验证包进 B1 抛弃型原型,实拍验证后锁
