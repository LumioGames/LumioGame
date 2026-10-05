# Resource / Chest bounded candidate — PRIVATE author handoff

日期：2026-10-03。作者：capacity_schema。本报告是私有候选作者交接，不是对本人代码的独立验收。

## 状态与冻结范围

已完成42 Legacy profiles及其参数组合的只读源/导出审计、预算公式/shared helper私有完整候选、旧105测试的精确迁移清单和13项私有测试草稿。**没有运行新的C#编译、GEN、Native、Reader或Snapshot测试。没有实际完整Snapshot字节量或兼容GREEN。** 此处测试名描述拟测行为，不能作为已执行结果。

原10项真正RED继续保留：complete07 `resource-chest-budget-red-01`，10 total /2pass /8fail /0skip /rawchild2。原独审报告SHA `a673d206dda87528ae68c9d567c07fe8c25c4f486e04472baa2899b5f0dcef2e` 没有改写。修订前计划原件在私有目录 `plan.before.md`，SHA `a2270f45532479df2e616a61f9aabbcb252b200ebe5b27bee84d80f2536c7fa6`；现计划仅纠正regen-5000身份并追加明确的私有后续状态，不覆盖原证据。

当前编译源/表仍是：

| 文件（相对games/101-bomber） | 未修改的SHA256 |
|---|---|
| Gameplay/Config/BomberObjectBudgets.cs | `2b2285078879efd035bfe4fd70840fadf60cb1034c860ded9fd76b4701cad94a` |
| Gameplay/Config/BomberResourceRewardRules.cs | `adc70bbcd8e9e89b40799997880f48045d8174690e9031f87d0a3e7a5421feac` |
| Gameplay/Components/Bomber/BomberBombState.cs | `fd871eb03ccd4f1e5737ec0a9e671943283b3d5a522d049c6cb4dd376ca356ea` |
| Gameplay/Tables/tables/object_budgets.txt | `1823d185c2d1916720d0cde7f185bfde6a9393d1a9c34c2d8ce97863f54b290d` |
| Server/Tests/Gameplay/BomberObjectBudgetTests.cs | `935511ee1e140dbc9a73516285314d1b164328d29169bce43ffdcbba63390787` |
| Server/Tests/Gameplay/BomberResourceChestBudgetTests.cs | `2d84fa9f0cb161c9e74a2ccd37ecec828f9a947be1cf5b6ca12b4d709ac0aa8b` |

所有新代码仅在仓根 `.run/resource-chest-budget-bounded-candidate-01/*.draft`，没有复制到Game编译目录、配表源或generated。声明物理literal**未定**；333文件是已列profiles的隔离实验原件，不能物理发布。Runtime公共限额、ReservedSlot8、M2守卫、旧schema raw/history和既有Native断言均未改。

## 实际profiles与发行公式

`Gameplay/Tables/profiles.json`有48项：42 Legacy eligible及6已有gated M2，默认另算。私有 `audit.mjs` 读取每个Legacy layer全部变更，合并10张相关预算表，并对实际Server/Config/Profiles导出逐列比较；483个实际输入文件及SHA保存在 `profiles-proof.json`，**0source/export differences**。这是只读静态源比较和独立BigInt checked64算术，不是执行C# Reader/Calculator的GREEN。

影响发行窗的具名轴只有match360/480、final90/140；late-poison只改伤害/时间，chest-all-skills只改技能筛选，不增加箱数/奖励槽。其余profile没有增加terrain first/interval/orbits、strong spawn count或resource reward槽。`regen-5000/layers/product/skill_levels.txt:6` 改的是治疗技能 `regen_lv1.interval_ms`，不应引用为terrain间隔。

保留实际Engine floor Tick转换，先checked `final+lead`；`stop = match > final+lead ? match-final-lead : 0`。若first<stop，waves为`1+(stop-1-first)/interval`，否则0。interval有效Tick为0仍拒绝，O0只使cells0；F0不做unsigned下溢。cells为checked `waves*4*orbits`。Legacy初始resource chest0，初始pickup361保原保守模型；strong为实际spawn阶段5乘每阶段1。pickup为`361+cells*sharedMaximum(resourceRows)+strong*sharedMaximum(default)+actualSupply`，没有任何概率折扣。

| 实际源/组合，central disabled | waves/cells | lifetime chest发行 | pickup on/off |
|---|---:|---:|---:|
| 默认420/115/60s，first8/interval8s |30/240|245|1351/1106|
| match-360000 |23/184|189|1127/938|
| match-480000 |38/304|309|1607/1298|
| final-circle-90000 |33/264|269|1447/1178|
| final-circle-140000 |27/216|221|1255/1034|
| match480+final90合法具名轴组合 |41/328|333|1703/1370|
| 240/115/20s候选 |13/104|109|807/698|
| O0，或F==默认stop245s |0/0|5|391/386|

最高named需要309，不是245；已列42 named轴的Cartesian最高333。但这不能推导任意UGC的物理最大值。

普通bomb2624（含独立terrain128）与walls336保持；fuse2400为2912，fuse2400+danger500为3008；当前1个enabled central Frenzy source加24，因此对应组合3032。供给对pickup加11(on)/9(off)，disabled时0。没有将Remote8s或unknown等待当作释放/寿命折扣。

## 物理cap不能先定333：实际authoring反例

`schemas/regeneration.json:25/46/94`的interval/orbits/first没有上界，first的minimum0；ADR0048:39规定默认8s设计，没有把所有authoring配置锁成named。现Calculator只要求interval有效Tick>0、orbits非负，支持范围不能靠新333 guard静默缩小。

| 另外作者配置（静态算术，未运行Reader/Native） | lifetime chest | pickup on | contact单blob格式推算 |
|---|---:|---:|---:|
| 默认terrain5000ms、first8000 |389|1927|13681B|
| 默认first0/interval8000 |253|1383|8921B|
| match480/final90/first0/interval5000 |533|2503|18721B|
| 默认first0/interval50ms，pickup provision157191 |39205|157191|1372243B >1MiB|
| 默认first8000/interval50ms，pickup provision152071 |37925|152071|1327443B >1MiB|

最后一项不依赖F0。旧静态公式对此50ms配置需求39599，能低于所给的152071；但旧Calculator允许并不等于Native producer已验证。Whole-match历史模型对这些合法parser轴可能超过单blob公共限额，不能只把333改为533或增加公共1MiB。每弹更紧的实际历史上界、恢复保持的前进cursor，或另外审定的Game支持边界，需要独立真正Native证明。

静态审计当时读到Regen候选 `BomberRegeneration.Server.cs:312-315` 拒绝原始FirstTriggerMs==0、orbits>2、threat<3、非19图；没有强锁interval8000，因此5000/first8000反例不被该谓词拦住。该First0支持差异已报Root，旧源c5f669原件仍保留。Root随后独立新增真实First0例，同53b1测试实际六例5pass/1fail→6pass/0skip，生产唯一删零值子谓词，source87fe98；非作者只读闭环保存 `.sdd/101-20261003-regeneration-zero-first-independent-review.md`。这仅证First0/8秒/Legacy19/105秒停止，不证50ms或其他UGC。此预算作者没有写其生产/测试。Registry worker正在独立追retryArm重置origin+整Power及新完整ChestID，不按24/25坐标推断distinct身份上界。

## 可审私有候选与正式v15前置

`BomberObjectBudgets.cs.draft` 是完整原文件上的最小公式改动：共享验证reward形状，真实first/exclusive-stop算术，checked cells/strong/pickup/lifetime chest，保持旧bomb/walls、Supply/Frenzy、ordinary/Frenzy source与overflow named diagnostic。`BomberResourceRewardRules.cs.draft`只加`Maximum(bool,ChestRow)`及`Validate(BomberTypedTables,bool)`，原IBomberConfig调用转发到同一逻辑；不构造Settings，避免Calculate→Settings→Calculate循环。原概率/形状/随机池校验不丢。

**隔离实验的不足必须保留：** 当前draft的`RequireCapacity("contacted_chests", lifetimeIssuances, actualFieldMax)`配333 literal会拒绝上述UGC配置。它用于揭示named实验的范围，不能作为已授权最终production。物理literal待定时，不应把这个draft与333声明复制到正式source。若独立Native证明更紧的每弹历史界线，需明确区分全局发行预算与perBomb容器预算，再获Root批准；原10项245/109等断言不能静默换语义。

`object_budgets.txt.draft`只给出maxPickup703→1607的source候选，bomb2784/walls336等不变；1607是最高**具名**要求，不替代公式。原match480+final90负控会继续因为1703>1607拒绝，明确override1703后正控可以保持。选择1703为全局default会使原composite缺derived预算负控失去意义，不是本候选。

正式source若获批：Root用官方Config patch/apply/validate/export覆盖默认及全部48两端profile，重新同步Reader而非手改；只value变化不新增公开字段。GENv15必须先保留当前v14前置ledger/完整declarations/generated原像，保留765 active与8423 retired/36页的历史证据，再用same selected complete07/official06 provider双端生成、独立drift与完整schema历史认证。已有固定`schema-identity-storage.mjs:6-7`的8MiB input/index与512预收费均保持。预期只有contact容器shape改变，具体身份/退休数由实际官方产物确定，不能先写猜测的migration计数。

v14原模式把之前全体active身份完整退休并认证不可变before与旧页，**不**会自动迁移WorldSnapshot里的canonical容器maxCapacity。Game-owned old-release迁移与显式不兼容fail-closed release是不同恢复承诺。本次未选其一、未改Runtime decoder、未改旧原像，也没有宣称新版能透明恢复旧cap5快照。

## 旧105测试的窄迁移清单（尚未编辑）

当前`BomberObjectBudgetTests`静态12Fact+93InlineData=105（83原案例+22 Supply/Frenzy）。不删case、关闭新source或降低原guard。拟迁移：

- lines47-62：default/skills-on/fuse1800/danger300/500 pickup639→1351；match360583→1127，match480703→1607，final90 663→1447，final140 615→1255，skills-off634→1106；source pickup capacity703→1607，ChestLimit按每个真实窗245/189/309/269/221替换常量5，Participant8/ChestHit3/6placements/1wall/2slack、bomb数字及+128保持。
- line98：source provision tuple703→1607；fuse2400 required/max2912与one-below2911保持。line129 composite expected727→1703，保留第一次欠provision拒绝及第二次准确provision正控。line151 pickup one-below638→1350；其他原53InvalidAuthored参数/diagnostics、M2 authoring拒绝、known dispatch、Remote duration全保持。
- line246 exactminimum639→1351；lines266/267/284 Supply offskills pickup642/643→1114/1115，仍真实一少拒绝/准确接受。lines290-292 switch639/643/650→1351/1115/1362；line313两糖pickup643→1115（bomb2672保留）；line375 consumer disabled649→1361（bomb2624保留）。所有SourceDisabled/consumer/overflow/11sources保持原语义与case数。
- 本次不会改原10 Resource用例。其精确1351/1106/807/698、one-below、O0、F==stop及第6个真实ECS id仍是有效source-accounting/storage要求；新physical/perBomb设计若确需调整既有语义，另获明确授权并保留原RED。
- 另外静态依赖：`BomberBombLoadoutTests.cs:689` default hard pickup capacity703；`BomberStrongChestProductionTests.cs:27` default required639；`BomberBoundedObjectStorageTests.cs:112/115/267`按旧逻辑5联系人/第6拒绝构造。不得默默放松negative；旧strong-only存储场景可另审以明确合法O0配置保留原5上限测试，新source场景另证完整容量。此处仅列依赖，未改这些文件。

## 13项真实codec/World测试草稿与执行顺序

所有`.cs.draft`均不在Game编译输入。未编译、未格式化、未运行、无skip或伪造receipt。反射只测试使用实际official SnapshotWriter/Reader入口，保存真实payload，不实现替代codec；相关API按选定exact06源核对。

| 私有文件 | cases | 预期/用途 | SHA256 |
|---|---:|---|---|
| BomberContactContainerContractTests.cs.draft |3Fact|实际Writer→Reader333正控、old5→old5正控、desired old5→333兼容RED |`ca12273d809063690e830e0cb4c7c8e77469230b5f942d4ff0e3790a840a753d`|
| BomberContactWorldSnapshotTests.cs.draft |2Fact+2InlineData=4|当前old5完整World原像+Restore；未来candidate2784/3032完整结构存储cohort真实Capture+Restore；真实oldWorld→candidate兼容RED |`4139c19ed9759d139b31d93a7f530d7c81eb86b74005ce3407522e655b0edb65`|
| BomberResourceBudgetUgcBoundaryTests.cs.draft |6InlineData|F0/F49 floor、5000、long/F0/5000、两个50ms配置desired发行/物理覆盖；当前Calculator错误5为预期RED |`5a4764989f7a41465d782494887d51da0350398dfa76268dda4531d2f9068831`|

第一步必须在未改cap5的Game/official06实际运行 `BomberContactOldWorldSnapshotTests`，它用合法O0 authoring、真正ECS Tick出版5个Chest及Bomb，真实`CaptureSnapshot()`/`BomberTestWorld.Restore()`回读、保存原始LWM/SHA/export/Game与Runtime身份。输出`OLD_CAP5_WORLD_ARTIFACT`供后续读原件；不得在GEN后伪造cap5或改payload maxCapacity。

草稿收口只补实际Ecs Ticks namespace，并把old5原始Capture的保存提前至字段解码/Restore断言之前，确保后续Reader前置失败也保留真正旧像。原两草稿在私有目录 `.before-api.draft` / `.before-artifact-order.draft` 留存；所有行为断言保留。Codec反射构造已逐项读exact06 Snapshot/WorldSnapshotCodec.cs:215–234核对。所有这些仍是未编译私稿。

codec3项可在未改Game声明时单独跑，它测的是实际官方容器及private SnapshotWriter/Reader，不是Game发布的333能力。official `WireCodec.ContainerDelta.cs:78`对envelope capacity严格相等；故desired compatibility预计 `bad_delta_envelope`，这是现canonical契约，不是公共Runtime bug。实际RED须保留后再作Game迁移/不兼容release决策。

未来candidate结构存储cohort测试配置最长named组合，2784 bombs/1703 pickups/336 walls，或fuse2400+danger500+enabled1Frenzy source3032 bombs/1714 pickups。先真实生成8人的fullParticipant/Life/generation，再真实ECS出版所有结构；每Bomb333 full ChestIds及8个pending hit行通过真实组件API/SyncList填充，DamageFacts仍unready，不造Handle/Status/Native结果。公开Capture保存完整实际record，读原字段提取真实blob长度，限制仍64MiB/1MiB，官方Restore与二次Capture逐字比较。

这是保守**结构存储**witness，不冒称inventory每人可同时放几百颗Fuse弹、Native可以同时birth所有箱、或全部最大值有业务可达证明；反而以真实已出版结构测更大的安全上界。它没有填假TerrainContinuation/GAS result/transaction，因此真实accepted/staged/unknown地形债、最长opaque strings、实际有限GAS cohort及paired恢复的并发完整记录仍欠证明。即使这两项通过，也不得直接宣布“完整最坏record通过”或发表物理literal。

## 交回与剩余决策

静态推算的333 full NetEntityId contact blob11721B，2784个为32631264B，3008个为35256768B；这是格式推算，不是实际capture量。原bare16-byte估计也不能替代实际UTF8容器。公共PersistenceLimits实际源 `MaxRecordBytes64MiB / MaxBlobBytes1MiB / MaxEffectSectionBytes8MiB`保持；8MiB schema索引是另一独立限制，不能混为整个World cap。

私有公式/helper可审；真实旧cap5原像、actual codec兼容RED、完整cohort字节/Restore、新perBomb历史Native上界及支持范围仍由Root串行执行/裁定。physicalcontact声明未定，GENv15未授权发布。所有写入仅计划/报告/私有草稿，此交回后STOP，Root重窗口始终未占用。
