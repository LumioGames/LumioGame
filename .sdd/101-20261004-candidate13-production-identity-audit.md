# 正式完整13消费身份与schema16包pin非作者审查

裁决：ACCEPT_ACTUAL13_CONSUMER_IDENTITY_ONLY；ACCEPT_EXACT_THREE_PACKAGE_PIN_VALUES_AND_APPEND_ONLY_EVIDENCE_CANDIDATE。实际完整包305 payload/无extras、8clean HEAD、三端SDK/Native引用与复合Bot加载配方、22 WebCIL、五份Game PDB的612文档和835普通发布文件核验通过。120个author/GEN原pin字节均未漂移。本报告不写共享pin，也不声称Platform分配/immutable browser bundle部署、任何真实联机或性能验收通过。

[完整独立证据](C:/Work/LumioGames/LumioGame/.run/candidate13-production-identity-audit-01)；消费者实际结果attempt-02/consumer-identity-result.json SHA a7a9e301f0560bc8034d6c86a417029a7b521972abf240402777def97ac140ea。原first attempt工具沿12假定13额外UI步骤，ui-typecheck.json不存在而中止，旧partial/script保留；不是13产品行为或构建失败。NEW02按真正13 producer四个dotnet步骤审核，不降低实际身份合同。consumer PE目录单独看single-file Bot插件依然raw1/缺五引用，原合同明确宿主外置，实际官方28+当前Gameplay+插件30配方0引用差异；不把目录扫描当执行ALC证明。stdout旧exists-key聚合输出pdbSourceChecks0是行政计数错误，完整记录与独立PDB输出确为612/610+2，无缺失或hash差异。

## 实际正式包与来源

版本0.0.5-main.523c3d3；manifest SHA 9a3289d2720efacee59e6f762b49771a6729fde53a9a5033e8fd9c016b1ff2c5；Native SHA 9f31f10938d4a3c856ea8d4bfccea0da2681fe606640402e4a18f65e42cfb2d2；SDK archive SHA f0ef1b6722f98e971a5eec9882061fb3b0f271810582eaeb7c79ed0fdb539e66。逐manifest305相对路径hash全部相等，物理306=305+manifest，无遗漏/extras/private诊断。SDK原nupkg解压13个net10 SDK managed与正式server Managed逐字一致，Native archive entry同正式新Native；各三端fresh assets/archive SHA512也同正式nupkg，未替换旧DLL。TFM与CLR定义/引用直接读PE metadata，SDK实际server13/Bot28/web20三个域全部0 mismatch，Game Server Application14与output14、browser Gameplay11/Host22也无引用缺口。

作者final seal SHA e4c718413b487494b9c5d3e62cb71a37f13800d90cccad0e007ba98e2044f413独立匹配，30原raw evidence完整hash/size均无漂移；作者自己的Default CLR/143 UTF8 frame qualification按其已有实际证据保留，本审查不重复执行，也不扩大为浏览器验收。

与完整12相比唯一source commit改变为LumioClient：38ead5ff3656b3b3fed8a0edbdbf07c34801cd2a→b9c2d415e09520c7946cc5eed8aec8a6c59244b1；其actual git diff精确仅Client/Engine/Wasm/EngineWasmCall.cs、Client/Engine/Wasm/EngineWasmPrediction.Selective.cs与Client/UI/Spectator/tests/EngineWasmPredictionHeaderTests.cs三条审核白名单。其余七source commit不变，八仓当前HEAD与input/manifest及Config authoring对应，status全部空。Client生产修法的Root非作者代码审查、UTF8 header行为证据与本身份资格分开；这里核实际已审来源进入完整13，未私自改源码。

## 实际Game消费与发布

真实build-server/client/browser及publish-browser四步exit0，记录log实际SHA与manifest13匹配；release.props选完整13和正式SDK版本，startup registry精确选择本次新Server Gameplay。

| 产物 | 实际TFM | SHA256 |
|---|---|---|
| server-gameplay | .NETCoreApp,Version=v10.0 | 3559b8234aa2b8dc7c8377322f5902a92732787eb31112299cc28fd7e4ee3043 |
| client-gameplay | .NETCoreApp,Version=v10.0 | b5cb8f2273cee162b04468d6776a0993b7964cba303459ee41bde222442da125 |
| bots | .NETCoreApp,Version=v10.0 | 62b6bf2082187e872b2cec103c0dbc33ff4ee298f451998441065c8be929a380 |
| browser-gameplay | .NETStandard,Version=v2.1 | 9079f99510aa78286825e9fc42b1e3d7576dd54d6c3b9799b250d0e38bdba494 |
| browser-host | .NETCoreApp,Version=v10.0 | abc64382f685d0d2b0d514e3233ba1479910a640002c7ad01c0924586b7840d4 |

PE CodeView/PDB ID五组对应；PDB612文档=610当前物理源码（含实际/_/ deterministic SourceLink路径映射）+2实际PDB EmbeddedSource生成物，全部checksum相等，end fence再次确认。没有将不可见生成物假作不存在，也没有借老PDB/旧输入来通过。

Browser Host的22 Lumio DLL逐文件精确等于本次Game两DLL或完整13官方20个netstandard2.1 payload；22份实际WebCIL都含对应PE metadata byte段及相等hash，记录实offset/length。普通main仍25765c149ee6f2f51e12ce2a26f0884506a691688b8e217a63e938067f170f3c，逐字等当前已审source，无诊断主脚本。新ordinary wwwroot835实际路径/字节完整冻结到attempt-02/ordinary-publish-frozen；inventory SHA b8e74d125b2faa72f847461ff0be7735749445b068247e50a26d73b87b098997（此独立JSON格式的SHA，非ZIP或Platform的bundleHash）。published presentation JS/CSS分别同当前dist及qualified12原byte；13 producer继承该UI而未重跑typecheck/test/build，本报告不称13新执行704UI测试。

## 精确包pin裁定

当前生产V16 strict byte门因旧包身份仍closed，current source68/GEN52全部原review hash吻合；历史V15原97-source闭包及110旧generated/locks只报告现差异（12/10，同完整12已解释的正式schema16迁移），不修改/迁移历史、ledger或门槛。

允许的新私稿只有下列三标量，以及追加本报告/实际消费者证据链：

| V16_REVIEW.package字段 | 当前完整12值 | 已独审实际13值 |
|---|---|---|
| manifestSha256 | 704b455b06a359c177ffff35ff2c076febc61b6340b777f7e4f9088d1ef6c766 | 9a3289d2720efacee59e6f762b49771a6729fde53a9a5033e8fd9c016b1ff2c5 |
| sdkSha256 | b103008d92bd53abe00fe6b3f82a6df947a3d99d0625ea3187fcd525ecf1509c | f0ef1b6722f98e971a5eec9882061fb3b0f271810582eaeb7c79ed0fdb539e66 |
| sources.LumioClient | 38ead5ff3656b3b3fed8a0edbdbf07c34801cd2a | b9c2d415e09520c7946cc5eed8aec8a6c59244b1 |

仅替换两字节hash而不更新Client provenance仍会被原requireV16Review以v16_package_sources拒绝；不能称两hash就足够闭合。版本、SDK路径、另六package source、68author、52GEN、schema/predecessor、select/require validator全部保留。本脚本将在NEW pin-candidate输出完整候选、inverse与审查Envelope；候选加本报告SHA及consumer结果SHA的append-only reviewEvidence，绝不写共享生产模块。原current12 review对当前13 bytes拒绝；精确三值候选对完整122实际输入通过；少了Client来源的新两hash候选仍拒绝；变更任一author实际byte的控制仍拒绝。该pure byte门是资格验证，不是新的游戏/Native测试。

最终迁入须Root自行核读production before SHA与候选Envelope fence，只更新上述三值和证据追加，并实际跑官方strict CLI。若其后任何生产/source/package漂移，应重新独审，不能用本报告覆盖其他修法。平台13 image与新18087 profile由另一路审查，不继承18086/12旧注册身份。

范围与限制：仅IdentityOnly，未启动服务、Native、浏览器、构建或广测；未声称十次关闭重开/双向移动放弹、长期DS运行、延迟/FPS或正式Publishing审批通过。所有正式12/旧故障现场、原partial/negative证据保留。
