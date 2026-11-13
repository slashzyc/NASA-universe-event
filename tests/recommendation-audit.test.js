import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {analyzeSite} from '../src/analysis.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const json=file=>JSON.parse(readFileSync(path.join(root,file),'utf8'));
const report=json('data/recommendation-fine-validation.json');
const bundle=json('data/lunar-sites-june.json');
const digest=file=>createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex');
const metrics=['sunHours','earthHours','jointHours','longestDarkHours','longestCommGapHours'];
const settings={start:report.start,durationHours:168,maxDarkHours:24,maxCommGapHours:24,minJointHours:24,observerHeightM:2};

test('recommendation audit covers all 18 distinct observing sites and exact raw-query provenance',()=>{
  assert.equal(report.cases.length,18);
  assert.equal(new Set(report.cases.map(c=>`${c.siteId}/${c.patchId}`)).size,18);
  assert.equal(report.coverage.rawResponseCount,36);
  assert.equal(report.coverage.pairedEpochCount,18*2017);
  assert.equal(report.publishedBundle.sha256,digest('data/'+report.publishedBundle.path));
  assert.equal(report.publishedGeometryProgramAtAudit.sha256,digest(report.publishedGeometryProgramAtAudit.path));
  for(const [file,hash] of Object.entries(report.calculationPrograms))assert.equal(hash,digest(file),file);
  for(const c of report.cases){
    const site=bundle.sites.find(s=>s.id===c.siteId),patch=site.patches.find(p=>p.id===c.patchId);
    assert.deepEqual(c.location,Object.fromEntries(['lat','lon','elevationM','dxM','dyM'].map(k=>[k,patch[k]])));
    assert.equal(c.samples.length,2017);assert.equal(c.fineHorizon.length,720);
    assert.equal(c.coverage.missingEpochCount,0);assert.equal(c.coverage.nonfiniteAngleCount,0);
    assert.equal(Date.parse(c.samples[0].time),Date.parse(report.start));
    assert.equal(Date.parse(c.samples.at(-1).time),Date.parse(report.stop));
    for(let i=1;i<c.samples.length;i++)assert.equal(Date.parse(c.samples[i].time)-Date.parse(c.samples[i-1].time),300000);
    for(const body of ['sun','earth']){
      const source=c.sources[body],raw=json('data/'+source.path);
      assert.equal(source.sha256,digest('data/'+source.path));
      assert.deepEqual(source.parameters,raw.parameters);
      assert.equal(source.parameters.STEP_SIZE,"'5 m'");
      assert.equal(source.parameters.SITE_COORD,`'${patch.lon.toFixed(9)},${patch.lat.toFixed(9)},${((patch.elevationM+2)/1000).toFixed(9)}'`);
      assert.ok(raw.response.result.includes('$$SOE'));assert.ok(source.requestedAt);
    }
  }
});

test('independent audit reproduces production integration for all points, angles, metrics, and windows',()=>{
  for(const c of report.cases){
    const site=bundle.sites.find(s=>s.id===c.siteId),patch=site.patches.find(p=>p.id===c.patchId);
    for(const angle of report.addedClearanceDeg){
      for(const [mode,samples,horizon,step] of [
        ['published30Minute',site.samples,patch.horizon,.5],
        ['independent5MinutePublishedHorizon',c.samples,patch.horizon,1/12],
        ['independent5MinuteFineHorizon',c.samples,c.fineHorizon,1/12],
      ]){
        const expected=c.evaluations[mode][angle===0?'0.0':String(angle)];
        // JSON keys preserve Python float spellings (0.0, 0.02, 0.1, 0.25).
        const actual=analyzeSite({...site,...patch,samples,horizon,patches:[]},{...settings,clearanceDeg:angle,nominalStepHours:step});
        assert.equal(actual.status,'complete');assert.equal(actual.centerFeasible,expected.passes,`${c.siteId}/${c.patchId}/${angle}/${mode}`);
        for(const metric of metrics)assert.ok(Math.abs(actual.metrics[metric]-expected.metrics[metric])<1e-6,`${c.siteId}/${c.patchId}/${angle}/${mode}/${metric}`);
        for(const body of ['sun','earth','joint']){
          assert.equal(actual.windows[body].length,expected.windows[body].length);
          for(let i=0;i<actual.windows[body].length;i++){
            for(const edge of ['start','end'])assert.ok(Math.abs(Date.parse(actual.windows[body][i][edge])-Date.parse(expected.windows[body][i][edge]))<=2);
          }
        }
      }
    }
  }
});

test('audit summaries retain every failing point and fixed thresholds at all stress angles',()=>{
  assert.deepEqual(report.constraints,{maxDarkHours:24,maxCommGapHours:24,minJointHours:24});
  assert.deepEqual(report.addedClearanceDeg,[0,.02,.1,.25]);
  for(const [id,modes] of Object.entries(report.summaries)){
    for(const [mode,angles] of Object.entries(modes)){
      let previous=Infinity;
      for(const [angle,summary] of Object.entries(angles)){
        const cases=report.cases.filter(c=>c.siteId===id).map(c=>({id:c.patchId,...c.evaluations[mode][angle]}));
        assert.equal(summary.count,9);
        assert.equal(summary.passCount,cases.filter(c=>c.passes).length);
        assert.equal(summary.failedPoints.length,9-summary.passCount);
        assert.ok(summary.passCount<=previous);previous=summary.passCount;
        assert.equal(summary.worstDarkness.hours,Math.max(...cases.map(c=>c.metrics.longestDarkHours)));
        for(const failed of summary.failedPoints)assert.ok(failed.reasons.length>0);
      }
    }
  }
});
