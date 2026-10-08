# 署名（Attribution）

本材质包目前**没有 CC-BY 素材**，因此没有必须署名的条目。下面两处来源都是 CC0-1.0，不要求署名，仍记一笔：

- **Kenney Voxel Pack** — by Kenney Vleugels / Kenney（https://www.kenney.nl），
  来源 https://kenney.nl/assets/voxel-pack ，许可 CC0-1.0（原文见 `LICENSE-kenney.txt`）。
  用在 `textures/` 下 15 张贴图：13 张原样拷贝、`water.png` 与 `ice.png` 只改了 alpha（逐张见 `SOURCES.md`）。
  Thanks, Kenney!
- **LumioBomber contributors** — 其余 7 张自绘贴图（门、火把、虞美人、树苗、萤石、铁栏杆、蓝色彩色玻璃），
  由本仓 `source/generate-textures.mjs` 程序化绘制，许可 CC0-1.0 — https://creativecommons.org/publicdomain/zero/1.0/

## 以后加入 CC-BY-4.0 素材时

每张贴图写一条（CC BY 4.0 第 3(a) 节要求的内容），并把贴图路径写进条目，`Tools/check-block-assets.mjs` 会按路径核对：

```
- textures/<file>.png — 「<作品标题>」 by <作者>，来源 <URL>，
  许可 CC BY 4.0（https://creativecommons.org/licenses/by/4.0/），<已修改：缩放到 128×128 / 未修改>
```
