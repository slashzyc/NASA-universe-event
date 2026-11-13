# LunaMargin — evidence-led judging strategy

Make one decision understandable and reproducible: selecting a lunar reference point and date under stated darkness and Earth-visibility constraints. The strongest award alignment is **Best Use of Science** and **Best Use of Data**, based on [published definitions](https://www.spaceappschallenge.org/2025/awards/). This is positioning; judges select awards.

Competition eligibility remains unresolved because development began before the official start. Preserve the true timeline in the submission. Technical completeness does not resolve eligibility.

## Five assessment lenses

These dimensions appear in official-hosted event guidance. The central 2026 guide and any weighting still need verification. No percentages or predicted scores are assigned.

| Dimension | What a judge should understand | Evidence to show | Claims needing further evidence |
| --- | --- | --- | --- |
| Impact | Who needs the comparison and what decision becomes clearer | Concrete early mission-concept/classroom scenario; reproducible case | Cost savings, adoption or time saved without a study |
| Creativity | How margins and nearby samples add value to horizon plots | Working link between constraints, intervals and spatial samples | First, unique or universally best lunar planner |
| Validity | How inputs produce the displayed result | Source metadata, conventions, tests, edge handling and exports | Flight certification or calibrated landing-success probability |
| Relevance | How the tool answers the challenge's sites/dates/Sun/Earth request | Comparable sites/dates, local horizon, interpretable windows | Extra features unrelated to that comparison |
| Presentation | Whether a new viewer understands the question and result | Focused demo, clear units, captions, source links | Proven usability based only on creator preference |

## Recommended claim

Use after the corresponding implementation and evidence pass review:

“For a chosen site and date range, LunaMargin shows continuous Sun and Earth visibility interruptions, compares them with stated constraints, and identifies the fraction of nearby evaluated points meeting those constraints.”

Follow with one case and exact conditions. Report both sides of a tradeoff. If a comparison leaves the result unchanged, explain it without manufacturing a dramatic reversal.

## Evidence that matters

1. **A complete decision chain:** source file and ephemeris query → horizon comparison → interruption metric → constraint decision.
2. **Reference checks:** source conventions and archived outputs, a tolerance chosen before comparison, then observed differences.
3. **Edge cases:** always visible, never visible, threshold crossing, analysis-window boundaries, missing terrain and insufficient valid samples.
4. **Spatial meaning:** sample layout, valid denominator, exclusions and the rule determining whether a point meets all constraints.
5. **Reproduction:** export settings, input versions and results; confirm the saved case matches the displayed state.
6. **Observed usability:** record actual tasks, participants and outcomes if a study occurs. Until then, say structured user testing has not been completed.

## Scope discipline

Prioritize source integrity, geometry, comparison and explanation. Add visuals or modes when they improve those tasks. A validated region with visible coverage provides stronger evidence than a global display that silently substitutes synthetic terrain.

Interpret power potential through implemented illumination geometry and Earth visibility through modeled line of sight. Energy, thermal behavior, radio-link performance and touchdown safety require additional models. Place the relevant scope next to each affected metric and in the methodology.

NASA's [2023](https://science.nasa.gov/directorates/smd/2023-nasa-international-space-apps-challenge-announces-10-global-winners/), [2024](https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-international-space-apps-challenge-announces-2024-global-winners/) and [2025](https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/) announcements include scientific-data experiences and concrete decision tools. Universal winners include Spacebee, Waterwise and Astro Sweepers. Our inference is to explain a narrow decision well and expose its evidence. Winner summaries are not a model of judging outcomes.

## Final review

- Can a viewer explain each margin in one sentence?
- Are observed inputs, computed outputs, user assumptions and illustrations distinguishable?
- Does the demo use the published revision's real output?
- Does comparison keep other settings consistent?
- Are missing-data points visibly excluded?
- Is a spatial fraction kept distinct from probability?
- Does each quantitative claim have linked evidence in [VALIDATION_RECORD.md](VALIDATION_RECORD.md)?
- Is an actually used input verified on the official 2026 Resources list?
- Are timeline, AI use, actual member contributions and eligibility status stated accurately?
