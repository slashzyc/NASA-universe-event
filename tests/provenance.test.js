/** Synthetic records only: these fixtures never modify NASA data or release assets. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sha256,verifyManifest,readManifest,verifiedText,versionDifferences,inspectRecord,scenarioURL} from '../src/provenance.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const json=JSON.stringify({fixture:'SYNTHETIC TEST INPUT — NOT NASA DATA',sites:[],value:1});
const algorithm='/* SYNTHETIC TEST ALGORITHM — never executed */ export const version = 1;\n';
const base='https://example.test/project/';
async function asset(text,extension){const digest=await sha256(text);return{sha256:digest,snapshot:`evidence-assets/${digest}.${extension}`};}
async function signed(identity){return{schemaVersion:1,buildId:await sha256(JSON.stringify(identity)),identity};}
async function manifest({algorithmText=algorithm,dataText=json,uiVersion='one'}={}){
  const algo=await asset(algorithmText,'js');
  return signed({schemaVersion:1,methodVersion:'synthetic-test-method-v1',sourceRepository:'https://example.test/source',
    application:{'src/analysis.js':algo,'src/landing.js':await asset(`/* synthetic UI ${uiVersion} */`,'js')},
    algorithm:algo,datasets:{jun:await asset(dataText,'json')}});
}
async function record(release,overrides={}){
  return {project:'LunaMargin',schemaVersion:3,campaign:'jun',selectedSiteId:'synthetic-site',
    selectedPoint:{id:'e+25-n-25',dxM:25,dyM:-25},language:'zh',
    settings:{start:'2027-06-02T06:00:00Z',durationHours:168,maxDarkHours:24,maxCommGapHours:24,minJointHours:24,clearanceDeg:0,observerHeightM:2},
    provenance:{buildId:release.buildId,algorithmSha256:release.identity.algorithm.sha256,datasetSha256:release.identity.datasets.jun.sha256},
    inputSnapshot:{format:'utf8-json',text:json,sha256:await sha256(json)},
    algorithmSnapshot:{format:'javascript-source',text:algorithm,sha256:await sha256(algorithm)},...overrides};
}
const response=(text,status=200)=>new Response(text,{status,headers:{'content-type':'text/plain; charset=utf-8'}});

test('R03: SHA-256 matches independent byte and UTF-8 reference digests',async()=>{
  for(const text of ['', 'abc', '月面余量\n']){
    assert.equal(await sha256(text),createHash('sha256').update(text,'utf8').digest('hex'));
    assert.equal(await sha256(new TextEncoder().encode(text)),await sha256(text));
  }
});

test('R03: same release verifies its manifest and both embedded snapshots without differences',async()=>{
  const release=await manifest();assert.equal(await verifyManifest(release,release.buildId),release);
  const saved=await record(release),inspection=await inspectRecord(saved,release);
  assert.deepEqual(inspection.differences,[]);assert.equal(inspection.snapshotStatus,'verified');assert.equal(inspection.legacy,false);assert.equal(inspection.campaign,'jun');
});

test('R03: algorithm and data changes are distinguished from a UI-only build change',async()=>{
  const savedRelease=await manifest(),saved=await record(savedRelease);
  const algorithmChange=await manifest({algorithmText:algorithm.replace('1','2')});
  const dataChange=await manifest({dataText:json.replace('"value":1','"value":2')});
  const uiChange=await manifest({uiVersion:'two'});
  assert.deepEqual(versionDifferences(saved.provenance,algorithmChange,'jun'),['build','algorithm']);
  assert.deepEqual(versionDifferences(saved.provenance,dataChange,'jun'),['build','data']);
  assert.deepEqual(versionDifferences(saved.provenance,uiChange,'jun'),['build']);
  assert.deepEqual((await inspectRecord(saved,algorithmChange)).differences,['build','algorithm']);
  assert.deepEqual((await inspectRecord(saved,dataChange)).differences,['build','data']);
  assert.deepEqual((await inspectRecord(saved,uiChange)).differences,['build']);
});

test('R03: unavailable embedded input remains missing rather than being presented as verified',async()=>{
  const release=await manifest(),saved=await record(release);delete saved.inputSnapshot;
  const inspection=await inspectRecord(saved,release);assert.equal(inspection.snapshotStatus,'missing');assert.equal(inspection.legacy,false);
});

test('R03: altered input bytes or an internally rehashed input that conflicts with provenance are rejected',async()=>{
  const release=await manifest(),saved=await record(release);
  saved.inputSnapshot.text=json.replace('"value":1','"value":9');
  await assert.rejects(inspectRecord(saved,release),/snapshot checksum mismatch/i);
  saved.inputSnapshot.sha256=await sha256(saved.inputSnapshot.text);
  await assert.rejects(inspectRecord(saved,release),/snapshot checksum mismatch/i);
});

test('R03: altered algorithm bytes and a rehashed algorithm conflicting with provenance are rejected',async()=>{
  const release=await manifest(),saved=await record(release);
  saved.algorithmSnapshot.text=algorithm.replace('1','9');
  await assert.rejects(inspectRecord(saved,release),/algorithm.*checksum mismatch|checksum mismatch.*algorithm/i);
  saved.algorithmSnapshot.sha256=await sha256(saved.algorithmSnapshot.text);
  await assert.rejects(inspectRecord(saved,release),/algorithm.*checksum mismatch|checksum mismatch.*algorithm/i);
});

test('R03: schema 1 and 2 records stay compatible and explicitly identify unknown versions',async()=>{
  const release=await manifest();
  for(const schemaVersion of [1,2]){
    const saved=await record(release,{schemaVersion});delete saved.provenance;delete saved.inputSnapshot;delete saved.algorithmSnapshot;delete saved.campaign;
    const inspection=await inspectRecord(saved,release);
    assert.equal(inspection.legacy,true);assert.equal(inspection.snapshotStatus,'missing');assert.deepEqual(inspection.differences,['legacy']);assert.equal(inspection.campaign,'jun');
  }
});

test('R03: schema 3 requires complete version digests instead of silently degrading to legacy',async()=>{
  const release=await manifest(),saved=await record(release);
  await assert.rejects(inspectRecord({...saved,provenance:undefined},release),/provenance.*incomplete/i);
  for(const field of ['buildId','algorithmSha256','datasetSha256']){
    const incomplete=clone(saved);delete incomplete.provenance[field];
    await assert.rejects(inspectRecord(incomplete,release),/provenance.*incomplete/i);
    incomplete.provenance[field]='not-a-digest';
    await assert.rejects(inspectRecord(incomplete,release),/provenance.*incomplete/i);
  }
});

test('R03: missing remote snapshots and manifests fail with their actual retrieval status',async()=>{
  const release=await manifest();
  await assert.rejects(verifiedText(release.identity.datasets.jun,base,async()=>response('missing',404)),/unavailable \(404\)/i);
  await assert.rejects(readManifest(new URL('build-info.json',base),release.buildId,async()=>response('missing',404)),/unavailable \(404\)/i);
});

test('R03: verified retrieval checks actual bytes, content addresses and requested manifest identity',async()=>{
  const release=await manifest();let request;
  assert.equal(await verifiedText(release.identity.datasets.jun,base,async(url,options)=>{request={url:String(url),options};return response(json);}),json);
  assert.equal(request.url,new URL(release.identity.datasets.jun.snapshot,base).href);assert.equal(request.options.cache,'no-store');
  await assert.rejects(verifiedText(release.identity.datasets.jun,base,async()=>response(json+' ')),/Snapshot checksum mismatch/);
  await assert.rejects(verifyManifest(release,'0'.repeat(64)),/manifest checksum mismatch/i);
  const changed=clone(release);changed.identity.methodVersion='changed-without-rehash';await assert.rejects(verifyManifest(changed),/manifest checksum mismatch/i);
  const malformed=clone(release.identity);malformed.datasets.jun.snapshot='https://untrusted.example/input.json';
  await assert.rejects(verifyManifest(await signed(malformed)),/content-addressed/i);
  let called=false;await assert.rejects(verifiedText({...release.identity.datasets.jun,snapshot:'../data/private.json'},base,async()=>{called=true;return response(json);}),/Invalid snapshot location/);assert.equal(called,false);
  const fetched=await readManifest(new URL('build-info.json',base),release.buildId,async()=>response(JSON.stringify(release)));assert.deepEqual(fetched,release);
});

test('R03: content-addressed text with an invalid data or algorithm role is rejected',async()=>{
  const release=await manifest();
  const wrongData=clone(release.identity);wrongData.datasets.jun.snapshot=wrongData.datasets.jun.snapshot.replace(/\.json$/,'.js');
  await assert.rejects(verifyManifest(await signed(wrongData)),/content-addressed|dataset|snapshot|asset/i);
  const wrongAlgorithm=clone(release.identity);wrongAlgorithm.algorithm.snapshot=wrongAlgorithm.algorithm.snapshot.replace(/\.js$/,'.json');
  await assert.rejects(verifyManifest(await signed(wrongAlgorithm)),/content-addressed|algorithm|snapshot|asset/i);
  const noData=clone(release.identity);noData.datasets={};await assert.rejects(verifyManifest(await signed(noData)),/dataset|campaign|asset|manifest/i);
});

test('R03: future schemas, other projects, missing scenarios and unsupported campaigns are rejected',async()=>{
  const release=await manifest(),saved=await record(release);
  for(const schemaVersion of [0,4,'3',null])await assert.rejects(inspectRecord({...saved,schemaVersion},release),/schema/i);
  await assert.rejects(inspectRecord({...saved,project:'Another project'},release),/schema/i);
  await assert.rejects(inspectRecord({...saved,selectedSiteId:''},release),/incomplete/i);
  await assert.rejects(inspectRecord({...saved,settings:{...saved.settings,start:'not-a-date'}},release),/incomplete/i);
  await assert.rejects(inspectRecord({...saved,campaign:'unknown'},release),/campaign.*unavailable/i);
  await assert.rejects(verifyManifest({...release,schemaVersion:2}),/manifest checksum mismatch/i);
});

test('R03: scenario links preserve the saved calculation identity and explicitly mark recalculation',async()=>{
  const release=await manifest(),saved=await record(release),url=new URL(scenarioURL(saved,base));
  assert.equal(url.pathname,'/project/navigator.html');assert.equal(url.searchParams.get('site'),saved.selectedSiteId);assert.equal(url.searchParams.get('patch'),'e+25-n-25');assert.equal(url.searchParams.get('lang'),'zh');
  assert.equal(url.searchParams.get('build'),release.buildId);assert.equal(url.searchParams.get('algo'),saved.provenance.algorithmSha256);assert.equal(url.searchParams.get('data'),saved.provenance.datasetSha256);
  for(const[key,value]of Object.entries(saved.settings))assert.equal(url.searchParams.get(key),String(value));
  const current=new URL(scenarioURL(saved,base,{current:true}));assert.equal(current.searchParams.get('recalculated'),'1');
  for(const key of ['build','algo','data'])assert.equal(current.searchParams.has(key),false);
  const legacy=clone(saved);delete legacy.provenance;delete legacy.selectedPoint;delete legacy.campaign;
  const old=new URL(scenarioURL(legacy,base));assert.equal(old.searchParams.get('patch'),'e+0-n+0');assert.equal(old.searchParams.get('campaign'),'jun');assert.equal(old.searchParams.get('recalculated'),'1');
});

test('R03: imported algorithm source is inspected as data and never executed',async()=>{
  const text="globalThis.__lunamarginSyntheticExecution = true; throw new Error('synthetic code executed');";
  const release=await manifest({algorithmText:text}),saved=await record(release,{algorithmSnapshot:{format:'javascript-source',text,sha256:await sha256(text)}});
  delete globalThis.__lunamarginSyntheticExecution;
  await inspectRecord(saved,release);assert.equal(globalThis.__lunamarginSyntheticExecution,undefined);
});
