# LunaMargin — submission draft / 提交草稿

**Status: draft awaiting final implementation review and measured results.** This describes the intended delivery and contains verification fields. Replace bracketed fields with verified facts, remove unavailable features and reconcile the text with the final application before submitting. This is not a completed official submission.

**Competition status:** development began before the 14 November 2026 official start at the owner's request. GO Team guidance says advance work can lead to disqualification. Disclose the timeline and obtain an organizer determination; do not describe this as work created entirely during the hackathon.

## Fields to verify

| Field | Draft value / required action |
| --- | --- |
| Project | LunaMargin · 月面余量 |
| Challenge | Lunar Landing Site Navigator |
| Team | [Actual registered team name and members] |
| Repository | https://github.com/slashzyc/NASA-universe-event — confirm published revision |
| Live project | [Verified public application URL] |
| Demo | [Verified public demo URL; current official duration/format rules apply] |
| NASA input requirement | [An actually used input matched to the official 2026 Resources list] |
| Evidence | [Final manifest, validation record and comparison export] |
| Eligibility | [Organizer determination; currently unconfirmed] |

## English draft

### One-line concept

LunaMargin helps people compare lunar landing sites and dates by turning Sun, Earth and terrain geometry into visible operating margins.

### High-level summary

At the lunar south pole, changes in location and time can change what rises above the terrain. A site comparison becomes useful when it answers a practical question: how long would a mission need to bridge a continuous darkness interval or an interruption in Earth visibility?

LunaMargin connects NASA LOLA terrain with NASA/JPL Horizons Sun and Earth geometry. Its intended workflow compares sites and dates, shows the local horizon, identifies contiguous visibility interruptions and evaluates nearby sample points against user-selected constraints. The sample-feasibility fraction describes the evaluated points under those assumptions. An evidence report is intended to preserve source files, coordinates, timing and settings so another person can reproduce the comparison.

The experience serves early mission-concept exploration and learning. It puts the geometry and the reason for each result next to the decision. Confirm the final implementation and measured outcomes in the evidence record before submitting this summary.

### Value and approach

The design connects three views of one decision: the sky at a selected point, the sequence of available and unavailable windows, and variation among nearby points. Users adjust allowable interruption durations and inspect which samples meet the criteria. This connects an intuitive picture to explicit engineering questions.

The proposed contribution is a traceable workflow for operating margin and spatial sensitivity. Existing lunar mapping and ephemeris tools provide its scientific foundation and comparison context. Describe the specific implemented interaction that distinguishes the final project.

### NASA data and method

Researched inputs are NASA GSFC LOLA products [78](https://pgda.gsfc.nasa.gov/products/78) and [90](https://pgda.gsfc.nasa.gov/products/90), plus [NASA/JPL Horizons](https://ssd.jpl.nasa.gov/horizons/). Record the exact subset actually used, its hashes and preprocessing in the final manifest. Confirm the official challenge-resource match before submission.

The method compares ephemerides with a terrain horizon using documented coordinate, height and time conventions. Longest interruptions refer to a stated analysis interval and sample spacing. The final report must describe interval-boundary truncation, interpolation, unavailable terrain and spatial sample layout.

### Demonstrated result — fill after validation

For **[site / coordinates]**, over **[start–end UTC]** with **[time step]**, **[terrain and horizon settings]**, the longest modeled Sun-unavailable interval was **[value + unit]**, and the longest Earth-unavailable interval was **[value + unit]**. Under **[thresholds]**, **[passing count] / [valid count]** sampled locations met all criteria; **[excluded count]** lacked valid coverage or inputs. Comparing **[alternative site/date]** produced **[verified difference, tradeoff or no improvement]**. Evidence: **[export and revision]**.

These fields are deliberately unfilled. This draft establishes no measured advantage, accuracy score, runtime claim or user-study result.

### Scope and disclosure

The output supports education and early planning through geometric visibility. Solar electrical yield, battery performance, radio links, landing dynamics and unmodeled hazards require additional models. A sampled fraction is not a landing-success probability.

OpenAI Codex assisted research, implementation, tests and documentation, including parallel agents. Development started before the official event; the owner was informed of the published timing rule and chose to proceed. Members must review the final evidence and describe their own contributions accurately. See [AI_DISCLOSURE.md](AI_DISCLOSURE.md).

## 中文草稿

### 一句话介绍

LunaMargin「月面余量」把太阳、地球与月面地形的几何关系转化为可比较的任务余量，帮助人们选择地点与日期。

### 项目摘要

月球南极的地点和日期变化，太阳与地球是否高于当地地形也会变化。对任务设计而言，一个实际问题是：最长连续断光和对地不可见时段有多久，任务需要跨过多长的中断？

LunaMargin 的设计将 NASA LOLA 地形与 NASA/JPL Horizons 星历连接起来，比较地点和日期，显示当地地平线与连续可见窗口，并检查落点周围的多个取样位置是否满足用户设置的中断时长限制。取样可行比例描述本次有效取样点的结果；报告记录来源、坐标、时段与设置，让其他人可以复查。

项目面向早期任务概念探索与科学教育，把图形、数字和原因放到同一个决策流程里。正式提交前，应按最终程序与验证记录更新功能状态。

### 使用价值

一个地点的天空、连续窗口和周围取样点对应同一个问题。用户调整可接受的断光或对地不可见时长后，可以查看哪些点满足条件、哪些条件限制选择。这种交互把直观感受与明确的任务假设联系起来。

项目拟提供可追溯的余量比较与空间敏感性分析。已有月球地图和星历工具提供科学基础；参赛材料应依据实际实现的差异介绍创新点。

### 数据与方法

已研究 NASA GSFC LOLA [产品 78](https://pgda.gsfc.nasa.gov/products/78)、[产品 90](https://pgda.gsfc.nasa.gov/products/90) 与 [NASA/JPL Horizons](https://ssd.jpl.nasa.gov/horizons/)。最终清单须记录实际使用的文件、哈希、预处理和查询参数，并确认至少一个已用数据源出现在赛题 2026 官方 Resources 列表。

计算按照公开的坐标、高度和时间约定，将太阳、地球的位置与地形地平线比较。连续中断指标对应明确的分析时段与采样间隔；报告需写清边界截断、插值、地形缺失及周围取样布局。

### 实际结果——验证后填写

在 **[地点与坐标]**、**[UTC 起止时间]**、**[采样步长]**、**[地形及地平线设置]** 下，最长太阳不可见时段为 **[数值与单位]**，最长地球不可见时段为 **[数值与单位]**。采用 **[约束]** 后，**[通过数量] / [有效数量]** 个点满足全部条件；另有 **[排除数量]** 个点因输入或覆盖不足未计入。与 **[另一地点或日期]** 相比，结果为 **[已核对的变化、权衡或没有改善]**。证据：**[报告及版本]**。

本草稿尚未填入测量结果，也没有建立准确率、提速或用户测试方面的结论。

### 范围与开发说明

项目定位是几何可见性的早期规划与教学工具。发电、储能、电波链路、着陆动力学及未建模地表风险需要进一步模型；取样比例不能解释为着陆成功概率。

OpenAI Codex 参与研究、代码、测试和文档，包括并行代理工作。开发在比赛前开始，用户知悉官方时间规则后仍明确要求继续。提交时应公开真实时间线，准确填写实际成员贡献。

## Final publication gate

- [ ] Verify feature statements against the final deployed application.
- [ ] Replace result fields with traceable measurements or remove that section.
- [ ] Fill [VALIDATION_RECORD.md](VALIDATION_RECORD.md) from actual checks.
- [ ] Confirm official resource mapping, submission format and deadline.
- [ ] Record the organizer's eligibility determination for advance development.
- [ ] Verify public links without a private account.
- [ ] Add registered members, actual contributions and source/AI acknowledgments.
- [ ] Submit through the official team Project Tab; GitHub publication alone is not submission.
