# 101 Client successor correlation — 独立审查

结论：**spec review 通过；quality review 通过；未发现本候选引入的 actionable finding。** 这只裁定 Client correlation 最小修复，不代表 Goal 101 完成、全 Client 验证通过或产品整局验收通过。

审查者为 fresh 非作者 reviewer。只读候选代码、官方合约/模型、原始 capture 和已有日志/产物；独立运行低内存 Node 模型验证。没有运行 dotnet、Native build、打包或修改候选源码/测试/生成物，也没有提交。

## 精确候选

- owning worktree：`C:/Work/LumioGames/LumioClient-101-successor-correlation`
- branch：`codex/101-successor-correlation-client`
- base/HEAD：`69b848f064ca44082f833894fd686eac0797cd24`
- freeze manifest SHA256：`c7e23b9915b52ce817481b5e49889fdc377cdfcf31cfb1e0b274a6e931275ddf`
- freeze patch SHA256：`94070e6c7a0b2f884d8246500b475bc6c9c60b39bbbbaf3b37bf9d8b310bba42`
- 作者报告 SHA256：`aa1aa907a279955329cd27dc29e76fa469645401f65b84059113b4156fe6d7e1`

以上三个 hash 均独立复算匹配。manifest 中 10 个当前文件和冻结 after 文件全部匹配；已有文件的冻结 before 全部匹配；red-input-02 的 10 个源文件匹配其记录。生产 diff 只有 [SuccessorAdmission.cs:122](C:/Work/LumioGames/LumioClient-101-successor-correlation/Client/Gameplay/ECS/src/Public/SuccessorAdmission.cs:122) 删除 `next.CorrelationId == current.CorrelationId`；没有公开合约、编号分配器、ABI 或 Owner 容量修改。独立执行 diff whitespace check 和冻结 patch reverse check 均退出 0。

## Spec review

先读了 Game 与 Client 的 core/nav、仓库边界，以及 Client session/section 消费知识。公共判据直接读取 Engine freeze0e：HEAD `0e2fc74783f9f186d59909b38d4ee70887a21137`，该 Engine checkout clean。

- [successor-binding-v1.json:1193](C:/Work/LumioGames/LumioGameEngine-101-release-freeze0e/engine/wire/successor-binding-v1.json:1193) 的 initial correlation 是 exact pending admission requestId；transition 是实际 correlated requestId。authority.sequence 的防重放是单 pending、checked sequence、完整 previous 和初始/转换重复规则，没有相邻 correlation 不等约束。
- [verify-successor-completion.test.mjs:39](C:/Work/LumioGames/LumioGameEngine-101-release-freeze0e/eng/verify-successor-completion.test.mjs:39) 的官方 authorization helper 明确对 initial、observe、transfer 共用 `g.requestId`；四 profile 测试完整消费三段，并拒绝转换 replay 与 advancement 后 initial。独立运行该四项模型测试：4/4 pass，0 skip，退出 0。
- [verify-successor-authority.mjs:186](C:/Work/LumioGames/LumioGameEngine-101-release-freeze0e/eng/verify-successor-authority.mjs:186) 的官方 receipt model 对后续 envelope 检查绑定的 admission/connection/World/incarnation/Participant/effect authority、sequence、完整 previous、非递减 revision；不要求 correlation 改值。Welcome 使用 pending correlation 做 exact transferId 比较。

官方 wire SHA256 `148fe1d1f21ead99b748f079595c3bc27239bc998995be1654f0554a71213331`；authority model `5b3f0a985e1ee9eeb4c5051319844f05349ec7375938e23d582f19b4fa1fcbbe`；completion test `17304bbe705ecf8f9c9348e76373fd9dd7612044763da04cec1232a3a5cd2ae9`。

因此本修复去掉的是超出官方语义的拒绝条件。correlation 的相邻相等不等于授权重复；实际重复仍因 sequence/previous/pending/Welcome 消费规则拒绝。没有据此放宽 correlation canonical 非零范围或允许 wrong Welcome transferId。

## 原始证据与质量

原 capture SHA256 独立复算匹配：`aea795718d43044893e703efd44e2c856fed25716f77bda8db64cc3e4104cb1e`。没有打印 capture 首行、请求头、票据或完整 payload。

四 fixture 分别逐字节匹配 capture 中连接 3、对应 UTC 的唯一 server-frame；并独立复算 SHA256：initial authorization `4c196b082b00dfb3355113d1783b72eb547d6b8450cf2a6687f7b02f8ce9277f`；initial Welcome `3f1cedda8fcbc9e79529cebbe30f2d6864de3a0f0820c98bb41be591c5810034`；observe authorization `c578793165dd67261d7fbe4ad7f9c7903867fd16da4fed718f0b8a774e8d1c83`；observe Welcome `90d5e5a61101105aeb059628a4517b886303fa3a83d9b3451774ff4ec95a2b97`。

把这四份原字节独立交官方 receipt model，得到 `Pending → Initial → Pending → Transition`；最终 sequence=2、inputEnabled=false。observe authorization/Welcome replay 和晚到 initial authorization/Welcome 全部拒绝。这是 independent oracle 验证，不依赖作者的原因报告。

真实 WS 回归读取并校验原字节 hash 后，将其作为 LoopbackWebSocketServer 的真实下行消息，由 WebSocketClientConnection 在 exact subprotocol 协商成功后签发生产 private receipt；测试没有向 Session 注入构造的 authenticated capability。Session 的 DispatchSuccessor 仍检查 receipt owner/bytes；receipt 仍只能消费一次且绑定一个 consumer。测试的 codec fixture 只负责数据编码。单元层的内存 receipt helper 已明确注明不认证远端。

真实 NativeHfsmTestContext 和 GameplayFixtureWorld 的 Native Engine/World 用于 Session/Replica；WS 回归检查 initial baseline 前 input 关闭、initial Active 开启、observe manager 替换与 input 关闭、观察态禁止上行、transfer baseline 后 epoch 3 input、旧 manager/旧 life 失效及旧 epoch 拒绝。四 profile 的同编号三段路径都有覆盖。没有新增旁路状态机、假 baseline 成功或 receipt bypass。

新的四 profile 负控在同 correlation=4 的 observe 场景拒绝 replay/gap sequence、wrong previous、pending 替换、wrong Welcome transferId=5、消费后 authorization/Welcome replay，并验证没有 manager 变动。旧测试中的“correlation 与 initial 相同即非法”改为 canonical 非法的 0 是修正旧错误预期；其余 admission/connection/incarnation/Participant/revision/previous 拒绝断言保留，新增 valid correlation 4 + wrong Welcome 5 独立负控。production 的 complete previous、epoch codec、profile、connection、authority、receipt 和 Welcome 检查均未改变。

## 冻结执行证据核验

下表均由实际 TRX 读取，notExecuted=0；七份 log/TRX hash 与 freeze 一致，各 runner JSON 的 child exit 与 freeze 一致。最终 RED/GREEN 使用同一份 LF 测试/helper/csproj hash、同 Runtime successor 源 hash `18013d7e0ff369d1de55b054da4768f275292e317cd52dc1539297dadd21dca0` 和官方 06 Native。

| 证据 label | total | pass | fail | child exit |
| --- | ---: | ---: | ---: | ---: |
| correlation-final-socket-red-01 | 9 | 4 | 5 | 1 |
| correlation-final-socket-green-01 | 9 | 9 | 0 | 0 |
| correlation-final-ecs-red-01 | 27 | 23 | 4 | 1 |
| correlation-final-ecs-green-01 | 27 | 27 | 0 | 0 |
| correlation-final-ecs-all-green-01 | 352 | 352 | 0 | 0 |
| correlation-session-all-green-01 | 262 | 261 | 1 | 1 |
| correlation-session-all-test-native-01 | 262 | 262 | 0 | 0 |

RED WS 五项失败正是四 profile 同编号与一项 captured 回归；RED ECS 四项失败正是新增四 profile 同编号负控/正常消费回归。其余原有用例在 RED 已通过。red-binaries-02 中 WS 52/52 DLL、ECS 47/47 DLL hash 对应最终 RED 运行记录；当前 GREEN WS 52/52、ECS 47/47 对应最终 GREEN（及 test-native/full-ECS）记录。

官方 06 Native 文件实测 hash `419b74c7b5eac0f85a02ab58eda8485240194060dfd319e816ab35f501bfbfed`。Session 官方 Native 全量唯一失败真实 testName 为 `SessionStateMachineTests.FailedDefinitionDisposalCanBeRetried`，TRX 错误为 `EntryPointNotFoundException` 缺 `lumio_engine_test_get_hfsm_api_v1`，原失败保留。测试专用 Native 文件实测 hash `d69b728b2b90954655bbad157f19e1e1000fcefc0183dd4f660576a410ea6806`，sidecar BuildId `98f0b5cc59921aee988143d9c99b26ba`、source fingerprint `f428fdf38fef4e0754b54b67e5fcd1eefb3bd1128af83893ecefc9113e112f1a`、ABI `c5f276c855bcb71fd9b04dcd546d1dd925ac408fd6303d56e30a2c044946a2f3`、feature `hfsm-test-support` 与 freeze 相符。这份产物只解释测试环境补齐，不升级为生产 06 Session 全量通过。

## 裁定范围与限制

该 Client 最小候选可交 Root 后续 narrow commit/组合验证；无本候选代码返工项。受影响 ECS 全量 352 项通过，受影响 Session 全量仅在测试专用 Native 下 262 项通过，严格 WS/ECS regression 在官方 06 Native 下通过。

审查者没有重新执行 dotnet；上述 .NET 结果是独立审计已冻结的执行证据。完整 Client solution build/suite、全 Client format、完整新 Release 包、Game Remote 回接与真实整局 tour 不在本审查范围，也未完成。captured 回归仅 initial/observe 四原帧真实；后续 transfer 是明确合成的既有 fixture，baseline 使用 Runtime GameplayFixture schema，不是 Game 全量 baseline 重放。没有通过本修复评判 Runtime 容量候选、Owner 四项或产品验收。Goal 101 仍未完成。
