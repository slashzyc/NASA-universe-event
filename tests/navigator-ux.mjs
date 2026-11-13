// End-to-end verification of the beginner navigator. Uses an installed browser only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
let playwright;
for(const candidate of [process.env.PLAYWRIGHT_MODULE,'playwright','C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1111-574-0_26.1111.574.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright'].filter(Boolean)){
  try{playwright=require(candidate);break;}catch{}
}
if(!playwright)throw new Error('Set PLAYWRIGHT_MODULE to an installed Playwright package.');
const executablePath=process.env.BROWSER_EXECUTABLE||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port=process.env.BROWSER_TEST_PORT||'4187';
const origin=process.env.LUNAMARGIN_URL||`http://127.0.0.1:${port}/`;
const base=/\.html(?:[?#]|$)/.test(origin)?origin:new URL('navigator.html',origin.replace(/\/?$/,'/')).href;
const screenshotDirectory=path.join(root,'docs/screenshots');
const failureDirectory=path.join(root,'tmp/navigator-ux-failures');
await mkdir(screenshotDirectory,{recursive:true});
await mkdir(failureDirectory,{recursive:true});
const startedAt=new Date().toISOString(),records=[],pageErrors=[],consoleErrors=[],failedResources=[];
const defaultQuery='campaign=jun&site=ridge-6&start=2027-06-02T06%3A00%3A00Z&durationHours=168&maxDarkHours=24&maxCommGapHours=24&minJointHours=24&clearanceDeg=0';
const centerPatch='e+0-n+0',southeastPatch='e+25-n-25';
const june=JSON.parse(await readFile(path.join(root,'data/lunar-sites-june.json'),'utf8'));
const patches=june.sites.find(site=>site.id==='ridge-6').patches.map(({id,dxM,dyM})=>({id,dxM,dyM}));
let server,browser,p;

function scenarioURL(query=defaultQuery){const target=new URL(base);target.search=query;return target.href;}
async function ready(){await p.waitForSelector('#app:not([hidden])');await p.waitForFunction(()=>document.querySelectorAll('#comparison-body tr').length===3&&document.querySelectorAll('#point-selector button').length===9);}
async function scenario(){await p.goto(scenarioURL());await ready();}
async function openDetails(selector){const details=p.locator(selector);if(!await details.evaluate(e=>e.open))await details.locator('summary').first().click();await p.waitForTimeout(150);}
async function reveal(selector){const parents=await p.locator(selector).evaluate(e=>{const ids=[];for(let n=e.parentElement;n;n=n.parentElement)if(n.tagName==='DETAILS'&&!n.open){if(!n.id)throw new Error('A tested control needs a stable details ID');ids.unshift(n.id);}return ids;});for(const id of parents)await openDetails('#'+id);}
async function setRange(selector,value){await reveal(selector);await p.locator(selector).evaluate((e,next)=>{e.value=String(next);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},value);}
async function exportJSON(){await reveal('#export-btn');await p.locator('#export-btn').click();const pending=p.waitForEvent('download');await p.locator('#export-json').click();const download=await pending;const doc=JSON.parse(await readFile(await download.path(),'utf8'));await p.locator('[data-close="export-dialog"]').click();return doc;}
async function activePatch(){return p.locator('#point-selector [aria-pressed="true"]').getAttribute('data-patch');}
async function darkness(){return Number.parseFloat(await p.locator('#metrics .metric').first().locator('.metric-value').innerText());}
async function screenshot(name,fullPage=true){await p.screenshot({path:path.join(screenshotDirectory,`navigator-ux-${name}.png`),fullPage});}
async function test(name,run){const started=Date.now();try{const detail=await run();records.push({name,status:'PASS',durationMs:Date.now()-started,...(detail?{detail}:{})});console.log('PASS '+name);}catch(error){records.push({name,status:'FAIL',durationMs:Date.now()-started,error:error.stack||String(error)});console.log(`FAIL ${name}: ${error.message}`);await p?.screenshot({path:path.join(failureDirectory,`failure-${records.length}.png`),fullPage:true}).catch(()=>{});}finally{await p?.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())).catch(()=>{});}}

try{
  if(!process.env.LUNAMARGIN_URL){
    server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:port},windowsHide:true,stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Local preview did not start')),10000);server.stdout.on('data',chunk=>{if(String(chunk).includes('LunaMargin running')){clearTimeout(timer);resolve();}});server.once('error',reject);});
  }
  browser=await playwright.chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-proxy-server']});
  const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true,reducedMotion:'reduce',locale:'en-US'});
  p=await context.newPage();p.on('pageerror',error=>pageErrors.push(error.message));p.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});p.on('response',response=>{if(response.status()>=400&&new URL(response.url()).origin===new URL(base).origin)failedResources.push({url:response.url(),status:response.status()});});

  await test('first visit presents a working example with optional details closed',async()=>{
    await scenario();assert.equal(await p.locator('#point-selector button').count(),9);assert.equal(await p.locator('#advanced-settings').evaluate(e=>e.open),false);assert.equal(await p.locator('#detail-charts').evaluate(e=>e.open),false);assert.ok(await p.locator('#pending-note').isHidden());assert.ok(Math.abs(await darkness()-12.45)<0.1);assert.equal(await activePatch(),centerPatch);assert.ok(await p.locator('#inspect-risk').isVisible());await screenshot('desktop');
  });
  await test('three-day preset stages readable changes and applies only on request',async()=>{
    await scenario();const original=await darkness();await p.locator('#preset-buttons [data-preset="short"]').click();assert.equal(await p.locator('#duration').inputValue(),'72');for(const selector of ['#dark-limit','#comm-limit','#joint-limit'])assert.equal(await p.locator(selector).inputValue(),'12');assert.ok(await p.locator('#pending-note').isVisible());assert.equal(await darkness(),original);assert.equal(new URL(p.url()).searchParams.get('durationHours'),'168');await p.locator('#analyze-btn').click();assert.ok(await p.locator('#pending-note').isHidden());const doc=await exportJSON();assert.equal(doc.settings.durationHours,72);assert.equal(doc.settings.maxDarkHours,12);assert.equal(doc.settings.maxCommGapHours,12);assert.equal(doc.settings.minJointHours,12);
  });
  await test('seven-day preset restores its documented limits',async()=>{
    await p.locator('#preset-buttons [data-preset="explorer"]').click();assert.equal(await p.locator('#duration').inputValue(),'168');for(const selector of ['#dark-limit','#comm-limit','#joint-limit'])assert.equal(await p.locator(selector).inputValue(),'24');assert.equal(await p.locator('#clearance').inputValue(),'0');assert.ok(await p.locator('#pending-note').isVisible());await p.locator('#analyze-btn').click();assert.ok(await p.locator('#pending-note').isHidden());assert.ok(Math.abs(await darkness()-12.45)<0.1);
  });
  await test('custom settings explain pending edits and export the applied scenario',async()=>{
    await scenario();await p.locator('#preset-buttons [data-preset="custom"]').click();assert.equal(await p.locator('#advanced-settings').evaluate(e=>e.open),true);await reveal('#duration');await p.locator('#duration').selectOption('24');await p.locator('#start-date').fill('2027-06-04');await p.locator('#start-hour').selectOption('12');await setRange('#dark-limit',15);await setRange('#comm-limit',20);await setRange('#joint-limit',10);await reveal('#clearance');await p.locator('#clearance').selectOption('0.25');assert.ok(await p.locator('#pending-note').isVisible());assert.match(await p.locator('#pending-note').innerText(),/apply|update|change|修改|更新|应用/i);await p.locator('#analyze-btn').click();assert.ok(await p.locator('#pending-note').isHidden());const doc=await exportJSON();assert.equal(doc.settings.start,'2027-06-04T12:00:00Z');assert.equal(doc.settings.durationHours,24);assert.equal(doc.settings.maxDarkHours,15);assert.equal(doc.settings.maxCommGapHours,20);assert.equal(doc.settings.minJointHours,10);assert.equal(doc.settings.clearanceDeg,0.25);
  });
  await test('one-click example resets the campaign, location, date, and all limits',async()=>{
    await reveal('#campaign');await p.locator('#campaign').selectOption('mar');await p.waitForFunction(()=>new URL(location).searchParams.get('campaign')==='mar');await p.locator('#site-tabs [data-site="ridge-1"]').click();await p.locator('#example-start').click();await p.waitForFunction(()=>new URL(location).searchParams.get('campaign')==='jun'&&document.getElementById('start-date').value==='2027-06-02');await ready();const doc=await exportJSON();assert.equal(doc.campaign,'jun');assert.equal(doc.selectedSiteId,'ridge-6');assert.equal(doc.settings.start,'2027-06-02T06:00:00Z');assert.equal(doc.settings.durationHours,168);assert.equal(doc.settings.maxDarkHours,24);assert.equal(doc.settings.maxCommGapHours,24);assert.equal(doc.settings.minJointHours,24);assert.equal(doc.settings.clearanceDeg,0);assert.ok(await p.locator('#pending-note').isHidden());assert.equal(await activePatch(),centerPatch);
  });
  await test('ROI selection updates the result immediately without another analyze action',async()=>{
    await scenario();const doc=await exportJSON();for(const id of ['ridge-1','ridge-4','ridge-6']){await p.locator(`#site-tabs [data-site="${id}"]`).click();assert.equal(new URL(p.url()).searchParams.get('site'),id);assert.equal(await p.locator(`#site-tabs [data-site="${id}"]`).getAttribute('aria-pressed'),'true');assert.ok(Math.abs(await darkness()-doc.results.find(r=>r.siteId===id).metrics.longestDarkHours)<0.1);assert.equal(await activePatch(),centerPatch);}
  });
  await test('all nine accessible point buttons match the computed evidence',async()=>{
    await scenario();const doc=await exportJSON(),expected=doc.results.find(r=>r.siteId==='ridge-6').patchStats.scenarios;for(const patch of patches){const button=p.locator(`#point-selector [data-patch="${patch.id}"]`);assert.ok((await button.getAttribute('aria-label')||await button.innerText()).trim().length>1);await button.click();assert.equal(await activePatch(),patch.id);assert.equal(await p.locator('#point-selector [aria-pressed="true"]').count(),1);assert.ok(Math.abs(await darkness()-expected.find(s=>s.id===patch.id).metrics.longestDarkHours)<0.1,patch.id);}
  });
  await test('canvas point selection stays synchronized with accessible point controls',async()=>{
    await scenario();await reveal('#terrain-canvas');await p.waitForTimeout(200);for(const patch of patches){await p.locator('#terrain-canvas').scrollIntoViewIfNeeded();const box=await p.locator('#terrain-canvas').boundingBox();assert.ok(box);const size=box.width<500?118:148,span=size-44,cx=box.width-size-24+size/2,cy=61+size/2+7;await p.mouse.click(box.x+cx+patch.dxM/50*span,box.y+cy-patch.dyM/50*span);assert.equal(await activePatch(),patch.id);}
  });
  await test('risk shortcut explains southeast darkness and center can be restored',async()=>{
    await scenario();await p.locator('#inspect-risk').click();assert.equal(await activePatch(),southeastPatch);assert.ok(Math.abs(await darkness()-167.5)<0.1);const doc=await exportJSON(),risk=doc.results.find(r=>r.siteId==='ridge-6').patchStats.scenarios.find(r=>r.id===southeastPatch),reasons=p.locator('#result-summary .result-reasons li');assert.equal(await reasons.count(),risk.reasons.length);assert.match(await p.locator('#result-summary .result-verdict').innerText(),new RegExp(String(risk.reasons.length)));for(let i=0;i<risk.reasons.length;i++){const actual=risk.reasons[i],text=await reasons.nth(i).innerText();assert.ok(text.includes(actual.actual.toFixed(1)),`${actual.code} actual value missing`);assert.ok(text.includes(String(actual.limit)),`${actual.code} threshold missing`);}await screenshot('southeast');await p.locator(`#point-selector [data-patch="${centerPatch}"]`).click();assert.ok(Math.abs(await darkness()-12.45)<0.1);assert.equal(await activePatch(),centerPatch);
  });
  await test('a later window can be found and adopted with complete evidence',async()=>{
    await scenario();await p.locator('#find-window').click();await p.waitForSelector('#search-results:not([hidden])',{timeout:30000});assert.equal(await p.locator('#find-window').isDisabled(),false);const choice=p.locator('#search-results button[data-start]').first();assert.ok(await choice.count());const start=await choice.getAttribute('data-start'),site=await choice.getAttribute('data-site');await choice.click();assert.equal(await p.locator('#start-date').inputValue(),start.slice(0,10));const doc=await exportJSON();assert.equal(Date.parse(doc.settings.start),Date.parse(start));assert.equal(doc.selectedSiteId,site);const result=doc.results.find(r=>r.siteId===site);assert.equal(result.centerFeasible,true);assert.equal(result.patchStats.feasibleCount,9);assert.ok(await p.locator('#pending-note').isHidden());
  });
  await test('changing conditions discards old search choices before searching again',async()=>{
    await scenario();await p.locator('#find-window').click();await p.waitForSelector('#search-results:not([hidden])',{timeout:30000});assert.ok(await p.locator('#search-results button[data-start]').count());await p.locator('#preset-buttons [data-preset="short"]').click();assert.ok(await p.locator('#search-results').isHidden());assert.equal(await p.locator('#find-window').isDisabled(),false);assert.ok(await p.locator('#pending-note').isVisible());await p.locator('#analyze-btn').click();await p.locator('#find-window').click();await p.waitForSelector('#search-results:not([hidden])',{timeout:30000});const choice=p.locator('#search-results button[data-start]').first();assert.ok(await choice.count());await choice.click();const doc=await exportJSON();assert.equal(doc.settings.durationHours,72);assert.equal(doc.settings.maxDarkHours,12);assert.equal(doc.settings.maxCommGapHours,12);assert.equal(doc.settings.minJointHours,12);assert.equal(doc.results.find(r=>r.siteId===doc.selectedSiteId).patchStats.feasibleCount,9);
  });
  await test('HTML and CSV exports keep the analyzed mission and source trail',async()=>{
    await scenario();await reveal('#export-btn');await p.locator('#export-btn').click();for(const [selector,extension,content]of [['#export-html','.html','Source trail'],['#export-csv','.csv','ridge-6']]){const pending=p.waitForEvent('download');await p.locator(selector).click();const download=await pending;assert.ok(download.suggestedFilename().endsWith(extension));const text=await readFile(await download.path(),'utf8');assert.ok(text.includes(content));assert.ok(text.includes('2027-06-02'));}
  });
  await test('a fresh Chinese browser receives a Chinese beginner interface',async()=>{
    const chinese=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN',reducedMotion:'reduce'}),fresh=await chinese.newPage();fresh.on('pageerror',error=>pageErrors.push(error.message));fresh.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});try{await fresh.goto(scenarioURL());await fresh.waitForSelector('#app:not([hidden])');assert.equal(await fresh.locator('html').getAttribute('lang'),'zh-CN');assert.match(await fresh.locator('#example-start').innerText(),/[\u4e00-\u9fff]/);assert.match(await fresh.locator('#result-summary').innerText(),/[\u4e00-\u9fff]/);}finally{await chinese.close();}
  });
  await test('language changes the new workflow and persists after reload',async()=>{
    await scenario();await p.locator('#lang-toggle').click();assert.equal(await p.locator('html').getAttribute('lang'),'zh-CN');for(const selector of ['#preset-buttons','#example-start','#inspect-risk','#point-selector'])assert.match(await p.locator(selector).innerText(),/[\u4e00-\u9fff]/);await p.locator('#preset-buttons [data-preset="short"]').click();assert.match(await p.locator('#pending-note').innerText(),/[\u4e00-\u9fff]/);await p.reload();await ready();assert.equal(await p.locator('html').getAttribute('lang'),'zh-CN');await screenshot('desktop-zh');await p.locator('#lang-toggle').click();
  });
  await test('opening closed chart details draws the horizon and supports time controls',async()=>{
    await scenario();assert.equal(await p.locator('#detail-charts').evaluate(e=>e.open),false);await openDetails('#detail-charts');const drawn=await p.locator('#horizon-canvas').evaluate(e=>{const r=e.getBoundingClientRect();if(r.width<100||e.width<100)return false;const pixels=e.getContext('2d').getImageData(0,0,e.width,e.height).data;let nonempty=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])nonempty++;return nonempty>100;});assert.ok(drawn);const before=await p.locator('#time-label').innerText();await p.locator('#time-slider').focus();await p.keyboard.press('ArrowRight');assert.notEqual(await p.locator('#time-label').innerText(),before);await p.locator('#detail-charts > summary').click();assert.equal(await p.locator('#detail-charts').evaluate(e=>e.open),false);await openDetails('#detail-charts');assert.ok(await p.locator('#horizon-canvas').isVisible());await screenshot('details');
  });
  await test('preset, point, and chart disclosure work with the keyboard',async()=>{
    await scenario();await p.locator('#preset-buttons [data-preset="short"]').focus();await p.keyboard.press('Enter');assert.ok(await p.locator('#pending-note').isVisible());await p.locator('#analyze-btn').focus();await p.keyboard.press('Enter');assert.equal(new URL(p.url()).searchParams.get('durationHours'),'72');await p.locator('#example-start').click();await p.locator(`#point-selector [data-patch="${southeastPatch}"]`).focus();await p.keyboard.press('Space');assert.equal(await activePatch(),southeastPatch);await p.locator('#detail-charts > summary').focus();await p.keyboard.press('Enter');assert.equal(await p.locator('#detail-charts').evaluate(e=>e.open),true);await p.locator('#terrain-canvas').focus();const before=await activePatch();await p.keyboard.press('ArrowRight');assert.equal(await activePatch(),before);await p.keyboard.press('ArrowLeft');assert.equal(await activePatch(),'e+0-n-25');
  });
  await test('1440, 390, and 330 pixel layouts fit in both languages',async()=>{
    const layouts=[];for(const width of [1440,390,330]){await p.setViewportSize({width,height:width===1440?1050:844});await scenario();await p.waitForTimeout(250);for(const language of ['en','zh-CN']){if(await p.locator('html').getAttribute('lang')!==language)await p.locator('#lang-toggle').click();const layout=await p.evaluate(()=>{const selectors=['#example-start','#preset-buttons button','#analyze-btn','#find-window','#point-selector button','#lang-toggle'];const controls=selectors.flatMap(selector=>[...document.querySelectorAll(selector)]).filter(e=>e.getBoundingClientRect().width>0).map(e=>{const r=e.getBoundingClientRect();return {id:e.id||e.dataset.preset||e.dataset.patch,left:r.left,right:r.right,width:r.width,height:r.height};});return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,controls};});assert.ok(layout.scrollWidth<=width+1,JSON.stringify(layout));assert.ok(layout.controls.every(r=>r.left>=-1&&r.right<=width+1),JSON.stringify(layout));assert.ok(layout.controls.every(r=>r.width>=28&&r.height>=28),'Interactive control too small');layouts.push({width,language,scrollWidth:layout.scrollWidth});await screenshot(`${width}-${language}`);}if(await p.locator('html').getAttribute('lang')!=='en')await p.locator('#lang-toggle').click();await p.locator('#preset-buttons [data-preset="custom"]').click();await openDetails('#detail-charts');assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}return layouts;
  });
  await test('the complete workflow produces no browser errors or missing assets',async()=>{assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(failedResources,[]);});
  await p.setViewportSize({width:1440,height:1000});await scenario();if(await p.locator('html').getAttribute('lang')!=='en')await p.locator('#lang-toggle').click();await p.waitForTimeout(250);await p.evaluate(()=>scrollTo(0,scrollY+document.getElementById('app').getBoundingClientRect().top-24));await p.screenshot({path:path.join(screenshotDirectory,'navigator-preview.png')});
  await context.close();
}catch(error){records.push({name:'test infrastructure',status:'FAIL',error:error.stack||String(error)});console.error(error);}
finally{
  if(browser)await browser.close();if(server)server.kill();
  const report={startedAt,finishedAt:new Date().toISOString(),base,environment:{node:process.version,browser:executablePath||'configured Chromium'},passed:records.filter(r=>r.status==='PASS').length,failed:records.filter(r=>r.status==='FAIL').length,pageErrors,consoleErrors,failedResources,records};
  await writeFile(path.join(root,'docs/navigator-ux-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed}));process.exitCode=report.failed?1:0;
}
