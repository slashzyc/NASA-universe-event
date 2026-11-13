/** Real public-service task UI validation, isolated to a fresh anonymous visitor. */
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.LUNAMARGIN_URL||'https://lunamargin-slashzyc.laceysquirrel4.chatgpt.site/',startedAt=new Date().toISOString(),prefix='UI verification '+Date.now(),checks=[],errors=[];
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||(existsSync(chrome)?chrome:undefined),headless:true,args:['--no-proxy-server']});
const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const ownedIds=new Set();let buildId=null,cleanup={remaining:[],deleted:0},failure;
const check=(name,value=true)=>{assert.ok(value,name);checks.push({name,status:'PASS'});console.log('PASS',name);};
const rows=()=>page.locator('#task-list .task-row');
async function listTasks(){return page.evaluate(async()=>{const r=await fetch('/api/tasks');if(!r.ok)throw new Error('Cannot query this visitor task list');return(await r.json()).tasks;});}
try{
 await page.goto(new URL('navigator.html?lang=zh',base).href);await page.waitForSelector('.service-led.connected',{timeout:45000});await page.waitForFunction(()=>window.lunaMargin?.getState().ready);
 check('Fresh anonymous visitor begins with no tasks',(await listTasks()).length===0);
 await page.locator('#server-calculate').click();await page.waitForFunction(()=>window.lunaMarginService?.getRecord()?.server&&!document.querySelector('#save-task').disabled,{timeout:45000});
 const evidence=await page.evaluate(()=>{const r=window.lunaMarginService.getRecord();return{buildId:r.provenance.buildId,siteId:r.selectedSiteId,start:r.settings.start,storage:r.server.storage};});buildId=evidence.buildId;check('Real cloud calculation produces a recorded result',Boolean(buildId)&&Boolean(evidence.storage));
 await page.locator('#save-task').click();await page.locator('#task-name').fill(prefix+' original');await page.locator('#task-save-form button').click();await page.waitForSelector('#archive-banner:not([hidden])');
 const saved=(await listTasks()).find(t=>t.name===prefix+' original');assert.ok(saved);ownedIds.add(saved.id);check('Named mission is persisted through the real save UI');
 await page.locator('#my-tasks').click();await page.waitForSelector('#task-list .task-row');assert.equal(await rows().count(),1);
 await page.locator('#task-filter-date').fill(evidence.start.slice(0,10));assert.equal(await rows().count(),1);await page.locator('#task-filter-site').selectOption(evidence.siteId);assert.equal(await rows().count(),1);check('Matching date and location filters retain the saved mission');
 const otherDate=new Date(Date.parse(evidence.start)+86400000).toISOString().slice(0,10);await page.locator('#task-filter-date').fill(otherDate);assert.equal(await rows().count(),0);assert.match(await page.locator('#task-list').innerText(),/没有符合筛选条件/);check('Nonmatching date produces an explicit filtered empty state');
 await page.locator('#clear-task-filters').click();assert.equal(await rows().count(),1);assert.equal(await page.locator('#task-filter-date').inputValue(),'');assert.equal(await page.locator('#task-filter-site').inputValue(),'');await page.locator('#task-filter-site').selectOption(evidence.siteId==='ridge-4'?'ridge-1':'ridge-4');assert.equal(await rows().count(),0);check('Nonmatching location excludes the mission');
 await page.locator('#clear-task-filters').click();assert.equal(await rows().count(),1);check('Clear filters restores the unchanged saved mission');
 await rows().first().locator('[data-action="rename"]').click();await page.locator('#rename-name').fill(prefix+' renamed');await page.locator('#rename-form button').click();await page.waitForSelector('#task-list .task-row');await page.waitForFunction(name=>document.querySelector('#task-list h3')?.textContent===name,prefix+' renamed');check('UI rename persists the new name',(await listTasks()).find(t=>t.id===saved.id)?.name===prefix+' renamed');
 await rows().first().locator('[data-action="copy"]').click();await page.waitForFunction(()=>document.querySelectorAll('#task-list .task-row').length===2);const copied=(await listTasks()).find(t=>t.id!==saved.id&&t.name.startsWith(prefix));assert.ok(copied);ownedIds.add(copied.id);check('UI copy creates an independent task referencing the same original evidence',copied.analysisId===saved.analysisId);
 await page.locator(`[data-task="${copied.id}"] [data-action="delete"]`).click();await page.locator('#confirm-delete').click();await page.waitForSelector('#task-list .task-row');await page.waitForFunction(()=>document.querySelectorAll('#task-list .task-row').length===1);const remaining=await listTasks();check('UI deletion removes only the duplicate',remaining.length===1&&remaining[0].id===saved.id);
 await page.locator(`[data-task="${saved.id}"] [data-action="delete"]`).click();await page.locator('#confirm-delete').click();await page.waitForSelector('#task-list-status');await page.waitForFunction(()=>document.querySelector('#task-list-status').textContent.includes('还没有保存的任务'));check('Deleting the original returns a clear true empty state',(await listTasks()).length===0);check('No application errors',errors.length===0);
}catch(error){failure=error.message;checks.push({name:'Public task UI flow',status:'FAIL',message:error.message});throw error;}
finally{
 try{const tasks=await listTasks();for(const task of tasks.filter(t=>ownedIds.has(t.id)||t.name.startsWith(prefix))){await page.evaluate(async id=>{const r=await fetch('/api/tasks/'+id,{method:'DELETE'});if(!r.ok)throw new Error('Could not delete a verification task');},task.id);cleanup.deleted++;}cleanup.remaining=(await listTasks()).filter(t=>ownedIds.has(t.id)||t.name.startsWith(prefix)).map(()=> 'verification task remains');}catch(error){cleanup.error=error.message;}
 await mkdir('docs',{recursive:true});await writeFile('docs/interaction-tasks-validation.json',JSON.stringify({startedAt,finishedAt:new Date().toISOString(),url:base,buildId,scope:'Real public service; fresh isolated anonymous browser; only this test visitor’s newly created tasks changed',checks,errors,cleanup,...(failure?{failure}:{})},null,2)+'\n');await context.close();await browser.close();
}
