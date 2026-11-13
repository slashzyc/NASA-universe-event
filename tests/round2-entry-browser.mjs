/** R02: follow the real built homepage into the navigator, saved evidence,
 * and a fresh browser context. Run `node scripts/build.mjs` first.
 * LUNAMARGIN_ENTRY_FAULT=drop-entry-patch removes the selected point only in
 * the browser's test response, to prove the entry regression blocks this gate.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium} from 'playwright';
import {analyzeSite} from '../src/analysis.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const built=path.join(root,'dist');
const output=path.join(root,'test-results/round2-entry');
await mkdir(output,{recursive:true});
const port=process.env.BROWSER_TEST_PORT||'4194';
const origin=(process.env.LUNAMARGIN_URL||`http://127.0.0.1:${port}/`).replace(/\/?$/,'/');
const fault=process.env.LUNAMARGIN_ENTRY_FAULT||null;
assert.ok(!fault||fault==='drop-entry-patch','Unknown entry fault');
const settings={start:'2027-06-02T06:00:00Z',durationHours:168,maxDarkHours:24,maxCommGapHours:24,minJointHours:24,clearanceDeg:0,observerHeightM:2};
const bundleBytes=await readFile(path.join(built,'data/lunar-sites-june.json'));
const bundle=JSON.parse(bundleBytes);
const site=bundle.sites.find(item=>item.id==='ridge-6');
const reference=analyzeSite(site,settings);
const center='e+0-n+0',southeast='e+25-n-25';
const records=[],errors=[],resourceErrors=[],transitions=[],startedAt=new Date().toISOString();
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const metricKeys=['sunHours','earthHours','jointHours','longestDarkHours','longestCommGapHours'];
let browser,context,page,server,currentTest='setup';
const patchResult=id=>reference.patchStats.scenarios.find(item=>item.id===id);
const chosen=p=>p.locator('#point-selector [aria-pressed="true"]').getAttribute('data-patch');
const homeChosen=p=>p.locator('#sampling-grid [aria-pressed="true"]').getAttribute('data-patch');
const near=(a,b,tolerance=.11)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const capture=p=>{
  p.on('pageerror',error=>errors.push(error.message));
  p.on('response',response=>{if(response.status()>=400&&response.url().startsWith(origin))resourceErrors.push(`${response.status()} ${response.url()}`);});
};
async function makeContext(locale='en-US'){
  const c=await browser.newContext({viewport:{width:1440,height:1000},locale,reducedMotion:'reduce',acceptDownloads:true});
  await c.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  if(fault)await c.route('**/src/landing.js',async route=>{
    const response=await route.fetch(),text=await response.text();
    const seam="$('inspect-case').href=`navigator.html?${parameters}`;";
    assert.ok(text.includes(seam),'Entry fault seam changed');
    await route.fulfill({response,body:text.replace(seam,`parameters.delete('patch');${seam}`)});
  });
  return c;
}
async function ready(p=page){await p.waitForSelector('#app:not([hidden])');await p.waitForFunction(()=>document.querySelectorAll('#point-selector button').length===9);}
async function home(){await page.goto(origin);await page.waitForFunction(()=>document.querySelectorAll('#sampling-grid button').length===9);}
async function homeLanguage(language){if(await page.locator('html').getAttribute('lang')!==language)await page.locator('#language').click();}
async function download(selector){const pending=page.waitForEvent('download');await page.locator(selector).click();return readFile(await (await pending).path(),'utf8');}
async function evidence(){await page.locator('#export-btn').click();const value=JSON.parse(await download('#export-json'));await page.locator('[data-close="export-dialog"]').click();return value;}
async function test(name,run){currentTest=name;const start=Date.now();await run();records.push({name,status:'PASS',durationMs:Date.now()-start});console.log('PASS '+name);}
function verifyEntry(url,id,language){
  assert.equal(url.searchParams.get('campaign'),'jun');assert.equal(url.searchParams.get('site'),site.id);
  assert.equal(url.searchParams.get('patch'),id,'Homepage entry must carry the selected point');
  assert.equal(url.searchParams.get('lang'),language==='zh-CN'?'zh':'en');
  for(const[key,value]of Object.entries(settings))assert.equal(url.searchParams.get(key),String(value),key);
}

try{
  if(!process.env.LUNAMARGIN_URL){
    server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:port,LUNAMARGIN_SERVE_ROOT:'dist'},windowsHide:true,stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Build preview failed to start')),10000);server.stdout.on('data',chunk=>{if(String(chunk).includes('LunaMargin running')){clearTimeout(timer);resolve();}});server.once('error',reject);server.once('exit',code=>reject(new Error(`Build preview exited ${code}`)));});
  }
  const executable=process.env.BROWSER_EXECUTABLE||(!process.env.CI&&process.platform==='win32'?['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync):undefined);
  browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{}),args:['--no-proxy-server']});
  context=await makeContext();page=await context.newPage();page.setDefaultTimeout(20000);capture(page);
  await test('R02: the browser receives the built artifact, not the source service',async()=>{
    for(const file of ['index.html','navigator.html','src/landing.js','src/analysis.js']){
      const response=await context.request.get(new URL(file,origin).href);assert.equal(response.status(),200,file);
      assert.equal(digest(await response.body()),digest(await readFile(path.join(built,file))),file);
    }
    assert.equal((await context.request.get(new URL('scripts/serve.mjs',origin).href)).status(),404,'Source files must not be served by the build preview');
  });
  await test('R02: all nine homepage positions retain their case and language across eighteen entries',async()=>{
    for(const language of ['en','zh-CN'])for(const patch of site.patches){
      await home();await homeLanguage(language);await page.locator(`#sampling-grid [data-patch="${patch.id}"]`).click();
      near(Number(await page.locator('#dark-hours').innerText()),patchResult(patch.id).metrics.longestDarkHours,.011);
      const entry=new URL(await page.locator('#inspect-case').getAttribute('href'),origin);verifyEntry(entry,patch.id,language);
      await page.locator('#inspect-case').click();await ready();assert.equal(await chosen(page),patch.id);assert.equal(await page.locator('html').getAttribute('lang'),language);
      near(Number.parseFloat(await page.locator('#metrics .metric-value').first().innerText()),patchResult(patch.id).metrics.longestDarkHours);
      transitions.push({patch:patch.id,language,darknessHours:patchResult(patch.id).metrics.longestDarkHours,status:'PASS'});
    }
  });
  await test('R02: language switching preserves the southeast case through save and a fresh-context restore',async()=>{
    await home();await page.locator(`#sampling-grid [data-patch="${southeast}"]`).click();
    await page.locator('#language').click();assert.equal(await homeChosen(page),southeast);
    await homeLanguage('zh-CN');verifyEntry(new URL(await page.locator('#inspect-case').getAttribute('href'),origin),southeast,'zh-CN');
    await page.locator('#inspect-case').click();await ready();
    const doc=await evidence();assert.equal(doc.selectedPoint.id,southeast);assert.equal(doc.selectedPoint.siteId,site.id);
    assert.equal(doc.language,'zh');for(const[key,value]of Object.entries(settings))assert.equal(doc.settings[key],value,key);
    for(const metric of metricKeys)near(doc.selectedPoint.result.metrics[metric],patchResult(southeast).metrics[metric],1e-8);
    assert.deepEqual(doc.selectedPoint.result.reasons.map(r=>r.code).sort(),['dark-gap','joint-shortfall']);
    const html=await download('#save-brief');assert.ok(html.includes('东南')&&html.includes(southeast)&&html.includes('167.501'));
    const fresh=await makeContext('en-US');const restored=await fresh.newPage();capture(restored);
    await restored.goto(doc.shareURL);await ready(restored);assert.equal(await chosen(restored),southeast);assert.equal(await restored.locator('html').getAttribute('lang'),'zh-CN');
    near(Number.parseFloat(await restored.locator('#metrics .metric-value').first().innerText()),167.501,.11);await fresh.close();
  });
  await test('R02: browser Back and reload keep the chosen homepage point without redirecting',async()=>{
    await home();await page.locator(`#sampling-grid [data-patch="${southeast}"]`).click();await homeLanguage('zh-CN');
    await page.locator('#inspect-case').click();await ready();await page.goBack();await page.waitForFunction(()=>document.querySelectorAll('#sampling-grid button').length===9);
    assert.equal(await homeChosen(page),southeast);assert.equal(new URL(page.url()).pathname,new URL(origin).pathname);assert.equal(new URL(page.url()).search,'');
    await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#sampling-grid button').length===9);assert.equal(await homeChosen(page),southeast);
    verifyEntry(new URL(await page.locator('#inspect-case').getAttribute('href'),origin),southeast,'zh-CN');
    const separate=await context.newPage();capture(separate);await separate.goto(origin);await separate.waitForFunction(()=>document.querySelectorAll('#sampling-grid button').length===9);assert.equal(await homeChosen(separate),center);await separate.close();
  });
  await test('R02: legacy links and invalid point identifiers retain the documented center fallback',async()=>{
    const params=new URLSearchParams({campaign:'jun',site:site.id,...settings,lang:'en'});
    await page.goto(origin+'?'+params);await ready();assert.ok(new URL(page.url()).pathname.endsWith('/navigator.html'));assert.equal(await chosen(page),center);
    params.set('patch','not-a-sample');await page.goto(new URL('navigator.html?'+params,origin).href);await ready();assert.equal(await chosen(page),center);
    const doc=await evidence();assert.equal(doc.settings.observerHeightM,2);near(doc.selectedPoint.result.metrics.longestDarkHours,patchResult(center).metrics.longestDarkHours,1e-8);
  });
  await test('R02: the selected-case entry remains visible and usable on narrow screens',async()=>{
    for(const width of [390,330]){
      await page.setViewportSize({width,height:900});await home();await homeLanguage('zh-CN');await page.locator(`#sampling-grid [data-patch="${southeast}"]`).click();
      await page.locator('#inspect-case').scrollIntoViewIfNeeded();
      const bounds=await page.locator('#inspect-case').boundingBox();assert.ok(bounds&&bounds.x>=-1&&bounds.x+bounds.width<=width+1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(output,`entry-${width}-zh.png`)});
      await page.locator('#inspect-case').click();await ready();assert.equal(await chosen(page),southeast);
    }
  });
  await test('R02: the built entry, export and restoration flows have no application or resource failures',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(resourceErrors,[]);});
}catch(error){
  records.push({name:currentTest,status:'FAIL',error:error.stack||String(error)});console.error(error);
  if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});
}finally{
  if(browser)await browser.close();if(server)server.kill();
  const report={startedAt,finishedAt:new Date().toISOString(),origin,servedDirectory:'dist',datasetSha256:digest(bundleBytes),faultInjection:fault,fontMode:'system fallback (font CDN isolated)',passed:records.filter(r=>r.status==='PASS').length,failed:records.filter(r=>r.status==='FAIL').length,transitions,errors,resourceErrors,records};
  await writeFile(path.join(output,fault?'fault-probe.json':'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,faultInjection:fault}));process.exitCode=report.failed?1:0;
}
