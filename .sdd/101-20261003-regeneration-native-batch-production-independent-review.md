# Regen Native 材料批照片生产修复独审

2026-10-03，registry_bounds_review，非本三域生产作者。只读核Root停写候选、三个完整before/after差异、实际调用者、原guards和真实RED身份；我是第五测试作者，测试的机械身份审计不充作自身独立测试审查。未写compiled source、index，未build/test/GEN/Native。

**Spec/quality verdict：本次三域最小生产修复源码PASS，无新增actionable finding。执行关闭暂待Root同源fresh五例GREEN；不能概括完整Regen或Game通过。** 旧独审一处P2当前在源码层已消除；首报告和旧RED保留。

## 精确候选与字节范围

冻结根`.run/regeneration-native-batch-production-fix-01/`：before.json SHA `c1580bb098ae753ace49f7835fcf2c3b50418eb5813143361c7eb172abbc6510`，after.json SHA `6f74d10faa42b996ed860c46b6f18650027d0d3a9d8e8a4c2501ae08b4087b59`。三个before物理hash均等于before清单、当前物理hash均等于after清单。

| 生产文件 | Before SHA256 | After SHA256 | LF前→后 |
|---|---|---|---|
| BomberTerrainRead.Server.cs | `23fa0155ee3eff1843e6a844833be2ed30c4ed71ec290fc8265d47523e89bafa` | `34bd03a4702111773c4c6daa675ea303786f4bfc65559de31985110daf2e312c` | 55→84 |
| BomberTerrainTransactions.Server.cs | `0299df358538b25e378f32f4c713a9227b40640856454485639a64469af008af` | `eaf6c8bb187b634be121c54ae602716d4a9fef06a9dbb00cb2f0795e59148c88` | 673→678 |
| BomberRegeneration.Server.cs | `86130bedf68d0646f9d7e56f32c11e6fe9c217f5704b4df79258a3acc272707f` | `c5f66903a190ed63a9fa132f84f0dcebaeee09b616fe5840928a44ed0ab09216` | 413→416 |

六物理文本均UTF8无BOM、CR数0；没有CRLF/LF迁移。Git提示未来工作副本CRLF转换不等于本次实际发生变化。完整no-index diff仅TerrainRead新增using/窄入口/共用ForTick、Transactions新增唯一结算照片及传参、Regen新增照片参数/长度/index与材料校验替换，未改其余正文/旧guards。

## 调用顺序与guard审查

Terrain.Begin仍先`Validate(world)`；其全行false路径仍完整验证durable wave和ownerless tuple。matching result仍须唯一transaction、operation/batch null、submitted早于now、runtime全列当前match验证。已知Aborted/非Original仍走原Reject/Clear；Status失败、非Applied、Duplicate或未TokenConsumed仍不进入激活。原exact section集合/count、原receipt bytes/count、每个section唯一回执及全部expected revision严格推进均逐字保留。

唯一`ForCommittedRegeneration`生产调用点在Transactions第100行，位于所有section guards之后和整个Applied settlement循环之前。它自身又拒无adapter、非唯一transaction、不匹配transaction、无cell/mixed kind、submitted>=now、非当前match、非真实Original成功/TokenConsumed、无sections/原bytes或bytes长度不符、非法map。这个窄internal入口不完整重复每个tuple/receipt section guards，而由唯一真实consumer已完成它们；已核无第二生产调用者。没有通用allowPending开关。

普通`For(World)`原pending非零拒绝条件逐字保留；两入口共用private ForTick与原Read。原adapter+Tick cache、two-layer地址顺序、checked length、HasBlockId/Ready/Unchanged条件未改。在本消费Tick、读照片以前存在pending，普通reader不能先把旧照片写入当前Tick cache；此唯一consumer取得当前已提交Native photo，Accept/Clear后同帧后续普通For取同cache。无Native提交插入两阶段、无对本帧未提交写的照片回写、无跨Tick持久格真值。每个result局部照片只读取一次；多余无matching结果不再次消费此债务。

Regen Applied仍重新验证完整tuple，缺完整照片/长度不符即失败；按checked(area+z*width+x)索引obstacle，保留HasBlockId、Ready/Unchanged、exact block、revision>staged expected。coords已在早先whole-orbit校验限制真实map范围。旧per-row `adapter.Read(oneAddress)`彻底去除；真实`adapter.BindingGet(...) is null`原样保留，不能用材料推断绑定。所有Applied行通过后才进入原accounting/Accept/Clear；整个Accept、Reject、Unknownhold、provenance、scheduler、credit、安全/布局、JSON/UTF8与round/debt规则没有在此delta中修改。

本修复只解决**材料/revision**一帧完整照片复用。BindingGet仍是真Native逐cell查询；它不在第五例Read计数中，不能声称所有Native查询已经批量化或完全无逐格调用。照片来源只有真Native，缓存仅为本帧派生数据，不创造第二个材料/binding真值。

## 实际RED、编译身份与未完验证

Root先发行第五草稿71fb，build05的NativeLoader/SDK两个导入重名6E原证据保留，不能称业务RED。Root仅改新增using为KernelHandle alias，实际test `09afc215d0e7bd3c7dac1fd7e35ae42d587e5d8aeae2e5ef51fae43ac1e3f08d`；作者机械全文件比较证实仅该替换，原四例/helpers保留。非作者测试审查仍应由其他agent承担。

fresh build06后Root真实`games/101-bomber/.run/v14-fullpack07-native-20261003/regeneration-native-batch-red-01`日志为5 total / 4 succeeded / 1 failed / 0 skipped，14.886秒；唯一第五例在191行真实forwarded ABI Reads.Count失败，Expected722 / Actual730。JSON及`.exit`真实child2，outerexec1分开；sourceChanges0、test两端09af。日志 SHA `a28a153bdf2073d6bb404b1673e07097a8bfcc2ac65c51a3d57bf77bdd028304`，JSON `5a4a0d98eadde681ad4b5b7ab595ac9a012d2f42f3ba942f34a4c9c8e5bb3b59`。

RED执行Tests DLL `c0fc3df1065183740b3b8025d2aa2235cf37d6058d18f5f5d1de6f87cd25db07`、Gameplay `339d719c19c2beb52d31ee3e534fcb73afd3cf09640e8e9a6bcd58f6eb70e018`、Ecs `aa5520f37e22eb6337d4e9e5c33008684bb7fd51e598dad38ef404351dddbd49`、Gas `09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`。official pack `652b5a55cd8bd4fea69839b78ba7401b6ad1a76980f5af40911e3e640345fe04`、Native `c01599b8c31ea72185f2a206dbcc5c4ff8fb432c68bb61ea3dabab5e6d4ddb12`、build-info `f9752593b0d802b76996a5bcaa8fdda4a75d2f9449fd160d268e793029f3570d`。这些是历史RED记录，不把后续重建覆盖的共享DLL冒认原件。

本报告当前未读取或认定候选fresh build07/五例GREEN；执行结果到达须另附准确source/DLL/raw/count。原独审的unsubmitted恢复credit证据缺口、resource chest/barrel/multi-output发行范围、正式M2 guard关闭和Authority完整捕获均保留。源码停写；本次范围不关闭完整producer、Native全部、整局或完整Game。

## 后续机械编译修正与执行关闭

本段补充首次源码审查之后的真实结果，不改写首候选和失败记录。Root build07真实1 Error/0 Warning/raw1：SyncList不能直接用IEnumerable Any，实际CS0411。Root只把新增`runtime.PendingKinds.Any(kind => kind != Regenerate)`改为`Enumerable.Range(0, runtime.PendingKinds.Count).Any(index => runtime.PendingKinds[index] != Regenerate)`。独立完整diff确认只此一行、相同所有kind判定，前面的Count一致guard仍在；不能称原34bd可编译。`BomberTerrainRead.Server.cs.compile07.before`原SHA34bd保留，after02.json SHA `91d9f2b5784c7b95c660ed8ee961891ad54f07b8505c8cab159aeac858a7da72`，新TerrainRead SHA `1b097710ef7cc766f62dd56cf2778d29eca04698d05b1c19850f9274919804dd`。其余eaf6/c5f6不变。新Read仍LF84/CR0/noBOM；源码Spec/quality PASS适用于此机械修正身份。

Root实际build08：raw0，0 warnings / 0 errors，370源码/sourceChanges0。日志SHA `e9c917edabe3268233b40efa25692d9c53099f01cc1243d646d2dca3ec00c6ce`，JSON `a50dea20b231609b058b1710b36cf6126aceb77f1822f478899efe67f419dcf2`。07编译失败原件保留，不称业务RED。

实际`regeneration-native-batch-green-candidate-01`已结束：**5 total / 5 succeeded / 0 failed / 0 skipped，15.373秒，真实JSON与.exit child0**。开始07:19:50.8866464Z，结束07:20:07.5063829Z；argv仍同官方07 Tests DLL、`--filter-class *BomberRegenerationProductionTests --minimum-expected-tests 5`。日志SHA `9e79dbca631fe438d331a0becd2a399e277698e82cc7d4f8f5a1e1abbefa059f`，JSON `58fba32f1c2deced499233123ed677b79326557d67996d632047670e8f12b092`。

370源码两端/sourceChanges0；三候选源两端及当前分别精确1b097/eaf6/c5f6，测试两端及当前精确09af，与真实RED为同一测试源码。第五例原722地址总数/唯一/完整顺序及实际激活断言均通过，原四例也通过；这是读取与激活的真实执行证据，不是本审查人独立运行或独审自身测试的声明。

GREEN记录Tests DLL=`1101169c6f13b9614009da5b0eb0f41a44b8f22cad9844038788a390e85c4f4c`，Gameplay=`ae2d019a0d0906f4f3821fa608e2b809c6526f6178764484f68847d2a87e3d78`；Ecs/Gas仍aa5520/09150，Native/build-info仍c01599/f97525（完整值见上文），official pack仍652b5a。独立复hash六实际执行文件均与GREEN记录相同；前述RED旧Tests/Gameplay身份不被新文件覆盖后的字节冒替。

**本P2执行关闭：PASS，仅限材料/section revision额外逐格请求与同Tick照片复用。** 真实730→同test五例GREEN；production guards与单一Native真值源码审查成立。BindingGet真实未绑定guard仍在，其查询不在第五Read统计；不声称Native FFI单batch或全部API无逐格。原恢复credit/完整发行量/资源箱/barrel/全M2/Authority/全Game边界继续未关闭，原HOLD报告保留并以本窄补充关闭这一个P2。
