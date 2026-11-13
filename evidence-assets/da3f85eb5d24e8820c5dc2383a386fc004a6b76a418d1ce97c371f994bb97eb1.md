# Measured validation results

Generated: 2026-11-13T05:54:09.852Z. Node v24.22.1.

**PASSED internal consistency checks** — 46,212 checks; 0 failures.

Internal correctness, actual-data sensitivity and baseline comparisons. This is not an independent validation against flight measurements or an independent terrain/ephemeris solution.

Reproduce with `node scripts/validate-science.mjs`. Exact dataset and analysis SHA-256 hashes, settings, and all measured values are in [validation-results.json](validation-results.json).

## Interpretation

- A 30-to-60-minute change measures sensitivity to time sampling; it does not establish absolute event-time accuracy.
- The 5-minute comparator interpolates existing observations and is not a new 5-minute NASA ephemeris query.
- The zero-degree flat comparator is a local tangent-plane simplification; downhill terrain can legitimately increase visibility relative to it.
- Angular clearance is a user-selected deterministic requirement, not a calibrated uncertainty interval.
- Patch count fractions are fractions of nine declared locations, not landing probabilities or area-weighted success estimates.
- A footprint contrast smaller than the native temporal sample step is reported but should not be presented as a resolved operational advantage.
- Selecting demonstration windows after inspecting results is exploratory; it is not a held-out performance benchmark.

## lunar-sites-june.json

2027-06-01T00:00:00Z to 2027-07-01T00:00:00Z; 30-minute observations.

Clearance monotonicity: 1800 comparisons, 0 violations.

### Full cached interval, zero angular clearance

| Site | Sun visible h | Earth visible h | Longest dark h | Longest Earth gap h |
| --- | ---: | ---: | ---: | ---: |
| ridge-1 | 438.32 | 401.24 | 248.55 | 318.76 |
| ridge-4 | 455.57 | 400.94 | 91.51 | 319.06 |
| ridge-6 | 495.27 | 400.73 | 67.52 | 319.27 |

### Time-sampling sensitivity

Largest absolute metric changes over the full interval and daily-start seven-day windows, using both decimation phases.

| Site | Clearance ° | Sun h | Earth h | Joint h | Longest dark h | Longest Earth gap h |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ridge-1 | 0 | 0.0357 | 0.0143 | 0.0357 | 0.0357 | 0.0143 |
| ridge-1 | 0.5 | 0.0805 | 0.0001 | 0.0805 | 35.5121 | 0.0001 |
| ridge-4 | 0 | 0.1631 | 0.0124 | 0.1631 | 0.1631 | 0.0124 |
| ridge-4 | 0.5 | 0.1098 | 0.0042 | 0.0742 | 0.0768 | 0.0042 |
| ridge-6 | 0 | 0.2448 | 0.0001 | 0.0303 | 0.1247 | 0.0001 |
| ridge-6 | 0.5 | 0.0781 | 0.0000 | 0.0633 | 0.0766 | 0.0000 |

**Observed sensitivity:**

- ridge-1, 0.5° clearance: longestDarkHours changes by 35.512 h after decimation (start 2027-06-01T00:00:00.000Z; duration 720 h; phase 1). Short visibility interruptions can substantially change the longest-gap statistic. This result is not a calibrated timing accuracy claim.

### Terrain versus a zero-degree local horizon

| Site | Clearance ° | Sun difference h | Earth difference h | Joint difference h |
| --- | ---: | ---: | ---: | ---: |
| ridge-1 | 0 | 438.323 | 37.737 | 351.391 |
| ridge-1 | 0.5 | 351.234 | 39.550 | 299.545 |
| ridge-4 | 0 | 455.571 | 37.133 | 273.785 |
| ridge-4 | 0.5 | 317.101 | 38.837 | 220.996 |
| ridge-6 | 0 | 495.272 | 36.483 | 283.280 |
| ridge-6 | 0.5 | 323.864 | 37.735 | 218.324 |

### Nine-location sensitivity

Maximum range between the nine locations over all six-hour-start, seven-day windows. These are measured geometric differences, not probabilities.

| Site | Clearance ° | Longest dark range h | Longest Earth gap range h | Joint range h |
| --- | ---: | ---: | ---: | ---: |
| ridge-1 | 0 | 121.3169 | 0.5367 | 90.4387 |
| ridge-1 | 0.5 | 87.7243 | 0.5783 | 101.1128 |
| ridge-4 | 0 | 78.4593 | 0.6264 | 81.7334 |
| ridge-4 | 0.5 | 109.3304 | 0.6140 | 97.2639 |
| ridge-6 | 0 | 157.8480 | 0.6867 | 151.9616 |
| ridge-6 | 0.5 | 168.0000 | 0.6283 | 136.6923 |

### Demonstration candidates

- ridge-6, 2027-06-03T06:00:00.000Z, 168 h: clearance 0.5°; darkness limit 48 h; Earth-gap limit 48 h; joint requirement 24 h. Center passes; 8/9 locations pass. Largest additional outage: 166.269 h. Contrast exceeds the native temporal sample step; this alone is not an accuracy guarantee.
- ridge-6, 2027-06-02T06:00:00.000Z, 168 h: clearance 0°; darkness limit 24 h; Earth-gap limit 12 h; joint requirement 24 h. Center passes; 8/9 locations pass. Largest additional outage: 155.053 h. Contrast exceeds the native temporal sample step; this alone is not an accuracy guarantee.
- ridge-4, 2027-06-03T12:00:00.000Z, 168 h: clearance 0.5°; darkness limit 48 h; Earth-gap limit 48 h; joint requirement 24 h. Center passes; 6/9 locations pass. Largest additional outage: 99.968 h. Contrast exceeds the native temporal sample step; this alone is not an accuracy guarantee.
- ridge-4, 2027-06-03T18:00:00.000Z, 168 h: clearance 0°; darkness limit 48 h; Earth-gap limit 48 h; joint requirement 24 h. Center passes; 6/9 locations pass. Largest additional outage: 67.814 h. Contrast exceeds the native temporal sample step; this alone is not an accuracy guarantee.
- ridge-1, 2027-06-01T00:00:00.000Z, 168 h: clearance 0°; darkness limit 24 h; Earth-gap limit 0 h; joint requirement 24 h. Center passes; 4/9 locations pass. Largest additional outage: 61.622 h. Contrast exceeds the native temporal sample step; this alone is not an accuracy guarantee.

Cached search: 279 candidates in 319.02 ms on this run; earliest feasible delay 30 h. Timing is host-dependent.

### Selected reproducible walkthrough

ridge-6, 2027-06-02T06:00:00Z, 168 h, zero additional angular clearance. Limits: darkness ≤ 24 h; Earth-view gap ≤ 24 h; joint visibility ≥ 24 h.

Center sunlight: 155.55 h; longest center darkness: 12.45 h. 8/9 locations pass. Worst sampled-location darkness: 167.50 h. Both 60-minute decimation phases retain 8 and 8 passing locations.

- Earliest later all-nine-pass candidate on the six-hour grid: ridge-1, 2027-06-21T12:00:00.000Z, a 462 h delay.
- Earliest later all-nine-pass candidate on the six-hour grid: ridge-4, 2027-06-21T12:00:00.000Z, a 462 h delay.

Selected after inspecting the modeled cases. This is a reproducible illustration, not a representative success-rate benchmark.

## lunar-sites-march.json

2027-03-01T00:00:00Z to 2027-04-01T00:00:00Z; 30-minute observations.

Clearance monotonicity: 1800 comparisons, 0 violations.

### Full cached interval, zero angular clearance

| Site | Sun visible h | Earth visible h | Longest dark h | Longest Earth gap h |
| --- | ---: | ---: | ---: | ---: |
| ridge-1 | 546.55 | 341.63 | 95.60 | 294.59 |
| ridge-4 | 595.28 | 341.02 | 72.11 | 294.76 |
| ridge-6 | 575.62 | 339.97 | 70.72 | 295.03 |

### Time-sampling sensitivity

Largest absolute metric changes over the full interval and daily-start seven-day windows, using both decimation phases.

| Site | Clearance ° | Sun h | Earth h | Joint h | Longest dark h | Longest Earth gap h |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ridge-1 | 0 | 0.6918 | 0.0001 | 0.6428 | 0.2071 | 0.0001 |
| ridge-1 | 0.5 | 0.0172 | 0.0000 | 0.0000 | 0.0027 | 0.0000 |
| ridge-4 | 0 | 0.8413 | 0.0001 | 0.8413 | 0.8412 | 0.0000 |
| ridge-4 | 0.5 | 0.1051 | 0.0000 | 0.1051 | 0.1049 | 0.0000 |
| ridge-6 | 0 | 0.2613 | 0.0001 | 0.2533 | 0.2547 | 0.0001 |
| ridge-6 | 0.5 | 0.3042 | 0.0000 | 0.1211 | 0.1825 | 0.0000 |

**Observed sensitivity:**

- ridge-1, 0° clearance: sunHours changes by 0.692 h after decimation (start 2027-03-01T00:00:00.000Z; duration 744 h; phase 0). Short visibility interruptions can substantially change the longest-gap statistic. This result is not a calibrated timing accuracy claim.
- ridge-1, 0° clearance: jointHours changes by 0.643 h after decimation (start 2027-03-08T00:00:00.000Z; duration 168 h; phase 0). Short visibility interruptions can substantially change the longest-gap statistic. This result is not a calibrated timing accuracy claim.
- ridge-4, 0° clearance: sunHours changes by 0.841 h after decimation (start 2027-03-13T00:00:00.000Z; duration 168 h; phase 1). Short visibility interruptions can substantially change the longest-gap statistic. This result is not a calibrated timing accuracy claim.
- ridge-4, 0° clearance: jointHours changes by 0.841 h after decimation (start 2027-03-14T00:00:00.000Z; duration 168 h; phase 1). Short visibility interruptions can substantially change the longest-gap statistic. This result is not a calibrated timing accuracy claim.
- ridge-4, 0° clearance: longestDarkHours changes by 0.841 h after decimation (start 2027-03-08T00:00:00.000Z; duration 168 h; phase 1). Short visibility interruptions can substantially change the longest-gap statistic. This result is not a calibrated timing accuracy claim.

### Terrain versus a zero-degree local horizon

| Site | Clearance ° | Sun difference h | Earth difference h | Joint difference h |
| --- | ---: | ---: | ---: | ---: |
| ridge-1 | 0 | 546.551 | 42.062 | 208.507 |
| ridge-1 | 0.5 | 398.463 | 44.006 | 119.486 |
| ridge-4 | 0 | 595.277 | 41.164 | 275.037 |
| ridge-4 | 0.5 | 411.582 | 43.082 | 186.117 |
| ridge-6 | 0 | 575.623 | 39.688 | 318.798 |
| ridge-6 | 0.5 | 390.306 | 41.753 | 238.157 |

### Nine-location sensitivity

Maximum range between the nine locations over all six-hour-start, seven-day windows. These are measured geometric differences, not probabilities.

| Site | Clearance ° | Longest dark range h | Longest Earth gap range h | Joint range h |
| --- | ---: | ---: | ---: | ---: |
| ridge-1 | 0 | 148.0954 | 0.6373 | 141.3327 |
| ridge-1 | 0.5 | 116.6518 | 0.6382 | 86.8895 |
| ridge-4 | 0 | 104.8804 | 0.6771 | 60.2225 |
| ridge-4 | 0.5 | 82.0841 | 0.6885 | 81.8053 |
| ridge-6 | 0 | 137.2778 | 0.6856 | 137.2778 |
| ridge-6 | 0.5 | 162.1246 | 0.7236 | 162.1246 |

### Demonstration candidates

- ridge-6, 2027-03-06T00:00:00.000Z, 168 h: clearance 0.5°; darkness limit 6 h; Earth-gap limit 0 h; joint requirement 24 h. Center passes; 6/9 locations pass. Largest additional outage: 159.192 h. Contrast exceeds the native temporal sample step; this alone is not an accuracy guarantee.
- ridge-6, 2027-03-05T12:00:00.000Z, 168 h: clearance 0°; darkness limit 48 h; Earth-gap limit 48 h; joint requirement 24 h. Center passes; 8/9 locations pass. Largest additional outage: 134.869 h. Contrast exceeds the native temporal sample step; this alone is not an accuracy guarantee.
- ridge-1, 2027-03-10T18:00:00.000Z, 168 h: clearance 0°; darkness limit 48 h; Earth-gap limit 0 h; joint requirement 24 h. Center passes; 4/9 locations pass. Largest additional outage: 120.242 h. Contrast exceeds the native temporal sample step; this alone is not an accuracy guarantee.
- ridge-4, 2027-03-04T00:00:00.000Z, 168 h: clearance 0°; darkness limit 48 h; Earth-gap limit 48 h; joint requirement 24 h. Center passes; 4/9 locations pass. Largest additional outage: 77.461 h. Contrast exceeds the native temporal sample step; this alone is not an accuracy guarantee.
- ridge-4, 2027-03-07T06:00:00.000Z, 168 h: clearance 0.5°; darkness limit 48 h; Earth-gap limit 48 h; joint requirement 24 h. Center passes; 6/9 locations pass. Largest additional outage: 68.434 h. Contrast exceeds the native temporal sample step; this alone is not an accuracy guarantee.
- ridge-1, 2027-03-05T18:00:00.000Z, 168 h: clearance 0.5°; darkness limit 48 h; Earth-gap limit 48 h; joint requirement 24 h. Center passes; 4/9 locations pass. Largest additional outage: 59.683 h. Contrast exceeds the native temporal sample step; this alone is not an accuracy guarantee.

Cached search: 291 candidates in 286.16 ms on this run; earliest feasible delay 102 h. Timing is host-dependent.

## lunar-sites.json

2026-12-01T00:00:00Z to 2027-01-01T00:00:00Z; 30-minute observations.

Clearance monotonicity: 1800 comparisons, 0 violations.

### Full cached interval, zero angular clearance

| Site | Sun visible h | Earth visible h | Longest dark h | Longest Earth gap h |
| --- | ---: | ---: | ---: | ---: |
| ridge-1 | 744.00 | 331.83 | 0.00 | 303.85 |
| ridge-4 | 744.00 | 331.64 | 0.00 | 303.95 |
| ridge-6 | 744.00 | 331.20 | 0.00 | 304.19 |

### Time-sampling sensitivity

Largest absolute metric changes over the full interval and daily-start seven-day windows, using both decimation phases.

| Site | Clearance ° | Sun h | Earth h | Joint h | Longest dark h | Longest Earth gap h |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ridge-1 | 0 | 0.0000 | 0.0002 | 0.0002 | 0.0000 | 0.0002 |
| ridge-1 | 0.5 | 0.0000 | 0.0003 | 0.0003 | 0.0000 | 0.0001 |
| ridge-4 | 0 | 0.0000 | 0.0002 | 0.0002 | 0.0000 | 0.0002 |
| ridge-4 | 0.5 | 0.0000 | 0.0002 | 0.0002 | 0.0000 | 0.0001 |
| ridge-6 | 0 | 0.0000 | 0.0003 | 0.0003 | 0.0000 | 0.0002 |
| ridge-6 | 0.5 | 0.0000 | 0.0002 | 0.0002 | 0.0000 | 0.0001 |

### Terrain versus a zero-degree local horizon

| Site | Clearance ° | Sun difference h | Earth difference h | Joint difference h |
| --- | ---: | ---: | ---: | ---: |
| ridge-1 | 0 | 0.000 | 46.520 | 46.520 |
| ridge-1 | 0.5 | 0.000 | 47.201 | 47.201 |
| ridge-4 | 0 | 0.000 | 46.032 | 46.032 |
| ridge-4 | 0.5 | 0.000 | 46.753 | 46.753 |
| ridge-6 | 0 | 0.000 | 45.163 | 45.163 |
| ridge-6 | 0.5 | 0.000 | 45.923 | 45.923 |

### Nine-location sensitivity

Maximum range between the nine locations over all six-hour-start, seven-day windows. These are measured geometric differences, not probabilities.

| Site | Clearance ° | Longest dark range h | Longest Earth gap range h | Joint range h |
| --- | ---: | ---: | ---: | ---: |
| ridge-1 | 0 | 0.0000 | 0.2436 | 0.2436 |
| ridge-1 | 0.5 | 0.0000 | 0.2135 | 0.2135 |
| ridge-4 | 0 | 0.0000 | 0.2642 | 0.2642 |
| ridge-4 | 0.5 | 0.0000 | 0.2134 | 0.2134 |
| ridge-6 | 0 | 0.0000 | 0.2913 | 0.2913 |
| ridge-6 | 0.5 | 0.0000 | 0.2427 | 0.2427 |

### Demonstration candidates

- ridge-1, 2026-12-13T18:00:00.000Z, 168 h: clearance 0.5°; darkness limit 48 h; Earth-gap limit 6 h; joint requirement 24 h. Center passes; 7/9 locations pass. Largest additional outage: 0.064 h. Contrast is below the native temporal sample step; do not use it as a resolved operational benefit.

Cached search: 291 candidates in 266.32 ms on this run; earliest feasible delay 288 h. Timing is host-dependent.
