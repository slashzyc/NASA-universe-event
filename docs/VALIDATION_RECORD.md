# LunaMargin — validation and evidence record

Recorded 12 November 2026, America/New_York. Exact run timestamps, environment information and hashes are preserved in the linked machine-readable reports. The validation establishes the checks described below, not flight qualification or an external observational benchmark.

## Scientific and numerical evidence

| Check | Observed result | Evidence |
| --- | --- | --- |
| Internal checks and data sensitivity | 46,212 checks, zero failures in the recorded science run | [validation-results.md](validation-results.md), [JSON](validation-results.json) |
| Source bytes and settings | Exact NASA file/API URLs, input hashes, query parameters and source metadata retained | [source-manifest.json](../data/source-manifest.json), [raw responses](../data/raw/) |
| Projection | Custom inverse agrees with PROJ to less than 3 × 10⁻¹³ degrees for checked points | [geometry-audit.json](../data/geometry-audit.json) |
| Terrain seam | 804 boundary samples; local/regional RMS difference 2.4163 m, maximum absolute difference 10.4718 m | [geometry-audit.json](../data/geometry-audit.json) |
| Ray refinement | Halving radial steps changes central horizons by at most 0.03770°, 0.01624°, 0.01584° for ROI 1/4/6 | [geometry-audit.json](../data/geometry-audit.json) |
| Bearing refinement | Half-degree directions differ from linear interpolation by up to 0.06740°, 0.08325°, 0.07026° | [geometry-audit.json](../data/geometry-audit.json) |
| Temporal sensitivity | 30-to-60-minute decimation tested in both phases; some short windows materially alter longest darkness | [validation-results.md](validation-results.md) |
| Actual five-minute demonstration check | Separate Horizons queries and finer terrain rays preserve center-pass / southeast-fail | [fine-ephemeris-validation.json](../data/fine-ephemeris-validation.json) |
| Nearby ephemeris reuse | In the two-point check, maximum direction differences are about 0.08996° azimuth and 0.001167° elevation | [fine-ephemeris-validation.json](../data/fine-ephemeris-validation.json) |

The seam differences combine source adjustment and resolution effects; they are not confidence intervals. Refinement checks measure numerical sensitivity, not unknown terrain error. The five-minute check uses real new queries and a separate Python interval calculation but the same terrain sources.

## Reproducible demonstration

Inputs: **ROI 6**, **2027-06-02 06:00 UTC**, **168 h**; maximum darkness **24 h**, maximum Earth gap **24 h**, minimum joint visibility **24 h**; clearance **0°**, observer height **2 m**. The nine offsets are a 3 × 3 layout with 25 m spacing. The application series uses 30-minute ephemerides and one-degree terrain directions.

| Quantity | Published application center | Published southeast sample | Finer check center | Finer check southeast |
| --- | ---: | ---: | ---: | ---: |
| Sun visible h | 155.5520 | 0.4990 | 155.5628 | 0.6522 |
| Longest darkness h | 12.4480 | 167.5010 | 12.4372 | 167.3478 |
| Longest Earth gap h | 6.3187 | 6.2920 | 6.3719 | 6.4435 |
| Joint visibility h | 149.2333 | 0 | 149.1909 | 0 |
| Meets chosen constraints | Yes | No | Yes | No |

Southeast means east 25 m / north −25 m, a 35.36 m offset. Its sampled surface is 2.023 m lower than the center. The published application reports **8/9 passing**, with all nine scenarios evaluated. That is neither a probability nor an area estimate. Fine verification covers these two points, not all nine.

The six-hour-grid search evaluates 264 combinations. Earliest all-nine passing candidates are ROI 1 and ROI 4 at **2027-06-21 12:00 UTC**, **462 h later**. ROI 4 has longest darkness 7.6818 h, longest Earth gap 18.6163 h and joint visibility 141.7019 h. The result is limited to this cached interval and search grid.

All exact values, analysis/data hashes and settings: [demo-evidence.json](demo-evidence.json). The case was selected after data exploration; it is not a held-out performance benchmark.

## Browser evidence

Automated browser checks use installed Chrome through Playwright. The recorded final local run passed **19 checks with zero failures**. Tests cover three sites, three campaigns, date/duration/ranges, nine pointer selections, keyboard/time control, worker search and applying its result, language persistence, source links, tour, URL restoration, HTML/CSV/JSON downloads, stale-setting consistency and a 380 px phone viewport. Regressions also verify that an older delayed campaign response cannot replace the latest selection, an empty date cannot overwrite the saved analysis, unsupported URL options keep valid defaults, and the final seven-day arrival date permits midnight only.

The authoritative latest pass/fail counts and any open issue are in [browser-validation.json](browser-validation.json); rerun `node tests/browser-smoke.mjs` with an installed Playwright package. Screenshots: [desktop](screenshots/desktop.png), [380 px phone](screenshots/phone-380.png). Screenshots were visually inspected in addition to automated overflow/overlap checks. A successful browser suite is functional QA, not a human usability study.

## Remaining scientific scope

- Body centers are used. Partial discs, eclipses, ground-station links, power/thermal models and landing hazards are not included.
- Terrain uses interpolated source products, two resolutions, finite bearing steps and a 250 km search radius.
- Time-window events are estimated by interpolation and clipped to the requested mission interval.
- The main application reuses center ephemerides for nearby offsets; the two-point audit measures this approximation for the demonstration.
- No human usability study, external expert review or flight-data validation has been conducted.

## Submission status

| Requirement | Status |
| --- | --- |
| Match a used input to official 2026 challenge Resources | **OPEN — hard requirement.** Full current list not confirmed; record exact listed resource and retrieval date. |
| Current central judging/demo rules | Owner must verify current guide, language and format limits. |
| Team registration and deadline | Owner must confirm actual members at the same event and Team Owner time zone. |
| Advance-development eligibility | **UNCONFIRMED.** Development preceded the official event with the owner's informed instruction. |
| AI disclosure | Recorded in [AI_DISCLOSURE.md](AI_DISCLOSURE.md); final members/contributions and any later media remain to be declared accurately. |
| Official submission | Not performed by these development and validation steps. |
