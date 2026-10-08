# First0 Native 测试私稿独立审查

只读审查无阻断，可交 Root 串行编译并跑实际 RED。未编译、导出配置或运行 Native；此结论不等于零值配置已获生产验证。未写任何生产或测试源码。

## 身份与范围

- 私稿：`.run/regeneration-zero-first-test-draft-01/BomberRegenerationProductionTests.cs.draft`，SHA256 `53b1a81303346cf4b511a88456730ea3b7dbb986bf9dfbcf54b40218f6e6e283`。
- 原五例：同目录 `before.cs`，SHA256 `09afc215d0e7bd3c7dac1fd7e35ae42d587e5d8aeae2e5ef51fae43ac1e3f08d`。
- 实际 diff 仅新增 `ZeroFirstTriggerKeepsItsLogicalScheduleAndTheNextActualNativeWave` Fact（206 行起），Scene 参数默认 `8000`（295 行）及其配置断言（306 行）。逆转这三处后逐字节等于原五例，逆转 SHA 与原件相同；静态 case 数 5→6。
- 只读证据：`.run/regeneration-zero-first-test-draft-01/independent-review-proof.json`，包含所有已读源 SHA 和逆转结果。

## 参数与真实顺序

`Gameplay/Tables/schemas/regeneration.json:94` 的 `first_trigger_ms` 是必填 `u32`、minimum=0，未设 maximum。旧 `BomberObjectBudgets.cs:87` 只拒绝折算后为零的 interval，并未拒绝 first=0。ADR0048 第39行给出八秒间隔等默认规则，没有把 first 的作者范围封成仅8000。因此零值有实际作者声明依据；这不是证明任意其他 UGC 参数已获 Native 支持。

`BombSystem.Server.cs:379` 在真实 Warmup→Running 的当 Tick 写 StartTick，然后同一 Execute 调 `BomberRegeneration.Advance`（57行）。调度从 `StartTick+first` 初始化，先推进绝对 NextTick 后才检查 Eligible（`BomberRegeneration.Server.cs:58–80`）；第一次 Running 时 census 尚未初始化也不能把时钟改成迟到的相对八秒。私稿 Scene 保留真实 Native 64积木输入及无新增断言（318、325行），随后确认初始化 census。新 Fact 断言实际持久 owner match 与 `NextTick=StartTick+8s`，再用真实 Native 写入清软砖，并由正常 Tick 走下一机会。没有直接调生产再生函数或写 scheduler、census、phase、Native revision、receipt。

新波次断言全组4的倍数、4..8产物、事务债务0、promise空、下一绝对时刻16s，以及 actual Native block / bound full entity ID / 活性 / chest或barrel generation>1（443行起）。沿用两端 Reader 与官方作者 CLI 的 Scene；配置参数为240s局、115s决赛、20s停止提前量、first0、interval8s、skills/supply关闭。

## RED 与覆盖边界

当前 `BomberRegeneration.Server.cs:312` 显式拒绝 `FirstTriggerMs==0`；该私稿预计先在真实世界 Tick 的生产准入校验失败，未走到波次断言。Root 应保留这一首异常，不能把它记为已成功构造零值 Native 波次。移除拒绝后的合法波次、机会消费与完整债务收尾必须再由同一实际六例证明。

新例覆盖零值初次逻辑机会在真实 Running 时被消费、下一八秒实际增长和16秒调度。它没有证明 first<一Tick 的49ms取整、任意更短 interval、超过2组、最大资源发行或 snapshot 上限。原五例的 Actual Original 读图证据及停止/镜像安全断言均保留。

## Root 实际执行与唯一生产修复闭环

以上是私稿预执行时的原结论，现追加真实结果，原件与首异常不删。实际 runner 证据根为 `games/101-bomber/.run/v14-fullpack07-native-20261003/`，不是父仓 `.run`。

| Root 原始标签 | 实际结果 | JSON SHA256 |
|---|---|---|
| build-09 |raw0，0warning/0error|`fa852476fdcc4343552b9d7f0aa19dc69f63178c77e06232995a365761c7bce0`|
| regeneration-zero-first-red-01 |6 total /5pass /1fail /0skip /raw2|`cc695d88b5e93d1dd01842148c65e49c8a827f60e997095090a82abadf52ab9c`|
| build-10 |raw0，0warning/0error|`8b3c23556b7ee447b485009a0404a85689e0b38e308682ba6c1c168356b16a3d`|
| regeneration-zero-first-green-candidate-01 |6 total /6pass /0fail /0skip /raw0，15s799ms|`533e30c591d681a530cb17ffd19965a3129db7931756974e71037222ce792303`|

RED 唯一失败是在真实 Tick2，`BomberRegeneration.Validate` 由 TerrainTransactions.Begin 调用，抛 `Regeneration configuration exceeds the admitted Legacy19 envelope`；F0尚未走到实际波次。旧五例实际通过。Root随后只删 `Validate` 内 `config.Regeneration.FirstTriggerMs == 0 ||` 子谓词；before `c5f66903a190ed63a9fa132f84f0dcebaeee09b616fe5840928a44ed0ab09216` 保存在父仓 `.run/regeneration-zero-first-production-fix-01/BomberRegeneration.Server.cs.before`，after `87fe98fd1fba0ac853ba27b70708863c28cac82a9ba3602e3967c01e87409225`。只读逆转该子谓词逐字节恢复before；interval有效零、denominator、target、安全距离、最多2组、19图和完整持久债务校验都未变。调度/Native生产路径未另改。

两次实际运行的全源 AtStart 映射差异恰好这一个生产文件，测试均为 `53b1a813…e6e283`。同一 Tests DLL `fc5bd592e5949a17f073114e9bc412528c5bf325f9d1399a6517222bf20ce37b`；Game DLL从 `ae2d019a0d0906f4f3821fa608e2b809c6526f6178764484f68847d2a87e3d78` 到 `d1b52f3761e885823bfb654ea9603fdc09fe20856eb7f6be6c207d5e266557ff`。Ecs `aa5520f…` /Gas `09150ba…` /Native `c01599b…` / build-info `f975259…` 不变，same selected manifest `652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`、Config commit `a991a517f9dbae255321c25d65fea0bfdfdca42f`。GREEN记录的六个DLL/build-info当前物理SHA全部吻合；每次 sourceChanges为空，原log摘要及raw exit已核。

精确审计身份保存到私稿同目录 `independent-native-closure-proof.json`。审查者没有运行构建或测试、没有写编译输入。闭环仅证实 zero-first/8s interval/Legacy19/八人/240s局/105s停止的真实机会消费、8s全组Native波次及16s固定调度，与旧五例保持通过。不能扩大成全部UGC interval/orbits/发行预算/恢复字节验收。
