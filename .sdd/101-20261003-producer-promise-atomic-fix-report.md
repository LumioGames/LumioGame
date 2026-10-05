# Producer promise 原子提交与桶来源修复

2026-10-03。状态：Root授权的四个生产helper与新增专属test源已完成低内存窄写；逐段静态核对完成，等待Root串行build/Native。没有执行.NET/Rust/Native/GEN/formatter，没有提交或改原八项RED断言。此报告不宣布GREEN或完整Game通过。

## 原始真实RED与消费身份

全部原运行来自 `games/101-bomber/.run/v14-native-production-20261003/`、同一次fixed build10。build10 exit0、0 warning/error；其log SHA256 `734c7bbcc2e109578340d8468ee304bcb86b0e3f16641efc6246d0c7bdac7384`。已完整读取三份log、解析完整json及作者测试，保留原证据。

| 证据标签 | total / pass / fail / skip / raw child exit | log SHA256 | json SHA256 |
| --- | --- | --- | --- |
| promise-replay-red-01 | 3 / 0 / 3 / 0 / 2 | `867e20a2b8371e45a175c2d7ee37ca4d78ba53dd46cfffa51e3b03ed62f7fdd0` | `35197026ed048349c0da1d8fb43569107595431185ec27f6c5b8827368c2a30d` |
| barrel-promise-review-red-01 | 4 / 0 / 4 / 0 / 2 | `6b949bf0d30388818af0fe07ded2ed63aaa01bbe2c804d9c2679b737c1030dc4` | `411c993d81519dc373387a5dcc68eae2d73c0bf9c176e9c5a1e0582e7a6e0967` |
| frenzy-barrel-original-red-01 | 1 / 0 / 1 / 0 / 2 | `2996bd68d72514d8f790b64db1a175434006a5444a6b97477e2088ce0ecffe06` | `bc6402f19577bcc514a60f78a104f63b741f16d38abde4f6a8f33d7d72a497d2` |

原运行官方complete-release-06 manifest SHA256 `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`，SDK `0.0.4-main.0e2fc74`。Test DLL `fae681d39a68bcc40996f5745d1eec792075f0fa6285833ed2fa7b2c9e985b8d`；Gameplay DLL `7b850bbf9979b328f685d1769ec86aa2ee0774e3630fd82301b0addaa01fe50d`；Ecs DLL `74da7fff23e1aa72b8e8b7d0fd93c8164447c636de47700e254d8404c0648def`；Gas DLL `09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`。没有用这批旧程序集声明本次修复结果。

## 已核根因与最小修复

### 已Submitted信用在新服务中被重投

三个Replay RED均在 `AssertRejectedWithoutMutation` line120报没有抛出异常。原2arg `CreateFromPromise`只要求owner `HasSubmittedPromise`为true，然后用不持久的reservations数组阻止同一服务的重复提交；配对恢复建立新服务，Submitted Unknown来源因而又能进入Commands.Create。持久标记必须表示已经进入不可重试的结构提交，不能当作恢复后创建许可。

新增3arg `CreateFromPromise(World,string,Action persistSubmitted)`：先读live持久owner的**未提交**canonical witness；建立仅用于同调用重入拒绝的暂存gate；同步调用owner持久回写；再读取**已提交**canonical witness，要求除已许可的标记转换外完全一致，且重新检查真实live+future+持久未发布总容量；最后只调用一次Commands.Create。旧2arg始终拒绝，三个生产者全部迁入3arg。

Witness来自实际持久owner，服务cache不能建立来源：Split钉mother完整ID、source participant/life/generation、chain/shape/power、Frenzy、phase/clocks、actual transform/reaches、future/resolved和其他submitted bits，只有当前方向bit被规范化；Barrel钉WorldRuntime完整ID、当前Tick/Match与全部Promise字段，只有CreationSubmitted及当前提交Tick的CreatedAt被规范化；Frenzy钉Participant完整ID、当前life/generation/match、active source/期限/last placement及全部Promise字段，只有CreationSubmitted被规范化。Produced在结构调用后才允许用实际AssignedId写回，callback不能预造它。没有持久化第二份位置或entity census。

Split由callback写当前arm bit。Barrel由callback在exact Original row上写CreationSubmitted=true/CreatedAt=world.Tick。Frenzy先持久false row及原生产时钟，callback在相同record上写true；Read现在允许Produced为空的合法false信用，继续保留原true Unknown且不重投。原Published精确校验及新链爆/Standard/Source检查保持。callback在Commands.Create之前抛错只撤服务gate：false来源仍是已知未提交；若已写true则保留持久债务并禁止重投。进入Commands.Create后异常保留gate与owner Submitted，信用不因计时或服务重建返还。

### 桶first publication与Match缺口

原Barrel四RED分别证明：row.Match较旧仍被codec接受；实际Native-produced publication被改初始位置、PierceLayers=2、Split submitted/resolved=1与future=3，普通bomb storage允许这些状态，但桶来源transfer不应允许。

ValidateRow改为Match严格等于当前Match。RequirePublished继续full source/shape/power3/CapacityReturned/CreatedAt，并增加Frenzy标记、零SkillLevel/HitFamily/ChildDirection及正确PierceLayers。PlacementRecorded=false首次转移必须是Fuse、exact格中心与障碍层高度、原chain与Submitted+100ms due、正确Split future4/零masks、零explosion/danger/burn与kick状态。晚到Original的due允许已经过去，没有重启100ms时钟或伪造更早爆炸。

PlacementRecorded=true后不再强制出生位置或初始Split masks/future，因此正常kick、Split实际子信用转移和已爆炸状态不会被出生检查重验。实际链改变chain/deadline时仍须已有placement记录、Danger/Burn/Expired、正chain与当前爆炸Tick相等的deadline、真实ExplodedAt不早于Placed且不晚于当前Tick。正常转移已移除promise的bomb也不再执行这条首次transfer校验。

### 真实Frenzy来源经过桶丢失自免标记

原FrenzyBarrel RED已通过实际Ability placement、Native桶绑定退场/air及实际barrel-produced bomb查找，失败在line49的Frenzy=true断言。原Promise无该字段，生产child也未写该字段。

在已有有界serialized Promise尾部追加默认false的业务bool Frenzy，Stage直接读取实际原bomb.Frenzy；ValidatePending同原bomb完整SourceLife/Generation一起核该标记。实际Produced写row.Frenzy，RequirePublished精确匹配。Frenzy=true只能是Standard；仍用原Life+Generation自免，不使用当前Participant life或狂暴截止Tick。barrel前缀仍属于独立1credit来源，不纳入frenzy前缀primary六并发，也不退普通inventory。Split实际子来源一并复制/核Frenzy标记，普通合法Split仍为false。

## 持久预算上界

未新增任何ECS Persist字段、Reader、schema或generated声明。Barrel仍最多8 rows、UTF8<=16384；PromiseToken仍UTF8<=128。新bool JSON `,"Frenzy":false`最坏15bytes/row，true为14，八行最大新增120bytes。

不以常见row大小代替最大量。对本record21字段与默认System.Text.Json编码逐项作保守宽度上界：fixed JSON property/punctuation243bytes；8个string的引号16、Token固定prefix57+16个suffix code unit最多96、Transaction固定prefix49+suffix最多96、6个严格32字节hex ID合计192，string项共506bytes；7个ulong最多140bytes、Shape最多1、非负int X/Z最多20、3个bool最多15，scalar项共176。**每行最多925bytes；8行含数组两括号与7逗号最多7409bytes，余量8975bytes。** 这为所有合法行的保守serialization上界，逐项primitive最大宽度同时组合可能不满足时钟语义，不宣称其是可被Native接受的实际来源。

新增专属test用最大primitive-width envelope钉925/7409精确serialized字节，再用八个不同完整本world barrel ID、最大uint64来源宽度/最大suffix escaping与合法codec时钟作Encode边界。该case尚未运行；以上静态上界计算已核，实际System.Text.Json字节断言交Root Native test程序集执行。

## 作者源fence与验证状态

精确写域均在games/101-bomber：

| 文件 | 修复前SHA256 | 修复后SHA256 |
| --- | --- | --- |
| Gameplay/BomberBombAdmissions.Server.cs | `673e1c96f4e7a9efbe77e08bd5077e18d061d078fbc1fcd3287f654d90ae3721` | `f9cdc311d21ba3d86e60daab833872fa1daa51a6d8bf07f906adc7460246b77b` |
| Gameplay/BomberSplitBombs.Server.cs | `987dae0a4b5f88488a1bf46c3aea03af2c8feff33d28da0e1cd84e7cd62306fe` | `15e9f03bcd1608116f8c4427c0b13e2d78d0ca42f8ea81dbe30da5c0d0bc711f` |
| Gameplay/BomberBarrelBombPromises.Server.cs | `347150bfbb01e035f72240f6a224fc1813c713e3cdcf4f1d896731c1cd04975e` | `213e874d2bb3ee32f424a2390873b8fd2ab3ba8ed819fb0569fb57ff41c44c67` |
| Gameplay/BomberFrenzy.Server.cs | `7a9c805f466b21b0cb6e2929e9ae193eccd5b994ac83858f091b49e06e3a6f84` | `cec4553ae25cef58d4a916a0b08333c78a8cd6db7c144cfe7935dcd5f21dc25a` |
| Server/Tests/Gameplay/BomberBombPromiseAtomicEntryTests.cs | 新文件 | `da6cfdbc7bd05440e7aa2fc4fcc60a06aede8afae165e0b4b4ffef3c239c1b80` |

原测试文件未改且SHA保持：Replay `9216255ea8186d166abc21220cb49aa7dff19a4f4cfa968a09322400b9b0ef1b`；BarrelReview `e7bba071cffab34c186a6bc3f6418be5851f2f67ea65144aa2b9d28ce8029544`；FrenzyBarrel `eeb9c7b0bdc4c491181cb7b53991bf40ae4b560bf0e697fba48eb7776eb8dc19`。上一窄修PlaceBombAbility `1ca7265b2266460db92aa5821170cb52914578e954080e43aec86180f16b1b37`与FrenzyProductionTests `d42fa6f04a5c1a8e885f4bc93b00cb21bd2fd624c3e62c7c9a8d6cffaba2d57a`保持；Frenzy新链爆Validate与原shape/source规则未改。

新增AtomicEntry类静态为**6 Facts / 2 Theories / 6 InlineData，共12 cases**：真实结构publication+信用转移、未标记拒绝、已知标记前故障可新提交、标记后故障paired恢复不重投、四种canonical偷换拒绝、同调用重入拒绝、Split/Barrel未标记拒绝、八行最大宽度codec envelope。故障与owner-credit fixtures均在源码明确标注，不冒称实际structural Unknown checkpoint；实际Ability/Native生产证明继续由原Frenzy、Split、Barrel类提供。

静态核对三处producer只调用3arg、旧2arg只剩拒绝负控；窄文件diff --check无错误。未改Supply/Round/Terrain共享/Fire/Reducers/Config/Schema/Generated/upstream/official06。未执行新build或任何case，故无新total/pass/fail/skip/childexit。下一步Root冻结新源后串行运行原Replay3、BarrelReview4、FrenzyBarrel1、新Atomic12，以及Frenzy29、Split11、Barrel27/commoncapacity/FlyKick/round/terrain相关回归；必须记录实际source、程序集与官方包身份，不复用旧DLL宣称GREEN。
