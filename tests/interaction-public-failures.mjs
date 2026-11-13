/** Actual public deployment checks. Fault injection is confined to this browser;
 * it never stops the cloud service and never substitutes scientific results. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=new URL(process.env.LUNAMARGIN_TEST_URL||'https://lunamargin-slashzyc.laceysquirrel4.chatgpt.site/');
assert.equal(base.protocol,'https:','This gate requires the actual public HTTPS deployment.');
const out=path.resolve(root,process.env.LUNAMARGIN_QA_OUTPUT||'test-results/interaction-public-failures');
const reportRoot=process.env.LUNAMARGIN_QA_OUTPUT||process.env.CI?out:path.join(root,'docs');
await mkdir(out,{recursive:true});await mkdir(reportRoot,{recursive:true});
const archiveId='67e6da3ed1cc55f42539862b05ed35e24e74441c6e15f2e11033f00a54da2267';
const archived=JSON.parse(await readFile(path.join(root,`evidence-assets/build-${archiveId}.json`),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
assert.equal(hash(JSON.stringify(archived.identity)),archiveId,'Historical ID must identify a real retained manifest.');
const localChrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||(existsSync(localChrome)?localChrome:undefined),args:['--no-proxy-server','--enable-unsafe-swiftshader']});
const checks=[],errors=[],evidence={};let current,ownerContext,temporaryTask;
const startedAt=new Date().toISOString();
const pass=(name,details={})=>{checks.push({name,status:'PASS',...details});console.log('PASS',name);};
async function newPage(options={}){const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',reducedMotion:'reduce',...options});const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',error=>errors.push(error.message));return{context,page};}
async function ready(page){await page.waitForFunction(()=>window.lunaMargin?.getState().ready&&window.lunaMarginService);}
async function connected(page){await page.waitForSelector('#service-console .service-led.connected');}
async function post(context,route,data){return context.request.post(new URL('api/'+route,base).href,{data,headers:{Origin:base.origin},timeout:60000});}
const settings={start:'2027-06-02T06:00:00Z',durationHours:168,maxDarkHours:24,maxCommGapHours:24,minJointHours:24,clearanceDeg:0,observerHeightM:2};
const input={campaign:'jun',siteId:'ridge-6',patchId:'e+0-n+0',settings,language:'zh'};
try{
  const {context,page}=await newPage();ownerContext=context;
  const manifestResponse=await context.request.get(new URL('build-info.json',base).href);assert.ok(manifestResponse.ok());current=await manifestResponse.json();
  assert.equal(hash(JSON.stringify(current.identity)),current.buildId);
  evidence.currentBuildId=current.buildId;
  await page.goto(new URL('navigator.html?lang=zh',base).href);await ready(page);await connected(page);
  await page.locator('#advanced-settings').evaluate(el=>el.open=true);await page.locator('#dark-limit').fill('8');
  assert.equal(await page.evaluate(()=>window.lunaMargin.getState().dirty),true);
  const abortAPI=route=>route.abort('internetdisconnected');
  await page.route('**/api/**',abortAPI);await page.locator('#service-retry').click();
  await page.waitForFunction(()=>document.querySelector('#service-message')?.textContent.includes('未能完成'));
  assert.equal(await page.locator('#service-console .service-led.connected').count(),0);
  assert.match(await page.locator('#service-console').innerText(),/暂时断连|设备模式/);
  assert.equal(await page.locator('#dark-limit').inputValue(),'8');
  assert.equal(await page.locator('#advanced-settings').evaluate(el=>el.open),true);
  assert.equal(await page.evaluate(()=>window.lunaMargin.getState().settings.maxDarkHours),24,'Unsubmitted draft must not replace the applied result.');
  assert.match(await page.locator('#save-task').innerText(),/保存到设备/);assert.equal(await page.locator('#open-device').isEnabled(),true);assert.equal(await page.locator('#server-calculate').isEnabled(),true);
  await page.locator('#service-console').screenshot({path:path.join(out,'client-offline.png')});
  evidence.disconnection={injection:'Browser page.route aborts API requests with internetdisconnected; the real cloud service remains running.',draftDarkHours:8,appliedDarkHours:24,deviceFileOpen:true,localApply:true};
  pass('Browser-only API disconnection shows device actions and preserves the unsubmitted draft');
  await page.unroute('**/api/**',abortAPI);await page.locator('#service-retry').click();await connected(page);
  assert.equal(await page.locator('#dark-limit').inputValue(),'8');assert.equal(await page.evaluate(()=>window.lunaMargin.getState().dirty),true);
  assert.equal(await page.locator('#advanced-settings').evaluate(el=>el.open),true);assert.match(await page.locator('#save-task').innerText(),/保存到服务器/);
  await page.locator('#service-console').screenshot({path:path.join(out,'client-reconnected.png')});
  pass('Removing the client fault and reconnecting restores the public service without changing the draft');

  evidence.rejectedRequests=[];
  for(const [name,request] of [
    ['arbitrary coordinates',{...input,lat:0,lon:0}],
    ['unsupported research position',{...input,siteId:'not-covered'}],
    ['uncovered date',{...input,settings:{...settings,start:'2027-08-01T00:00:00Z'}}],
    ['unsupported 5 m height',{...input,settings:{...settings,observerHeightM:5}}],
  ]){
    const response=await post(context,'analyses',request),body=await response.json();assert.equal(response.status(),422,JSON.stringify(body));assert.equal(body.record,undefined);assert.ok(body.error);
    evidence.rejectedRequests.push({input:name,status:response.status(),error:body.error});
  }
  assert.equal(await page.locator('#dark-limit').inputValue(),'8');
  pass('Actual public API rejects uncovered coordinates, position, date and 5 m height without returning substitute records');

  for(const mode of ['no-webgl','texture-failure']){
    const fallback=await newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});let blockedTextureRequests=0;
    if(mode==='no-webgl')await fallback.page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return ['webgl','webgl2','experimental-webgl'].includes(kind)?null:get.call(this,kind,...args);};});
    else await fallback.page.route('**/moon-color-2025-2k.jpg',route=>{blockedTextureRequests++;return route.abort('failed');});
    await fallback.page.goto(new URL('?lang=zh',base).href);await fallback.page.waitForSelector('#moon-explorer[data-render-mode="2d"]');
    assert.equal(await fallback.page.locator('#moon-flat-image').isVisible(),true);if(mode==='texture-failure'){assert.ok(blockedTextureRequests>0);assert.match(await fallback.page.locator('#moon-message').innerText(),/纹理加载失败|纹理不可用/);}
    await fallback.page.locator('[data-region="ridge-4"]').click();await fallback.page.locator('#moon-enter').click();await ready(fallback.page);await connected(fallback.page);
    await fallback.page.waitForFunction(()=>!document.documentElement.classList.contains('lm-transitioning'));
    const state=await fallback.page.evaluate(()=>window.lunaMargin.getState());assert.equal(state.siteId,'ridge-4');assert.equal(state.patchId,'e+0-n+0');assert.ok(await fallback.page.locator('#metrics .metric-value').count());
    assert.equal(await fallback.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await fallback.page.screenshot({path:path.join(out,mode+'-workspace.png')});
    evidence[mode]={clientInjected:true,renderMode:'2d',supportedSite:state.siteId,workspaceReady:true,blockedTextureRequests};
    pass(mode==='no-webgl'?'Unavailable WebGL falls back to a usable 2D map/list and a real mobile workspace':'A failed texture download falls back to a usable 2D map/list and a real mobile workspace');
    await fallback.context.close();
  }

  assert.notEqual(archiveId,current.buildId);
  const archiveResponse=await context.request.get(new URL(`evidence-assets/build-${archiveId}.json`,base).href);assert.ok(archiveResponse.ok());const publishedArchive=await archiveResponse.json();assert.deepEqual(publishedArchive,archived);
  assert.equal(archived.identity.algorithm.sha256,current.identity.algorithm.sha256,'Use an actually supported historical algorithm, not a fabricated version.');
  const historicalURL=new URL('navigator.html',base);for(const [key,value]of Object.entries({campaign:'jun',site:'ridge-6',patch:'e+0-n+0',lang:'zh',...settings,build:archiveId,algo:archived.identity.algorithm.sha256,data:archived.identity.datasets.jun.sha256}))historicalURL.searchParams.set(key,String(value));
  await page.goto(historicalURL.href);await ready(page);await connected(page);await page.waitForFunction(id=>window.lunaMargin.getState().buildId===id,archiveId);
  const analysisRequest=page.waitForRequest(r=>r.method()==='POST'&&new URL(r.url()).pathname.endsWith('/api/analyses'));
  await page.locator('#server-calculate').click();const sent=(await analysisRequest).postDataJSON();assert.equal(sent.buildId,archiveId);
  await page.waitForFunction(()=>window.lunaMarginService.getRecord()?.server?.analysisId&&!document.querySelector('#server-calculate').disabled);
  const original=await page.evaluate(()=>window.lunaMarginService.getRecord());
  assert.equal(original.provenance.calculationBuildId,archiveId);assert.equal(original.provenance.buildId,archiveId);assert.equal(original.provenance.interfaceBuildId,current.buildId);
  assert.equal(hash(original.inputSnapshot.text),archived.identity.datasets.jun.sha256);assert.equal(hash(original.algorithmSnapshot.text),archived.identity.algorithm.sha256);
  const savedResponse=await post(context,'tasks',{analysisId:original.server.analysisId,name:'Temporary public historical-version acceptance'});assert.equal(savedResponse.status(),201);const saved=await savedResponse.json();temporaryTask=saved.task.id;assert.deepEqual(saved.record,original);
  pass('The browser submits a real archived build ID and the public calculation records exactly that historical version');
  await page.goto(new URL(`navigator.html?task=${temporaryTask}&lang=zh`,base).href);await ready(page);await page.waitForSelector('#archive-banner:not([hidden])');
  assert.deepEqual(await page.evaluate(()=>window.lunaMarginService.getRecord()),original);
  await page.locator('#archive-recalculate').click();await page.waitForFunction(old=>window.lunaMarginService.getRecord()?.server?.analysisId!==old&&!document.querySelector('#server-calculate').disabled,original.server.analysisId);
  const recalculated=await page.evaluate(()=>window.lunaMarginService.getRecord());assert.equal(recalculated.provenance.calculationBuildId,current.buildId);assert.notEqual(recalculated.server.analysisId,original.server.analysisId);
  const rereadResponse=await context.request.get(new URL(`api/tasks/${temporaryTask}`,base).href);assert.ok(rereadResponse.ok());const reread=await rereadResponse.json();assert.deepEqual(reread.record,original);
  evidence.historicalVersion={archiveManifest:`evidence-assets/build-${archiveId}.json`,submittedBuildId:sent.buildId,calculationBuildId:original.provenance.calculationBuildId,interfaceBuildId:original.provenance.interfaceBuildId,currentRecalculationBuildId:recalculated.provenance.calculationBuildId,originalRecordSha256:hash(JSON.stringify(original)),reopenedOriginalRecordSha256:hash(JSON.stringify(reread.record)),originalUnchanged:true};
  pass('Explicit current-version recalculation creates a separate result while the saved historical evidence remains byte-identical');
  assert.deepEqual(errors,[]);pass('No application JavaScript exceptions in the public failure/recovery flows');
}catch(error){checks.push({name:'gate failure',status:'FAIL',message:error.stack});process.exitCode=1;console.error(error);}
finally{
  if(temporaryTask&&ownerContext){try{const response=await ownerContext.request.delete(new URL(`api/tasks/${temporaryTask}`,base).href,{headers:{Origin:base.origin}});evidence.temporaryTaskDeleted=response.status()===200;if(!response.ok())throw new Error('Temporary task cleanup failed: '+response.status());}catch(error){checks.push({name:'temporary acceptance task cleanup',status:'FAIL',message:error.message});process.exitCode=1;}}
  await writeFile(path.join(reportRoot,'interaction-public-failures.json'),JSON.stringify({startedAt,finishedAt:new Date().toISOString(),origin:base.origin,mode:'Actual public HTTPS UI and API; client-only network/WebGL/texture faults explicitly identified, no fake scientific responses and no cloud shutdown.',checks,evidence,errors},null,2)+'\n');
  await browser.close();
}
