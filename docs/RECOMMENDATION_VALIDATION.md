# Recommendation-window fine audit / 推荐窗口精算

Generated: 2026-11-13T05:55:54.478640+00:00. Method: `recommendation-audit-v1: independent-linear-crossings; horizon-0.5deg-radial0.25`.

This audit uses **36 real NASA/JPL Horizons responses** for **18 distinct observing positions**, each containing **2,017 five-minute epochs** from 2027-06-21 12:00 UTC through 2027-06-28 12:00 UTC. Observer height is 2 m. All limits remain 24/24/24 h.

[Machine-readable full report](../data/recommendation-fine-validation.json) includes every original query URL, parameters, response hash, UTC retrieval time, missing-epoch check, coordinate, fine horizon, metric, failure reason, and full window boundary.

## Footprint comparison

| Site | Added angle | Published pass count | Fine pass count | Published worst darkness (h) | Fine worst darkness (h) | Fine limiting point |
|---|---:|---:|---:|---:|---:|---|
| ridge-1 | 0.00° | 9/9 | 9/9 | 8.015 | 7.997 | `e+0-n+25` |
| ridge-1 | 0.02° | 9/9 | 9/9 | 8.403 | 8.346 | `e+0-n+25` |
| ridge-1 | 0.10° | 9/9 | 9/9 | 9.860 | 9.742 | `e-25-n+25` |
| ridge-1 | 0.25° | 9/9 | 9/9 | 14.954 | 14.249 | `e-25-n+25` |
| ridge-4 | 0.00° | 9/9 | 9/9 | 23.749 | 23.834 | `e-25-n-25` |
| ridge-4 | 0.02° | 8/9 | 8/9 | 24.725 | 24.807 | `e-25-n-25` |
| ridge-4 | 0.10° | 8/9 | 8/9 | 46.209 | 46.074 | `e-25-n-25` |
| ridge-4 | 0.25° | 7/9 | 7/9 | 52.100 | 51.970 | `e-25-n-25` |

## Interpretation / 结论

Across all 18 positions and four angle settings, **0 of 72 pass/fail conclusions changed** relative to the published model. Both locations remain 9/9 at zero clearance. ROI 1 retains nine passes at every tested angle; ROI 4 loses its southwest sample at +0.02°, and additionally its west sample at +0.25°.

At zero added angle, ROI 1's worst darkness is 7.997 h and its longest Earth-view gap is 18.260 h. ROI 4's southwest darkness is 23.834 h, leaving only 9.96 minutes before the 24 h limit. The fine audit therefore preserves the evidence for preferring ROI 1 when the arrival time is tied and footprint margin matters. It does not certify either location for flight.

真实精算未改变这 72 个点与角度组合的通过/失败结论。ROI 1 在四档条件下均为 9/9；ROI 4 在额外 0.02° 时西南点超过断光条件，0.25° 时西侧点也超过。ROI 4 基准西南点距离 24 小时断光上限只余 9.96 分钟，因此只看中心点或 9/9 计数会遗漏重要差异。

The corresponding pass/fail changes, if any, are retained in `cases[*].comparisons[*].passConclusionChanged`; no failed sample is excluded from summaries.

## Every position at zero added angle

| Site | Sample | 30 min longest dark | Fine longest dark | Δ dark h | Fine Sun h | Fine Earth h | Fine longest Earth gap h | Fine both h | Published → fine pass |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| ridge-1 | `e-25-n-25` | 7.942 | 7.956 | +0.015 | 160.044 | 149.751 | 18.249 | 141.795 | True → True |
| ridge-1 | `e+0-n-25` | 7.869 | 7.961 | +0.092 | 160.039 | 149.740 | 18.260 | 141.779 | True → True |
| ridge-1 | `e+25-n-25` | 7.869 | 7.979 | +0.111 | 160.021 | 149.773 | 18.227 | 141.794 | True → True |
| ridge-1 | `e-25-n+0` | 7.957 | 7.956 | -0.002 | 160.044 | 149.768 | 18.232 | 141.813 | True → True |
| ridge-1 | `e+0-n+0` | 7.915 | 7.973 | +0.058 | 160.027 | 149.763 | 18.237 | 141.790 | True → True |
| ridge-1 | `e+25-n+0` | 7.883 | 7.985 | +0.102 | 160.015 | 149.796 | 18.204 | 141.811 | True → True |
| ridge-1 | `e-25-n+25` | 8.015 | 7.987 | -0.028 | 160.013 | 149.778 | 18.222 | 141.791 | True → True |
| ridge-1 | `e+0-n+25` | 7.967 | 7.997 | +0.030 | 160.003 | 149.783 | 18.217 | 141.786 | True → True |
| ridge-1 | `e+25-n+25` | 7.903 | 7.996 | +0.094 | 160.004 | 149.817 | 18.183 | 141.821 | True → True |
| ridge-4 | `e-25-n-25` | 23.749 | 23.834 | +0.085 | 134.399 | 149.451 | 18.549 | 115.849 | True → True |
| ridge-4 | `e+0-n-25` | 7.690 | 7.804 | +0.114 | 160.196 | 149.352 | 18.648 | 141.548 | True → True |
| ridge-4 | `e+25-n-25` | 7.689 | 7.789 | +0.100 | 160.211 | 149.390 | 18.610 | 141.602 | True → True |
| ridge-4 | `e-25-n+0` | 14.524 | 14.349 | -0.174 | 145.839 | 149.475 | 18.525 | 127.313 | True → True |
| ridge-4 | `e+0-n+0` | 7.682 | 7.805 | +0.123 | 160.195 | 149.376 | 18.624 | 141.571 | True → True |
| ridge-4 | `e+25-n+0` | 7.685 | 7.799 | +0.114 | 160.201 | 149.412 | 18.588 | 141.613 | True → True |
| ridge-4 | `e-25-n+25` | 7.681 | 7.794 | +0.113 | 160.206 | 149.500 | 18.500 | 141.706 | True → True |
| ridge-4 | `e+0-n+25` | 7.667 | 7.804 | +0.136 | 160.196 | 149.402 | 18.598 | 141.598 | True → True |
| ridge-4 | `e+25-n+25` | 7.693 | 7.814 | +0.121 | 160.186 | 149.432 | 18.568 | 141.617 | True → True |

## Reproduce and interpret

Run `python data-pipeline/audit_recommendations.py` after installing `data-pipeline/requirements.txt`. Cached original responses are reused only when all request parameters match. Source raster checksums must match `data/source-manifest.json`. Derived horizon caching is keyed by the published bundle, terrain program, and method version.

The report retains a middle comparison: independent five-minute queries with the **published** horizon. This separates timing/observer effects from the further terrain-ray refinement. No published UI input was overwritten.

Window comparisons include all exact interval boundaries and nearest-boundary displacement in both directions. This is not an assertion that differently counted events match one-to-one.

Additional angles are added to the zero-degree case baseline; they are deterministic stress tests. All failed points remain in the report. These results do not estimate actual terrain-error distributions, external accuracy, or landing-success probability.

The fine ray grid samples the same underlying NASA DEM more densely. Raster pixel spacing is not effective measurement resolution, and interpolation cannot create measured terrain detail.

[Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) · [Horizons observing-site conventions](https://ssd.jpl.nasa.gov/horizons/manual.html#site), checked 2026-11-13.
