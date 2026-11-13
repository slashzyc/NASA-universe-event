import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHorizonsPipeline, validateDataRange, parseHorizonsResponse } from '../server/horizons.mjs';

const root = resolve(import.meta.dirname, '..');
const day = 86400000, step = 1800000;
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const bundle = JSON.parse(await readFile(join(root, 'data/lunar-sites-june.json'), 'utf8'));

// Deliberately synthetic upstream fixture used only by these isolated tests.
function mockEnvelope(url) {
  const p = new URL(url).searchParams;
  const unquote = key => p.get(key).replaceAll("'", '');
  const target = unquote('COMMAND');
  const start = Date.parse(unquote('START_TIME').replace(' ', 'T') + 'Z');
  const stop = Date.parse(unquote('STOP_TIME').replace(' ', 'T') + 'Z');
  const rows = [];
  for (let time = start; time <= stop; time += step) {
    const date = new Date(time), text = date.toISOString();
    rows.push(`${text.slice(0, 4)}-${months[date.getUTCMonth()]}-${text.slice(8, 10)} ${text.slice(11, 19)}, , ,120,3,`);
  }
  return { signature: { source: 'NASA/JPL Horizons API', version: '1.3' }, result:
    `Target body name: ${target === '10' ? 'Sun (10)' : 'Earth (399)'}\nCenter body name: Moon (301)\nCenter geodetic : ${unquote('SITE_COORD')}\nCenter pole/equ : MEAN_ME\nAtmos refraction: NO (AIRLESS)\nAzimuth_(a-app),Elevation_(a-app)\n$$SOE\n${rows.join('\n')}\n$$EOE` };
}

async function waitJob(pipeline, id) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const job = pipeline.getJob(id);
    if (['succeeded', 'failed'].includes(job.status)) return job;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Test data job timed out.');
}

test('new-date range refuses unsupported height, dates, invalid calendar and oversized requests', () => {
  assert.deepEqual(validateDataRange({ start: '2027-07-01', stop: '2027-07-02' }), {
    start: '2027-07-01T00:00:00Z', stop: '2027-07-02T00:00:00Z', observerHeightM: 2, sampleIntervalMinutes: 30,
  });
  for (const input of [
    { start: '2027-07-01', observerHeightM: 5 }, { start: '2025-12-31' },
    { start: '2028-12-31', stop: '2029-01-02' }, { start: '2027-02-30' },
    { start: '2027-07-01', stop: '2027-08-02' }, { start: '2027-07-01', stop: '2027-07-01' },
    { start: '2027-07-01T00:00:00+05:00' },
  ]) assert.throws(() => validateDataRange(input));
});

test('strict parser accepts archived real NASA response and rejects changed version, geometry and missing sample', async () => {
  const envelope = JSON.parse(await readFile(join(root, 'data/raw/ridge-1-10-2027-06-horizons.json'), 'utf8'));
  const conditions = { site: bundle.sites[0], target: 10, start: bundle.start, stop: bundle.stop };
  const rows = parseHorizonsResponse(envelope.response, conditions);
  assert.equal(rows.length, 1441);
  assert.equal(rows[0].time, bundle.start);
  assert.throws(() => parseHorizonsResponse({ ...envelope.response, signature: { ...envelope.response.signature, version: '99.0' } }, conditions), /Unreviewed/);
  assert.throws(() => parseHorizonsResponse(envelope.response, { ...conditions, site: { ...conditions.site, lat: -80 } }), /observer/);
  assert.throws(() => parseHorizonsResponse(envelope.response, { ...conditions, stop: '2027-06-30T00:00:00Z' }), /timestamps/);
});

test('durable pipeline serializes real request stages, retries with backoff, caches and survives restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lunamargin-horizons-test-'));
  let pipeline, active = 0, peak = 0, calls = 0, firstFailure = true;
  const stages = [], datasets = [];
  t.after(async () => { await pipeline?.close(); await rm(directory, { recursive: true, force: true }); });
  const fetchImpl = async (url, options) => {
    calls++; active++; peak = Math.max(peak, active);
    assert.match(options.headers['User-Agent'], /^LunaMargin\/1\.0/);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
    if (firstFailure) { firstFailure = false; return new Response('', { status: 503 }); }
    return Response.json(mockEnvelope(url));
  };
  pipeline = await createHorizonsPipeline({ root, dataDir: directory, fetchImpl, requestDelayMs: 0, retryBaseMs: 1,
    onJob: job => { stages.push(job.stage); }, onDataset: item => { datasets.push(item); } });
  await pipeline.resume();
  const request = { start: '2027-07-01', stop: '2027-07-02', observerHeightM: 2 };
  const first = await pipeline.enqueue(request), second = await pipeline.enqueue(request);
  const done = await waitJob(pipeline, first.id), reused = await waitJob(pipeline, second.id);
  assert.equal(done.status, 'succeeded', done.message);
  assert.equal(reused.status, 'succeeded', reused.message);
  assert.equal(reused.cached, true);
  assert.equal(calls, 7); assert.equal(peak, 1);
  for (const stage of ['queued', 'fetching', 'backoff', 'validating', 'complete']) assert.ok(stages.includes(stage));
  assert.equal(datasets.length, 1);
  const generated = JSON.parse(await readFile(datasets[0].path, 'utf8'));
  assert.equal(generated.sites[0].samples.length, day / step + 1);
  assert.deepEqual(generated.sites.map(site => site.patches), bundle.sites.map(site => site.patches));
  assert.deepEqual(generated.sites.map(site => site.horizon), bundle.sites.map(site => site.horizon));
  assert.equal(generated.observerHeightM, 2);
  assert.ok(generated.sourceDataTime);
  assert.deepEqual(generated.pipeline.apiVersions, ['1.3']);
  const id = done.datasetId;
  await pipeline.close();
  pipeline = await createHorizonsPipeline({ root, dataDir: directory, fetchImpl: () => { throw new Error('Unexpected upstream request after restart.'); } });
  await pipeline.resume();
  assert.equal(pipeline.getJob(first.id).status, 'succeeded');
  assert.equal(pipeline.resolveDataset(id).sha256, datasets[0].sha256);
  const third = await pipeline.enqueue(request);
  assert.equal((await waitJob(pipeline, third.id)).status, 'succeeded');
  const shipped = await pipeline.enqueue({ start: '2027-06-03', stop: '2027-06-05' });
  const shippedJob = await waitJob(pipeline, shipped.id);
  assert.equal(shippedJob.status, 'succeeded'); assert.equal(shippedJob.datasetId, 'jun');
});

test('in-flight job is durably queued on shutdown and resumes after restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lunamargin-horizons-resume-test-'));
  let pipeline, started;
  const startSignal = new Promise(resolve => { started = resolve; });
  t.after(async () => { await pipeline?.close(); await rm(directory, { recursive: true, force: true }); });
  pipeline = await createHorizonsPipeline({ root, dataDir: directory, requestDelayMs: 0,
    fetchImpl: async (_url, { signal }) => { started(); return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); } });
  await pipeline.resume();
  const job = await pipeline.enqueue({ start: '2027-07-03', stop: '2027-07-04' });
  await startSignal; await pipeline.close();
  assert.equal(pipeline.getJob(job.id).status, 'queued');
  pipeline = await createHorizonsPipeline({ root, dataDir: directory, requestDelayMs: 0,
    fetchImpl: async url => Response.json(mockEnvelope(url)) });
  await pipeline.resume();
  assert.equal((await waitJob(pipeline, job.id)).status, 'succeeded');
});

test('unreviewed upstream version fails visibly and does not register a fake dataset', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lunamargin-horizons-reject-test-'));
  const pipeline = await createHorizonsPipeline({ root, dataDir: directory, requestDelayMs: 0,
    fetchImpl: async url => { const result = mockEnvelope(url); result.signature.version = '99'; return Response.json(result); } });
  t.after(async () => { await pipeline.close(); await rm(directory, { recursive: true, force: true }); });
  await pipeline.resume();
  const job = await pipeline.enqueue({ start: '2027-07-05', stop: '2027-07-06' });
  const done = await waitJob(pipeline, job.id);
  assert.equal(done.status, 'failed'); assert.match(done.error.message, /Unreviewed/);
  assert.equal(pipeline.listDatasets().length, 0);
});
