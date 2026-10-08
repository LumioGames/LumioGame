# V10 Call Boundaries Revision02 Plan Supplement

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留01原件，修正观测额外读有副作用adapter getter和混合行尾接缝两处私有准备问题。

**Architecture:** NEW02五文件位于 C:/Work/LumioGames/LumioGame/.run/browser-experience-observer-v10-02；保持已批准的两JS whole inverse、V9层和五export/handle/world边界。只将新增context getter改成局部renderer缓存localId，并精确选择原LF或CRLF边界。当前仍不执行自检或生成。

**Tech Stack:** 原Node ESM / node:test / node:vm，普通Game17 source/main81a746/game-viewcf510201及V9 c152，完整引擎16。

## Global Constraints

- 原 C:/Work/LumioGames/LumioGame/.run/browser-experience-observer-v10-01五文件和原计划a50cce…全部保留，不覆盖。
- 生产/普通/已serving源不改；无835 materialize、构建、服务、浏览器或真实V10测量。
- 原GameView里的adapter.localPlayerId两表达式原文保留：条件比较及localId赋值；新增context不调用getter。
- localRendererSurrogate只读旧局部localId：允许undefined/旧值，与新adapter不同不补读、不倒补，不转participant。
- 两文件完整逆变换不得normalize原mixed CRLF/LF；严守原固定source hash和接缝数量。
- 01作者Node helper失败是行政接缝失败，不是产品RED或真实浏览器失败。

## 核实事实

真实 C:/Work/LumioGames/LumioGame/games/101-bomber/Client/Presentation/src/replica-adapter.ts SHA d89e22570469574b759398ecf39cd00202a7e2cc83f1c822504063f8c3aa939c：32行getter调用handle，46–53行missing key递增nextHandle并写Map。project在113/117行更新localParticipant后，126行附近JSON.parse(frame.events)仍可能抛错；正常原GameView尚未读getter，01后置context却可能建立新映射。

真实GameView46–49行只有原比较和赋值两次getter表达式。02仅观察已缓存localId，不要求它与最新adapter.localParticipant同步；rawparticipant/Self、frame Self和对象观测ID依旧分别记录。

Reentry实际执行01原10tests结果 raw1 / 7PASS / 3FAIL / 0skip，失败为makeV10的LF-only wrappedBody端标记匹配，不曾生成after，未执行产品。原件保留 C:/Work/LumioGames/LumioGame/.run/v10-call-boundary-independent-review-01/author-ten-tests.log 和实际result。

源读实证：refresh→close函数边界为LF；close→applyDump为CRLF；pump→obtainLaunch为LF。02从原终点marker和其CRLF变体中要求且只接受一个实际出现一次的候选，保存selectedEnd原字节及完整before/after。

## Task 1: NEW02源码修订与审核

**Files:** NEW02 v10-probe-extension.mjs / v10-transform.mjs / instrument-v10.mjs / v10-inverse.test.mjs / source-read-notes.md；本NEW补充计划。

**Interfaces:** 保持makeV10/invertMain/invertGameView签名；context字段改为localRendererSurrogate；wrappedBody seam增加endMarkerVariant而原源不normalize。

- [x] 核实getter有写映射的实际异常边界。
- [x] NEW02 extension字段白名单及两插入context都只读localId；原两个getter表达式保持。
- [x] NEW02 wrappedBody要求唯一LF/CRLF候选并完整存原/后字节。
- [x] 新增两个待执行的actual delegated GameView VM案例；原10case/断言保留，mixed行尾inverse断言补强。
- [ ] Root与Reentry读NEW02具体diff并准入有限纯验证。

精确新增context表达式：

```js
localRendererSurrogate:localId
```

精确候选选择源码完整位于NEW02 v10-transform.mjs：

```js
const candidates=[...new Set([endMarker,endMarker.replaceAll('\n','\r\n')])];
const matches=candidates.map(marker=>({marker,count:text.split(marker).length-1})).filter(row=>row.count!==0);
assert.equal(matches.length,1,'Exactly one original LF or CRLF boundary is required');
assert.equal(matches[0].count,1,'Original boundary must occur once');
const selectedEnd=matches[0].marker;
```

## Task 2: 准入后的有限自检（当前NOT_RUN）

- [ ] 获准后仅运行NEW02正常tests并保存独立raw/result：

```text
node --test C:/Work/LumioGames/LumioGame/.run/browser-experience-observer-v10-02/v10-inverse.test.mjs
```

预期12case/0skip；当前无执行结果。实际原GameView body与transformed body都通过VM运行，进口renderer/adapter为明确fixture：首次getter1、稳定后累计2、换本地renderer后累计4；dispose无增加，original thrown object相同，project改participant后抛错不得补新映射，真正原getter抛错仍按原次数与对象传播，输入callback调用0。

该VM只验证实际GameView调用接缝和getter次数，不是真Native/全部TS adapter行为或真实浏览器资格。两个ordinary文件和V9 prefix whole inverse在纯源码测试里验证，任何helper失败原样保留，不删断言。835/监听/实测继续另候Root授权。

## 当前状态

PREPARE_ONLY_NEW02_NOT_EXECUTED。原01行政raw与副作用风险保留，不把02源码准备称GREEN；两人六Bot、普通UI/SDK/Native、协议与额度均未触碰。
