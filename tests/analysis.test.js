import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSite, interpolateHorizon, searchWindows} from '../src/analysis.js';

const T0 = Date.parse('2026-11-14T00:00:00Z');
const at = hour => new Date(T0 + hour * 3_600_000).toISOString();
const flat = elevation => Array(360).fill(elevation);
const observation = (hour, sunEl = 10, earthEl = 10) => ({time: at(hour), sunAz: 90, sunEl, earthAz: 180, earthEl});
const fixture = (samples, extra = {}) => ({id: 'test-site', name: 'Test site', lat: -89, lon: 0, elevationM: 0, horizon: flat(0), samples, sampleStepHours: 1, ...extra});
const config = (extra = {}) => ({start: at(0), durationHours: 4, maxDarkHours: 4, maxCommGapHours: 4, minJointHours: 0, clearanceDeg: 0, observerHeightM: 2, ...extra});
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('circular horizon interpolation crosses 359°/0° and wraps both directions', () => {
  const horizon = flat(0);
  horizon[359] = 10;
  close(interpolateHorizon(horizon, 359.5), 5);
  close(interpolateHorizon(horizon, -0.5), 5);
  close(interpolateHorizon(horizon, 719.5), 5);
  assert.equal(interpolateHorizon(null, 10), null);
  horizon[0] = null;
  assert.equal(interpolateHorizon(horizon, 359.5), null);
  assert.equal(interpolateHorizon(horizon, 359), 10);
});

test('fully illuminated site gives complete duration and no invented edge gaps', () => {
  const result = analyzeSite(fixture([0, 1, 2, 3, 4].map(hour => observation(hour))), config());
  assert.equal(result.status, 'complete');
  assert.equal(result.feasible, true);
  close(result.metrics.sunHours, 4);
  close(result.metrics.jointHours, 4);
  close(result.metrics.longestDarkHours, 0);
  assert.equal(result.windows.sun.length, 1);
  assert.equal(result.patchStats.coverageFraction, null);
});

test('linear crossings split simultaneous windows and merge darkness across sample boundaries', () => {
  const samples = [observation(0, 1, -1), observation(1, -1, 1), observation(2, -1, 1), observation(3, 1, -1), observation(4, 1, -1)];
  const result = analyzeSite(fixture(samples), config({maxDarkHours: 1.9}));
  close(result.metrics.sunHours, 2);
  close(result.metrics.earthHours, 2);
  close(result.metrics.jointHours, 0);
  close(result.metrics.longestDarkHours, 2);
  assert.equal(result.windows.dark[0].start, at(0.5));
  assert.equal(result.windows.dark[0].end, at(2.5));
  assert.equal(result.feasible, false);
  assert.ok(result.reasons.some(item => item.code === 'dark-gap'));
});

test('request clipping uses interpolation and counts only requested hours', () => {
  const site = fixture([observation(0, -2, 1), observation(1, 2, 1), observation(2, 2, 1)]);
  const result = analyzeSite(site, config({start: at(0.25), durationHours: 1.5}));
  close(result.metrics.sunHours, 1.25);
  close(result.metrics.longestDarkHours, 0.25);
  close(result.coverage.hours, 1.5);
  assert.equal(result.windows.dark[0].start, at(0.25));
  assert.equal(result.windows.sun[0].end, at(1.75));
});

test('unsupported data range yields unknown metrics rather than zero light', () => {
  const result = analyzeSite(fixture([observation(1), observation(2), observation(3)]), config());
  assert.equal(result.status, 'partial');
  assert.equal(result.feasible, null);
  assert.equal(result.metrics.sunHours, null);
  close(result.knownMetrics.sunHours, 2);
  close(result.coverage.fraction, 0.5);
  assert.equal(result.windows.unknown.length, 2);
});

test('declared cadence detects a missing interior block and never bridges unknown darkness', () => {
  const site = fixture([observation(0, -1), observation(1, -1), observation(4, -1), observation(5, -1)]);
  const result = analyzeSite(site, config({durationHours: 5}));
  assert.equal(result.status, 'partial');
  assert.equal(result.coverage.rejectedGapCount, 1);
  close(result.windows.unknown[0].hours, 3);
  close(result.knownMetrics.longestDarkHours, 1);
  assert.equal(result.metrics.longestDarkHours, null);
});

test('non-finite measurements and duplicate epochs cannot silently become valid zeroes', () => {
  const site = fixture([observation(0), observation(1), observation(2, null), observation(3), observation(4), observation(4, -1), observation(5)]);
  const result = analyzeSite(site, config({durationHours: 5}));
  assert.equal(result.status, 'partial');
  close(result.coverage.hours, 1);
  assert.ok(result.warnings.some(item => item.includes('Duplicate')));
});

test('input order does not change results and single samples are unavailable', () => {
  const samples = [0, 1, 2, 3, 4].map(hour => observation(hour));
  assert.deepEqual(analyzeSite(fixture(samples), config()).metrics, analyzeSite(fixture([...samples].reverse()), config()).metrics);
  const single = analyzeSite(fixture([observation(0)]), config());
  assert.equal(single.status, 'unavailable');
  assert.equal(single.metrics.sunHours, null);
  assert.equal(single.windows.unknown[0].hours, 4);
});

test('angular clearance is conservative and higher unmodeled mast does not improve results', () => {
  const site = fixture([0, 1, 2, 3, 4].map(hour => observation(hour, 0.1, 1)));
  const baseline = analyzeSite(site, config());
  const conservative = analyzeSite(site, config({clearanceDeg: 0.2, maxDarkHours: 3}));
  assert.equal(baseline.metrics.sunHours, 4);
  assert.equal(conservative.metrics.sunHours, 0);
  assert.equal(conservative.feasible, false);
  const raised = analyzeSite(site, config({observerHeightM: 5}));
  assert.equal(raised.status, 'unsupported');
  assert.equal(raised.feasible, null);
  assert.equal(raised.assumptions.horizonObserverHeightM, 2);
});

test('patch feasibility is a scenario fraction, with unknown patches retained in denominator', () => {
  const samples = [0, 1, 2, 3, 4].map(hour => observation(hour, 1, 2));
  const site = fixture(samples, {patches: [
    {id: 'open', dxM: 0, dyM: 10, horizon: flat(0)},
    {id: 'blocked', dxM: 10, dyM: 0, horizon: flat(3)},
    {id: 'missing', dxM: -10, dyM: 0},
  ]});
  const result = analyzeSite(site, config({maxDarkHours: 1}));
  assert.equal(result.patchStats.count, 3);
  assert.equal(result.patchStats.completeCount, 2);
  assert.equal(result.patchStats.feasibleCount, 1);
  close(result.patchStats.coverageFraction, 1 / 3);
  assert.equal(result.patchStats.scenarios[2].feasible, null);
  assert.equal(result.patchStats.allKnown, false);
  assert.equal(analyzeSite(site, config({maxDarkHours: 1, minPatchCoverage: 0.5})).feasible, null);
});

test('patch-specific ephemerides are used and known low coverage can reject a center pass', () => {
  const samples = [0, 1, 2, 3, 4].map(hour => observation(hour, 1, 2));
  const site = fixture(samples, {patches: [
    {id: 'own', horizon: flat(0), samples: samples.map(item => ({...item, sunEl: -1}))},
    {id: 'open', horizon: flat(0)},
  ]});
  const result = analyzeSite(site, config({maxDarkHours: 1, minPatchCoverage: 0.8}));
  assert.equal(result.centerFeasible, true);
  assert.equal(result.feasible, false);
  assert.equal(result.patchStats.coverageFraction, 0.5);
  assert.equal(result.patchStats.scenarios[0].ephemerides, 'patch-specific');
});

test('threshold equality passes and zero-margin bodies remain geometrically hidden', () => {
  const site = fixture([0, 1, 2, 3, 4].map(hour => observation(hour, 0, 1)));
  const result = analyzeSite(site, config());
  assert.equal(result.feasible, true);
  assert.equal(result.metrics.longestDarkHours, 4);
  assert.equal(result.metrics.sunHours, 0);
});

test('search finds the minimum discrete delay and excludes dominated alternatives', () => {
  const samples = Array.from({length: 25}, (_, hour) => observation(hour, hour < 6 ? -1 : 1, 2));
  const good = fixture(samples);
  const worse = fixture(samples.map(item => ({...item, earthEl: -1})), {id: 'worse'});
  const found = searchWindows([good, worse], config({durationHours: 6, maxDarkHours: 0, maxCommGapHours: 0, minJointHours: 6}));
  assert.equal(found.stepHours, 6);
  assert.equal(found.earliestDelayHours, 6);
  assert.equal(found.earliestFeasible[0].start, at(6));
  assert.ok(found.pareto.every(item => item.siteId === good.id));
  assert.ok(found.candidates.every(item => Date.parse(item.end) <= Date.parse(at(24))));
});

test('search bounds candidate dates and reports unavailable data without fake solutions', () => {
  const site = fixture(Array.from({length: 25}, (_, hour) => observation(hour)));
  const found = searchWindows([site], config({durationHours: 6, searchEnd: at(6)}));
  assert.deepEqual(found.candidates.map(item => item.delayHours), [0, 6]);
  const empty = searchWindows([fixture([])], config());
  assert.equal(empty.earliestDelayHours, null);
  assert.deepEqual(empty.earliestFeasible, []);
  const limited = searchWindows([site], config({durationHours: 6, maxCandidates: 1}));
  assert.equal(limited.truncated, true);
  assert.equal(limited.evaluatedCount, 1);
});

test('optimized cached search produces the same metrics and decisions as direct evaluation', () => {
  const site = fixture(Array.from({length: 31}, (_, hour) => observation(hour, Math.sin(hour / 3), Math.cos(hour / 5))), {
    patches: [{id: 'higher', horizon: flat(0.2)}, {id: 'lower', horizon: flat(-0.1)}],
  });
  const settings = config({durationHours: 6, maxDarkHours: 2, maxCommGapHours: 3, minJointHours: 1, clearanceDeg: 0.1, minPatchCoverage: 0.5});
  const found = searchWindows([site], settings);
  assert.ok(found.candidates.length > 0);
  for (const candidate of found.candidates) {
    const direct = analyzeSite(site, {...settings, start: candidate.start});
    assert.deepEqual(candidate.metrics, direct.metrics);
    assert.equal(candidate.feasible, direct.feasible);
    assert.equal(candidate.patchCoverage, direct.patchStats.coverageFraction);
  }
});

test('invalid controls are rejected rather than generating misleading metrics', () => {
  const site = fixture([observation(0), observation(1)]);
  assert.throws(() => analyzeSite(site, config({durationHours: 0})), RangeError);
  assert.throws(() => analyzeSite(site, config({start: 'not a date'})), RangeError);
  assert.throws(() => analyzeSite(site, config({maxDarkHours: -1})), RangeError);
  assert.throws(() => analyzeSite(site, config({minPatchCoverage: 1.1})), RangeError);
});
