import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analyzeSite,searchWindows,stressTestSite,SEARCH_RANKING} from '../src/analysis.js';

const origin=Date.parse('2027-06-01T00:00:00Z');
const at=h=>new Date(origin+h*3_600_000).toISOString();
const flat=z=>Array(360).fill(z);
const samples=(sun,earth)=>sun.map((sunEl,h)=>({time:at(h),sunEl,earthEl:earth[h],sunAz:90,earthAz:180}));
const bright=Array(5).fill(1);
const site=(id='test',patches=[])=>({id,name:id,horizon:flat(0),sampleStepHours:1,samples:samples(bright,bright),patches});
const settings=extra=>({start:at(0),durationHours:4,maxDarkHours:4,maxCommGapHours:4,minJointHours:0,observerHeightM:2,clearanceDeg:0,...extra});
const near=(a,b,epsilon=1e-9)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const june=JSON.parse(await readFile(new URL('../data/lunar-sites-june.json',import.meta.url),'utf8'));
const reference={start:'2027-06-21T12:00:00Z',durationHours:168,maxDarkHours:24,maxCommGapHours:24,minJointHours:24,clearanceDeg:0,observerHeightM:2};

test('worst-position metrics retain the responsible points and signed threshold margins',()=>{
  const s=site('extremes',[
    {id:'sun-low',dxM:25,dyM:0,horizon:flat(0),samples:samples([1,-1,-1,-1,1],bright)},
    {id:'earth-low',dxM:0,dyM:25,horizon:flat(0),samples:samples(bright,[1,-1,-1,1,1])},
    {id:'open',dxM:0,dyM:0,horizon:flat(0)},
  ]);
  const r=analyzeSite(s,settings({maxDarkHours:2,maxCommGapHours:3,minJointHours:2}));
  const w=r.patchStats.worstCase;
  assert.equal(w.status,'complete');
  assert.deepEqual(w.metrics,{longestDarkHours:3,longestCommGapHours:2,jointHours:1});
  assert.deepEqual(w.margins,{darknessHours:-1,earthGapHours:1,jointHours:-1});
  assert.equal(w.minimumMarginHours,-1);
  assert.deepEqual(w.limitingMetrics,['darknessHours','jointHours']);
  assert.equal(w.points.longestDarkHours.id,'sun-low');
  assert.equal(w.points.longestCommGapHours.id,'earth-low');
  assert.equal(w.points.jointHours.dxM,25);
});

test('any missing or unsupported patch prevents a whole-footprint robustness claim',()=>{
  const s=site('partial',[{id:'known',horizon:flat(0)},{id:'missing'}]);
  const r=analyzeSite(s,settings({minPatchCoverage:1}));
  const w=r.patchStats.worstCase;
  assert.equal(w.status,'partial');assert.equal(w.knownCount,1);assert.equal(w.count,2);
  assert.equal(w.minimumMarginHours,null);
  assert.deepEqual(w.metrics,{longestDarkHours:null,longestCommGapHours:null,jointHours:null});
  assert.deepEqual(w.margins,{darknessHours:null,earthGapHours:null,jointHours:null});
  assert.equal(w.knownMetrics.jointHours,4);assert.equal(r.feasible,null);
  assert.equal(searchWindows([s],settings({minPatchCoverage:1})).earliestDelayHours,null);
  const unsupported=analyzeSite(site('height',[{id:'high',horizon:flat(0),horizonHeightM:5}]),settings());
  assert.equal(unsupported.patchStats.worstCase.minimumMarginHours,null);
  assert.equal(analyzeSite(site(),settings()).patchStats.worstCase.status,'unavailable');
});

test('zero threshold slack still passes and all tied extreme points remain identifiable',()=>{
  const patches=[{id:'z',horizon:flat(2),dxM:25,dyM:0},{id:'a',horizon:flat(2),dxM:-25,dyM:0}];
  const r=analyzeSite(site('boundary',patches),settings({minPatchCoverage:1}));
  assert.equal(r.feasible,true);assert.equal(r.patchStats.worstCase.minimumMarginHours,0);
  assert.deepEqual(r.patchStats.worstCase.points.longestDarkHours.tiedPointIds,['a','z']);
  assert.equal(r.patchStats.worstCase.points.longestDarkHours.id,'a');
});

test('stress increments never replace or lower a nonzero requested baseline',()=>{
  const s=site('stress',[{id:'near-horizon',horizon:flat(.65)}]);
  const input=settings({clearanceDeg:.25,maxDarkHours:3,minPatchCoverage:1});
  const stress=stressTestSite(s,input);
  assert.equal(input.clearanceDeg,.25);assert.equal(stress.baselineClearanceDeg,.25);
  assert.deepEqual(stress.levels.map(l=>l.incrementDeg),[0,.02,.1,.25]);
  stress.levels.forEach(level=>{
    near(level.clearanceDeg,.25+level.incrementDeg);
    const direct=analyzeSite(s,{...input,clearanceDeg:level.clearanceDeg});
    assert.equal(level.feasibleCount,direct.patchStats.feasibleCount);
    assert.deepEqual(level.worstCase,direct.patchStats.worstCase);
  });
  assert.equal(stress.levels[0].feasibleCount,1);
  assert.equal(stress.levels.at(-1).feasibleCount,0);
  assert.ok(stress.levels.at(-1).scenarios[0].reasons.some(r=>r.code==='dark-gap'));
  assert.throws(()=>stressTestSite(s,input,[-.1]),RangeError);
  assert.throws(()=>stressTestSite(s,input,[NaN]),RangeError);
});

test('published June 21 ROI 1 and ROI 4 stress baseline is reproduced without data edits',()=>{
  const expected={'ridge-1':[[9,8.015],[9,8.403],[9,9.860],[9,14.954]],'ridge-4':[[9,23.749],[8,24.725],[8,46.209],[7,52.100]]};
  for(const [id,rows] of Object.entries(expected)){
    const stress=stressTestSite(june.sites.find(s=>s.id===id),reference);
    stress.levels.forEach((level,i)=>{
      assert.equal(level.feasibleCount,rows[i][0]);
      near(level.worstCase.metrics.longestDarkHours,rows[i][1],.0006);
      assert.equal(level.allKnown,true);
      assert.equal(level.scenarios.length,9);
    });
  }
});

test('same-date recommendation uses footprint slack instead of the better center alone',()=>{
  const two=june.sites.filter(s=>['ridge-1','ridge-4'].includes(s.id));
  const found=searchWindows(two,{...reference,searchEnd:reference.start,minPatchCoverage:1});
  assert.equal(found.ranking.id,SEARCH_RANKING.id);
  assert.deepEqual(found.earliestFeasible.map(c=>c.siteId),['ridge-1','ridge-4']);
  const [one,four]=found.earliestFeasible;
  assert.ok(four.metrics.longestDarkHours<one.metrics.longestDarkHours,'ROI 4 has the better center-only darkness');
  assert.ok(one.worstCase.minimumMarginHours>four.worstCase.minimumMarginHours);
  near(one.worstCase.minimumMarginHours,24-one.worstCase.metrics.longestCommGapHours);
  near(four.worstCase.minimumMarginHours,24-four.worstCase.metrics.longestDarkHours);
  assert.equal(four.worstCase.points.longestDarkHours.id,'e-25-n-25');
  assert.ok(found.objectives.includes('worstCase.longestDarkHours:min'));
});

test('date priority, deterministic ties and candidate caps do not depend on site order',()=>{
  const a=site('a',[{id:'p',horizon:flat(0)}]),z=site('z',[{id:'p',horizon:flat(0)}]);
  for(const s of [a,z]) s.samples=[...s.samples,{...s.samples.at(-1),time:at(5)}];
  const config=settings({durationHours:1,stepHours:1,minPatchCoverage:1});
  const left=searchWindows([z,a],config),right=searchWindows([a,z],config);
  assert.deepEqual(left,right);
  assert.deepEqual(left.candidates.slice(0,4).map(c=>[c.delayHours,c.siteId]),[[0,'a'],[0,'z'],[1,'a'],[1,'z']]);
  assert.deepEqual(searchWindows([a,z],{...config,maxCandidates:3}),searchWindows([z,a],{...config,maxCandidates:3}));
});

test('nonzero baseline search and no-feasible outcomes retain strict limits',()=>{
  const four=june.sites.find(s=>s.id==='ridge-4');
  const found=searchWindows([four],{...reference,clearanceDeg:.02,searchEnd:reference.start,minPatchCoverage:1});
  assert.equal(found.earliestDelayHours,null);assert.deepEqual(found.earliestFeasible,[]);
  assert.equal(found.candidates.length,1);assert.equal(found.candidates[0].feasible,false);
  assert.ok(found.candidates[0].worstCase.margins.darknessHours<0);
  assert.equal(found.candidates[0].patchCoverage,8/9);
});
