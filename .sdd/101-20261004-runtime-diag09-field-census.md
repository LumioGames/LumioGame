---
name: 101-runtime-diag09-field-census
description: 完整诊断09真机初始64脉冲窗口的inclusive阶段数据、真实生成字段census和Transform候选收益边界；排查浏览器管理成本时查
metadata:
  type: report
  status: 证据已封存
---

# 诊断09 capture 证据与字段构成

诊断09定位到管理端 typed authority 的 capture 区域：它包含实体结构准备、所有生成组件的捕获、容器 snapshot、scratch reservation、CopyCapturedFields、Observer复制，尚无每组件独立耗时。不能因总 capture 占比高就把全部成本归给 Transform。

原始数据是八人真实房间（A/B和6真实Bot），没有删玩家、关体素或降模拟频率。这里仅分析Root已保存的最初10个64脉冲窗口，两端各640个脉冲；不把同房间两端当独立玩法实验。Runtime helper 的clone/typed/capture/joint计时全部inclusive，capture内含于typed，typed内含于joint，不能把相嵌套总时长再相加。64脉冲包含首次/生命周期clone，实际typed组数因此可为62。netstandard客户端诊断本身及JS被动仪器仍有成本，正式无诊断体验须另验。

派生原文件逐字hash、每窗口数值和每个Game生成组件文件hash已保存于：
`games/101-bomber/.run/browser-experience-repair-01/live-09-diagnostic/phase-initial-capture-census.json`，SHA256 `0003fd9745a518c952ed981a31446b9ca4d91caaf4ea2c52dff2487a9115add9`。分析只读取原日志/源码，没有修改private diagnostic source。复算脚本 `.../browser-experience-repair-01/analyze-runtime-phase09.py` 是本地分析文件，不是生产包内容。

| 原始文件 | SHA256 |
|---|---|
| phase-initial-A.json | `9fd92779ac363f082658627f907995f70f4d2c225c48a35ba9b281023ac9eea5` |
| phase-initial-B.json | `7880f6133a9febB622184a4c5f309b4021b73ffd60f11e0581a91750635ca168` |

## 时间和计数原义

| 样本窗口 | typed / capture / joint 总ms | capture均值ms/权威组 | capture占typed / joint |
|---|---:|---:|---:|
| A3（64组） | 993.1 / 970.0 / 1019.6 | 15.16 | 97.67% / 95.14% |
| A4（64组） | 822.4 / 805.2 / 846.3 | 12.58 | 97.91% / 95.14% |
| B3（64组） | 957.4 / 934.1 / 982.1 | 14.60 | 97.57% / 95.11% |
| B4（64组） | 803.9 / 786.7 / 826.9 | 12.29 | 97.86% / 95.14% |

最初clone实际各2次：A init1/fallback1合计189.1ms、最大98.6ms；B173.6ms、最大89.7ms。A7/A8又分别clone2次75.0/88.4ms。初始clone存在重复路径，但此capture候选不改它。后续单组capture约11–16ms；最早冷窗口约24ms。各桶max是方法实例，不能直接等同整个浏览器Tick最大值或rAF gap。

Helper 的 `fields` 来自 SyncFieldCloneWriter.Fields.Count，它是**列表条目数**，包括相同键的重复捕获；不是唯一字段数、脏字段数、元素数、字节数或时间权重。`components`是逐record每个IGeneratedComponent处理次数，`transforms`是其中LogicTransform数量，`typed.units/capture.units`是遍历记录数。这些计数处于正式07数据模型真实刷新路径。

## 为什么每组约2,500–3,000条

读Game正式client生成 `CaptureSync` 的prediction分支及实体template，再对照Runtime手写框架组件，最初B窗口精确闭合：

| 实体类别 | 每实体捕获条目 | 每实体container字段 | 每实体IGeneratedComponent |
|---|---:|---:|---:|
| participant | 160 | 33 | 6 |
| player life | 147 | 26 | 9 |
| world | 132 | 56 | 8 |

八participant×160 +八player×147 +world132 = **2,588条/组**；生成组件48+72+8 = **128/组**；记录8+8+1 = **17/组**；Transform8/组。真实B第一窗口62组恰为fields160456、components7936、records1054、transforms496，四个计数同时吻合，不是只有一个总数巧合。

participant六个生成组件分别34、16、48、12、24、26条，container共33；player生成Identity/PlayerState/Skill/HealthFacts/SuccessorLife合120条及25containers，再加LogicTransform8、Attribute六ledger的12sync+6persist、Effect finiteRows1、Ability0，共147条及26containers。world七个Game组件合130条，WorldSave同步和普通persist各写一次tickRate，共132条。

因此即便没pendinginput，刷新也逐组遍历完整已复制ECS状态。8人基础即有528个container字段snapshot/组（8×33+8×26+56）；空container也占一个条目。Bomb、火区、拾取等动态实体存在时继续加字段，窗口平均Transform约8–13个、字段约2,500–3,000条合理。原日志没有container元素、实际分配字节或每组件耗时，不能把528条直接换算为分配量/毫秒，也不能据此删生命周期证据或玩法字段。

## Transform最小候选的准确界限

d8手写LogicTransform CaptureSync四字符串 + CapturePersist同四字符串，两遍均追加捕获列表、构造字符串、收取scratch并复制。每个Transform重复4条，所以这些最初窗口中冗余Transform条目为**总列表计数约1.24%–1.69%**，不是总CPU比例。四字符串的构造、长度、姿态解析和协议写入成本可能与普通标量不同；没有独立计时，不能静态宣称毫秒收益或主要瓶颈。

Root授权的第一候选仅在LogicTransform.CapturePersist遵守既有IPredictionFieldWriter marker，保留完整CaptureSync，消除第二遍复制/租约。它已有真实容量RED和正常状态/真实Native GREEN，见 [候选作者交审](C:/Work/LumioGames/LumioGame/.sdd/101-20261004-transform-prediction-capture-author-review.md)。该修复的字段计数减少可确定，浏览器CPU/长帧改善仍须经独审和官方完整包比较证明。没有因capture占总typed大部分就把全成本归它。

若完整包比较收益不足，应保持现在明确的阶段边界，再从真实全capture下的字段大小/容器、反射复制、每组scratch预算和重复authority工作分别定位。必须先实测，再选择有语义RED的所属仓最小修复；不得以关闭预测、删字段、降低模拟频率或放宽quota掩盖。
