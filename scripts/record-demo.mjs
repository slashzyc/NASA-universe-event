/**
 * AI-assisted project recording, not an official competition submission.
 * Captures the actual application with explanatory captions; no result pixels
 * or application data are replaced. Uses installed Playwright/Chrome only.
 * Run: LUNAMARGIN_URL=http://127.0.0.1:4175/ node scripts/record-demo.mjs
 * Optional: PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE for an existing install.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync,readdirSync} from 'node:fs';
import {readFile,writeFile,mkdir,mkdtemp,rmdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeSite} from '../src/analysis.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const moduleCandidates = [process.env.PLAYWRIGHT_MODULE, 'playwright',
  path.resolve(path.dirname(process.execPath), '..', 'node_modules', 'playwright')].filter(Boolean);
// Discover bundled runtimes without tying the recording to one private machine
// or to a particular installed runtime version.
if (process.platform === 'win32') {
  const windowsApps = path.join(process.env.ProgramFiles || 'C:/Program Files', 'WindowsApps');
  try {
    for (const entry of readdirSync(windowsApps).filter(name => name.startsWith('OpenAI.CodexPrimaryRuntime.')).sort().reverse()) {
      moduleCandidates.push(path.join(windowsApps, entry, 'dependencies', 'node', 'node_modules', 'playwright'));
    }
  } catch { /* PLAYWRIGHT_MODULE remains available when this folder is restricted. */ }
}
let playwright;
for (const candidate of moduleCandidates) { try { playwright = require(candidate); break; } catch {} }
if (!playwright) throw new Error('Provide an installed Playwright package using PLAYWRIGHT_MODULE. No dependency is downloaded.');
const executablePath = process.env.BROWSER_EXECUTABLE || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);
const base = new URL(process.env.LUNAMARGIN_URL || 'http://127.0.0.1:4175/');
const output = path.join(root, 'docs', 'media', 'lunamargin-walkthrough.webm');
const temporary = await mkdtemp(path.join(tmpdir(), 'lunamargin-recording-'));
await mkdir(path.dirname(output), {recursive: true});

const settings = {start: '2027-06-02T06:00:00Z', durationHours: 168, maxDarkHours: 24,
  maxCommGapHours: 24, minJointHours: 24, clearanceDeg: 0, observerHeightM: 2};
const bundle = JSON.parse(await readFile(path.join(root, 'data/lunar-sites-june.json'), 'utf8'));
const site = bundle.sites.find(item => item.id === 'ridge-6');
const center = analyzeSite(site, settings);
const southeast = center.patchStats.scenarios.find(item => item.id === 'e+25-n-25');
assert.equal(center.centerFeasible, true);
assert.equal(center.patchStats.feasibleCount, 8);
assert.equal(southeast.feasible, false);
const percentage = (100 * center.metrics.sunHours / settings.durationHours).toFixed(1);
const query = new URLSearchParams({campaign: 'jun', site: site.id, ...settings});
const url = new URL(`?${query}`, base).href;
let browser, context, video, nativeRecorder, captureSession, captureQueue = Promise.resolve();
let recordingMode = 'Playwright recordVideo';
const browserErrors = [];
const wallStart = performance.now();

try {
  browser = await playwright.chromium.launch({headless: true,
    ...(executablePath ? {executablePath} : {}), args: ['--no-proxy-server']});
  const contextOptions = {viewport: {width: 1440, height: 960}, reducedMotion: 'reduce', acceptDownloads: true};
  context = await browser.newContext({...contextOptions, recordVideo: {dir: temporary, size: {width: 1440, height: 960}}});
  let page;
  try { page = await context.newPage(); video = page.video(); }
  catch (error) {
    if (!/ffmpeg/i.test(error.message)) throw error;
    await context.close();
    context = await browser.newContext(contextOptions);
    page = await context.newPage();
    recordingMode = 'Chrome CDP capture + native MediaRecorder (no ffmpeg installation)';
    nativeRecorder = await browser.newPage({viewport: {width: 1440, height: 960}});
    await nativeRecorder.setContent('<canvas width="1440" height="960"></canvas>');
    await nativeRecorder.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#0b1319'; ctx.fillRect(0, 0, 1440, 960);
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
      window.recordedChunks = [];
      window.recorder = new MediaRecorder(canvas.captureStream(25), {mimeType, videoBitsPerSecond: 3_000_000});
      window.recorder.ondataavailable = event => { if (event.data.size) window.recordedChunks.push(event.data); };
      window.recordingStarted = performance.now();
      window.recorder.start(1000);
      // Keep held captions in the encoded timeline even when CDP emits no new
      // frame because the application is visually static.
      window.recordingFrameClock = setInterval(() => ctx.drawImage(canvas, 0, 0), 40);
    });
    captureSession = await context.newCDPSession(page);
    captureSession.on('Page.screencastFrame', frame => {
      captureQueue = captureQueue.then(async () => {
        await nativeRecorder.evaluate(async data => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${data}`)).blob());
          document.querySelector('canvas').getContext('2d').drawImage(bitmap, 0, 0, 1440, 960); bitmap.close();
        }, frame.data);
        await captureSession.send('Page.screencastFrameAck', {sessionId: frame.sessionId});
      }).catch(error => browserErrors.push(`Video frame: ${error.message}`));
    });
    await page.bringToFront();
    await captureSession.send('Page.startScreencast', {format: 'jpeg', quality: 92, maxWidth: 1440, maxHeight: 960, everyNthFrame: 1});
  }
  await context.addInitScript(() => { try { localStorage.setItem('lunamargin-language', 'en'); } catch {} });
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto(url, {waitUntil: 'networkidle'});
  await page.waitForSelector('#app:not([hidden])');
  await page.waitForFunction(() => document.querySelectorAll('#comparison-body tr').length === 3);
  assert.match(await page.locator('#metrics').innerText(), /12\.4/);

  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = `html{scroll-behavior:auto!important}body{padding-bottom:116px!important}
      #recording-disclosure{position:fixed;z-index:2147483647;top:12px;right:14px;padding:8px 13px;border:1px solid #e9c88566;border-radius:4px;background:#07121eef;color:#efcc89;font:600 10px/1.5 system-ui,sans-serif;letter-spacing:1px;pointer-events:none}
      #recording-caption{position:fixed;z-index:2147483647;bottom:0;left:0;right:0;min-height:86px;box-sizing:border-box;padding:17px 34px 18px;border-top:1px solid #e8bc6766;background:#07111bf5;color:#f5f2eb;font:500 22px/1.4 system-ui,sans-serif;pointer-events:none;text-align:center}
      #recording-caption small{display:block;color:#b6c7d4;font-size:12px;letter-spacing:1.5px;margin-bottom:5px}
      dialog{max-height:74vh!important}`;
    document.head.append(style);
    const tag = document.createElement('div'); tag.id = 'recording-disclosure';
    tag.textContent = 'AI-ASSISTED PROJECT RECORDING · NOT AN OFFICIAL SUBMISSION'; document.body.append(tag);
    const caption = document.createElement('div'); caption.id = 'recording-caption'; document.body.append(caption);
  });
  const caption = async (section, sentence) => page.evaluate(({section, sentence}) => {
    const element = document.getElementById('recording-caption'); element.replaceChildren();
    const small = document.createElement('small'); small.textContent = section; element.append(small, document.createTextNode(sentence));
  }, {section, sentence});
  const hold = milliseconds => page.waitForTimeout(milliseconds);
  const scrollTo = async (selector, block = 'center') => {
    await page.locator(selector).evaluate((element, placement) => element.scrollIntoView({block: placement, behavior: 'instant'}), block);
    await hold(150);
  };

  await caption('01 / A POINT IS NOT A FOOTPRINT', 'LunaMargin connects real NASA LOLA terrain with archived JPL Horizons observations.');
  await hold(5000);
  await scrollTo('.workspace-heading', 'start');
  await caption('01 / THE CENTER LOOKS PROMISING', `ROI 6: ${percentage}% Sun-center visibility over seven days. Longest darkness: ${center.metrics.longestDarkHours.toFixed(1)} hours.`);
  await hold(5000);

  const box = await page.locator('#terrain-canvas').boundingBox();
  assert.ok(box);
  const lensSize = box.width < 500 ? 118 : 148;
  const inner = lensSize - 44;
  const cx = box.width - lensSize - 24 + lensSize / 2;
  const cy = 61 + lensSize / 2 + 7;
  await page.mouse.move(box.x + cx, box.y + cy);
  await page.mouse.move(box.x + cx + inner / 2, box.y + cy + inner / 2, {steps: 18});
  await page.mouse.click(box.x + cx + inner / 2, box.y + cy + inner / 2);
  assert.match(await page.locator('#inspection-context').innerText(), /25 m EAST \/ -25 m NORTH/);
  assert.match(await page.locator('#metrics').innerText(), /167\.5/);
  await caption('02 / MOVE 25 m EAST + 25 m SOUTH', `This modeled location has ${southeast.metrics.longestDarkHours.toFixed(1)} hours of darkness. Eight of nine samples pass — this one does not.`);
  await scrollTo('#metrics');
  await hold(7000);

  await scrollTo('.horizon-panel');
  await caption('03 / INSPECT THE TERRAIN HORIZON', 'Scrub through time to see the Sun and Earth relative to this location’s horizon.');
  for (const value of [30, 90, 150, 210, 270]) {
    await page.locator('#time-slider').evaluate((element, next) => {
      element.value = String(next); element.dispatchEvent(new Event('input', {bubbles: true}));
    }, value);
    await hold(1100);
  }

  await caption('04 / SEARCH FOR A MORE FORGIVING WINDOW', 'Compare cached arrival dates in six-hour steps. Require all nine sampled positions to pass.');
  await page.locator('#find-window').click();
  await page.waitForSelector('#search-results:not([hidden])', {timeout: 30000});
  await scrollTo('#search-results', 'center');
  const choice = page.locator('#search-results button[data-site="ridge-4"]').first();
  const nextStart = await choice.getAttribute('data-start');
  assert.equal(nextStart, '2027-06-21T12:00:00.000Z');
  await hold(6000);
  await caption('04 / THE EARLIEST ALL-NINE-PASS OPTIONS ON THIS GRID', '21 June 2027, 12:00 UTC. A later arrival changes the modeled trade-off.');
  await hold(4000);
  await choice.click();
  await scrollTo('#metrics');
  assert.match(await page.locator('#metrics').innerText(), /7\.7/);
  await caption('04 / APPLY THE WINDOW', 'ROI 4: 7.7 hours of darkness, 18.6 hours without Earth visibility, and 9 / 9 locations within the limits.');
  await hold(5000);

  await caption('05 / TAKE THE EVIDENCE WITH YOU', 'Export the real settings, computed intervals, and source trail as HTML, CSV, or JSON.');
  await page.locator('#export-btn').click();
  await hold(3500);
  const downloaded = page.waitForEvent('download');
  await page.locator('#export-json').click();
  const download = await downloaded;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(exported.settings.start, '2027-06-21T12:00:00Z');
  assert.equal(exported.selectedSiteId, 'ridge-4');
  assert.equal(exported.results.find(item => item.siteId === 'ridge-4').patchStats.feasibleCount, 9);
  await hold(1000);
  await page.locator('[data-close="export-dialog"]').click();
  await page.locator('#method-open').click();
  await page.locator('#method-dialog .source-item').first().scrollIntoViewIfNeeded();
  await caption('NASA DATA / EXPLICIT ASSUMPTIONS / REPRODUCIBLE RESULTS', 'Educational geometric screening. Sample counts are not probabilities; visibility is not electrical power or a radio link.');
  await hold(4500);
  assert.deepEqual(browserErrors, []);

  let nativeDurationSeconds;
  if (nativeRecorder) {
    await captureSession.send('Page.stopScreencast');
    await captureQueue;
    const encoded = await nativeRecorder.evaluate(() => new Promise(resolve => {
      window.recorder.onstop = async () => {
        clearInterval(window.recordingFrameClock);
        const bytes = new Uint8Array(await new Blob(window.recordedChunks, {type: 'video/webm'}).arrayBuffer());
        resolve({bytes: Array.from(bytes), durationSeconds: (performance.now() - window.recordingStarted) / 1000});
      };
      window.recorder.stop();
    }));
    await writeFile(output, Buffer.from(encoded.bytes));
    nativeDurationSeconds = encoded.durationSeconds;
    await nativeRecorder.close(); nativeRecorder = null;
  }
  await context.close(); context = null;
  if (video) { await video.saveAs(output); await video.delete(); video = null; }
  const inspection = await browser.newPage();
  await inspection.setContent('<video preload="metadata"></video>');
  const metadata = await inspection.evaluate(src => new Promise((resolve, reject) => {
    const player = document.querySelector('video');
    const timer = setTimeout(() => reject(new Error('Video metadata timeout')), 10000);
    const finish = () => {
      if (!Number.isFinite(player.duration)) return;
      clearTimeout(timer); resolve({durationSeconds: player.duration, width: player.videoWidth, height: player.videoHeight});
    };
    player.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(player.duration)) finish();
      else {
        // Native MediaRecorder creates a streaming WebM. Seeking to its end
        // makes Chrome read the final timestamps and report encoded duration.
        player.addEventListener('durationchange', finish);
        player.addEventListener('seeked', finish, {once: true});
        player.currentTime = 1e9;
      }
    }, {once: true});
    player.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Recorded video could not be decoded')); }, {once: true});
    player.src = src;
  }), new URL('docs/media/lunamargin-walkthrough.webm', base).href);
  metadata.durationSeconds ??= nativeDurationSeconds;
  assert.ok(metadata.durationSeconds >= 45 && metadata.durationSeconds <= 65, `Unexpected recording length: ${metadata.durationSeconds}`);
  console.log(JSON.stringify({output, bytes: (await stat(output)).size, ...metadata,
    elapsedSeconds: (performance.now() - wallStart) / 1000, audio: false, recordingMode,
    disclosure: 'AI-assisted project recording; not an official competition submission.'}, null, 2));
} finally {
  if (context) await context.close().catch(() => {});
  if (nativeRecorder) await nativeRecorder.close().catch(() => {});
  if (video) await video.delete().catch(() => {});
  if (browser) await browser.close();
  await rmdir(temporary).catch(() => {});
}
