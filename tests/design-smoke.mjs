// Browser verification for the public editorial homepage and navigator handoff.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
let playwright;
for(const name of [process.env.PLAYWRIGHT_MODULE,'playwright','C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1111-574-0_26.1111.574.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright'].filter(Boolean)){
  try{playwright=require(name);break;}catch{}
}
if(!playwright)throw new Error('Set PLAYWRIGHT_MODULE to an installed Playwright package.');
const executablePath=process.env.BROWSER_EXECUTABLE||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port=process.env.BROWSER_TEST_PORT||'4186';
const base=(process.env.LUNAMARGIN_URL||`http://127.0.0.1:${port}/`).replace(/\/?$/,'/');
const screenshotDirectory=path.join(root,'docs/screenshots');
await mkdir(screenshotDirectory,{recursive:true});
const records=[],pageErrors=[],consoleErrors=[],failedRequests=[];
const startedAt=new Date().toISOString();
let server,browser,page;
async function test(name,run){
  try{await run();records.push({name,status:'PASS'});console.log(`PASS ${name}`);}
  catch(error){records.push({name,status:'FAIL',error:error.stack||String(error)});console.log(`FAIL ${name}: ${error.message}`);}
}
async function home(){await page.goto(base);await page.waitForFunction(()=>document.querySelectorAll('#sampling-grid button').length===9);await page.locator('.moon').evaluate(img=>img.decode());}
async function screenshots(prefix){
  for(const element of await page.locator('main section').all()){await element.scrollIntoViewIfNeeded();await page.waitForTimeout(120);}
  await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(300);
  await page.screenshot({path:path.join(screenshotDirectory,`${prefix}.png`)});
  await page.screenshot({path:path.join(screenshotDirectory,`${prefix}-full.png`),fullPage:true});
}
try{
  if(!process.env.LUNAMARGIN_URL){
    server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:port},windowsHide:true,stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Local preview did not start')),10000);server.stdout.on('data',chunk=>{if(String(chunk).includes('LunaMargin running')){clearTimeout(timer);resolve();}});server.once('error',reject);});
  }
  browser=await playwright.chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-proxy-server']});
  const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
  page=await context.newPage();
  page.on('pageerror',e=>pageErrors.push(e.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400&&response.url().startsWith(base))failedRequests.push({url:response.url(),status:response.status()});});
  await test('homepage loads real imagery and the nine-location demonstration',async()=>{
    await home();assert.equal(await page.locator('h1').count(),1);assert.ok((await page.locator('h1').innerText()).length>15);
    const image=await page.locator('.moon').evaluate(i=>({width:i.naturalWidth,height:i.naturalHeight}));assert.ok(image.width>=1000&&image.height>=1000);
    assert.ok(Number(await page.locator('#dark-hours').innerText())>0);assert.equal(await page.locator('#sampling-grid button').count(),9);
  });
  await test('all footprint positions update measured darkness and selected state',async()=>{
    const values=[];
    for(const button of await page.locator('#sampling-grid button').all()){await button.click();values.push(Number(await page.locator('#dark-hours').innerText()));}
    assert.ok(values.every(Number.isFinite));assert.ok(Math.max(...values)>160);assert.ok(Math.min(...values)<24);assert.ok(new Set(values).size>1);
  });
  await test('primary launch opens the working navigator and home brand returns',async()=>{
    await home();await page.locator('.hero-actions a[href="navigator.html"]').click();await page.waitForSelector('#app:not([hidden])');assert.ok(new URL(page.url()).pathname.endsWith('/navigator.html'));assert.equal(await page.locator('#comparison-body tr').count(),3);await page.locator('a.brand').click();await page.waitForSelector('#hero-title');assert.equal(new URL(page.url()).pathname,new URL(base).pathname);
  });
  await test('old scenario links retain all query parameters while redirecting',async()=>{
    const query='campaign=jun&site=ridge-4&start=2027-06-21T12%3A00%3A00Z&durationHours=168&maxDarkHours=24&maxCommGapHours=24&minJointHours=24&clearanceDeg=0';
    await page.goto(base+'?'+query);await page.waitForSelector('#app:not([hidden])');const actual=new URL(page.url());assert.ok(actual.pathname.endsWith('/navigator.html'));
    for(const [key,value] of new URLSearchParams(query))assert.equal(actual.searchParams.get(key),value);
    assert.equal(await page.locator('#start-date').inputValue(),'2027-06-21');assert.equal(await page.locator('#start-hour').inputValue(),'12');assert.ok((await page.locator('#selected-title').innerText()).includes('4'));
  });
  await test('homepage Chinese translation persists and hands off to navigator',async()=>{
    await home();await page.locator('#language').click();assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');assert.match(await page.locator('#hero-title').innerText(),/[\u4e00-\u9fff]/);await page.reload();await page.waitForSelector('#hero-title');assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');await page.locator('.nav-cta').click();await page.waitForSelector('#app:not([hidden])');assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');await page.locator('a.brand').click();await page.locator('#language').click();assert.equal(await page.locator('html').getAttribute('lang'),'en');
  });
  await test('film opens as playable media and closes accessibly',async()=>{
    await home();await page.locator('#watch-film').click();assert.ok(await page.locator('#film-dialog').evaluate(d=>d.open));await page.waitForFunction(()=>document.getElementById('film').readyState>=1);assert.equal(await page.locator('#film').evaluate(v=>v.error),null);assert.ok(await page.locator('#film').evaluate(v=>v.videoWidth>=1000));await page.keyboard.press('Escape');assert.equal(await page.locator('#film-dialog').evaluate(d=>d.open),false);await page.locator('#footer-film').click();assert.ok(await page.locator('#film-dialog').evaluate(d=>d.open));await page.locator('#close-film').click();assert.equal(await page.locator('#film-dialog').evaluate(d=>d.open),false);
  });
  await test('homepage anchor navigation reaches the intended sections',async()=>{
    await home();for(const id of ['mission','experience','science']){await page.locator(`.desktop-nav a[href="#${id}"]`).click();assert.equal(new URL(page.url()).hash,'#'+id);assert.ok(await page.evaluate(()=>scrollY)>0);}
  });
  await test('same-site image source and evidence links return successful responses',async()=>{
    await home();const urls=await page.evaluate(()=>[...document.querySelectorAll('a[href],img[src],link[rel="stylesheet"],script[src],source[src]')].map(e=>e.href||e.src).filter(u=>u&&new URL(u).origin===location.origin&&!u.includes('#')));
    for(const url of [...new Set(urls)]){const response=await context.request.get(url);assert.ok(response.ok(),`${url}: ${response.status()}`);}
  });
  await test('desktop homepage screenshot and visible layout have no horizontal overflow',async()=>{
    await home();await page.setViewportSize({width:1440,height:1050});await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await screenshots('homepage-desktop');
  });
  await test('phone and narrow phone keep navigation and controls inside the viewport',async()=>{
    for(const width of [390,330]){
      await page.setViewportSize({width,height:844});await home();await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`page overflow at ${width}px`);
      const bounds=await page.locator('.masthead .wordmark,.masthead #language,.masthead .nav-cta').evaluateAll(elements=>elements.filter(e=>getComputedStyle(e).display!=='none').map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
      assert.ok(bounds.every(r=>r.left>=-1&&r.right<=width+1),JSON.stringify(bounds));
      const titleBounds=await page.locator('#hero-title').evaluate(e=>{const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);const out=[];let text;while(text=walker.nextNode()){if(!text.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(text);out.push(...[...range.getClientRects()].map(r=>({left:r.left,right:r.right})));}return out;});assert.ok(titleBounds.every(r=>r.left>=-1&&r.right<=width+2),`Hero text clips at ${width}px: ${JSON.stringify(titleBounds)}`);
      for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){const a=bounds[i],b=bounds[j];assert.ok(Math.min(a.right,b.right)-Math.max(a.left,b.left)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=1,'Header controls overlap');}
      if(width===390){await screenshots('homepage-phone');await page.locator('#language').click();await screenshots('homepage-phone-zh');await page.locator('#language').click();}
    }
  });
  await test('no missing project assets or browser errors',async()=>{assert.deepEqual(failedRequests,[]);assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);});
  await context.close();
}catch(error){records.push({name:'test infrastructure',status:'FAIL',error:error.stack||String(error)});console.error(error);}
finally{
  if(browser)await browser.close();if(server)server.kill();
  const report={startedAt,finishedAt:new Date().toISOString(),base,environment:{node:process.version,browser:executablePath||'installed Chromium'},passed:records.filter(r=>r.status==='PASS').length,failed:records.filter(r=>r.status==='FAIL').length,pageErrors,consoleErrors,failedRequests,records};
  await writeFile(path.join(root,'docs/design-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed}));process.exitCode=report.failed?1:0;
}
