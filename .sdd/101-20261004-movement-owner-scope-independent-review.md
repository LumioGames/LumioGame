# 101 Owner scope 私有功能候选独立审查

裁决：ACCEPT_PRIVATE_FUNCTIONAL_OWNER_SCOPE_CANDIDATE_ONLY。本次审查无源码修改、无构建或测试重跑，读取已运行的 actual-baseline-02 及其真实 DLL/PDB。问题项：[]。

审查输入为 C:/Work/LumioGames/LumioGame/.run/movement-owner-scope-repair-01。当前 game-input 已追加移动提取代码，不能将当前整树当作该次构建输入。本审查用该次 PDB、movement-source-02 的三份精确旧字节和原3547项 input-source-manifest 重建边界；后续 MovementPredictionPublicationTests、新 common movement 源及 prediction01–07 不在本裁决范围。

## 三处 authored 变更

- Gameplay/Components/Bomber/BomberPlayerState.cs：before f932cb1ad1c390d2d519b1d0971ade0b8e069d8bedf03dfe68869a529bd73b17；after c97ab698fa35bd196f20e1089ae7b939b3b556ec6d5b56c8bcce691f7f9e1cf7。逐字替换及逆校验均成功。
- Gameplay/Components/Bomber/BomberParticipantState.cs：before 51c0c6ca3f96075dcdbe230d6f7eddbdf9807ffa681491983a925f3e35db71b5；after 0d552e6770b122a06a1dfe8b08ab2b4f48a3a96e3441725f99dcf61656faede3。逐字替换及逆校验均成功。
- eng/BomberRelease.props：before 3b93640e0a78b126c474764b4abe18a9d62835872efae6111f40452bd0cef2b5；after 8a401c8df039fab34f9de44598a9fe625ad3dcf2413fded7d79f1b05af29a499。逐字替换及逆校验均成功。

BomberPlayerState 七个 movement memory 字段从 Scope.None 改为 Scope.Owner；participant LifeGeneration 从 Scope.None 改为 Scope.Room；Authority.Server、Notify、类型、字段顺序、持久化、旧值与预算均未修改。第三处仅产品版本 schema15→schema16。其余3532个原输入在当时边界保持原 SHA（包含由三份 PDB 对应旧运动源备份恢复的边界）；没有据此声称当前可写目录没有后续改动。

## 十二份生成物完整差异

两侧均六份文件，原生成物与原 manifest SHA 全部对应，候选生成物与该次 Gameplay PDB 对应。BomberParticipantState.g.cs 仅 CapturePersist 新增 LifeGeneration WriteUInt64；BomberPlayerState.g.cs 仅同出口新增七个对应 typed writes，两侧组件文件字节一致，其他生成成员及执行逻辑原样。Registry 每侧仅17行变化：8个真实 ReducerStorage Scope、8个 FieldAttributeDeclaration 的 replicated/visibility 标签，以及一份 ReducerStorageSchema 摘要。attribute-declarations.json 每侧仅16个叶子变化，即相同8字段的 replication/visibility；valueType/persistence/ID 全部原样。

effect-operation-plans.json 每侧15个叶子变化：8个 physical storage scope、全图 schemaDigest 和5个计划引用 digest，Plan4 一处相同 LifeGeneration scope。GeneratedEffectReducers.g.cs 的五个计划已完整 Base64→长度校验→JSON 解码：Plan0–3 各仅 schemaDigest；Plan4 再含该 None→Room storage scope。去掉 plan constants 后源码逐字相同。所有 AST、effect IDs、字段 ordinal、执行码、预算、hook、fact/schema 声明、输入选择及其余叶子原样。旧、新 schemaDigest 均从完整 [layouts,storage,attributes,hooks,rows,facts] 重新 SHA256 得出，分别 fe0d4cdeaf399cdd0cf39b89cfb9bb1e21f64f3b4bc7ca2cf0d793d507f72e88 / fa939e3e145bc7909484857711fc4023cc49ef616557dff9bb42563135fc75b2；不是替换审核 hash。

生成语义来源：C:/Work/LumioGames/.101-pack07/LumioGameRuntime11Composition/tools/gen-declarations/CodeEmitter.cs:998–1005 的 Visibility 明确将 Owner 与 Room 映射到粗粒度 room-public 属性标签；物理 Storage scope 仍分别为 Owner、Room。EffectReducerLowering.cs:27–32、100–105 使用 Field.Scope 的 physical row 并从完整结构派生 schema。没有将 Owner 字段改为 Scope.Room。

## 实际功能证据与消费身份

actual-baseline-02 raw0；TRX 两个原 MovementOwnerBaselineTests 均 Passed、0 skip，源码 SHA 9b1023080619a77adc7c6b376136fcbd40c47adcd912de39fe955c276568209c 未改。第一案以真实 Native Server Gameplay 投影产生 baseline，经真实 loopback WebSocket/Replica 读取七个 owner memory 值；第二案读取该 baseline 的 generation 与 life 关系，真实 CanActivate 接受移动。Server projection 在独立 collectible ALC 加载，所需 SDK 共享到 Default ALC（BrowserSessionOwner.cs:163–169）。测试显式 server setup 且 initial authorization 是测试构造，不是已签 DS 准入，不能升级为真实八人/浏览器/预测移动验收。

三份 DLL/PDB 配对 GUID 均对应；Server248 documents 中246当前字节匹配+2旧运动源备份，Client167中166当前+1备份，Tests20全匹配；总435份文档无来源未明。Server DLL 3360024e01ecfe059fdf168fbc12d3bd75c8a005235fbec79c7289a8d0850dbc；Client Gameplay 17b25eef14e8e80f3119263dccc43561ea3e31fbe263eff5209eda657ff0a011；Tests DLL c76992f4f2ce8d189381546732010e2d857d0731f14ca437782f96cc0947112d。

实际 Native ac8afd5bf861d6818468434c51c22e94ef78863962d2a47e975046cb943767ff；完整11 manifest f058833a218241c49b5f35078fd839dbc130ef5d3bcf5b57dbbaf3419e241867；305 payload逐byte fence全匹配。三个 project.assets SDK version0.0.5-main.523c3d3，私有唯一 NuGet cache，SHA512 与完整11 archive 和缓存相同；127 cache entry逐byte匹配 archive。Server/Test输出36份 Lumio SDK/Client DLL均有完整11相同字节来源，未用源码或旧 DLL 替代。实际2977项 runtime data copy 均与 input/source manifest 的 byte SHA 对应。此处核对闭包 bytes 和源码 ALC 路径，不虚构新的逐 assembly runtime-load 日志。

actual-baseline01 的 FindGame 行政失败仍保存，不算语义 RED；其修复是私有测试数据根定位。审查首次读取已被后续移动提取删除的 current 路径触发 ENOENT，随后改为显式 post-build 备份/PDB 边界，未修改被审源码/产物。

## 保留门与范围

仅接受上述三 authored/十二 generated 当时私有功能候选。版本16的 schema migration、source pins 独立复审、正式产品发布身份与官方消费、新预测实现、完整八人同房双向移动/放弹/十次真实关闭重开、持续按键和性能验收均未由本报告放行。未修改 pins、原证据、生产源、服务或浏览器。详细机器结果：C:/Work/LumioGames/LumioGame/.run/movement-owner-scope-independent-review-01/qualification.json。
