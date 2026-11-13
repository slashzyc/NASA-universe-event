# LunaMargin · 月面余量 · 项目提交文案

评委统一入口：[完整云端网站](https://lunamargin-slashzyc.laceysquirrel4.chatgpt.site/?lang=zh)。支持真实服务计算、云端保存、只读分享和原版证据恢复。[GitHub Pages](https://slashzyc.github.io/NASA-universe-event/?lang=zh) 是备用入口，支持浏览器计算、比较、保存完整任务文件与文件恢复；不提供云任务数据库或新日期获取队列。

当前发布身份、实际验证与录像见 [工程判断验收](ENGINEERING_ACCEPTANCE.md)。历史验收以其记录的时间和版本为准。正式提交必须采用已冻结的完整云端版本。

## English

### Purpose and users

LunaMargin compares locations and arrival dates during early lunar mission-concept design. A concept team can ask whether the same duration, interruption limits and arrival deadline hold at a selected point and its eight neighbors. Education is a secondary use. The default seven-day duration, 24/24/24-hour limits and 72-hour maximum delay are practice assumptions; they are not NASA mission requirements. Each input is classified as a public source, a user assumption or a computed result in the [requirements table](MISSION_REQUIREMENTS.md).

### Decision and evidence

The demonstration starts at Connecting Ridge ROI 6 on 2 June 2027 at 06:00 UTC. The nominal center meets the practice limits, while the southeast sample fails. A later all-nine passing window does not help a mission that cannot wait for it. The 72-hour default excludes the 21 June 12:00 window, which is 462 hours later. Only an explicitly permitted arrival range can make it a candidate. Search keeps the original duration, thresholds and 2 m observer height and evaluates only full intervals inside data coverage. Users choose earliest feasibility or the widest weakest margin within the inspected six-hour grid.

At the 21 June window, ROI 1 and ROI 4 both nominally pass at all nine samples. Their remaining margins differ. The [structured comparison](../data/science-validation-summary.json) separates published values, real five-minute ephemerides, numerical terrain refinement and added-angle stress. ROI 4's fine southwest darkness margin is about 9.96 minutes; +0.02° changes its footprint to 8/9. These are recorded sensitivity results, not a calibrated uncertainty interval. The [expanded matrix](ENGINEERING_VALIDATION.md) retains adverse results, absent cases and the scope of official correlated terrain-clone diagnostics. A sampled point passing those checks does not establish terrain robustness across the footprint.

A user can inspect the limiting point and interval, compare alternatives without mixing their constraints, save a named mission, and reopen or share its original evidence. Recalculation creates a new result. Inputs, original data, algorithm identity and verification evidence remain traceable. The full public release fixes the frontend, service, release manifest and data together; incompatible combinations are blocked.

### NASA data and scope

The challenge's named resource **Horizons System** supplies airless Sun/Earth center directions; NASA LOLA terrain supplies the horizons. The current data cover three Connecting Ridge regions, nine samples per region, the three published monthly campaigns and a matched 2 m observer model. The [source mapping](RESEARCH.md#hard-requirement-official-resource-mapping), [methods](METHODOLOGY.md) and [case evidence index](ENGINEERING_VALIDATION.md) retain original requests and checksums. Cached ephemerides are not real-time observations. The public cloud does not offer arbitrary new dates; its capabilities state the available ranges.

The output is geometric visibility screening. Electrical yield, ground-station link budgets and landing safety require other models. Dense numerical sampling is not observational truth; local terrain-clone samples do not validate unperturbed regional terrain. No sample fraction is presented as a landing-success probability.

### Users and contribution

The contribution is a constrained comparison with an inspectable reason for choosing or rejecting a plan. The [five-person comparison materials](USABILITY_TEST_KIT.md) give static and interactive conditions the same nine-point information, intervals, limits and validation boundaries. Cases and order are crossed, answers are fixed before observation, and failures and prompts must be retained. **0/5 people have been tested and 0/1 interviews completed.** The owner cannot currently arrange participants. Automated browser recordings are separate engineering checks; no user benefit or expert endorsement is claimed from them.

## 中文

### 用途

LunaMargin 用于早期月球任务概念设计中的地点与日期比较，教育演示为辅助。团队在相同任务时长、中断门槛和最迟抵达限制下，检查中心及八个邻点。默认 7 天、24/24/24 小时门槛与最多推迟 72 小时都是练习假设，不是 NASA 航天任务要求。[需求—输入—指标—决策表](MISSION_REQUIREMENTS.md) 标明每项来源类别和决策作用。

### 演示主线

连接脊 ROI 6 的中心满足名义条件，东南邻点暴露问题。搜索必须先遵守抵达限制：6 月 21 日 12:00 UTC 窗口比默认 6 月 2 日 06:00 UTC 晚 462 小时，不能进入 72 小时预算内的推荐。只有使用者明确扩大允许范围，它才成为可比较的候选。搜索不会暗改门槛、缩短任务或改变高度；每个完整任务必须有数据覆盖。

同一核查窗口中，ROI 1 和 ROI 4 都是名义 9/9，但临界性不同。界面从原始审计生成名义、独立五分钟及几何加密对照：ROI 4 西南点精算断光余量约 9.96 分钟，附加 0.02° 后整组成为 8/9。扩展验证将时间、数值几何和官方空间相关地形样本分开，保留不利结果和缺测。名义满足与验证状态分别显示，未执行的复核保持“未验证”。

最后在允许抵达范围内选择方案，保存并重新打开，导出输入、结果、版本和对应依据。不同条件展示取舍，不混排统一“最佳”。历史原结果保留，使用当前版本重新计算会另建记录。

### 证据范围

NASA/JPL Horizons 提供天体方向，LOLA 提供地形；来源、原始响应、字段与校验值见 [原始证据索引](ENGINEERING_VALIDATION.md)。当前只有已匹配的 2 米模型和已发布覆盖；云端未开放新日期队列。几何可见不能直接代表供电、地面站通信链路或着陆安全，局部地形样本也不能替代整组与远场的不确定性验证。

真人对照和需求访谈均为待开展，实际人数为 **0/5、0/1**。材料包含等量信息的静态九点表和时间线、交错案例分配、预先答案、五项任务、原话和提示记录、障碍复测表。[原始记录模板](USABILITY_TEST_RECORDS.md) 没有预填观察；自动化检查不计作真人测试。

## Development and disclosure / 开发与披露

OpenAI Codex assisted research, implementation, tests and documentation. Scientific inputs remain distinct from generated code, computed outputs and test fixtures. The owner explicitly requested development before the official event after receiving the advance-work warning. Preserve the actual timeline and [AI disclosure](AI_DISCLOSURE.md); registration, formal submission requirements and advance-development eligibility need confirmation. Publishing this repository does not submit a project to Space Apps.

## Submission status / 提交状态

| Item / 事项 | Status / 状态 |
| --- | --- |
| Named NASA resource / 官方命名资源 | **CONFIRMED / 已确认** — Horizons System, verified 2026-11-13; mapping and raw usage above |
| Application, source evidence and teaching materials / 应用与材料 | Implemented; versioned evidence in [VALIDATION_RECORD.md](VALIDATION_RECORD.md). Teaching assets are available, not formally approved submission assets. |
| 2026 video, language and text-field limits / 当届格式 | **UNCONFIRMED / 待确认** — the official public Resources page inspected on 2026-11-13 did not list a current Project Submission Guide or central Judging Guide; the team's Project Tab has not been inspected. See [format check](RESEARCH.md#current-submission-format-check). |
| Team registration and deadline / 团队与截止时间 | **UNCONFIRMED / 待确认** — actual same-event members, Team Owner time zone and registered-event deadline |
| Advance-development eligibility / 提前开发资格 | **UNCONFIRMED / 待确认** — actual development began before the event; preserve the disclosed history and obtain an organizer determination before claiming eligibility |
| AI and actual contributions / AI 与真实贡献 | Documented in [AI_DISCLOSURE.md](AI_DISCLOSURE.md); final members must report their actual contributions |
| Novice study / 真人测试 | **PREPARED, 0/5 TESTED / 对照材料准备完成，真人观察待开展** — fixed matching information, crossed case/order allocation, no observations |
| Needs interview / 需求访谈 | **PREPARED, 0/1 / 已备题目，未访谈** — no recruitment, external endorsement or quotations |
| Official Project Tab submission / 官方提交 | **NOT SUBMITTED / 未提交** — GitHub publication and this document do not submit the project |

Before submitting, confirm the actual current format and registered-team details, adapt the final text/video if needed, retain accurate eligibility and AI disclosures, and enter the public project and demonstration links in the official Project Tab. Resource matching alone does not establish Global Awards eligibility.
