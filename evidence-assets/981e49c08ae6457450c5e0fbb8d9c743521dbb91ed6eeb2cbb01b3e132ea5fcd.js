/**
 * LunaMargin geometry analysis. AI-assisted code; all observations are supplied
 * by the caller, never generated here. ESM, browser and Node compatible.
 *
 * Visibility is the Sun/Earth CENTER above a terrain horizon plus an explicit
 * angular clearance. It is not solar power, radio-link availability or landing
 * safety. Between valid samples we linearly interpolate clearance margins;
 * transition times are estimates, not higher precision observations.
 */
const HOUR = 3_600_000;
const EPS = 0.001; // milliseconds; only for joining floating-point boundaries
const finite = value => typeof value === 'number' && Number.isFinite(value);
const iso = value => new Date(value).toISOString();
const hours = value => value / HOUR;

function timestamp(value) {
  if (typeof value !== 'string' && !finite(value)) return NaN;
  return typeof value === 'string' ? Date.parse(value) : value;
}

function numberSetting(settings, key, fallback, minimum = 0) {
  const value = settings[key] ?? fallback;
  if (!finite(value) || value < minimum) {
    throw new RangeError(`${key} must be a finite number >= ${minimum}.`);
  }
  return value;
}

function normalizeSettings(settings = {}) {
  const startMs = timestamp(settings.start);
  if (!Number.isFinite(startMs)) throw new RangeError('start must be a valid ISO date/time.');
  const durationHours = numberSetting(settings, 'durationHours', 168, Number.EPSILON);
  const endMs = startMs + durationHours * HOUR;
  if (!Number.isFinite(endMs) || Math.abs(endMs) > 8.64e15) throw new RangeError('Date range is outside supported dates.');
  const minPatchCoverage = settings.minPatchCoverage ?? null;
  if (minPatchCoverage !== null && (!finite(minPatchCoverage) || minPatchCoverage < 0 || minPatchCoverage > 1)) {
    throw new RangeError('minPatchCoverage must be between 0 and 1.');
  }
  return {
    startMs, endMs, durationHours,
    maxDarkHours: numberSetting(settings, 'maxDarkHours', 12),
    maxCommGapHours: numberSetting(settings, 'maxCommGapHours', 8),
    minJointHours: numberSetting(settings, 'minJointHours', 1),
    clearanceDeg: numberSetting(settings, 'clearanceDeg', 0),
    observerHeightM: numberSetting(settings, 'observerHeightM', 2),
    nominalStepHours: settings.nominalStepHours === undefined ? null
      : numberSetting(settings, 'nominalStepHours', null, Number.EPSILON),
    gapFactor: numberSetting(settings, 'gapFactor', 1.5, 1),
    minPatchCoverage,
  };
}

/** Interpolate a uniformly spaced, circular azimuth horizon (north=0°, east=90°).
 * Missing or invalid bins return null, never a fictitious zero-degree horizon.
 * 360 bins are expected; other >=2 bin uniform profiles are supported for tests.
 */
export function interpolateHorizon(horizon, azDeg) {
  if ((!Array.isArray(horizon) && !ArrayBuffer.isView(horizon)) || horizon.length < 2 || !finite(azDeg)) return null;
  const position = (((azDeg % 360) + 360) % 360) / 360 * horizon.length;
  const index = Math.floor(position);
  const fraction = position - index;
  const a = horizon[index % horizon.length];
  if (!finite(a)) return null;
  if (fraction < 1e-12) return a;
  const b = horizon[(index + 1) % horizon.length];
  return finite(b) ? a + (b - a) * fraction : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function prepareSamples(site, options) {
  const raw = Array.isArray(site.samples) ? site.samples : [];
  let discardedTimes = 0;
  const byTime = new Map();
  for (const sample of raw) {
    const timeMs = timestamp(sample?.time);
    if (!Number.isFinite(timeMs)) { discardedTimes++; continue; }
    // Duplicate epochs are ambiguous: invalidate this epoch rather than choosing
    // whichever conflicting record happened to appear last.
    if (byTime.has(timeMs)) byTime.set(timeMs, {timeMs, duplicate: true});
    else byTime.set(timeMs, {...sample, timeMs});
  }
  const samples = [...byTime.values()].sort((a, b) => a.timeMs - b.timeMs);
  const differences = samples.slice(1).map((sample, index) => hours(sample.timeMs - samples[index].timeMs));
  const declaredStep = finite(site.sampleStepHours) && site.sampleStepHours > 0 ? site.sampleStepHours : null;
  const nominalStepHours = options.nominalStepHours ?? declaredStep ?? median(differences);
  for (const sample of samples) {
    const sunHorizon = interpolateHorizon(site.horizon, sample.sunAz);
    const earthHorizon = interpolateHorizon(site.horizon, sample.earthAz);
    sample.valid = !sample.duplicate && finite(sample.sunEl) && finite(sample.earthEl)
      && sunHorizon !== null && earthHorizon !== null;
    sample.sunMargin = sample.valid ? sample.sunEl - sunHorizon - options.clearanceDeg : null;
    sample.earthMargin = sample.valid ? sample.earthEl - earthHorizon - options.clearanceDeg : null;
  }
  return {samples, nominalStepHours, discardedTimes, cadenceInferred: options.nominalStepHours === null && declaredStep === null};
}

function joinIntervals(intervals) {
  const joined = [];
  for (const interval of intervals) {
    if (interval.endMs <= interval.startMs + EPS) continue;
    const previous = joined[joined.length - 1];
    if (previous && interval.startMs <= previous.endMs + EPS) previous.endMs = Math.max(previous.endMs, interval.endMs);
    else joined.push({startMs: interval.startMs, endMs: interval.endMs});
  }
  return joined;
}

function serializeIntervals(intervals) {
  return joinIntervals(intervals).map(({startMs, endMs}) => ({
    start: iso(startMs), end: iso(endMs), hours: hours(endMs - startMs), startMs, endMs,
  }));
}

function complementaryIntervals(intervals, startMs, endMs) {
  const gaps = [];
  let cursor = startMs;
  for (const interval of joinIntervals(intervals)) {
    if (interval.startMs > cursor + EPS) gaps.push({startMs: cursor, endMs: interval.startMs});
    cursor = Math.max(cursor, interval.endMs);
  }
  if (cursor < endMs - EPS) gaps.push({startMs: cursor, endMs});
  return gaps;
}

function crossingTime(aTime, bTime, aMargin, bMargin) {
  if (aMargin === bMargin || aMargin * bMargin > 0) return null;
  return aTime + (bTime - aTime) * (-aMargin) / (bMargin - aMargin);
}

function analyzeGeometry(site, options, suppliedPrepared, detailed = true) {
  const prepared = suppliedPrepared ?? prepareSamples(site, options);
  const {samples, nominalStepHours} = prepared;
  const segments = [];
  const knownIntervals = [];
  let maxGapHours = 0;
  let maximumUsedSampleStepHours = 0;
  let rejectedGapCount = 0;
  for (let index = 0; index + 1 < samples.length; index++) {
    const a = samples[index], b = samples[index + 1];
    if (a.timeMs >= options.endMs || b.timeMs <= options.startMs) continue;
    const dtHours = hours(b.timeMs - a.timeMs);
    maxGapHours = Math.max(maxGapHours, dtHours);
    if (nominalStepHours !== null && dtHours > nominalStepHours * options.gapFactor + 1e-9) {
      rejectedGapCount++;
      continue;
    }
    if (!a.valid || !b.valid) continue;
    maximumUsedSampleStepHours = Math.max(maximumUsedSampleStepHours, dtHours);
    const startMs = Math.max(a.timeMs, options.startMs);
    const endMs = Math.min(b.timeMs, options.endMs);
    knownIntervals.push({startMs, endMs});
    const boundaries = [startMs, endMs];
    for (const key of ['sunMargin', 'earthMargin']) {
      const crossing = crossingTime(a.timeMs, b.timeMs, a[key], b[key]);
      if (crossing !== null && crossing > startMs + EPS && crossing < endMs - EPS) boundaries.push(crossing);
    }
    boundaries.sort((left, right) => left - right);
    const unique = boundaries.filter((value, at) => at === 0 || value - boundaries[at - 1] > EPS);
    for (let part = 0; part + 1 < unique.length; part++) {
      const left = unique[part], right = unique[part + 1];
      const fraction = ((left + right) / 2 - a.timeMs) / (b.timeMs - a.timeMs);
      const sunVisible = a.sunMargin + (b.sunMargin - a.sunMargin) * fraction > 0;
      const earthVisible = a.earthMargin + (b.earthMargin - a.earthMargin) * fraction > 0;
      segments.push({startMs: left, endMs: right, sunVisible, earthVisible, jointVisible: sunVisible && earthVisible, known: true});
    }
  }
  const rawWindows = {
    sun: joinIntervals(segments.filter(item => item.sunVisible)),
    earth: joinIntervals(segments.filter(item => item.earthVisible)),
    joint: joinIntervals(segments.filter(item => item.jointVisible)),
    dark: joinIntervals(segments.filter(item => !item.sunVisible)),
    commGap: joinIntervals(segments.filter(item => !item.earthVisible)),
    unknown: complementaryIntervals(knownIntervals, options.startMs, options.endMs),
  };
  const durationOf = intervals => intervals.reduce((sum, item) => sum + hours(item.endMs - item.startMs), 0);
  const longestOf = intervals => intervals.reduce((longest, item) => Math.max(longest, hours(item.endMs - item.startMs)), 0);
  const knownHours = durationOf(joinIntervals(knownIntervals));
  const complete = rawWindows.unknown.length === 0;
  const knownMetrics = {
    sunHours: durationOf(rawWindows.sun), earthHours: durationOf(rawWindows.earth), jointHours: durationOf(rawWindows.joint),
    longestDarkHours: longestOf(rawWindows.dark), longestCommGapHours: longestOf(rawWindows.commGap),
  };
  const metrics = Object.fromEntries(Object.entries(knownMetrics).map(([key, value]) => [key, complete ? value : null]));
  const fixedHeightM = finite(site.horizonHeightM) ? site.horizonHeightM : finite(site.observerHeightM) ? site.observerHeightM : 2;
  const heightSupported = Math.abs(options.observerHeightM - fixedHeightM) < 1e-9;
  const status = !heightSupported ? 'unsupported' : complete ? 'complete' : knownHours > 0 ? 'partial' : 'unavailable';
  const constraints = {
    maxDarkHours: options.maxDarkHours, maxCommGapHours: options.maxCommGapHours,
    minJointHours: options.minJointHours, clearanceDeg: options.clearanceDeg,
    observerHeightM: options.observerHeightM,
  };
  const reasons = [];
  if (!heightSupported) reasons.push({code: 'height-unsupported', message: `Terrain horizons are available only at ${fixedHeightM} m above the local surface.`, required: options.observerHeightM, actual: fixedHeightM});
  if (!complete) reasons.push({code: 'incomplete-data', message: 'The requested interval is not fully covered by valid samples.', missingHours: durationOf(rawWindows.unknown)});
  if (complete) {
    if (metrics.longestDarkHours > options.maxDarkHours + 1e-9) reasons.push({code: 'dark-gap', message: 'The longest modeled darkness exceeds the mission limit.', actual: metrics.longestDarkHours, limit: options.maxDarkHours});
    if (metrics.longestCommGapHours > options.maxCommGapHours + 1e-9) reasons.push({code: 'comm-gap', message: 'The longest modeled Earth-center visibility gap exceeds the mission limit.', actual: metrics.longestCommGapHours, limit: options.maxCommGapHours});
    if (metrics.jointHours + 1e-9 < options.minJointHours) reasons.push({code: 'joint-shortfall', message: 'The simultaneous Sun/Earth visibility duration is below the mission requirement.', actual: metrics.jointHours, limit: options.minJointHours});
  }
  const warnings = [
    'Sun and Earth centers only; finite disks, eclipses, solar-panel performance and radio links are not modeled.',
    'Transition times use linear interpolation of clearance margins. Narrow terrain features or short events between samples may be missed.',
    'Outage lengths are clipped to the requested mission interval; a gap touching an edge may continue beyond it.',
  ];
  if (prepared.cadenceInferred) warnings.push('Sample cadence was inferred from the median spacing; missing regularly spaced blocks cannot always be detected without a declared cadence.');
  if (prepared.discardedTimes) warnings.push(`${prepared.discardedTimes} sample(s) with invalid timestamps were discarded.`);
  if (samples.some(sample => sample.duplicate)) warnings.push('Duplicate sample epochs were treated as missing data.');
  if (rejectedGapCount) warnings.push(`${rejectedGapCount} oversized sample interval(s) were treated as missing data.`);
  const interiorDurations = key => rawWindows[key]
    .filter(item => item.startMs > options.startMs + EPS && item.endMs < options.endMs - EPS)
    .map(item => hours(item.endMs - item.startMs));
  const sunDurations = interiorDurations('sun'), earthDurations = interiorDurations('earth');
  const resolutionIndicators = {
    subSampleSunWindowCount: nominalStepHours === null ? 0 : sunDurations.filter(value => value < nominalStepHours).length,
    subSampleEarthWindowCount: nominalStepHours === null ? 0 : earthDurations.filter(value => value < nominalStepHours).length,
    shortestInteriorSunWindowHours: sunDurations.length ? Math.min(...sunDurations) : null,
    shortestInteriorEarthWindowHours: earthDurations.length ? Math.min(...earthDurations) : null,
  };
  if (resolutionIndicators.subSampleSunWindowCount) warnings.push('A modeled interior sunlight window is shorter than the source sample step. Longest-darkness statistics may be sensitive to missed brief windows; brief sunlight does not imply battery recharge.');
  if (resolutionIndicators.subSampleEarthWindowCount) warnings.push('A modeled interior Earth-view window is shorter than the source sample step. Longest-gap statistics may be sensitive to missed brief windows; geometric visibility does not establish a usable radio contact.');
  const windows = detailed ? Object.fromEntries(Object.entries(rawWindows).map(([key, value]) => [key, serializeIntervals(value)])) : undefined;
  const timeline = detailed ? [...segments, ...rawWindows.unknown.map(item => ({...item, sunVisible: null, earthVisible: null, jointVisible: null, known: false}))]
    .sort((a, b) => a.startMs - b.startMs)
    .map(item => ({...item, start: iso(item.startMs), end: iso(item.endMs), hours: hours(item.endMs - item.startMs)})) : undefined;
  return {
    siteId: site.id, name: site.name, start: iso(options.startMs), end: iso(options.endMs),
    status, feasible: complete && heightSupported ? reasons.length === 0 : null,
    metrics, knownMetrics, windows, timeline, constraints, reasons, warnings, resolutionIndicators,
    coverage: {hours: knownHours, fraction: Math.min(1, knownHours / options.durationHours), nominalStepHours, maxGapHours, maximumUsedSampleStepHours, rejectedGapCount},
    assumptions: {horizonObserverHeightM: fixedHeightM, requestedObserverHeightM: options.observerHeightM, heightSupported, visibilityDefinition: 'body-center', interpolation: 'piecewise-linear-clearance', atmosphericRefraction: false},
  };
}

/**
 * Analyze a central site and optional surrounding patch scenarios.
 *
 * Optional metadata: site.sampleStepHours, site.horizonHeightM (default 2).
 * A patch may include its own samples/horizonHeightM. Otherwise its horizon is
 * evaluated with the center site's ephemerides, explicitly labeled an
 * approximation. coverageFraction uses ALL supplied patches as denominator;
 * unknown patches are not counted as passes, and completeness is separate.
 *
 * minPatchCoverage, when supplied, is a screening threshold in [0,1], NOT a
 * probability. Empty/missing patches never imply a successful robustness check.
 */
function patchSite(site, patch, index) {
  return {
    ...site, ...patch, id: patch.id ?? `${site.id}-patch-${index}`,
    // Missing patch horizon must not silently fall back to the center.
    horizon: patch.horizon, samples: Array.isArray(patch.samples) ? patch.samples : site.samples,
    sampleStepHours: patch.sampleStepHours ?? site.sampleStepHours,
    horizonHeightM: patch.horizonHeightM ?? site.horizonHeightM,
  };
}

const metricKeys = ['longestDarkHours', 'longestCommGapHours', 'jointHours'];
const stableIdOrder = (a, b) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;

/** Worst supplied position for each mission threshold, with no uncertainty model.
 * An incomplete footprint has no certified whole-footprint extreme: values from
 * its known subset are explicitly separate and never enter robustness ranking.
 */
function summarizeFootprint(scenarios, options) {
  const known = scenarios.filter(item => item.status === 'complete' && item.feasible !== null
    && metricKeys.every(key => finite(item.metrics[key])));
  const allKnown = scenarios.length > 0 && known.length === scenarios.length;
  const knownMetrics = Object.fromEntries(metricKeys.map(key => [key, known.length
    ? (key === 'jointHours' ? Math.min : Math.max)(...known.map(item => item.metrics[key])) : null]));
  const metrics = Object.fromEntries(metricKeys.map(key => [key, allKnown ? knownMetrics[key] : null]));
  const points = Object.fromEntries(metricKeys.map(key => {
    if (!allKnown) return [key, null];
    const tied = known.filter(item => Math.abs(item.metrics[key] - metrics[key]) <= 1e-9)
      .sort((a, b) => stableIdOrder(a.id, b.id));
    return [key, {id: tied[0].id, dxM: tied[0].dxM, dyM: tied[0].dyM,
      tiedPointIds: tied.map(item => item.id)}];
  }));
  const margins = {
    darknessHours: allKnown ? options.maxDarkHours - metrics.longestDarkHours : null,
    earthGapHours: allKnown ? options.maxCommGapHours - metrics.longestCommGapHours : null,
    jointHours: allKnown ? metrics.jointHours - options.minJointHours : null,
  };
  const minimumMarginHours = allKnown ? Math.min(...Object.values(margins)) : null;
  return {
    status: allKnown ? 'complete' : known.length ? 'partial' : 'unavailable',
    allKnown, count: scenarios.length, knownCount: known.length, metrics, knownMetrics, points, margins,
    minimumMarginHours,
    limitingMetrics: allKnown ? Object.entries(margins).filter(([,value]) => Math.abs(value - minimumMarginHours) <= 1e-9).map(([key]) => key) : [],
    interpretation: 'Worst values among supplied discrete positions. Positive margins are hours inside each threshold; negative margins miss it. The minimum is the smallest of the three explicitly reported margins, not a weighted score, probability, or calibrated uncertainty.',
  };
}

function analyzeSiteWithOptions(site, options, preparations, detailed = true) {
  const result = analyzeGeometry(site, options, preparations?.center, detailed);
  result.centerFeasible = result.feasible;
  const patches = Array.isArray(site.patches) ? site.patches : [];
  const scenarios = patches.map((patch, index) => {
    const ownSamples = Array.isArray(patch.samples);
    const location = patchSite(site, patch, index);
    const analyzed = analyzeGeometry(location, options, preparations?.patches[index], false);
    return {
      id: location.id, dxM: patch.dxM ?? null, dyM: patch.dyM ?? null,
      status: analyzed.status, feasible: analyzed.feasible, metrics: analyzed.metrics,
      coverage: analyzed.coverage, reasons: analyzed.reasons,
      ephemerides: ownSamples ? 'patch-specific' : 'center-reused-approximation',
    };
  });
  const feasibleCount = scenarios.filter(item => item.feasible === true).length;
  const completeCount = scenarios.filter(item => item.status === 'complete').length;
  const knownFeasibilityCount = scenarios.filter(item => item.feasible !== null).length;
  result.patchStats = {
    count: scenarios.length, completeCount, knownFeasibilityCount, feasibleCount,
    coverageFraction: scenarios.length ? feasibleCount / scenarios.length : null,
    completeFraction: scenarios.length ? completeCount / scenarios.length : null,
    allKnown: scenarios.length > 0 && knownFeasibilityCount === scenarios.length,
    interpretation: 'Fraction of supplied geometric scenarios meeting thresholds; not a landing probability or spatial area estimate unless sampling supports it.',
    scenarios, worstCase: summarizeFootprint(scenarios, options),
  };
  if (scenarios.some(item => item.ephemerides === 'center-reused-approximation')) {
    result.warnings.push('Surrounding patches reuse central-site Sun/Earth angles where patch-specific ephemerides are absent. This approximation is separate from terrain effects.');
  }
  if (options.minPatchCoverage !== null) {
    result.constraints.minPatchCoverage = options.minPatchCoverage;
    if (!result.patchStats.allKnown) {
      result.feasible = result.centerFeasible === false ? false : null;
      result.reasons.push({code: 'patches-incomplete', message: 'The requested patch-coverage criterion cannot be established for all scenarios.'});
    } else if (result.patchStats.coverageFraction + 1e-9 < options.minPatchCoverage) {
      result.feasible = false;
      result.reasons.push({code: 'patch-coverage', message: 'Too few surrounding geometric scenarios meet the mission limits.', actual: result.patchStats.coverageFraction, limit: options.minPatchCoverage});
    }
  }
  return result;
}

export function analyzeSite(site, settings = {}) {
  if (!site || typeof site !== 'object') throw new TypeError('site must be an object.');
  return analyzeSiteWithOptions(site, normalizeSettings(settings));
}

/** Deterministic angular sensitivity, always ADDED to the requested baseline.
 * These are user-selected geometric thresholds, not measured error bounds.
 */
export function stressTestSite(site, settings = {}, increments = [0, 0.02, 0.10, 0.25]) {
  const base = normalizeSettings(settings);
  if (!Array.isArray(increments) || !increments.length || increments.some(value => !finite(value) || value < 0)) {
    throw new RangeError('Stress increments must be a nonempty array of finite, nonnegative angles.');
  }
  const levels = [...new Set(increments)].sort((a,b) => a-b).map(incrementDeg => {
    const clearanceDeg = base.clearanceDeg + incrementDeg;
    const result = analyzeSite(site, {...settings, clearanceDeg});
    return {
      incrementDeg, clearanceDeg, centerFeasible: result.centerFeasible,
      count: result.patchStats.count, feasibleCount: result.patchStats.feasibleCount,
      allKnown: result.patchStats.allKnown, worstCase: result.patchStats.worstCase,
      scenarios: result.patchStats.scenarios.map(({id, dxM, dyM, status, feasible, metrics, reasons}) => ({id, dxM, dyM, status, feasible, metrics, reasons})),
    };
  });
  return {
    siteId: site.id, baselineClearanceDeg: base.clearanceDeg,
    start: iso(base.startMs), end: iso(base.endMs), durationHours: base.durationHours,
    thresholds: {maxDarkHours:base.maxDarkHours,maxCommGapHours:base.maxCommGapHours,minJointHours:base.minJointHours},
    levels,
    interpretation: 'Deterministic geometric sensitivity: each nonnegative increment is added to the baseline clearance. These levels are not a calibrated terrain-error range or a success probability.',
  };
}

export const SEARCH_RANKING = Object.freeze({
  id: 'earliest-then-footprint-margin-v1',
  criteria: ['delayHours:asc', 'feasible:true-first', 'worstCase.allKnown:true-first',
    'worstCase.minimumMarginHours:desc', 'worstCase.margins.darknessHours:desc',
    'worstCase.margins.earthGapHours:desc', 'worstCase.margins.jointHours:desc',
    'center.longestDarkHours:asc', 'center.longestCommGapHours:asc', 'center.jointHours:desc', 'siteId:codepoint-asc'],
  explanation: 'Keep the earliest feasible arrival. At the same arrival, prefer complete footprints with the largest smallest threshold margin (hours). Break ties by darkness, Earth-gap, and joint-time margins, then center metrics and site ID. All components remain visible; this is a declared preference, not a universal optimum.',
});

function compareCandidates(a, b) {
  const dateOrder = a.delayHours - b.delayHours;
  if (dateOrder) return dateOrder;
  if (a.feasible !== b.feasible) return Number(b.feasible) - Number(a.feasible);
  if (a.worstCase.allKnown !== b.worstCase.allKnown) return Number(b.worstCase.allKnown) - Number(a.worstCase.allKnown);
  if (a.worstCase.allKnown) {
    const pairs = [[a.worstCase.minimumMarginHours,b.worstCase.minimumMarginHours],
      ...['darknessHours','earthGapHours','jointHours'].map(key => [a.worstCase.margins[key],b.worstCase.margins[key]])];
    // Compare unrounded values so the ordering stays transitive. The 1e-9
    // feasibility tolerance belongs to threshold checks, not sort equivalence.
    for (const [left,right] of pairs) if (left !== right) return right-left;
  }
  return a.metrics.longestDarkHours - b.metrics.longestDarkHours
    || a.metrics.longestCommGapHours - b.metrics.longestCommGapHours
    || b.metrics.jointHours - a.metrics.jointHours || stableIdOrder(a.siteId,b.siteId);
}

function dominates(a, b, includePatch, includeWorstCase) {
  const lowerA = [a.delayHours, a.metrics.longestDarkHours, a.metrics.longestCommGapHours];
  const lowerB = [b.delayHours, b.metrics.longestDarkHours, b.metrics.longestCommGapHours];
  const higherA = [a.metrics.jointHours], higherB = [b.metrics.jointHours];
  if (includePatch) { higherA.push(a.patchCoverage); higherB.push(b.patchCoverage); }
  if (includeWorstCase) {
    lowerA.push(a.worstCase.metrics.longestDarkHours, a.worstCase.metrics.longestCommGapHours);
    lowerB.push(b.worstCase.metrics.longestDarkHours, b.worstCase.metrics.longestCommGapHours);
    higherA.push(a.worstCase.metrics.jointHours); higherB.push(b.worstCase.metrics.jointHours);
  }
  const noWorse = lowerA.every((value, index) => value <= lowerB[index] + 1e-9)
    && higherA.every((value, index) => value + 1e-9 >= higherB[index]);
  const strictlyBetter = lowerA.some((value, index) => value + 1e-9 < lowerB[index])
    || higherA.some((value, index) => value > higherB[index] + 1e-9);
  return noWorse && strictlyBetter;
}

/**
 * Search cached dates at 6-hour offsets from settings.start (override stepHours).
 * Never extrapolates. searchEnd, when supplied, bounds candidate START dates.
 * Returns earliest feasible candidates and the non-dominated complete results
 * under delay/darkness/comm-gap (minimize) and joint hours (maximize). Patch
 * coverage and worst-position metrics join Pareto objectives only when EVERY
 * candidate has known patches. The explicit ranking is separate from Pareto
 * dominance: a preferred candidate can still have a trade-off with another.
 * This is a discrete cached search, not a globally optimal mission solution.
 */
export function searchWindows(sites, settings = {}) {
  if (!Array.isArray(sites)) throw new TypeError('sites must be an array.');
  const options = normalizeSettings(settings);
  const stepHours = numberSetting(settings, 'stepHours', 6, Number.EPSILON);
  const maxCandidates = numberSetting(settings, 'maxCandidates', 20_000, 1);
  const explicitEnd = settings.searchEnd === undefined ? Infinity : timestamp(settings.searchEnd);
  if (Number.isNaN(explicitEnd)) throw new RangeError('searchEnd must be a valid ISO date/time.');
  const candidates = [];
  let excludedCount = 0;
  let evaluatedCount = 0;
  let truncated = false;
  for (const site of [...sites].sort((a,b) => stableIdOrder(a.id,b.id))) {
    const epochs = (Array.isArray(site.samples) ? site.samples : []).map(item => timestamp(item?.time)).filter(Number.isFinite);
    if (epochs.length < 2) { excludedCount++; continue; }
    const first = Math.min(...epochs), last = Math.max(...epochs);
    // A search changes only the clipped interval. Compute each terrain profile's
    // sample margins once, and avoid building chart timestamps for every trial.
    // This cache is local to a call, so edited data/settings can never go stale.
    const preparations = {
      center: prepareSamples(site, options),
      patches: (Array.isArray(site.patches) ? site.patches : []).map((patch, index) => prepareSamples(patchSite(site, patch, index), options)),
    };
    const lastStart = Math.min(explicitEnd, last - options.durationHours * HOUR);
    const firstIndex = Math.max(0, Math.ceil((first - options.startMs) / (stepHours * HOUR)));
    for (let index = firstIndex; ; index++) {
      const startMs = options.startMs + index * stepHours * HOUR;
      if (startMs > lastStart + EPS) break;
      if (evaluatedCount >= maxCandidates) { truncated = true; break; }
      evaluatedCount++;
      const result = analyzeSiteWithOptions(site, {...options, startMs, endMs: startMs + options.durationHours * HOUR}, preparations, false);
      if (result.status !== 'complete' || result.feasible === null) { excludedCount++; continue; }
      candidates.push({
        siteId: result.siteId, name: result.name, start: result.start, end: result.end,
        delayHours: hours(startMs - options.startMs), feasible: result.feasible,
        centerFeasible: result.centerFeasible, metrics: result.metrics,
        patchCoverage: result.patchStats.allKnown ? result.patchStats.coverageFraction : null,
        worstCase: result.patchStats.worstCase,
        reasons: result.reasons,
      });
    }
    if (truncated) break;
  }
  candidates.sort(compareCandidates);
  const feasible = candidates.filter(item => item.feasible);
  const earliestDelay = feasible.length ? feasible[0].delayHours : null;
  const includePatch = candidates.length > 0 && candidates.every(item => item.patchCoverage !== null);
  const includeWorstCase = candidates.length > 0 && candidates.every(item => item.worstCase.allKnown);
  const pareto = candidates.filter((candidate, index) => !candidates.some((other, otherIndex) => otherIndex !== index && dominates(other, candidate, includePatch, includeWorstCase)));
  return {
    baselineStart: iso(options.startMs), stepHours, evaluatedCount, excludedCount, truncated,
    candidates, earliestFeasible: feasible.filter(item => item.delayHours === earliestDelay),
    earliestDelayHours: earliestDelay, pareto,
    ranking: SEARCH_RANKING,
    objectives: ['delayHours:min', 'longestDarkHours:min', 'longestCommGapHours:min', 'jointHours:max', ...(includePatch ? ['patchCoverage:max'] : []), ...(includeWorstCase ? ['worstCase.longestDarkHours:min','worstCase.longestCommGapHours:min','worstCase.jointHours:max'] : [])],
    interpretation: 'Discrete search over cached samples. Earliest is relative to the chosen grid and data coverage; no missing interval is treated as feasible.',
  };
}
