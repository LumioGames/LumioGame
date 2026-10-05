# Platform 的游戏输入（本游戏的三样）

引擎发布物带一份与游戏无关的 Platform compose：`Engine/platform/docker-compose.yml`（ADR-123 决策 8；镜像是 `Engine/manifest.json` 的 `platformImage`）。它只从 `LUMIO_GAME_PLATFORM_DIR` 指的目录读游戏相关的东西，本目录就是示例游戏的那一份：

| 文件 | 用途 |
|---|---|
| [`platform.env`](platform.env) | `bomber` 的分配（`Platform__Allocations__bomber__*`），`platform` 服务以 `env_file` 读入 |
| [`seed-games.sql`](seed-games.sql) | 大厅目录里 `bomber` 这一行，`games-seed` 执行 |
| [`games/`](games/) | 大厅包目录，只读挂到 `/var/lumio/games`；`games/bomber/` 现在是占位页 |

启动器在没给 `--origin` 时自己起这套栈，跑完 `down -v` 删掉（账号不跨次残留）：

```bash
node Tools/launcher.mjs --bots 2            # 自动 docker compose up / down
node Tools/launcher.mjs --bots 2 --no-platform   # 不起 Platform：第 02 步 BLOCKED_ENV
```

手动起同一套栈（排查用）：

```bash
LUMIO_PLATFORM_IMAGE="$(node -p "require('./Engine/manifest.json').platformImage")" \
LUMIO_GAME_PLATFORM_DIR="$PWD/Tools/compose" \
docker compose -f Engine/platform/docker-compose.yml -p lumio-bomber-platform up -d
```

DS 模板 [`Server/Config/Startup/server.json`](../../Server/Config/Startup/server.json) 的 `admission_public_key_hex` 是这份 compose 里本地准入私钥对应的公钥（只用于本地开发）。对接别的 Platform 时用 `LUMIO_PLATFORM_ADMISSION_KEY` 换掉。没有 Docker 时第 02 步 `BLOCKED_ENV`，exit 2。
