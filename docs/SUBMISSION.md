# LunaMargin — project submission narrative / 项目提交文案

Prepared against the implemented application and saved evidence on 12 November 2026, America/New_York. This narrative is not an official submission. Team registration, submission links and an organizer decision on advance-development eligibility remain to be completed by the owner.

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

Searching **264 site/date combinations** at six-hour arrival steps finds the earliest all-nine passing alternatives on **21 June 2027 at 12:00 UTC**, a **462-hour delay**, at ROI 1 and ROI 4. ROI 4 has **7.68 hours** of longest darkness, **18.62 hours** of longest Earth gap and **141.70 hours** of joint visibility. This exposes a tradeoff between timing and sampled-point feasibility, within the cached search grid. Exact values and hashes are in [demo-evidence.json](demo-evidence.json).

### NASA data and method

Reference locations come from NASA's original Connecting Ridge ROI attributes. Terrain combines the **5 m/pixel Site01 LOLA DEM** in [PGDA 78](https://pgda.gsfc.nasa.gov/products/78) and an **80 m/pixel regional DEM** from [PGDA 90](https://pgda.gsfc.nasa.gov/products/90). Spherical rays trace terrain to 250 km from an observer 2 m above the surface. [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) supplies airless Sun/Earth center directions every 30 minutes for December 2026, March 2027 and June 2027.

A separate numerical check requested real **five-minute Horizons tables for the center and displaced point**, recomputed 0.5° horizons with finer radial spacing, and integrated intervals in Python. The center-pass / southeast-fail result remained: longest darkness **12.437 h versus 167.348 h**. This checks cadence, ray sampling and nearby-point ephemeris reuse. It uses the same terrain sources and is not independent observational validation. See [fine-ephemeris-validation.json](../data/fine-ephemeris-validation.json).

### Contribution and scope

LunaMargin links horizon geometry, contiguous interruptions, user constraints and neighboring points in one inspectable decision. Existing lunar maps and ephemeris tools provide its foundation. The demonstrated contribution is a reproducible comparison with an explicit tradeoff and evidence trail.

The tool supports education and early mission-concept exploration. Body-center visibility does not calculate solar electrical yield, radio-link budgets, landing dynamics or terrain hazards. DEM interpolation, product seams, finite bearing/time steps and unmodeled eclipses affect interpretation. Human usability studies and external expert review have not been conducted.

### Development and attribution

OpenAI Codex assisted research, implementation, tests and documentation, including parallel agents. Original NASA inputs remain distinct from computed outputs and synthetic test fixtures. Development predates the official hackathon; eligibility is unconfirmed. Registered members should provide their actual contribution details.

## 中文

在线体验：[LunaMargin 月面余量](https://slashzyc.github.io/NASA-universe-event/)。公开版本已通过资料加载、三季切换、窗口搜索、相对来源链接及三种导出的真实浏览器验证，六项检查全部通过；详见 [production-validation.json](production-validation.json)。

### 项目简介

**LunaMargin「月面余量」：每一次着陆，都需要一点余量。**

一个看起来理想的月球落点，周边位置可能面临不同的光照。LunaMargin 将 NASA LOLA 地形与 NASA/JPL Horizons 星历结合，比较连接脊三个公开研究点的连续断光、地球不可见时段和日地共同可见窗口，并检查每处九个相邻位置。

用户设置日期、任务时长和可承受的中断，查看地平线与时间变化，比较周边位置，搜索所有取样点均满足条件的后续窗口。中英界面、操作导览，以及 HTML 简报、CSV 对比表和 JSON 证据导出，让计算可以理解、带走和复查。

### 实际演示

选择 **ROI 6，2027 年 6 月 2 日 06:00 UTC 起的七天**；设定**最长断光 24 小时、最长地球不可见 24 小时、日地共同可见至少 24 小时、额外角度余量 0°**。30 分钟星历序列给出：中心太阳可见 **155.55 小时**，最长断光 **12.45 小时**，最长地球不可见 **6.32 小时**，共同可见 **149.23 小时**。中心通过，九个取样点中有 **8 个**符合全部条件。

点击**东 25 米、南 25 米**的位置，最长断光变为 **167.50 小时**，共同可见为 **0 小时**。这是给定地形模型中的位置敏感性结果；九点通过比例不能理解为着陆成功概率。

搜索按六小时抵达步长检查 **264 种地点/日期组合**，最早全部九点通过的方案是 **6 月 21 日 12:00 UTC，ROI 1 或 ROI 4，推迟 462 小时**。其中 ROI 4 最长断光 **7.68 小时**、地球不可见 **18.62 小时**、共同可见 **141.70 小时**。时间与取样可行性的取舍由此可见；最早结论仅针对缓存范围和搜索网格。完整依据见 [demo-evidence.json](demo-evidence.json)。

### 数据与复核

参考位置来自 NASA 原始 Connecting Ridge ROI 属性，地形结合 [PGDA 78](https://pgda.gsfc.nasa.gov/products/78) 的 5 米像素 DEM 与 [PGDA 90](https://pgda.gsfc.nasa.gov/products/90) 的 80 米区域 DEM。球面射线计算地表上方两米观察者至 250 公里内的地形遮挡。Horizons 提供 2026 年 12 月、2027 年 3 月和 6 月的真实太阳、地球中心方向。

额外复核针对中心与东南点分别请求真实五分钟星历，把地平线方位步长加密至 0.5°、缩短径向步长，并使用 Python 积分。结论仍为中心通过、东南点不通过；最长断光分别是 **12.437 与 167.348 小时**。这检查了数值采样与近邻星历近似，沿用相同地形来源，不能代替独立观测验证。

项目将地平线、窗口、约束与周边取样连接为一个可检查的决策流程，服务科学教育和早期任务概念探索。发电、通信链路、着陆动力学和地表危险需要其他模型；地形插值、数据拼接、有限采样及未建模食现象影响解释。尚未开展人工用户研究或外部专家评审。

OpenAI Codex 协助研究、实现、测试与文档。开发早于正式比赛，用户知悉规则后仍明确要求继续。提交应保留真实时间线与 AI 披露，填写真实成员贡献。

## Before official submission

1. **Verify the resource match.** The complete official 2026 Resources list was not confirmed during research. At least one actually used input must match a NASA source listed there; record its name and retrieval date.
2. **Resolve eligibility transparently.** Obtain an organizer determination about advance development before claiming eligibility.
3. **Complete account details.** Confirm actual members, same-event registration, Team Owner time zone, deadline and current demo format.
4. **Provide public links and submit.** Use the verified deployed project and recorded-demo URLs in the official Project Tab. GitHub publication alone does not submit a project.
