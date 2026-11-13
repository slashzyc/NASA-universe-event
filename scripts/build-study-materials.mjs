/** R06 materials only: no participants, timings or study outcomes are generated. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {analyzeSite,searchWindows,stressTestSite} from '../src/analysis.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'docs/study');await mkdir(output,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const analysisSha256=hash(await readFile(path.join(root,'src/analysis.js')));
const generatedAt=new Date().toISOString();
const definitions=[
  {id:'A',campaign:'jun',file:'lunar-sites-june.json',siteId:'ridge-4',start:'2027-06-21T18:00:00Z'},
  {id:'B',campaign:'mar',file:'lunar-sites-march.json',siteId:'ridge-1',start:'2027-03-04T18:00:00Z'},
];
const baseline={durationHours:168,maxDarkHours:24,maxCommGapHours:24,minJointHours:24,clearanceDeg:0,observerHeightM:2,nominalStepHours:.5};
const screening={generatedAt,analysisSha256,rule:'Retain center-pass, 8/9 scenarios before the fixed A/B structural choice. No human outcomes were available.',evaluatedCount:0,inputs:[],candidates:[]};
for(const [campaign,file]of[['jun','lunar-sites-june.json'],['mar','lunar-sites-march.json'],['dec','lunar-sites.json']]){
  const bytes=await readFile(path.join(root,'data',file)),bundle=JSON.parse(bytes);
  screening.inputs.push({file,sha256:hash(bytes)});
  for(const site of bundle.sites)for(let epoch=Date.parse(bundle.start);epoch<=Date.parse(bundle.stop)-168*3600000;epoch+=6*3600000){
    const settings={...baseline,start:new Date(epoch).toISOString()},result=analyzeSite(site,settings);screening.evaluatedCount++;
    if(result.centerFeasible&&result.patchStats.feasibleCount===8)screening.candidates.push({campaign,siteId:site.id,settings,centerMetrics:result.metrics,failedPoints:result.patchStats.scenarios.filter(p=>p.feasible!==true).map(({id,metrics,reasons})=>({id,metrics,reasons}))});
  }
}
await writeFile(path.join(output,'case-screening.json'),JSON.stringify(screening,null,2)+'\n');
const records=[];
for(const def of definitions){
  const bytes=await readFile(path.join(root,'data',def.file)),bundle=JSON.parse(bytes);
  const settings={...baseline,start:def.start};
  const search=searchWindows(bundle.sites,{...settings,minPatchCoverage:1,stepHours:6});
  const shortlist=search.candidates.filter(item=>item.feasible).slice(0,3);
  assert.equal(shortlist.length,3);
  const plans=[{id:`${def.id}0`,siteId:def.siteId,start:def.start,delayHours:0,role:'initial'},
    ...shortlist.map((item,i)=>({id:`${def.id}${i+1}`,siteId:item.siteId,start:item.start,delayHours:item.delayHours,role:'alternative'}))].map(plan=>{
      const site=bundle.sites.find(item=>item.id===plan.siteId),applied={...settings,start:plan.start};
      const result=analyzeSite(site,applied);
      const points=[...site.patches].sort((a,b)=>b.dyM-a.dyM||a.dxM-b.dxM).map(p=>{
        const {timeline,patchStats,...result}=analyzeSite({...site,...p,patches:[]},applied);
        return {id:p.id,dxM:p.dxM,dyM:p.dyM,lat:p.lat,lon:p.lon,result,
          margins:{darknessHours:applied.maxDarkHours-result.metrics.longestDarkHours,
            earthGapHours:applied.maxCommGapHours-result.metrics.longestCommGapHours,
            jointHours:result.metrics.jointHours-applied.minJointHours}};
      });
      const query=new URLSearchParams({campaign:def.campaign,site:site.id,patch:'e+0-n+0',...applied,lang:'zh'});
      query.delete('nominalStepHours');
      return {...plan,siteName:site.name,settings:applied,appURL:`../../navigator.html?${query}`,
        centerFeasible:result.centerFeasible,feasibleCount:result.patchStats.feasibleCount,
        worstCase:result.patchStats.worstCase,points,stress:stressTestSite(site,applied)};
    });
  assert.equal(plans[0].centerFeasible,true);assert.equal(plans[0].feasibleCount,8);
  const failed=plans[0].points.filter(p=>p.result.centerFeasible===false);
  assert.equal(failed.length,1);assert.deepEqual(failed[0].result.reasons.map(r=>r.code),['dark-gap']);
  records.push({...def,generatedAt,analysisSha256,datasetSha256:hash(bytes),sources:bundle.sources,
    selection:{rule:'Fixed before observing human results: one failing sample, center passes, darkness-only failure, three feasible alternatives, same 168 h and 24/24/24 h conditions. Cases differ in month, site and failing direction.',
      screenedCandidateDefinition:`Three published campaigns, three sites, six-hour starts, 168 h and 24/24/24 h. ${screening.candidates.length} center-pass, 8/9 cases were found before choosing these two; no human observations were inspected.`,screeningRecord:'case-screening.json',
      empiricallyMatchedDifficulty:false},
    search:{evaluatedCount:search.evaluatedCount,stepHours:search.stepHours,ranking:search.ranking},plans});
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=x=>Number.isFinite(x)?x.toFixed(3):'未知 / unknown';
const time=s=>s.replace('T',' ').replace(/\.000Z$|Z$/,' UTC');
const direction=p=>{
  if(p.dxM===0&&p.dyM===0)return '中心 / C';
  return (p.dxM>0?'东':p.dxM<0?'西':'')+(p.dyM>0?'北':p.dyM<0?'南':'')+' / '+(p.dyM>0?'N':p.dyM<0?'S':'')+(p.dxM>0?'E':p.dxM<0?'W':'');
};
const status=p=>p.result.centerFeasible===null?'未知 / Unknown':p.result.centerFeasible?'通过 / Pass':'未通过 / Fail';
const reason=r=>r.code==='dark-gap'?`断光 > ${r.limit} h / darkness`:r.code==='comm-gap'?`地球空窗 > ${r.limit} h / Earth gap`:r.code==='joint-shortfall'?`共同可见 < ${r.limit} h / joint`:r.code;
const timeline=(p,s)=>`<svg viewBox="0 0 260 54" role="img" aria-label="${esc(direction(p))}：太阳、地球、共同可见的时间线，左端起始右端168小时 / visibility timelines"><rect width="260" height="54" fill="#e5e8e2"/>${['sun','earth','joint'].map((key,i)=>p.result.windows[key].map(w=>`<rect x="${(w.startMs-Date.parse(s.start))/(s.durationHours*3600000)*260}" y="${i*18+2}" width="${w.hours/s.durationHours*260}" height="14" fill="${['#9a6a33','#527592','#315f48'][i]}"/>`).join('')).join('')}</svg>`;
function planHTML(c,plan){
  const rows=plan.points.map(p=>`<tr id="${plan.id}-${p.id}"${p.result.centerFeasible===false?' style="background:#f8edde"':''}><th><a href="#${plan.id}-${p.id}">${direction(p)}</a><small>E ${p.dxM} / N ${p.dyM} m</small><small>${p.id}</small></th><td>${n(p.result.metrics.longestDarkHours)}<small>余量 ${n(p.margins.darknessHours)}</small></td><td>${n(p.result.metrics.longestCommGapHours)}<small>余量 ${n(p.margins.earthGapHours)}</small></td><td>${n(p.result.metrics.jointHours)}<small>余量 ${n(p.margins.jointHours)}</small></td><td>${status(p)}<small>${p.result.reasons.map(reason).join(', ')||'—'}</small></td><td class="chart">${timeline(p,plan.settings)}</td></tr>`).join('');
  const w=plan.worstCase;
  return `<section class="plan" id="${plan.id}"><div class="eyebrow">LUNAMARGIN / 静态对照材料 / STATIC CONDITION</div><h1>${plan.id} · ${plan.role==='initial'?'初始方案 / Initial plan':'候选方案 / Alternative'}</h1><p>${esc(plan.siteName)} · ${time(plan.settings.start)} · 168 h · 相对初始日期 +${plan.delayHours} h</p><p class="conditions">断光上限 / Max darkness ≤ 24 h · 地球不可见上限 / Max Earth gap ≤ 24 h · 共同可见下限 / Min joint ≥ 24 h<br>设备高度 / Device height 2 m · 附加角度 / Clearance 0° · 九点间距 / Spacing 25 m</p><p><strong>${plan.feasibleCount}/9</strong> 个离散样本通过 / samples pass. 最薄弱门槛余量 / smallest threshold margin <strong>${n(w.minimumMarginHours)} h</strong>。正值表示距条件边界尚有时间，负值表示超限；不是成功概率。</p><div class="table-wrap"><table><thead><tr><th>位置 / Point</th><th>最长断光 / Dark h</th><th>最长地球不可见 / Earth gap h</th><th>共同可见 / Joint h</th><th>判定 / Result</th><th>时间线 / Timelines<br><small>0 → 168 h · 太阳 Sun / 地球 Earth / 共同 Both</small></th></tr></thead><tbody>${rows}</tbody></table></div><p class="foot">三个最不利值及点 / Footprint extrema: dark ${n(w.metrics.longestDarkHours)} h (${w.points.longestDarkHours.id}); Earth gap ${n(w.metrics.longestCommGapHours)} h (${w.points.longestCommGapHours.id}); joint ${n(w.metrics.jointHours)} h (${w.points.jointHours.id}).</p><p class="foot">压力条件 / Added-angle stress: ${plan.stress.levels.map(l=>`+${l.incrementDeg.toFixed(2)}°: ${l.feasibleCount}/${l.count}, weakest margin ${n(l.worstCase.minimumMarginHours)} h`).join(' · ')}. 附加角度不是误差分布。</p><p class="foot">只表示日地中心的几何可见；不等于供电、可用通信或着陆安全。30 分钟星历、1° 地平线；边界为插值估计，任务边缘空窗可能继续。</p><p class="foot">点名链接可保留行位置；保存这份 HTML 后也保留全部数值。完整窗口与参数：<a href="study-cases.json">JSON</a> · <a href="study-values.csv">指标 / metrics CSV</a> · <a href="study-windows.csv">区间 / intervals CSV</a>。</p><footer>Case ${c.id} / plan ${plan.id} · data ${c.datasetSha256.slice(0,12)} · calculation ${analysisSha256.slice(0,12)}<br>生成 / generated ${generatedAt} · 材料准备完成，真人观察 0/5 / no human observations</footer></section>`;
}
const style=`*{box-sizing:border-box}body{margin:0;background:#eeeee7;color:#1d3227;font:14px/1.45 system-ui,"Microsoft YaHei",sans-serif}.cover,.plan{background:#fffef8;max-width:1180px;margin:28px auto;padding:36px 42px;border:1px solid #d6dacd}.eyebrow{font-size:11px;letter-spacing:1.5px;color:#766644}h1{font:500 29px/1.2 Georgia,"Microsoft YaHei",serif;margin:12px 0}h2{font-size:20px}a{color:#235e55}p{margin:10px 0}.conditions{padding:12px;background:#ecefe5}table{border-collapse:collapse;width:100%;font-size:12px}th,td{padding:8px;border-bottom:1px solid #d6dacd;text-align:left;vertical-align:middle}thead th{font-size:11px;background:#e6eadf}small{display:block;font-size:10px;color:#536052}tbody th{width:13%;font-weight:500}td.chart{width:27%}svg{width:100%;display:block;min-width:140px}.foot,footer{font-size:10px}footer{border-top:1px solid #d6dacd;margin-top:16px;padding-top:10px;color:#536052}:target{outline:2px solid #ae8043;outline-offset:2px}.table-wrap{overflow:auto}nav{display:flex;flex-wrap:wrap;gap:14px}@media(max-width:650px){.cover,.plan{padding:20px;margin:12px}table{min-width:850px}}@media print{@page{size:A4 landscape;margin:10mm}body{background:white}.cover{break-after:page}.cover,.plan{border:0;max-width:none;margin:0;padding:0}.plan{break-after:page;font-size:12px;line-height:1.15}h1{font-size:22px;margin:8px 0}.conditions{padding:6px}table{font-size:12px;line-height:1.1}th,td{padding:3px 5px}small{font-size:9px}.foot,footer{font-size:9px}p{margin:6px 0}footer{margin-top:10px;padding-top:8px}a{color:inherit;text-decoration:none}.table-wrap{overflow:visible}svg{max-height:28px}.plan:last-child{break-after:auto}}`;
const page=(title,body)=>`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${style}</style></head><body>${body}</body></html>`;
for(const c of records)await writeFile(path.join(output,`case-${c.id.toLowerCase()}-static.html`),page(`LunaMargin · Case ${c.id} · Static condition`,c.plans.map(p=>planHTML(c,p)).join('')));
await writeFile(path.join(output,'static-condition.html'),page('LunaMargin · Static comparison materials',`<main class="cover"><div class="eyebrow">R06 / MATERIALS ONLY</div><h1>同样的证据，两种呈现方式。</h1><p>Same decision evidence, two presentation conditions.</p><p>主持人按分配表一次只给一个案例；此索引包含两案例入口，不应提前向参与者展示答案或下一案例。</p><nav>${records.map(c=>`<a href="case-${c.id.toLowerCase()}-static.html">案例 / Case ${c.id} 静态表与时间线</a>`).join('')}<a href="app-condition.html">应用条件任务入口</a><a href="../USABILITY_TEST_KIT.md">主持人协议</a></nav><h2>信息核对 / Information parity</h2><p>每个案例包含初始方案与三个固定替代方案。两条件使用相同地点、日期、九点、三个指标与门槛、判定、分项余量、日地及共同可见窗口、四档角度压力结果。静态表由同一计算程序生成，浏览器中无需执行计算或加载应用。</p><p>比较范围限于给定方案的识别、选择、解释和保存；不是自由搜索能力对比。24 h 是教学阈值。案例难度仅按结构匹配，尚无真人预试。</p><p>目前 0/5 已测试，没有速度、正确率或引语结果。</p><p><a href="study-cases.json">完整案例与来源</a> · <a href="study-values.csv">逐点指标与阈值</a> · <a href="study-windows.csv">完整时间区间</a></p></main>`));
await writeFile(path.join(output,'app-condition.html'),page('LunaMargin · Application condition links',`<main class="cover"><div class="eyebrow">R06 / APPLICATION CONDITION</div><h1>应用条件入口 / Application condition</h1><p>主持人仅给当前分配案例。与静态条件相同的固定方案清单，按同样顺序呈现；不要用额外搜索扩大方案集合。</p>${records.map(c=>`<section><h2>Case ${c.id}</h2><nav>${c.plans.map(p=>`<a href="${esc(p.appURL)}" target="_blank">${p.id} · ${p.role==='initial'?'初始 / initial':'候选 / alternative'}</a>`).join('')}</nav></section>`).join('')}<p>每个入口打开真实应用及其相同任务条件，初始选中心。具体问题见任务卡。0/5 已测试。</p></main>`));
await writeFile(path.join(output,'study-cases.json'),JSON.stringify({schemaVersion:1,status:'materials-prepared-no-human-observations',generatedAt,analysisSha256,participantsTested:0,cases:records},null,2)+'\n');
const metricRows=[['case','plan','role','site_id','point_id','east_m','north_m','start_utc','durationHours','maxDarkHours','maxCommGapHours','minJointHours','clearanceDeg','observerHeightM','longestDarkHours','longestCommGapHours','jointHours','passes','reason_codes','dataset_sha256','analysis_sha256']];
const windowRows=[['case','plan','point_id','category','start_utc','end_utc','hours']];
for(const c of records)for(const p of c.plans)for(const point of p.points){
  metricRows.push([c.id,p.id,p.role,p.siteId,point.id,point.dxM,point.dyM,p.settings.start,...['durationHours','maxDarkHours','maxCommGapHours','minJointHours','clearanceDeg','observerHeightM'].map(k=>p.settings[k]),...['longestDarkHours','longestCommGapHours','jointHours'].map(k=>point.result.metrics[k]),point.result.centerFeasible,point.result.reasons.map(r=>r.code).join('|'),c.datasetSha256,analysisSha256]);
  for(const [category,windows] of Object.entries(point.result.windows))for(const w of windows)windowRows.push([c.id,p.id,point.id,category,w.start,w.end,w.hours]);
}
const csv=rows=>'\ufeff'+rows.map(row=>row.map(cell=>'"'+String(cell??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
await writeFile(path.join(output,'study-values.csv'),csv(metricRows));await writeFile(path.join(output,'study-windows.csv'),csv(windowRows));
console.log(JSON.stringify({cases:records.length,plans:records.reduce((n,c)=>n+c.plans.length,0),pointRows:metricRows.length-1,intervalRows:windowRows.length-1,participantsTested:0,analysisSha256}));
