/** Behavior gate for M01/M02/M03/M08. Run after npm ci + Playwright installation.
 * LUNAMARGIN_FAULT=drop-patch intentionally breaks shared-point restoration only
 * in the served test response, proving this gate exits nonzero on a regression.
 * No application file or data is modified by this fault probe.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium} from 'playwright';
import {analyzeSite} from '../src/analysis.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'test-results/revision-browser');
await mkdir(output,{recursive:true});
const port=process.env.BROWSER_TEST_PORT||'4190';
const origin=process.env.LUNAMARGIN_URL||`http://127.0.0.1:${port}/`;
const base=/\.html(?:[?#]|$)/.test(origin)?origin:new URL('navigator.html',origin.replace(/\/?$/,'/')).href;
const fault=process.env.LUNAMARGIN_FAULT||null;
assert.ok(!fault||fault==='drop-patch','Unknown fault injection');
const common={campaign:'jun',site:'ridge-6',start:'2027-06-02T06:00:00Z',durationHours:'168',maxDarkHours:'24',maxCommGapHours:'24',minJointHours:'24',clearanceDeg:'0'};
const scenario=(extra={})=>{const url=new URL(base);url.search=new URLSearchParams({...common,...extra});return url.href;};
const center='e+0-n+0',se='e+25-n-25';
const bundle=JSON.parse(await readFile(path.join(root,'data/lunar-sites-june.json'),'utf8'));
const site=bundle.sites.find(s=>s.id==='ridge-6');
const numericSettings={start:common.start,durationHours:168,maxDarkHours:24,maxCommGapHours:24,minJointHours:24,clearanceDeg:0,observerHeightM:2};
const reference=analyzeSite(site,numericSettings);
const records=[],errors=[],resourceErrors=[],startedAt=new Date().toISOString();
let browser,server,page,context,currentTest='setup';
const ready=async p=>{await p.waitForSelector('#app:not([hidden])');await p.waitForFunction(()=>document.querySelectorAll('#point-selector button').length===9&&document.querySelectorAll('#comparison-body tr').length===3);};
const selected=async p=>p.locator('#point-selector [aria-pressed="true"]').getAttribute('data-patch');
const metric=async p=>Number.parseFloat(await p.locator('#metrics .metric-value').first().innerText());
const close=(a,b,tolerance=.11)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
async function go(extra={}){await page.goto(scenario(extra));await ready(page);}
async function choose(id){await page.locator(`#point-selector [data-patch="${id}"]`).click();assert.equal(await selected(page),id);}
async function download(selector){const pending=page.waitForEvent('download');await page.locator(selector).click();const result=await pending;return {text:await readFile(await result.path(),'utf8'),filename:result.suggestedFilename()};}
async function json(){await page.locator('#export-btn').click();const result=await download('#export-json');await page.locator('[data-close="export-dialog"]').click();return JSON.parse(result.text);}
async function test(name,fn){currentTest=name;const start=Date.now();await fn();records.push({name,status:'PASS',durationMs:Date.now()-start});console.log('PASS '+name);}
const captureErrors=p=>{p.on('pageerror',error=>errors.push(error.message));p.on('console',message=>{if(message.type()==='error')errors.push(message.text());});p.on('response',response=>{if(response.status()>=400&&new URL(response.url()).origin===new URL(base).origin)resourceErrors.push(`${response.status()} ${response.url()}`);});};

try{
  if(!process.env.LUNAMARGIN_URL){
    server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:port},windowsHide:true,stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Preview failed to start')),10000);server.stdout.on('data',data=>{if(String(data).includes('LunaMargin running')){clearTimeout(timer);resolve();}});server.once('error',reject);server.once('exit',code=>reject(new Error(`Preview exited ${code}`)));});
  }
  const localExecutable=process.env.BROWSER_EXECUTABLE||(!process.env.CI&&process.platform==='win32'?['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync):undefined);
  browser=await chromium.launch({headless:true,...(localExecutable?{executablePath:localExecutable}:{}),args:['--no-proxy-server']});
  context=await browser.newContext({viewport:{width:1440,height:1050},locale:'en-US',reducedMotion:'reduce',acceptDownloads:true});
  // System fonts make CI layout repeatable without an external font-CDN outage.
  await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  if(fault)await context.route('**/src/app.js',async route=>{const response=await route.fetch();const text=await response.text();assert.ok(text.includes("pendingPatch=params.get('patch')"),'Fault seam changed');await route.fulfill({response,body:text.replace("pendingPatch=params.get('patch')","pendingPatch=null")});});
  page=await context.newPage();page.setDefaultTimeout(15000);captureErrors(page);
  await test('M01: all nine selected points survive share URL restoration with exact metrics',async()=>{
    await go();
    for(const patch of site.patches){
      await choose(patch.id);assert.equal(new URL(page.url()).searchParams.get('patch'),patch.id);
      const before=await metric(page),link=page.url();
      await page.goto(link);await ready(page);assert.equal(await selected(page),patch.id);
      close(await metric(page),before);
      close(before,reference.patchStats.scenarios.find(p=>p.id===patch.id).metrics.longestDarkHours);
    }
  });
  await test('M01: legacy and invalid point links fall back to center; site and month switches reset it',async()=>{
    await go({patch:'not-a-real-point'});assert.equal(await selected(page),center);
    const legacy=new URL(scenario());legacy.searchParams.delete('patch');await page.goto(legacy.href);await ready(page);assert.equal(await selected(page),center);
    await choose(se);await page.locator('#site-tabs [data-site="ridge-1"]').click();assert.equal(await selected(page),center);
    await choose(se);await page.locator('#campaign').selectOption('mar');await page.waitForFunction(()=>new URL(location).searchParams.get('campaign')==='mar');assert.equal(await selected(page),center);
    assert.equal(new URL(page.url()).searchParams.get('patch'),center);
  });
  await test('M01/M08: JSON, readable HTML and CSV identify the selected southeast point and applied settings',async()=>{
    await go();await choose(se);const doc=await json();
    assert.equal(doc.schemaVersion,3);assert.equal(doc.selectedPoint.id,se);assert.equal(doc.selectedPoint.siteId,'ridge-6');assert.equal(doc.selectedPoint.dxM,25);assert.equal(doc.selectedPoint.dyM,-25);
    close(doc.selectedPoint.result.metrics.longestDarkHours,167.5,.1);close(doc.selectedPoint.result.metrics.jointHours,0);
    assert.deepEqual(doc.selectedPoint.result.reasons.map(r=>r.code).sort(),['dark-gap','joint-shortfall']);
    assert.ok(doc.selectedPoint.result.windows.dark.length);assert.equal(new URL(doc.shareURL).searchParams.get('patch'),se);
    await page.locator('#export-btn').click();
    const html=await download('#export-html');assert.match(html.text,/167\.50/);assert.ok(html.text.includes(se));assert.match(html.text,/Source trail/);assert.match(html.text,/Selected-point time intervals/);
    const csv=await download('#export-csv');const rows=csv.text.trim().split(/\r?\n/);assert.equal(rows.length,31);assert.ok(rows[0].includes('record_type'));assert.ok(rows[0].includes('selected'));assert.ok(rows.some(row=>row.includes('"sample","ridge-6"')&&row.includes(`"${se}","true"`)));
    const printed=await context.newPage();await printed.setContent(html.text);await printed.emulateMedia({media:'print'});assert.ok(await printed.locator('h1').isVisible());assert.equal(await printed.locator('button').isVisible(),false);await printed.close();
    await page.locator('[data-close="export-dialog"]').click();
  });
  await test('M01: pending edits cannot be exported or shared and do not replace the applied point/result',async()=>{
    await go({patch:se});const before=await json(),url=page.url(),value=await metric(page);
    await page.locator('#preset-buttons [data-preset="short"]').click();assert.ok(await page.locator('#pending-note').isVisible());
    for(const id of ['export-btn','save-brief','share-point'])assert.equal(await page.locator('#'+id).isDisabled(),true,id);
    assert.equal(page.url(),url);assert.equal(await selected(page),se);close(await metric(page),value);
    await page.locator('#analyze-btn').click();assert.equal(await selected(page),se);
    const after=await json();assert.equal(after.settings.durationHours,72);assert.equal(after.settings.maxDarkHours,12);assert.equal(before.settings.durationHours,168);
    assert.equal(after.selectedPoint.id,se);assert.equal(new URL(after.shareURL).searchParams.get('durationHours'),'72');
  });
  await test('M01: the copy-link fallback restores the selected point in a separate page',async()=>{
    await go({patch:se});
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('Test denied permission'))}}));
    await page.locator('#share-point').click();await page.waitForSelector('#share-dialog[open]');
    const link=await page.locator('#share-link').inputValue();assert.equal(new URL(link).searchParams.get('patch'),se);
    const restored=await context.newPage();captureErrors(restored);await restored.goto(link);await ready(restored);assert.equal(await selected(restored),se);close(await metric(restored),167.5,.1);await restored.close();
    await page.locator('[data-close="share-dialog"]').click();
  });
  await test('M02: north/south/east/west and all map edges follow physical coordinates in both languages',async()=>{
    await go();
    for(const language of ['en','zh-CN']){
      if(await page.locator('html').getAttribute('lang')!==language)await page.locator('#lang-toggle').click();
      for(const [key,id] of Object.entries({ArrowUp:'e+0-n+25',ArrowDown:'e+0-n-25',ArrowLeft:'e-25-n+0',ArrowRight:'e+25-n+0'})){
        await choose(center);await page.locator('#terrain-canvas').focus();await page.keyboard.press(key);assert.equal(await selected(page),id);
        assert.equal(await page.evaluate(()=>document.activeElement.id),'terrain-canvas');
        close(await metric(page),reference.patchStats.scenarios.find(p=>p.id===id).metrics.longestDarkHours);
      }
      for(const patch of site.patches){
        const keys=[];if(patch.dxM===25)keys.push('ArrowRight');if(patch.dxM===-25)keys.push('ArrowLeft');if(patch.dyM===25)keys.push('ArrowUp');if(patch.dyM===-25)keys.push('ArrowDown');
        for(const key of keys){await choose(patch.id);await page.locator('#terrain-canvas').focus();await page.keyboard.press(key);assert.equal(await selected(page),patch.id);}
      }
    }
    if(await page.locator('html').getAttribute('lang')!=='en')await page.locator('#lang-toggle').click();
  });
  await test('M03: earliest window ranks ROI 1 by visible footprint margins and adopts its exact conditions',async()=>{
    await go();await page.locator('#find-window').click();await page.waitForSelector('#search-results:not([hidden])',{timeout:45000});
    const choices=page.locator('#search-results button[data-start]');assert.equal(await choices.first().getAttribute('data-site'),'ridge-1');
    assert.equal(Date.parse(await choices.first().getAttribute('data-start')),Date.parse('2027-06-21T12:00:00Z'));
    assert.match(await page.locator('#search-results').innerText(),/margin|余量/i);
    await choices.first().click();assert.equal(await selected(page),center);const doc=await json();assert.equal(doc.selectedSiteId,'ridge-1');
    const current=doc.results.find(r=>r.siteId==='ridge-1');assert.equal(current.patchStats.feasibleCount,9);close(current.patchStats.worstCase.minimumMarginHours,5.475419929877386,1e-8);
    assert.equal(doc.stressTest.levels.length,4);assert.equal(doc.stressTest.levels[0].clearanceDeg,doc.settings.clearanceDeg);
    await page.locator('#robustness-details > summary').click();assert.match(await page.locator('#robustness-body').innerText(),/0\.02|0\.020/);
  });
  await test('M08: Chinese exports preserve values, reasons, intervals and sources',async()=>{
    await go({patch:se});if(await page.locator('html').getAttribute('lang')!=='zh-CN')await page.locator('#lang-toggle').click();
    await page.locator('#export-btn').click();const html=await download('#export-html');assert.match(html.text,/<html lang="zh-CN"/);assert.ok(html.text.includes('当前点的时间区间'));assert.ok(html.text.includes('数据来源'));assert.ok(html.text.includes('东南'));assert.ok(html.text.includes('167.50'));assert.ok(html.text.includes('共同可见'));
    await page.locator('[data-close="export-dialog"]').click();
    await page.locator('#detail-charts > summary').click();await page.waitForTimeout(120);
    assert.match(await page.locator('#horizon-readout').innerText(),/太阳余量/);
    assert.equal(await page.locator('#time-slider').getAttribute('aria-label'),'查看任务时间');
    assert.equal(await page.locator('#point-selector').getAttribute('aria-label'),'九个落点取样位置');
    assert.equal(await page.locator('#site-tabs').getAttribute('aria-label'),'选择研究地点');
    assert.match(await page.locator('.timeline-track').first().getAttribute('aria-label'),/小时可见/);
  });
  await test('M08: desktop and 390/330 pixel layouts keep key actions and results in bounds',async()=>{
    for(const width of [1440,390,330]){
      await page.setViewportSize({width,height:900});await go({patch:se});await page.waitForTimeout(200);
      for(const language of ['en','zh-CN']){
        if(await page.locator('html').getAttribute('lang')!==language)await page.locator('#lang-toggle').click();
        const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,controls:['#share-point','#save-brief','#find-window','#analyze-btn',...Array.from({length:9},(_,i)=>`#point-selector button:nth-child(${i+1})`)].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {selector,left:r.left,right:r.right,width:r.width,height:r.height};})}));
        assert.ok(bounds.scroll<=width+1,JSON.stringify(bounds));assert.ok(bounds.controls.every(r=>r.left>=-1&&r.right<=width+1&&r.width>=28&&r.height>=28),JSON.stringify(bounds));
        await page.screenshot({path:path.join(output,`${width}-${language}.png`)});
      }
    }
  });
  await test('M08: no application exceptions or missing local resources',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(resourceErrors,[]);});
}catch(error){
  records.push({name:currentTest,status:'FAIL',error:error.stack||String(error)});console.error(error);
  if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});
}finally{
  if(browser)await browser.close();if(server)server.kill();
  const report={startedAt,finishedAt:new Date().toISOString(),base,faultInjection:fault,fontMode:'system fallback (font CDN isolated)',passed:records.filter(r=>r.status==='PASS').length,failed:records.filter(r=>r.status==='FAIL').length,errors,resourceErrors,records};
  await writeFile(path.join(output,fault?'fault-probe.json':'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,faultInjection:fault}));
  process.exitCode=report.failed?1:0;
}
