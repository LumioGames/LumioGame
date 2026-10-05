# 101 资源奖励预算与新 Release 容量边界私稿

本交回物只在父仓 `.run/resource-chest-budget-formal-formula-draft-01/` 写私稿、审计脚本及证据；未修改 Gameplay、原测试、声明、配表、生成目录、公共 ABI 或 Release，也没有 C# build、GEN、Native/test/format/提交。数学候选52未选定。原333私稿、42 profile 静态证据及原计划错误前像保持。

## 已有真实证据

`games/101-bomber/.run/v14-fullpack07-native-20261003/resource-chest-budget-red-01.log/json/exit` 为原10例真实2通过、8失败、0skip、raw child2。默认真实 required_pickups639 对 expected1351、skills-off634对1106；105秒503/498对807/698；F==stop639对391；六个真实发布 ECS Chest 完整身份的第六个触碰遭 CapacityExceeded。不是编译或跳过造成的 RED，不能删原断言来收口。

`contact-old-cap5-world-baseline-01.log/json/exit` 已真实1/1、0skip、raw0，5.055秒。实际 immutable 原件位于：

`C:/Work/LumioGames/LumioGame/games/101-bomber/.artifacts/resource-contact-world/old-world-cap5-0bb1c9bca38e454fb187e5874ec84c44/original.lwm`

它是官方整个 World 的21487 bytes，SHA256 `6a0e5a671cdb89a003c4567ccefa9534481c0fcd48e147b10c583d8aabd755a8`；真实唯一 contactedChests canonical JSON235 bytes，含长度的 blob239 bytes，capacity/count为5/5，五个 full ID为同 World实例101的counter3..7。原件已在旧 cap5真实 Restore 并精确重新 Capture 全字节相等。31个实际 export 文件已永久复制，当前读回全部与 actual.json 原 SHA相等。

旧实际 Game DLL `78b1a0ec5ad12867da0e78757db7414d70c61e8e9fc72e48e7a60d4ea803626e`；Ecs `aa5520f37e22eb6337d4e9e5c33008684bb7fd51e598dad38ef404351dddbd49`；runner锁 complete07 manifest `652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`。该原件不因为新 Release 决策而重写、重新造一份或丢弃。

## 最小公式私稿

完整候选文件 `BomberObjectBudgets.cs.draft` SHA256 `02263d82ebb7e73163ec20fdc0eb502362ca4ae1908dcb4602808941efe55192`；共享奖励规则私稿 `BomberResourceRewardRules.cs.draft` SHA256 `1958df1566fac9d399ab3a5371f4cea5635e76502671be02e2a5a010e4b85c06`。后者只给现有 Maximum/Validate 增加 tables+skills 的 overload，避免 Calculator 尚未形成 Settings 时递归读取 config。实际发奖与准入仍共享一份形状规则。

令 T(ms) 为官方 `Ticks.FromMilliseconds` 的向零取整。M=T(match)，C=T(final)，L=T(stop_before_final)，F=T(first_trigger)，R=T(interval)，O=实际配置 orbits，S=stage中 SpawnChest数乘每stage发行数。保留原 C>M、R==0及checked溢出拒绝；不强锁F为8秒，不强锁R为8秒，不增加仅named profile的准入条件。

```
stop = M > checked(C + L) ? M - C - L : 0
waves = F < stop ? checked(1 + (stop - 1 - F) / R) : 0
resourceCells = checked(waves * 4 * O)
globalChestLimit = checked(resourceCells + S)
requiredPickups = checked(mapArea * initialMintGenerations * initialSoftMaximum
                       + resourceCells * resourceMaximum
                       + S * strongMaximum
                       + existingSupplyPickups)
```

排他 stop不生成 stop上的机会；stop饱和到0时没有 phantom wave；F0有合法的逻辑零机会预算；停止提前、容量不足、Native拒绝、桶/砖选择、资源阈值及随机概率都不减少发行上界。该式计数逻辑机会，并不声称每个机会都实际发行。正常 Tick可能错过机会或Native未可用，只能降低实际发行。

`resourceMaximum`取现有六个资源行真实 Maximum最大值，不用固定概率：默认Gold为skills-on4/off3，Strong为on6/off5。对 DropPermille==0或特定奖励真正禁用的行只按现有共享规则排除那项；任何非零概率均按完整可能奖励计数，不能按1/6、0.2折扣。

补齐合法UGC初始软砖奖励：真实 `BomberTerrainTransactions.Server.cs:280` 对初始未绑定 softBrick同样调用 SoftOuter/Middle/Core的Maximum，不能永远假定每初始格只出1个。私稿以三个Soft行实际最大值乘旧保守 mapArea；默认三行均1，因此原Resource10期待1351/1106、807/698、391/386全部不变。若UGC把Soft改成现共享规则支持的2random+special+gold，则初始上界on4/off3，并要求配置真实提供相应pickup容量。

旧ordinary bomb计算、至少inventory cohort、危险/退休、+128地形保留、所有 ValidateProducers guard、M2/19/8-slot边界、Supply/Frenzy完整义务和错误策略逐字保留；script断言从 CeilingDivide到文件尾与当前源相同。没有改上游公开 Reserved8。

数学审计（Node独立枚举，不是C#或Native）比对66368个F/stop/R组合与逐机会枚举一致；另覆盖F0、F==stop、stop0、O0、1tick interval及ulong溢出。关键值：

| 配置 | 整局Chest发行上界 | pickup on/off |
| --- | ---: | ---: |
| 默认420/115/lead60，F8/R8/O2 | 245 | 1351 /1106 |
| 240/115/lead20，F8/R8/O2 | 109 | 807 /698 |
| F==stop、或stop0、或O0 | 5 | 391 /386 |
| 默认F0/R8 | 253 | 1383 /1130 |
| 默认F0/R1tick | 39205 | 157191 /117986 |
| 480/90/lead60，F8/R8/O2 | 333 | 1703 /1370 |
| 默认且初始Soft奖励on4/off3 | 245 | 2434 /1828 |

这是全有效tick参数的checked公式，不是完整UGC Native验收。当前 Regeneration.Validate仍Legacy19、O<=2；F0已另slice真实六例通过。O>2曾被旧Calculator接受却被真实producer拒绝的差异仍须披露，私稿没有擅自放开该Nativeguard。

## 必须拆开的两种容量

现 `ObjectBudgets.ChestLimit` 被原Resource10要求245/109，用于全局 Native出生信用（IceBridge.CanBirth），又被 Bomb.InspectChest/ValidateStorage当每弹历史长度。两种语义不能继续混用。

最小候选保留 `ChestLimit`作为global lifetime ceiling及原断言；在Game自己的预算record尾追加 `PerBombContactLimit`，值取实际 `new BomberBombState().ContactedChests.MaxCapacity`。这是普通Game配置值，不是公共wire字段或ECS persist声明。私稿当前仍读真实5，不伪装成已52。

待Root授权发行时，只有Bomb.InspectChest/ValidateStorage的两处长度检查改用PerBombContactLimit；全局CanBirth继续用ChestLimit。窄patch私稿已列出。不得用另一store绕过公共ContactedChests.Count==6断言，也不得用整局333或固定Power6选每弹物理literal。52仍依赖单调frontier、完整恢复负控、高Power真实pending、固定origin/map/power及每坐标不会再次接受新完整ChestID的全部前提；本交回不宣称这些前提已全部通过。

## 官方API：同字段5扩52不能做旧LWM兼容迁移

实际公开API调查源为 Runtime commit `23356eafc365c753b6e8d9987fd069815ff067ce`。九个相关文件与 complete07复制的Runtime源全部逐字同SHA，见 `api-proof.json`，无需推断API版本。

1. `WorldCreationOptions.cs:12`只有Snapshot/RuntimeOnlySnapshot等原字节输入，没有Game migration或reader-transform callback。
2. `WorldManager.Lifetime.cs:118`内部PrepareInitializeData读 canonical记录，再由内部HydrateRows恢复；没有把可改的 reader交给Game的公开入口。
3. `World.Residency.cs:71`内部创建实际SnapshotReader，逐组件执行Generated.RestorePersist，全部字段恢复以后才OnHydrate。
4. 现官方生成的 `BomberBombState.g.cs:454`读 contactedChests后直接ISyncContainer.AssignFromRemote。CodeEmitter.cs:801生成同样的显式接口body，无作者pre-restore hook。
5. `SyncTypes.cs:509`解析真实容器string，通过DecodeStoredList→DecodeListPayload。`WireCodec.ContainerDelta.cs:78`强制canonical maxCapacity==当前声明capacity，否则FormatException("bad_delta_envelope")。这在任何Game OnHydrate之前。
6. `IPersistReader`是公开只读接口；不能从存在该接口推出WorldCreationOptions支持替换真实reader。schema-identity的Node迁移只管理声明身份和历史，不能迁移LWM实体内容。

因此**保持同 contactedChests身份而把5改52，不能仅靠当前已生成Game声明和现公共恢复接缝让真正oldcap5 immutable LWM恢复成功**。这不是需要放松canonical验证的Runtime缺陷。本方案不用手改generated、反射写Runtime内部、补丁canonical JSON或冒充Game migration API；也不用OnHydrate写新债务来覆盖解码失败。

可执行备选是新的明确breaking GameReleaseId：旧Release继续保存/读回旧原件；新Release对旧cap5原件明确拒绝，任务不承诺旧活动局重启兼容。父仓architecture要求已发布产品不可原改、破坏性Schema新Release，此路线符合该边界。52只是测试候选，正式容量选择是另一个尚未完成的决策。

## 先行验证与正式依赖

五个全新PRIVATE未编译case：`BomberContactReleaseBoundaryTests`三个Fact（SHA `698b72cbba2ab2bfcb1ecb4d4c06ee05bce4d9fc1f5d4846ddd6ff9526cf827a`）与 `BomberContact52StorageCohortTests`两个Inline（SHA `bc1885881446c1bf28aa6c32c37c4d7c8b4455ac272c9a40f74c94dfc78314e4`）。它们没有覆盖或改旧测试。

- typed公开ISyncContainer对实际原件中**未改的**235-byte JSON，capacity52明确抛bad_delta_envelope，保留candidate.Count0及原档SHA。
- 新声明真实whole-world restore旧21487-byte原档，原O0导出应仍RequiredPickups391；精确要求官方WorldInitializationFailed的FormatException/bad_delta_envelope，不能把更早budget/Effect前置失败算同项通过。
- 新52容器实际发布52完整Chest IDs，原globalChestLimit5保持，证明每弹和全局预算分离；实际官方Capture/Restore/recapture全字节相等并保存artifact/config。该项是ECS storage/codec证据，不是Native blast path。
- 两个actual ECS storage cohort拟2784bomb/1703pickup/336wall和3032/1714/336，52完整触碰、每弹8真实life pending hit column、fullsource真实tuple；真正Capture总bytes与默认64MiB、每blob与默认1MiB比较并Restore。没有ManualBytes冒充测量。

两个cohort复用已有私稿方法且把物理contact从333改52，globalChestLimit333保留对应480/90源公式。未运行、未测量新的完整record大小。它们仍**不包含真实Native pending terrain、未知Original、完整FireTrail/Barrel/Frenzy/Supply/Bridge debt、finite Effect live/identity/result及所有rule-memory最坏共同存在**，所以不能把cohort通过叫作全正式对象组合上界证明。完整worst capture仍必须Root安排实际producer/恢复矩阵。

建议Root接下来的独立切片顺序：

1. 先收完当前continuation11真实RED→同测试GREEN与独审；证明几何前提，再决定contact物理数值。
2. 公式/奖励helper/两个Bomb消费点按当前真RED10实施；完整保留Resource10断言。原105的旧pickup常数需单独窄期待迁移（默认639→1351、skills-off634→1106、480703→1607、composite727→1703等），不能删除guard、删除profile或改测试去适配坏公式。
3. 官方作者默认max_pickup703至少要提高到42单独profile已证明1607；480+final90的组合1703仍要求明确override。F0/短interval/初始Soft UGC继续由真实formula计算并要求对应配置信用；1607是实际发布默认，不代替算法或定义整个UGC合法范围。所有源profile完整Reader/export校验，原table shape和历史保持。
4. 容量与breaking新Release确定后，一次正式v15声明/身份迁移与官方双端生成。只改实际被批准的contact max，不新增私有公开wire。保留v14 predecessor/全部retirement页原字节，按现v14分页工具模式追加breaking transition、保留旧max5身份shape、验证前史/幂等/独立drift；v14 schema/model证据和失败原件不删。工具当前枚举只到v14，不能不改作者模型就假称v15全Schema通过。
5. 实际执行上述old5 negative、新capacity whole-world positive、typed codec与cohort。所有64MiB record、1MiB blob、8MiB Effect section和Game schema输入限额保持。8MiB Effect section与8MiB schema审计输入是不同限额，分别验证，不能用一项通过代替另一项。
6. 最后完整Native启动/生产/恢复和并发义务最大记录字节证明；公式static/5私稿并不提前解开正式M2guard。

## 身份与收口

Calculator实际源仍 `2b2285078879efd035bfe4fd70840fadf60cb1034c860ded9fd76b4701cad94a`；RewardRules仍 `adc70bbcd8e9e89b40799997880f48045d8174690e9031f87d0a3e7a5421feac`；原Resource10仍 `2d84fa9f0cb161c9e74a2ccd37ecec828f9a947be1cf5b6ca12b4d709ac0aa8b`；原105仍 `935511ee1e140dbc9a73516285314d1b164328d29169bce43ffdcbba63390787`。private输入fence看到Root自己的BombState.Server continuation修复从392b到后续c403交叉变动，本作者没写该文件，故不声称当前全部域0drift。

一处私稿机械拼接前置错误（cohort header误取全旧文件）已修，错误前像 `BomberContact52StorageCohortTests.cs.private-header-01.before` 保留；脚本现验证候选class唯一、只有两个Inline，没有带入旧class/helper。这没有编译或Native执行，不是business RED。

所有C#私稿仍UNRUN。私稿、Node proof、API hash/行证据和完整manifest在父仓 `.run/resource-chest-budget-formal-formula-draft-01/`。停止写入编译输入与生产域；交回后的实际发行需Root独立裁定、串行窗口及证据。
