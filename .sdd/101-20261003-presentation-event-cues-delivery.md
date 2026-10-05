# 101 正式缩圈预警映射窄修

仅修改 `games/101-bomber/Client/Presentation/src/replica-events.ts`、该文件测试及新增 `audio/__tests__/replica-journal-cues.test.ts`，未改 C#、schema、生成文件或原型规则。

`BomberFinalCircle.Server.cs` 的实际 Native HFSM AnnounceStage 分支追加 `circle_preview`，原始 data 为 stageId / side / effectiveTick。TS 现在以已有配表 catalog 查 StageIndex，以本事件捕获的 side 和正式 mapSize 计算显示矩形，沿已有相对 Tick 投影生成 RingShrinkAnnounced，交现有 ringWarn 音效。使用事件原始值，避免延迟到达时误读较新圈状态。缺 stage 或地图投影不猜值。原 bigint sequence / match / Tick 字符串游标不变，基线不重放、同帧重送幂等。

## 实际红绿与回归

证据根 `games/101-bomber/.run/20261003-presentation-event-cues/`，每项有 `.log` 与真实 `.exit`：

| 执行 | 总数 | 成功 | 失败 | 跳过 | exit |
|---|---:|---:|---:|---:|---:|
| events-red-01 | 16 | 13 | 3 | 0 | 1 |
| events-green-01 | 16 | 16 | 0 | 0 | 0 |
| presentation-full-01 | 662 | 662 | 0 | 0 | 0 |
| dependency-guard-01 | 1 | 1 | 0 | 0 | 0 |

RED 包括实际缺事件、较新 replica 遮蔽捕获阶段、真实 PresentationFeed → audio 消费无 ringWarn。只补 8 行事件分支后原断言全绿。新增共 8 例，其余 8 例为既有事件回归；包含 uint64 邻近上限身份、相对 Tick、重连和重复帧。音效边界测试仅替换浏览器 Synth / sounds 输出以计数，真实投影、Feed 和 audio 分派没有替身；它不等于实际浏览器听感验收。

`typecheck-01`：正式 TypeScript 无输出、exit0。`build-01`：Vite 正式生产库构建 133 模块、exit0。使用项目已安装依赖，未引用原型模拟器。命令分别为 `node node_modules/vitest/vitest.mjs run`、`node node_modules/typescript/bin/tsc --noEmit`、`node node_modules/vite/bin/vite.js build` 与 `node --test tests/dependency-guard.test.mjs`，cwd 为 Client/Presentation。

## 血包与宝箱剩余事实

撤销初审中将现有 heal_applied 直接接 PlayerHealed 的推断。当前 `BomberHealthBusiness.SubmitPickup → Consume` 在成功健康 Effect 后发 heal_applied，继而发 pickup_taken。既有血包音来自后者，PlayerHealed 明确只用于 regen/boss。新增组合测试确认真实这种双 journal 形状只播一次 healthPack，零 regenChime；重连基线零播放，health_restored 不伪装回春。兔子 Period 尚须实际成功事实及原因，未通过显示计时制造。

宝箱当前 journal 只有 BomberStrongChests.Accept 的 chest_spawn 和无合法格时的 chest_unavailable。最小后续 C# 落点已定位：

- `BomberTerrainTransactions.TryDestroy`：ResourceTier==0 的强箱 `TryCountBomb(Family(bomb))` 真正返回 Added 后，且 TryObserveChest 成功，追加一次 chest_hit。可直接捕获 chest.Entity / RemainingHits、bomb.Owner / SourceLife / SourceLifeGeneration / ChainId、原 x/z 和当前 tick；重复 family、Pending、拒绝不得再发。
- `BomberTerrainTransactions.Begin`：确认 Original + Applied + TokenConsumed、整个批次 receipt revision/source provenance 全部验证后，在第二个消费循环内、Clear(runtime) 前，以 PendingChests / PendingParticipants / PendingSourceLives / PendingSourceLifeGenerations / PendingChainIds 和 TerrainPendingDetails 的 X/Z/Occurred/Tier 追加 final_chest_opened。只有 DestroySoft 且非空强箱才发；Initialize / Clear / CircleClear / SpawnClear / StrongChest 创建均不能伪开箱。被销毁的 chest 已不 live，必须读原持久 pending 元数据，不能重新查实体或从客户端消失推断。

上述 C# 后续未实施；需要真实 Native 原收据消费、重送/拒绝/清圈/回连不误发的验收。本次报告不将其当已修复，也不将 662 个表现单测作为完整游戏或实际音频通过。
