# Goal 101 producer promise atomic 独立审查

2026-10-03。非作者审查；先 spec 后 quality。仅只读源、官方 runtime、原始证据与低内存字节计算；唯一写入为本报告。没有运行 .NET/Native/GEN/build/format，没有改源码、原测试、fixture、generated 或 index，没有 spawn。自身 Fire 六域改动不在本次独立审查范围。

## 裁决

**Spec：HOLD，1 个有明确静态反例的 P2。Quality：HOLD，同一 finding，另待 Root 的新官方 GEN、fresh build 与真实测试结果。** 未发现其余原八项问题的修法有静态业务错误。原八项仍是保留的 RED，不将源修复记为 GREEN，不宣布完整 Game、16 人整局或 Goal 101 完成。

P2 限于新 generic 原子入口宣称的 callback 限制与 Split 生命周期 witness 完整性。当前三个实际生产 callback 均只做预期标记转换；本审查没有声称当前生产 callback 已触发该缺口，也没有声称取得实际 structural Unknown checkpoint。

## 唯一 actionable finding

**[P2] Split 原子 witness 没有钉住实际 Danger 期限，callback 可以改变它并仍进入 Commands.Create。**

位置：`games/101-bomber/Gameplay/BomberSplitBombs.Server.cs:36–44`，关联 `BomberBombAdmissions.Server.cs:57–83`。

入口注释及作者报告规定 callback 只能完成当前方向 false→true，并声称 Split phase/clocks 被钉住。然而 Split witness 序列化 PlacedAtTick、FuseEndTick、Phase、ExplodedAtTick，却未序列化 DangerUntilTick（也未包含 BurnUntilTick）。`BomberBombState.ValidateStorage()` 不对这些期限做 before/after 对比，容量 census 也不读取它们。

具体静态反例使用新测试 `OtherOwnerFixture("split")`（`BomberBombPromiseAtomicEntryTests.cs:258–269`）的真实已发布 Danger mother，原方向 bit 为零。调用三参数入口，callback 先将 `mother.DangerUntilTick.Value` 增加一 Tick，再设置该方向 `SplitSubmittedMask` bit。完整 ID、source、generation、chain、shape、power、future、resolved、position/reach 均不变；所选 submitted bit 被 witness 规范化，因此 before/after 字符串相同，容量相同，程序随后执行 Submit/Commands.Create。无需构造第二份规则或伪造 ID 即可从源码确定这一接受路径；本轮没有执行此额外 case。

期限不是无关元数据：当前 `BombSystem.Server.cs:270` 用它控制 Danger 接触，`:285` 用它决定 Native DangerElapsed。即使生成的子弹 source 与信用没有改变，callback 已改变真实母弹业务生命周期，违背“只能改提交标记”的新入口保证。该反例针对内部 callback 防错保证，未推断外部攻击能力；当前 Advance callback（Split 源 :94–95）自身只写 bit。

最小建议：将母弹 DangerUntilTick/BurnUntilTick 纳入同一 canonical witness，新增一个 actual mother 的专属负控，callback 同时变期限和当前 bit，要求入口拒绝且没有实际 order；持久 true 的保守不重投语义仍保留。不要修改原八项断言。复核 witness 其他未列字段时，应按该入口已明确的 credit/source/lifecycle 保证评估，不要求引入新 Source.Phase eligibility 规则。

## 已核范围与正向结论

已完整读 root `.spec/AGENTS.md`、knowledge README、101 自有规则与 testing 导航；本次完整读作者 atomic 报告、四生产 helper、新 AtomicEntry 类、三组原八项测试、Frenzy 前轮报告/production tests、PlaceBombAbility；并读实际官方 06 runtime 的 Create/capture/restore 对应实现。官方 runtime 使用 `C:/Work/LumioGames/LumioGameRuntime-101-pack06-freeze233`，HEAD `23356eafc365c753b6e8d9987fd069815ff067ce`，不以 main 代替运行语义。

- 原二参数入口现在无条件拒绝，不把已持久 Submitted 当作新授权。三处 producer 均经新三参数入口。入口从实际持久 owner 读取 false witness，建立同 token 重入 gate，执行同步 callback，再读 true witness、重核实际共享容量，最后发起一次结构创建。
- callback 标记前异常移除暂存 gate；若仍 false，来源保持已知未提交，可以新调用。标记后异常保留持久 true，即使撤掉未进入结构的 gate，true 仍不授权重投。进入结构后异常连 gate 一起保留，没有因计时或服务重建返还信用。故障后并不回滚已经写入的持久 owner。
- 同 token 重入在 Hold 与 callback 之间被阻止；新测试 nested callback 不执行。World Tick、Match、owner/source 关键字段改变会使 witness 比较失败。Barrel witness 钉完整 Promise record 和实际 Runtime owner；Frenzy witness 钉完整 record、实际 Participant 与当前/active life+generation、期限及 last placement。Produced 不能在 callback 中预造而保持相同 witness。
- Occupied 来源是 live bombs 的 `1 + FutureChildren`、尚无实际 publication 的 Barrel 信用（Split 5，其他 1）、Frenzy 信用与暂存新增 primary 信用。Promise 的 Hold 为 0，信用已在持久 owner 中，没有再付一份；callback 后再次核容量。只能实际 live AssignedId 使暂存 primary 信用转移，不以 allocated identity 消失债务。Awake 内顺序是 admission → Split → Barrel → Frenzy，持续信用由对应 actual publication 消耗一次。submitted Unknown owner 仍计 future/shared credit。
- official06 `EntityRecord.cs:163–196` 的 Commands.Create 先准备再将真实 order 加入 PendingCreates/绑定；在这个调用边界以后保守保留 gate 符合可能未知的提交结果。`WorldSnapshotCodec.cs:23` 调用 EnsurePersistenceQuiescence；`World.Residency.cs:303–307` 拒绝 pending creates/destroys。真实已排队 create 不能冒称可捕获的 paired checkpoint。
- Barrel row 的 Match 严格等于当前 Match。Stage/ValidatePending 核 actual Native pending/Original receipt 与完整 bomb source、LifeGeneration、Frenzy、chain、shape、family、cell/generation，Stage 不从当前 Participant 狂暴期限推导历史标记。
- Barrel RequirePublished 首次（PlacementRecorded=false）核 source、Frenzy、shape、power3、CapacityReturned、CreatedAt、子方向/HitFamily/SkillLevel/Pierce、原 chain/deadline、actual cell center/高度、Fuse、Split future4 与零 masks、零 exploded/danger/burn/kick。晚到 Original 仍保留 Submitted+100ms 原期限，允许该期限已过，不重启时钟。
- PlacementRecorded=true 不再重验出生位置/初始未来子数与 masks；因此合法 kick/已转移 Split 信用没有被出生检查误拒绝。后续 chain/deadline 改变须实际已记录 placement、exploded phase、正 chain、期限等于 ExplodedAt、CreatedAt≤ExplodedAt≤当前 Tick。正常 first publication 后移除 Promise，再无该行约束该弹出生位置。
- 新 Barrel Frenzy bool 尾部默认 false，保留旧 record 解码形式；实际 produced bomb 复制并精确核 full SourceLife/Generation+bool。Frenzy=true 只能 Standard；barrel token 属独立桶信用，不挤占 primary 狂暴六并发，不退 ordinary inventory。Split 子 source 与 Frenzy 也复制/核对，合法 Split 标记仍 false。
- Frenzy 自免仍按 `bomb.SourceLife == player.Entity` 和完整 SourceLifeGeneration 判定，不改用当前 Participant.CurrentLife 或当前 FrenzyUntil。旧 source life 不要求 live/current；死亡/复活不会把旧弹自免转给新 life。primary source token/原 chain、nominal fuse、实际后续 chain explosion 边界有校验。PlaceBomb 三个资格入口与前轮 29 源测试只读核对，没有扩大其写权限或声称本轮已运行。

## UTF8 上界独立核算

Promise 为 21 个字段，默认 System.Text.Json 的固定 key/标点共 243 字节。八 string 的引号16、Token prefix57+16 UTF16 suffix code units 最多96、Transaction prefix49+suffix最多96、六个完整32 ASCII hex ID为192，共506。七 ulong 最多140，Shape一字符1，非负 int X/Z最多20，三个 bool 最多15，共176。925=243+506+176；八行数组最多 `8*925+2+7=7409`，低于 ByteLimit16384，余量8975。本轮用轻量 JavaScript 独立复算上述字段数与算术。

此为保守合法 row serialization 宽度包络。把所有 primitive 最大值同时放一行不保证 Native provenance/业务时钟合法。新测试对此有明确区分，并另构造八个不同 full local ID 的 codec 边界；该 System.Text.Json 精确字节断言本轮未运行。没有提高 ByteLimit/CountLimit。

## 原 RED 与新测试的证据边界

原始三组日志和 JSON 完整读取、raw exit 与元数据核对：

| 原 evidence directory | total/pass/fail/skip | raw child | log SHA256 | JSON SHA256 |
|---|---|---:|---|---|
| promise-replay-red-01 | 3/0/3/0 | 2 | 867e20a2b8371e45a175c2d7ee37ca4d78ba53dd46cfffa51e3b03ed62f7fdd0 | 35197026ed048349c0da1d8fb43569107595431185ec27f6c5b8827368c2a30d |
| barrel-promise-review-red-01 | 4/0/4/0 | 2 | 6b949bf0d30388818af0fe07ded2ed63aaa01bbe2c804d9c2679b737c1030dc4 | 411c993d81519dc373387a5dcc68eae2d73c0bf9c176e9c5a1e0582e7a6e0967 |
| frenzy-barrel-original-red-01 | 1/0/1/0 | 2 | 2996bd68d72514d8f790b64db1a175434006a5444a6b97477e2088ce0ecffe06 | bc6402f19577bcc514a60f78a104f63b741f16d38abde4f6a8f33d7d72a497d2 |

相对路径均在 `games/101-bomber/.run/v14-native-production-20261003/`。原 Replay 三项故障注入明确是持久 submitted unknown fixture，非实际 structural Unknown capture；Barrel 负控基于实际 Native-produced publication/Original；FrenzyBarrel 原失败在前置 actual Ability、Native binding 清除/air、actual produced bomb 成功断言之后的 Frenzy true 断言。未输出长 payload 或敏感日志。

三组旧运行共同 TestDLL `fae681d39a68bcc40996f5745d1eec792075f0fa6285833ed2fa7b2c9e985b8d`、GameDLL `7b850bbf9979b328f685d1769ec86aa2ee0774e3630fd82301b0addaa01fe50d`、Ecs `74da7fff23e1aa72b8e8b7d0fd93c8164447c636de47700e254d8404c0648def`、Gas `09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`、EngineNative `419b74c7b5eac0f85a02ab58eda8485240194060dfd319e816ab35f501bfbfed`。它们不能证明本次新源的结果。

新 AtomicEntry 是 6 Facts、2 Theories、6 InlineData，共12 cases：真实 queued publication 信用转移；缺标记拒绝；标记前/后故障；四类 canonical source/power/position/owner-generation 偷换；同 token 重入；Split/Barrel 缺标记；八行 UTF8 envelope。故障 fixtures 有清楚标注；没有弱化原八项测试。Split/Barrel 偷换期限并不在这 12 项中，故新增矩阵不能覆盖上述 finding。

Parent 通知 official GEN06 112/drift0 成功、build11 有机械 compile/analyzer 问题，build12 在跑；本审查未读取对应新 heavy artifacts，故不把通知记为独立验证结果。待 Root 绑定准确 source/assemblies/official package 后运行原8+new12与 Frenzy29、Split11、Barrel27、common capacity、FlyKick/round/terrain 相关回归。原 RED 证据继续保留。即使相关子集 GREEN，也不能扩大为完整 Native producer/16人业务验收。

## 本次源身份

审查 snapshot（SHA256）：

| 文件（相对 games/101-bomber） | SHA256 |
|---|---|
| Gameplay/BomberBombAdmissions.Server.cs | dd77b4a4c2a015f9e9d2bc2ca6333473454a9437abe6de80f43a7d22d4c4cd72 |
| Gameplay/BomberSplitBombs.Server.cs | 15e9f03bcd1608116f8c4427c0b13e2d78d0ca42f8ea81dbe30da5c0d0bc711f |
| Gameplay/BomberBarrelBombPromises.Server.cs | 213e874d2bb3ee32f424a2390873b8fd2ab3ba8ed819fb0569fb57ff41c44c67 |
| Gameplay/BomberFrenzy.Server.cs | cec4553ae25cef58d4a916a0b08333c78a8cd6db7c144cfe7935dcd5f21dc25a |
| Server/Tests/Gameplay/BomberBombPromiseAtomicEntryTests.cs | da6cfdbc7bd05440e7aa2fc4fcc60a06aede8afae165e0b4b4ffef3c239c1b80 |

Admissions 与作者表中的 f9cdc311… 唯一通知 delta 为同 API 的 `ArgumentNullException.ThrowIfNull(persistSubmitted)`（CA1510 机械修复）；其余三源/新测试与作者表一致。作者 atomic 报告 SHA `094f5a75658207d074af7e737dfff8153402fd5a41683a3739c85fd6b7643120`；前轮 Frenzy 报告 SHA `febf329b127092ac868057e98ea3ad432902cc2f3adb857945d802d8521380d3`。

原 Replay 测试 SHA `9216255ea8186d166abc21220cb49aa7dff19a4f4cfa968a09322400b9b0ef1b`；原 BarrelReview `e7bba071cffab34c186a6bc3f6418be5851f2f67ea65144aa2b9d28ce8029544`；原 FrenzyBarrel `eeb9c7b0bdc4c491181cb7b53991bf40ae4b560bf0e697fba48eb7776eb8dc19`。PlaceBombAbility `1ca7265b2266460db92aa5821170cb52914578e954080e43aec86180f16b1b37`；FrenzyProductionTests `d42fa6f04a5c1a8e885f4bc93b00cb21bd2fd624c3e62c7c9a8d6cffaba2d57a`。原断言文件均与作者报告身份一致；窄文件 git diff --check 无输出。

Goal 101 尚未完成。