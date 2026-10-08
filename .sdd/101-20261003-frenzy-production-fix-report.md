# Frenzy v14 生产四失败调查

状态：已读当前精确源码、完整首运行log/json/exit及官方SDK对应source。Root在独立只读审查确认链爆循环相位后，明确释放Frenzy.Server、PlaceBombAbility与原FrenzyProductionTests三个作者文件；四项窄修与新增四个case已写完，静态核对完成，等待Root串行build/Native窗口。未运行任何.NET/Rust/Native/GEN/formatter，未提交。没有把真实失败降格为环境问题。

## 冻结的首次真实运行

`games/101-bomber/.run/v14-native-production-20261003/frenzy-production-01.{log,json,exit}`：**total25 / pass21 / fail4 / skip0 / raw child exit2**，`2026-10-03T04:45:24.4362731Z`→`04:47:07.7981163Z`。log SHA256 `40024eb7411b3e9af4e2cbcd49738ae604f4ed8300614ffe075acc069877fbf7`；json SHA256 `55ce72ebcbec5c4b2f9805010770e536564bd83d0dec9291fe56f5cf8bcce11c`。

官方complete-release-06 manifest SHA256 `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`，SDK `0.0.4-main.0e2fc74`。运行Test DLL `fae681d39a68bcc40996f5745d1eec792075f0fa6285833ed2fa7b2c9e985b8d`；Gameplay DLL `7b850bbf9979b328f685d1769ec86aa2ee0774e3630fd82301b0addaa01fe50d`；Ecs DLL `74da7fff23e1aa72b8e8b7d0fd93c8164447c636de47700e254d8404c0648def`，已实际hash比对其运行目录与隔离NuGet中的官方SDK lib/net10.0，二者完全一致；Gas DLL `09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`。

首运行作者冻结：Frenzy.Server `4a2c74b956b70067e9c5242341e292fdfc70bdc0f604d804c1035982a4546c80`，FrenzyProductionTests `59be7d3d0d9ce82e2ee39df82b9ac4adbdce1dcaba9e3966e205c5cb7ccad2b9`，PlaceBombAbility `cfeb7bfedbde14a60e0520917de6620b44a44c64216fcd737b6f008613a799ce`。原freeze与首两Native RED均保留；该run json只有sourceSha256AtStart，不能编造AtEnd冻结比对。

## 1. 实际queued捕获拒绝文案

失败测试 `ActualQueuedPlacementReservesCapacityAndCaptureRefusesUntilItsRealPublication`，test line335。真实SDK抛的是 `Snapshot/partition capture refuses pending uncommitted structural work.`，旧测试仍期待旧仓断点的pending-creates文案。

核实SDK manifest Runtime source commit `23356eafc365c753b6e8d9987fd069815ff067ce` 的 `modules/ecs/src/Lumio.GameRuntime.Ecs/World/World.Residency.cs`，`EnsurePersistenceQuiescence` line306同时检查PendingCreates/PendingDestroys/reservedDestroyCredits，正是log中的消息。已按Root预授权机械替换一个Assert.Equal字串，所有promise计数、exact字节、容量保留、真实Tick publication与零Reserved断言保留。机械改后测试SHA256 `680c4951b073ecb106e948fbc6d9291fb7bae64b5f855b4219c0f30dd139f3e8`，**未运行复测**。

## 2. 合法自然链爆误拒

失败 `ActualFrenzyProducesMoreThanSixOverItsWindowAndReplenishesAfterNaturalExplosions`，tick32，test line165，`ValidateBomb` line172。

根因有两条：`BombSystem.ApplyBlastCells` lines341–342真实链覆盖时写 `chainedBomb.FuseEndTick=world.Tick` 与 `chainedBomb.ChainId=bomb.ChainId`。Frenzy validator同时把immutable promise token尾部原chain与**当前**ChainId强相等，并要求当前FuseEnd始终等Placed+Reader1.2sec。正常5Tick相隔的邻近实际放置在第一弹到期时自然链爆，下一Tick完整校验因此拒绝。不能只移除一个Fuse检查而留下token/currentChain误比，也不能修改BombSystem关闭链爆。

已实施最小修复：只在Frenzy.Server区分初次publication/仍Fuse与已published出Fuse。immutable token仍完整绑定原Participant+正的原chain，并严格校验owner前缀、16位canonical十六进制原chain；初次publication与仍Fuse的当前chain/期限继续严格原chain+nominal。已published发生chain/deadline变化时只允许 `Placed < currentDeadline <= nominal`，且须是Danger/Burn/Expired、PlacementRecorded=true，实际 `Placed < ExplodedAt`、`currentDeadline <= ExplodedAt <= world.Tick`；同Tick链爆的等号必须合法。`RequirePublished`与`ValidateRow`继续原source/gen/chain/power/placed/nominal/shape的exact比较，不放松初始1.2秒。FullSource、Standard、零special/future、SourceLifeGeneration自免均保持。未变化的Extinguished保留原nominal，不强加从未发生的爆炸字段。

独立只读审查核实：ProcessBombs开头先Validate/ObservePublished，ApplyBlastCells每次修改仍Fuse弹的期限/chain后立即due.Enqueue，随后while完整排空；FuseElapsed进入Danger写ExplodedAt，再进行contacts/退场。没有内部Validate或可返回并遗留被改仍Fuse弹的早退路径。本次仅按已经核实的真实循环状态接纳合法链爆，不为假设的中间phase放松仍Fuse校验。

已新增独立真实自然链测试 `TwoActualFrenzyPlacementsNaturallyChainWithoutChangingTheirOriginalPublicationOrSource`：实际Place第一弹，隔Reader五Tick实际Place邻格第二弹；保存实际ID/token/初始deadline/source/gen，自然Tick到第一弹到期，断言第二弹实际出Fuse、ExplodedAt/deadline等于第一弹deadline且提前、currentchain继承，原token/source/gen/Standard不变；真实bomb_placed事件仍保存第二弹初始1.2秒deadline与原chain。显式Validate再真实Tick，并钉原Life健康6。没有fixture炸弹代替放置、没有手改Fuse/Phase/Chain。原累计>6且自然爆后补发用例保留。

## 3. 真实迟到Original后的EntityZero

失败 `ActualDelayedNativeOriginalFromOldFrenzyLifeCanDamageItsRealSuccessorLife`，test line407实际是 `world.Get<BomberDamageFacts>(bomb.Entity)`，不是newLife的Get。前面line394 Ready（当前新Life live/RestorePending=false/Protection自然结束）、oldLife退场、实际newLife health6全部已通过。

官方Runtime Component.Entity原文 `IsDetached ? default : EntityId`（同23356eaf source），组件被真实退场后不能把旧pool引用作为持久ID。Game的late Original Resume会清pending来源；已早过Danger的源在正常HFSM cleanup可以于accepted Tick结构退场，之后旧bomb组件Entity即为零。当前log支持**测试持有已退场component引用**的分类；没有successor_capacity消息或失败Ready断言，不支持把本失败归给尚未正式打包的上游候选。

已实施最小修复：初次实际publication后固定bombId/oldGeneration值，交回真实Native Original后沿 `damage_applied` 持久journal筛exact entityId=bombId+lifeId=newLife，钉sourceLifeId=oldLife与data.sourceLifeGeneration=oldGeneration，并钉newLife generation不同；真实新Life健康6→4仍必须成立。保留actual accepted checkpoint/real Successor/noFuse改写。事件由 `BomberEffectBusiness.Consume` 只在真实Status1/Ready/handle/fact精确匹配且Actual非零时发行，不是用UI事件代替生产事实。首运行在退场component Get失败时尚未执行最终健康4断言，不能声称原来已经证明这项伤害。若新运行事件或健康断言不成立，继续按实际GAS/玩法结果排障，不绕过上游。

## 4. valid Shock槽被普通形态解析器拦住

失败 `ActualExtraPlacementIsStandardWithoutConsumingInventoryOrInheritingTheHeldSlot(heldKind:6)`，test ActivatePlace line506，`bomb_skill_invalid`。

源与当前官方exports的shockBomb skill12是 `slot=Bomb, trigger=PlaceBomb, is_combo=false, bomb_kind_code=6`；Shock bomb kind119007已Enabled。fixture确实选中了它。`BomberSpecialBombResolver.IsM2Kind`只含1/2/3/4/5/7，遗漏6；Place的CanAcceptIntent在知道Frenzy之前先用普通形态resolver作唯一槽权限，Execute又在Frenzy Standard覆盖前同样提前return。不能删无效槽权限，也不能把heldKind6测试换成别种掩盖有效表项。

已实施仅PlaceBombAbility私有资格函数：普通路径与原TryResolveSlot正常通过路径保留；Frenzy为被普通形态支持集拒绝的held槽补table资格校验，须exact已启用Bomb/PlaceBomb/noncombo skill且有对应合法level，才产固定Standard，未知ID/Active槽/禁用Bomb仍拒绝。CanAcceptIntent、CanPlace与Execute使用同一函数；Execute先选择Frenzy再决定是否需要普通形态解析。Resolver/Config作者源不动，普通Shock生产支持不由本窄修擅自扩大。新增unknown ID、Active槽与实际Reader禁用Bomb三个fixture拒绝case，实际尝试Ability，钉无live bomb、零promise、链号/last placement/普通库存均未消费、零placement统计。原heldKind6真实Standard放置用例保留。

## 范围与下一步

Root释放的三个作者文件已完成窄写。不动Supply/Round/Reducer/Config/Schema/Generated/generic replay/Barrel/Runtime/Client或official06；StageAndCreate、HasSubmittedPromise、ReservedCount未改，generic replay原子重投交Root另行协调。新增真实链1+无效槽3后，静态核对13 Facts / 4 Theories / 16 InlineData，**预期29 cases**；实际total/pass/fail/skip/childexit必须以新串行build/Native日志为准。

本次作者SHA256（修复后，未编译）：

| 文件（均在games/101-bomber） | SHA256 |
| --- | --- |
| Gameplay/BomberFrenzy.Server.cs | `7a9c805f466b21b0cb6e2929e9ae193eccd5b994ac83858f091b49e06e3a6f84` |
| Gameplay/Abilities/PlaceBombAbility.cs | `1ca7265b2266460db92aa5821170cb52914578e954080e43aec86180f16b1b37` |
| Server/Tests/Gameplay/BomberFrenzyProductionTests.cs | `d42fa6f04a5c1a8e885f4bc93b00cb21bd2fd624c3e62c7c9a8d6cffaba2d57a` |

静态验证：逐段核对以上源码、真实journal字段及ProcessBombs相位，窄路径git diff --check无错误；核对固定bombId确实仅在旧FrenzyLife迟到Original测试中新增。没有编译或测试执行证据。

后续验证必须保存首次25/21/4/0/2证据，再按新sourceSHA运行，不复用旧程序集冒称修复GREEN。Root独占heavy窗口，本agent只写低内存窄源码；未执行新测试的状态明确保留。
