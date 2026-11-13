# LunaMargin — three-minute demonstration / 三分钟演示

Updated 2026-11-13. Three minutes is a suggested presentation length, **not an official NASA video requirement**. The current public Resources list was rechecked; 2026 submission-format limits remain unconfirmed ([format check](RESEARCH.md#current-submission-format-check)). A separate [captioned browser walkthrough](media/lunamargin-walkthrough.webm) is available as a teaching asset. This route uses [default-case evidence](demo-evidence.json), [footprint comparisons](ROBUSTNESS_VALIDATION.md) and the [18-point fine audit](RECOMMENDATION_VALIDATION.md). UI cards round values; evidence retains full calculations.

## Opening state

- Campaign **June 2027**, site **ROI 6**.
- Arrival **2 June 2027, 06:00 UTC**, duration **7 days**.
- Darkness limit **24 h**, Earth-view gap limit **24 h**, required overlap **24 h**.
- Additional clearance **0.00°**, observer **2 m**.
- Click **View mission results**. Center cards show approximately **12.4 h**, **6.3 h**, **149.2 h**, **8/9**.

Query string for the local or published application:

`?campaign=jun&site=ridge-6&start=2027-06-02T06%3A00%3A00Z&durationHours=168&maxDarkHours=24&maxCommGapHours=24&minJointHours=24&clearanceDeg=0`

## English narration

| Time | Screen action | Narration |
| --- | --- | --- |
| 0:00–0:25 | Show ROI 6 and seven-day window. | “A promising lunar landing point can hide a difficult neighboring location. LunaMargin asks: where, when, and with how much margin? We connect NASA terrain and ephemerides to the continuous visibility gaps a mission would need to bridge.” |
| 0:25–0:55 | Show horizon; move time slider. | “We are at Connecting Ridge, starting June second, 2027, for seven days. This horizon comes from LOLA terrain. The Sun and Earth positions come from archived JPL Horizons queries. The time slider shows how those sources combine into visible and hidden intervals.” |
| 0:55–1:20 | Show center metrics and criteria. | “Our scenario allows twenty-four hours of darkness, twenty-four hours without Earth visibility, and needs twenty-four hours with both visible. The center passes: longest darkness is about twelve point four hours, the Earth gap six point three, and joint visibility one hundred forty-nine point two hours.” |
| 1:20–1:55 | Click **bottom-right footprint point**, east 25 m / north −25 m. | “Now move twenty-five metres east and twenty-five south. In this terrain model, longest darkness rises to about one hundred sixty-seven point five hours, with no joint visibility during the mission. Eight of nine samples passed, but this one did not. That count describes tested positions, not a landing-success probability.” |
| 1:55–2:25 | Click **Find a later date**; compare same-date cards and apply ROI 1 at 21 June, 12:00 UTC. | “The earliest all-nine passing options in this six-hour grid arrive on June twenty-first at noon. Both ROI one and ROI four pass. We put ROI one first because its weakest nine-point margin is about five and a half hours; ROI four has only fifteen minutes before its southwest point exceeds the darkness limit. We accept a later arrival for more room within the stated conditions.” |
| 2:25–2:50 | Return to the default southeast point, save the brief or reopen its share link; show the selected-point heading and source report. | “The saved result keeps this exact selected point and its applied settings. We also independently queried all eighteen positions in the two recommended footprints at five-minute intervals. Their pass-or-fail conclusions remain, but ROI four's fine darkness margin narrows to about ten minutes. The calculations and source records travel with the decision.” |
| 2:50–3:00 | Return to comparison. | “LunaMargin makes lunar planning assumptions visible and reproducible, for early mission exploration and learning. The code, data trail and validation are included.” |

## 中文旁白

| 时间 | 画面操作 | 旁白 |
| --- | --- | --- |
| 0:00–0:25 | 展示 ROI 6 与七天时段。 | “一个看起来理想的月球落点，周边可能面临不同的光照。月面余量回答：在哪里、什么时候、还剩多少余量？我们把 NASA 地形和星历变成任务需要跨过的连续可见性空窗。” |
| 0:25–0:55 | 展示地平线，移动时间。 | “这里是连接脊，从 2027 年 6 月 2 日开始观察七天。地平线来自 LOLA 地形，太阳和地球位置来自已保存的 JPL Horizons 查询。移动时间，能看到它们怎样形成可见与不可见区间。” |
| 0:55–1:20 | 展示中心指标与约束。 | “情景允许最长断光 24 小时、地球不可见 24 小时，要求共同可见至少 24 小时。中心满足条件：最长断光约 12.4 小时，地球不可见 6.3 小时，共同可见 149.2 小时。” |
| 1:20–1:55 | 点击放大框**右下角点**：东25米、南25米。 | “向东 25 米、向南 25 米。地形模型显示，这里的最长断光达到约 167.5 小时，任务内没有共同可见窗口。九个点有八个通过，这个点没有通过。这个比例描述取样结果，不能当作着陆成功概率。” |
| 1:55–2:25 | 点“帮我找更晚的日期”，比较同日期卡片后采用6月21日12时的ROI 1。 | “当前六小时网格中，最早九点全部通过的方案是 6 月 21 日中午。两个地点都通过，但优先显示 ROI 1：九点最薄弱的余量约五个半小时；ROI 4 西南点距断光上限只有约十五分钟。代价是更晚抵达，收获是所选条件下更宽裕的周边余量。” |
| 2:25–2:50 | 回到默认东南点，保存简报或新页面打开分享链接；展示当前点标题和来源报告。 | “保存结果会保留当前这个点和已应用的设置。我们还对两个推荐地点的全部十八个位置分别请求真实五分钟星历。通过结论保持一致，但 ROI 4 精算后的断光余量缩至约十分钟。计算过程与原始来源一起留存，方便复查。” |
| 2:50–3:00 | 返回比较。 | “月面余量让月球探索的假设看得见、可复查，服务早期任务探索和教学。代码、数据来源和验证记录一并提供。” |

## Recording notes

- These are body-center geometric results. Power, ground-station links and landing hazards require further models.
- “Earliest” is relative to the cached dates and six-hour grid. The 462-hour delay is 19 days and 6 hours.
- This case was chosen after inspecting data: an exploratory demo, not a held-out benchmark.
- Distinguish center metrics from the worst of the nine positions. The recommended order preserves earliest arrival and then compares declared margin components; it is a preference within the search grid.
- The original default ROI 6 fine check covers two positions. The new recommendation-window check covers all nine positions at ROI 1 and ROI 4: 18 positions, 36 raw responses, 2,017 epochs per position. All 72 point/angle pass-or-fail labels remain unchanged. Both audits use the same underlying DEMs and do not establish field accuracy.
- The stress angles are added to the chosen baseline. They are deterministic tests, not calibrated error bars or landing-success probabilities.
- Record the actual interface with units/captions. Call the input archived or cached NASA data, not a live feed.
- Include [AI_DISCLOSURE.md](AI_DISCLOSURE.md) in credits/description, including advance development. Label AI-generated inserted media visibly.
- The existing [public teaching video](https://slashzyc.github.io/NASA-universe-event/docs/media/lunamargin-walkthrough.webm) is a browser recording. Confirm actual 2026 limits before treating any video or this script as the formal submission demo.
- Official **Horizons System** resource matching was confirmed on 2026-11-13; registration, advance-development eligibility and formal submission remain separate statuses. Preserve the actual development timeline and AI contributions.
- Five-person novice test materials are prepared, but **0/5 people have been tested**. Do not describe the walkthrough or automated checks as evidence that novices completed the flow.
