# LunaMargin — project submission narrative / 项目提交文案

Updated against the application and saved evidence on 13 November 2026, America/New_York. This narrative is not an official submission. The named NASA resource match is confirmed. Team registration, current submission-format requirements and an organizer decision on advance-development eligibility remain unconfirmed.

**Development timeline:** the owner requested full implementation before the official event after receiving the published warning that advance work can lead to disqualification. Preserve this disclosure. See [AI_DISCLOSURE.md](AI_DISCLOSURE.md).

## English

### Project and challenge

**LunaMargin — Every landing needs a little margin.**  
Challenge: [Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/)  
Repository: [NASA-universe-event](https://github.com/slashzyc/NASA-universe-event)  
Live application: [Open LunaMargin](https://slashzyc.github.io/NASA-universe-event/) — public deployment verified, including data loading, worker search, source links and all three exports; [production check record](production-validation.json).

### High-level summary

A promising lunar landing point can hide a difficult neighboring location. LunaMargin makes that difference visible. It combines NASA LOLA terrain and NASA/JPL Horizons ephemerides to compare continuous darkness, Earth-visibility gaps and joint Sun/Earth windows at three published Connecting Ridge research points and nine nearby positions per point.

Users choose dates, a mission duration and tolerable interruptions. They inspect the local horizon, move through time, compare neighboring samples and search cached dates for a window meeting their conditions across all nine positions. English and Chinese interfaces, a guided tour and downloadable HTML, CSV and JSON evidence make the reasoning accessible and portable.

### Working demonstration

At ROI 6 from **2 June 2027 06:00 UTC for seven days**, set a **24-hour darkness limit, 24-hour Earth-gap limit, at least 24 hours of joint visibility and zero extra angular clearance**. The published 30-minute series gives the center **155.55 hours of Sun visibility**, a **12.45-hour longest dark interval**, a **6.32-hour longest Earth gap** and **149.23 hours of joint visibility**. The center and **8 of 9 sampled positions** meet the criteria.

Select the point **25 m east and 25 m south**: its longest dark interval is **167.50 hours**, with **zero joint visibility**. This is a spatial sensitivity result in the supplied terrain model. The fraction describes nine declared positions; it is not a landing-success probability.

Searching **264 site/date combinations** at six-hour arrival steps finds the earliest all-nine passing alternatives on **21 June 2027 at 12:00 UTC**, a **462-hour delay**, at ROI 1 and ROI 4. **ROI 1 appears first because its weakest threshold margin across the nine positions is wider.** In the published model, ROI 1's worst darkness is **8.015 h**, worst Earth gap **18.525 h** and least joint visibility **141.607 h**. Its smallest threshold margin is **5.475 h**, limited by the Earth gap. ROI 4's worst darkness is **23.749 h**, leaving its southwest sample only **0.251 h, about 15 minutes**, before the darkness limit.

The public ordering retains earliest arrival first, then constraint satisfaction and complete coverage, then the largest smallest threshold margin, individual margin components, center metrics and a stable site-ID tie-break. Each margin is a visible difference in hours from a user threshold. This is an explicit preference within the cached grid, not a global optimum or a hidden weighted score. All failed samples and their reasons are retained. See [default-case evidence](demo-evidence.json) and [footprint margins and stress tests](ROBUSTNESS_VALIDATION.md).

### NASA data and method

Reference locations come from NASA's original Connecting Ridge ROI attributes. Terrain combines the **5 m/pixel Site01 LOLA DEM** in [PGDA 78](https://pgda.gsfc.nasa.gov/products/78) and an **80 m/pixel regional DEM** from [PGDA 90](https://pgda.gsfc.nasa.gov/products/90). Spherical rays trace terrain to 250 km from an observer 2 m above the surface. [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) supplies airless Sun/Earth center directions every 30 minutes for December 2026, March 2027 and June 2027.

**Official resource mapping confirmed 2026-11-13:** the challenge's [NASA DATA & RESOURCES list](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/?tab=resources) includes **Horizons System**. LunaMargin calls its observer API for Sun (`10`) and Earth (`399`) azimuth/elevation at declared lunar coordinates and times; those fields become terrain-relative visibility windows and nine-point comparisons. [RESEARCH.md](RESEARCH.md#hard-requirement-official-resource-mapping) maps the exact request fields, original responses and derived results. This confirms the named-resource match, not overall competition eligibility.

A separate numerical check requested real **five-minute Horizons tables for the center and displaced point**, recomputed 0.5° horizons with finer radial spacing, and integrated intervals in Python. The center-pass / southeast-fail result remained: longest darkness **12.437 h versus 167.348 h**. This checks cadence, ray sampling and nearby-point ephemeris reuse. It uses the same terrain sources and is not independent observational validation. See [fine-ephemeris-validation.json](../data/fine-ephemeris-validation.json).

The recommendation-window audit adds **18 positions, 36 original Sun/Earth responses and 2,017 five-minute epochs per position**, with no missing epochs. Every position uses its own coordinates. At added clearances **0°, 0.02°, 0.10°, 0.25°**, finer calculations preserve all **72** point/condition pass-or-fail conclusions: ROI 1 remains **9/9** at every level; ROI 4 gives **9/9, 8/9, 8/9, 7/9**. At zero extra angle, fine worst darkness is **7.997 h** for ROI 1 and **23.834 h** for ROI 4; ROI 4's southwest margin reduces to **about 9.96 minutes**. This supports the same comparative recommendation. Extra angles are deterministic stress conditions, not measured error probabilities. Full intervals, differences and provenance are in [RECOMMENDATION_VALIDATION.md](RECOMMENDATION_VALIDATION.md).

### Contribution and scope

LunaMargin links horizon geometry, contiguous interruptions, user constraints and neighboring points in one inspectable decision. Existing lunar maps and ephemeris tools provide its foundation. The demonstrated contribution is a reproducible comparison with an explicit tradeoff and evidence trail.

The tool supports education and early mission-concept exploration. Body-center visibility does not calculate solar electrical yield, radio-link budgets, landing dynamics or terrain hazards. DEM interpolation, product seams, finite bearing/time steps and unmodeled eclipses affect interpretation. A [five-person novice test kit](USABILITY_TEST_KIT.md) is ready; **0/5 people have been tested**. External expert review has not been conducted. A different terrain region is a documented follow-up, not part of the current dataset.

### Development and attribution

OpenAI Codex assisted research, implementation, tests and documentation, including parallel agents. Original NASA inputs remain distinct from computed outputs and synthetic test fixtures. Development predates the official hackathon; eligibility is unconfirmed. Registered members should provide their actual contribution details.

## 中文

在线体验：[LunaMargin 月面余量](https://slashzyc.github.io/NASA-universe-event/)。公开版本的资料加载、窗口搜索、来源链接及导出检查见 [production-validation.json](production-validation.json)；记录中的时间和版本标明该次检查覆盖的发布版本。

### 项目简介

**LunaMargin「月面余量」：每一次着陆，都需要一点余量。**

一个看起来理想的月球落点，周边位置可能面临不同的光照。LunaMargin 将 NASA LOLA 地形与 NASA/JPL Horizons 星历结合，比较连接脊三个公开研究点的连续断光、地球不可见时段和日地共同可见窗口，并检查每处九个相邻位置。

用户设置日期、任务时长和可承受的中断，查看地平线与时间变化，比较周边位置，搜索所有取样点均满足条件的后续窗口。中英界面、操作导览，以及 HTML 简报、CSV 对比表和 JSON 证据导出，让计算可以理解、带走和复查。

### 实际演示

选择 **ROI 6，2027 年 6 月 2 日 06:00 UTC 起的七天**；设定**最长断光 24 小时、最长地球不可见 24 小时、日地共同可见至少 24 小时、额外角度余量 0°**。30 分钟星历序列给出：中心太阳可见 **155.55 小时**，最长断光 **12.45 小时**，最长地球不可见 **6.32 小时**，共同可见 **149.23 小时**。中心通过，九个取样点中有 **8 个**符合全部条件。

点击**东 25 米、南 25 米**的位置，最长断光变为 **167.50 小时**，共同可见为 **0 小时**。这是给定地形模型中的位置敏感性结果；九点通过比例不能理解为着陆成功概率。

搜索按六小时抵达步长检查 **264 种地点/日期组合**，最早全部九点通过的方案是 **6 月 21 日 12:00 UTC，ROI 1 或 ROI 4，推迟 462 小时**。现在同一日期优先显示 **ROI 1**：其九点最坏断光 **8.015 小时**、最长地球不可见 **18.525 小时**、最少共同可见 **141.607 小时**；最薄弱的门槛余量为 **5.475 小时**，由地球不可见时长决定。ROI 4 的最坏断光为 **23.749 小时**，西南点距断光上限只剩 **0.251 小时，约 15 分钟**。

排序先保留最早日期，再比较满足条件、资料完整、最薄弱门槛余量及各分项，最后用中心指标和地点 ID 确定并列顺序。这是公开的选择偏好，最早仅指缓存范围和搜索网格。各项余量与失败点均保留，没有隐含权重或全球最优承诺。详见 [周边余量与压力测试](ROBUSTNESS_VALIDATION.md)。

### 数据与复核

参考位置来自 NASA 原始 Connecting Ridge ROI 属性，地形结合 [PGDA 78](https://pgda.gsfc.nasa.gov/products/78) 的 5 米像素 DEM 与 [PGDA 90](https://pgda.gsfc.nasa.gov/products/90) 的 80 米区域 DEM。球面射线计算地表上方两米观察者至 250 公里内的地形遮挡。Horizons 提供 2026 年 12 月、2027 年 3 月和 6 月的真实太阳、地球中心方向。

**2026-11-13 已确认官方资源匹配：**题目 [Resources](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/?tab=resources) 的 NASA DATA & RESOURCES 列出 **Horizons System**。项目实际调用其 API，以月面坐标和时间查询太阳、地球方位角与高度角，再结合地形得到窗口和九点比较。[资源对应记录](RESEARCH.md#hard-requirement-official-resource-mapping) 保存字段、原始响应和派生结果证据。该项确认不代表整体评奖资格确认。

额外复核针对中心与东南点分别请求真实五分钟星历，把地平线方位步长加密至 0.5°、缩短径向步长，并使用 Python 积分。结论仍为中心通过、东南点不通过；最长断光分别是 **12.437 与 167.348 小时**。这检查了数值采样与近邻星历近似，沿用相同地形来源，不能代替独立观测验证。

新增推荐窗口精算覆盖 **18 个位置、36 份真实原始响应、每点 2017 个五分钟时刻**，无缺测，各点使用自身坐标。额外角度 **0°、0.02°、0.10°、0.25°** 下，共 **72** 组点与条件的通过结论均未改变：ROI 1 均为 **9/9**，ROI 4 依次为 **9/9、8/9、8/9、7/9**。基准最坏断光精算为 **7.997 与 23.834 小时**，ROI 4 西南点余量缩至约 **9.96 分钟**，仍支持优先显示 ROI 1。附加角度属于确定性压力条件，并非实测误差概率。详见 [完整精算报告](RECOMMENDATION_VALIDATION.md)。

项目将地平线、窗口、约束与周边取样连接为一个可检查的决策流程，服务科学教育和早期任务概念探索。发电、通信链路、着陆动力学和地表危险需要其他模型；地形插值、数据拼接、有限采样及未建模食现象影响解释。[五人新手测试材料](USABILITY_TEST_KIT.md) 已准备，实际 **0/5 已测试，尚无参与者**，没有真人完成率或引语。外部专家评审尚未开展；不同地形区域留待后续扩展。

OpenAI Codex 协助研究、实现、测试与文档。开发早于正式比赛，用户知悉规则后仍明确要求继续。提交应保留真实时间线与 AI 披露，填写真实成员贡献。

## Submission status / 提交状态

| Item / 事项 | Status / 状态 |
| --- | --- |
| Named NASA resource / 官方命名资源 | **CONFIRMED / 已确认** — Horizons System, verified 2026-11-13; mapping and raw usage above |
| Application, source evidence and teaching materials / 应用与材料 | Implemented; versioned evidence in [VALIDATION_RECORD.md](VALIDATION_RECORD.md). Teaching assets are available, not formally approved submission assets. |
| 2026 video, language and text-field limits / 当届格式 | **UNCONFIRMED / 待确认** — the official public Resources page inspected on 2026-11-13 did not list a current Project Submission Guide or central Judging Guide; the team's Project Tab has not been inspected. See [format check](RESEARCH.md#current-submission-format-check). |
| Team registration and deadline / 团队与截止时间 | **UNCONFIRMED / 待确认** — actual same-event members, Team Owner time zone and registered-event deadline |
| Advance-development eligibility / 提前开发资格 | **UNCONFIRMED / 待确认** — actual development began before the event; preserve the disclosed history and obtain an organizer determination before claiming eligibility |
| AI and actual contributions / AI 与真实贡献 | Documented in [AI_DISCLOSURE.md](AI_DISCLOSURE.md); final members must report their actual contributions |
| Novice study / 真人测试 | **PREPARED, 0/5 TESTED / 已备材料，0/5 已测试** — no invented observations |
| Official Project Tab submission / 官方提交 | **NOT SUBMITTED / 未提交** — GitHub publication and this document do not submit the project |

Before submitting, confirm the actual current format and registered-team details, adapt the final text/video if needed, retain accurate eligibility and AI disclosures, and enter the public project and demonstration links in the official Project Tab. Resource matching alone does not establish Global Awards eligibility.
