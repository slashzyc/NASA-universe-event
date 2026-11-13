import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {analyzeSite} from '../src/analysis.js';
import {missionConstraintsFromParams} from '../src/mission-constraints.js';
const text=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const json=async path=>JSON.parse(await text(path));
const hash=s=>createHash('sha256').update(s).digest('hex');
test('Human study materials preserve equal numerical information and the same declared deadline',async()=>{
  const study=await json('docs/study/study-cases.json');
  for(const c of study.cases){
    const bytes=await text('data/'+c.file),bundle=JSON.parse(bytes),html=await text(`docs/study/case-${c.id.toLowerCase()}-static.html`);
    assert.equal(hash(bytes),c.datasetSha256);
    for(const p of c.plans){
      const url=new URL(p.appURL,'https://example.invalid/releases/frozen/docs/study/app-condition.html');
      assert.equal(url.pathname,'/releases/frozen/navigator.html');
      const actual={};for(const key of Object.keys(p.settings))actual[key]=key==='start'?url.searchParams.get(key):key==='nominalStepHours'?.5:Number(url.searchParams.get(key));
      assert.deepEqual(actual,p.settings);
      assert.deepEqual(missionConstraintsFromParams(url.searchParams,{start:actual.start}),c.missionConstraints);
      const site=bundle.sites.find(s=>s.id===url.searchParams.get('site'));
      assert.ok(Date.parse(actual.start)<=Date.parse(c.missionConstraints.latestArrival));
      assert.equal(analyzeSite(site,actual).patchStats.feasibleCount,p.feasibleCount);
      for(const point of p.points){
        const raw=site.patches.find(x=>x.id===point.id),result=analyzeSite({...site,...raw,patches:[]},actual);
        assert.deepEqual(result.metrics,point.result.metrics);
        assert.deepEqual(result.windows,point.result.windows);
        const row=html.split(`id="${p.id}-${point.id}"`)[1]?.split('</tr>')[0];assert.ok(row);
        for(const metric of ['longestDarkHours','longestCommGapHours','jointHours'])assert.ok(row.includes(result.metrics[metric].toFixed(3)));
      }
      assert.ok(html.includes(p.missionConstraints.latestArrival.slice(0,16).replace('T',' ')));
      assert.ok(html.includes('This exact interval and all nine points have no independent dense audit'));
    }
  }
});
test('Frozen material hashes, computed answers and empty observation records are distinct',async()=>{
  const manifest=await json('docs/study/protocol-manifest.json'),answers=await json('docs/study/moderator-answer-key.json'),blank=await json('docs/study/observations.blank.json');
  for(const[file,sha]of Object.entries(manifest.files))assert.equal(hash(await text('docs/study/'+file)),sha,file);
  assert.equal(answers.caseFileSha256,hash(await text('docs/study/study-cases.json')));
  assert.deepEqual(answers.cases.map(c=>c.correctAnswers.task3.planId),['A1','B1']);
  assert.deepEqual(blank.participants,[]);assert.equal(blank.interview,null);assert.equal(blank.participantsTested,0);assert.equal(blank.interviewsCompleted,0);
  for(const value of Object.values(blank.taskTemplate))assert.ok(value===null||Array.isArray(value)&&value.length===0);
});
