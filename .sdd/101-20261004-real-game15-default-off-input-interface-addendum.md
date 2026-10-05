# Game15 off 输入接口术语补充

更正已封报告 `101-20261004-real-game15-default-off-cost-comparison.md`（SHA256 `9c90dcf37de812ade63916526500d01324bc83f1abb47c1ec064ab3fbd151b99`）中「30次 native UI down/up 请求」的接口标签：off `05-input-window.json` 的这30次请求实际是 Root 通过 CUA 的 documented Playwright `locator('#presentation').press('ArrowLeft/ArrowRight')` 执行的真实 UI 聚焦及 keydown/up。原 window.scope 是 `Real UI press down/up requests; A already AwaitingRespawn, life changes retained; no held-key claim`。

off 中 `pressKey(null,'Left')` 的 Native wrapper 请求只属于单独的 `04-native-after` 阶段；它没有被算进 off05 请求数。on05 才是此前报告的 Native wrapper 请求。此次新增补充不覆盖原报告、原分析或 seal。

30个真实 UI 请求、19.016s requested window、最长4.260s cut-gap、A0 exports/0 sends、B14 accepted exports/13 sends以及 header receive 时间数值保持原分析结果。接口标签错误不能成为 Game 行为 RED。缺少双人连续15s输入/已应用ACK证明的限制也不变。
