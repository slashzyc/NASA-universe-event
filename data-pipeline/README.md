# Reproducible lunar data pipeline

The published bundle contains measured-source topography and JPL ephemerides. The application does not require Python, an API key, or an internet connection after its assets load.

## Rebuild

```sh
python -m pip install -r data-pipeline/requirements.txt
python data-pipeline/build_dataset.py --include-seasons
python -m unittest discover -s data-pipeline
python data-pipeline/audit_geometry.py
python data-pipeline/audit_demo.py
```

Run these commands from the `lunar-margin` directory. The script also accepts execution from another working directory. It caches original NASA raster files in the sibling `research-data` directory. Approximately 350 MB of original files are downloaded; permit at least 3 GB of free memory for the optional fine-resolution audit. Do not commit the dependency folder or original raster cache. The output is three `data/lunar-sites*.json` bundles, `data/source-manifest.json`, and 18 original JPL responses under `data/raw/`.

For completely fresh ephemeris queries, remove the cached response files before rebuilding. Cached responses include the exact API parameters; the script rejects a response whose parameters differ from the current query. Raw raster SHA-256 checksums and byte counts are recorded in the source manifest.

## Locations and reference frame

Three nearby research points are the X/Y attributes of features 1, 4, and 6 in NASA's original `Site01_ROIs.shp` for Connecting Ridge. They are neither invented locations nor NASA-approved touchdown points. Their geographic separation is about one kilometre. This deliberately bounded case study tests how small location changes affect terrain masking; it does not compare all lunar landing regions.

LOLA products use a spherical Moon with radius 1,737,400 m, south-polar stereographic coordinates and the DE421 mean-Earth frame. We invert that exact projection to positive-east longitude and planetocentric latitude. The Moon is spherical in this model, so planetographic and planetocentric latitude coincide. JPL Horizons' lunar topocentric observer uses the corresponding mean-Earth convention. Heights are metres relative to that radius. The observer is always **2 m above the sampled surface**.

## Terrain and horizon

The local terrain source is NASA's 5 m/pixel Site01 DEM. Beyond its coverage, the pipeline uses NASA's orbit-adjusted 80 m/pixel south-polar DEM. Bilinear interpolation samples pixel centres. Nodata never becomes zero: local gaps fall back to the regional DEM, and uncovered rays stop the build with an error.

For each location, 360 geographic bearings are traced clockwise from true north. Great-circle destinations on the lunar sphere are sampled every 2.5 m from 2.5 m to 2 km, every 10 m to 8 km, and every 40 m to 250 km. These subpixel samples interpolate the existing raster and do not create new measured resolution. The pipeline uses the local DEM wherever it is available, regardless of the ray's distance. Each target's elevation angle is computed with spherical curvature:

```text
delta = distance / lunar_radius
horizontal = (lunar_radius + target_height) sin(delta)
vertical = (lunar_radius + target_height) cos(delta)
           - (lunar_radius + observer_surface_height + 2 m)
horizon[bearing] = max(atan2(vertical, horizontal))
```

The maximum is retained in degrees; the distance to the controlling terrain sample is also published for the central point. The 250 km radius fits inside the regional product for these points. No terrain beyond that radius is modeled. Angular rays may miss narrow features between bearings, and finite DEM resolution cannot represent small boulders or landing-footpad hazards. Local and regional DEMs are separately adjusted products and can disagree at their boundary.

Each site's nine patches use east/north offsets of -25, 0, and +25 m. They represent explicit alternative positions, **not statistical draws or a success probability**. Each has a separately computed horizon and its own surface height. Central-point Sun/Earth directions are reused for these offsets; the largest offset is 35.4 m, and this approximation is disclosed in the bundle.

The visual terrain grid samples a 6.4 km square at 50 m spacing, 129 × 129 values. Rows run north to south and columns west to east in a local geographic tangent orientation. It is a visual sampling of the real terrain, not a change to the horizon resolution.

## Ephemerides

JPL Horizons observer tables target the Sun (`10`) and Earth centre (`399`) from `coord@301`, with exact lunar coordinates and terrain height plus 2 m. Quantity 4 supplies apparent airless azimuth and elevation, clockwise from geographic north. The inclusive UTC series runs from 2026-12-01 00:00 to 2027-01-01 00:00 at 30-minute steps: 1,489 samples for each body and location. The final sample is an endpoint; duration integrations must use 1,488 half-hour intervals, not count all samples as intervals.

Two optional full bundles, `lunar-sites-march.json` and `lunar-sites-june.json`, reuse precisely the same terrain and contain separate real Horizons queries for March 1–April 1, 2027 (1,489 samples), and June 1–July 1, 2027 (1,441 samples). These are independent months, never joined across a data gap. The raw responses record `MEAN_ME (high precision)` for lunar orientation and 1,737.4 km for every lunar reference radius. The Sun/Moon dynamical ephemeris is DE441. Thus the source DEM's DE421 frame label must not be mistaken for a claim that Horizons uses DE421 dynamics.

Visibility comparisons use body centres. They do not compute partial solar-disc illumination, Earth ground-station availability, radio link budgets, eclipses, thermal conditions, or power generation. Interpolation of a time series is not a substitute for a finer Horizons query when precise event timing matters.

## Uncertainty metadata

The centre-point height RMS error, local slope, and slope RMS error come directly from NASA's published Site01 products. They are reported without inventing a probability model. The nominal 5 m spacing does not imply 5 m independent measurements: the source documentation reports substantial interpolation between LOLA observations. A high-resolution grid and several decimal places in coordinates do not certify landing safety.

## Release verification

The released three-season bundle and fine-cadence audit passed ten Python tests, including an independent analytic flat-sphere horizon-dip check, projection round trips, bilinear sampling and out-of-bounds handling, complete UTC time grids, common terrain across seasons, and raw-response checksum checks. `data/geometry-audit.json` records further measurements and the exact audited December bundle hash.

- An independent PROJ conversion agrees with the custom inverse projection to less than 3 × 10⁻¹³ degrees. A positive north offset increases latitude at constant longitude; positive east changes longitude eastward. The visual terrain and patches use this geographic orientation, not the polar map's grid axes.
- At 804 points just inside the local DEM boundary, local-minus-regional elevation differences have median +0.7292 m, RMS 2.4163 m, 95th-percentile absolute difference 4.5805 m, and maximum absolute difference 10.4718 m. These combine source adjustment and resolution differences. They are not confidence bounds.
- Further halving radial sampling changes central horizons by at most 0.03770°, 0.01624°, and 0.01584° for ROI 1, 4, and 6. Sampling intermediate half-degree bearings differs from interpolation between the published one-degree bearings by up to 0.06740°, 0.08325°, and 0.07026°. These checks bound only the tested numerical refinements, not unknown terrain error.
- Regional terrain determines the central horizon in 149, 185, and 235 of 360 bearings respectively. In 2, 4, and 12 bearings the controlling terrain lies within 160 m of the local tile boundary, so the product seam is a material modeling limitation.

Fine differences near a chosen clearance threshold can therefore change under better terrain or denser sampling. Do not present sub-step time differences or small angular margins as statistically proven advantages. All 18 raw Horizons responses explicitly identify a spherical lunar reference radius of 1,737.4 km and airless apparent directions.

### Independent demonstration check

`audit_demo.py` additionally queries four real Horizons tables at **5-minute cadence**, for the centre and the actual location 25 m east / 25 m south of ROI 6, from June 2, 2027 06:00 UTC to June 9 06:00 UTC. Each observer has its own Sun and Earth query, so this check does not reuse central ephemerides for the displaced point. It recomputes both horizons at 0.5° azimuth spacing and radial steps of 1.25 / 5 / 20 m. The four original tables are named `data/raw/validation-*`; the complete paired samples, masks, checksums and independent Python interval integration are in `data/fine-ephemeris-validation.json`. These validation files do not alter the UI's three release bundles.

At zero angular clearance, this finer check gives the centre 155.563 h of sunlight, a 12.437 h longest dark interval, and 149.191 h of joint Sun/Earth visibility. The southeast point has 0.652 h of sunlight, a 167.348 h dark interval, and no joint visibility. The 24 h darkness / 24 h Earth-gap / 24 h joint-visibility screening verdict therefore remains centre-pass versus southeast-fail. This two-point check does not independently validate the other seven perturbation ephemerides or the full-month time series.

Using each point's own ephemeris changes azimuth by up to 0.08996° and elevation by up to 0.001167° relative to central reuse; the main contrast survives that correction. The southeast surface is 2.023 m lower than the centre. Terrain only tens of metres away often controls its solar horizon. Thus the contrast has an identifiable terrain explanation, and it also depends on interpolated near-field topography. The native height RMS errors are retained in the audit. Numerical refinement and more frequent ephemerides cannot eliminate source terrain uncertainty or certify a real touchdown site.

## Sources

- [NASA PGDA: High-Resolution LOLA Topography for Lunar South Pole Sites](https://pgda.gsfc.nasa.gov/products/78), including original ROI attributes, DEM, slope, and error rasters.
- Barker et al. (2021), [Improved LOLA Elevation Maps for South Pole Landing Sites: Error Estimates and Their Impact on Illumination Conditions](https://doi.org/10.1016/j.pss.2020.105119).
- [NASA PGDA: A New View of the Lunar South Pole from LOLA](https://pgda.gsfc.nasa.gov/products/90), regional 80 m adjusted DEM.
- Barker et al. (2023), [A New View of the Lunar South Pole from the Lunar Orbiter Laser Altimeter](https://doi.org/10.3847/PSJ/acf3e1); [dataset DOI](https://doi.org/10.60903/gsfcpgda-lola-spole).
- [JPL Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html) and [API documentation](https://ssd-api.jpl.nasa.gov/doc/horizons.html).

NASA source data retain their source attribution. The repository's software licence applies to our code, not a claim of authorship over NASA datasets. NASA is not affiliated with or endorsing this prototype.
