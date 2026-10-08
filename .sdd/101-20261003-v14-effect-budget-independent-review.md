# v14 Effect budget independent review

2026-10-03，非作者只读审查。范围仅 `Gameplay/Config/BomberConfigBinding.cs` 的五项 private EffectLimits 数值调整及其 v14 注册计划/初始化证据。未修改生产、声明、预算或生成物，未重建/执行 Native；本次仅写此报告。

## 判定

**五项 private metadata provisioning 调整静态 PASS；真实初始化尚未 GREEN。** 当前数值恰好覆盖生成计划的 registered non-status fact fields 和四个 reducer 的声明总和，未发现此 delta 的数值或契约问题。它不改变公开 EffectLimits/wire 合同，不扩大单个 reducer 的声明上限，也不改变 ready/status/full identity/claim/codec 校验。

后续文件虽名为 `startup-budget-green-01`，实际 **8 total / 8 failed / 0 succeeded / 0 skipped，raw child exit=2**，失败深入到 `EffectOperationValidation.Validate()`。因此不能将本次调整称为初始化通过，不能关闭 Outcome215/16人边界、10110死亡、各 producer Native 或整局验收。后续计划校验的具体失败 program/cost 正由 Root 调查；本报告不猜测根因或建议放宽 validator。

## 五项调整与实际依据

| Private limit | 之前 | 当前 | 独立核验依据 |
|---|---:|---:|---|
| ReducerWrites | 6000 | 7775 | 四程序 MaxWrites：1800+2160+3600+215 |
| ReducerIndexedWrites | 6000 | 7560 | 1800+2160+3600+0 |
| ReducerWriteBytes | 288000 | 372340 | 86400+103680+172800+9460 |
| ReducerWorkUnits | 3000000 | 4000000 | 四程序各1000000的声明和 |
| SettlementFactFields | 64 | 72 | 全部实际 fact row Columns 的 non-status registry field index 去重集合 |

当前源 SHA256 `879f48cf356c6d9557e40ae19a3ccab67be22f2251b2dccc094ef597bb77b7a7`，调整前 run-recorded SHA256 `a193bc749ff53509d9bfecbbe63be13f04c2621f0505ff49578f269e89a55331`。build03→04 和 startup red02→后续run的 sourceSha256AtStart 字典均仅此文件不同；当前 **354个 source entries** 全部匹配后续run记录。

LiveRows=`3 * ParticipantLimit`、PerTargetRows=3、ReducerFields=128、MaxReducerValueBytes=16、ReducerScratchBytes=65536 以及其他 Q/control/identity/fact reservation 值保持原值。生成计划实际 reducer field union=99、最大 scalar/entity value width=16、最大 program scratch=22576，均在这些既有预留内。这里的 work/writes 总和是 startup 要求的**声明合计**，不是对玩法可达最坏运行路径的证明。

当前 actual server/client `effect-operation-plans.json` SHA256均为 `46b284e18cd2990239753164764f6a1083bbf443d4123b3269a1bc27a8f3eb7c`，两端字节相同。此前独立核验的 `v14-plan-review.json` SHA256 `3f08c3a9c068a1a1c20581e52cd31c78b14d266106f6782f828baa759652af0c` 与 `v14-native-slot-proof.json` `1c7eec913f831cf2030b1a67302a8743e173d69b06907d7dd99fbf341feda393` 数值和实际计划一致：三个 row 为 damage24/fire26/health25；各除一 status 后23+25+24=72，且72个实际 index互不重叠。Fire row 为 Participant plan layout5/component10123/managed slot6/cap1；status10123/1 ordinal25唯一。Participant7 managed含Observer、实际状态bindings六个≤8。这个实际metadata身份不能由旧Player Slot或旧plan index替代。

## 公开规则与 source 复核

official06 manifest SHA256 `8f05d11aa64baae75e489b859f82a1e57ae300623769ba70f1eca778b8fa51b4`，SDK `0.0.4-main.0e2fc74`；manifest Runtime source为 `23356eafc365c753b6e8d9987fd069815ff067ce`。读取对应 owning Runtime：

- `EffectReducerPlan.cs:79–100` 建立 actual operation registry、独立验证 hooks/facts，并累计所有 fact rows 的 non-status physical fields；server startup 要求 SettlementFactFields 不小于该去重集合。源 SHA256 `cf917d15b66d9e286a4622ccd58c3a94c73ff8658615573e1122002756313ea7`。
- 同文件121–123行检查 reducer声明 writes/indexed/bytes/work总和、scratch最大值、字段union/valuewidth。现行四个程序总work为4M，旧3M并不满足这个检查。
- `EffectLimits.cs:43–45` 还要求 world write-byte预留足以覆盖所有写最大width及indexed supplement。源 SHA256 `350d7644f825e74fdb18d8477caaddec00e5ddee2a6f11c0f53764407c0ace30`。当前372340恰为 `7775 * (28 + 16) + 7560 * (32 - 28)`，不只是 plan-review 里偶然相同的数字。
- Engine公开 `effect-lifecycle-v1.json` SHA256 `2d44e039770920de13a8dd335278bcc34e2792dac9c9ff707731185009083102` 要求实际声明/registry派生预算与完整关联校验；此次更新只为既有私有注册metadata提供足够 world-local storage/work credits。

## 真实构建与 RED 身份

证据目录：`games/101-bomber/.run/v14-native-production-20261003`。以下log hashes均与JSON中的logSha256重新比对一致。

| 实际run | 原始结果 | JSON SHA256 | Log SHA256 |
|---|---|---|---|
| build-03 | child0，0W/0E | `521008bde0e91008dfa36fcaeecbd4f41fe92f285f03f3f22383eb27f8f1fdaa` | `b2ab9bf76fb4f7042fffe31adc4cccb163b88b50ab33166b9decff222eb8a5c6` |
| startup-budget-red-02 | 8 failed/0pass/0skip，child2 | `252f6ae2c55e5c8613946d595883a3b0c0ba533301bcb11c6fca2ec17592100f` | `227d539c8b6100340ad6fcf1c743c5bdf2f8908e51ad58bfb48d0b29734cbf09` |
| build-04 | child0，0W/0E | `a2a05f8a16f413f94172f990d0ce257b0a21dd7d84c05a727a4cdc34142bf754` | `035600d736845ed30ac2545cb3ae9918acbd910ca502e2c8ac486cee9bc7af11` |
| startup-budget-green-01（仅文件名） | **8 failed/0pass/0skip，child2** | `b3ac39105b57c7b4a3d5bef802e47b8485ff84057c516bcd8112726ef39dfe09` | `ebc08fe3a9f64affe4ad9e85b0e91b86816ec5b97f534e7ccf5506c93e0bf0a1` |

Root曾把外层 wrapper exit1当 child1，后明确纠正。报告采用两个层次：外层1是 Root报告的 orchestration failure；实际 test JSON/.exit 的 raw child是2。名称 `green`、build exit0、wrapper状态都不能替代 test summary/raw child。两个testrun使用相同 `*BomberEffectIntegrationTests` filter、minimum-expected-tests1，实际均收集8case。调整前首failure为CreateWorld→FreezeCore `effect_registration_invalid`；调整后仍是CreateWorld initialization failure，inner stack进入OperationValidation。尚未到业务断言。

build03/red02对应 Game DLL记录hash `d462398b1392dca75321a21d9f296a124e9bdd95eee4e0ecc3b8b1ba420eb488`；build04/后续run对应Game DLL `36718301ec294abef265fb94ee55806a72cee684b3bd63328c201692a4c42e42`。四份run均记录相同Test DLL `7ea3b4ce9307f757eefa65ccb847087c83e2dab70e361c80dba9dae5128fbfc6`、Runtime Ecs `74da7fff23e1aa72b8e8b7d0fd93c8164447c636de47700e254d8404c0648def`、Gas `09150ba27017867b418856227f3bb0a9c1f7e170b762f67a8ae48191295d6dbc`。后续run的四个当前物理DLL均重新hash匹配；旧Game DLL身份仅由历史run记录支持，共享artifact路径已被build04更新，不能声称本次重新hash到了旧字节。

选择props实际指向official complete-release06；manifest当前字节匹配上述官方SHA。测试EngineRelease模块初始化从实际restored SDK输出目录加载 Native，未回退其他checkout。当前输出Native SHA256 `419b74c7b5eac0f85a02ab58eda8485240194060dfd319e816ab35f501bfbfed`，build-info SHA256 `6d4dd945bad7f709704d9bbc686e72094c217ad3a735260a7273b8a3f9cac8ff`，buildId `11c2e285c29d498379df4a05261819ac`、ABI `c5f276c855bcb71fd9b04dcd546d1dd925ac408fd6303d56e30a2c044946a2f3`，sidecar binarySha256与实际文件一致。

## 未完成范围

需要保留原RED和这个未成功后续run，待 Root 找到真实 OperationValidation 阻断后，使用精确固定 source/program/test/Runtime/Native identity取得新的同范围成功证据。新源码改变后必须新build与新run，不能覆盖旧日志。本报告的静态PASS仅关闭“五个private limits是否按actual metadata计算正确”的审查问题；不能依据它宣称startup GREEN、新官方发布包、Outcome16人预算已证，或任何尚未运行的 producer/full-game checks完成。
