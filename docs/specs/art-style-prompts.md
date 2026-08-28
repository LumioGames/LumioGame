# 美术比稿出图 Prompt 包 v0.1

> **状态**：比稿中（随比稿定调作废或升版）
> **适用范围**：美术风格三方向探索出图
> **上游**：[`art-style-pitch.md`](art-style-pitch.md) · [ADR 0007](../../.spec/decisions/0007-art-style-reset-three-way-pitch.md)


> **风格未锁定 · 仅探索。** 所有 prompt 基于探索假设（世界观 = W4 动物玩偶派对，三个候选风格方向），产出图只作定调参考，不是资产、不进包。
> 工具口径：GPT / Gemini 类（DALL·E / Imagen）自然语言写法，无 seed 参数——**批次一致性靠「风格锚」长句逐字复用**，请勿改写风格锚。

## 使用方法

1. 每条 prompt 整段复制，**每条生成 2–4 张**（同一条 prompt 的多次生成天然就是变体）。
2. 三个方向**同一批做完**，别隔天做，工具风格漂移会污染对比。
3. 一次只改一个变量：想试变体就用给出的变体行，不要即兴改风格锚。
4. 存图命名带编号（如 `A1-v1-01.png`），回图时带编号发我，我按四关筛选逐张裁决。
5. 看图时重点盯 **3 号图（同屏组合）**——「2D 角色贴在 3D 积木上像不像一家人」是本轮唯一要回答的问题，1、2 号图只是给它铺垫。

**四关速览**（回图后我会逐张给裁决）：风格关（对不对味）→ 结构关（AI 硬伤：手、对称错位、透视混乱）→ 落地关（缩小后可读吗、能拆件吗）→ 合规关（不像任何具体 IP）。

**统一测试主体**（三方向共用，保证可比）：

- 角色：**玩偶鸭**——圆滚滚的布偶小鸭子，有缝线细节、豆豆眼、小毡布翅膀
- 场景：**积木搭的对战棋盘**，摆在木桌面的软垫上（体素 = 积木、俯视 = 俯瞰桌面）
- 组合：玩偶鸭站上积木棋盘 + 一颗冒火花的圆炸弹（炸弹人首发场景）

---

## 方向 A · 暖软绘本（Cozy Storybook）

**风格锚 ANCHOR-A v0.1**（逐字复用，勿改）：
`cozy storybook cartoon style, warm cream-and-honey palette, soft two-tone flat shading, thin warm-brown outlines, rounded chubby shapes, gentle picture-book warmth, clean hand-drawn finish`

### A1 · 角色 keyframe（方形 1:1）

```text
Character concept art for a video game. A chubby little plush duckling toy come to life:
round soft body with tiny stitched seams, bean-shaped button eyes, small felt wings,
cheerful open-beak smile, standing in a relaxed idle pose, front three-quarter view,
full body, centered on a plain pale-cream background.
Style: cozy storybook cartoon style, warm cream-and-honey palette, soft two-tone flat
shading, thin warm-brown outlines, rounded chubby shapes, gentle picture-book warmth,
clean hand-drawn finish.
Limited palette: cream #FFF3DC, honey #FFD98E, apricot #FFB26B, leaf green #A8C686,
cocoa brown #6B4E37 for outlines.
Square 1:1 aspect ratio.
Avoid: photo-realism, 3D render look, PBR materials, dramatic lighting, text, watermark,
human characters, cluttered details, muted desaturated tones, watercolor bleeding.
```

- **A1-v2**：把描边试到极限——将 `thin warm-brown outlines` 改为 `almost invisible outlines, shapes separated by color only`（测「无描边」下剪影还立不立得住）
- **A1-v3**：主体换 `a chubby plush bunny with long floppy ears`，其余逐字不动（测家族感——两只玩偶像不像一套的）

### A2 · 体素场景一角（宽幅 16:9）

```text
Game environment concept art, wide 16:9 aspect ratio. A small battle arena built from
chunky toy building blocks, seen from a high tilted top-down angle of about 60 degrees:
a flat grid of big rounded cubes forming the floor and low walls, a few cracked crumbly
blocks that look breakable, the whole arena sitting on a soft fabric play-mat on a warm
wooden tabletop, gentle morning window light, no characters. Each block type uses one
simple hand-painted texture with visible soft brush strokes.
Style: cozy storybook cartoon style, warm cream-and-honey palette, soft two-tone flat
shading, thin warm-brown outlines, rounded chubby shapes, gentle picture-book warmth,
clean hand-drawn finish.
Limited palette: cream #FFF3DC, honey #FFD98E, apricot #FFB26B, leaf green #A8C686,
cocoa brown #6B4E37 for outlines.
Avoid: photo-realism, realistic wood photography, depth-of-field blur, glossy modern
3D render, isometric pixel art, text, watermark, characters, clutter.
```

- **A2-v2**：加 `clear visible grid seams between floor tiles`（测战术棋盘感——「哪格能走」一眼可读吗）
- **A2-v3**：`rounded cubes` 改 `crisp square cubes with softened edges`（测圆角度：太圆会丢「格」的读数）

### A3 · 同屏组合——「贴纸贴乐高」关键测试（宽幅 16:9）

```text
Video game screenshot mock-up, wide 16:9 aspect ratio, high tilted top-down view of
about 60 degrees. A chubby plush duckling toy character stands on a battle arena built
from chunky toy building blocks. The duckling is drawn as a flat 2D cartoon figure
standing upright like a paper stand-up, clearly more saturated in color than the ground,
with a soft round contact shadow directly under its feet. The arena blocks are simple
3D voxel cubes, each with one hand-painted texture. A round black toy bomb with a lit
sparkler fuse sits two tiles away from the duckling. The 2D character and the 3D blocks
must feel like they belong to the same warm hand-made world.
Style: cozy storybook cartoon style, warm cream-and-honey palette, soft two-tone flat
shading, thin warm-brown outlines, rounded chubby shapes, gentle picture-book warmth,
clean hand-drawn finish.
Limited palette: cream #FFF3DC, honey #FFD98E, apricot #FFB26B, leaf green #A8C686,
cocoa brown #6B4E37 for outlines; character more saturated than terrain.
Avoid: photo-realism, PBR materials, realistic shadows, floating character without
contact shadow, character blending into the background, text, watermark, UI elements.
```

- **A3-v2**：加第二只角色 `and a plush bunny standing three tiles away`（测多角色同屏识别）
- **A3-v3**：加 `one floor block missing, leaving a clean dark hole`（测「少一格」破坏读数）

---

## 方向 B · 明快硬描边（Bold Pop Cartoon）

**风格锚 ANCHOR-B v0.1**（逐字复用，勿改）：
`bold pop cartoon style, thick dark outlines on everything, flat saturated colors, crisp two-tone cel shading, chunky rounded shapes, energetic saturday-morning cartoon look, clean vector-like finish`

### B1 · 角色 keyframe（方形 1:1）

```text
Character concept art for a video game. A chubby little plush duckling toy come to life:
round soft body with tiny stitched seams, bean-shaped button eyes, small felt wings,
a big cheerful open-beak grin, standing in a confident idle pose, front three-quarter
view, full body, centered on a plain warm light background.
Style: bold pop cartoon style, thick dark outlines on everything, flat saturated colors,
crisp two-tone cel shading, chunky rounded shapes, energetic saturday-morning cartoon
look, clean vector-like finish.
Limited palette: sunshine yellow #FFC93C, tangerine #FF7A3D, sky blue #3DB8DA, grass
green #6CC551, near-black ink #2B2320 for outlines.
Square 1:1 aspect ratio.
Avoid: photo-realism, 3D render look, gradient shading, soft airbrush, neon esports
colors, gritty adult cartoon, text, watermark, human characters.
```

- **B1-v2**：`thick dark outlines` 改 `medium-weight dark brown outlines`（测描边粗细的甜点——太粗会低幼）
- **B1-v3**：主体换 `a chubby plush bunny with long floppy ears`，其余逐字不动（家族感）

### B2 · 体素场景一角（宽幅 16:9）

```text
Game environment concept art, wide 16:9 aspect ratio. A small battle arena built from
chunky toy building blocks, seen from a high tilted top-down angle of about 60 degrees:
a flat grid of big cubes forming the floor and low walls, a few cracked breakable blocks,
the arena sitting on a play-mat on a wooden tabletop, no characters. Every block has
a thick dark outline like a comic panel, one flat-color painted texture per block type,
clear grid lines between tiles.
Style: bold pop cartoon style, thick dark outlines on everything, flat saturated colors,
crisp two-tone cel shading, chunky rounded shapes, energetic saturday-morning cartoon
look, clean vector-like finish.
Limited palette: sunshine yellow #FFC93C, tangerine #FF7A3D, sky blue #3DB8DA, grass
green #6CC551, near-black ink #2B2320 for outlines; terrain slightly less saturated
than pure accent colors.
Avoid: photo-realism, gradient shading, soft ambient occlusion, glossy 3D render,
isometric pixel art, text, watermark, characters.
```

- **B2-v2**：加 `terrain colors desaturated by 30 percent, saving full saturation for interactive objects`（测「地形低饱和、主体高饱和」的可读性分层）
- **B2-v3**：去掉 `clear grid lines between tiles`（反向测试：没有格线还有棋盘感吗）

### B3 · 同屏组合——「贴纸贴乐高」关键测试（宽幅 16:9）

```text
Video game screenshot mock-up, wide 16:9 aspect ratio, high tilted top-down view of
about 60 degrees. A chubby plush duckling toy character stands on a battle arena built
from chunky toy building blocks. The duckling is a flat 2D cartoon figure standing
upright, with the same thick dark outline language as the blocks, clearly more saturated
than the terrain, with a solid round contact shadow under its feet. The arena blocks
are simple 3D voxel cubes with flat painted textures and thick dark outlines. A round
black toy bomb with a lit sparkler fuse sits two tiles away. Character and blocks share
one outline style so they read as a single world.
Style: bold pop cartoon style, thick dark outlines on everything, flat saturated colors,
crisp two-tone cel shading, chunky rounded shapes, energetic saturday-morning cartoon
look, clean vector-like finish.
Limited palette: sunshine yellow #FFC93C, tangerine #FF7A3D, sky blue #3DB8DA, grass
green #6CC551, near-black ink #2B2320 for outlines; terrain less saturated than the
character.
Avoid: photo-realism, gradient shading, realistic lighting, floating character without
contact shadow, character blending into background, text, watermark, UI elements.
```

- **B3-v2**：加第二只角色 `and a plush bunny standing three tiles away`（多角色识别）
- **B3-v3**：加 `one floor block missing, leaving a clean dark hole`（破坏读数）

---

## 方向 C · 玩具质感（Tactile Toybox）

**风格锚 ANCHOR-C v0.1**（逐字复用，勿改）：
`tactile toybox style, plush felt and soft vinyl toy textures, rounded handcrafted forms, soft three-tone shading with small material highlights, miniature toy-shelf charm, warm and clean`

### C1 · 角色 keyframe（方形 1:1）

```text
Character concept art for a video game. A chubby little plush duckling toy come to life:
round soft body covered in short fuzzy felt, visible stitched seams, bean-shaped button
eyes, a soft vinyl beak with one tiny highlight, small felt wings, cheerful expression,
standing idle pose, front three-quarter view, full body, centered on a plain warm
background. Drawn as a 2D illustration, not a 3D render.
Style: tactile toybox style, plush felt and soft vinyl toy textures, rounded handcrafted
forms, soft three-tone shading with small material highlights, miniature toy-shelf
charm, warm and clean.
Limited palette: vanilla #FFF0E0, duck yellow #FFD34D, bubblegum pink #FF8FA3, mint
#7FD8C4, warm wood #C98F5A.
Square 1:1 aspect ratio.
Avoid: glossy 3D game render, photo-realism, depth-of-field photography blur, plastic
glare everywhere, text, watermark, human characters, cluttered details.
```

- **C1-v2**：材质换 `carved and painted wooden toy with visible wood grain`（测材质换皮＝皮肤系统的底层假设）
- **C1-v3**：主体换 `a chubby plush bunny with long floppy ears`，其余逐字不动（家族感）

### C2 · 体素场景一角（宽幅 16:9）

```text
Game environment concept art, wide 16:9 aspect ratio. A small battle arena built from
real toy materials, seen from a high tilted top-down angle of about 60 degrees: a flat
grid of chunky cubes — some painted wooden blocks, some soft plastic bricks, some felt
tiles — forming the floor and low walls, a few cracked breakable blocks, the arena
sitting on a quilted play-mat on a warm wooden tabletop, no characters. Each block type
uses one simple painted texture; the whole scene looks like a lovingly handcrafted
tabletop game. Drawn as a 2D illustration, not a photo.
Style: tactile toybox style, plush felt and soft vinyl toy textures, rounded handcrafted
forms, soft three-tone shading with small material highlights, miniature toy-shelf
charm, warm and clean.
Limited palette: vanilla #FFF0E0, duck yellow #FFD34D, bubblegum pink #FF8FA3, mint
#7FD8C4, warm wood #C98F5A; terrain kept softer than accent objects.
Avoid: photo-realism, miniature photography with blurred background, glossy modern
3D render, isometric pixel art, text, watermark, characters.
```

- **C2-v2**：加 `clear grid seams between floor tiles`（棋盘读数）
- **C2-v3**：材质统一成 `all blocks are painted wooden bricks`（测「杂材质」vs「单一材质」哪个更整）

### C3 · 同屏组合——「贴纸贴乐高」关键测试（宽幅 16:9）

```text
Video game screenshot mock-up, wide 16:9 aspect ratio, high tilted top-down view of
about 60 degrees. A chubby plush duckling toy character stands on a battle arena built
from toy blocks. The duckling is a 2D illustrated figure with soft felt texture and
gentle material shading, standing upright, clearly warmer and more saturated than the
terrain, with a soft round contact shadow under its feet. The arena blocks are simple
3D voxel cubes textured as painted wood and felt. A round black toy bomb with a lit
sparkler fuse sits two tiles away. The illustrated character and the toy blocks must
feel like parts of the same handcrafted toy set.
Style: tactile toybox style, plush felt and soft vinyl toy textures, rounded handcrafted
forms, soft three-tone shading with small material highlights, miniature toy-shelf
charm, warm and clean.
Limited palette: vanilla #FFF0E0, duck yellow #FFD34D, bubblegum pink #FF8FA3, mint
#7FD8C4, warm wood #C98F5A; character more saturated than terrain.
Avoid: photo-realism, depth-of-field blur, glossy 3D render, floating character without
contact shadow, character blending into background, text, watermark, UI elements.
```

- **C3-v2**：加第二只角色 `and a plush bunny standing three tiles away`（多角色识别）
- **C3-v3**：加 `one floor block missing, leaving a clean dark hole`（破坏读数）

---

## 回图后我们一起看什么

| 看点 | 判据 |
|---|---|
| 缝合感（最重要） | 3 号图里 2D 鸭和 3D 积木像一家人吗？还是像贴纸贴乐高？ |
| 棋盘读数 | 2 号图缩小到 25% 后，还能一眼分清「能走 / 不能走 / 刚被炸掉」吗？ |
| 角色跳出度 | 3 号图眯眼看，角色能从地形里跳出来吗？ |
| 家族感 | v3 变体的鸭和兔，像同一套玩具吗？ |
| 情绪 | 哪个方向最接近「休闲、轻松、愉快、想跟朋友一起玩」？ |
| 陌生人测试 | 挑最好的一张发给没见过项目的人：「这好看吗？这是什么游戏？」 |

> 色板均为示意值（v0.1 探索假设），定调后由正式色彩系统取代。
