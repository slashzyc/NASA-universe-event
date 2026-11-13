# LunaMargin · 月面余量

**Every landing needs a little margin.**

**[Open the online workspace / 打开在线工作台](https://lunamargin-slashzyc.laceysquirrel4.chatgpt.site/?lang=zh)** · **[GitHub Pages / 浏览器与设备文件模式](https://slashzyc.github.io/NASA-universe-event/?lang=zh)** · **[36-second public walkthrough / 36秒公网操作实录](https://slashzyc.github.io/NASA-universe-event/docs/media/public-flow.webm)**

Rotate the Moon, choose a verified research point, adjust a real mission, understand the cause of a failed limit, compare alternatives and retain the exact evidence. The online workspace uses **Cloudflare D1 + R2** for saved missions and read-only shares. GitHub Pages independently supports genuine browser calculation, comparison, full evidence-file saving and reopening. The local **Node.js + SQLite** service retains the controlled new-date pipeline; cloud new-date acquisition is not yet deployed. [This round’s verification and recordings](docs/INTERACTION_ACCEPTANCE.md) · [Cloud architecture](docs/CLOUD_SERVICE.md).

A terrain-aware lunar landing-window lab for the **2026 NASA Space Apps — Lunar Landing Site Navigator** challenge. Compare a promising center point with the terrain around it, then find a different arrival date where more of the sampled footprint meets your mission limits.

> This is an independent educational prototype built with NASA open data. Development began before the official event at the project owner's explicit request. This affects potential award eligibility; see [the disclosure](docs/AI_DISCLOSURE.md). Publishing this repository is not a Space Apps submission.

## Start here / 从这里开始

Use **Node.js 24 or later**. The complete service uses built-in Node libraries and needs no API key or account:

```sh
node scripts/build.mjs
node server/index.mjs
```

Open **http://127.0.0.1:4173**. The service initializes `var/lunamargin.sqlite` and its source cache automatically; retain the entire `var/` directory across restarts. For a static-only preview:

```sh
node scripts/serve.mjs
```

Rotate the Moon, select a supported research point, and enter the live workspace. Submit conditions for a server calculation, compare two or three recorded scenarios, then save a named mission. **My missions** restores original records and creates a new record when you explicitly recalculate. Existing scenario links remain compatible.

The frontend is in `dist/`. Relative paths support GitHub Pages repository URLs. GitHub Pages is a static host; its save action downloads a complete file. The online workspace provides D1/R2 persistence at its own origin, while Node hosting is an optional local/self-hosted deployment. Opening `index.html` directly as a file is unsupported.

中文：运行上面的启动命令，在浏览器打开地址即可。导航仪支持中英文，点击“从示例开始”即可加载完整案例。先读结果卡的一句结论，再点“查看东南未通过点”比较；“帮我找更晚的日期”可以寻找其他窗口。常用设置有 7 天和 3 天预设，修改后点击“查看任务结果”应用。专业图表与参数可按需展开。通过“保存这份简报”或“下载结果”保留证据。详见 [零基础操作指南](docs/QUICKSTART_ZH.md)。

## The demonstration: why a good point is not enough

The default case is **Connecting Ridge ROI 6**, arriving **2027-06-02 06:00 UTC** for **168 hours**. Limits: darkness and Earth-view gaps ≤24 h; simultaneous visibility ≥24 h; extra angular clearance 0°.

The published 30-minute model gives approximately **155.55 h of Sun-center visibility (92.6%)**, a **12.45 h longest dark interval**, and **8 of 9 sampled locations passing**. The position **25 m east and 25 m south** of the center has about **167.50 h of continuous darkness** and no simultaneous Sun/Earth visibility. The actual terrain changes the decision.

A separate query using **real 5-minute Horizons tables**, each position's own coordinates, and a finer terrain calculation preserves the conclusion: center darkness **12.44 h**, offset darkness **167.35 h**. This is a numerical sensitivity check, not external flight validation. Near-field DEM interpolation and measurement uncertainty remain relevant. [Inspect the numerical audit](data/fine-ephemeris-validation.json).

Search all nine sampled positions with the same limits: the first available six-hour-grid arrival is **2027-06-21 12:00 UTC** at ROI 1 or ROI 4. **ROI 1 now appears first at this tied arrival** because its weakest nine-point threshold margin is **5.475 h**, versus **0.251 h** for ROI 4. ROI 4's southwest point is close to its darkness limit even though both groups pass 9/9. The ordering is explicit and deterministic; “earliest” is bounded by the cached month and six-hour grid. [Compare all components and stress tests](docs/ROBUSTNESS_VALIDATION.md).

The expanded audit independently queries **all 18 positions** in that recommendation window: **36 original responses, 2,017 five-minute epochs per position, no missing epochs**. Fine calculations preserve all 72 point/angle pass-or-fail conclusions. ROI 1 stays 9/9 at the four tested angle settings; ROI 4 falls to 8/9 at +0.02° and 7/9 at +0.25°. Its baseline southwest darkness margin becomes **9.96 minutes** in the fine calculation. These are deterministic sensitivity results, not measured probabilities. [Inspect the complete fine audit](docs/RECOMMENDATION_VALIDATION.md).

## What works

- Real WebGL lunar sphere with sourced NASA texture, mouse/touch rotation, pinch zoom, south-pole focus and a usable 2D fallback.
- Live 560 ms horizontal scene transition, reduced-motion support, focus handling and browser history.
- Cloud D1/R2 and local SQLite services: validated computation, named tasks, duplication, deletion, immutable original evidence and isolated anonymous edit permissions.
- Browser mode saves a complete verified file and reopens it without a backend.
- A genuine three-step homepage workbench, paired teaching case, metric explanations and synchronized timeline.
- Stable disclosure panels, preserved drafts and keyboard focus; old responses cannot overwrite newer inputs.
- Read-only share links, consistent formal HTML/CSV/JSON exports and recovery after a full service restart.
- Two- or three-scenario comparison with explicit conditions, pass/fail reasons and weakest nine-point margins. Different constraints are not ranked as a universal best.
- Data coverage queries; the local Node service additionally runs a durable, serial NASA Horizons cache/fetch queue for new dates in 2026–2028, up to 31 days per request, at the verified 2 m height.

- A guided three-step workspace, plain-language result summaries, example presets, and explicit unapplied-change notices.
- Accessible nine-point buttons with synchronized map selection, per-point conclusions, and an immediate mobile readout.
- Three actual research locations from NASA's Connecting Ridge ROI dataset.
- Three separate campaigns: December 2026, March 2027, June 2027.
- True terrain height map and a magnified 3×3 footprint, with 25 m spacing.
- Terrain horizon from local 5 m/pixel and regional 80 m/pixel LOLA data, spherical geometry and 250 km rays.
- Interactive 360° horizon with Sun/Earth positions, time animation, and individual footprint inspection.
- Mission limits, longest continuous gaps, simultaneous visibility, and complete interval timelines.
- Background-worker search for the first later date where the center and all nine locations meet the limits.
- Same-date recommendations explain worst-position margins and four deterministic angular stress conditions.
- Shareable scenario URLs, English/Chinese interface, keyboard navigation and mobile layout.
- Downloadable HTML mission brief, CSV comparison and JSON evidence with provenance.
- Verified, content-addressed algorithm/data snapshots; original-version restoration and an explicit choice before current-version recalculation. [Versioning and schema compatibility](docs/VERSIONING.md).
- Reproducible NASA data acquisition, retained original API responses, SHA-256 manifests and numerical audits.

## Scientific scope

The comparison concerns **Sun/Earth center geometry**, not landing safety, electrical power or an actual ground-station link. Footprint pass counts are **discrete scenario counts, not probabilities**. All three points are neighboring Connecting Ridge cases, not a worldwide catalog or official candidate landing recommendations.

Observer height is fixed at 2 m. Additional angular clearance is a user-selected threshold, not a calibrated uncertainty interval. Source ephemerides are sampled every 30 minutes; narrow visibility windows may be missed. A long dark period interrupted by a very short light window can make longest-gap statistics sensitive to cadence. This effect is recorded, including a 35.51 h full-month sensitivity in one nondefault case. Short sunlight also does not establish battery recharge.

No synthetic terrain, fabricated NASA measurements, generated scientific success probabilities, or black-box AI recommendations are used. [Full method](docs/METHODOLOGY.md) · [Data pipeline](data-pipeline/README.md).

## Verification

```sh
node --test tests/*.test.js
node scripts/check.mjs
node scripts/validate-science.mjs
```

The tests cover visibility crossings, missing data, interval clipping, circular bearings, patch handling, unsupported assumptions and search consistency. Actual-data checks include monotonicity under increased clearance, downsampling sensitivity, terrain versus flat-horizon comparisons, and the default walkthrough.

For raw-data reproduction and Python geometry tests:

```sh
python -m pip install -r data-pipeline/requirements.txt
python data-pipeline/build_dataset.py --include-seasons
python -m unittest discover -s data-pipeline
python data-pipeline/audit_geometry.py
python data-pipeline/audit_demo.py
python data-pipeline/audit_recommendations.py
```

This downloads approximately 350 MB of original NASA terrain into a sibling cache. The browser only needs the compact published bundles. [Measured results](docs/validation-results.md) distinguish internal checks from independent external validation.

Regenerate the footprint comparison with `node scripts/validate-robustness.mjs`, then refresh the demonstration snapshot with `node scripts/snapshot-demo.mjs`. Publication checks reject stale demonstration hashes. Browser regression checks require the development dependency (`npm ci`) and Playwright Chrome/Chromium; run `npm run test:browser`. [The validation record](docs/VALIDATION_RECORD.md) separates numerical audits, browser checks and human testing.

## Project structure

```text
index.html                 Editorial project homepage
navigator.html             Complete mission workspace
src/                       Homepage, workspace, canvas views, geometry analysis, search worker
data/                      Three campaigns, original ephemerides, provenance, audits
data-pipeline/             Rebuild and audit NASA-derived data
tests/                     Analysis and browser checks
scripts/                   Local server, build, publication checks, science validation
docs/                      Method, challenge research, submission, demo, disclosures
.github/workflows/         Verification and GitHub Pages deployment
```

The browser has no third-party JavaScript dependencies. Scientific computation remains inspectable. Dates and observations use UTC. The original code is MIT licensed; NASA data retain their source attribution.

## Competition materials

- [中文操作指南](docs/QUICKSTART_ZH.md)
- [Submission narrative / 中英提交说明](docs/SUBMISSION.md)
- [Demonstration script / 中英演示脚本](docs/DEMO_SCRIPT.md)
- [Captioned application walkthrough](docs/media/lunamargin-walkthrough.webm) — a real, silent browser teaching demonstration with AI-assistance disclosure; current-year formal demo compliance is unconfirmed.
- [Judging strategy and prior winners](docs/JUDGING_STRATEGY.md)
- [Rules and sources](docs/RESEARCH.md)
- [AI and development disclosure](docs/AI_DISCLOSURE.md)
- [Validation record](docs/VALIDATION_RECORD.md)
- [修改清单逐项验收 / Revision acceptance](docs/REVISION_ACCEPTANCE.md)
- [第二轮修改与验收 / Round-two acceptance](docs/ROUND2_ACCEPTANCE.md)
- [Five-person novice test kit / 五人新手测试包](docs/USABILITY_TEST_KIT.md) and [blank observation records / 空白记录表](docs/USABILITY_TEST_RECORDS.md) — prepared; **0/5 people tested**.

**Official resource match confirmed on 2026-11-13:** the challenge's Resources list includes **Horizons System**, which this project actually uses. [Exact mapping and retained inputs](docs/RESEARCH.md#hard-requirement-official-resource-mapping). Team registration, current format requirements and advance-development eligibility remain unconfirmed; **the official Project Tab submission has not been performed**. Resource matching and GitHub publication do not establish overall award eligibility.

M07's different-terrain region is a later extension. The present release keeps the three Connecting Ridge sites and three cached campaigns; new terrain requires source, coordinate, resolution, coverage and reproduction evidence before inclusion.

## NASA sources

- [Official challenge](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/)
- [NASA PGDA 78 — high-resolution LOLA south-polar terrain](https://pgda.gsfc.nasa.gov/products/78), [Barker et al. 2021](https://doi.org/10.1016/j.pss.2020.105119).
- [NASA PGDA 90 — adjusted south-polar terrain](https://pgda.gsfc.nasa.gov/products/90), [Barker et al. 2023](https://doi.org/10.3847/PSJ/acf3e1).
- [NASA/JPL Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html) and [API](https://ssd-api.jpl.nasa.gov/doc/horizons.html).

NASA is not affiliated with or endorsing this project. No NASA insignia are used.
