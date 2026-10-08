# 来源记录（SOURCES）

每张贴图一行；`Tools/check-block-assets.mjs` 读下面这张表，核对 `textures/` 下每张 PNG 都在表里、
「来源」「版本」非空、「许可」只能是 `CC0-1.0` 或 `CC-BY-4.0`；「修改」为「未修改」且写了「原图 sha256」的行，
贴图必须与原图逐字节相同。

## 两个来源

1. **Kenney Voxel Pack**（Owner 2026-09-25 裁决采用，R-00789 追加）
   - 作者：Kenney Vleugels / Kenney（www.kenney.nl）；包内许可原文题为「Voxel pack (base)」
   - 页面：https://kenney.nl/assets/voxel-pack
   - 下载：https://kenney.nl/media/pages/assets/voxel-pack/a3a73d0ff7-1677662501/kenney_voxel-pack.zip
   - zip：1,267,464 字节，sha256 `667c05e3f6d95718aaef888c7fc06f7137ba5dede95f4574deb17d4436257958`
   - 许可：CC0-1.0。包内 `License.txt` 原文逐字节存为本目录 `LICENSE-kenney.txt`
     （sha256 `b095efc2547e48565fe5d084473c9c8e7f40a881032e1f37e0032120c6204fe5`）
   - 只拷了用到的 `PNG/Tiles/*.png`（128×128 RGBA），没拷 spritesheet、角色、道具、矢量源。
2. **自绘**：`source/generate-textures.mjs` 里 `recipes` 的程序化配方，作者 LumioBomber contributors，CC0-1.0。
   Kenney 包里没有对应图的方块才自绘：门、火把、虞美人、树苗、萤石、铁栏杆、蓝色彩色玻璃。
   配方在 16×16 上画，再按最近邻放大 8 倍到 128×128（每个像素复制成 8×8 块，不插值）。
   版本 `r1` 指 R-00789 首版配方（之后改配方就把对应行的版本加一）。

## 贴图

| 文件 | 用途 | 来源 | 版本 | 作者 | 许可 | 修改 | 原图 sha256 |
|---|---|---|---|---|---|---|---|
| textures/stone.png | 石头 | Kenney Voxel Pack `PNG/Tiles/stone.png` | kenney_voxel-pack.zip（sha256 667c05e3…7958） | Kenney Vleugels (www.kenney.nl) | CC0-1.0 | 未修改 | e53319b547c6172c72c299e21631fecf5434dc75c013b22538146badaf768d1f |
| textures/brick_grey.png | 硬墙 | Kenney Voxel Pack `PNG/Tiles/brick_grey.png` | kenney_voxel-pack.zip（sha256 667c05e3…7958） | Kenney Vleugels (www.kenney.nl) | CC0-1.0 | 未修改 | 4b9a3d9e1f2fe7341520bb2ce81ad978d8c40fc34ead45fdc7605127a3acb32c |
| textures/stone_iron.png | 矿石（lumio.ore） | Kenney Voxel Pack `PNG/Tiles/stone_iron.png` | kenney_voxel-pack.zip（sha256 667c05e3…7958） | Kenney Vleugels (www.kenney.nl) | CC0-1.0 | 未修改 | 6534e3ee65ca55e4cec274cd2d676e8f888ad4b44ed183ecda087a0358f927ee |
| textures/dirt.png | 泥土；也是草方块底面 | Kenney Voxel Pack `PNG/Tiles/dirt.png` | kenney_voxel-pack.zip（sha256 667c05e3…7958） | Kenney Vleugels (www.kenney.nl) | CC0-1.0 | 未修改 | fff7cf42c901e597cc8e212e070daf9e691032b49466d2e51ade930ad433fca1 |
| textures/grass_top.png | 草方块顶 | Kenney Voxel Pack `PNG/Tiles/grass_top.png` | kenney_voxel-pack.zip（sha256 667c05e3…7958） | Kenney Vleugels (www.kenney.nl) | CC0-1.0 | 未修改 | 6e91371f300c74179fb164d1c731b174f58ce68670b63b4925734b13053bf01d |
| textures/dirt_grass.png | 草方块侧（带土） | Kenney Voxel Pack `PNG/Tiles/dirt_grass.png` | kenney_voxel-pack.zip（sha256 667c05e3…7958） | Kenney Vleugels (www.kenney.nl) | CC0-1.0 | 未修改 | 4aff6bc1ec36f93de3702b75e67dc1b77fc74400087fbc8d03f4aec869a6171e |
| textures/wood.png | 木板；楼梯、台阶、木栅栏共用 | Kenney Voxel Pack `PNG/Tiles/wood.png` | kenney_voxel-pack.zip（sha256 667c05e3…7958） | Kenney Vleugels (www.kenney.nl) | CC0-1.0 | 未修改 | 034f0c8cf6ea6d42cae74eaf0665f10c9331baa79cc9d305190ee90880c4849e |
| textures/trunk_side.png | 原木侧（树皮） | Kenney Voxel Pack `PNG/Tiles/trunk_side.png` | kenney_voxel-pack.zip（sha256 667c05e3…7958） | Kenney Vleugels (www.kenney.nl) | CC0-1.0 | 未修改 | 3456fc479616c151cfd89cb1a3573aaf3f776ed8734ad52c3b9efdce1622be4f |
| textures/trunk_top.png | 原木顶 / 底（年轮） | Kenney Voxel Pack `PNG/Tiles/trunk_top.png` | kenney_voxel-pack.zip（sha256 667c05e3…7958） | Kenney Vleugels (www.kenney.nl) | CC0-1.0 | 未修改 | e846c2b2f1c404f155264a1a50b8a9cfbeb8d6b3815afa01a43bb97b548a0323 |
| textures/leaves_transparent.png | 树叶（镂空） | Kenney Voxel Pack `PNG/Tiles/leaves_transparent.png` | kenney_voxel-pack.zip（sha256 667c05e3…7958） | Kenney Vleugels (www.kenney.nl) | CC0-1.0 | 未修改 | 8419d19e37ff752837e36cb4f41429726921e30056d03e1ac5ff4bbdf9fac80d |
| textures/glass.png | 普通玻璃（镂空）；玻璃板共用 | Kenney Voxel Pack `PNG/Tiles/glass.png` | kenney_voxel-pack.zip（sha256 667c05e3…7958） | Kenney Vleugels (www.kenney.nl) | CC0-1.0 | 未修改 | 0d3a0dcacf34ea76985edac878537310eda164599c8715c3e8daf6647f9b22d7 |
| textures/lava.png | 岩浆（不透明，静态） | Kenney Voxel Pack `PNG/Tiles/lava.png` | kenney_voxel-pack.zip（sha256 667c05e3…7958） | Kenney Vleugels (www.kenney.nl) | CC0-1.0 | 未修改 | eb7a7a5d9e0448cf2f6aa00b6db145ed36d20d7d57ace1d50c9cd84bf9ce9cb0 |
| textures/grass4.png | 草丛交叉面片（镂空） | Kenney Voxel Pack `PNG/Tiles/grass4.png` | kenney_voxel-pack.zip（sha256 667c05e3…7958） | Kenney Vleugels (www.kenney.nl) | CC0-1.0 | 未修改 | 1fc5b13977ef369465ee3321c1ad5253a28720a49fcfbbe4cd2bcd47512799d0 |
| textures/water.png | 水（半透明，静态） | Kenney Voxel Pack `PNG/Tiles/water.png` | kenney_voxel-pack.zip（sha256 667c05e3…7958） | Kenney Vleugels (www.kenney.nl) | CC0-1.0 | alpha 统一改为 168（原图不透明），RGB 未改；由 source/generate-textures.mjs 从 source/kenney/water.png 派生 | 8bf6b51ea13652f1937c83fd0649dcd45a91dd246814886236ac0458f256eb4b |
| textures/ice.png | 冰（半透明） | Kenney Voxel Pack `PNG/Tiles/ice.png` | kenney_voxel-pack.zip（sha256 667c05e3…7958） | Kenney Vleugels (www.kenney.nl) | CC0-1.0 | alpha 统一改为 192（原图不透明），RGB 未改；由 source/generate-textures.mjs 从 source/kenney/ice.png 派生 | 6b276bff1230d6131dd49bc013b01c4b2fe247c27577b1121b6e04e633f7c358 |
| textures/blue_stained_glass.png | 蓝色彩色玻璃（半透明） | 自绘：本仓 source/generate-textures.mjs 配方 `blue_stained_glass` | r1 | LumioBomber contributors | CC0-1.0 | 原创；16×16 配方最近邻放大到 128×128 | — |
| textures/glowstone.png | 萤石 | 自绘：本仓 source/generate-textures.mjs 配方 `glowstone` | r1 | LumioBomber contributors | CC0-1.0 | 原创；16×16 配方最近邻放大到 128×128 | — |
| textures/oak_door.png | 门（上下两格共用） | 自绘：本仓 source/generate-textures.mjs 配方 `oak_door` | r1 | LumioBomber contributors | CC0-1.0 | 原创；16×16 配方最近邻放大到 128×128 | — |
| textures/iron_bars.png | 铁栏杆（镂空） | 自绘：本仓 source/generate-textures.mjs 配方 `iron_bars` | r1 | LumioBomber contributors | CC0-1.0 | 原创；16×16 配方最近邻放大到 128×128 | — |
| textures/torch.png | 火把交叉面片（镂空） | 自绘：本仓 source/generate-textures.mjs 配方 `torch` | r1 | LumioBomber contributors | CC0-1.0 | 原创；16×16 配方最近邻放大到 128×128 | — |
| textures/poppy.png | 虞美人交叉面片（镂空） | 自绘：本仓 source/generate-textures.mjs 配方 `poppy` | r1 | LumioBomber contributors | CC0-1.0 | 原创；16×16 配方最近邻放大到 128×128 | — |
| textures/oak_sapling.png | 树苗交叉面片（镂空） | 自绘：本仓 source/generate-textures.mjs 配方 `oak_sapling` | r1 | LumioBomber contributors | CC0-1.0 | 原创；16×16 配方最近邻放大到 128×128 | — |

`source/kenney/water.png`、`source/kenney/ice.png` 是上表两张派生贴图的原图，与 zip 里 `PNG/Tiles/` 同名文件逐字节相同
（sha256 见上表「原图 sha256」；生成脚本读之前先核这个值）。

预览图 `preview/blocks-preview.png` 由同一脚本从上面的贴图与 `lumio.*.json` 描述拼出，同为 CC0-1.0；
其中的 5×7 点阵字也在脚本里手写，没有使用任何字体文件。

## 选型记录

| 方块 | 选的 Kenney 原图 | 为什么 |
|---|---|---|
| lumio.ore | `stone_iron.png` | 候选 `stone_iron` / `stone_diamond`。lumio.ore 是「示例」自己的通用矿（挖了掉「矿石」，不对应现实矿种），上一版自绘是灰石上嵌青绿晶粒；`stone_iron` 的嵌块正是青绿色，远看与原设计一致，`stone_diamond` 的淡蓝宝石会让人读成「钻石」这一具体矿种 |
| lumio.oak_fence | `wood.png` | 候选 `fence_wood` / `wood`。栅栏是 Solid 方块、形状由形状表的柱和横档给出，贴图只铺在这些面上；`fence_wood.png` 是带透明的栅栏剪影，Solid 忽略 alpha，透明处会露出底色，所以用木板 |
| lumio.short_grass | `grass4.png` | 候选 `grass1`~`grass4`。`grass4` 是几丛高低不一的草叶、铺满底边，交叉面片远看最像一片矮草；`grass1` 太小、`grass2` 像灌木、`grass3` 只有两根 |
| lumio.hard_wall | `brick_grey.png` | 灰色大块砖，与石头同色系但一眼可分 |
| lumio.water / lumio.ice | `water.png` / `ice.png`（改 alpha） | 契约 texture.alpha：Liquid 与 Translucent 按 alpha 混合；原图 alpha 全是 255，原样用水和冰会画成实心，所以只改 alpha |
| 门、火把、虞美人、树苗、萤石、铁栏杆、蓝色彩色玻璃 | 无 | Kenney Voxel Pack 的 `PNG/Tiles` 与 `PNG/Items` 里没有对应图（有蘑菇、小麦、仙人掌、桌子、炉子、轨道等，都不对应）；保留自绘 |

镂空贴图（树叶、玻璃、草丛）的 Kenney 原图边缘带抗锯齿的中间 alpha。契约规定 Cutout 按 alpha < 0.5 丢弃，
中间值合法，所以原样使用，不做二值化；预览图按同一规则画。

## Mojang 派生核查结论

- Kenney Voxel Pack：Kenney 自绘的扁平风格贴图，包内 `License.txt` 声明 CC0；配色、图案与 MC 原版不同
  （例：草方块侧面是锯齿形草边、原木顶是方形年轮、矿石是几何色块），不是 MC 贴图改色或描摹。
- 自绘部分：`source/generate-textures.mjs` 逐像素生成，只用写死的 RGB 常量、固定种子伪随机噪声与简单几何，
  不读取任何外部图片（Kenney 派生那两张除外，只读 `source/kenney/` 的 Kenney 原图）。
- MC 原版贴图、从 MC 客户端 jar 提取的资源包、「Faithful」「仿原版」一类派生包、CC-BY-SA / NC / ND 或许可不明的包：
  一律不收（ADR-124 D9）。
- 结论：**不含 MC 原版或由其派生的贴图 / 模型**。
