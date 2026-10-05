# Split / Fire cut 两处 P2 最小生产修复独审

2026-10-03。本段仅审 Root 本次两处生产delta，我未作者这两delta。Native13 successor fixture由我承接作者，其新实现明确排除。已沿用本轮 Root/101 core/nav/testing 与 exact official06/public cut 原核查，读实际当前源/原始run；只写本报告，不改任何source/test/index，不build/Native/GEN。

**Spec/source Quality PASS，无新finding；实际验证关闭等待fresh build16同test身份GREEN。** 原独审、实际RED、Native13 HOLD/作者报告均不回抹。本报告不将候选源码正确判定为已经执行成功。

## build15 真实 RED

证据路径均相对 `games/101-bomber/.run/v14-native-production-20261003/`：

| run | total/pass/fail/skip/raw child | log SHA256 | JSON SHA256 |
|---|---|---|---|
| split-lifecycle-witness-red-01 |4/3/1/0/2|20b899e5a70ffdff1a48de9b1c8341e68dbb62fb1bc7bac0dcc943ea419f84d9|433d323ebb3f035acea1aa07fe45a57bcf28bc969c38100cad7fe48925274ede|
| fire-cut-equality-red-01 |4/2/2/0/2|3f8c74d2df0f4a5e811c08dcd6e6aef0eab723db0a24646116bf6d7e4065a587|a24db18e08c50e370861fa5fe5c7d38a281e31c25eed3773ca5c7fbb7fd3d919|

两log独立重算等JSON记录，raw exit等JSON exitCode2。Split唯一失败为callback Danger deadline变更仍被接受，Assert.Throws未抛；actual normal/kick/chain三正控通过。Fire两失败分别BeforeTick/AfterSettlement equality Restore未抛预期EngineHostException；合法两restore正控通过。不是fixture前置或初始化级联失败。

两run相同build15 TestDLL `3ef591c202edf1faba6eac5225f9b2177c2fa8c9cad9c7a2f0e7d02f3b276910`、GameDLL `9d1c43bf5b991220e8403632113f79474416cb6e90b876d40c5ff4e225d67582`。official06 manifest仍 `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`，Ecs `74da7fff23e1aa72b8e8b7d0fd93c8164447c636de47700e254d8404c0648def`、Gas `09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`。RED绑定旧Split15e9…711f、旧Fired406…d77，不能重标为新候选执行身份。

## Split canonical witness

当前 `Gameplay/BomberSplitBombs.Server.cs` SHA **`ece2bad774e79b4b6bf721c28f331a47b2311629f43164ea8c8fcede540c4cee`**。在内存仅去掉新增DangerUntil/BurnUntil成员并恢复原Phase/Exploded/Family换行，整个UTF8字节SHA恰还原 `15e9f03bcd1608116f8c4427c0b13e2d78d0ca42f8ea81dbe30da5c0d0bc711f`。没有其它guard/callback/Advance/source/credit逻辑delta。

同一before(false)/after(true)canonical JSON读取实际owner两时钟，callback DangerUntil+1现在使字符串比较不同；BurnUntil同时钉住。所选submitted bit仍唯一规范化，future/resolved/source/position/phase/clocks保留。它是即时内部比较文本，不变更持久record或公开schema。合法kick/chain变更在本次callback before捕获之前，不被错误固定成出生值，也不新增phase eligibility。Admission仍在Commands.Create之前比较，拒绝保留已写true并禁止重投，不承诺回滚callback已经写入的非法字段；Admissions SHA仍 `dd77b4a4c2a015f9e9d2bc2ca6333473454a9437abe6de80f43a7d22d4c4cd72`。

## Fire hydrate 上界

当前 `Gameplay/BomberFireExposure.Server.cs` SHA **`8d7e34f66e2b7f72e5ca3f715e31a1c08d8805a4f646793474fb878703842933`**。内存将唯一 `FireExposureLastTick.Value >= world.Tick`还原`>`，整个文件SHA恰还原 `d406113b06eea2c9d492817ee49f1f8aef8bfba126e2daa81e42a76ec61d3d77`。空源一致性、稳定source tuple、旧死亡source life合法归因、各kind/match/clock下界逐字保留。

全非生成生产只有Skill.OnHydrate:13调用，调用文件SHA仍 `b5f4bca3fd9cf91a29b805fe07721b74837227d8b03902d29865933c2a4c68e0`。官方06先赋World.Tick=Cut.ResumeTick，再填完persisted实体并OnHydrate，因此`>=`准确拒未处理的resume采样，保留Last=ResumeTick−1。没有在Save phase调用该validator；Advance仍写Last=当前processing Tick，AfterSettlement Save内这个等号合法，恢复时Resume=processing+1。公开Engine0e effect-lifecycle-v1.json:558 cut时序未改变，不动CaptureTick/ResumeTick/interval或Native相变顺序。

## 精确test与执行关闭

build15实际Split test SHA **`3f7cc48fc3a19c490696d6b58659c1fb1d0cd00d21027f7dcc3fece7ff0807a7`**；FireCut仍 **`9760c40382ae7119b0c099f53183653d715706fcc89d04978c58d5b50450e3d0`**。独立在内存删除新增static readonly ChildDirections一行，并把唯一Assert.Equal参数恢复同值 `new[] { 1, 2, 3, 4 }`，整个Split test恰还原旧SHA `3d1286547cfbc112241880f0a9be343e631b8ea531f02b38e99785fd903819ae`。CA1861修正没有删除/放松任何四case断言。不得把旧3d128…当build15真实物理身份。

Root fresh build16后按以上同test SHA重跑同4+4，要求分别4/4零skip/raw0，并核两新production SHA、fresh DLL及official package身份。这两源静态关闭各P2反例，**真实验证关闭仍pending**；原promise8、Fire/Aura原/新增、Native13及其它producer/预算完整类/16人整局各自范围保留，不将8项扩大为全部Game或Goal101验收。Native13我已成为作者，必须由另agent独审其新实现。

## 追加：build16 实际执行关闭

本段仅只读核验，先前pending为历史时点保留。**两P2在本文限定的4+4回归中已执行关闭。**

| run（同证据目录） | total/pass/fail/skip/raw child | log SHA256 | JSON SHA256 |
|---|---|---|---|
| split-lifecycle-witness-green-01 |4/4/0/0/0|905e992f8cf0d8e6ebd5572eb65c12ceb50d3891b601c96b4325ce2d89f4780f|315eacb0e492203d38e6af8ba679bdd01b155c696b791c1aff8128d6a8185d01|
| fire-cut-equality-green-01 |4/4/0/0/0|6fa43a18d14f52a63ee0f7bb5e390e3f8eb6154a58da8dda7b42af15788e9c2f|803582842010c24ce2b6cab23f3f08c1d9057a05f116c98ef3c234424f0cc68a|

独立重算两log SHA等JSON，raw `.exit`等JSON exitCode0；实际日志各4 succeeded、0failed、0skipped。两run test源码与RED完全相同：Split3f7cc4…807a7、FireCut9760c4…e3d0；生产绑定新Split ece2bad…c4cee、新Fire8d7e34…42933。TestDLL仍精确为RED的 `3ef591c202edf1faba6eac5225f9b2177c2fa8c9cad9c7a2f0e7d02f3b276910`，GameDLL换为 **`9043262095be360d48921a114d9fa2f41b1d1c6795b423bc41dd01f43e8ce685`**；当前实际物理Test/Game DLL重新哈希分别等这些记录。两run Ecs/Gas及official06 manifest身份与RED相同，没有用另一个Runtime解释通过。

实际构建元数据名字为 `build-16.json`（不是无连字符的build16.json），SHA `ffc149a6339d5d6acf2457657d83989d257d9365dd6768b46716d162cc59e3fb`；log SHA `9d647239911bd3336cb48fc9dc67e6903d4e4fa2f2c5d0c95d5de5fe00c6cfc5` 等JSON记录，raw退出0，日志0Warning/0Error。它没有sourceDriftAtEnd字段，本段不虚称该字段证明全树drift0；关闭依据为本文四个准确source/test身份、实际DLL与原始运行结果。

执行闭环为 Split3pass/1fail→4/4、Fire2pass/2fail→4/4，全部同测试身份/零skip，关闭callback时钟偷换和两个cut equality三个负控。仍不概括为完整Game、全部producer、16人整局或Goal101通过；Native13作者fixture等独立面继续各自验证。
