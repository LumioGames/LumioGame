# 101 Resume9：当前圈内后继生命落地（完整回归已通过）

源码唯一写者 GTCG，精确基线为 Resume8 immutable read-index。8文件，patch `games/101-bomber/.artifacts/resume-20261002/resume9-spawn.patch` SHA256 `ca1dd3230b4a56b0f0e276819101899beec995e94d488b96b36200dcf2f369fd`，16154 bytes。源快照在同目录 `resume9-spawn/replay/games/101-bomber/`；`resume9-spawn-proof.json` 含逐项before/after和实际git apply --check/apply精确验证；`resume9-frozen-read-index.json` 继承完整可读来源。绝对基目录 `C:/Work/LumioGames/probe/bomber-terrain-growth-credit-corrective`。

## 已实现

- 真实旧生命伤害/销毁→Runtime观察/创建/Restore Effect→真实transfer Applied仍保持；Game消费Applied才把CurrentLife与generation接回。未出生时保留既有DormantLife+ReservationSlot0的持久意图，当前Life处于Awaiting，实际PlaceBomb CanActivate拒绝；不制造新的Runtime结果/Host/位置真值。
- Native圈HFSM先推进，再重新遍历当前Native批量读。稳定顺序枚举候选、确定性引擎随机流选取，Manhattan距活人/未过期弹至少配表6格、陆地、圈内完整L形3格。距离变换O(map area+threats)，无随机重试、无逐步放宽或中心强塞。支持transfer在生效前一Tick/同Tick/迟到，落地以Game消费时当前圈为准。
- 没有候选保留资格，按下一业务帧现图重查；已提交软清理后若新威胁抵达，Original只确认清理、不强迫旧落点出生。
- 必要时只清≤2垂直软臂：新增SpawnClear=6保留旧1..5，复用既有持久Native事务列/4096B详情上界。无绑定软砖、完整当前Participant/Life/generation、精确原提交Tick/地址、垂直两臂、零奖励/统计；仅Original后重查并落地。预算拒单可正常重试；paired pending恢复不重复写。
- 截止仍待出生者由既有权威Outcome reducer结案；结果读取权威Participant的EliminatedTick并记录实际现存CurrentLife与generation，身体投影不能把终局重新覆盖成Awaiting。既有Effect预算/生成计划均不变。

## 原测试修复依据

新增出生选择暴露旧财富fixture的矛盾前提：全地图水上仍要求新Life可操作。design §5和kernel:216要求无合法点保留资格。替换为唯一合法L3陆地，3个满血Health测试输入占住掉落格；满血不能自动消费，它们不是原债务。保留原跨Match、原Life/generation、数量、分批落地、容量边界和3局全部断言；精确增加3个独立Health输入的数量/来源断言，债务释放前把活人移离测试区避免立即真实拾取。没有提升容量或清债推进下一局。

## 验证

- RED `resume9-circle-respawn-native-red-02` 2/2：Applied完整身份与HP6已通过，仅x=1不在13圈[3,15]。
- RED `resume9-circle-respawn-native-red-03` 3/3：另含无陆地却Protected。
- RED `resume9-soft-arms-native-red-01` 4total/3pass/1fail：无软臂清理；对应4/4绿。
- 早期full `resume9-early-full-regression-01` 670total/667pass/3fail/0skip exit2：上述旧财富前提与未落地结算Tick错误，均保留原日志。
- 严格Applied前提的deadline RED `resume9-applied-deadline-native-red-01` 7total/5pass/2fail；修复后7/7绿。早期缺少实际Applied前提的6/6和delay0失败日志保留，仅作fixture诊断，不替代最终证明。
- 伪造两臂同轴 RED `resume9-boundary-arms-native-red-01` 12total/11pass/1fail；最终 `resume9-boundary-arms-native-green-01` **12/12、零fail/skip、exit0**。
- 旧财富 `resume9-wealth-land-native-01` **6/6**，后继消费 `resume9-successor-wealth-native-01` **7/7**，均零fail/skip、exit0。
- server/client net10及browser netstandard2.1：零警告错误。`resume9-schema-generation-proof.json`证明官方重生成98文件及ledger共99文件与Resume8字节相等；634active/4490retired/13transitions不变。client/browser Gameplay DLL同Resume8逐字节相同；全量测试启动同时客户端重建也保持原实际DLL SHA，非变版混测。
- 最终 `resume9-circle-respawn-full-01` **678/678，零fail/skip，exit0，5m08.089s**；`resume9-tools-full-01` **385/385，零fail/skip，exit0，295.319s**。`resume9-verification-proof.json` 将最终源、DLL、日志和生成身份逐项关联；早期6/7窄测是历史回归，最终完整678重覆它们，不把旧DLL当最终版本。SDK a5fa官方nupkg身份/Native与Resume8相同，原包Native SHA3ab8500d...，不是最终fullrelease。

## 集成与范围

只允许8文件窄三方合入；Root BombSystem日志wrapper要保留。无RootUI/Tools/props/config/SDK改动。真实测试是Runtime Native owner carrier，不冒充Platform/DS整局或浏览器视觉验收。原始大厅/下一局初始固定出生、强箱、再生、六形态尚需继续；periodic fact公共裁定与12/16准入仍未授权，未用Game定时器绕过。Root全交付目标仍未完成。

冻结二进制：E/resume9-binaries 3054文件/38,581,711B，manifest E/resume9-binaries-proof.json；TestDLL SHA256 442972815b799cae525143c549752c9a10fec60e7f98240cfd1915ed6604522c。源码proof SHA d1a435c401cc9e75b366a6e5d7adea4a698c830e29a7f946b6aaf6bc95f1eb65。已完成本切片，不代表完整正式交付。
