# 完整14预测 authority capture 只读调查与最小实测接缝

本轮仅源码/已冻结数据调查，尚未取得新分阶段时长，未编译、未运行新Native/WASM实验、未改源或现场。当前能够证明每个闭合权威组的完整typed复制机制，不能把旧diag09的capture占比整体归给Native、JSON、反射或某个字段类型。

## 正式源与调用图

读取Runtime `C:/Work/LumioGames/.101-pack07/LumioGameRuntime11Composition`（完整14固定`520ffe482e1c48fb6e48187925eecec986cdb9c8`）和Client `C:/Work/LumioGames/.101-pack07/LumioClient14Composition`（`862f3ed231bdd0d8b9f9e953291222b2e07a67f7`）。两仓core/nav/architecture与Client prediction boundary均已读。完整14实际Game GEN仍受68author/52GEN资格闭合。

实际闭合组从Client `Client/Gameplay/Session/src/Internal/ClientSession.cs:963` 的 `PublishAuthorityGroup` 同时应用Section/ECS两半，经过 `Client/UI/Spectator/src/RuntimeJointPrediction.cs:51`，进入Runtime `modules/gas/src/Lumio.GameRuntime.Gas/Prediction/GasJointPrediction.cs:164` 的 `ApplyAuthority`。外层区间结束调用Rebuild，`GasJointPrediction.Selective.cs:294` 调 `WorldManager.RefreshJointAuthority`。

Runtime `modules/ecs/src/Lumio.GameRuntime.Ecs/Prediction/WorldManager.JointPrediction.cs:176` 的正式方法叫`RefreshTypedAuthority`。当前520ffe没有`ApplyTypedAuthorityFields`方法；后者可作未来测量桶名称，不能当现有API引用。

RefreshTypedAuthority先将旧贡献投影到cutoff0、刷新allocator、删除已不live的authority实体；随后遍历确认World.CreationOrder的全部live实体和每个生成组件，逐组件：

1. 创建 `AuthorityFields`，保留其scratch lease列表；
2. 调 `IGeneratedComponent.CaptureSync` 和 `CapturePersist`；
3. `World.CopyCapturedFields` 遍历已捕获值，调目标`IGeneratedComponent.WriteField(fieldId,value,silent:true)`；
4. 独立复制Observer projection，最终更新Tick、父Transform、terminated IDs，恢复原cutoff并投影/重建account索引。

这不是Client自己的玩法步进；GAS仍拥有既有confirmed/predicted投影和贡献历史。即使`_inputs`为空，仍须反映实体增删、同步字段、Tick、Observer和生命周期变化；不允许空输入直接跳过authority更新，也不新建影子玩法状态。

## 当前已经使用typed/生成代码

- `Component.cs:242/260/284`提供 `IGeneratedComponent`、`IGeneratedSyncMetadata` 和 `IPredictionFieldWriter`。metadata明确是无反射桥。
- 例如正式Game `Gameplay/generated/client/BomberParticipantState.g.cs:265` 在writer是IPredictionFieldWriter时，直接传入Sync.Value与容器对象；该文件226处CapturePersist对marker直接return。普通持久化/复制字符串路径不是这一typed分支。
- `World.CopyCapturedFields`（World/World.cs:1120）直接调用generated.WriteField。生成WriteField以Ordinal string匹配并调用SetSilent/容器AssignFromRemote，没有通用反射成员遍历。
- `AuthorityFields.WritePredictionField`先将attributeId拆出fieldId，再通过metadata过滤普通locals（container直接允许）；不是依据客户端UI或另一个Model状态猜字段。
- `SyncFieldCloneWriter`预算存在时调用`IPredictionSnapshotContainer.CapturePredictionSnapshot`，不会通过未知container不受控BoxedValue分配。未知Sync container会明确拒绝；不能为了优化走无预算分支。

因此“所有capture在整世界JSON序列化/反射复制”不符合正式源。JSON依旧存在于网络、存档、未知字符串容器解码以及表现导出，但不能因此归到typed authority主体。LogicTransform自身有特定字符串表示，其重复Persist捕获已由正式11收敛修复，不应再次以旧d8行为估算完整14。

## 可证工作量与尚未分开的成本

旧真实diag09八人报告 `.sdd/101-20261004-runtime-diag09-field-census.md`与raw/census已读取：A3 capture970.0ms、typed993.1、joint1019.6；B3分别934.1/957.4/982.1，均64组。capture约占joint95%，但capture桶包含结构、捕获、snapshot、计账、复制和Observer；这些inclusive桶不能相加，也未给每组件时间。八participant/八life/world基线合2588捕获条目、128生成组件、17record、528container字段/组。该计数不是unique字段、容器元素、分配bytes或时间权重，且是旧schema/window，不冒称当前schema16确切计数。

正式14静态源显示下列待区分工作：

- 每字段`AuthorityFields.WritePredictionField`与`CapturedSyncField.FieldId`均通过IndexOf/Substring拆相同常量attributeId，典型Game typed字段每组会重复生成短fieldId字符串。这里只证明操作存在，未量化CPU占比。
- 每组件capture list、scratch value-handle列表及标量boxing。当前scratch已用列表保存value charges，并非每charge一个disposable；不能重复提出已完成的旧修复。
- container snapshot的List/Dictionary复制与逐元素budget-aware size计账；目标AssignFromRemote通常再次构建replacement并保留capacity/element/type校验，然后更新typed layers。空container也可能产生对象，但不能由字段数换算实际allocation bytes。
- generated.WriteField及TryGetSyncField为string比较分支；typed `PredictionStateLayers.Location<T>.ApplyAuthority`已在值相等时return，但到达它之前仍有完整capture/metadata/复制准备。不能断言此后的状态底层每次都分配。
- 初始/新代次driver尚未挂载时的fallback clone与InitializeJointPrediction再次clone是另外一条路径。旧diag09确有init1/fallback1各2次clone；正式源TryRebuildPredictedWorld也有joint-null分支，但没有新采样就不能声称它是稳态每Tick路径或本次最大成本。

live14独审见 `.sdd/101-20261004-live14-experience-independent-review.md`：重绑outerTick1350.7ms对应591次Native调用、25HFSM/522clock，调用体合计12.3ms；不能用outer减Native或减observer得到某一层的净成本。Results/FinalCircle低工作量不能充当Running改善证据。

## 建议先做的最小私有分层诊断

建议NEW隔离Runtime树从520ffe开始，第一阶段仅两处既有源加一个新私有helper：

1. `Prediction/WorldManager.JointPrediction.cs`：RefreshTypedAuthority inclusive总；结构准备；每组件GEN CaptureSync+Persist；CopyCapturedFields；Observer/末尾索引；AuthorityFields.WritePredictionField的metadata过滤；ReserveFieldScratch和Dispose的scratch计账/释放。
2. `World/World.cs`：仅CopyCapturedFields内部已有generated.WriteField的累计时间/字段调用数。传入的value和调用次序不变。
3. NEW `Prediction/AuthorityCaptureCostProbe.cs`：固定桶及计数、Stopwatch单调时间、固定采样容量；不加Gameplay/Native/wire API，不记录字段值或认证信息。

不必改SyncTypes、GAS、ABI、GEN或Gameplay声明就能先区分捕获、field预算、目标生成写入。container与scalar的数量在原WritePredictionField收到对象时即可记类别；第一阶段不要为了细分而再读值、枚举元素、调用Native或把类型反射加入热路径。若这些桶仍无法定位再另审更细的SyncTypes测试接缝，不预先扩大源集。

建议精确flag1才启用，默认关闭；按当前owner线程作用域，每64个闭合组只测1组，最多64测量窗口/固定桶。每个被采样组记录已存在的world/authorityTick/实际observer epoch、实体数、组件数、field数、container数，以及采样组内原有调用次数；不能从sessionGeneration=1替代真实epoch。不要额外查询Runtime、改变时钟服务、吞异常或改变回放顺序。输出可为固定有界export/标准诊断渠道，不持有payload/凭据，不逐字段Console。去除所有诊断块后的原源逐字逆相等必须由非作者验证；它是私有诊断包，默认off亦不冒称普通发行性能。

timer桶必须明列包含关系：总typed包含structure+capture+copy+末尾处理；GEN capture包含Writer snapshot/ReserveFieldScratch；WriteField包含typed layer应用。不能把nested累计相加，不能净相减得“无observer”的绝对引擎成本。每字段Stopwatch会增加被测组成本，需比较同binary flagoff/on及独立普通包，不宣称observer为零成本。

## 真Native/WASM实验与资格边界

已有 `.run/wasm-v2-output-header-candidate-green-01/{fixture/Program.cs,driver.mjs,actual-wasm.mjs}` 与后续single-cell真实qualification提供正常生产C#→官方WASM bridge/token/cleanup的可靠接缝。它们原来只测试Native查询packet，不包含完整WorldManager typed authority；该CoreCLR C#→WASM Native管道亦不是托管C#运行在浏览器WASM的性能环境。可复用transport/正式包身份/生命周期设置，不把原read-cell GREEN冒称本实验已执行。

语义先在真正Native/GAS夹具验证，沿既有 `GasJointNativeTests.cs`、`GasFrameworkNativeSelectiveTests.cs`、`GasJointNativeDataWaitTests.cs`、typed/local/budget/restore case。必须NativeAvailable真实、0skip；正常default CLR装配，真实registry与Native session，不能用ALC忽略版本、手造handle/client私有field或fake authorizer。

浏览器性能RED需实际新Running八人场景（2human+6真实Bot、体素、20Hz、原额度），等待online readmission death修复后再测：

1. 无pending输入的稳定八人authority组、单queued真实move、covered确认及一次data-wait/retry，各自选窗口；记录实际包/epoch/应用Tick、采样组/clone数量，不把空输入等同可跳更新。
2. 同Run保留V9实际received头与C#已应用export、outerTick/rAF/Native原调用、私有fixed桶；以真实同一单调时间窗关联，区分冷启动、clone、重绑和稳态。
3. 普通完整包、诊断flagoff、flagon分别有独立身份及实际可比Running窗口；记录采样本身成本/遗漏与后台可见性。不得事后给旧Running原件补造新诊断时长。
4. 参考产品20Hz的实际50ms间隔，展示重复outerTick超过此间隔、pump追赶/长帧等真实失败数据；这是现有节奏参照，不新造正式预算门。性能比例/阈值先由数据说明，不能用合成codec case替代真机失败。

当前live14冻结的是read-only probes而非完整WorldChange/Section payload；其115件无法被当成可完整恢复八人Core世界的authority输入。既有143真实Host frames是最小successor fixture而非八人Game世界，同样不冒称“same8真实authoritycuts”。应未来捕获合法真实闭合组，或明确另立正常registry/Native构造的八人语义微实验；微实验不是DS准入/真人体验验收。

## 最小修复候选的顺序与风险

现在只可提出待证候选，不批准生产：先量化重复field-name拆分/metadata string分支、snapshot/replacement、budget charge，选择实际占主导的一项。当前生成typed读桥可复用，不能直接走WireCodec/JSON一套假更快算法。

如果考虑名字缓存，需要owner/registry寿命、有界且budget-aware、Ordinal比较、未知字段原fallback、卸载清理；无界静态字典不合格。若考虑直接metadata AssignFromRemote替代generated.WriteField，必须证明Sync struct别名、SetSilent、特殊LogicTransform父/空间更新和所有生成hooks相同，当前没有该证明。若考虑流式capture即刻写目标，旧实现先reserve整个组件才Copy，streaming会改变容量失败时的原子性/partial authority边界；必须真实低预算failure→retry、containers、local fields、destroy/remap/rollback与Native closed publication负控，不能仅凭快而迁移。

完整复制契约、合法生成locals、反作弊可见性、GAS历史/typed contributions、budget及Native256上限均保持。任何新GEN接口或schema字段都要所属Engine/API独审后官方完整包消费；本任务没有此授权，也没有实现。
