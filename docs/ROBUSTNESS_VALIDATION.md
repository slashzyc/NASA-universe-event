# Footprint margins and deterministic sensitivity / 周边余量与确定性压力测试

Reproduced 2026-11-13T05:51:39.233Z. This report addresses M03 using the unchanged published June 2027 bundle; it is separate from the real five-minute M04 audit.

## Conditions / 复现条件

Arrival **2027-06-21 12:00 UTC**, stay **168 hours**, observer **2 m** above terrain. Longest Sun-center gap ≤24 h, longest Earth-center gap ≤24 h, total simultaneous visibility ≥24 h. Baseline angular clearance is 0°. Every stress level is added to that baseline; a nonzero user baseline is never replaced or lowered.

## Measured results / 实际计算结果

| Location | Added angle | Samples passing | Worst darkness h | Worst Earth gap h | Minimum joint h | Smallest threshold margin h |
|---|---:|---:|---:|---:|---:|---:|
| ROI 1 | +0.00° | 9/9 | 8.015 | 18.525 | 141.607 | 5.475 |
| ROI 1 | +0.02° | 9/9 | 8.403 | 18.793 | 140.995 | 5.207 |
| ROI 1 | +0.10° | 9/9 | 9.860 | 19.868 | 138.568 | 4.132 |
| ROI 1 | +0.25° | 9/9 | 14.954 | 21.881 | 131.281 | 2.119 |
| ROI 4 | +0.00° | 9/9 | 23.749 | 18.906 | 116.992 | 0.251 |
| ROI 4 | +0.02° | 8/9 | 24.725 | 19.182 | 111.489 | -0.725 |
| ROI 4 | +0.10° | 8/9 | 46.209 | 20.262 | 92.130 | -22.209 |
| ROI 4 | +0.25° | 7/9 | 52.100 | 22.283 | 80.290 | -28.100 |

All eight published review-baseline rows match (exact passing counts; reported durations rounded to three decimals). Full values, extremal point IDs, east/north offsets, all failed-sample reasons and source checksums are in [the machine-readable record](../data/robustness-validation.json).

## Why ROI 1 appears first / 为什么优先显示 ROI 1

From the default arrival, both sites first pass on **21 June 2027 at 12:00 UTC** on the same six-hour grid. At that time ROI 1 has a minimum threshold margin of **5.475 h**, limited by its worst Earth-view gap. ROI 4 has only **0.251 h (15.05 min)**, limited by darkness at its southwest sample, east −25 m / north −25 m. ROI 4 has slightly shorter darkness at its center, but the footprint tells a different story.

The ordering is public and deterministic: earliest arrival; then satisfies constraints; then fully known footprint; largest **smallest threshold margin**; then darkness, Earth-gap and simultaneous-time margins; then center metrics; finally site ID in codepoint order. The smallest margin is literally the minimum of the three shown hour differences. No weights or opaque score are used. This is a stated preference among feasible alternatives, not a claim of universal optimality. The Pareto comparison also includes worst-position components when all candidate footprints are known, so a trade-off is not erased by the preference order.

中文：先保留最早可行日期，再在同一日期中比较整组九点最薄弱的门槛余量。ROI 1 的最薄弱余量约 5.475 小时；ROI 4 的西南点距断光上限只剩约 15 分钟。中心与最不利点共同参与说明，不能只凭中心较好就认为整个取样组更宽裕。三类余量和对应点均保留，九点包含中心。

## Scope and verification / 范围与检查

- Nine discrete sampled positions are not a continuous-area estimate or success probability.
- Additional angles are deterministic geometric stress conditions, not a calibrated uncertainty interval.
- Any missing or unsupported position makes whole-footprint margins unknown. Known-subset extrema are separately labeled and never ranked as complete evidence.
- Source inputs and individual visibility calculations are unchanged. Search preference and reported summaries change; the real five-minute audit may reveal numerical sensitivity separately.
- Run `node scripts/validate-robustness.mjs` to regenerate this record.
- Run `node --test tests/robustness.test.js tests/analysis.test.js` for signed margins, ties, threshold equality, unknowns, nonzero baselines, date priority, stable ordering, candidate caps, infeasible cases and the review's numerical baseline.

Analysis SHA-256: `981e49c08ae6457450c5e0fbb8d9c743521dbb91ed6eeb2cbb01b3e132ea5fcd`  
Published June bundle SHA-256: `c2258b262f2ee22599195090a9e652d8f6fd53c48bfb48139896be02a86f3d8f`
