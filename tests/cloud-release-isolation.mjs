/** Two real compiled artifacts, one persistent database/object store. Synthetic B changes only UI/fixture resources. */
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdir,mkdtemp,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildWorker} from '../scripts/build-worker.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(path.join(root,'tmp'),{recursive:true});const dir=await mkdtemp(path.join(root,'tmp/release-isolation-')),staticRoot=path.join(dir,'static');
await mkdir(staticRoot);await cp(path.join(root,'dist/evidence-assets'),path.join(staticRoot,'evidence-assets'),{recursive:true});
const A=JSON.parse(await readFile(path.join(root,'dist/build-info.json'),'utf8'));
await writeFile(path.join(staticRoot,'build-info.json'),JSON.stringify(A));
await buildWorker({staticRoot,outputFile:path.join(dir,'worker-a.mjs')});
const B=structuredClone(A),htmlB=Buffer.from((await readFile(path.join(staticRoot,A.identity.application['index.html'].snapshot),'utf8'))+'\n<!-- Isolated release B test fixture; never published. -->\n'),htmlHash=sha(htmlB);
B.identity.application['index.html']={sha256:htmlHash,snapshot:`evidence-assets/${htmlHash}.html`};await writeFile(path.join(staticRoot,B.identity.application['index.html'].snapshot),htmlB);
const objectBytes=Buffer.alloc(70001,42),objectSha=sha(objectBytes),objectDescriptor={sha256:objectSha,snapshot:`evidence-assets/${objectSha}.bin`,bytes:objectBytes.length};
B.identity.resources['docs/release-isolation-object.bin']=objectDescriptor;
B.buildId=sha(JSON.stringify(B.identity));await writeFile(path.join(staticRoot,'build-info.json'),JSON.stringify(B));await writeFile(path.join(staticRoot,`evidence-assets/build-${B.buildId}.json`),JSON.stringify(B));
await buildWorker({staticRoot,outputFile:path.join(dir,'worker-b.mjs')});
const workerA=(await import(pathToFileURL(path.join(dir,'worker-a.mjs')))).default,workerB=(await import(pathToFileURL(path.join(dir,'worker-b.mjs')))).default;
const sqlite=new DatabaseSync(path.join(dir,'database.sqlite'));sqlite.exec('PRAGMA foreign_keys=ON');sqlite.exec(await readFile(path.join(root,'drizzle/0000_ambiguous_blink.sql'),'utf8'));
const DB={prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return{results:sqlite.prepare(sql).all(...this.args)};},async run(){const value=sqlite.prepare(sql).run(...this.args);return{success:true,meta:{changes:value.changes}};}};},async batch(items){sqlite.exec('BEGIN');try{const result=[];for(const item of items)result.push(await item.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
const BUCKET={async put(key,bytes,options={}){if(options.sha256)assert.equal(sha(bytes),options.sha256);const file=path.join(dir,'bucket',key);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);},async get(key){try{const bytes=await readFile(path.join(dir,'bucket',key));return{text:async()=>bytes.toString('utf8'),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}catch(error){if(error.code==='ENOENT')return null;throw error;}}};
const env={DB,BUCKET},origin='https://release-fixture.test',checks=[];
function pass(name){checks.push({name,status:'PASS'});console.log('PASS',name);}
async function request(worker,url,{method='GET',body,cookie,headers={}}={}){const waits=[];const response=await worker.fetch(new Request(new URL(url,origin),{method,headers:{...(body?{'Content-Type':'application/json',Origin:origin}:{}),...(cookie?{Cookie:cookie}:{}),...headers},body:body?JSON.stringify(body):undefined}),env,{waitUntil:p=>waits.push(p)});await Promise.all(waits);return response;}
async function json(worker,url,options={}){const response=await request(worker,url,options);return{status:response.status,value:await response.json(),cookie:response.headers.get('Set-Cookie')?.split(';')[0]};}
const settings={start:'2027-06-02T06:00:00Z',durationHours:168,maxDarkHours:24,maxCommGapHours:24,minJointHours:24,clearanceDeg:0,observerHeightM:2};
function calculation(client,calculation=client,extras={}){return{clientRelease:{apiVersion:2,buildId:client.buildId},buildId:calculation.buildId,algorithmSha256:calculation.identity.algorithm.sha256,datasetSha256:calculation.identity.datasets.jun.sha256,campaign:'jun',siteId:'ridge-6',patchId:'e+0-n+0',settings,language:'zh',...extras};}
const originalFetch=globalThis.fetch;
try{
 globalThis.fetch=async()=>{throw new Error('Core assets must not fetch another frontend.');};
 const ca=await json(workerA,'/api/coverage'),cookie=ca.cookie;assert.equal(ca.value.release.buildId,A.buildId);
 const initial=await json(workerA,'/api/analyses',{method:'POST',cookie,body:calculation(A)});assert.equal(initial.status,201);assert.equal(initial.value.record.provenance.calculationBuildId,A.buildId);
 const saved=await json(workerA,'/api/tasks',{method:'POST',cookie,body:{analysisId:initial.value.id,name:'Isolation A original'}}),taskId=saved.value.task.id;
 const share=await json(workerA,`/api/tasks/${taskId}/share`,{method:'POST',cookie,body:{}});
 const cb=await json(workerB,'/api/coverage',{cookie});assert.equal(cb.value.release.buildId,B.buildId);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lm_datasets').get().n,6);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lm_regions').get().n,6);
 assert.deepEqual((await json(workerA,'/api/coverage',{cookie})).value.campaigns,ca.value.campaigns);pass('A and B seed separate coverage indexes; rollback cannot overwrite the other release');
 const redirect=await request(workerB,'/?lang=zh&site=ridge-6');assert.equal(redirect.status,302);assert.equal(redirect.headers.get('cache-control'),'no-store');assert.equal(new URL(redirect.headers.get('location')).pathname,`/releases/${B.buildId}/index.html`);assert.equal(new URL(redirect.headers.get('location')).search,'?lang=zh&site=ridge-6');
 for(const release of [A,B]){const response=await request(workerB,`/releases/${release.buildId}/index.html`);assert.equal(response.status,200);assert.equal(sha(Buffer.from(await response.arrayBuffer())),release.identity.application['index.html'].sha256);const script=await request(workerB,`/releases/${release.buildId}/src/landing.js`);assert.equal(sha(Buffer.from(await script.arrayBuffer())),release.identity.application['src/landing.js'].sha256);}
 pass('Same-bundle core frontend and release-qualified URLs prevent mixed HTML/script versions without upstream access');
 const before=sqlite.prepare('SELECT COUNT(*) AS n FROM lm_analyses').get().n;
 for(const [payload,code]of [[calculation(A),'client-release-mismatch'],[calculation(B,B,{algorithmSha256:'0'.repeat(64)}),'calculation-release-mismatch'],[calculation(B,B,{datasetSha256:'0'.repeat(64)}),'calculation-release-mismatch'],[calculation(B,B,{buildId:undefined}),'calculation-version-required']]){const rejected=await json(workerB,'/api/analyses',{method:'POST',cookie,body:payload});assert.equal(rejected.status,409);assert.equal(rejected.value.error.code,code);}
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lm_analyses').get().n,before);pass('Actual A-client/B-service and algorithm/data mismatches fail before a calculation record is created');
 const historical=await json(workerB,'/api/analyses',{method:'POST',cookie,body:calculation(B,A)});assert.equal(historical.status,201);assert.equal(historical.value.record.provenance.interfaceBuildId,B.buildId);assert.equal(historical.value.record.provenance.calculationBuildId,A.buildId);assert.notEqual(historical.value.id,initial.value.id);assert.deepEqual(historical.value.record.selectedPoint.result,initial.value.record.selectedPoint.result);assert.deepEqual((await json(workerB,`/api/tasks/${taskId}`,{cookie})).value.record,initial.value.record);pass('Current interface explicitly recalculates a retained version into a new record without changing original evidence');
 const constraints={schemaVersion:1,referenceStart:'2027-06-01T06:00:00Z',maxDelayHours:24,rankingPreference:'margin'};
 const constrained=await json(workerB,'/api/analyses',{method:'POST',cookie,body:calculation(B,B,{missionConstraints:constraints})});assert.equal(constrained.status,201);assert.equal(constrained.value.record.missionConstraints.latestArrival,'2027-06-02T06:00:00.000Z');assert.equal(constrained.value.record.missionConstraints.maxDelayHours,24);assert.equal(JSON.parse(sqlite.prepare('SELECT parameters_json FROM lm_analyses WHERE id=?').get(constrained.value.id).parameters_json).missionConstraints.rankingPreference,'margin');
 const invalid=await json(workerB,'/api/analyses',{method:'POST',cookie,body:calculation(B,B,{missionConstraints:{...constraints,maxDelayHours:23}})});assert.equal(invalid.status,422);assert.equal(invalid.value.error.code,'invalid-mission-constraints');pass('Mission arrival constraints are validated, normalized and persisted with the selected scientific result');
 const savedB=await json(workerB,'/api/tasks',{method:'POST',cookie,body:{analysisId:constrained.value.id,name:'Isolation B retained'}});
 assert.deepEqual((await json(workerA,`/api/tasks/${savedB.value.task.id}`,{cookie})).value.record,constrained.value.record);assert.deepEqual((await json(workerA,`/api/shared/${share.value.token}`)).value.record,initial.value.record);
 assert.equal((await json(workerA,'/api/analyses',{method:'POST',cookie,body:calculation(B)})).value.error.code,'client-release-mismatch');
 const rolledHtml=await request(workerA,`/releases/${B.buildId}/index.html`);assert.equal(rolledHtml.status,200);assert.equal(sha(Buffer.from(await rolledHtml.arrayBuffer())),htmlHash);pass('Rollback keeps B evidence and archived interface readable, A shares readonly, and rejects stale B writes');
 const objectURL=`/releases/${B.buildId}/docs/release-isolation-object.bin`;let upstreamCalls=0;
 globalThis.fetch=async(url,options)=>{upstreamCalls++;assert.equal(String(url),`https://slashzyc.github.io/NASA-universe-event/${objectDescriptor.snapshot}`);assert.equal(options.redirect,'manual');return new Response(Buffer.alloc(objectBytes.length,43));};
 const tampered=await json(workerB,objectURL);assert.equal(tampered.status,503);assert.equal(tampered.value.error.code,'asset-checksum');assert.equal(await BUCKET.get(objectDescriptor.snapshot),null);
 globalThis.fetch=async()=>new Response(null,{status:302,headers:{Location:'https://another.test/changed'}});assert.equal((await json(workerB,objectURL)).value.error.code,'asset-unavailable');
 globalThis.fetch=async(url)=>{upstreamCalls++;assert.ok(String(url).endsWith(objectDescriptor.snapshot));return new Response(objectBytes);};
 const exact=await request(workerB,objectURL);assert.equal(exact.status,200);assert.equal(sha(Buffer.from(await exact.arrayBuffer())),objectSha);assert.ok(await BUCKET.get(objectDescriptor.snapshot));
 globalThis.fetch=async()=>{throw new Error('Cache should serve this verified object.');};const ranged=await request(workerA,objectURL,{headers:{Range:'bytes=10-29'}});assert.equal(ranged.status,206);assert.equal(ranged.headers.get('content-range'),'bytes 10-29/70001');assert.deepEqual(Buffer.from(await ranged.arrayBuffer()),objectBytes.subarray(10,30));assert.equal(upstreamCalls,2);pass('Large resources accept only exact immutable bytes, reject tampering/redirects, and survive rollback through verified R2 cache with byte ranges');
 const report={checkedAt:new Date().toISOString(),mode:'Local compiled Worker A/B artifacts; real persistent disk SQLite and R2-compatible file store; not an online deployment or simulated restart of hosted infrastructure',baselineBuildId:A.buildId,fixtureBuildId:B.buildId,fixtureChange:'B differs only by an HTML comment and synthetic resource descriptor; all NASA inputs and scientific algorithm remain identical.',algorithmSha256:A.identity.algorithm.sha256,checks};
 await writeFile(path.join(root,'docs/cloud-release-isolation-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({checks:checks.length,artifactDirectory:path.relative(root,dir)}));
}finally{globalThis.fetch=originalFetch;sqlite.close();}
