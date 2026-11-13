/** R03 built-site checks. Synthetic version changes exist only in browser routes
 * and uploaded in-memory fixtures; no scientific input or release file is edited.
 * Run `node scripts/build.mjs` before this gate.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const built=path.join(root,'dist'),output=path.join(root,'test-results/round2-version');
await mkdir(output,{recursive:true});
const port=process.env.BROWSER_TEST_PORT||'4195';
const origin=(process.env.LUNAMARGIN_URL||`http://127.0.0.1:${port}/`).replace(/\/?$/,'/');
const digest=value=>createHash('sha256').update(value).digest('hex');
const manifest=JSON.parse(await readFile(path.join(built,'build-info.json'),'utf8'));
const algorithmText=await readFile(path.join(built,manifest.identity.algorithm.snapshot),'utf8');
const datasetText=await readFile(path.join(built,manifest.identity.datasets.jun.snapshot),'utf8');
const {analyzeSite}=await import(pathToFileURL(path.join(built,manifest.identity.algorithm.snapshot)).href);
const settings={start:'2027-06-02T06:00:00Z',durationHours:168,maxDarkHours:24,maxCommGapHours:24,minJointHours:24,clearanceDeg:0,observerHeightM:2};
const southeast='e+25-n-25',center='e+0-n+0';
const scenario=(extra={})=>origin+'navigator.html?'+new URLSearchParams({campaign:'jun',site:'ridge-6',patch:southeast,lang:'en',...settings,...extra});
const records=[],errors=[],startedAt=new Date().toISOString();
let browser,server,context,page,savedRecord,currentTest='setup';
const ready=async()=>{await page.waitForSelector('#app:not([hidden])');await page.waitForFunction(()=>document.querySelectorAll('#point-selector button').length===9);};
const chosen=()=>page.locator('#point-selector [aria-pressed="true"]').getAttribute('data-patch');
const metric=async()=>Number.parseFloat(await page.locator('#metrics .metric-value').first().innerText());
const near=(a,b,tolerance=.11)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
async function go(extra={}){await page.goto(scenario(extra));await ready();}
async function download(selector){const promise=page.waitForEvent('download');await page.locator(selector).click();return readFile(await(await promise).path(),'utf8');}
async function evidence(){await page.locator('#export-btn').click();const doc=JSON.parse(await download('#export-json'));await page.locator('[data-close="export-dialog"]').click();return doc;}
async function upload(record,synthetic=false){
  if(!await page.locator('#version-panel').evaluate(e=>e.open))await page.locator('#version-panel > summary').click();
  const chooser=page.waitForEvent('filechooser');await page.locator('#import-record').click();
  await(await chooser).setFiles({name:synthetic?'SYNTHETIC_VERSION_TEST_NOT_NASA.json':'saved-lunamargin-evidence.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(record))});
  await page.waitForFunction(()=>document.querySelector('#record-dialog').open&&!/Checking the record|正在核对/.test(document.querySelector('#record-body').textContent));
}
async function waitOriginal(){await page.waitForFunction(()=>!document.querySelector('#record-original').disabled);}
async function waitUnavailable(){await page.waitForFunction(()=>/unavailable or fail verification|原版快照缺失/.test(document.querySelector('#record-body').textContent));}
async function test(name,run,{synthetic=false}={}){
  currentTest=name;const start=Date.now();
  context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',reducedMotion:'reduce',acceptDownloads:true});
  await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push({test:name,message:e.message}));
  try{await run();records.push({name,status:'PASS',durationMs:Date.now()-start,syntheticFixture:synthetic});console.log('PASS '+name);}
  finally{await context.close();context=null;}
}
function fixtureRelease({algorithm=algorithmText,dataset=datasetText}={}){
  const result=structuredClone(manifest),identity=result.identity;
  identity.sourceIdentity+=' SYNTHETIC browser-route regression fixture; not a released calculation.';
  identity.algorithm={sha256:digest(algorithm),snapshot:`evidence-assets/${digest(algorithm)}.js`};
  identity.application['src/analysis.js']={...identity.algorithm};
  identity.datasets.jun={...identity.datasets.jun,sha256:digest(dataset),snapshot:`evidence-assets/${digest(dataset)}.json`};
  result.buildId=digest(JSON.stringify(identity));
  const assets=new Map([[`evidence-assets/build-${result.buildId}.json`,JSON.stringify(result)],
    [identity.algorithm.snapshot,algorithm],[identity.datasets.jun.snapshot,dataset]]);
  const record=structuredClone(savedRecord);
  record.fixtureType='SYNTHETIC IN-MEMORY VERSION TEST; NOT NASA DATA';
  Object.assign(record.provenance,{buildId:result.buildId,algorithmSha256:identity.algorithm.sha256,datasetSha256:identity.datasets.jun.sha256});
  record.algorithmSnapshot={...record.algorithmSnapshot,sha256:identity.algorithm.sha256,text:algorithm};
  record.inputSnapshot={...record.inputSnapshot,sha256:identity.datasets.jun.sha256,text:dataset};
  return {manifest:result,assets,record};
}
async function routeFixture(assets){
  await context.route('**/evidence-assets/**',route=>{
    const key='evidence-assets/'+new URL(route.request().url()).pathname.split('/evidence-assets/')[1];
    if(assets.has(key))return route.fulfill({status:200,contentType:key.endsWith('.js')?'text/javascript':'application/json',body:assets.get(key)});
    return route.continue();
  });
}

try{
  if(!process.env.LUNAMARGIN_URL){
    server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:port,LUNAMARGIN_SERVE_ROOT:'dist'},windowsHide:true,stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Built preview failed to start')),10000);server.stdout.on('data',chunk=>{if(String(chunk).includes('LunaMargin running')){clearTimeout(timer);resolve();}});server.once('error',reject);server.once('exit',code=>reject(new Error(`Built preview exited ${code}`)));});
  }
  const executable=process.env.BROWSER_EXECUTABLE||(!process.env.CI&&process.platform==='win32'?['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync):undefined);
  browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{}),args:['--no-proxy-server']});
  await test('R03: real schema 3 export binds the built algorithm, dataset, settings and intervals',async()=>{
    const received=await context.request.get(origin+'build-info.json');assert.deepEqual(await received.json(),manifest);
    await go();savedRecord=await evidence();
    assert.equal(savedRecord.schemaVersion,3);assert.equal(savedRecord.provenance.buildId,manifest.buildId);
    assert.equal(savedRecord.provenance.calculationBuildId,manifest.buildId);assert.equal(savedRecord.provenance.interfaceBuildId,manifest.buildId);
    assert.equal(digest(savedRecord.algorithmSnapshot.text),manifest.identity.algorithm.sha256);
    assert.equal(digest(savedRecord.inputSnapshot.text),manifest.identity.datasets.jun.sha256);
    assert.equal(savedRecord.inputSnapshot.text,datasetText);assert.equal(savedRecord.algorithmSnapshot.text,algorithmText);
    assert.equal(savedRecord.selectedPoint.id,southeast);assert.equal(savedRecord.settings.maxDarkHours,24);
    assert.equal(savedRecord.selectedPoint.result.reasons.length,2);assert.ok(savedRecord.selectedPoint.result.windows.dark.length);
    assert.equal(savedRecord.stressTest.levels.length,4);
    const url=new URL(savedRecord.shareURL);assert.equal(url.searchParams.get('build'),manifest.buildId);
    assert.equal(url.searchParams.get('algo'),manifest.identity.algorithm.sha256);assert.equal(url.searchParams.get('data'),manifest.identity.datasets.jun.sha256);
  });
  await test('R03: same-version URL and imported JSON restore the same selected result',async()=>{
    await page.goto(savedRecord.shareURL);await ready();assert.equal(await chosen(),southeast);
    near(await metric(),savedRecord.selectedPoint.result.metrics.longestDarkHours);
    await go({patch:center});await upload(savedRecord);await waitOriginal();
    assert.match(await page.locator('#record-body').innerText(),/Same verified version/);
    await page.locator('#record-original').click();await ready();assert.equal(await chosen(),southeast);
    const restored=await evidence();assert.deepEqual(restored.selectedPoint.result.metrics,savedRecord.selectedPoint.result.metrics);
    assert.equal(restored.provenance.buildId,savedRecord.provenance.buildId);
  });
  await test('R03: a synthetic old algorithm is reported and actually used by main and search calculations',async()=>{
    assert.ok(algorithmText.includes('export function analyzeSite('));assert.ok(algorithmText.includes('export function searchWindows('));
    const altered=algorithmText.replace('export function analyzeSite(','function syntheticOriginalAnalyze(')
      .replace('export function searchWindows(','function syntheticOriginalSearch(')+
      '\n// SYNTHETIC route-only version fixture; never a scientific release.\n'+
      "export function analyzeSite(...args){const result=syntheticOriginalAnalyze(...args);result.syntheticExecutionMarker='ROUTE_ONLY_OLD_ALGORITHM';return result;}\n"+
      "export function searchWindows(...args){const result=syntheticOriginalSearch(...args);result.candidates=result.candidates.filter(c=>c.siteId==='ridge-4');return result;}\n";
    const fixture=fixtureRelease({algorithm:altered});await routeFixture(fixture.assets);await go();await upload(fixture.record,true);await waitOriginal();
    assert.match(await page.locator('#record-body').innerText(),/Algorithm differs/);
    await page.locator('#record-original').click();await ready();
    assert.match(await page.locator('#version-details').innerText(),/Restored the original calculation version/);
    const restored=await evidence();assert.equal(restored.provenance.algorithmSha256,digest(altered));
    assert.equal(restored.provenance.calculationBuildId,fixture.manifest.buildId);assert.equal(restored.provenance.interfaceBuildId,manifest.buildId);
    assert.notEqual(restored.provenance.calculationBuildId,restored.provenance.interfaceBuildId);
    assert.equal(restored.selectedPoint.result.syntheticExecutionMarker,'ROUTE_ONLY_OLD_ALGORITHM');
    assert.ok(restored.results.every(r=>r.syntheticExecutionMarker==='ROUTE_ONLY_OLD_ALGORITHM'));
    await page.locator('#find-window').click();await page.waitForSelector('#search-results:not([hidden])');
    assert.equal(await page.locator('#search-results button[data-start]').first().getAttribute('data-site'),'ridge-4');
  },{synthetic:true});
  await test('R03: a synthetic old dataset changes the restored calculation instead of silently using current data',async()=>{
    const bundle=JSON.parse(datasetText);bundle.syntheticFixture='ROUTE_ONLY_CHANGED_HORIZON_NOT_NASA_DATA';
    const site=bundle.sites.find(s=>s.id==='ridge-6'),patch=site.patches.find(p=>p.id===southeast);patch.horizon=patch.horizon.map(x=>x+10);
    const fixture=fixtureRelease({dataset:JSON.stringify(bundle)});
    fixture.record.selectedPoint.result=analyzeSite({...site,...patch,patches:[]},settings);
    fixture.record.results=bundle.sites.map(site=>analyzeSite(site,settings));
    assert.equal(fixture.record.selectedPoint.result.metrics.longestDarkHours,168);
    await routeFixture(fixture.assets);await go();await upload(fixture.record,true);await waitOriginal();
    assert.match(await page.locator('#record-body').innerText(),/Dataset differs/);
    await page.locator('#record-original').click();await ready();near(await metric(),168,.001);
    const restored=await evidence();assert.equal(restored.provenance.datasetSha256,digest(JSON.stringify(bundle)));
    assert.equal(restored.provenance.calculationBuildId,fixture.manifest.buildId);assert.equal(restored.provenance.interfaceBuildId,manifest.buildId);
    assert.equal(restored.selectedPoint.result.metrics.longestDarkHours,168);assert.equal(JSON.parse(restored.inputSnapshot.text).syntheticFixture,bundle.syntheticFixture);
  },{synthetic:true});
  await test('R03: missing old snapshots retain saved values and wait for explicit current-version recalculation',async()=>{
    const record=structuredClone(savedRecord);record.provenance.buildId='a'.repeat(64);record.fixtureType='SYNTHETIC missing archive';
    await context.route('**/evidence-assets/build-'+record.provenance.buildId+'.json',route=>route.fulfill({status:404,body:'Synthetic unavailable historical release'}));
    await go({patch:center});const before=page.url();await upload(record,true);await waitUnavailable();
    assert.equal(page.url(),before);assert.equal(await chosen(),center);
    assert.match(await page.locator('#record-body').innerText(),/167\.501/);assert.equal(await page.locator('#record-original').isDisabled(),true);
    assert.equal(await page.locator('#record-current').isEnabled(),true);
    await page.locator('#record-current').click();await ready();assert.equal(await chosen(),southeast);
    assert.match(await page.locator('#version-details').innerText(),/new calculation, not the original saved result/);
    assert.equal(new URL(page.url()).searchParams.get('build'),manifest.buildId);
  },{synthetic:true});
  await test('R03: schema 2 records remain readable with unknown version and no automatic restoration',async()=>{
    const legacy=structuredClone(savedRecord);legacy.schemaVersion=2;
    for(const key of ['provenance','inputSnapshot','algorithmSnapshot'])delete legacy[key];
    await go({patch:center});const before=page.url();await upload(legacy,true);
    await page.waitForFunction(()=>/older record cannot establish/.test(document.querySelector('#record-body').textContent));
    assert.match(await page.locator('#record-body').innerText(),/Version unknown/);assert.match(await page.locator('#record-body').innerText(),/167\.501/);
    assert.equal(await page.locator('#record-original').isDisabled(),true);assert.equal(page.url(),before);
    await page.locator('#record-current').click();await ready();assert.match(await page.locator('#version-details').innerText(),/new calculation/);
  },{synthetic:true});
  await test('R03: tampered embedded input bytes block both restoration and recalculation',async()=>{
    const corrupted=structuredClone(savedRecord);corrupted.inputSnapshot.text+=' ';
    await go({patch:center});const before=page.url();await upload(corrupted,true);
    await page.waitForFunction(()=>/could not be verified/.test(document.querySelector('#record-body').textContent));
    assert.match(await page.locator('#record-body').innerText(),/checksum mismatch/);
    assert.equal(await page.locator('#record-original').isDisabled(),true);assert.equal(await page.locator('#record-current').isDisabled(),true);
    assert.equal(page.url(),before);assert.equal(await chosen(),center);
  },{synthetic:true});
  await test('R03: tampered hosted input snapshot stops calculation with an explicit verification error',async()=>{
    await context.route('**/'+manifest.identity.datasets.jun.snapshot,route=>route.fulfill({status:200,contentType:'application/json',body:datasetText+' '}));
    await page.goto(savedRecord.shareURL);await page.waitForFunction(()=>/checksum mismatch/i.test(document.querySelector('#loading').textContent));
    assert.equal(await page.locator('#app').isHidden(),true);assert.equal(await page.locator('#metrics').innerText(),'');
  },{synthetic:true});
  await test('R03: the executed algorithm uses the exact verified response without a second unverified fetch',async()=>{
    let requests=0;
    await context.route('**/'+manifest.identity.algorithm.snapshot,route=>{
      requests++;
      return route.fulfill({status:200,contentType:'text/javascript',body:requests===1?algorithmText:algorithmText+'\nglobalThis.__unverifiedSyntheticAlgorithmExecuted=true;\n'});
    });
    await go();assert.equal(requests,1);assert.equal(await page.evaluate(()=>globalThis.__unverifiedSyntheticAlgorithmExecuted),undefined);
    const doc=await evidence();assert.equal(doc.algorithmSnapshot.text,algorithmText);assert.equal(doc.provenance.algorithmSha256,digest(algorithmText));
  },{synthetic:true});
  await test('R03: an unsupported saved observing height cannot silently become a two-metre calculation',async()=>{
    const unsupported=new URL(savedRecord.shareURL);unsupported.searchParams.set('observerHeightM','5');
    await page.goto(unsupported.href);
    await page.waitForFunction(()=>!document.querySelector('#app').hidden||/height|高度/i.test(document.querySelector('#loading').textContent));
    assert.equal(await page.locator('#app').isHidden(),true,'Unsupported height must not run a silently substituted calculation');
    assert.match(await page.locator('#loading').innerText(),/height|高度/i);
    await go();const record=structuredClone(savedRecord);record.settings.observerHeightM=5;
    await upload(record,true);
    await page.waitForFunction(()=>/could not be verified/.test(document.querySelector('#record-body').textContent));
    assert.match(await page.locator('#record-body').innerText(),/height|高度/i);
    assert.equal(await page.locator('#record-original').isDisabled(),true);
    assert.equal(await page.locator('#record-current').isDisabled(),true);
  },{synthetic:true});
  await test('R03: CSV alone reproduces all 30 verdicts from actual metrics and the three retained thresholds',async()=>{
    await go();await page.locator('#export-btn').click();const csv=await download('#export-csv');
    const rows=csv.replace(/^\ufeff/,'').split(/\r?\n/).map(line=>[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match=>match[1].replaceAll('""','"')));
    const [header,...body]=rows;assert.equal(body.length,30);
    for(const key of ['longest_darkness_hours','longest_earth_gap_hours','joint_visibility_hours','maxDarkHours','maxCommGapHours','minJointHours','build_id','algorithm_sha256','dataset_sha256'])assert.ok(header.includes(key),key);
    for(const values of body){
      assert.equal(values.length,header.length);const row=Object.fromEntries(header.map((key,i)=>[key,values[i]]));
      const pass=Number(row.longest_darkness_hours)<=Number(row.maxDarkHours)+1e-9&&Number(row.longest_earth_gap_hours)<=Number(row.maxCommGapHours)+1e-9&&Number(row.joint_visibility_hours)+1e-9>=Number(row.minJointHours);
      assert.equal(String(pass),row.meets_limits,`${row.site_id}/${row.patch_id}`);assert.equal(row.build_id,manifest.buildId);
      assert.equal(row.algorithm_sha256,manifest.identity.algorithm.sha256);assert.equal(row.dataset_sha256,manifest.identity.datasets.jun.sha256);
      assert.equal(row.interface_build_id,manifest.buildId);
    }
  });
  assert.deepEqual(errors,[]);
}catch(error){records.push({name:currentTest,status:'FAIL',error:error.stack||String(error)});console.error(error);process.exitCode=1;}
finally{
  if(context)await context.close().catch(()=>{});if(browser)await browser.close();if(server)server.kill();
  const report={startedAt,finishedAt:new Date().toISOString(),artifact:'dist/',url:origin,buildId:manifest.buildId,
    syntheticFixturePolicy:'All changed algorithms/data, unavailable snapshots and old-format fixtures exist only in browser routes or memory. Scientific inputs and published snapshots are never edited.',
    passed:records.filter(r=>r.status==='PASS').length,failed:records.filter(r=>r.status==='FAIL').length,applicationErrors:errors,tests:records};
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed,errors:errors.length}));
}
