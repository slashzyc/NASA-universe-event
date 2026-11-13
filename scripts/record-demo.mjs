/**
 * AI-assisted project recording, not an official competition submission.
 * Captures the actual application with explanatory captions; no result pixels
 * or application data are replaced. Uses installed Playwright/Chrome/FFmpeg.
 * Run: LUNAMARGIN_URL=http://127.0.0.1:4175/ node scripts/record-demo.mjs
 * Optional: PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, FFMPEG_EXECUTABLE.
 * The official Playwright media helper can be installed separately with
 * `node node_modules/playwright/cli.js install ffmpeg`; PLAYWRIGHT_BROWSERS_PATH
 * selects its cache. This script never downloads dependencies.
 * Use --finalize-existing to losslessly index and validate an existing video.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync,readdirSync} from 'node:fs';
import {readFile,writeFile,mkdir,mkdtemp,rmdir,stat,unlink} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeSite,searchWindows} from '../src/analysis.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync=promisify(execFile);
const finalizeExisting=process.argv.includes('--finalize-existing');
const mediaCaches=[process.env.PLAYWRIGHT_BROWSERS_PATH,
  path.resolve(root,'../tmp/playwright-media-cache'),
  process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'ms-playwright'),
  path.join(homedir(),'.cache','ms-playwright'),path.join(homedir(),'Library','Caches','ms-playwright')].filter(Boolean);
const ffmpegCandidates=[process.env.FFMPEG_EXECUTABLE].filter(Boolean);
for(const cache of mediaCaches){
  try{for(const entry of readdirSync(cache).filter(name=>/^ffmpeg-\d+$/.test(name)).sort().reverse()){
    for(const name of ['ffmpeg-win64.exe','ffmpeg-linux','ffmpeg-mac'])ffmpegCandidates.push(path.join(cache,entry,name));
  }}catch{/* An explicitly configured helper remains available. */}
}
const mediaHelper=ffmpegCandidates.find(existsSync);
if(!mediaHelper)throw new Error('Install the official Playwright ffmpeg helper first, or provide FFMPEG_EXECUTABLE. A seekable WebM is required.');
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
const recommended=searchWindows(bundle.sites,{...settings,minPatchCoverage:1,stepHours:6}).candidates.find(item=>item.feasible);
assert.equal(recommended.siteId,'ridge-1');
const recommendedSite=bundle.sites.find(item=>item.id===recommended.siteId);
const recommendedResult=analyzeSite(recommendedSite,{...settings,start:recommended.start});
const query = new URLSearchParams({campaign: 'jun', site: site.id, ...settings});
const url = new URL(`navigator.html?${query}`, base).href;
let browser, context, video, nativeRecorder, captureSession, captureQueue = Promise.resolve();
let recordingMode = 'Playwright recordVideo';
const browserErrors = [];
const wallStart = performance.now();

try {
  browser = await playwright.chromium.launch({headless: true,
    ...(executablePath ? {executablePath} : {}), args: ['--no-proxy-server']});
  if(!finalizeExisting){
  const contextOptions = {viewport: {width: 1440, height: 960}, reducedMotion: 'reduce', acceptDownloads: true, locale:'en-US', permissions:['clipboard-read','clipboard-write']};
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

  const installOverlay=async()=>page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = `html{scroll-behavior:auto!important}body{padding-bottom:116px!important}
      #recording-disclosure{position:fixed;z-index:2147483647;top:12px;right:14px;padding:8px 13px;border:1px solid #d3aa7266;border-radius:2px;background:#080b0def;color:#d6bc95;font:600 10px/1.5 system-ui,sans-serif;letter-spacing:1px;pointer-events:none}
      #recording-caption{position:fixed;z-index:2147483647;bottom:0;left:0;right:0;min-height:86px;box-sizing:border-box;padding:17px 34px 18px;border-top:1px solid #d3aa7266;background:#080b0df5;color:#eeeee6;font:500 22px/1.4 system-ui,sans-serif;pointer-events:none;text-align:center}
      #recording-caption small{display:block;color:#d6bc95;font-size:12px;letter-spacing:1.5px;margin-bottom:5px}
      dialog{max-height:74vh!important}`;
    document.head.append(style);
    const tag = document.createElement('div'); tag.id = 'recording-disclosure';
    tag.textContent = 'AI-ASSISTED PROJECT RECORDING · NOT AN OFFICIAL SUBMISSION'; document.body.append(tag);
    const caption = document.createElement('div'); caption.id = 'recording-caption'; document.body.append(caption);
  });
  await installOverlay();
  const caption = async (section, sentence) => page.evaluate(({section, sentence}) => {
    const element = document.getElementById('recording-caption'); element.replaceChildren();
    const small = document.createElement('small'); small.textContent = section; element.append(small, document.createTextNode(sentence));
  }, {section, sentence});
  const hold = milliseconds => page.waitForTimeout(milliseconds);
  const scrollTo = async (selector, block = 'center') => {
    await page.locator(selector).evaluate((element, placement) => element.scrollIntoView({block: placement, behavior: 'instant'}), block);
    await hold(150);
  };

  await caption('01 / YOUR FIRST LUNAR MISSION', 'Choose a place. Set your mission. Read the result — no space knowledge needed.');
  await hold(3500);
  await scrollTo('#read-result', 'start');
  await caption('01 / THE CENTER MEETS THE EXAMPLE LIMITS', `ROI 6: ${center.metrics.longestDarkHours.toFixed(1)} hours without Sun visibility. Eight of nine sampled locations pass.`);
  await hold(4000);

  await page.locator('#inspect-risk').click();
  assert.equal(await page.locator('#point-selector [data-patch="e+25-n-25"]').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#metrics').innerText(), /167\.5/);
  assert.match(await page.locator('#result-summary').innerText(), /2/);
  await caption('02 / EXPLORE THE POINT OUTSIDE THE LIMITS', `Move 25 m east and 25 m south: ${southeast.metrics.longestDarkHours.toFixed(1)} hours without Sun visibility. Two limits are missed.`);
  await scrollTo('#read-result', 'start');
  await hold(4500);

  await caption('03 / KEEP THE POINT YOU ACTUALLY SELECTED', 'Share or save this southeast sample. The link and brief retain its two missed limits.');
  await page.locator('#share-point').click();
  const sharedURL=page.url();
  assert.equal(new URL(sharedURL).searchParams.get('patch'),'e+25-n-25');
  const pointDownload=page.waitForEvent('download');
  await page.locator('#save-brief').click();
  const pointBrief=await pointDownload;
  const pointHtml=await readFile(await pointBrief.path(),'utf8');
  assert.match(pointHtml,/e\+25-n-25/);assert.match(pointHtml,/167\.5/);
  await hold(1500);
  // Navigate to the saved artifact so the application's pending callbacks are
  // discarded along with its document, as when opening the downloaded brief.
  await page.goto('data:text/html;charset=utf-8,'+encodeURIComponent(pointHtml),{waitUntil:'load'});
  await installOverlay();
  await caption('03 / THE EXPORTED BRIEF AGREES WITH THE SCREEN', 'Selected point: southeast. Its metrics, failure reasons, intervals and restore link stay together.');
  await hold(4000);
  await page.goto(sharedURL,{waitUntil:'networkidle'});
  await page.waitForSelector('#app:not([hidden])');
  assert.equal(await page.locator('#point-selector [data-patch="e+25-n-25"]').getAttribute('aria-pressed'),'true');
  await installOverlay();
  await scrollTo('.point-explorer');
  await caption('03 / RESTORED TO THE SAME SOUTHEAST POINT', 'The restored view selects the same sample. Nine tested positions are not a landing-success probability.');
  await hold(3000);
  await page.locator('#detail-charts > summary').click();
  await scrollTo('.horizon-panel');
  await caption('03 / INSPECT THE GEOMETRY', 'Move through time to see the Sun and Earth above or behind the local terrain.');
  for (const value of [30,150,270]) {
    await page.locator('#time-slider').evaluate((element,next)=>{element.value=String(next);element.dispatchEvent(new Event('input',{bubbles:true}));},value);
    await hold(800);
  }

  await caption('04 / FIND A LATER DATE', 'Search the same month in six-hour steps, keeping all mission limits unchanged.');
  await page.locator('#find-window').click();
  await page.waitForSelector('#search-results:not([hidden])', {timeout: 30000});
  await scrollTo('#search-results', 'center');
  const firstChoice=page.locator('#search-results button[data-site]').first();
  assert.equal(await firstChoice.getAttribute('data-site'),recommended.siteId);
  const choice = firstChoice;
  const nextStart = await choice.getAttribute('data-start');
  assert.equal(Date.parse(nextStart),Date.parse(recommended.start));
  await hold(3500);
  await caption('04 / SAME DATE. COMPARE THE WEAKEST MARGIN.', `ROI ${recommendedSite.sourceRoiNumber} comes first: its smallest nine-point spare time is ${recommended.worstCase.minimumMarginHours.toFixed(2)} hours. Every trade-off remains visible.`);
  await hold(3000);
  await choice.click();
  await scrollTo('#read-result', 'start');
  assert.ok((await page.locator('#metrics').innerText()).includes(recommendedResult.metrics.longestDarkHours.toFixed(1)));
  await caption('04 / USE THE WINDOW WITH MORE FOOTPRINT MARGIN', `ROI ${recommendedSite.sourceRoiNumber}: center darkness ${recommendedResult.metrics.longestDarkHours.toFixed(1)} hours; worst sample ${recommendedResult.patchStats.worstCase.metrics.longestDarkHours.toFixed(2)} hours. All nine meet the limits.`);
  await hold(5000);

  await caption('05 / SAVE A READABLE MISSION BRIEF', 'One click saves the settings, comparison, and NASA source trail in a printable document.');
  const briefDownload = page.waitForEvent('download');
  await page.locator('#save-brief').click();
  const brief = await briefDownload;
  assert.ok((await readFile(await brief.path(), 'utf8')).includes(new Date(recommended.start).toISOString().replace('T',' ').replace('.000Z',' UTC')));
  await hold(1800);

  await caption('05 / KEEP THE FULL CALCULATION RECORD', 'Export HTML, CSV, or JSON to inspect the assumptions and reproduce the result.');
  await page.locator('#export-btn').click();
  await hold(1800);
  const downloaded = page.waitForEvent('download');
  await page.locator('#export-json').click();
  const download = await downloaded;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(exported.settings.start, '2027-06-21T12:00:00Z');
  assert.equal(exported.selectedSiteId, recommended.siteId);
  assert.equal(exported.results.find(item => item.siteId === recommended.siteId).patchStats.feasibleCount, 9);
  await hold(1000);
  await page.locator('[data-close="export-dialog"]').click();
  await page.locator('#method-open').click();
  await page.locator('#method-dialog .source-item').first().scrollIntoViewIfNeeded();
  await caption('NASA DATA / EXPLICIT ASSUMPTIONS / REPRODUCIBLE RESULTS', 'Educational geometric screening. Sample counts are not probabilities; visibility is not electrical power or a radio link.');
  await hold(3500);
  assert.deepEqual(browserErrors, []);

  if (nativeRecorder) {
    await captureSession.send('Page.stopScreencast');
    await captureQueue;
    const encoded = await nativeRecorder.evaluate(() => new Promise(resolve => {
      window.recorder.onstop = async () => {
        clearInterval(window.recordingFrameClock);
        const bytes = new Uint8Array(await new Blob(window.recordedChunks, {type: 'video/webm'}).arrayBuffer());
        resolve({bytes: Array.from(bytes)});
      };
      window.recorder.stop();
    }));
    await writeFile(output, Buffer.from(encoded.bytes));
    await nativeRecorder.close(); nativeRecorder = null;
  }
  await context.close(); context = null;
  if (video) { await video.saveAs(output); await video.delete(); video = null; }
  }else recordingMode='Existing recording; lossless container finalization';
  // Native MediaRecorder emits a streaming WebM without finite duration/cues.
  // Copy compressed packets unchanged while FFmpeg writes duration and an index.
  // FFmpeg derives timestamps from the stream; no duration is supplied here.
  const indexed=path.join(temporary,'indexed.webm');
  await execFileAsync(mediaHelper,['-hide_banner','-loglevel','error','-nostdin','-y','-i',output,'-map','0:v:0','-c','copy',indexed],{windowsHide:true});
  await writeFile(output,await readFile(indexed));
  await unlink(indexed);
  const inspection = await browser.newPage();
  // Give the inspection document the video's origin so decoded frame checks
  // are readable without changing the application or its published files.
  const inspectionURL=new URL('__lunamargin_video_check__.html',base).href;
  await inspection.route(inspectionURL,route=>route.fulfill({contentType:'text/html',body:'<video preload="auto" muted></video>'}));
  await inspection.goto(inspectionURL);
  const metadata = await inspection.evaluate(src => new Promise((resolve, reject) => {
    const player = document.querySelector('video');
    const timer = setTimeout(() => reject(new Error('Video metadata timeout')), 10000);
    player.addEventListener('loadedmetadata', () => {
      clearTimeout(timer);
      if(!Number.isFinite(player.duration))return reject(new Error('WebM must report finite duration at loadedmetadata, before playing or seeking.'));
      resolve({durationSeconds:player.duration,width:player.videoWidth,height:player.videoHeight});
    }, {once: true});
    player.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Recorded video could not be decoded')); }, {once: true});
    player.src = src;
  }), new URL('docs/media/lunamargin-walkthrough.webm', base).href);
  assert.ok(metadata.durationSeconds >= 45 && metadata.durationSeconds <= 65, `Unexpected recording length: ${metadata.durationSeconds}`);
  // The minimal development server does not implement HTTP byte ranges. Load
  // these exact bytes into a Blob for seek checks, independent of that server.
  // The initial finite-duration check above still uses the normal HTTP URL.
  await inspection.evaluate(async()=>{
    const player=document.querySelector('video');
    const response=await fetch(player.src);if(!response.ok)throw new Error('Cannot load recorded video for seek validation');
    const blob=new Blob([await response.arrayBuffer()],{type:'video/webm'});
    await new Promise((resolve,reject)=>{player.addEventListener('loadedmetadata',resolve,{once:true});player.addEventListener('error',reject,{once:true});player.src=URL.createObjectURL(blob);});
  });
  const seekChecks=await inspection.evaluate(async()=>{
    const player=document.querySelector('video'),canvas=document.createElement('canvas');
    canvas.width=player.videoWidth;canvas.height=player.videoHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),checks=[];
    for(const target of [18,32,40]){
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Video seek timeout')),10000);player.addEventListener('seeked',()=>{clearTimeout(timer);resolve();},{once:true});player.currentTime=target;});
      ctx.drawImage(player,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let min=255,max=0;for(let i=0;i<pixels.length;i+=16){const value=(pixels[i]+pixels[i+1]+pixels[i+2])/3;min=Math.min(min,value);max=Math.max(max,value);}
      checks.push({target,actual:player.currentTime,pixelRange:max-min,seekableEnd:player.seekable.length?player.seekable.end(player.seekable.length-1):0});
    }
    return checks;
  });
  for(const check of seekChecks){
    assert.ok(Math.abs(check.actual-check.target)<.1,'Seek did not reach the requested time');
    assert.ok(check.pixelRange>25,'Seek decoded an empty frame');
    assert.ok(check.seekableEnd>=metadata.durationSeconds-.1,'Video timeline is not fully seekable');
  }
  const playback=await inspection.evaluate(()=>new Promise((resolve,reject)=>{
    const player=document.querySelector('video'),timer=setTimeout(()=>reject(new Error('Full video playback timeout')),15000);
    player.onended=()=>{clearTimeout(timer);resolve({ended:player.ended,error:player.error?.message??null});};
    player.onerror=()=>{clearTimeout(timer);reject(new Error('Playback decoding error'));};
    player.currentTime=0;player.playbackRate=8;player.play().catch(reject);
  }));
  assert.equal(playback.ended,true);assert.equal(playback.error,null);
  console.log(JSON.stringify({output, bytes: (await stat(output)).size, ...metadata,
    seekChecks,playback,seekTransport:'Exact file bytes as Blob; independent of development-server Range support',container:'Indexed WebM; compressed video packets copied without re-encoding',
    elapsedSeconds: (performance.now() - wallStart) / 1000, audio: false, recordingMode,
    disclosure: 'AI-assisted project recording; not an official competition submission.'}, null, 2));
} finally {
  if (context) await context.close().catch(() => {});
  if (nativeRecorder) await nativeRecorder.close().catch(() => {});
  if (video) await video.delete().catch(() => {});
  if (browser) await browser.close();
  await rmdir(temporary).catch(() => {});
}
