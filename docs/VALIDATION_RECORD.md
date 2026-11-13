# LunaMargin — validation and evidence record

**Initial status: pending.** This is an evidence ledger, not a report of completed tests. Change a status only after running the check and recording its result. Do not copy target tolerances into observed results.

Revision: [commit]  
Application: [verified URL]  
Data manifest: [path/hash/version]  
Validation date/operator: [date; human or automated agent]

## Scientific checks

| Check | Required evidence | Observed result | Status |
| --- | --- | --- | --- |
| Source integrity | Exact NASA URLs, filenames, retrieval metadata and hashes | Not recorded | PENDING |
| Coordinates | Longitude sign, projection, Moon-fixed frame, latitude and height datum; any LOLA/Horizons mismatch or approximation | Not recorded | PENDING |
| Angle convention | Known directions and recorded source rows compared with rendered/computed azimuth/elevation | Not recorded | PENDING |
| Terrain horizon | Controlled cases; curvature, observer height, search distance and angular resolution | Not recorded | PENDING |
| Ephemeris reference | Reference values, comparison method, prior tolerance and observed errors | Not recorded | PENDING |
| Windows | Always-visible/unavailable, crossings, thresholds and clipped analysis boundaries | Not recorded | PENDING |
| Temporal sensitivity | Real case repeated at finer step; changes and crossing treatment | Not recorded | PENDING |
| Spatial samples | Coordinates, layout, valid denominator, exclusions and combined constraints | Not recorded | PENDING |
| Coverage | Nodata/edge/absent inputs do not become favorable terrain | Not recorded | PENDING |
| Scientific scope | Exact body-disc, eclipse and system effects modeled | Not recorded | PENDING |

## Application checks

| Check | Required evidence | Observed result | Status |
| --- | --- | --- | --- |
| Build/tests | Actual commands, environment, counts and output | Not recorded | PENDING |
| Workflow | Site/date selection, calculation, constraint change, comparison and evidence inspection | Not recorded | PENDING |
| Data modes | Live/cached/precomputed labels and network-failure behavior | Not recorded | PENDING |
| Export | Matches displayed state/settings and includes provenance | Not recorded | PENDING |
| Inputs | Invalid coordinates, dates, ordering, ranges and absent coverage | Not recorded | PENDING |
| UI review | Actual viewports, keyboard actions, labels, focus and status text inspected | Not recorded | PENDING |
| Deployment | Published revision and primary interaction observed at final URL | Not recorded | PENDING |
| Human usability | Tasks, participants and observations if a study occurs | No human usability study recorded | NOT CONDUCTED |

## Demonstration case

Keep a measured comparison together with its assumptions.

| Field | Verified value |
| --- | --- |
| Revision / manifest | [pending] |
| Site coordinates / height basis | [pending] |
| UTC interval / step | [pending] |
| Terrain / horizon settings | [pending] |
| Constraints | [pending] |
| Longest Sun-unavailable interval | [pending] |
| Longest Earth-unavailable interval | [pending] |
| Passing / valid / excluded samples | [pending] |
| Alternative and observed difference | [pending] |
| Export | [pending] |
| Reproduction result | [pending] |

## Submission checks

| Requirement | Evidence | Status |
| --- | --- | --- |
| Official 2026 resource match | Exact listed resource, retrieval date and implemented input | OPEN — hard requirement |
| Central 2026 judging guide | Version/date and criteria; do not infer weights | OPEN |
| Submission/demo format | Current fields, language and duration/format rules | OPEN |
| Universal deadline | Team Owner time zone and account/event deadline | OPEN |
| Registration | Actual members confirmed at the same event | OWNER VERIFICATION REQUIRED |
| Advance-development eligibility | Organizer determination with true timeline disclosed | UNCONFIRMED |
| AI attribution | Final inventory, metadata and submission disclosure | OPEN |

## Reporting rule

PASS applies only to the criterion checked. Unit tests do not establish ephemeris accuracy; deployment does not establish scientific validity; automated UI checks do not establish user-study outcomes. Retain failures and explain their effect on the final claim.
