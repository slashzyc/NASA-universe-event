import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildRecordValidation,verifyRecordValidation,recordedValidationMarkup} from '../src/record-validation.js';

// The scientific catalog is the actual project artifact. Only the two release
// envelopes and HTTP delivery are test fixtures; no scientific value is changed.
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const digest=text=>createHash('sha256').update(text).digest('hex');
const asset=(text,ext)=>({sha256:digest(text),snapshot:`evidence-assets/${digest(text)}.${ext}`});
const text=await read('data/science-validation-summary.json'),catalog=JSON.parse(text);
const algorithm=asset(await read('src/analysis.js'),'js'),dataset=asset(await read('data/lunar-sites-june.json'),'json'),descriptor=asset(text,'json');
const manifest=enabled=>{const identity={algorithm,datasets:{jun:dataset},application:enabled?{'src/record-validation.js':asset('test capability marker','js')}:{},resources:enabled?{'data/science-validation-summary.json':descriptor}:{}};return{schemaVersion:1,buildId:digest(JSON.stringify(identity)),identity};};
const current=manifest(true),legacy=manifest(false),base='https://example.test/project/';
const entry=catalog.entries.find(e=>e.siteId==='ridge-4'&&e.patchId==='e-25-n-25'&&e.settings.clearanceDeg===0);
const makeRecord=()=>{const record={settings:{...entry.settings},selectedSiteId:entry.siteId,selectedPoint:{id:entry.patchId},provenance:{buildId:current.buildId,calculationBuildId:current.buildId,interfaceBuildId:current.buildId,algorithmSha256:entry.algorithmSha256,datasetSha256:entry.dataSha256},shareURL:base+'navigator.html'};record.validationEvidence=buildRecordValidation(record,current,catalog);return record;};
async function withSources(fn){const previous=globalThis.fetch;const sources=new Map([[`evidence-assets/build-${current.buildId}.json`,JSON.stringify(current)],[`evidence-assets/build-${legacy.buildId}.json`,JSON.stringify(legacy)],[descriptor.snapshot,text]]);globalThis.fetch=async url=>{const value=sources.get(new URL(url).pathname.replace('/project/',''));return new Response(value??'missing',{status:value===undefined?404:200});};try{await fn();}finally{globalThis.fetch=previous;}}

test('a complete sensitive snapshot verifies against its content-addressed source',async()=>withSources(async()=>{const record=makeRecord();assert.equal(record.validationEvidence.validationStatus,'sensitive');assert.equal(await verifyRecordValidation(record,base),true);}));
test('new records cannot remove, null, or downgrade recorded validation',async()=>withSources(async()=>{for(const change of [r=>delete r.validationEvidence,r=>r.validationEvidence=null,r=>r.validationEvidence={schemaVersion:1,catalog:null,matched:false,validationStatus:'unavailable'},r=>r.validationEvidence={schemaVersion:1,catalog:r.validationEvidence.catalog,matched:false,validationStatus:'unavailable'},r=>r.validationEvidence.validationStatus='numerically-reviewed']){const r=makeRecord();change(r);await assert.rejects(verifyRecordValidation(r,base),/validation|audit/i);}}));
test('removing or falsifying only the interface build cannot bypass the calculation release capability',async()=>withSources(async()=>{for(const value of [undefined,legacy.buildId]){const r=makeRecord();delete r.validationEvidence;r.provenance.interfaceBuildId=value;await assert.rejects(verifyRecordValidation(r,base),/requires/);}}));
test('genuine legacy releases preserve original records without new snapshot fields',async()=>withSources(async()=>{const r=makeRecord();delete r.validationEvidence;r.provenance={...r.provenance,buildId:legacy.buildId,calculationBuildId:legacy.buildId,interfaceBuildId:legacy.buildId};assert.equal(await verifyRecordValidation(r,base),true);delete r.provenance;assert.equal(await verifyRecordValidation(r,base),true);}));
test('catalog identity cannot be replaced with a different release',async()=>withSources(async()=>{const r=makeRecord();r.validationEvidence.catalog.releaseBuildId=legacy.buildId;await assert.rejects(verifyRecordValidation(r,base),/another interface/);}));
test('standalone HTML renders absolute audit links without mutating original evidence',()=>{const r=makeRecord(),before=JSON.stringify(r);const html=recordedValidationMarkup(r,'zh');assert.equal(JSON.stringify(r),before);assert.ok(html.includes(new URL(r.validationEvidence.source,r.shareURL).href));assert.ok(html.includes(new URL(r.validationEvidence.terrainUncertainty.source,r.shareURL).href));assert.match(html,/敏感结果/);});
