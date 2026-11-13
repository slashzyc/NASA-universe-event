// Reproduce M03 from the unmodified published June terrain/ephemeris bundle.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {analyzeSite,searchWindows,stressTestSite,SEARCH_RANKING} from '../src/analysis.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>readFile(path.join(root,relative));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bundleBytes=await read('data/lunar-sites-june.json');
const bundle=JSON.parse(bundleBytes);
const settings={start:'2027-06-21T12:00:00Z',durationHours:168,maxDarkHours:24,maxCommGapHours:24,minJointHours:24,clearanceDeg:0,observerHeightM:2,nominalStepHours:.5};
const expected={'ridge-1':[[9,8.015],[9,8.403],[9,9.860],[9,14.954]],'ridge-4':[[9,23.749],[8,24.725],[8,46.209],[7,52.100]]};
const sites=bundle.sites.filter(s=>Object.hasOwn(expected,s.id));
const checks=[];
const results=sites.map(site=>{
  const stress=stressTestSite(site,settings);
  stress.levels.forEach((level,index)=>{
    assert.equal(level.feasibleCount,expected[site.id][index][0]);
    assert.ok(Math.abs(level.worstCase.metrics.longestDarkHours-expected[site.id][index][1])<.0006);
    assert.equal(level.allKnown,true);
    checks.push({id:`${site.id}/increment-${level.incrementDeg}`,status:'PASS',count:level.feasibleCount,worstDarkHours:level.worstCase.metrics.longestDarkHours});
  });
  const analyzed=analyzeSite(site,settings);
  return {siteId:site.id,sourceRoiNumber:site.sourceRoiNumber,lat:site.lat,lon:site.lon,
    centerMetrics:analyzed.metrics,centerFeasible:analyzed.centerFeasible,stress};
});
const search=searchWindows(bundle.sites,{...settings,start:'2027-06-02T06:00:00Z',minPatchCoverage:1,stepHours:6});
assert.equal(search.earliestFeasible[0].start,'2027-06-21T12:00:00.000Z');
assert.deepEqual(search.earliestFeasible.map(c=>c.siteId),['ridge-1','ridge-4']);
checks.push({id:'earliest-arrival-and-explicit-order',status:'PASS',start:search.earliestFeasible[0].start,order:search.earliestFeasible.map(c=>c.siteId)});
const report={
  schemaVersion:1,generatedAt:new Date().toISOString(),task:'M03',
  input:{path:'data/lunar-sites-june.json',sha256:hash(bundleBytes),generatedAt:bundle.generatedAt,sampleIntervalMinutes:bundle.sampleIntervalMinutes,
    sourceManifestSha256:hash(await read('data/source-manifest.json')),sources:bundle.sources},
  computation:{analysisPath:'src/analysis.js',analysisSha256:hash(await read('src/analysis.js')),scriptPath:'scripts/validate-robustness.mjs',scriptSha256:hash(await read('scripts/validate-robustness.mjs')),node:process.version},
  settings,incrementsDeg:[0,.02,.1,.25],ranking:SEARCH_RANKING,checks,results,
  earliestSearch:{baselineStart:search.baselineStart,stepHours:search.stepHours,evaluatedCount:search.evaluatedCount,excludedCount:search.excludedCount,earliestFeasible:search.earliestFeasible},
  interpretation:[
    'This reproduces the released 30-minute model. Five-minute independent-position queries are a separate M04 audit.',
    'The nine positions include the center. Their passing count is not an area fraction or landing-success probability.',
    'Angular increments are deterministic stress conditions, not calibrated terrain-error estimates.',
    'All three margins are reported in hours. Minimum margin is the smallest reported slack, not a weighted score. The preference order is explicit and preserves earliest feasible arrival.',
    'Unknown samples do not acquire a whole-footprint worst-case claim; partial known-subset extrema remain separately labeled.',
  ],
};
await writeFile(path.join(root,'data/robustness-validation.json'),JSON.stringify(report,null,2)+'\n');
const num=value=>value.toFixed(3);
const rows=report.results.flatMap(r=>r.stress.levels.map(l=>`| ROI ${r.sourceRoiNumber} | +${l.incrementDeg.toFixed(2)}° | ${l.feasibleCount}/${l.count} | ${num(l.worstCase.metrics.longestDarkHours)} | ${num(l.worstCase.metrics.longestCommGapHours)} | ${num(l.worstCase.metrics.jointHours)} | ${num(l.worstCase.minimumMarginHours)} |`));
const note=`# Footprint margins and deterministic sensitivity / 周边余量与确定性压力测试

Reproduced ${report.generatedAt}. This report addresses M03 using the unchanged published June 2027 bundle; it is separate from the real five-minute M04 audit.

## Conditions / 复现条件

Arrival **2027-06-21 12:00 UTC**, stay **168 hours**, observer **2 m** above terrain. Longest Sun-center gap ≤24 h, longest Earth-center gap ≤24 h, total simultaneous visibility ≥24 h. Baseline angular clearance is 0°. Every stress level is added to that baseline; a nonzero user baseline is never replaced or lowered.

## Measured results / 实际计算结果

| Location | Added angle | Samples passing | Worst darkness h | Worst Earth gap h | Minimum joint h | Smallest threshold margin h |
|---|---:|---:|---:|---:|---:|---:|
${rows.join('\n')}

All eight published review-baseline rows match (exact passing counts; reported durations rounded to three decimals). Full values, extremal point IDs, east/north offsets, all failed-sample reasons and source checksums are in [the machine-readable record](../data/robustness-validation.json).

## Why ROI 1 appears first / 为什么优先显示 ROI 1

From the default arrival, both sites first pass on **21 June 2027 at 12:00 UTC** on the same six-hour grid. At that time ROI 1 has a minimum threshold margin of **5.475 h**, limited by its worst Earth-view gap. ROI 4 has only **0.251 h (15.05 min)**, limited by darkness at its southwest sample, east −25 m / north −25 m. ROI 4 has slightly shorter darkness at its center, but the footprint tells a different story.

The ordering is public and deterministic: earliest arrival; then satisfies constraints; then fully known footprint; largest **smallest threshold margin**; then darkness, Earth-gap and simultaneous-time margins; then center metrics; finally site ID in codepoint order. The smallest margin is literally the minimum of the three shown hour differences. No weights or opaque score are used. This is a stated preference among feasible alternatives, not a claim of universal optimality. The Pareto comparison also includes worst-position components when all candidate footprints are known, so a trade-off is not erased by the preference order.

中文：先保留最早可行日期，再在同一日期中比较整组九点最薄弱的门槛余量。ROI 1 的最薄弱余量约 5.475 小时；ROI 4 的西南点距断光上限只剩约 15 分钟。中心与最不利点共同参与说明，不能只凭中心较好就认为整个取样组更宽裕。三类余量和对应点均保留，九点包含中心。

## Scope and verification / 范围与检查

- Nine discrete sampled positions are not a continuous-area estimate or success probability.
- Additional angles are deterministic geometric stress conditions, not a calibrated uncertainty interval.
- Any missing or unsupported position makes whole-footprint margins unknown. Known-subset extrema are separately labeled and never ranked as complete evidence.
- Source inputs and individual visibility calculations are unchanged. Search preference and reported summaries change; the real five-minute audit may reveal numerical sensitivity separately.
- Run \`node scripts/validate-robustness.mjs\` to regenerate this record.
- Run \`node --test tests/robustness.test.js tests/analysis.test.js\` for signed margins, ties, threshold equality, unknowns, nonzero baselines, date priority, stable ordering, candidate caps, infeasible cases and the review's numerical baseline.

Analysis SHA-256: \`${report.computation.analysisSha256}\`  
Published June bundle SHA-256: \`${report.input.sha256}\`
`;
await writeFile(path.join(root,'docs/ROBUSTNESS_VALIDATION.md'),note);
console.log(JSON.stringify({checks:checks.length,allPassed:true,order:search.earliestFeasible.map(c=>c.siteId),report:'data/robustness-validation.json'}));
