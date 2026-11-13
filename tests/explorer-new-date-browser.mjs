/** Real built-UI checks. The seed contains actual NASA responses; one later
 * HTTP failure is injected only to test the failure state, never the science. */
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { createService } from '../server/index.mjs';

const root=resolve(import.meta.dirname,'..'), output=join(root,'test-results','explorer-new-date');
const seed=resolve(process.env.LUNAMARGIN_REAL_CACHE||join(root,'..','tmp','explorer-real-pipeline','horizons'));
await mkdir(output,{recursive:true});
assert.ok(existsSync(seed),'Run the documented real NASA new-date validation first or provide LUNAMARGIN_REAL_CACHE.');
const seedDescriptors=await Promise.all((await readdir(join(seed,'datasets'))).filter(file=>file.endsWith('.meta.json')).map(async file=>JSON.parse(await readFile(join(seed,'datasets',file),'utf8'))));
const expectedDataset=seedDescriptors.find(item=>Date.parse(item.start)===Date.parse('2027-07-01T00:00:00Z')&&Date.parse(item.stop)===Date.parse('2027-07-03T00:00:00Z'));
assert.ok(expectedDataset,'The seed must contain the requested July 1–3 real NASA dataset.');
const dataDir=await mkdtemp(join(output,'database-'));
await cp(seed,join(dataDir,'horizons'),{recursive:true});
const records=[],pageErrors=[],startedAt=new Date().toISOString();
const realFetch=globalThis.fetch;
let rejectedCalls=0,service,browser,context,page,origin,formal,analysisId,taskId,shareURL;
globalThis.fetch=async(url,options)=>{
  if(String(url).startsWith('https://ssd.jpl.nasa.gov/api/horizons.api')){
    rejectedCalls++;return new Response('TEST-ONLY upstream unavailable', {status:400});
  }
  return realFetch(url,options);
};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function test(name,run){const begin=Date.now();await run();records.push({name,status:'PASS',durationMs:Date.now()-begin});console.log('PASS '+name);}
async function connected(p=page){await p.waitForSelector('#service-console .service-led.connected');await p.waitForFunction(()=>window.lunaMargin?.getState().ready&&window.lunaMarginService);}
async function coverageOpen(p=page){const details=p.locator('.coverage-details');if(!await details.evaluate(e=>e.open))await details.locator('summary').click();}
async function requestDate(start,days){await coverageOpen();await page.locator('#new-data-date').fill(start);await page.locator('#new-data-days').fill(String(days));await page.locator('#data-request button[type="submit"], #data-request > button.secondary-btn').first().click();}
try{
  service=await createService({root,staticRoot:join(root,'dist'),dataDir});
  const address=await service.listen(0);origin=`http://127.0.0.1:${address.port}/`;
  const executable=process.env.BROWSER_EXECUTABLE||(!process.env.CI&&process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined);
  browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{}),args:['--no-proxy-server']});
  context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,reducedMotion:'reduce'});
  await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>pageErrors.push(error.message));
  await test('Built workbench queries real cached new-date job and calculates 48 hours without changing thresholds',async()=>{
    await page.goto(origin+'navigator.html?lang=zh');await connected();
    const before=await page.evaluate(()=>window.lunaMargin.getState());
    await requestDate('2027-07-01',2);
    await page.waitForFunction(()=>document.querySelector('#data-job-status')?.textContent.includes('已复用校验过的缓存'));
    assert.equal(rejectedCalls,0,'The real cached dataset must avoid duplicate upstream requests.');
    assert.match(await page.locator('#use-new-data').textContent(),/48/);
    await page.locator('#use-new-data').click();
    await page.waitForFunction(()=>window.lunaMarginService.getRecord()?.campaign.startsWith('custom-')&&window.lunaMargin.getState().campaign.startsWith('custom-')&&!document.querySelector('#formal-export').disabled);
    formal=await page.evaluate(()=>structuredClone(window.lunaMarginService.getRecord()));analysisId=formal.analysisId||formal.server.analysisId;
    const state=await page.evaluate(()=>window.lunaMargin.getState());
    assert.equal(state.settings.durationHours,48);assert.equal(Date.parse(state.settings.start),Date.parse('2027-07-01T00:00:00Z'));
    for(const k of ['maxDarkHours','maxCommGapHours','minJointHours','clearanceDeg','observerHeightM'])assert.equal(state.settings[k],before.settings[k],k);
    assert.equal(formal.provenance.datasetSha256,expectedDataset.sha256);
    assert.equal(formal.sourceDataTime,expectedDataset.sourceDataTime);
    assert.notEqual(formal.calculatedAt,formal.sourceDataTime);
    await page.screenshot({path:join(output,'new-date-result.png'),fullPage:true});
  });
  await test('Formal export equals SQLite result and input hashes',async()=>{
    const row=service.db.prepare('SELECT record_json,record_sha256 FROM analyses WHERE id=?').get(analysisId);
    const saved=JSON.parse(row.record_json);assert.equal(sha(row.record_json),row.record_sha256);
    const snapshot=structuredClone(formal);delete snapshot.analysisId;assert.deepEqual(snapshot,saved);
    await page.locator('#formal-export').click();const pending=page.waitForEvent('download');await page.locator('#tasks-dialog [data-format="json"]').click();
    const download=await pending,bytes=await readFile(await download.path(),'utf8');assert.deepEqual(JSON.parse(bytes),saved);
    await page.locator('#close-tasks').click();assert.equal(sha(saved.inputSnapshot.text),saved.provenance.datasetSha256);
  });
  await test('Custom campaign reload and saved task survive server restart',async()=>{
    await page.reload();await connected();
    assert.equal((await page.evaluate(()=>window.lunaMargin.getState())).campaign,formal.campaign);
    const taskResponse=await context.request.post(origin+'api/tasks',{data:{analysisId,name:'真实新日期 · 48 小时'}});assert.equal(taskResponse.status(),201);
    const saved=await taskResponse.json();taskId=(saved.task||saved).id;
    const shareResponse=await context.request.post(origin+`api/tasks/${taskId}/share`,{data:{}});assert.equal(shareResponse.status(),201);shareURL=(await shareResponse.json()).url;
    const port=Number(new URL(origin).port);await service.close();service=await createService({root,staticRoot:join(root,'dist'),dataDir});await service.listen(port);
    await page.goto(origin+'navigator.html?task='+taskId);await connected();await page.waitForFunction(()=>window.lunaMarginService.getRecord()?.campaign.startsWith('custom-'));
    const after=await page.evaluate(()=>window.lunaMarginService.getRecord());assert.equal(after.provenance.datasetSha256,formal.provenance.datasetSha256);assert.deepEqual(after.settings,formal.settings);
  });
  await test('A separate visitor reads the same dynamic result with no editing permission',async()=>{
    const receiver=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
    await receiver.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
    const shared=await receiver.newPage();await shared.goto(shareURL);await connected(shared);await shared.waitForFunction(()=>window.lunaMarginService.getRecord()?.campaign.startsWith('custom-'));
    assert.match(await shared.locator('#archive-banner').textContent(),/只读分享记录/);
    assert.equal(await shared.locator('#server-calculate').isDisabled(),true);
    const response=await receiver.request.delete(origin+'api/tasks/'+taskId);assert.equal(response.status(),404);
    const shown=await shared.evaluate(()=>window.lunaMarginService.getRecord());assert.deepEqual(shown.settings,formal.settings);assert.equal(shown.provenance.datasetSha256,formal.provenance.datasetSha256);
    await shared.screenshot({path:join(output,'new-date-shared-mobile.png'),fullPage:true});await receiver.close();
  });
  await test('Uncovered date cannot create a formal result; controlled upstream failure is visible',async()=>{
    const invalid=await context.request.post(origin+'api/analyses',{data:{campaign:formal.campaign,siteId:'ridge-6',patchId:'e+0-n+0',settings:{...formal.settings,start:'2027-08-01T00:00:00Z'}}});
    assert.equal(invalid.status(),422);assert.ok(!(await invalid.json()).record);
    await page.goto(origin+'navigator.html?lang=zh');await connected();
    await requestDate('2027-07-04',2);
    await page.waitForFunction(()=>document.querySelector('#data-job-status')?.textContent.includes('获取失败'));
    assert.ok(rejectedCalls>=1);assert.equal(await page.locator('#use-new-data').isVisible(),false);
    assert.match(await page.locator('#data-job-status').textContent(),/Horizons HTTP 400/);
    const jobs=await (await context.request.get(origin+'api/data-jobs')).json();assert.equal(jobs.jobs[0].status,'failed');assert.ok(!jobs.jobs[0].datasetId);
    await page.screenshot({path:join(output,'new-date-failure.png'),fullPage:true});
  });
  assert.deepEqual(pageErrors,[]);
}catch(error){records.push({name:'failure',status:'FAIL',message:error.stack});process.exitCode=1;console.error(error);}
finally{
  const report={startedAt,finishedAt:new Date().toISOString(),artifact:'dist',seed:'actual NASA raw responses from docs/new-date-validation.json',failureInjection:'Only the final uncached request receives test HTTP 400; no synthetic scientific results are accepted.',records,pageErrors,actualRecord:formal?{datasetId:formal.campaign,datasetSha256:formal.provenance.datasetSha256,algorithmSha256:formal.provenance.algorithmSha256,settings:formal.settings,sourceDataTime:formal.sourceDataTime,calculatedAt:formal.calculatedAt,selectedMetrics:formal.selectedPoint.result.metrics}:null};
  await writeFile(join(root,'docs','new-date-browser-validation.json'),JSON.stringify(report,null,2)+'\n');
  await browser?.close();await service?.close();globalThis.fetch=realFetch;
}
