import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const STEP = 30 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const MIN_TIME = Date.parse('2026-01-01T00:00:00Z');
const MAX_TIME = Date.parse('2029-01-01T00:00:00Z');
const ACCEPTED_VERSIONS = new Set(['1.2', '1.3']);
const PRODUCT = 'LunaMargin/1.0 (+https://github.com/slashzyc/NASA-universe-event/issues)';
const hash = value => createHash('sha256').update(value).digest('hex');
const iso = value => new Date(value).toISOString().replace('.000Z', 'Z');
const clone = value => structuredClone(value);
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function inputError(message, code = 'INVALID_DATE_RANGE') {
  const error = new Error(message); error.code = code; error.status = 422; return error;
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z)?$/.test(value)) {
    throw inputError('Use an ISO UTC date or timestamp.');
  }
  const numeric = Date.parse(value);
  if (!Number.isFinite(numeric) || iso(numeric).slice(0, 10) !== value.slice(0, 10)) throw inputError('Invalid calendar date.');
  return numeric;
}

export function validateDataRange(input = {}) {
  if (input.observerHeightM !== undefined && input.observerHeightM !== 2) {
    throw inputError('Only the matched 2 m terrain and ephemeris model is supported.', 'UNSUPPORTED_HEIGHT');
  }
  const rawStart = timestamp(input.start);
  const rawStop = input.stop === undefined ? rawStart + 30 * DAY : timestamp(input.stop);
  const start = Math.floor(rawStart / STEP) * STEP;
  const stop = Math.ceil(rawStop / STEP) * STEP;
  if (start < MIN_TIME || stop > MAX_TIME || stop <= start || stop - start > 31 * DAY) {
    throw inputError('New data requests must lie within 2026–2028 and cover at most 31 days.');
  }
  return { start: iso(start), stop: iso(stop), observerHeightM: 2, sampleIntervalMinutes: 30 };
}

export function horizonsParameters(site, target, range) {
  if (![10, 399].includes(Number(target))) throw inputError('Only Sun and Earth ephemerides are supported.');
  return {
    format: 'json', COMMAND: `'${target}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'", CENTER: "'coord@301'", COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${site.lon.toFixed(9)},${site.lat.toFixed(9)},${((site.elevationM + 2) / 1000).toFixed(9)}'`,
    START_TIME: `'${range.start.replace('T', ' ').replace('Z', '')}'`,
    STOP_TIME: `'${range.stop.replace('T', ' ').replace('Z', '')}'`, STEP_SIZE: "'30 m'",
    QUANTITIES: "'4'", CSV_FORMAT: "'YES'", ANG_FORMAT: "'DEG'", APPARENT: "'AIRLESS'",
    TIME_DIGITS: "'SECONDS'", EXTRA_PREC: "'YES'",
  };
}

export function parseHorizonsResponse(response, { site, target, start, stop }) {
  if (!response || response.error) throw new Error(`Horizons rejected the query: ${String(response?.error || 'missing response').slice(0, 600)}`);
  if (response.signature?.source !== 'NASA/JPL Horizons API' || !ACCEPTED_VERSIONS.has(response.signature?.version)) {
    throw new Error(`Unreviewed Horizons API signature/version: ${JSON.stringify(response.signature)}. Review the upstream format before accepting data.`);
  }
  const result = response.result;
  if (typeof result !== 'string' || result.length > 4_000_000 || !result.includes('$$SOE') || !result.includes('$$EOE')) throw new Error('Horizons returned no bounded ephemeris table.');
  const expectedBody = Number(target) === 10 ? /Target body name:\s*Sun \(10\)/ : /Target body name:\s*Earth \(399\)/;
  const coords = result.match(/Center geodetic\s*:\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)/);
  if (!expectedBody.test(result) || !/Center body name:\s*Moon \(301\)/.test(result)
      || !/Center pole\/equ\s*:\s*MEAN_ME/.test(result) || !/Atmos refraction:\s*NO \(AIRLESS\)/.test(result)
      || !/Azimuth_/.test(result) || !/Elevation/.test(result) || !coords
      || Math.abs(Number(coords[1]) - site.lon) > 0.000001
      || Math.abs(Number(coords[2]) - site.lat) > 0.000001
      || Math.abs(Number(coords[3]) - (site.elevationM + 2) / 1000) > 0.00005) {
    throw new Error('Horizons observer, target, height, reference orientation or output columns do not match the requested model.');
  }
  const rows = result.split('$$SOE')[1].split('$$EOE')[0].trim().split(/\r?\n/);
  const records = rows.map(line => {
    const row = line.split(',');
    const date = row[0]?.trim().match(/^(\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    const month = date && monthNames.findIndex(name => name.toLowerCase() === date[2].toLowerCase());
    if (!date || month < 0 || row.length < 5 || !row[3].trim() || !row[4].trim()) throw new Error('Malformed Horizons CSV record.');
    const time = Date.UTC(Number(date[1]), month, Number(date[3]), Number(date[4]), Number(date[5]), Number(date[6]));
    const az = Number(row[3]), el = Number(row[4]);
    if (!Number.isFinite(az) || !Number.isFinite(el) || az < 0 || az > 360 || el < -90 || el > 90) throw new Error('Non-physical or missing Horizons angle.');
    return { time: iso(time), az, el };
  });
  const first = Date.parse(start), last = Date.parse(stop);
  if (records.length !== (last - first) / STEP + 1 || records.some((row, i) => Date.parse(row.time) !== first + i * STEP)) {
    throw new Error('Horizons table has missing, duplicated, mismatched or out-of-range timestamps.');
  }
  return records;
}

async function atomicJSON(path, value) {
  const temporary = `${path}.${randomUUID()}.part`;
  await writeFile(temporary, JSON.stringify(value), 'utf8');
  await rename(temporary, path);
}

function abortableDelay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const done = () => { signal.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, milliseconds);
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** One process owns this queue. Run one service replica for the SQLite deployment. */
export async function createHorizonsPipeline({ root, dataDir, onDataset = async () => {}, onJob = async () => {},
  fetchImpl = globalThis.fetch, endpoint = API, requestDelayMs = 1000, retryBaseMs = 2000,
  requestTimeoutMs = 120000, userAgent = process.env.LUNAMARGIN_JPL_USER_AGENT || PRODUCT } = {}) {
  if (!/^LunaMargin\/[\w. -]+ \(.+\)$/.test(userAgent) || !/(https?:\/\/|@)/.test(userAgent) || /[\r\n]/.test(userAgent)) {
    throw new Error('LUNAMARGIN_JPL_USER_AGENT must identify LunaMargin/version and a valid contact URL or email.');
  }
  const directory = join(dataDir, 'horizons');
  const jobsDirectory = join(directory, 'jobs'), rawDirectory = join(directory, 'raw'), datasetsDirectory = join(directory, 'datasets');
  await Promise.all([jobsDirectory, rawDirectory, datasetsDirectory].map(path => mkdir(path, { recursive: true })));
  const manifest = JSON.parse(await readFile(join(root, 'build-info.json'), 'utf8'));
  const baseDescriptor = manifest.identity.datasets.jun;
  const baseText = await readFile(join(root, baseDescriptor.snapshot), 'utf8');
  if (hash(baseText) !== baseDescriptor.sha256) throw new Error('The verified source terrain bundle has changed.');
  const base = JSON.parse(baseText);
  if (base.observerHeightM !== 2 || base.sites.length !== 3 || base.sites.some(site => site.horizonHeightM !== 2 || site.patches.length !== 9)) throw new Error('Unsupported source terrain bundle.');
  const shippedDatasets = [];
  for (const [id, descriptor] of Object.entries(manifest.identity.datasets)) {
    if (descriptor.observerHeightM !== 2) continue;
    const bytes = await readFile(join(root, descriptor.snapshot));
    if (hash(bytes) !== descriptor.sha256) throw new Error(`Shipped dataset checksum mismatch: ${id}`);
    shippedDatasets.push({ ...descriptor, id, terrainSha256: baseDescriptor.sha256 });
  }
  const jobs = new Map(), datasets = new Map();
  let running = false, closed = false, enabled = false, currentAbort = null, workPromise = Promise.resolve();
  let lastRequestFinished = 0;

  for (const filename of await readdir(jobsDirectory)) {
    if (!/^[0-9a-f-]{36}\.json$/.test(filename)) continue;
    const job = JSON.parse(await readFile(join(jobsDirectory, filename), 'utf8'));
    if (!['succeeded', 'failed'].includes(job.status)) {
      job.status = 'queued'; job.stage = 'resuming'; job.message = 'Resuming a persisted data request; verified responses will be reused.';
    }
    jobs.set(job.id, job);
  }
  for (const filename of await readdir(datasetsDirectory)) {
    if (!filename.endsWith('.meta.json')) continue;
    const descriptor = JSON.parse(await readFile(join(datasetsDirectory, filename), 'utf8'));
    if (!/^[a-f0-9]{64}$/.test(descriptor.sha256) || filename !== `${descriptor.sha256}.meta.json`) throw new Error('Invalid generated dataset index.');
    // A complete data-directory backup can be restored to a different path.
    descriptor.path = join(datasetsDirectory, `${descriptor.sha256}.json`);
    const text = await readFile(descriptor.path, 'utf8');
    if (hash(text) !== descriptor.sha256) throw new Error(`Generated dataset checksum mismatch: ${descriptor.id}`);
    datasets.set(descriptor.id, descriptor);
  }

  async function publish(job) {
    job.updatedAt = new Date().toISOString();
    await atomicJSON(join(jobsDirectory, `${job.id}.json`), job);
    await onJob(clone(job));
  }

  async function query(site, target, range, job, signal) {
    const parameters = horizonsParameters(site, target, range);
    const key = hash(JSON.stringify(parameters));
    const cachePath = join(rawDirectory, `${key}.json`);
    let envelope;
    try {
      envelope = JSON.parse(await readFile(cachePath, 'utf8'));
      if (JSON.stringify(envelope.parameters) !== JSON.stringify(parameters) || hash(JSON.stringify(envelope.response)) !== envelope.responseSha256) throw new Error('Raw response cache checksum mismatch.');
      parseHorizonsResponse(envelope.response, { site, target, ...range });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    let cacheHit = Boolean(envelope);
    if (!envelope) {
      const url = `${endpoint}?${new URLSearchParams(parameters)}`;
      for (let attempt = 0; attempt < 4; attempt++) {
        const delay = Math.max(0, lastRequestFinished + requestDelayMs - Date.now());
        if (delay) await abortableDelay(delay, signal);
        job.stage = 'fetching'; job.current = { siteId: site.id, target: Number(target), attempt: attempt + 1 };
        job.message = `Requesting ${target === 10 ? 'Sun' : 'Earth'} ephemeris for ${site.id}.`;
        await publish(job);
        let retryAfter = 0;
        try {
          const response = await fetchImpl(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' },
            signal: AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]), redirect: 'error' });
          if (!response.ok) {
            const error = new Error(`Horizons HTTP ${response.status}.`);
            error.retryable = response.status === 429 || response.status >= 500;
            const header = response.headers.get('retry-after');
            retryAfter = header ? Math.min(60000, Math.max(0, (Number(header) * 1000) || (Date.parse(header) - Date.now()))) : 0;
            throw error;
          }
          const body = await response.text();
          if (body.length > 4_000_000) throw new Error('Horizons response exceeded the allowed size.');
          const responseJSON = JSON.parse(body);
          parseHorizonsResponse(responseJSON, { site, target, ...range });
          envelope = { schemaVersion: 1, requestedAt: new Date().toISOString(), url, parameters,
            response: responseJSON, responseSha256: hash(JSON.stringify(responseJSON)) };
          await atomicJSON(cachePath, envelope);
          break;
        } catch (error) {
          if (signal.aborted) throw error;
          const transient = error.retryable || error.name === 'TimeoutError' || error instanceof TypeError;
          if (!transient || attempt === 3) throw error;
          job.stage = 'backoff'; job.retryAt = new Date(Date.now() + Math.max(retryAfter, retryBaseMs * 2 ** attempt)).toISOString();
          job.message = `Upstream unavailable; waiting before retry ${attempt + 2}/4.`;
          await publish(job);
          await abortableDelay(Math.max(retryAfter, retryBaseMs * 2 ** attempt), signal);
          delete job.retryAt;
        } finally { lastRequestFinished = Date.now(); }
      }
    }
    const bytes = await readFile(cachePath);
    return { records: parseHorizonsResponse(envelope.response, { site, target, ...range }),
      source: { path: `horizons/raw/${key}.json`, sha256: hash(bytes), url: envelope.url,
        requestedAt: envelope.requestedAt, apiVersion: envelope.response.signature.version, cacheHit } };
  }

  async function execute(job, signal) {
    const cached = [...shippedDatasets, ...datasets.values()].find(item => Date.parse(item.start) <= Date.parse(job.start)
      && Date.parse(item.stop) >= Date.parse(job.stop) && item.terrainSha256 === baseDescriptor.sha256);
    if (cached) {
      job.status = 'succeeded'; job.stage = 'complete'; job.datasetId = cached.id; job.cached = true;
      job.completedRequests = 6; job.message = 'Reused a verified cached dataset.';
      await publish(job); return;
    }
    job.status = 'fetching'; job.stage = 'fetching'; job.startedAt ||= new Date().toISOString();
    const bundle = clone(base), sources = [];
    for (const site of bundle.sites) {
      if (signal.aborted) throw signal.reason;
      const sun = await query(site, 10, job, job, signal);
      job.completedRequests += 1; await publish(job);
      const earth = await query(site, 399, job, job, signal);
      job.completedRequests += 1; await publish(job);
      if (sun.records.length !== earth.records.length || sun.records.some((row, i) => row.time !== earth.records[i].time)) throw new Error('Sun/Earth timestamps disagree.');
      site.samples = sun.records.map((row, i) => ({ time: row.time, sunAz: row.az, sunEl: row.el, earthAz: earth.records[i].az, earthEl: earth.records[i].el }));
      site.ephemerisSources = { sun: sun.source, earth: earth.source };
      sources.push(sun.source, earth.source);
    }
    job.status = 'processing'; job.stage = 'validating'; job.message = 'Validating timestamps, terrain identity and source checksums.';
    await publish(job);
    bundle.start = job.start; bundle.stop = job.stop; bundle.generatedAt = new Date().toISOString();
    bundle.season = 'requested';
    bundle.sourceDataTime = sources.map(source => source.requestedAt).sort().at(-1);
    bundle.pipeline = { version: 'horizons-serial-cache-v1', terrainSha256: baseDescriptor.sha256,
      terrainGeneratedAt: base.generatedAt, apiVersions: [...new Set(sources.map(source => source.apiVersion))],
      fetchedSourceCount: sources.filter(source => !source.cacheHit).length,
      policy: 'https://ssd-api.jpl.nasa.gov/doc/', sourceMeaning: 'Retrieved calculated ephemerides, not real-time observations.' };
    const text = JSON.stringify(bundle), sha256 = hash(text), id = `custom-${sha256.slice(0, 20)}`;
    const path = join(datasetsDirectory, `${sha256}.json`);
    await writeFile(path, text, 'utf8');
    const descriptor = { id, path, sha256, start: bundle.start, stop: bundle.stop, generatedAt: bundle.generatedAt,
      observerHeightM: 2, sourceDataTime: bundle.sourceDataTime, sampleIntervalMinutes: 30,
      terrainSha256: baseDescriptor.sha256, terrainGeneratedAt: base.generatedAt, sources };
    await atomicJSON(join(datasetsDirectory, `${sha256}.meta.json`), descriptor);
    await onDataset(clone(descriptor)); datasets.set(id, descriptor);
    job.status = 'succeeded'; job.stage = 'complete'; job.datasetId = id; job.completedAt = new Date().toISOString();
    job.message = 'Validated ephemerides and the existing matched terrain are ready for analysis.';
    await publish(job);
  }

  function startQueue() {
    if (running || closed || !enabled) return;
    running = true;
    workPromise = (async () => {
      while (!closed) {
        const job = [...jobs.values()].find(item => item.status === 'queued');
        if (!job) break;
        currentAbort = new AbortController(); job.completedRequests = 0;
        try { await execute(job, currentAbort.signal); }
        catch (error) {
          job.status = closed ? 'queued' : 'failed'; job.stage = closed ? 'resuming' : 'failed';
          job.message = closed ? 'Paused for service restart; verified cached responses are retained.' : String(error.message || error).slice(0, 900);
          job.error = closed ? null : { code: error.code || 'UPSTREAM_DATA_ERROR', message: job.message };
          await publish(job);
        } finally { currentAbort = null; }
      }
    })().finally(() => { running = false; });
  }

  return {
    listDatasets: () => [...datasets.values()].map(clone),
    resolveDataset: id => datasets.has(id) ? clone(datasets.get(id)) : null,
    listJobs: () => [...jobs.values()].map(clone),
    getJob: id => jobs.has(id) ? clone(jobs.get(id)) : null,
    async enqueue(input, { beforePersist } = {}) {
      if (closed) throw inputError('The data service is stopping.', 'SERVICE_STOPPING');
      const range = validateDataRange(input);
      if ([...jobs.values()].filter(job => !['succeeded', 'failed'].includes(job.status)).length >= 12) {
        const error = inputError('The data queue is full. Please retry later.', 'QUEUE_FULL'); error.status = 429; throw error;
      }
      const job = { id: randomUUID(), ...range, status: 'queued', stage: 'queued', createdAt: new Date().toISOString(),
        completedRequests: 0, totalRequests: 6, message: 'Waiting for the serial upstream data queue.' };
      if (beforePersist) await beforePersist(clone(job));
      jobs.set(job.id, job); await publish(job);
      // The server records visitor ownership immediately after enqueue returns.
      setImmediate(startQueue);
      return clone(job);
    },
    async resume() {
      for (const descriptor of datasets.values()) await onDataset(clone(descriptor));
      for (const job of jobs.values()) await onJob(clone(job));
      enabled = true; startQueue();
    },
    async waitForIdle() { await workPromise; },
    async close() { closed = true; currentAbort?.abort(new Error('Service stopping')); await workPromise; },
  };
}
