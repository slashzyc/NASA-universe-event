// AI-assisted browser regression checks. Uses an installed browser; downloads none.
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
if(!playwright)throw new Error('Use an installed Playwright package via PLAYWRIGHT_MODULE. No browser is downloaded by this test.');
const executablePath=process.env.BROWSER_EXECUTABLE||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port=process.env.BROWSER_TEST_PORT||'4184';
const base=process.env.LUNAMARGIN_URL||`http://127.0.0.1:${port}/`;
const screenshots=path.join(root,'docs/screenshots');
await mkdir(screenshots,{recursive:true});
let server,browser;
const records=[],pageErrors=[],consoleErrors=[];
const startedAt=new Date().toISOString();
const url=(params='')=>`${base.replace(/\/$/,'')}/?${params}`;

async function test(name,fn){
  const started=Date.now();
  try{await fn();records.push({name,status:'PASS',durationMs:Date.now()-started});console.log(`PASS ${name}`);}
  catch(error){records.push({name,status:'FAIL',durationMs:Date.now()-started,error:error.stack||String(error)});console.log(`FAIL ${name}: ${error.message}`);if(globalThis.qaPage)await globalThis.qaPage.screenshot({path:path.join(screenshots,`failure-${records.length}.png`),fullPage:true}).catch(()=>{});}
  finally{if(globalThis.qaPage)await globalThis.qaPage.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())).catch(()=>{});}
}
const ready=async p=>{await p.waitForSelector('#app:not([hidden])');await p.waitForFunction(()=>document.querySelectorAll('#comparison-body tr').length===3);};
const range=async(p,id,value)=>{await p.locator(id).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));},value);};
async function scenario(p){
  await p.goto(url('campaign=jun&site=ridge-6&start=2027-06-02T06%3A00%3A00Z&durationHours=168&maxDarkHours=24&maxCommGapHours=24&minJointHours=24&clearanceDeg=0'));
  await ready(p);
}
async function downloadJson(p){
  await p.locator('#export-btn').click();const pending=p.waitForEvent('download');await p.locator('#export-json').click();
  const download=await pending;const data=JSON.parse(await readFile(await download.path(),'utf8'));await p.locator('[data-close="export-dialog"]').click();return data;
}
try{
  if(!process.env.LUNAMARGIN_URL){
    server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:port},windowsHide:true,stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Preview server did not start')),10000);server.stdout.on('data',chunk=>{if(String(chunk).includes('LunaMargin running')){clearTimeout(timer);resolve();}});server.once('error',reject);server.once('exit',code=>reject(new Error(`Preview server exited ${code}`)));});
  }
  browser=await playwright.chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-proxy-server']});
  const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true,reducedMotion:'reduce'});
  const p=await context.newPage();globalThis.qaPage=p;
  p.on('pageerror',e=>pageErrors.push(e.message));p.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  await test('loads three research sites and real data canvases',async()=>{
    await p.goto(base);await ready(p);assert.equal(await p.locator('#site-tabs button').count(),3);assert.equal(await p.locator('#metrics .metric').count(),4);
    assert.match(await p.locator('#footprint-label').innerText(),/9/);assert.match(await p.locator('#sample-resolution').innerText(),/30/);
    const drawn=await p.locator('#terrain-canvas').evaluate(e=>e.width>0&&e.height>0&&e.getContext('2d').getImageData(30,30,1,1).data[3]===255);assert.ok(drawn);
  });
  await test('all three site tabs update title and URL',async()=>{
    for(const id of ['ridge-1','ridge-4','ridge-6']){await p.locator(`#site-tabs [data-site="${id}"]`).click();assert.equal(new URL(p.url()).searchParams.get('site'),id);assert.equal(await p.locator(`#site-tabs [data-site="${id}"]`).getAttribute('aria-pressed'),'true');assert.match(await p.locator('#selected-title').innerText(),new RegExp(id.slice(-1)));}
  });
  await test('December March and June campaigns load their own time coverage',async()=>{
    for(const [key,date]of [['dec','2026-12-01'],['mar','2027-03-01'],['jun','2027-06-01']]){await p.locator('#campaign').selectOption(key);await p.waitForFunction(([k,d])=>document.querySelector('#start-date').value===d&&new URL(location).searchParams.get('campaign')===k,[key,date]);assert.match(await p.locator('#time-label').innerText(),new RegExp(date));}
  });
  await test('date duration and ranges produce the requested evidence settings',async()=>{
    await scenario(p);await p.locator('#duration').selectOption('24');await range(p,'#joint-limit',100);assert.equal(await p.locator('#joint-limit').inputValue(),'24');
    await p.locator('#start-date').fill('2027-06-04');await p.locator('#start-hour').selectOption('12');await range(p,'#dark-limit',15);await range(p,'#comm-limit',20);await range(p,'#joint-limit',10);await p.locator('#analyze-btn').click();
    const evidence=await downloadJson(p);assert.equal(evidence.settings.start,'2027-06-04T12:00:00Z');assert.equal(evidence.settings.durationHours,24);assert.equal(evidence.settings.maxDarkHours,15);assert.equal(evidence.settings.maxCommGapHours,20);assert.equal(evidence.settings.minJointHours,10);assert.equal(evidence.results.length,3);
  });
  await test('nine magnified footprint points are clickable and update horizon context',async()=>{
    await scenario(p);const box=await p.locator('#terrain-canvas').boundingBox();assert.ok(box);
    const size=box.width<500?118:148,left=box.width-size-24,top=61,span=size-44,cx=left+size/2,cy=top+size/2+7;
    for(const north of [25,0,-25])for(const east of [-25,0,25]){await p.mouse.click(box.x+cx+east/50*span,box.y+cy-north/50*span);const expected=`${east>=0?'+':''}${east} m E, ${north>=0?'+':''}${north} m N`;assert.ok((await p.locator('#horizon-readout').innerText()).includes(expected),expected);}
    await p.screenshot({path:path.join(screenshots,'desktop-footprint.png'),fullPage:true});
  });
  await test('terrain keyboard and timeline slider change the inspected state',async()=>{
    await p.locator('#terrain-canvas').focus();const before=await p.locator('#horizon-readout').innerText();await p.keyboard.press('ArrowRight');assert.notEqual(await p.locator('#horizon-readout').innerText(),before);
    const time=await p.locator('#time-label').innerText();await p.locator('#time-slider').focus();await p.keyboard.press('ArrowRight');assert.notEqual(await p.locator('#time-label').innerText(),time);
  });
  await test('worker search completes and a returned window can be applied',async()=>{
    await scenario(p);await p.locator('#find-window').click();await p.waitForSelector('#search-results:not([hidden])',{timeout:30000});assert.equal(await p.locator('#find-window').isDisabled(),false);assert.ok((await p.locator('#search-results').innerText()).includes('Checked'));
    const buttons=p.locator('#search-results button');assert.ok(await buttons.count()>0,'known June scenario should have a later all-point window');const nextDate=await buttons.first().getAttribute('data-start');await buttons.first().click();assert.equal(await p.locator('#start-date').inputValue(),nextDate.slice(0,10));
  });
  await test('language switch translates primary content and persists across reload',async()=>{
    await p.locator('#lang-toggle').click();assert.equal(await p.locator('html').getAttribute('lang'),'zh-CN');assert.ok((await p.locator('#selected-title').innerText()).includes('连接脊'));assert.ok((await p.locator('#metrics').innerText()).includes('最长连续断光'));await p.reload();await ready(p);assert.equal(await p.locator('html').getAttribute('lang'),'zh-CN');await p.locator('#lang-toggle').click();
  });
  await test('science modal opens closes and links to existing local evidence',async()=>{
    await p.locator('#method-open').click();assert.equal(await p.locator('#method-dialog').evaluate(e=>e.open),true);const hrefs=await p.locator('#method-dialog a').evaluateAll(list=>list.map(e=>e.getAttribute('href')).filter(h=>h&&!/^https?:/.test(h)));for(const href of hrefs){const response=await fetch(new URL(href,base));assert.ok(response.ok,`${href}: ${response.status}`);}await p.keyboard.press('Escape');assert.equal(await p.locator('#method-dialog').evaluate(e=>e.open),false);
  });
  await test('four-step guided tour finishes',async()=>{
    await p.locator('#tour-start').click();for(let i=1;i<=4;i++){assert.ok((await p.locator('#tour-step').innerText()).includes(`${i} OF 4`));await p.locator('#tour-next').click();}assert.equal(await p.locator('#tour-dialog').evaluate(e=>e.open),false);
  });
  await test('shared URL restores the mission and selected site',async()=>{
    await scenario(p);const saved=p.url(),evidence=await downloadJson(p);await p.goto(base);await ready(p);await p.goto(saved);await ready(p);assert.deepEqual((await downloadJson(p)).settings,evidence.settings);assert.equal(new URL(p.url()).searchParams.get('site'),'ridge-6');
  });
  await test('standalone HTML and CSV exports contain the actual scenario',async()=>{
    await scenario(p);await p.locator('#export-btn').click();
    for(const [selector,extension,expected] of [['#export-html','.html','2027-06-02'],['#export-csv','.csv','ridge-6']]){const pending=p.waitForEvent('download');await p.locator(selector).click();const d=await pending;assert.ok(d.suggestedFilename().endsWith(extension));const text=await readFile(await d.path(),'utf8');assert.ok(text.includes(expected));if(extension==='.html')assert.ok(text.includes('Source trail'));else assert.ok(text.split('\n').length===4);}
    await p.locator('[data-close="export-dialog"]').click();
  });
  await test('search after unsaved form changes keeps displayed and exported results consistent',async()=>{
    await scenario(p);await range(p,'#dark-limit',0);await p.locator('#find-window').click();await p.waitForSelector('#search-results:not([hidden])',{timeout:30000});const evidence=await downloadJson(p);const center=evidence.results.find(r=>r.siteId==='ridge-6');assert.ok(evidence.settings.maxDarkHours!==0||!center.centerFeasible,'export reports a zero darkness limit with a passing center that has >12 h darkness');
  });
  await test('380px phone layout has no page overflow or overlapping mission controls',async()=>{
    await scenario(p);await p.setViewportSize({width:380,height:844});await p.waitForTimeout(250);await p.screenshot({path:path.join(screenshots,'phone-380.png'),fullPage:true});
    const layout=await p.evaluate(()=>{const ids=['campaign','start-date','start-hour','duration','dark-limit','comm-limit','joint-limit','analyze-btn','find-window'];const rects=ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return{id,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};});const overlaps=[];for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>2)overlaps.push([a.id,b.id]);}return{pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,overlaps,rects};});assert.ok(layout.pageWidth<=layout.viewport+1,JSON.stringify(layout));assert.deepEqual(layout.overlaps,[],JSON.stringify(layout));
    await p.locator('#campaign').selectOption('mar');await p.waitForFunction(()=>new URL(location).searchParams.get('campaign')==='mar');await p.locator('#sources-open').click();assert.equal(await p.locator('#method-dialog').evaluate(e=>e.open),true);await p.locator('[data-close="method-dialog"]').click();
  });
  await test('no uncaught browser errors',async()=>{assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);});
  await p.setViewportSize({width:1440,height:1050});await scenario(p);await p.screenshot({path:path.join(screenshots,'desktop.png'),fullPage:true});
  await context.close();
}catch(error){records.push({name:'test infrastructure',status:'FAIL',error:error.stack||String(error)});console.error(error);}
finally{
  if(browser)await browser.close();if(server)server.kill();
  const report={startedAt,finishedAt:new Date().toISOString(),base,environment:{node:process.version,browserExecutable:executablePath||'Playwright configured browser',viewport:[1440,1050],phoneViewport:[380,844]},passed:records.filter(r=>r.status==='PASS').length,failed:records.filter(r=>r.status==='FAIL').length,pageErrors,consoleErrors,records};
  await writeFile(path.join(root,'docs/browser-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed}));process.exitCode=report.failed?1:0;
}
