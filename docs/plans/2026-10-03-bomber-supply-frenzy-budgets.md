# Bomber Supply and Frenzy Budgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已知有限中央补给及狂暴发行加入Game对象最低预算，拒绝低配和未计量的来源配置，保持旧普通弹/Split及正式M2守卫。

**Architecture:** 在Game拥有的Calculate中保留原ordinary公式，只加一个私有Supply/Frenzy边界函数。边界按实际作者字段和Engine Tick换算计算：补给以一局一次的完整发行量计pickup；Frenzy以配置来源份数乘每个有限窗口最大接受次数计bomb，包括尚未发布、跨生命及未知退休的同一信用。已有硬容量admission继续检查实际live与promise，不替代作者预算校验。

**Tech Stack:** C#/.NET Game Config calculator、xUnit v3、真实LumioConfig作者CLI、固定官方完整包06私有runner；本轮仅只读与文档。

## Global Constraints

- 当前支持P=8、19×19、LegacyPillars；Map/M2、Fire、Split及其他未知producer守卫原样保留。不得改Public MaxReservedSlot8或Runtime/Client冻结。
- 旧普通bomb项及`+128UL` Split预付逐字保留，不借此次修正重算历史。当前default最低Bomb2624、Pickup639、FireZone336。
- ADR0048正式中央补给每局一次、一份Frenzy糖、6秒窗口、1.2秒引信、最多6 Fuse并发、相邻至少5Tick；23/27默认开启，19官方关闭。当前支持范围仍只允许明确UGC开启Legacy19，不能因此放行正式M2。
- 现作者schema只规定FrenzyCount≥0、总Supply新owner最多11条，未把FrenzyCount锁到1；UGC可用2份甚至11份有限来源。正式1份不能冒充所有支持作者配置的上界。
- 技能flag关闭省略Special位；Frenzy是独立flag，不随skills_enabled关闭。活动Frenzy重复糖被拒绝并留地，过期后可再拾取，因此多份来源可以依次生效，不能按「只会一个人捡一次」折扣。
- 所有数量非负、作者总Supply≤11、announce<open<match duration；还须在真实Tick转换后保持announceTick<openTick<matchTick。Frenzy并发1..6、间隔≥5Tick、duration/fuse至少1有效Tick。
- 禁止用平均、概率或2Tick必然退休假设折扣。正常retirement推导与unknown安全发行界分列；未知promise不释放、死亡/后继不重置旧信用。
- 不提高任何正式configMax作为修法；测试可用更低的exact minimum/minimum−1证明判定边界。超过既有max的合法作者组合必须拒绝并报告required/provisioned。
- 本轮不修改生产、测试或生成物、不执行作者export或C#/Rust重型检查、不提交。Root收口执行窗和对应source归属后才能执行TDD。

## 已读取真值和源码身份

根`.spec/AGENTS.md`、知识导航、101入口及testing；ADR0048 `.spec/decisions/0048-bomber-m2-map-packages-and-interaction-boundaries.md`；design§8.5/8.6；实际文件均相对`games/101-bomber/`：

| 文件 | 读取时SHA256 |
|---|---|
| `Gameplay/Config/BomberObjectBudgets.cs` | d0a5314813c931971dba301a9765f761d0c748396975a17f08fc50053c81e415 |
| `Gameplay/BomberFrenzy.Server.cs` | 4a2c74b956b70067e9c5242341e292fdfc70bdc0f604d804c1035982a4546c80 |
| `Gameplay/BomberFrenzy.cs` | 5f36baaabf43d30b80482beb234df9ce93e81aa8c9e75f94107095815cf25385 |
| `Server/Tests/Gameplay/BomberObjectBudgetTests.cs` | f7fa1afca72921b6f33f699cd29c09164478e9d60dc368189868b89395a9eb1c |

Calculate目前根本没有读Supply/Frenzy字段。`BomberFrenzy.StartFromApplied`由原始Applied health fact tick `a`建立until=`a+T`，`IsActive`要求until>world.Tick。首次生产不能早于a，实际Applied观测/输入可能更晚，只会缩短窗口；last placement clock保留在Participant，跨life的promise仍参与Concurrent。Concurrent只数**Fuse+未发布promise**，Danger已经释放这项6名额。

`BombSystem.Server.cs`退休循环在Terrain.HoldsSource、FireExposure.HoldsSource或HitStates.Pending时continue。没有任何正式2Tick完成证明，Root已确认不能用slack当释放保证。`BomberBombAdmissions`统一计actual live、Frenzy ReservedCount与未发布结构order；published promise与live必须是同一信用，不再加一套6或按新生命乘人数。

当前Frenzy表行为：kind_code7、SoftWeight0、AttributeName=None、LedgerMode=Frenzy。ResourceRewards的随机位会遍历全部SoftWeight>0行；若作者把Frenzy权重改成1，就产生未计量的积木/箱来源，必须拒绝，不能继续以CentralSupplyFrenzyCount作为唯一来源计数。默认箱、死亡掉落不显式产生Frenzy；后续新增其他producer必须另算其完整发行数。

`ValidateBomb`还允许barrel-token的炸弹保留Frenzy自免标记，但它们是Barrel的独立生产，不属于本24次primary界。当前supported Legacy配置的`blocks.barrel.enabled`仍受既有unknown-block guard拒绝；不得为通过预算测试移除该守卫。将来正式M2/Barrel开启必须在对应producer完整预算中计它们，不能因为Frenzy标记相同而挤进本primary额度或漏计。

## 公式与数值推导

用Engine `Ticks.FromMilliseconds`（向下整Tick）得到T=FrenzyDurationTicks、F=FrenzyFuseTicks、D=ordinary DangerTicks；I=FrenzyMinPlacementTicks，S=retirement slack，C=并发limit。`CeilDiv(x,y)=x/y+(x%y==0?0:1)`，避免`x+y−1`的加法溢出。

1. **原ordinary项O**：`P*(max(attributeCapacity,R*ordinaryFuseTicks)+R*(D+S))+128`。默认P8/R6/Fuse42/D8/S2得`8*(252+60)+128=2624`。+128仍在其中，不把它拿来充新Frenzy。
2. **Supply pickup项Q**：SupplyEnabled时`Strengthening+Health+Frenzy+(SkillsEnabled?Special:0)+GoldenHeart`，否则0。保留全部信用，不因已捡、已死、概率、缺落点或submitted状态减少作者发行界。默认开skills为11，关skills为9。
3. **每来源正常尾部N**：`min(CeilDiv(T,I), C+CeilDiv(D+S,I))`，默认T120/I5/C6/D8/S2，得`min(24,6+2)=8`。这里6包括Fuse与未发布promise；Danger/retirement为另一cohort，不把6当一生发行数。仅用于解释正常情形，不能作为unknown预算。
4. **每来源完整界W**：`CeilDiv(T,I)`，窗口严格`[a,a+T)`，默认允许a,a+5,…,a+115共24次；a+120不活跃。若首次投弹a+δ，最多`CeilDiv(max(T−δ,0),I)`，所以24是保守上界。自然爆炸可补；未知Fusepromise会占6名额，未退的Danger可累计，因此全部24 accepted intents均可能仍占同一份live/promise信用。无需再额外加6。
5. **支持配置实际来源K**：`SupplyEnabled && FrenzyEnabled ? CentralSupplyFrenzyCount : 0`。启用Supply且Count>0却关闭Frenzy消费者应拒绝，不能发行无法消费的糖。Supply关闭时默认保留 dormant Count1/Enabled=true参数，新增项0；disable不是清除旧promise的授权。正向restore仍锁同一config release，不能通过换一份关闭源的配置来丢弃旧债务。
6. **新增bomb项B**：`K*W`，最终RequiredBombs=`checked(O+B)`；RequiredPickups=`checked(oldPickup+Q)`；FireZone不变。K2为48，K11为264，不乘P8，也不能把可依次拾取的来源漏算。

| 有效作者配置 | O | Q | K/W | RequiredBombs | RequiredPickups | 既有max下结果 |
|---|---:|---:|---:|---:|---:|---|
| 默认19：Supply false、skills true |2624|0|0/24|2624|639|旧行为保持 |
| UGC：Supply true、skills false、默认五组数 |2624|9|1/24|2648|643|max2784/703内 |
| UGC：Supply true、skills true、默认五组数 |2624|11|1/24|2648|650|算术在max内，既有其他producer守卫仍保留 |
| UGC：skills false、Frenzy2、GoldenHeart0、其余默认 |2624|9|2/24|2672|643|多份来源完整计量 |
| UGC：skills false、只有Frenzy11 |2624|11|11/24|2888|645|拒绝required2888>provisioned2784 |
| UGC：默认来源1、Duration6050ms→121Tick |2624|9|1/25|2649|643|按实际配置，不能硬套24 |

正式默认参数由正式profile固定；当前schema允许UGC修改duration/fuse为其他uint值，consumer实际读取它们。Calculator必须按真实值计，不偷偷把所有UGC当6秒/1.2秒。全输入有效性在disabled时也检查，符合现有Dormant producer参数纪律；formal1份与6秒只约束正式档，不凭空限制既已接受的UGC来源数。

## 文件写域与接口

- Modify：`games/101-bomber/Gameplay/Config/BomberObjectBudgets.cs`；唯一生产写域，只增加私有界函数与两处checked追加，旧guard和old公式保持。
- Test：`games/101-bomber/Server/Tests/Gameplay/BomberObjectBudgetTests.cs`；新增作者边界/全来源拒绝测试，旧profile、Remote、composite、overflow原断言不删除或宽化。
- Read-only：Game表schema/作者表、TypedTables与生成物、Frenzy/Pickup/BombSystem、所有Native/Runtime/Client产物和Public槽上限。

新增私有接口：

```csharp
private static (ulong Pickups, ulong FrenzyBombs) SupplyFrenzyBounds(BomberTypedTables tables);
private static ulong CeilingDivide(ulong value, ulong divisor);
```

不改变public BomberObjectBudgets record构造顺序和外部Calculate签名。没有新的存储账、Native接口或budget覆盖配置。

---

### Task 1: 作者来源与容量边界的真实RED

**Files:** `Server/Tests/Gameplay/BomberObjectBudgetTests.cs`，授权后新增测试；本轮不写。

**Interfaces:** 使用现有AuthoredFixture.Change/Compile与BomberConfigBinding.Read。Compile是真实作者CLI，它保留输入/输出/compile.log；Read在world attach之前运行实际calculator，不需伪造Native帧或预算服务。

- [ ] **Step 1: 加入下列完整新增测试。** 第一Theory覆盖两个最低数的minimum−1与exact；均低于正式max2784/703，没有提高max。

```csharp
[Theory]
[InlineData("max_bomb_entities", 2647, 2648, true)]
[InlineData("max_bomb_entities", 2648, 2648, false)]
[InlineData("max_pickup_entities", 642, 643, true)]
[InlineData("max_pickup_entities", 643, 643, false)]
public void SupplyFrenzyMinimumBoundariesUseWholeIssuance(string field, int provisioned, int required, bool reject)
{
    using var fixture = new AuthoredFixture(
        ("game", "default", "central_supply_enabled", "true"),
        ("game", "default", "skills_enabled", "false"),
        ("object_budgets", "default", field, provisioned.ToString(CultureInfo.InvariantCulture)));
    string directory = fixture.Compile();
    if (reject)
    {
        var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(directory));
        Assert.Contains($"required={required}, provisioned={provisioned}", error.Message, StringComparison.Ordinal);
    }
    else
    {
        var config = BomberConfigBinding.Read(directory);
        Assert.Equal(2648, config.ObjectBudgets.RequiredBombs);
        Assert.Equal(643, config.ObjectBudgets.RequiredPickups);
        Assert.Equal(336, config.ObjectBudgets.RequiredFireZones);
    }
}

[Theory]
[InlineData(false, true, 2624, 639)]
[InlineData(true, false, 2648, 643)]
[InlineData(true, true, 2648, 650)]
public void SupplyFrenzyEnableAndSkillFlagsProduceIndependentBounds(bool supply, bool skills, int bombs, int pickups)
{
    using var fixture = new AuthoredFixture(
        ("game", "default", "central_supply_enabled", supply ? "true" : "false"),
        ("game", "default", "skills_enabled", skills ? "true" : "false"));
    var config = BomberConfigBinding.Read(fixture.Compile());
    Assert.Equal(bombs, config.ObjectBudgets.RequiredBombs);
    Assert.Equal(pickups, config.ObjectBudgets.RequiredPickups);
}

[Fact]
public void SupplyFrenzyTwoSequentialCandySourcesRequireFortyEightAcceptedBombCredits()
{
    using var fixture = new AuthoredFixture(
        ("game", "default", "central_supply_enabled", "true"),
        ("game", "default", "skills_enabled", "false"),
        ("game", "default", "central_supply_frenzy_count", "2"),
        ("game", "default", "central_supply_golden_heart_count", "0"));
    var config = BomberConfigBinding.Read(fixture.Compile());
    Assert.Equal(2672, config.ObjectBudgets.RequiredBombs);
    Assert.Equal(643, config.ObjectBudgets.RequiredPickups);
}

[Fact]
public void SupplyFrenzyElevenSupportedSourcesAreRejectedByTheUnchangedFormalMaximum()
{
    using var fixture = new AuthoredFixture(
        ("game", "default", "central_supply_enabled", "true"),
        ("game", "default", "skills_enabled", "false"),
        ("game", "default", "central_supply_strengthening_count", "0"),
        ("game", "default", "central_supply_health_count", "0"),
        ("game", "default", "central_supply_special_count", "0"),
        ("game", "default", "central_supply_golden_heart_count", "0"),
        ("game", "default", "central_supply_frenzy_count", "11"));
    string directory = fixture.Compile();
    var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(directory));
    Assert.Contains("required=2888, provisioned=2784", error.Message, StringComparison.Ordinal);
}

[Fact]
public void SupplyFrenzyUsesTheExclusiveEndTickAndActualConfiguredDuration()
{
    using var fixture = new AuthoredFixture(
        ("game", "default", "central_supply_enabled", "true"),
        ("game", "default", "skills_enabled", "false"),
        ("game", "default", "frenzy_duration_ms", "6001"));
    Assert.Equal(2648, BomberConfigBinding.Read(fixture.Compile()).ObjectBudgets.RequiredBombs);
    fixture.Change("game", "default", "frenzy_duration_ms", "6050");
    Assert.Equal(2649, BomberConfigBinding.Read(fixture.Compile()).ObjectBudgets.RequiredBombs);
}
```

- [ ] **Step 2: 固定输入与test SHA，运行真实作者RED。** 只有Root授予heavy窗口时运行。从父仓用现有隔离runner，不能从旧编译DLL假定新测试已发现：

```powershell
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Mode build -Label 'supply-frenzy-budget-red-build-01'
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-frenzy-budget-red-01' -Filter '*BomberObjectBudgetTests' -Method '*SupplyFrenzy*'
```

本Task新增10个cases（4+3+1+1+1）。当前旧calculator预期9红1绿：仅disabled Source profile保持2624/639；Duration Fact的第一断言也会因当前未计新增24而红。所有真实计数以日志为准。minimum−1当前错误接受，应是Assert.Throws失败；exact当前RequiredBombs2624/RequiredPickups634不匹配。必须保留actual firstfail与raw child exit，作者export失败/Native init/zero tests都不是这一业务RED。

### Task 2: 最小checked追加及所有来源参数拒绝

**Files:** 仅`Gameplay/Config/BomberObjectBudgets.cs`与该测试类。

**Interfaces:** 消费当前Generated GameRow/PickupKindsRow属性，输出tuple；public contract不变。TypedTables已有新字段则直接读，缺字段先交Root生成owner，不手改生成Reader。

- [ ] **Step 1: 加入全来源和整数边界测试，再保存同测试hash RED。** 完整测试如下：

```csharp
[Theory]
[InlineData("game", "default", "central_supply_open_ms", "50000", "central_supply")]
[InlineData("game", "default", "central_supply_open_ms", "420000", "central_supply")]
[InlineData("game", "default", "central_supply_strengthening_count", "8", "central_supply")]
[InlineData("game", "default", "frenzy_duration_ms", "49", "frenzy_duration_ms")]
[InlineData("game", "default", "frenzy_fuse_ms", "49", "frenzy_fuse_ms")]
[InlineData("pickup_kinds", "Frenzy", "soft_weight", "1", "Frenzy")]
[InlineData("pickup_kinds", "Frenzy", "kind_code", "8", "Frenzy")]
[InlineData("pickup_kinds", "Frenzy", "ledger_mode", "Heal", "Frenzy")]
[InlineData("pickup_kinds", "Fire", "kind_code", "7", "Frenzy")]
[InlineData("game", "default", "central_supply_strengthening_count", "2147483647", "central_supply")]
public void SupplyFrenzyRejectsUnmeteredOrInvalidAuthoredSources(string table, string row, string column, string value, string diagnostic)
{
    using var fixture = new AuthoredFixture((table, row, column, value));
    string directory = fixture.Compile();
    var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(directory));
    Assert.Contains(diagnostic, error.Message, StringComparison.OrdinalIgnoreCase);
}

[Fact]
public void SupplyFrenzyDisabledConsumerCannotBeAnEnabledCandySource()
{
    using var fixture = new AuthoredFixture(
        ("game", "default", "central_supply_enabled", "true"),
        ("game", "default", "frenzy_enabled", "false"));
    string directory = fixture.Compile();
    var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(directory));
    Assert.Contains("central_supply_frenzy_count", error.Message, StringComparison.Ordinal);
    fixture.Change("game", "default", "central_supply_frenzy_count", "0");
    var disabled = BomberConfigBinding.Read(fixture.Compile());
    Assert.Equal(2624, disabled.ObjectBudgets.RequiredBombs);
    Assert.Equal(649, disabled.ObjectBudgets.RequiredPickups);
}

[Fact]
public void SupplyFrenzyVeryLargeFiniteWindowCannotWrapTheRequiredBombCountToAnInt()
{
    using var fixture = new AuthoredFixture(
        ("game", "default", "tick_rate_hz", "1000"),
        ("game", "default", "central_supply_enabled", "true"),
        ("game", "default", "skills_enabled", "false"),
        ("game", "default", "central_supply_strengthening_count", "0"),
        ("game", "default", "central_supply_health_count", "0"),
        ("game", "default", "central_supply_special_count", "0"),
        ("game", "default", "central_supply_golden_heart_count", "0"),
        ("game", "default", "central_supply_frenzy_count", "11"),
        ("game", "default", "frenzy_duration_ms", uint.MaxValue.ToString(CultureInfo.InvariantCulture)),
        ("bomb", "default", "fuse_ms", "1"),
        ("bomb", "default", "danger_ms", "1"));
    string directory = fixture.Compile();
    var error = Assert.Throws<InvalidOperationException>(() => BomberConfigBinding.Read(directory));
    Assert.Contains("required=9448928369, provisioned=2784", error.Message, StringComparison.Ordinal);
}
```

int案例：T4294967295/I5向上整=858993459；×11=9448928049，ordinary=8*(6+18)+128=320，相加9448928369。它在ulong内，却超过任何int容量；应显示真实required且拒绝，不能cast截断。1000Hz是calculator整数边界输入，本测试不创建World、不把它当声明Tick20的正式Native profile。保留既有`ArithmeticOverflowIsRejected`，其uint极大tickrate/普通producer乘法会真实ulong溢出，仍需原统一InvalidOperationException+OverflowException inner行为。

Schema已直接限制的负count、concurrent0/7、interval4另由真实CLI拒绝测试覆盖；不能把Writer先拒绝的case记成calculator业务RED。C#仍防御检查，避免被disabled flag掩盖坏字段。Supply总量使用ulong求和，`int.MaxValue`作者count应明确>11拒绝，而非先把int sum溢出。

- [ ] **Step 2: 添加完整私有函数。** 所有参数在disabled时也验证；允许多个已计量的UGC来源，不新增正式profile参数或改max。

```csharp
private static ulong CeilingDivide(ulong value, ulong divisor)
{
    if (divisor == 0) throw new InvalidOperationException("Frenzy interval must be positive.");
    return checked(value / divisor + (value % divisor == 0 ? 0UL : 1UL));
}

private static (ulong Pickups, ulong FrenzyBombs) SupplyFrenzyBounds(BomberTypedTables tables)
{
    var game = tables.Game.Rows.Single();
    var counts = new[] { game.CentralSupplyStrengtheningCount, game.CentralSupplyHealthCount,
        game.CentralSupplyFrenzyCount, game.CentralSupplySpecialCount, game.CentralSupplyGoldenHeartCount };
    ulong total = 0;
    foreach (int count in counts)
    {
        if (count < 0) throw Invalid("game.central_supply_counts", count);
        total = checked(total + (ulong)count);
    }
    if (total > 11) throw Invalid("game.central_supply_counts", total);
    ulong Tick(uint ms) => Ticks.FromMilliseconds(ms, game.TickRateHz);
    ulong announce = Tick(game.CentralSupplyAnnounceMs);
    ulong open = Tick(game.CentralSupplyOpenMs);
    ulong match = Tick(game.MatchDurationMs);
    if (game.CentralSupplyAnnounceMs >= game.CentralSupplyOpenMs ||
        game.CentralSupplyOpenMs >= game.MatchDurationMs || announce >= open || open >= match)
        throw Invalid("game.central_supply_schedule", "announce < open < match in milliseconds and effective ticks required");
    ulong duration = Tick(game.FrenzyDurationMs);
    ulong fuse = Tick(game.FrenzyFuseMs);
    if (duration == 0) throw Invalid("game.frenzy_duration_ms", game.FrenzyDurationMs);
    if (fuse == 0) throw Invalid("game.frenzy_fuse_ms", game.FrenzyFuseMs);
    if (game.FrenzyConcurrentLimit is < 1 or > 6)
        throw Invalid("game.frenzy_concurrent_limit", game.FrenzyConcurrentLimit);
    if (game.FrenzyMinPlacementTicks < 5)
        throw Invalid("game.frenzy_min_placement_ticks", game.FrenzyMinPlacementTicks);
    var frenzy = tables.PickupKinds.Rows.Where(row => row.Name == "Frenzy").ToArray();
    if (frenzy.Length != 1 || frenzy[0].KindCode != 7 || frenzy[0].SoftWeight != 0 ||
        frenzy[0].AttributeName != "None" || frenzy[0].LedgerMode != "Frenzy" ||
        tables.PickupKinds.Rows.Any(row => row.KindCode == 7 && row.Name != "Frenzy"))
        throw Invalid("pickup_kinds.Frenzy.source", "one fixed kind7/None/Frenzy row with zero random-pool weight required");
    if (!game.CentralSupplyEnabled) return (0, 0);
    if (game.CentralSupplyFrenzyCount > 0 && !game.FrenzyEnabled)
        throw Invalid("game.central_supply_frenzy_count", "enabled source has disabled consumer");
    ulong pickups = checked(total - (game.SkillsEnabled ? 0UL : (ulong)game.CentralSupplySpecialCount));
    ulong sources = game.FrenzyEnabled ? (ulong)game.CentralSupplyFrenzyCount : 0UL;
    ulong perSource = CeilingDivide(duration, game.FrenzyMinPlacementTicks);
    // Every accepted placement is one retained live/promise credit even if retirement is unknown.
    return (pickups, checked(sources * perSource));
}
```

- [ ] **Step 3: 仅把返回值checked追加到旧formula。** 放在现有`requiredWalls`计算之后、RequireCapacity之前；原ordinary和+128原行不改、原M2/producer validation位置不动：

```csharp
var supplyFrenzy = SupplyFrenzyBounds(tables);
requiredBombs = checked(requiredBombs + supplyFrenzy.FrenzyBombs);
requiredPickups = checked(requiredPickups + supplyFrenzy.Pickups);
```

保持RequireCapacity在checked(int)return之前，避免把大required cast截断。既有Calculate wrapper保留真实OverflowException包装；不吞下异常、不自动提高Rule.Max。

- [ ] **Step 4: 同测试hash fresh GREEN与全旧profile回归。** 新两Task合计22新增cases（10+10+1+1）。纯作者子集预期22运行/22passed/0failed/0skip/child0；完整旧类另记实际计数，真实Native warmup case当前受官方Reducer OperationValidation阻塞时单列，不能宣称完整类绿。

```powershell
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Mode build -Label 'supply-frenzy-budget-green-build-01'
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-frenzy-budget-green-01' -Filter '*BomberObjectBudgetTests' -Method '*SupplyFrenzy*'
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-frenzy-budget-existing-01' -Filter '*BomberObjectBudgetTests'
```

旧EveryShippedProfile仍需保持六个M2 profiles因map.layout_kind明确拒绝；旧Remote2624、独立profile、composite、Fire/Split dormant、overflow原断言保持。不会更新现有正式作者max2784/703/336；合法但超额UGC仍拒绝。

### Task 3: 实际生产/跨生命对账与交回

**Files:** owning预算报告、Root最终组合证据；Frenzy生产若被实际失败证明有bug交原owner，不借预算修正改消费者。

**Interfaces:** 原`BomberFrenzy.ReservedCount/Concurrent`（private语义）、实际published Bomb rows、Participant持久clock与promise、实际Native WorldManager.Tick。预算plan不生成声明，不把当前Native启动阻断当budget业务失败。

- [ ] **Step 1: Root恢复Native业务入口后复跑已有Frenzy实际用例及Source消费回归。** 原生产用例`ActualFrenzyProducesMoreThanSixOverItsWindowAndReplenishesAfterNaturalExplosions`证明6不是一生数量；`NaturalTailBombRemainsSelfImmuneAfterFrenzyExpiresAndEnemyBombStillAppliesDamage`、`ActualPublishedFrenzyKeepsItsExactSourceFuseAndParticipantClockAcrossPairedRestore`及死亡后继/unknown negative必须保留。命令如下，实际count作为证据：

```powershell
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-frenzy-budget-native-01' -Filter '*BomberFrenzyProductionTests'
& 'games/101-bomber/.run/run-v14-native-production.ps1' -Label 'supply-frenzy-budget-promise-01' -Filter '*BomberBombPromiseReplayTests'
```

- [ ] **Step 2: 在真实两份UGC来源组合中观察顺序拾取，不改变源配额。** Source creator经真实Tick发行2个Frenzy糖，第一Applied后第二留地；直到第一until的末Tick仍active且第二拒绝；until那Tick关闭旧窗口，第二在其真正Applied tick建立新until。记录两原始item IDs、Applied fact IDs、每窗口实际placed序列，相邻≥5；旧life/dormantpromise/lateDanger仍占原信用，newLife不继承自免。该组合用当前完整Native blocked状态不能执行，报告只列待Root运行，不提前填绿色结果。
- [ ] **Step 3: 数学上界与真实计数保持不同证据类别。** 本budget20项验证作者数值与拒绝，不证明已在Native实际投满24次或完整11来源；若需要actual24 placement stress，必须自然World.Tick/GAS输入，不能用直接调用StageAndCreate/赋FrenzyUntil假造完整产品证据。迟到源持有无释放期限的读源证据是采用完整发行界的理由，不创建timeout。
- [ ] **Step 4: 静态格式、精确冻结、Root审查。** source affected formatter与git diff check使用当前官方selection，不回落邻仓；保存首RED/最终GREEN原log、source/test/DLL/manifest SHA、实际counts/skip/childexit。生成物与configMax必须无diff，Runtime/Client冻结不变。Root做独审/提交/新完整正式包，局部作者绿不解除正式M2或public槽裁定。

## 自检与交接

本计划覆盖old ordinary+128、Supply0/9/11一次发行、Frenzy正常8与unknown24分列、截止排除与首投延迟、UGC多来源24*K、跨life同信用、独立disabled flag、随机池逃逸来源拒绝、两个exact下界、configured Tick rounding、ulong算术/超过int容量、全旧profile/守卫回归。

尚未执行：22个新增case、任何生产diff、任何Native组合验证。当前官方OperationValidation启动阻断需Root在正确owner收口，不通过修改Game budget、扩大max或放宽guard掩盖。本计划可独立审查并在Root授权后实施；它没有把前一Supply计划Task4标为完成。
