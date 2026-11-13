# LunaMargin · 月面余量

**Every landing needs a little margin.**

**[Open the live application / 打开在线应用](https://slashzyc.github.io/NASA-universe-event/)** · **[Watch the 50-second walkthrough / 观看演示](https://slashzyc.github.io/NASA-universe-event/docs/media/lunamargin-walkthrough.webm)**

A terrain-aware lunar landing-window lab for the **2026 NASA Space Apps — Lunar Landing Site Navigator** challenge. Compare a promising center point with the terrain around it, then find a different arrival date where more of the sampled footprint meets your mission limits.

> This is an independent educational prototype built with NASA open data. Development began before the official event at the project owner's explicit request. This affects potential award eligibility; see [the disclosure](docs/AI_DISCLOSURE.md). Publishing this repository is not a Space Apps submission.

## Start here / 从这里开始

No package installation, API key, account, or paid service is required to run the application. Use Node.js 20 or later:

```sh
node scripts/serve.mjs
```

Open **http://127.0.0.1:4173**. To build a standalone deployment:

```sh
node scripts/build.mjs
```

The complete static site is in `dist/`. Deploy it with any static HTTP host. Relative paths support GitHub Pages repository URLs. Opening `index.html` directly as a file is unsupported because browsers restrict local JSON fetches and module workers.

中文：运行上面的启动命令，在浏览器打开地址即可。右上角“中文”切换界面语言。先保留默认案例，点击地图放大框中**右下角的位置**，观察最长断光；再点“寻找更晚的可行窗口”，检查任务日期改变后的结果。通过“导出证据”保存可打印简报、CSV 或完整 JSON。

## The demonstration: why a good point is not enough

The default case is **Connecting Ridge ROI 6**, arriving **2027-06-02 06:00 UTC** for **168 hours**. Limits: darkness and Earth-view gaps ≤24 h; simultaneous visibility ≥24 h; extra angular clearance 0°.

The published 30-minute model gives approximately **155.55 h of Sun-center visibility (92.6%)**, a **12.45 h longest dark interval**, and **8 of 9 sampled locations passing**. The position **25 m east and 25 m south** of the center has about **167.50 h of continuous darkness** and no simultaneous Sun/Earth visibility. The actual terrain changes the decision.

A separate query using **5-minute real Horizons observations**, each position's own coordinates, and a finer terrain calculation preserves the conclusion: center darkness **12.44 h**, offset darkness **167.35 h**. This is a numerical sensitivity check, not external flight validation. Near-field DEM interpolation and measurement uncertainty remain relevant. [Inspect the numerical audit](data/fine-ephemeris-validation.json).

Search all nine sampled positions with the same limits: the first available six-hour-grid arrival is **2027-06-21 12:00 UTC** at ROI 4 or ROI 1. The date search is bounded by the selected cached month, and its earliest result is relative to that grid.

## What works

- Three actual research locations from NASA's Connecting Ridge ROI dataset.
- Three separate campaigns: December 2026, March 2027, June 2027.
- True terrain height map and a magnified 3×3 footprint, with 25 m spacing.
- Terrain horizon from local 5 m/pixel and regional 80 m/pixel LOLA data, spherical geometry and 250 km rays.
- Interactive 360° horizon with Sun/Earth positions, time animation, and individual footprint inspection.
- Mission limits, longest continuous gaps, simultaneous visibility, and complete interval timelines.
- Background-worker search for the first later date where the center and all nine locations meet the limits.
- Shareable scenario URLs, English/Chinese interface, keyboard navigation and mobile layout.
- Downloadable HTML mission brief, CSV comparison and JSON evidence with provenance.
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
```

This downloads approximately 350 MB of original NASA terrain into a sibling cache. The browser only needs the compact published bundles. [Measured results](docs/validation-results.md) distinguish internal checks from independent external validation.

## Project structure

```text
index.html                 Accessible application shell
src/                       UI, canvas views, geometry analysis, search worker
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
- [Captioned application walkthrough](docs/media/lunamargin-walkthrough.webm) — a real browser recording, silent, approximately 50 seconds, with AI-assistance disclosure.
- [Judging strategy and prior winners](docs/JUDGING_STRATEGY.md)
- [Rules and sources](docs/RESEARCH.md)
- [AI and development disclosure](docs/AI_DISCLOSURE.md)
- [Validation record](docs/VALIDATION_RECORD.md)

Team registration, challenge-resource compliance, final event requirements and the project-page submission must be confirmed on the official Space Apps site. The app does not submit or impersonate team members.

## NASA sources

- [Official challenge](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/)
- [NASA PGDA 78 — high-resolution LOLA south-polar terrain](https://pgda.gsfc.nasa.gov/products/78), [Barker et al. 2021](https://doi.org/10.1016/j.pss.2020.105119).
- [NASA PGDA 90 — adjusted south-polar terrain](https://pgda.gsfc.nasa.gov/products/90), [Barker et al. 2023](https://doi.org/10.3847/PSJ/acf3e1).
- [NASA/JPL Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html) and [API](https://ssd-api.jpl.nasa.gov/doc/horizons.html).

NASA is not affiliated with or endorsing this project. No NASA insignia are used.
