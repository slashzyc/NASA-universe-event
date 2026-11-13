/** AI-assisted validation tooling. Results are computed from bundled NASA data;
 * no expected performance or scientific benefit is inserted into this report. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {analyzeSite, searchWindows, interpolateHorizon} from '../src/analysis.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOUR = 3_600_000;
const metricNames = ['sunHours', 'earthHours', 'jointHours', 'longestDarkHours', 'longestCommGapHours'];
const visibleMetrics = ['sunHours', 'earthHours', 'jointHours'];
const gapMetrics = ['longestDarkHours', 'longestCommGapHours'];
const failures = [];
let checkCount = 0;
const check = (condition, description) => { checkCount++; if (!condition) failures.push(description); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const startAt = (milliseconds, offsetHours) => new Date(milliseconds + offsetHours * HOUR).toISOString();
const round = (value, digits = 4) => typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
const scalarMetrics = metrics => Object.fromEntries(metricNames.map(key => [key, round(metrics[key])]));
const defaults = {durationHours: 168, maxDarkHours: 24, maxCommGapHours: 24, minJointHours: 24, clearanceDeg: 0, observerHeightM: 2};

function compact(result) {
  return {siteId: result.siteId, start: result.start, end: result.end, feasible: result.feasible,
    metrics: scalarMetrics(result.metrics), patchCoverage: result.patchStats.coverageFraction,
    patches: result.patchStats.scenarios.map(patch => ({id: patch.id, feasible: patch.feasible, metrics: scalarMetrics(patch.metrics)}))};
}

function decimatedSite(site, phase) {
  const select = samples => samples.filter((_, index) => index === 0 || index === samples.length - 1 || index % 2 === phase);
  return {...site, sampleStepHours: site.sampleStepHours * 2, samples: select(site.samples), patches: []};
}

function independentlyIntegratedVisibility(site, clearanceDeg, stepMinutes = 5) {
  // Independent comparator: interpolate azimuth and elevation, then look up the
  // terrain at each intermediate azimuth. The main implementation interpolates
  // endpoint clearance margins. This is a numerical sensitivity check, NOT an
  // independent ephemeris or terrain truth dataset.
  const totals = {sunHours: 0, earthHours: 0, jointHours: 0};
  const circular = (a, b, fraction) => a + (((b - a + 540) % 360) - 180) * fraction;
  for (let i = 0; i < site.samples.length - 1; i++) {
    const a = site.samples[i], b = site.samples[i + 1];
    const elapsedHours = (Date.parse(b.time) - Date.parse(a.time)) / HOUR;
    const subdivisions = Math.ceil(elapsedHours * 60 / stepMinutes);
    for (let part = 0; part < subdivisions; part++) {
      const fraction = (part + 0.5) / subdivisions;
      const sunEl = a.sunEl + (b.sunEl - a.sunEl) * fraction;
      const earthEl = a.earthEl + (b.earthEl - a.earthEl) * fraction;
      const sun = sunEl > interpolateHorizon(site.horizon, circular(a.sunAz, b.sunAz, fraction)) + clearanceDeg;
      const earth = earthEl > interpolateHorizon(site.horizon, circular(a.earthAz, b.earthAz, fraction)) + clearanceDeg;
      const width = elapsedHours / subdivisions;
      if (sun) totals.sunHours += width;
      if (earth) totals.earthHours += width;
      if (sun && earth) totals.jointHours += width;
    }
  }
  return totals;
}

function thresholdPass(metrics, constraints) {
  return metrics.longestDarkHours <= constraints.maxDarkHours + 1e-9
    && metrics.longestCommGapHours <= constraints.maxCommGapHours + 1e-9
    && metrics.jointHours + 1e-9 >= constraints.minJointHours;
}

async function validateBundle(filename) {
  const bytes = await fs.readFile(path.join(ROOT, 'data', filename));
  const bundle = JSON.parse(bytes);
  const firstMs = Date.parse(bundle.start), stopMs = Date.parse(bundle.stop);
  const durationHours = (stopMs - firstMs) / HOUR;
  const nominalHours = bundle.sampleIntervalMinutes / 60;
  const sites = bundle.sites.map(site => ({...site, sampleStepHours: site.sampleStepHours ?? nominalHours, horizonHeightM: site.horizonHeightM ?? site.observerHeightM ?? bundle.observerHeightM}));
  const report = {
    filename, sha256: hash(bytes), dataGeneratedAt: bundle.generatedAt, start: bundle.start, stop: bundle.stop,
    sampleIntervalMinutes: bundle.sampleIntervalMinutes, siteCount: sites.length,
    fullInterval: [], clearanceMonotonicity: {comparisons: 0, violations: 0},
    samplingSensitivity: [], terrainComparison: [], footprintComparison: [],
    independentInterpolationComparison: [], missingDataChecks: [], demoCandidates: [],
  };
  for (const site of sites) {
    const label = `${filename}/${site.id}`;
    check(site.horizon.length === 360 && site.horizon.every(Number.isFinite), `${label}: invalid central horizon`);
    check(site.patches.length === 9, `${label}: expected nine declared patch scenarios`);
    const centralPatch = site.patches.find(patch => patch.dxM === 0 && patch.dyM === 0);
    check(Boolean(centralPatch), `${label}: missing central patch`);
    check(JSON.stringify(centralPatch?.horizon) === JSON.stringify(site.horizon), `${label}: central patch horizon mismatch`);
    for (let index = 0; index < site.samples.length; index++) {
      const sample = site.samples[index];
      check(['sunAz', 'sunEl', 'earthAz', 'earthEl'].every(key => Number.isFinite(sample[key])), `${label}: invalid angle at sample ${index}`);
      check(sample.sunAz >= 0 && sample.sunAz < 360 && sample.earthAz >= 0 && sample.earthAz < 360
        && Math.abs(sample.sunEl) <= 90 && Math.abs(sample.earthEl) <= 90, `${label}: invalid angle range at sample ${index}`);
      if (index) check(Date.parse(sample.time) - Date.parse(site.samples[index - 1].time) === nominalHours * HOUR, `${label}: irregular cadence at sample ${index}`);
    }
    const full = analyzeSite(site, {...defaults, start: bundle.start, durationHours, observerHeightM: site.horizonHeightM});
    check(full.status === 'complete' && full.coverage.fraction === 1, `${label}: incomplete full interval`);
    report.fullInterval.push(compact(full));
    for (const metric of metricNames) check(full.metrics[metric] >= 0 && full.metrics[metric] <= durationHours + 1e-6, `${label}: ${metric} outside duration bounds`);
    const centralScenario = full.patchStats.scenarios.find(item => item.id === centralPatch?.id);
    check(metricNames.every(key => Math.abs(full.metrics[key] - centralScenario?.metrics[key]) < 1e-9), `${label}: central patch metrics disagree`);

    // Monotonicity is checked across complete intervals and independently chosen
    // clipped intervals, including every patch, not just the nominal center.
    const ranges = [[0, durationHours], [0, 168], [Math.max(0, Math.floor((durationHours - 168) / 2)), 168], [durationHours - 168, 168]];
    for (const [offset, length] of ranges) {
      let previous = null;
      for (const clearanceDeg of [0, 0.25, 0.5, 1]) {
        const current = analyzeSite(site, {...defaults, start: startAt(firstMs, offset), durationHours: length, clearanceDeg, observerHeightM: site.horizonHeightM});
        if (previous) {
          const before = [previous.metrics, ...previous.patchStats.scenarios.map(item => item.metrics)];
          const after = [current.metrics, ...current.patchStats.scenarios.map(item => item.metrics)];
          for (let index = 0; index < before.length; index++) {
            for (const key of visibleMetrics) {
              const valid = after[index][key] <= before[index][key] + 1e-8;
              check(valid, `${label}: visibility increased with clearance (${key})`);
              report.clearanceMonotonicity.comparisons++;
              if (!valid) report.clearanceMonotonicity.violations++;
            }
            for (const key of gapMetrics) {
              const valid = after[index][key] + 1e-8 >= before[index][key];
              check(valid, `${label}: outage decreased with clearance (${key})`);
              report.clearanceMonotonicity.comparisons++;
              if (!valid) report.clearanceMonotonicity.violations++;
            }
          }
        }
        previous = current;
      }
    }

    for (const clearanceDeg of [0, 0.5]) {
      const withTerrain = analyzeSite({...site, patches: []}, {...defaults, start: bundle.start, durationHours, clearanceDeg});
      const flat = analyzeSite({...site, patches: [], horizon: Array(360).fill(0)}, {...defaults, start: bundle.start, durationHours, clearanceDeg});
      report.terrainComparison.push({siteId: site.id, clearanceDeg, terrain: scalarMetrics(withTerrain.metrics), flatTangentPlane: scalarMetrics(flat.metrics),
        terrainMinusFlatHours: Object.fromEntries(metricNames.map(key => [key, round(withTerrain.metrics[key] - flat.metrics[key])]))});
      const independent = independentlyIntegratedVisibility(site, clearanceDeg);
      report.independentInterpolationComparison.push({siteId: site.id, clearanceDeg, midpointStepMinutes: 5,
        mainHours: Object.fromEntries(visibleMetrics.map(key => [key, round(withTerrain.metrics[key])])),
        independentlyIntegratedHours: Object.fromEntries(visibleMetrics.map(key => [key, round(independent[key])])),
        mainMinusComparatorHours: Object.fromEntries(visibleMetrics.map(key => [key, round(withTerrain.metrics[key] - independent[key])]))});
    }

    // Compare both phases of a 60-minute decimation. Each run retains the exact
    // requested endpoints; endpoint half-steps remain allowed and are disclosed.
    for (const clearanceDeg of [0, 0.5]) {
      const maxima = Object.fromEntries(metricNames.map(key => [key, {absoluteHours: 0, start: null, phase: null}]));
      let comparedIntervals = 0;
      const ranges = [[0, durationHours], ...Array.from({length: Math.floor((durationHours - 168) / 24) + 1}, (_, index) => [index * 24, 168])];
      for (const [offset, length] of ranges) {
        const settings = {...defaults, start: startAt(firstMs, offset), durationHours: length, clearanceDeg};
        const fine = analyzeSite({...site, patches: []}, settings);
        for (const phase of [0, 1]) {
          const coarse = analyzeSite(decimatedSite(site, phase), settings);
          check(coarse.status === 'complete', `${label}: decimation unexpectedly incomplete`);
          comparedIntervals++;
          for (const key of metricNames) {
            const delta = Math.abs(fine.metrics[key] - coarse.metrics[key]);
            if (delta > maxima[key].absoluteHours) maxima[key] = {absoluteHours: round(delta, 6), start: fine.start, durationHours: length, phase};
          }
        }
      }
      report.samplingSensitivity.push({siteId: site.id, clearanceDeg, fineMinutes: nominalHours * 60,
        coarseMinutes: nominalHours * 120, comparedIntervals, maximumAbsoluteDifferences: maxima});
    }

    const middle = Math.floor(site.samples.length / 2);
    const corruptions = [
      ['missing-epoch', {...site, samples: site.samples.filter((_, index) => index !== middle)}],
      ['null-angle', {...site, samples: site.samples.map((sample, index) => index === middle ? {...sample, sunEl: null} : sample)}],
      ['duplicate-epoch', {...site, samples: [...site.samples, site.samples[middle]]}],
    ];
    for (const [kind, modified] of corruptions) {
      const result = analyzeSite({...modified, patches: []}, {...defaults, start: bundle.start, durationHours});
      const valid = result.status === 'partial' && result.feasible === null && metricNames.every(key => result.metrics[key] === null);
      check(valid, `${label}: ${kind} was not represented as missing data`);
      report.missingDataChecks.push({siteId: site.id, injected: kind, status: result.status, missingHours: round(durationHours - result.coverage.hours), passed: valid});
    }

    // Search actual 7-day intervals at 6-hour offsets. Thresholds below are
    // illustrative engineering INPUTS; they are not derived uncertainty bounds.
    for (const clearanceDeg of [0, 0.5]) {
      let maximumDarkSpread = 0, maximumCommSpread = 0, maximumJointSpread = 0;
      let strongestSpatialExample = null;
      for (let offset = 0; offset <= durationHours - 168; offset += 6) {
        const settings = {...defaults, start: startAt(firstMs, offset), clearanceDeg};
        const result = analyzeSite(site, settings);
        const patches = result.patchStats.scenarios.map(item => item.metrics);
        const spread = key => Math.max(...patches.map(item => item[key])) - Math.min(...patches.map(item => item[key]));
        const darkSpread = spread('longestDarkHours'), commSpread = spread('longestCommGapHours'), jointSpread = spread('jointHours');
        maximumDarkSpread = Math.max(maximumDarkSpread, darkSpread);
        maximumCommSpread = Math.max(maximumCommSpread, commSpread);
        maximumJointSpread = Math.max(maximumJointSpread, jointSpread);
        for (const maxDarkHours of [0, 6, 12, 24, 48]) {
          for (const maxCommGapHours of [0, 6, 12, 24, 48]) {
            const constraints = {maxDarkHours, maxCommGapHours, minJointHours: 24};
            const centerPass = thresholdPass(result.metrics, constraints);
            const passed = patches.filter(metrics => thresholdPass(metrics, constraints)).length;
            if (!centerPass) continue;
            const worstExtraDark = Math.max(...patches.map(item => item.longestDarkHours)) - result.metrics.longestDarkHours;
            const worstExtraComm = Math.max(...patches.map(item => item.longestCommGapHours)) - result.metrics.longestCommGapHours;
            const example = {bundle: filename, siteId: site.id, start: result.start, durationHours: 168, clearanceDeg,
              ...constraints, center: scalarMetrics(result.metrics), patchPassingCount: passed, patchCount: patches.length,
              patchCoverage: passed / patches.length, worstExtraDarkHours: round(worstExtraDark), worstExtraCommGapHours: round(worstExtraComm),
              exceedsNativeSampleStep: Math.max(worstExtraDark, worstExtraComm) >= nominalHours,
              scope: 'Illustrative thresholds; finite scenario coverage, not a success probability.'};
            // Keep reduced records here to avoid publishing arbitrary threshold
            // combinations as if they were distinct scientific findings.
            if (passed < patches.length && (!strongestSpatialExample || Math.max(worstExtraDark, worstExtraComm) > Math.max(strongestSpatialExample.worstExtraDarkHours, strongestSpatialExample.worstExtraCommGapHours))) strongestSpatialExample = example;
          }
        }
      }
      report.footprintComparison.push({siteId: site.id, clearanceDeg, sampleCount: site.patches.length,
        spacingM: site.patchSpacingM, maximumAcrossWindowSpreadHours: {longestDark: round(maximumDarkSpread), longestCommGap: round(maximumCommSpread), joint: round(maximumJointSpread)},
        strongestCenterPassFootprintFail: strongestSpatialExample});
      if (strongestSpatialExample) report.demoCandidates.push(strongestSpatialExample);
    }
  }
  const searchStarted = performance.now();
  const search = searchWindows(sites, {...defaults, start: bundle.start, clearanceDeg: 0.5});
  report.cachedSearch = {settings: {...defaults, start: bundle.start, clearanceDeg: 0.5}, elapsedMilliseconds: round(performance.now() - searchStarted, 2),
    evaluatedCandidates: search.evaluatedCount, excludedCandidates: search.excludedCount, earliestDelayHours: search.earliestDelayHours,
    earliestFeasible: search.earliestFeasible, paretoCount: search.pareto.length};
  const defaultBaseline = sites.map(site => compact(analyzeSite(site, {...defaults, start: bundle.start, clearanceDeg: 0.5})));
  report.defaultScenario = {settings: {...defaults, start: bundle.start, clearanceDeg: 0.5}, baseline: defaultBaseline};
  report.demoCandidates.sort((a, b) => Number(b.exceedsNativeSampleStep) - Number(a.exceedsNativeSampleStep)
    || Math.max(b.worstExtraDarkHours, b.worstExtraCommGapHours) - Math.max(a.worstExtraDarkHours, a.worstExtraCommGapHours));
  if (filename === 'lunar-sites-june.json') {
    const settings = {...defaults, start: '2027-06-02T06:00:00Z', clearanceDeg: 0};
    const selected = sites.find(site => site.id === 'ridge-6');
    if (selected) {
      const fine = analyzeSite(selected, settings);
      const phaseChecks = [0, 1].map(phase => {
        const coarseSite = {...decimatedSite(selected, phase), patches: selected.patches};
        const coarse = analyzeSite(coarseSite, settings);
        const differences = [fine.metrics, ...fine.patchStats.scenarios.map(item => item.metrics)].map((metrics, index) => {
          const other = index === 0 ? coarse.metrics : coarse.patchStats.scenarios[index - 1].metrics;
          return Object.fromEntries(metricNames.map(key => [key, round(other[key] - metrics[key], 6)]));
        });
        return {phase, centerFeasibilityUnchanged: coarse.feasible === fine.feasible,
          patchPassCount: coarse.patchStats.feasibleCount, differences};
      });
      const later = searchWindows(sites, {...settings, minPatchCoverage: 1});
      report.selectedDemonstration = {settings, selectedSiteId: selected.id, baseline: compact(fine),
        sixtyMinutePhaseChecks: phaseChecks, earliestAllNinePass: later.earliestFeasible,
        interpretation: 'Selected after inspecting the modeled cases. This is a reproducible illustration, not a representative success-rate benchmark.'};
    }
  }
  return report;
}

const filenames = (await fs.readdir(path.join(ROOT, 'data'))).filter(name => /^lunar-sites(?:-[a-z]+)?\.json$/.test(name)).sort();
if (!filenames.length) throw new Error('No lunar-sites data bundles found.');
const reports = [];
for (const filename of filenames) {
  console.log(`Validating ${filename}...`);
  reports.push(await validateBundle(filename));
}
const output = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), software: {node: process.version, analysisSha256: hash(await fs.readFile(path.join(ROOT, 'src/analysis.js')))},
  status: failures.length ? 'failed' : 'passed', checkCount, failures,
  evidenceScope: 'Internal correctness, actual-data sensitivity and baseline comparisons. This is not an independent validation against flight measurements or an independent terrain/ephemeris solution.',
  interpretation: [
    'A 30-to-60-minute change measures sensitivity to time sampling; it does not establish absolute event-time accuracy.',
    'The 5-minute comparator interpolates existing observations and is not a new 5-minute NASA ephemeris query.',
    'The zero-degree flat comparator is a local tangent-plane simplification; downhill terrain can legitimately increase visibility relative to it.',
    'Angular clearance is a user-selected deterministic requirement, not a calibrated uncertainty interval.',
    'Patch count fractions are fractions of nine declared locations, not landing probabilities or area-weighted success estimates.',
    'A footprint contrast smaller than the native temporal sample step is reported but should not be presented as a resolved operational advantage.',
    'Selecting demonstration windows after inspecting results is exploratory; it is not a held-out performance benchmark.',
  ],
  bundles: reports,
};
await fs.mkdir(path.join(ROOT, 'docs'), {recursive: true});
await fs.writeFile(path.join(ROOT, 'docs/validation-results.json'), JSON.stringify(output, null, 2) + '\n');

const rows = [];
rows.push('# Measured validation results', '', `Generated: ${output.generatedAt}. Node ${process.version}.`, '',
  `**${output.status.toUpperCase()} internal consistency checks** — ${checkCount.toLocaleString('en-US')} checks; ${failures.length} failures.`, '', output.evidenceScope, '',
  'Reproduce with `node scripts/validate-science.mjs`. Exact dataset and analysis SHA-256 hashes, settings, and all measured values are in [validation-results.json](validation-results.json).', '',
  '## Interpretation', '', ...output.interpretation.map(text => `- ${text}`), '');
for (const report of reports) {
  rows.push(`## ${report.filename}`, '', `${report.start} to ${report.stop}; ${report.sampleIntervalMinutes}-minute observations.`, '',
    `Clearance monotonicity: ${report.clearanceMonotonicity.comparisons} comparisons, ${report.clearanceMonotonicity.violations} violations.`, '',
    '### Full cached interval, zero angular clearance', '', '| Site | Sun visible h | Earth visible h | Longest dark h | Longest Earth gap h |', '| --- | ---: | ---: | ---: | ---: |');
  for (const result of report.fullInterval) rows.push(`| ${result.siteId} | ${result.metrics.sunHours.toFixed(2)} | ${result.metrics.earthHours.toFixed(2)} | ${result.metrics.longestDarkHours.toFixed(2)} | ${result.metrics.longestCommGapHours.toFixed(2)} |`);
  rows.push('', '### Time-sampling sensitivity', '', 'Largest absolute metric changes over the full interval and daily-start seven-day windows, using both decimation phases.', '',
    '| Site | Clearance ° | Sun h | Earth h | Joint h | Longest dark h | Longest Earth gap h |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const result of report.samplingSensitivity) rows.push(`| ${result.siteId} | ${result.clearanceDeg} | ${metricNames.map(key => result.maximumAbsoluteDifferences[key].absoluteHours.toFixed(4)).join(' | ')} |`);
  const sensitive = report.samplingSensitivity.flatMap(result => metricNames.filter(key => result.maximumAbsoluteDifferences[key].absoluteHours > report.sampleIntervalMinutes / 60)
    .map(key => ({siteId: result.siteId, clearanceDeg: result.clearanceDeg, metric: key, ...result.maximumAbsoluteDifferences[key]})));
  if (sensitive.length) rows.push('', '**Observed sensitivity:**', '', ...sensitive.map(item => `- ${item.siteId}, ${item.clearanceDeg}° clearance: ${item.metric} changes by ${item.absoluteHours.toFixed(3)} h after decimation (start ${item.start}; duration ${item.durationHours} h; phase ${item.phase}). Short visibility interruptions can substantially change the longest-gap statistic. This result is not a calibrated timing accuracy claim.`));
  rows.push('', '### Terrain versus a zero-degree local horizon', '', '| Site | Clearance ° | Sun difference h | Earth difference h | Joint difference h |', '| --- | ---: | ---: | ---: | ---: |');
  for (const result of report.terrainComparison) rows.push(`| ${result.siteId} | ${result.clearanceDeg} | ${visibleMetrics.map(key => result.terrainMinusFlatHours[key].toFixed(3)).join(' | ')} |`);
  rows.push('', '### Nine-location sensitivity', '', 'Maximum range between the nine locations over all six-hour-start, seven-day windows. These are measured geometric differences, not probabilities.', '',
    '| Site | Clearance ° | Longest dark range h | Longest Earth gap range h | Joint range h |', '| --- | ---: | ---: | ---: | ---: |');
  for (const result of report.footprintComparison) rows.push(`| ${result.siteId} | ${result.clearanceDeg} | ${Object.values(result.maximumAcrossWindowSpreadHours).map(value => value.toFixed(4)).join(' | ')} |`);
  rows.push('', '### Demonstration candidates', '');
  if (!report.demoCandidates.length) rows.push('No center-pass / footprint-fail case was found on the tested ordinary threshold grid. The project should not claim one for this bundle.', '');
  else for (const candidate of report.demoCandidates) rows.push(`- ${candidate.siteId}, ${candidate.start}, ${candidate.durationHours} h: clearance ${candidate.clearanceDeg}°; darkness limit ${candidate.maxDarkHours} h; Earth-gap limit ${candidate.maxCommGapHours} h; joint requirement ${candidate.minJointHours} h. Center passes; ${candidate.patchPassingCount}/${candidate.patchCount} locations pass. Largest additional outage: ${Math.max(candidate.worstExtraDarkHours, candidate.worstExtraCommGapHours).toFixed(3)} h. ${candidate.exceedsNativeSampleStep ? 'Contrast exceeds the native temporal sample step; this alone is not an accuracy guarantee.' : 'Contrast is below the native temporal sample step; do not use it as a resolved operational benefit.'}`);
  rows.push('', `Cached search: ${report.cachedSearch.evaluatedCandidates} candidates in ${report.cachedSearch.elapsedMilliseconds} ms on this run; earliest feasible delay ${report.cachedSearch.earliestDelayHours ?? 'not found'} h. Timing is host-dependent.`, '');
  if (report.selectedDemonstration) {
    const demo = report.selectedDemonstration, baseline = demo.baseline;
    const worst = Math.max(...baseline.patches.map(item => item.metrics.longestDarkHours));
    rows.push('### Selected reproducible walkthrough', '',
      `${demo.selectedSiteId}, ${demo.settings.start}, ${demo.settings.durationHours} h, zero additional angular clearance. Limits: darkness ≤ ${demo.settings.maxDarkHours} h; Earth-view gap ≤ ${demo.settings.maxCommGapHours} h; joint visibility ≥ ${demo.settings.minJointHours} h.`, '',
      `Center sunlight: ${baseline.metrics.sunHours.toFixed(2)} h; longest center darkness: ${baseline.metrics.longestDarkHours.toFixed(2)} h. ${baseline.patches.filter(item => item.feasible).length}/9 locations pass. Worst sampled-location darkness: ${worst.toFixed(2)} h. Both 60-minute decimation phases retain ${demo.sixtyMinutePhaseChecks.map(item => item.patchPassCount).join(' and ')} passing locations.`, '',
      ...demo.earliestAllNinePass.map(item => `- Earliest later all-nine-pass candidate on the six-hour grid: ${item.siteId}, ${item.start}, a ${item.delayHours} h delay.`), '', demo.interpretation, '');
  }
}
if (failures.length) rows.push('## Failures', '', ...failures.map(failure => `- ${failure}`), '');
await fs.writeFile(path.join(ROOT, 'docs/validation-results.md'), rows.join('\n'));
console.log(JSON.stringify({status: output.status, checks: checkCount, failures, bundles: reports.map(report => ({filename: report.filename, demoCandidates: report.demoCandidates.length, searchMs: report.cachedSearch.elapsedMilliseconds}))}, null, 2));
if (failures.length) process.exitCode = 1;
