import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createService} from '../server/index.mjs';
import {digest} from '../server/calculation.mjs';
import {analyzeSite} from '../src/analysis.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const staticRoot=path.join(root,'dist');
const request={campaign:'jun',siteId:'ridge-6',patchId:'e+0-n+0',language:'zh',settings:{start:'2027-06-02T06:00:00Z',durationHours:168,maxDarkHours:24,maxCommGapHours:24,minJointHours:24,clearanceDeg:0,observerHeightM:2}};
test('persistent service: real computation, complete evidence, isolated visitors, restart and readonly shares',async t=>{
  await mkdir(path.join(root,'tmp'),{recursive:true});const dataDir=await mkdtemp(path.join(root,'tmp','server-test-'));
  let service=await createService({root,staticRoot,dataDir}),address=await service.listen(0),base=`http://127.0.0.1:${address.port}`;
  let cookie='',otherCookie='',analysis,task,share;
  async function api(route,method='GET',payload,other=false,extra={}){
    const headers={'Content-Type':'application/json',...extra};const jar=other?otherCookie:cookie;if(jar)headers.Cookie=jar;
    const response=await fetch(base+route,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});
    const incoming=response.headers.get('set-cookie');if(incoming){if(other)otherCookie=incoming.split(';')[0];else cookie=incoming.split(';')[0];}
    return{status:response.status,value:await response.json()};
  }
  try{
    await t.test('coverage imports three real campaigns and discrete points into SQLite',async()=>{
      const response=await api('/api/coverage');assert.equal(response.status,200);assert.equal(response.value.regions.length,3);assert.equal(response.value.campaigns.length,3);assert.deepEqual(response.value.heights,[2]);assert.equal(response.value.regions[0].points.length,9);
      assert.equal(service.db.prepare('SELECT count(*) AS n FROM datasets').get().n,3);assert.equal(service.db.prepare('SELECT count(*) AS n FROM regions').get().n,3);
    });
    await t.test('server calculates verified NASA inputs and saves exact evidence',async()=>{
      const response=await api('/api/analyses','POST',request);assert.equal(response.status,201);analysis=response.value;
      const bundle=JSON.parse(await readFile(path.join(root,'data/lunar-sites-june.json'),'utf8')),baseline=analyzeSite(bundle.sites.find(x=>x.id==='ridge-6'),request.settings);
      assert.deepEqual(analysis.record.results.find(x=>x.siteId==='ridge-6').metrics,baseline.metrics);assert.equal(analysis.record.results.find(x=>x.siteId==='ridge-6').patchStats.feasibleCount,8);
      assert.equal(digest(analysis.record.inputSnapshot.text),analysis.record.provenance.datasetSha256);assert.equal(digest(analysis.record.algorithmSnapshot.text),analysis.record.provenance.algorithmSha256);assert.equal(digest(JSON.stringify(analysis.record)),analysis.recordSha256);
      assert.equal(service.db.prepare('SELECT record_sha256 FROM analyses WHERE id=?').get(analysis.id).record_sha256,analysis.recordSha256);
      assert.equal(analysis.record.server.storage,'SQLite');assert.notEqual(analysis.record.sourceDataTime,analysis.record.calculatedAt);
      const shareURL=new URL(analysis.record.shareURL);assert.equal(shareURL.searchParams.get('maxDarkHours'),'24');assert.equal(shareURL.searchParams.get('observerHeightM'),'2');
    });
    await t.test('real changed threshold yields changed decision without changing stored evidence',async()=>{
      const response=await api('/api/analyses','POST',{...request,settings:{...request.settings,maxDarkHours:1}});assert.equal(response.status,201);assert.equal(response.value.record.selectedPoint.result.centerFeasible,false);assert.equal(analysis.record.selectedPoint.result.centerFeasible,true);
      const original=await api(`/api/analyses/${analysis.id}`);assert.equal(original.value.recordSha256,analysis.recordSha256);
    });
    await t.test('unsupported dates, locations, heights and points never return neighboring results',async()=>{
      for(const input of [{...request,siteId:'tranquility'},{...request,patchId:'e+50-n+50'},{...request,lat:0,lon:0},{...request,settings:{...request.settings,observerHeightM:5}},{...request,settings:{...request.settings,start:'2027-08-01T00:00:00Z'}},{...request,settings:{...request.settings,durationHours:100000}},{...request,campaign:'unknown'}]){
        const response=await api('/api/analyses','POST',input);assert.equal(response.status,422);assert.ok(response.value.error.code);assert.equal(response.value.record,undefined);
      }
    });
    await t.test('cached date query records real cache use without upstream traffic and isolates ownership',async()=>{
      const response=await api('/api/data-jobs','POST',{start:'2027-06-02',stop:'2027-06-10',observerHeightM:2});
      assert.equal(response.status,202);assert.equal(response.value.job.status,'succeeded');assert.equal(response.value.job.cached,true);assert.equal(response.value.job.completedRequests,0);assert.equal(response.value.job.datasetId,'jun');
      const stored=await api('/api/data-jobs/'+response.value.job.id);assert.deepEqual(stored.value.job,response.value.job);
      assert.equal((await api('/api/data-jobs/'+response.value.job.id,'GET',undefined,true)).status,404);
      assert.equal((await api('/api/data-jobs','POST',{start:'2027-06-02',stop:'2027-06-10',observerHeightM:5})).status,422);
    });
    await t.test('submitted source code cannot replace the trusted release',async()=>{
      const response=await api('/api/analyses','POST',{...request,algorithmSnapshot:{text:'throw new Error("UNTRUSTED")'},algorithm:'untrusted'});
      assert.equal(response.status,201);assert.equal(response.value.record.provenance.algorithmSha256,analysis.record.provenance.algorithmSha256);
      assert.equal((await api('/api/analyses','POST',{...request,buildId:'../../malicious'})).status,422);
    });
    await t.test('save, list, rename and duplicate keep immutable calculation intact',async()=>{
      const saved=await api('/api/tasks','POST',{analysisId:analysis.id,name:'南极任务 A'});assert.equal(saved.status,201);task=saved.value.task;
      assert.equal(saved.value.recordSha256,analysis.recordSha256);assert.equal((await api('/api/tasks')).value.tasks.length,1);
      const renamed=await api(`/api/tasks/${task.id}`,'PATCH',{name:'南极 · 基线'});assert.equal(renamed.value.task.name,'南极 · 基线');assert.equal(renamed.value.recordSha256,analysis.recordSha256);
      const copy=await api(`/api/tasks/${task.id}/copy`,'POST',{});assert.equal(copy.status,201);assert.notEqual(copy.value.task.id,task.id);assert.equal(copy.value.task.analysisId,analysis.id);
      assert.equal((await api(`/api/tasks/${copy.value.task.id}`,'DELETE')).status,200);
    });
    await t.test('different visitors cannot view, edit, copy, delete or save another visitor records',async()=>{
      assert.equal((await api('/api/tasks','GET',undefined,true)).value.tasks.length,0);
      for(const[route,method,payload]of [[`/api/tasks/${task.id}`,'GET'],[`/api/tasks/${task.id}`,'PATCH',{name:'stolen'}],[`/api/tasks/${task.id}`,'DELETE'],[`/api/tasks/${task.id}/copy`,'POST',{}],[`/api/analyses/${analysis.id}`,'GET'],['/api/tasks','POST',{analysisId:analysis.id,name:'stolen'}]])assert.equal((await api(route,method,payload,true)).status,404);
    });
    await t.test('read-only share exposes the saved result but grants no mutation right',async()=>{
      const response=await api(`/api/tasks/${task.id}/share`,'POST',{});assert.equal(response.status,201);share=response.value;
      const shared=await api(`/api/shared/${share.token}`,'GET',undefined,true);assert.equal(shared.status,200);assert.equal(shared.value.readOnly,true);assert.equal(shared.value.recordSha256,analysis.recordSha256);
      assert.equal((await api(`/api/shared/${share.token}`,'PATCH',{name:'attempt'},true)).status,404);
      assert.equal((await api(`/api/tasks/${shared.value.task.id}`,'DELETE',undefined,true)).status,404);
    });
    await t.test('cross-origin changes are refused',async()=>{assert.equal((await api('/api/tasks','POST',{analysisId:analysis.id,name:'CSRF'},false,{Origin:'https://attacker.invalid'})).status,403);});
    await t.test('database survives service teardown and restart with exact task and share',async()=>{
      await service.close();service=await createService({root,staticRoot,dataDir});address=await service.listen(0);base=`http://127.0.0.1:${address.port}`;
      const reopened=await api(`/api/tasks/${task.id}`);assert.equal(reopened.status,200);assert.deepEqual(reopened.value.record,analysis.record);assert.equal(reopened.value.recordSha256,analysis.recordSha256);
      const shared=await api(`/api/shared/${share.token}`,'GET',undefined,true);assert.equal(shared.status,200);assert.deepEqual(shared.value.record,analysis.record);
    });
    await t.test('deleting task revokes share and leaves original evidence immutable',async()=>{
      assert.equal((await api(`/api/tasks/${task.id}`,'DELETE')).status,200);assert.equal((await api(`/api/shared/${share.token}`,'GET',undefined,true)).status,404);assert.equal((await api(`/api/analyses/${analysis.id}`)).value.recordSha256,analysis.recordSha256);
    });
  }finally{await service.close();const relative=path.relative(path.join(root,'tmp'),path.resolve(dataDir));if(relative.startsWith('..')||path.isAbsolute(relative)||!relative.startsWith('server-test-'))throw new Error('Refusing to remove a test directory outside its workspace.');await rm(dataDir,{recursive:true,force:true});}
});
