# scenario

> **状态**：骨架（G-0 占位，无业务代码）

## 负责

炸弹人 Stage 0a 的 headless Scenario 宿主、Bot 行为、命令流录制与回放 oracle（design.md §16 Stage 0a；由 G-6 落地）。

## 不负责

不做 Config/Content/Migration；不做客户端表现；不做网络传输。

## 状态所有权

进程内持有一个 `WorldManager` 与其驱动循环；不持久化到磁盘之外的任何共享状态。

## 依赖方向

依赖 `Lumio.Game.ServerGameplay`（消费 Bomber Contracts 与规则内核）与 sibling `LumioGameRuntime` 的 `modules/ecs` 公开 API；不依赖 Runtime `simulation`/`coordination` 的 internal 面（见 `docs/specs/bomber/stage0-kernel-contract.md` §0 的接入核验结论）。
