/** Regenerate the public demonstration evidence from the current calculation code. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {analyzeSite,searchWindows} from '../src/analysis.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>readFile(path.join(root,file));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const dataset='data/lunar-sites-june.json';
const bytes=await read(dataset),bundle=JSON.parse(bytes);
const settings={start:'2027-06-02T06:00:00Z',durationHours:168,maxDarkHours:24,
  maxCommGapHours:24,minJointHours:24,clearanceDeg:0,observerHeightM:2,nominalStepHours:0.5};
const compact=({timeline,...result})=>result;
const site=bundle.sites.find(item=>item.id==='ridge-6');
const southeast=site.patches.find(item=>item.dxM===25&&item.dyM===-25);
const fineSource='data/fine-ephemeris-validation.json';
const fineBytes=await read(fineSource),fine=JSON.parse(fineBytes);
if(fine.publishedJuneBundleSha256!==hash(bytes)||fine.start!==settings.start||
  fine.durationHours!==settings.durationHours||fine.observerHeightM!==settings.observerHeightM||
  Object.entries(fine.constraints).some(([key,value])=>settings[key]!==value)) {
  throw new Error('Fine demonstration audit does not match the current dataset or settings.');
}
const recommendationSource='data/recommendation-fine-validation.json';
const recommendationBytes=await read(recommendationSource);
const recommendation=JSON.parse(recommendationBytes);
const search=searchWindows(bundle.sites,{...settings,minPatchCoverage:1,stepHours:6});
const report={
  generatedAt:new Date().toISOString(),generator:'scripts/snapshot-demo.mjs',dataset,
  datasetSha256:hash(bytes),analysisSha256:hash(await read('src/analysis.js')),settings,
  sites:bundle.sites.map(site=>({
    location:Object.fromEntries(['id','name','lat','lon','elevationM'].map(key=>[key,site[key]])),
    result:compact(analyzeSite(site,settings)),
  })),
  southeast:{id:southeast.id,dxM:southeast.dxM,dyM:southeast.dyM,
    result:compact(analyzeSite({...site,...southeast,patches:[]},settings))},
  search:{...search,candidates:search.candidates.filter(item=>item.feasible).slice(0,3),
    candidateSelection:'First three feasible candidates under the declared search ranking. Full earliestFeasible and Pareto sets are retained.'},
  finerCheck:{source:fineSource,sha256:hash(fineBytes),
    center:fine.cases.center.fiveMinuteWithFineHorizon,
    southeast:fine.cases.southeast.fiveMinuteWithFineHorizon},
  recommendationCheck:{source:recommendationSource,sha256:hash(recommendationBytes),
    start:recommendation.start,sampleIntervalMinutes:recommendation.sampleIntervalMinutes,
    coverage:recommendation.coverage,summaries:recommendation.summaries},
};
await writeFile(path.join(root,'docs/demo-evidence.json'),JSON.stringify(report,null,2)+'\n');
console.log(`Demo evidence regenerated: ${search.evaluatedCount} search trials; first feasible ${report.search.candidates[0]?.siteId} at ${report.search.candidates[0]?.start}.`);
