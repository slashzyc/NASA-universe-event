# LunaMargin — challenge and evidence research

Research date: 12 November 2026, America/New_York. This record distinguishes verified rules, research-based strategy and remaining checks. Some official pages returned fetch errors; those gaps are recorded below.

## Challenge fit

[Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/) is a 2026 challenge. Its summary asks for an intuitive way for mission planners, educators and the public to compare lunar south-pole sites and dates, using Sun and Earth positions relative to the horizon to assess solar-power potential and direct-to-Earth communication windows.

LunaMargin's chosen question is: **Which site and date leave enough margin for a mission's darkness and Earth-visibility constraints, including nearby alternative touchdown points?** The project connects source geometry, terrain horizons, contiguous interruption durations and explicit user thresholds. “Margin” is the difference between a chosen allowable interruption and the modeled interruption.

The nearby-point result is the fraction of evaluated points meeting the stated constraints. It describes that finite sample, not a touchdown success probability or a certified safe-landing area.

## Calendar and rules

| Topic | Verified finding | Primary source |
| --- | --- | --- |
| Event dates | 14–15 November 2026 | [2026 overview](https://www.spaceappschallenge.org/2026/) |
| Submission window | Overview says 14 November 09:00 to 15 November 23:59, local time | [2026 overview](https://www.spaceappschallenge.org/2026/) |
| Universal Event start | 14 November 09:00 in the Team Owner's area of residence | [GO Team #1813](https://github.com/nasa/spaceapps/discussions/1813) |
| Advance work | Starting the project before the official event can lead to disqualification; research, resource review, challenge selection and team formation are allowed | [GO Team #1777](https://github.com/nasa/spaceapps/discussions/1777), [#1827](https://github.com/nasa/spaceapps/discussions/1827) |
| Team size | At most six participants | [2026 overview](https://www.spaceappschallenge.org/2026/) |
| Registration | All members must be confirmed participants at the same event; waitlisted members can make the project ineligible | [GO Team #1782](https://github.com/nasa/spaceapps/discussions/1782) |
| NASA resource | Global Awards require at least one NASA data source listed in the selected challenge's Resources; cite all used materials and tools | [GO Team #1827](https://github.com/nasa/spaceapps/discussions/1827) |
| AI | Permitted with disclosure; images/video require visible AI labeling; generated code/data/audio need acknowledgment in description and metadata; generated content must not contain or alter NASA branding | [GO Team #1849](https://github.com/nasa/spaceapps/discussions/1849) |
| Awards timeline | Nominees/finalists in December 2026; winners in January 2027 | [2026 recruitment PDF](https://assets.spaceappschallenge.org/media/documents/2026_NASA_Space_Apps_Registration_Recruitment.pdf) |

The owner explicitly requested full implementation before the official start after being informed of the advance-work rule. Preserve that history. GitHub publication and technical quality do not establish award eligibility. See [AI_DISCLOSURE.md](AI_DISCLOSURE.md).

The current Universal Event deadline, required submission fields and demonstration format must be checked in the registered event and current guides. Do not infer the Team Owner's time zone from this record's time zone.

## Hard requirement: official resource mapping

**OPEN — the full official 2026 challenge Resources list has not been verified.** The summary was retrieved; the current resource list was not confirmed in this research pass. The GO Team said resources would be available on 12 November. NASA origin alone does not establish the named-resource requirement.

Before submitting, inspect the Resources tab, record its retrieval date and exact listed source, and map at least one actually used input to it in [VALIDATION_RECORD.md](VALIDATION_RECORD.md). If none of the implemented inputs appears there, incorporate and document a qualifying source before claiming the requirement is satisfied.

## Data and interpretation

| Source | Role | Interpretation |
| --- | --- | --- |
| [NASA GSFC PGDA 78](https://pgda.gsfc.nasa.gov/products/78) | Regional LOLA elevation, slope and uncertainty products | Source lists 5 m/pixel products in south polar stereographic coordinates, MOON_ME / DE421. Pixel spacing is not a guarantee of independent 5 m terrain accuracy. Cite exact files used. |
| [NASA GSFC PGDA 90](https://pgda.gsfc.nasa.gov/products/90) | Large-area LOLA terrain | Source separates elevation, effective resolution, error, slope and hillshade. A hillshade is contextual imagery; terrain calculations require elevation values. |
| [NASA/JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) | Sun/Earth ephemerides for the observer | Preserve queries, response metadata, coordinate conventions, units, time scale, sample step and retrieval date. |
| [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html), [API documentation](https://ssd-api.jpl.nasa.gov/doc/horizons.html) | Input/output definitions | Check azimuth, elevation, apparent/geometric conventions and lunar coordinate definitions before comparison with DEM-derived horizons. |

The generated data manifest should record actual files, hashes, coverage and preprocessing. A source listed here is a researched resource; the manifest establishes which data the application uses.

Central scientific checks: compatible Moon-fixed coordinates and height references; azimuth convention; lunar curvature; missing terrain and edge coverage; temporal sampling; Sun/Earth disc treatment; distinction between geometry and electrical/radio performance. Record implemented approximations in the methodology and next to affected metrics.

## Lessons from winners

| Year | Officially documented example | Transferable lesson |
| --- | --- | --- |
| 2023 | Spacebee, Universal Event, Best Use of Technology: Apollo moonquake exploration | Organize scientific data into an approachable interactive experience. |
| 2024 | GaamaRamma / Waterwise, Universal Event, Best Use of Data: farmers' water management | Connect the data to a concrete user decision. |
| 2025 | Astro Sweepers, Universal Event, Galactic Impact: orbital-debris risk/reporting. PureFlow, Best Mission Concept: habitat design/validation | Make an engineering workflow and its outputs inspectable. |

Sources: [2023 NASA Science](https://science.nasa.gov/directorates/smd/2023-nasa-international-space-apps-challenge-announces-10-global-winners/), [2024 NASA](https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-international-space-apps-challenge-announces-2024-global-winners/), [2025 NASA](https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/).

These establish that Universal Event projects can win global awards. They do not establish selection causes or a probability of winning, and the summaries do not independently validate every claim in the winning entries.

## Judging and positioning

[The 2025 official awards page](https://www.spaceappschallenge.org/2025/awards/) describes Best Use of Science through valid scientific methods and Best Use of Data through accessible data or a distinct application. Nomination is followed by expert review and executive selection.

Impact, Creativity, Validity, Relevance and Presentation recur in official-hosted local guidance, including [Ajmer 2026](https://www.spaceappschallenge.org/2026/local-events/ajmer/). Local Lead pages are organizer-authored content. The central 2026 guide was not retrieved here. Use these dimensions as planning lenses; no numeric weighting is asserted.

Comparable public tools already offer lunar geometry charts and site comparisons. LunaMargin's positioning should rest on a specific verified workflow: compare contiguous interruptions, inspect their terrain context, test neighboring points and export the assumptions. “First,” “unique,” “most accurate” and award-likelihood claims require further evidence.

Our research-based strategy prioritizes scientific validity, understandable decisions and a reproducible demo. It is a project strategy, not a prediction of what judges will choose.
