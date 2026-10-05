# 101 Favorite Fire 准入独立审查

**规格符合性：窄准入修复 PASS。代码质量：Approved。Root 同一 build39 的原 Favorite1 GREEN 已核验；Region1 正确推进至真实缺 producer 的 RED，完整九格区域与轨迹仍未交付。STOP。**

非作者审查，只读取完整两份生产源码、before/diff、公共Ability、resolver、Effect CanSettle、reducer、hydrate、现有区域声明，以及原Favorite1/新Region1测试与Root完整运行证据。没有修改生产/测试/配表/生成声明，没有运行build、Native、GEN或编译器。只写本报告与 `.run/favorite-fire-admission-independent-review-01/`。

## 精确范围与源码身份

| Root改动 | before SHA256 | after SHA256 |
| --- | --- | --- |
| UseActiveSkillAbility.Server.cs | `9c92cc4f5eea2b835c88e076e4463703b96f67e8ad4ac744033b4145344ddbe0` | `0677fe55da02cb8f6a8cac1861b57082c80998a029b3804c33aefacd965052c7` |
| BomberFiniteAura.Server.cs | `2aeace1ef6c7d2a685c302bb201a8a14aaa42983a01e938036acc6638f892cdf` | `0de157bc4cda84a7fa6baae4bbae69ed1adcdf26a8db8579649619bf91fc8c7b` |

独立脚本反向恢复两个窄差异并逐字/逐hash等before：第一项只移除显式ReservedFire排除，保留TryResolveSlot；第二项增加一次解析、结果kind2比较，并把同一bool同时写入request.Favorite和skill.AuraFavorite。两份完整diff在独审evidence，未列举代码字节全部保持。

原Favorite1测试源码 SHA `08e334e9e2f7f5f837f8c9be56221b8a3910e2f01e47186afc49a4900055f640`；新Region1源码 SHA `e85a764c375124f7acd15e6cf5e37fd45eb2863ec4c58efcf52545c28ce4c3aa`。两个都1Fact；Root的对应RED/GREEN运行记录绑定同一源码，审查者未改断言。

## 规格与质量检查

`Abilities/UseActiveSkillAbility.Server.cs:27–33`仍要求duration/cooldown有效以及解析成功；`Config/BomberSpecialBombResolver.cs:7–31`只解析真实配置的Bomb槽、PlaceBomb trigger、非Combo、允许kind且Enabled，空槽解析0保持普通Aura语义，disabled Fire仍不会解析成Favorite。移除额外Fire排除符合已通过真实配置准入的kind2，不引入非法槽旁路。

公共 `Abilities/UseActiveSkillAbility.cs:11–64`仍AuthorityOnly、空输入，依次校验真实玩家输入门、skills、freeze、pending outcome、cooldown、真实Active能力、level及角色绑定；Execute再做CanActivate。Favorite没有变成客户端可传参数，也未绕过公共选择或Pickup。

`BomberFiniteAura.Server.cs:21–41`一次捕获Favorite，精确request与持久correlation同值；Effects.Apply成功后才推进NextChain/handle/request state。与已有延迟结算协议一致，不提前写AuraUntil/cooldown或伪造Initial。`Effects/BomberFireAuraEffect.Server.cs:11–28`仍校验source/target=life、实体类型、participant/currentlife/match/generation、request duration/chain/Favorite、真实handle、AuraOutcome1、存活/health/restore与重复10111门。

`BomberFiniteAura.Server.cs:44–69,72–100`仍匹配完整request+实际Finite row，并在PairedCheckpoint只更新恢复后WorldId、不重Apply；`Components/Bomber/BomberSkillState.Server.cs:7–14`非零outcome仍要求完整handle、duration、cooldown、chain。捕获Favorite保留为request历史，不在恢复/消费时随新held slot重算。`BomberFireReducer.Server.cs:58–91`仍由真实10111 Initial Applied结果推进AuraUntil/cooldown/outcome，事件与统计由消费路径写一次。静态窄审查未发现新增P0/P1/P2；本范围没有新增hydrate生产测试，不能外推完整paired restore交付。

新Region1 `Server/Tests/Gameplay/BomberFavoriteFireRegionProductionTests.cs:23–137`使用真实作者编译、SelectCharacter118004、physical Fire pickup→PickupAbility→公开UseActiveSkillAbility；只准备初始selection/地图和物理item输入，未手写Bomb held/Aura结果、区域、Native机器或Effect输出。逐项核实际10111 row、full tuple、handle、payload Favorite、borrowed phase9 Initial Applied、cooldown及cast事件/统计。`:140–191`再要求实际一实体九格Coverage511、10112真实row/Initial与Native FireActive；使用现有BomberFireZoneState的CoverageMask/PromiseToken等声明、现有EffectComponent与numeric10112，没有引用未发表未来API。required880断言放在最后`:193`，未抢在producer行为前制造capacity RED。两个测试的observer只复制实际结果batch，不改结果，也恢复原observer。

## Root 实际执行证据核验

完整log hash重新核算等JSON，raw `.exit`等record，计数取实际summary；源hash与当前两源/两测试匹配；新两run记录同一Test/Game/Runtime/Native程序集，本次又重新哈希这些当前物理DLL匹配记录。全部命令、JSON/log hash与源码/程序集身份保存在独审 `verification.json.runs`。

| Root label | total/pass/fail/skip | raw exit | log SHA256 |
| --- | --- | --- | --- |
| favorite-fire-cast-red-35 | 1/0/1/0 | 2 | `627a50de06c641d096f2264c9a425fbafca50b6935cedaa07a9f56ef1e933cbb` |
| favorite-region-admission-red-40 | 1/0/1/0 | 2 | `cfeb2ab3dbab4aa96058c8ff351b6097b86a93ff5614b14bae7635601320d263` |
| favorite-fire-flag-green-41 | 1/1/0/0 | 0 | `917f7089622e70161190fe81907fa34557b0e18e84a373ddaba2f6f3326f6e8b` |
| favorite-region-producer-red-41 | 1/0/1/0 | 2 | `489e46b119c86684aa89d633102935da08a02b321f186a7071bb5c6c47841f2d` |

旧RED都实际到CanActivate返回active_skill_unavailable；同build39的Favorite1在5.466sec通过。Region1在5.127sec失败`:140`实际 `Assert.Single` collection[]：因此顺序在它之前的10111/tuple/Initial/Favorite/cooldown/cast事件统计均已越过；不存在region，10112/Native区域断言与required880尚未到达。它是缺区域producer的真实RED，绝不是容量RED，更不能因为flag1 GREEN宣称区域完整。

Root build39-resource-default-favorite-flag实际raw0、0warnings/0errors；log SHA `7d8551704f972b86b3e6380a8a9003bec759dcc88bb9ba65009d0dc2bb2297ac`、JSON SHA `1899f6591566cccf83d4880be65357f7707c37be6ddd56e30fbda0a4f209b43b`。上述41两run TestDLL `42c872fc88ef14cd7a2962e13a4d11ce072dd65086a04235e5350829aee26282`，GameDLL `61ffd66564c634a13b173a04af4eefcd212e1305da41d27d07675de1f13b5e55`，Ecs `aa5520f37e22eb6337d4e9e5c33008684bb7fd51e598dad38ef404351dddbd49`。

实际Gas为 `09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`；Native `c01599b8c31ea72185f2a206dbcc5c4ff8fb432c68bb61ea3dabab5e6d4ddb12`。旧run历史DLL只由记录支持，未宣称当前可重哈希旧字节。

## 其他关闭与保留项

先前Resource profile P2已核更正：作者报告`:46`明确“按manifest既有分组顺序…不是全路径排序”。原manifest SHA仍 `d75ad37b79beacdc93d13b2cea61bca3f652996bcdf5be278b03943e043c69f9`，其原132逐文件数值fence和组合76f66/e5b2文字不变。此次只确认文字与原manifest，Root已发表default1607的窗口不属于原before fence，也不在这里重判官方export交付。

完整Favorite九格区域创建、逐tick/movingtrail、10112 Native生命周期、声明bytes/容器/真实880 capacity尚未通过，仍为独立后续生产工作。当前窄修复不包含这些实现；不得从本PASS关闭它们。

独审脚本执行 `node .run/favorite-fire-admission-independent-review-01/verify.mjs favorite-fire-flag-green-41 favorite-region-producer-red-41` raw0；`verification.json` SHA `66330f2078d08750a7e554a9262b42d7097a48bb04cdd6c9eb82531f371f3ed0`。到此STOP。
