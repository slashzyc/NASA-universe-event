# LunaMargin — three-minute demonstration / 三分钟演示

This is a suggested presentation length, **not an official NASA video requirement**. Check current rules before recording. This route uses the implemented application and [demo-evidence.json](demo-evidence.json). UI cards show one decimal; evidence retains full calculations.

## Opening state

- Campaign **June 2027**, site **ROI 6**.
- Arrival **2 June 2027, 06:00 UTC**, duration **7 days**.
- Darkness limit **24 h**, Earth-view gap limit **24 h**, required overlap **24 h**.
- Additional clearance **0.00°**, observer **2 m**.
- Click **Compare mission windows**. Center cards show approximately **12.4 h**, **6.3 h**, **149.2 h**, **8/9**.

Query string for the local or published application:

`?campaign=jun&site=ridge-6&start=2027-06-02T06%3A00%3A00Z&durationHours=168&maxDarkHours=24&maxCommGapHours=24&minJointHours=24&clearanceDeg=0`

## English narration

| Time | Screen action | Narration |
| --- | --- | --- |
| 0:00–0:25 | Show ROI 6 and seven-day window. | “A promising lunar landing point can hide a difficult neighboring location. LunaMargin asks: where, when, and with how much margin? We connect NASA terrain and ephemerides to the continuous visibility gaps a mission would need to bridge.” |
| 0:25–0:55 | Show horizon; move time slider. | “We are at Connecting Ridge, starting June second, 2027, for seven days. This horizon comes from LOLA terrain. The Sun and Earth positions come from archived JPL Horizons queries. The time slider shows how those sources combine into visible and hidden intervals.” |
| 0:55–1:20 | Show center metrics and criteria. | “Our scenario allows twenty-four hours of darkness, twenty-four hours without Earth visibility, and needs twenty-four hours with both visible. The center passes: longest darkness is about twelve point four hours, the Earth gap six point three, and joint visibility one hundred forty-nine point two hours.” |
| 1:20–1:55 | Click **bottom-right footprint point**, east 25 m / north −25 m. | “Now move twenty-five metres east and twenty-five south. In this terrain model, longest darkness rises to about one hundred sixty-seven point five hours, with no joint visibility during the mission. Eight of nine samples passed, but this one did not. That count describes tested positions, not a landing-success probability.” |
| 1:55–2:25 | Click **Find a later window**; use ROI 4 at 21 June, 12:00 UTC. | “The search checks two hundred sixty-four site-and-date combinations at six-hour steps. The earliest all-nine passing options in this grid arrive on June twenty-first at noon. At ROI four, darkness is seven point seven hours and the Earth gap eighteen point six. We gain a passing footprint by accepting a later arrival.” |
| 2:25–2:50 | Open evidence export; show HTML/CSV/JSON and sources. | “The evidence travels with the decision: a readable brief, comparison table and full calculation record. We rechecked the center and displaced point with separately queried five-minute ephemerides and a finer horizon. Their pass/fail contrast remained. Source terrain uncertainty remains part of the interpretation.” |
| 2:50–3:00 | Return to comparison. | “LunaMargin makes lunar planning assumptions visible and reproducible, for early mission exploration and learning. The code, data trail and validation are included.” |

## 中文旁白

| 时间 | 画面操作 | 旁白 |
| --- | --- | --- |
| 0:00–0:25 | 展示 ROI 6 与七天时段。 | “一个看起来理想的月球落点，周边可能面临不同的光照。月面余量回答：在哪里、什么时候、还剩多少余量？我们把 NASA 地形和星历变成任务需要跨过的连续可见性空窗。” |
| 0:25–0:55 | 展示地平线，移动时间。 | “这里是连接脊，从 2027 年 6 月 2 日开始观察七天。地平线来自 LOLA 地形，太阳和地球位置来自已保存的 JPL Horizons 查询。移动时间，能看到它们怎样形成可见与不可见区间。” |
| 0:55–1:20 | 展示中心指标与约束。 | “情景允许最长断光 24 小时、地球不可见 24 小时，要求共同可见至少 24 小时。中心满足条件：最长断光约 12.4 小时，地球不可见 6.3 小时，共同可见 149.2 小时。” |
| 1:20–1:55 | 点击放大框**右下角点**：东25米、南25米。 | “向东 25 米、向南 25 米。地形模型显示，这里的最长断光达到约 167.5 小时，任务内没有共同可见窗口。九个点有八个通过，这个点没有通过。这个比例描述取样结果，不能当作着陆成功概率。” |
| 1:55–2:25 | 搜索后采用6月21日12时的ROI 4。 | “搜索按六小时步长检查 264 种组合。当前网格中，最早九点全部通过的方案是 6 月 21 日中午。ROI 4 最长断光约 7.7 小时，地球不可见 18.6 小时。代价是更晚抵达，收获是九个样本都满足条件。” |
| 2:25–2:50 | 展示证据导出与来源。 | “结果可以导出为任务简报、对比表和完整记录。针对中心与偏移点，我们分别请求了真实五分钟星历，并加密地平线计算，中心通过、偏移点失败的结论保持一致。原始地形的不确定性仍需保留。” |
| 2:50–3:00 | 返回比较。 | “月面余量让月球探索的假设看得见、可复查，服务早期任务探索和教学。代码、数据来源和验证记录一并提供。” |

## Recording notes

- These are body-center geometric results. Power, ground-station links and landing hazards require further models.
- “Earliest” is relative to the cached dates and six-hour grid. The 462-hour delay is 19 days and 6 hours.
- This case was chosen after inspecting data: an exploratory demo, not a held-out benchmark.
- The finer check uses new source queries and a separate numerical implementation, but the same DEMs. It does not establish field accuracy or independently verify all nine samples.
- Record the actual interface with units/captions. Call the input archived or cached NASA data, not a live feed.
- Include [AI_DISCLOSURE.md](AI_DISCLOSURE.md) in credits/description, including advance development. Label AI-generated inserted media visibly.
- A recorded demo and public video URL have not been created by this script; follow the official format when making them.
