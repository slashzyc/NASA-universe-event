/** Built UI edge checks. Connection failures are explicit browser-only aborts. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { createService } from '../server/index.mjs';

const root=resolve(import.meta.dirname,'..'),output=join(root,'test-results','explorer-edge');
await mkdir(output,{recursive:true});
const dataDir=await mkdtemp(join(output,'database-')),checks=[],pageErrors=[];
let service,browser,context,page,origin,taskId,copyId,shareURL,blockedMethod=null;
const startedAt=new Date().toISOString();
async function test(name,run){const start=Date.now();await run();checks.push({name,status:'PASS',durationMs:Date.now()-start});console.log('PASS '+name);}
async function ready(p=page){await p.waitForFunction(()=>window.lunaMargin?.getState().ready&&window.lunaMarginService);}
async function post(path,body={}){const r=await context.request.post(origin+'api/'+path,{data:body});assert.ok(r.ok(),await r.text());return r.json();}
async function closeDialog(){if(await page.locator('#tasks-dialog').isVisible())await page.locator('#close-tasks').click();}
async function tasks(){await closeDialog();await page.locator('#my-tasks').click();await page.locator('#task-list .task-row').first().waitFor();}
async function calculate(){const previous=await page.evaluate(()=>window.lunaMarginService.getRecord()?.server.analysisId);await page.locator('#server-calculate').click();await page.waitForFunction(old=>{const r=window.lunaMarginService.getRecord();return r&&r.server.analysisId!==old&&!document.querySelector('#formal-export').disabled&&!document.querySelector('#server-calculate').disabled;},previous);}
try{
  service=await createService({root,staticRoot:join(root,'dist'),dataDir});const address=await service.listen(0);origin=`http://127.0.0.1:${address.port}/`;
  const executable=process.env.BROWSER_EXECUTABLE||(!process.env.CI&&process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined);
  browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{}),args:['--no-proxy-server']});
  context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  await context.route('**/api/tasks/*',r=>r.request().method()===blockedMethod?r.abort('failed'):r.continue());
  page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>pageErrors.push(e.message));
  const input={campaign:'jun',siteId:'ridge-6',patchId:'e+0-n+0',language:'zh',settings:{start:'2027-06-02T06:00:00Z',durationHours:24,maxDarkHours:24,maxCommGapHours:24,minJointHours:48,clearanceDeg:0,observerHeightM:2}};
  const analysis=await post('analyses',input),saved=await post('tasks',{analysisId:analysis.id,name:'边界任务原名'});taskId=saved.task.id;
  shareURL=(await post(`tasks/${taskId}/share`)).url;
  await test('Historical 24-hour mission retains its 48-hour minimum-joint threshold without clamping',async()=>{
    await page.goto(origin+'navigator.html?task='+taskId+'&lang=zh');await ready();
    await page.waitForFunction(()=>!document.querySelector('#archive-banner').hidden&&window.lunaMarginService.getRecord()?.settings.durationHours===24);
    const state=await page.evaluate(()=>window.lunaMargin.getState());assert.equal(state.settings.durationHours,24);assert.equal(state.settings.minJointHours,48);
    assert.equal(await page.locator('#joint-limit').inputValue(),'48');
    assert.equal(await page.locator('#duration').inputValue(),'24');
    const record=await page.evaluate(()=>window.lunaMarginService.getRecord());assert.equal(record.selectedPoint.result.centerFeasible,false);assert.equal(record.settings.minJointHours,48);
  });
  await test('Rename failure stays visible in the dialog; retry persists the new name',async()=>{
    await tasks();await page.locator(`[data-task="${taskId}"] [data-action="rename"]`).click();await page.locator('#rename-name').fill('边界任务已重命名');
    blockedMethod='PATCH';await page.locator('#rename-form button').click();await page.locator('#tasks-dialog .dialog-error').waitFor();
    assert.ok((await page.locator('#tasks-dialog .dialog-error').textContent()).length>0);assert.equal(await page.locator('#tasks-dialog').isVisible(),true);
    assert.equal(service.db.prepare('SELECT name FROM tasks WHERE id=?').get(taskId).name,'边界任务原名');
    blockedMethod=null;await page.locator('#rename-form button').click();await page.locator(`[data-task="${taskId}"] h3`).waitFor();
    assert.equal(await page.locator(`[data-task="${taskId}"] h3`).textContent(),'边界任务已重命名');
    assert.equal(service.db.prepare('SELECT name FROM tasks WHERE id=?').get(taskId).name,'边界任务已重命名');
  });
  await test('Copy creates an independent task with the exact original evidence',async()=>{
    await page.locator(`[data-task="${taskId}"] [data-action="copy"]`).click();await page.waitForFunction(()=>document.querySelectorAll('#task-list .task-row').length===2);
    const response=await context.request.get(origin+'api/tasks'),list=(await response.json()).tasks;copyId=list.find(x=>x.id!==taskId).id;
    const copies=service.db.prepare('SELECT analysis_id FROM tasks WHERE id IN (?,?)').all(taskId,copyId);
    assert.equal(copies.length,2);assert.equal(copies[0].analysis_id,copies[1].analysis_id);assert.notEqual(copyId,taskId);
  });
  await test('Delete failure is visible; retry deletes only the copied task and revokes its share',async()=>{
    const copyShare=await post(`tasks/${copyId}/share`);
    await page.locator(`[data-task="${copyId}"] [data-action="delete"]`).click();blockedMethod='DELETE';await page.locator('#confirm-delete').click();
    await page.locator('#tasks-dialog .dialog-error').waitFor();assert.equal(await page.locator('#tasks-dialog').isVisible(),true);
    assert.ok(service.db.prepare('SELECT id FROM tasks WHERE id=?').get(copyId));
    blockedMethod=null;await page.locator('#confirm-delete').click();await page.waitForFunction(()=>document.querySelectorAll('#task-list .task-row').length===1);
    assert.equal(service.db.prepare('SELECT id FROM tasks WHERE id=?').get(copyId),undefined);assert.ok(service.db.prepare('SELECT id FROM tasks WHERE id=?').get(taskId));
    assert.equal((await context.request.get(origin+'api/shared/'+copyShare.token)).status(),404);await closeDialog();
  });
  await test('Three-plan limit is enforced; remove makes room for another actual calculation',async()=>{
    await page.goto(origin+'navigator.html?lang=zh');await ready();await page.locator('#service-console .connected').waitFor();
    for(const siteId of ['ridge-6','ridge-1','ridge-4']){
      await page.locator(`#site-tabs [data-site="${siteId}"]`).click();await calculate();await page.locator('#add-plan').click();
    }
    assert.equal(await page.locator('.plan-card').count(),3);
    await page.locator('#point-selector [data-patch="e+25-n-25"]').click();await calculate();await page.locator('#add-plan').click();
    assert.equal(await page.locator('.plan-card').count(),3);assert.match(await page.locator('#service-message').textContent(),/最多比较三个/);
    await page.locator('[data-remove]').first().click();assert.equal(await page.locator('.plan-card').count(),2);await page.locator('#add-plan').click();assert.equal(await page.locator('.plan-card').count(),3);
    await page.locator('#plan-comparison').screenshot({path:join(output,'three-plans.png')});
  });
  await test('Initially disconnected read-only share restores its original record after reconnect',async()=>{
    const receiver=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});let disconnect=true;
    await receiver.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await receiver.route('**/api/**',r=>disconnect?r.abort('failed'):r.continue());
    const shared=await receiver.newPage();shared.on('pageerror',e=>pageErrors.push(e.message));await shared.goto(shareURL);await ready(shared);
    await shared.waitForFunction(()=>document.querySelector('#service-message')?.textContent.includes('未能完成'));
    assert.equal(await shared.locator('#archive-banner').isVisible(),false);
    disconnect=false;await shared.locator('#service-retry').click();await shared.waitForFunction(()=>!document.querySelector('#archive-banner').hidden&&document.querySelector('#archive-banner').textContent.includes('只读分享记录'));
    const restored=await shared.evaluate(()=>window.lunaMarginService.getRecord());assert.equal(restored.settings.durationHours,24);assert.equal(restored.settings.minJointHours,48);assert.equal(restored.server.analysisId,analysis.id);
    assert.equal(await shared.locator('#joint-limit').inputValue(),'48');assert.equal(await shared.locator('#server-calculate').isDisabled(),true);
    await shared.screenshot({path:join(output,'reconnected-readonly-mobile.png'),fullPage:true});await receiver.close();
  });
  assert.deepEqual(pageErrors,[]);
}catch(error){checks.push({name:'failure',status:'FAIL',message:error.stack});process.exitCode=1;console.error(error);}
finally{
  await writeFile(join(root,'docs','explorer-edge-validation.json'),JSON.stringify({startedAt,finishedAt:new Date().toISOString(),artifact:'dist',injection:'Browser-only request aborts test visible connection errors; no simulated scientific responses.',checks,pageErrors},null,2)+'\n');
  await browser?.close();await service?.close();
}
