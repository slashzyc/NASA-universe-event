# Method and interpretation

LunaMargin screens lunar Sun/Earth-center visibility at three actual research locations in Connecting Ridge. Its user-facing decision is whether a requested arrival time and duration satisfy declared geometric limits at the center and surrounding sampled positions.

## Reproducible inputs

Read [the data pipeline specification](../data-pipeline/README.md) for source products, coordinates, projection, heights, radial sampling, patch construction and exact API parameters. [The source manifest](../data/source-manifest.json) records raw raster hashes. Each site has links and hashes for the retained JPL responses.

LOLA's mean-Earth coordinates and 1,737.4 km reference sphere are matched to the mean-Earth observer convention and radius recorded in Horizons responses. Horizons' DE441 dynamical ephemeris must not be confused with the DEM's DE421 coordinate-frame provenance. All times are UTC.

## Visibility and intervals

For each body and sample, define `clearance = body elevation - interpolated terrain horizon - user angular margin`. The body center is visible only when clearance is strictly positive. The horizon uses circular linear interpolation between geographic bearings.

We interpolate clearance linearly between valid neighboring epochs, split intervals at zero crossings and integrate interval lengths. The endpoint observation is not counted as an additional interval. The longest dark interval and longest Earth-view gap are calculated over the requested mission window; outages can continue beyond its edges. Total simultaneous visibility is an intersection of the two visible interval sets.

Invalid, duplicate or nonfinite epochs and oversized sampling gaps remain unknown. A complete mission statistic becomes `null` when the required interval is not covered. Unsupported observer heights produce an explicit unsupported result. No silent extrapolation or fabricated zeroes are used.

## Footprint and search

Nine positions use geographic east/north offsets of −25, 0 and +25 m. Their terrain horizons differ; the published interactive bundles reuse the center ephemeris within this small footprint. A separate finer audit queries each location individually for the principal demonstration. The count of passing positions is a fraction of declared samples, not a probability or a continuous-area fraction.

A center passes when longest darkness and Earth-view gap do not exceed their limits and total overlap meets its requirement. The “find a later window” search also requires all nine surrounding positions to pass. Candidate arrivals are every six hours from the selected start until the cached campaign no longer covers the entire mission. No interpolation bridges months.

## Maps and presentation

The overview is a 129×129 sampling of actual terrain over 6.4 km. Fixed cartographic lighting makes relief readable and is explicitly separate from modeled sunlight. The footprint lens enlarges the 50×50 m sample layout without pretending the overview resolves each point at that scale. Terrain and offsets are oriented to geographic north/east. Selecting a lens point changes the inspected metrics, horizon and timeline; the comparison table retains center-point results.

## Numerical validation and limits

[Measured validation](validation-results.md) reports actual-data checks, time-cadence sensitivity, flat-horizon comparisons and the default walkthrough. [Geometry audit](../data/geometry-audit.json) covers projection, reference frame, radial/azimuth refinement and local/regional DEM transition. [Finer demonstration audit](../data/fine-ephemeris-validation.json) uses real five-minute observations, separate location coordinates and finer rays.

These checks validate internal consistency and numerical sensitivity; they do not establish flight accuracy. Terrain resolution, interpolation and measurement errors remain after numerical refinement. The local/regional seam has nonzero differences. Short visible intervals can strongly change the longest blackout and cannot be assumed to recharge a battery. The horizon radius is finite and narrow obstacles can be missed between azimuths.

The output does not compute partial-disc illumination, eclipses, power, thermal survival, ground-station line of sight, link budgets, terrain collision or landing safety. A body center below a local tangent plane can still be above a depressed terrain horizon; a flat zero-degree horizon is therefore a comparison baseline, not physical truth.

## Why this project

The distinctive workflow is a transparent comparison between an attractive center, nearby terrain scenarios and alternative dates. It combines a simple user decision with inspectable scientific inputs. It does not claim to be the first lunar visibility tool, and it does not infer an award probability from prior winners. [Challenge positioning](JUDGING_STRATEGY.md).
