import {readManifest,verifiedText,importVerifiedAlgorithm,validDigest,inspectRecord,scenarioURL,sha256} from './provenance.js';
let analyzeSite,interpolateHorizon,stressTestSite,currentRelease,release,algorithmSource,datasetText,versionMode='current';
import {drawTerrain,drawHorizon} from './visuals.js';
import {interfaceCopy,presets,patchName,renderBeginnerView,renderDraft} from './navigator-ui.js';

import {worstCaseMarkup,stressMarkup} from './robustness-ui.js';
import {resolvePatch,adjacentPatch} from './selection.js';
import {missionBrief,comparisonCSV} from './evidence.js';
import {openEvidenceDrawer} from './evidence-drawer.js';
import {renderLinkedTime} from './time-link.js';
import {normalizeMissionConstraints,defaultMissionConstraints,assertMissionArrival,appendMissionConstraints,missionConstraintsFromParams,missionSearchRule} from './mission-constraints.js';
import {mountMissionConstraints} from './mission-constraints-ui.js';
import {populateValidation} from './validation-display.js';
import {loadValidationCatalog} from './validation-evidence.js';
import {buildRecordValidation,verifyRecordValidation} from './record-validation.js';
let auditCatalog=null;

const $=id=>document.getElementById(id), HOUR=3600000;
const arrivalUI=mountMissionConstraints($('mission-form'));
const validationPanel=document.createElement('section');validationPanel.id='science-validation';validationPanel.className='science-validation-panel';$('read-result').after(validationPanel);let validationKey='';
const validationStyles=document.createElement('link');validationStyles.rel='stylesheet';validationStyles.href=new URL('./validation-evidence.css',import.meta.url).href;document.head.append(validationStyles);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=1)=>Number.isFinite(n)?n.toFixed(d):'—';
const labels={en:{},zh:{navWorkspace:'任务工作台',navCompare:'地点比较',navMethod:'科学方法与来源 ↗',title:'每一次着陆，<br>都需要一点<em>余量。</em>',intro:'理想落点只是起点。看看时间、地形与位置的小幅变化，<br class="desktop-break">如何改变你的月面任务窗口。',loading:'正在读取月面研究资料…',missionHeading:'定义你的任务窗口',missionIntro:'设置任务能够承受的光照与通信空窗。',campaignLabel:'数据观测月份',dateLabel:'抵达日期 · UTC',hourLabel:'时间 · UTC',durationLabel:'任务时长',darkLabel:'允许的最长断光时间',commLabel:'允许的最长地球不可见时间',jointLabel:'所需日地共同可见时长',assumptions:'几何模型设置',clearanceLabel:'额外角度余量',fixedHeight:'观测设备固定在地表上方 2 米。周边位置是离散研究样本，不代表着陆误差概率分布。',analyze:'比较任务窗口',findWindow:'寻找更晚的可行窗口 →',scopeNote:'这里比较几何可见性。实际发电与通信还取决于面板、储能、天线和地面站。',landingFootprint:'落点周边采样',mapHint:'选择放大框内的点，查看当地地平线',passes:'满足条件',outside:'超出条件',horizonTitle:'着陆器能看见什么？',timelineTitle:'关注连续窗口，而非平均值。',timelineCaption:'一次持续空窗可能比很高的平均日照更重要。边界时间由星历采样点之间插值得到。',compareTitle:'把取舍摆在眼前，再做选择。',export:'导出证据 ↓',comparisonNote:'取样通过比例表示满足所设条件的位置占比，不是着陆成功概率。',closingTitle:'每一项判断，都有据可查。',closingBody:'真实 NASA 数据 · 可检查的假设 · 可复现的计算。<br>帮助你回答：“如果落在旁边，会有什么变化？”',exploreMethod:'了解科学方法 ↗',footerScope:'教育与任务探索 · 独立项目 · 不代表 NASA 背书',tour:'一分钟了解如何使用 ↗',methodTitle:'读懂每一幅图背后的证据。'}};
document.querySelectorAll('[data-i18n]').forEach(e=>labels.en[e.dataset.i18n]=e.innerHTML);
Object.assign(labels.en,interfaceCopy.en);Object.assign(labels.zh,interfaceCopy.zh);
let lang=localStorage.getItem('lunamargin-language')||(navigator.language.startsWith('zh')?'zh':'en'),data,selectedId='ridge-6',activePatch=null,results=[],terrainHits=[],timeIndex=0,playTimer=null,worker,searchId=0,searchResult=null,tourIndex=0;
let inputRevision=0,missionConstraints=null,pendingConstraintsError=null;
let settings={},campaign='jun',campaignLoading=false,campaignRequest=0,searchBusy=false,pendingPatch=null,storedEvidence=null;
const stressCache=new Map();
const campaigns={dec:{file:'lunar-sites.json',start:'2026-12-01',end:'2027-01-01'},mar:{file:'lunar-sites-march.json',start:'2027-03-01',end:'2027-04-01'},jun:{file:'lunar-sites-june.json',start:'2027-06-01',end:'2027-07-01'}};
const tr=(en,zh)=>lang==='zh'?zh:en;
const shortDate=value=>new Date(value).toISOString().slice(0,16).replace('T',' ')+' UTC';
const siteName=site=>tr(`Connecting Ridge · ${site.sourceRoiNumber?`ROI ${site.sourceRoiNumber}`:site.name}`,`连接脊 · 研究点 ${site.sourceRoiNumber||''}`);
const selectedSite=()=>data.sites.find(s=>s.id===selectedId)||data.sites[0];
const selectedResult=()=>results.find(r=>r.siteId===selectedId)||results[0];
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').hidden=true,3800);}
function setLanguage(){
  arrivalUI.render(lang);
  document.documentElement.lang=lang==='zh'?'zh-CN':'en';
  document.querySelectorAll('[data-i18n]').forEach(e=>e.innerHTML=(labels[lang]||labels.en)[e.dataset.i18n]||labels.en[e.dataset.i18n]);
  $('lang-toggle').textContent=lang==='zh'?'EN':'中文';
  $('lang-toggle').setAttribute('aria-label',lang==='zh'?'Switch to English':'切换为中文');
  for(const[selector,en,zh]of[
    ['.brand','LunaMargin home','LunaMargin 首页'],['header nav','Main navigation','主导航'],
    ['.repo-link','View source on GitHub','在 GitHub 查看项目源代码'],['.step-rail','Mission steps','任务步骤'],
    ['#site-tabs','Select a research site','选择研究地点'],['#preset-buttons','Mission examples','任务示例'],
    ['#read-result','Mission results','任务结果'],['.terrain-panel','Interactive lunar terrain map','可交互月面地形图'],
    ['#point-selector','Nine sampled landing positions','九个落点取样位置'],
    ['[data-close="method-dialog"]','Close science panel','关闭科学方法面板'],
    ['[data-close="tour-dialog"]','Close guided tour','关闭使用引导'],
    ['[data-close="export-dialog"]','Close export panel','关闭导出面板'],
    ['[data-close="share-dialog"]','Close share panel','关闭分享面板'],
  ])document.querySelector(selector)?.setAttribute('aria-label',tr(en,zh));
  document.querySelector('.skip-link').textContent=tr('Skip to mission workspace','跳转到任务工作台');
  document.querySelector('#method-dialog .panel-kicker').textContent=tr('SCIENCE / SOURCES / REPRODUCIBILITY','科学方法 / 数据来源 / 可复现');
  document.querySelector('#export-dialog .panel-kicker').textContent=tr('PORTABLE / REPRODUCIBLE / YOUR EVIDENCE','便于保存 / 可复现 / 你的证据');
  for(const [key,en,zh] of [['dec','December 2026','2026 年 12 月'],['mar','March 2027','2027 年 3 月'],['jun','June 2027','2027 年 6 月']]) $('campaign').querySelector(`[value="${key}"]`).textContent=tr(en,zh);
  for(const option of $('duration').options) option.textContent=tr(`${Number(option.value)/24} ${option.value==='24'?'day':'days'}`,`${Number(option.value)/24} 天`);
  for(const option of $('clearance').options) option.textContent=`${Number(option.value).toFixed(2)}° · ${Number(option.value)===0?tr('No extra angle','不加额外角度'):tr('Extra clearance','额外角度余量')}`;
  document.querySelectorAll('.chart-legend > span').forEach((e,i)=>{const name=tr(['Sun','Earth','Terrain'],['太阳','地球','地形'])[i];if(name)e.lastChild.textContent=name;});
  document.querySelector('.north-arrow').textContent=tr('↑ N','↑ 北');
  for(const[id,en,zh] of [['terrain-canvas','Terrain map. Arrow keys move north, south, west and east; edges stop movement.','地形图。方向键向北、南、西、东选择，边缘保持原位置。'],['horizon-canvas','Terrain horizon with Sun and Earth positions','地形轮廓与太阳、地球的位置'],['time-slider','Explore mission time','查看任务时间'],['share-point','Share the selected point and applied settings','分享选中的取样点与已应用条件']])$(id).setAttribute('aria-label',tr(en,zh));
  $('play-btn').setAttribute('aria-label',playTimer?tr('Pause time animation','暂停时间变化'):tr('Play time animation','播放时间变化'));
  $('export-html').textContent=tr('Readable mission brief · HTML ↓','可阅读任务简报 · HTML ↓');
  $('export-csv').textContent=tr('Comparison spreadsheet · CSV ↓','地点对比表格 · CSV ↓');
  $('export-json').textContent=tr('Full evidence record · JSON ↓','完整证据记录 · JSON ↓');
  $('version-heading').textContent=tr('Calculation version & saved records','计算版本与已保存记录');
  $('import-record').textContent=tr('Open a saved JSON record','打开已保存的 JSON 记录');
  $('record-title').textContent=tr('Review a saved calculation','复查已保存的计算');
  $('record-original').textContent=tr('Restore its original calculation','恢复记录中的原版计算');
  $('record-current').textContent=tr('Recalculate with the current version','明确使用当前版本重新计算');
  if(release)renderVersion();
  if(data){render();renderMethod();if(searchResult)renderSearch(false);}
  localStorage.setItem('lunamargin-language',lang);
}
function getSettings(){return{start:`${$('start-date').value}T${$('start-hour').value.includes(':')?$('start-hour').value:String($('start-hour').value).padStart(2,'0')+':00:00'}Z`,durationHours:Number($('duration').value),maxDarkHours:Number($('dark-limit').value),maxCommGapHours:Number($('comm-limit').value),minJointHours:Number($('joint-limit').value),clearanceDeg:Number($('clearance').value),observerHeightM:2,nominalStepHours:(data?.sampleIntervalMinutes||30)/60};}
function updateRangeLabels(){for(const key of ['dark','comm','joint'])$(key+'-value').textContent=$(key+'-limit').value+' h';const duration=Number($('duration').value);const jointMax=Math.max(duration,Number($('joint-limit').value));$('joint-limit').max=jointMax;$('joint-max').textContent=jointMax+' h';$('joint-value').textContent=$('joint-limit').value+' h';const end=Date.parse(campaigns[campaign].end)-duration*HOUR;$('start-date').max=new Date(end).toISOString().slice(0,10);for(const o of $('start-hour').options)o.disabled=$('start-date').value===$('start-date').max&&Number(o.value)>new Date(end).getUTCHours();if($('start-hour').selectedOptions[0]?.disabled)$('start-hour').value='0';}
function saveURL(){const params=new URLSearchParams();appendMissionConstraints(params,missionConstraints);for(const key of ['task','share']){const value=new URLSearchParams(location.search).get(key);if(value)params.set(key,value);}params.set('campaign',campaign);params.set('lang',lang);if(release){params.set('build',release.buildId);params.set('algo',release.identity.algorithm.sha256);params.set('data',release.identity.datasets[campaign].sha256);}params.set('site',selectedId);params.set('patch',resolvePatch(selectedSite().patches,activePatch)?.id||'');for(const[key,value]of Object.entries(settings))if(key!=='nominalStepHours')params.set(key,String(value));history.replaceState(history.state,'',`${location.pathname}?${params}${location.hash}`);}
function analyze(){
  if(!data||campaignLoading)return false;
  stopPlaying();updateRangeLabels();if(!$('mission-form').reportValidity())return false;
  const pending=getSettings();
  try{
    const pendingConstraints=assertMissionArrival(pending,arrivalUI.get(pending.start));
    const calculated=data.sites.map(s=>analyzeSite(s,pending));
    storedEvidence=null;settings=pending;missionConstraints=pendingConstraints;results=calculated;timeIndex=0;stressCache.clear();
    const restored=resolvePatch(selectedSite().patches,activePatch);activePatch=restored&&!(restored.dxM===0&&restored.dyM===0)?restored.id:null;
    searchId++;searchBusy=false;searchResult=null;$('search-results').hidden=true;
    render();saveURL();return true;
  }catch(error){notify(error.message);return false;}
}
function render(){
  if(!data||!results.length)return;
  const site=selectedSite(),result=selectedResult();
  $('selected-title').textContent=siteName(site);
  $('site-coordinates').textContent=`${Math.abs(site.lat).toFixed(4)}° S / ${site.lon.toFixed(4)}° E`;
  $('footprint-label').textContent=tr(`${result.patchStats.count} samples · 25 m apart`,`${result.patchStats.count} 个取样点 · 间隔 25 米`);
  renderInspectedMetrics();renderInsight(displayResult());renderTimeline(displayResult());renderTable();renderVisuals();
  $('sample-resolution').textContent=tr(`${data.sampleIntervalMinutes}-minute source samples`,`${data.sampleIntervalMinutes} 分钟星历采样`);
  renderBeginnerView({lang,site,sites:data.sites,result,inspected:displayResult(),patch:currentPatch(),settings,results});
  renderRobustness();updateDraftUI();renderValidation();window.dispatchEvent(new CustomEvent('lunamargin:state'));
}
function selectSite(id){inputRevision++;if(campaignLoading||!data.sites.some(s=>s.id===id))return;selectedId=id;activePatch=null;render();saveURL();}
function renderMetrics(r){
  const m=r.metrics,patch=r.patchStats;
  const cards=[
    {label:tr('Without the Sun','看不见太阳'),value:fmt(m.longestDarkHours),unit:'h',caption:tr(`Longest gap · limit ${settings.maxDarkHours} h`,`最长连续时间 · 上限 ${settings.maxDarkHours} 小时`),bad:m.longestDarkHours>settings.maxDarkHours},
    {label:tr('Without Earth in view','看不见地球'),value:fmt(m.longestCommGapHours),unit:'h',caption:tr(`Longest gap · limit ${settings.maxCommGapHours} h`,`最长连续时间 · 上限 ${settings.maxCommGapHours} 小时`),bad:m.longestCommGapHours>settings.maxCommGapHours},
    {label:tr('Both in view','两者同时可见'),value:fmt(m.jointHours),unit:'h',caption:tr(`Total time · need ${settings.minJointHours} h`,`累计时间 · 至少 ${settings.minJointHours} 小时`),bad:m.jointHours<settings.minJointHours},
    {label:tr('Samples meeting limits','满足条件的取样点'),value:`${patch.feasibleCount}<span class="unit"> / ${patch.count}</span>`,unit:'',caption:tr('Whole group · not a probability','整组九点 · 不是成功率'),bad:!patch.allKnown||patch.feasibleCount<patch.count,positive:patch.allKnown&&patch.feasibleCount===patch.count},
  ];
  $('metrics').innerHTML=cards.map((c,i)=>`<button type="button" id="metric-${['longestDarkHours','longestCommGapHours','jointHours','footprint'][i]}" data-explain-metric="${['longestDarkHours','longestCommGapHours','jointHours','footprint'][i]}" class="metric metric-explain ${c.bad?'critical':c.positive?'positive':''}" aria-label="${escape(c.label+' · '+tr('Explain this result','解释这个结果'))}"><span class="metric-label">${c.label}</span><div class="metric-value">${c.value}<span class="unit">${c.unit}</span></div><p class="metric-caption">${c.caption} <span aria-hidden="true">↗</span></p></button>`).join('');
}
function renderInsight(r){
  const patch=currentPatch();
  $('insight').innerHTML=`<span class="insight-icon">↗</span><div><strong>${tr('Reading the view','读图提示')} · ${escape(patchName(patch,lang))}</strong><br>${tr('The solid curve is the terrain skyline. When the Sun or Earth drops below it, the terrain blocks the view. Move the time slider to see this change.','实线是地形的轮廓。太阳或地球落到它下方时，就会被地形挡住。拖动时间滑块，看看这个变化。')}</div>`;
}
function currentPatch(){return selectedSite().patches.find(p=>p.id===activePatch);}
function displayResult(){if(storedEvidence&&storedEvidence.selectedSiteId===selectedId&&storedEvidence.selectedPoint.id===(activePatch||'e+0-n+0'))return storedEvidence.selectedPoint.result;const patch=currentPatch();return patch?analyzeSite({...selectedSite(),...patch,samples:patch.samples||selectedSite().samples,patches:[]},settings):selectedResult();}
function renderVisuals(){
  if(!data||!results.length||!$('terrain-canvas'))return;
  const site=selectedSite(),center=site.patches.find(p=>!p.dxM&&!p.dyM);
  terrainHits=drawTerrain($('terrain-canvas'),site,selectedResult(),activePatch||center?.id,lang);
  renderHorizon();
}
function missionSamples(){const start=Date.parse(settings.start),end=start+settings.durationHours*HOUR;return selectedSite().samples.filter(s=>Date.parse(s.time)>=start&&Date.parse(s.time)<=end);}
function renderHorizon(){if(!data||!results.length||!$('time-slider'))return;const list=missionSamples();if(!list.length)return;timeIndex=Math.min(timeIndex,list.length-1);$('time-slider').max=list.length-1;$('time-slider').value=timeIndex;const sample=list[timeIndex],patch=currentPatch(),horizon=patch?.horizon||selectedSite().horizon;if($('horizon-canvas').getBoundingClientRect().width>0&&$('detail-charts')?.open)drawHorizon($('horizon-canvas'),horizon,sample,settings.clearanceDeg,lang,interpolateHorizon);$('time-label').textContent=shortDate(sample.time);const sunMargin=sample.sunEl-interpolateHorizon(horizon,sample.sunAz)-settings.clearanceDeg,earthMargin=sample.earthEl-interpolateHorizon(horizon,sample.earthAz)-settings.clearanceDeg;$('horizon-readout').innerHTML=`<span>${tr('Viewing','查看位置')} <strong>${escape(patchName(patch,lang))}</strong></span><span>${tr('Sun clearance','太阳余量')} <strong style="color:var(--amber)">${fmt(sunMargin,2)}°</strong></span><span>${tr('Earth clearance','地球余量')} <strong style="color:var(--earth)">${fmt(earthMargin,2)}°</strong></span><span>${tr('Includes extra margin','已扣除额外余量')} ${settings.clearanceDeg}°</span>`;renderLinkedTime({sample,point:patch||selectedSite().patches.find(p=>!p.dxM&&!p.dyM),site:selectedSite(),result:displayResult(),settings,sunMargin,earthMargin,index:timeIndex,count:list.length,lang});}
function renderTimeline(r){const start=Date.parse(settings.start),length=settings.durationHours*HOUR;const rows=[['sun',tr('Sun','太阳'),'sunHours'],['earth',tr('Earth','地球'),'earthHours'],['joint',tr('Both','共同可见'),'jointHours']];$('timeline').innerHTML=rows.map(([key,label,metric])=>`<div class="timeline-row"><span class="timeline-label">${label}</span><div class="timeline-track" role="img" aria-label="${escape(`${label}: ${fmt(r.metrics[metric])} ${tr('hours visible','小时可见')}`)}">${r.windows[key].map(p=>`<span class="timeline-segment ${key}" style="left:${Math.max(0,(Date.parse(p.start)-start)/length*100)}%;width:${p.hours/settings.durationHours*100}%" title="${escape(shortDate(p.start)+' → '+shortDate(p.end))}"></span>`).join('')}</div><span class="timeline-total">${fmt(r.metrics[metric])} h</span></div>`).join('')+`<div class="timeline-axis"><span>+0 h</span><span>+${settings.durationHours/2} h</span><span>+${settings.durationHours} h</span></div>`;}
function renderTable(){$('comparison-head').innerHTML=`<tr>${[tr('Research location','研究位置'),tr('Longest darkness','最长断光'),tr('Earth-view gap','地球不可见'),tr('Sun + Earth','日地共同可见'),tr('Footprint','周边取样'),tr('Center result','中心点结果')].map(t=>`<th scope="col">${t}</th>`).join('')}</tr>`;$('comparison-body').innerHTML=results.map(r=>{const site=data.sites.find(s=>s.id===r.siteId);return`<tr class="${r.siteId===selectedId?'selected-row':''}"><td><button class="row-select" data-site="${r.siteId}">${escape(siteName(site))}<small>${Math.abs(site.lat).toFixed(4)}° S · ${site.elevationM.toFixed(0)} m</small></button></td><td>${fmt(r.metrics.longestDarkHours)} h</td><td>${fmt(r.metrics.longestCommGapHours)} h</td><td>${fmt(r.metrics.jointHours)} h</td><td>${r.patchStats.feasibleCount} / ${r.patchStats.count}</td><td><span class="status-pill ${r.centerFeasible?'':'fail'}">${r.status!=='complete'?tr('Incomplete','数据不完整'):r.centerFeasible?tr('Within limits','满足条件'):tr('Outside limits','超出条件')}</span></td></tr>`;}).join('');$('comparison-body').querySelectorAll('button').forEach(b=>b.onclick=()=>{selectSite(b.dataset.site);$('read-result').scrollIntoView({behavior:'smooth',block:'start'});});}
function lockCampaign(locked){
  campaignLoading=locked;searchBusy=false;
  $('mission-form').querySelectorAll('input,select,button').forEach(e=>{if(e.id!=='campaign')e.disabled=locked;});
  $('export-btn').disabled=locked;
  if(data)updateDraftUI();
}
async function loadCampaign(key,initial=false){const request=++campaignRequest;searchId++;lockCampaign(true);$('campaign').value=key;stopPlaying();try{const descriptor=release.identity.datasets[key];if(initial&&params.has('data')&&params.get('data')!==descriptor.sha256)throw new Error('Saved dataset version does not match its release.');const raw=await verifiedText(descriptor,location.href);const incoming=JSON.parse(raw);if(request!==campaignRequest)return;if(!incoming.sites?.length)throw new Error('No valid sites in data bundle.');data=incoming;datasetText=raw;campaign=key;activePatch=initial?pendingPatch:null;pendingPatch=null;selectedId=data.sites.some(s=>s.id===selectedId)?selectedId:data.sites[0].id;$('start-date').min=campaigns[key].start;$('start-date').max=new Date(Date.parse(campaigns[key].end)-Number($('duration').value)*HOUR).toISOString().slice(0,10);if(!initial||!$('start-date').value.startsWith(campaigns[key].start.slice(0,7)))$('start-date').value=campaigns[key].start;if(initial&&($('start-date').value<$('start-date').min||$('start-date').value>$('start-date').max))$('start-date').value=$('start-date').min;lockCampaign(false);if(!initial||!params.has('start'))arrivalUI.rebase(getSettings().start);analyze();renderMethod();$('loading').hidden=true;$('app').hidden=false;$('compare').hidden=false;requestAnimationFrame(renderVisuals);}catch(error){if(request!==campaignRequest)return;$('campaign').value=campaign;lockCampaign(false);if(!data)$('loading').innerHTML=`<div><strong>${tr('The data could not be loaded.','数据加载失败。')}</strong><p>${escape(error.message)}</p><p>${tr('Serve the project through HTTP using node scripts/serve.mjs, then reload.','请通过本地 HTTP 服务打开项目，再刷新。')}</p><button onclick="location.reload()" class="secondary-btn">Retry / 重试</button></div>`;else notify(error.message);}}

function renderMethod(){const sourceList=data.sources.map(s=>`<div class="source-item"><strong>${escape(s.title)}</strong><p><a href="${escape(s.url)}" target="_blank" rel="noreferrer">${escape(s.url)} ↗</a>${s.paper?` · <a href="${escape(s.paper)}" target="_blank" rel="noreferrer">Publication ↗</a>`:''}</p></div>`).join('');$('method-body').innerHTML=tr(`<p>LunaMargin compares three published research positions in Connecting Ridge, near the lunar south pole. Each position has nine nearby terrain samples at 25 m spacing. The downloadable evidence records the exact inputs and computed intervals.</p><h3>1. Terrain determines the local horizon</h3><p>We combine NASA LOLA terrain at 5 m pixel spacing with an 80 m regional model. Spherical ray calculations extend 250 km in 360 geographic directions. The observer is fixed at 2 m above the surface. Pixel spacing describes the raster, not the effective measurement resolution; many cells are interpolated.</p><h3>2. NASA ephemerides determine the sky</h3><p>NASA/JPL Horizons provides airless Sun and Earth center azimuth and elevation at 30-minute UTC samples. A body is visible when its elevation exceeds the terrain horizon plus your chosen angular clearance. Transitions are estimated by linear interpolation of clearance. Short events and eclipses are outside this model.</p><h3>3. Limits determine the comparison</h3><p>We measure the longest continuous darkness, longest Earth-center visibility gap, and total simultaneous visibility within your mission. The footprint count is the number of sampled positions meeting all three limits. It is neither a success probability nor a continuous area estimate. Nearby positions reuse the center ephemerides; their terrain profiles are distinct.</p><h3>Scope that matters</h3><p>All three sites are nearby research cases, not official landing recommendations. Earth-center visibility is a geometric proxy, not a ground-station link. Sun-center visibility does not compute electrical power. DEM uncertainty is recorded, not converted into a probability. Outages touching a mission boundary can continue outside it. The horizon profile and sampled timing also limit event accuracy.</p>`,`<p>LunaMargin 比较月球南极连接脊的三个公开研究位置。每处包含间距 25 米的九个周边地形取样点。证据导出保留你的输入及计算得到的时间区间。</p><h3>1. 用真实地形建立地平线</h3><p>结合 NASA LOLA 5 米像素间距地形与 80 米区域模型，使用球面几何，沿 360 个地理方位追踪至 250 公里。设备固定在地表上方 2 米。像素间距不代表有效测量精度；很多网格来自插值。</p><h3>2. 用 NASA 星历确定天体位置</h3><p>NASA/JPL Horizons 提供每 30 分钟的太阳、地球中心方位角与仰角，时间为 UTC，不考虑大气折射。天体仰角超过地形地平线与用户设置的角度余量之和时，计为可见。跨越时刻通过余量线性插值估算；短时事件和食现象未纳入。</p><h3>3. 用任务条件进行比较</h3><p>计算任务内最长连续断光、地球中心不可见空窗及日地共同可见总时长。取样通过数表示同时符合三项条件的位置数，不是任务成功概率，也不是整个区域的面积比例。附近位置复用中心星历，同时使用各自的地形地平线。</p><h3>理解结果的适用范围</h3><p>三个位置均为邻近研究案例，不是官方着陆建议。地球中心可见性是几何指标，不等于某地面站的通信链路；太阳中心可见性也不等于发电量。地形误差保留为元数据，不转换成概率。空窗可能超出任务边界继续存在；地平线与时间采样也限制事件精度。</p>`)+`<h3>${tr('Source trail','数据来源')}</h3>${sourceList}<div class="source-item"><strong>${tr('Coordinates & measurements','坐标与测量数据')}</strong><p>${data.sites.map(s=>`${escape(siteName(s))}: ${s.lat.toFixed(6)}°, ${s.lon.toFixed(6)}° E; ${s.elevationM.toFixed(1)} m; LOLA height RMS ${fmt(s.heightRmsErrorM,3)} m`).join('<br>')}</p></div><h3>${tr('Inspect the complete record','检查完整记录')}</h3><p><a href="data/source-manifest.json" target="_blank">Source manifest & hashes ↗</a> · <a href="docs/METHODOLOGY.md" target="_blank">Methodology ↗</a> · <a href="docs/AI_DISCLOSURE.md" target="_blank">AI & development disclosure ↗</a> · <a href="docs/validation-results.json" target="_blank">Computed validation results ↗</a></p><p class="small">${tr('NASA Space Apps 2026 · Independent project. Developed before the official event at the project owner’s explicit request; award eligibility must be checked against event rules.','NASA Space Apps 2026 独立项目。按项目所有者明确要求，在官方开赛前开发；评奖资格需按赛事规则核实。')}</p>`;}
function findWindow(){
  if(!data||!analyze())return;
  const id=++searchId;searchBusy=true;updateDraftUI();
  if(!worker){
    worker=new Worker(new URL('./search-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data:message})=>{
      if(message.id!==searchId)return;
      searchBusy=false;updateDraftUI();
      if(message.error){searchResult={status:'failed',error:message.error,candidates:[],evaluatedCount:0};renderSearch();return;}
      searchResult=message.result;renderSearch();
    };
    worker.onerror=()=>{searchBusy=false;updateDraftUI();searchResult={status:'failed',error:tr('Search could not finish. Please try again.','搜索未能完成，请再试一次。'),candidates:[],evaluatedCount:0};renderSearch();worker.terminate();worker=null;};
  }
  worker.postMessage({id,algorithm:release.identity.algorithm,sites:data.sites,settings:{...settings,minPatchCoverage:1,stepHours:6},missionConstraints});
}
function renderRobustness(){
  const w=selectedResult().patchStats.worstCase;
  $('robustness-summary').textContent=tr(`Nine-point check · smallest margin ${fmt(w.minimumMarginHours,2)} h · inspect →`,`九点一起看 · 最薄弱余量 ${fmt(w.minimumMarginHours,2)} 小时 · 展开检查`);
  $('robustness-body').innerHTML=worstCaseMarkup(w,lang)+`<h3>${tr('Try a little extra angular clearance','再增加一点角度要求')}</h3>`+stressMarkup(currentStress(),lang);
}
function renderValidation(){const key=JSON.stringify([settings,selectedId,activePatch,lang,release?.buildId]);if(key===validationKey)return;validationKey=key;populateValidation(validationPanel,evidence(),{language:lang});}
function renderSearch(scroll=true){
  const r=searchResult;if(!r)return;
  $('search-results').hidden=false;
  if(r.status==='failed'){$('search-results').innerHTML=`<h2>${tr('Search failed; no decision was produced.','搜索失败，尚未得出判断。')}</h2><p>${escape(r.error||'')}</p><button id="retry-search" class="secondary-btn">${tr('Retry this search','按相同条件重试')}</button>`;$('retry-search').onclick=findWindow;return;}
  const passing=r.candidates.filter(c=>c.feasible),seen=new Set(),choices=(passing.length?passing:r.candidates).filter(c=>{if(seen.has(c.siteId))return false;seen.add(c.siteId);return true;}).slice(0,3);
  const partial=!r.searchCoverage?.complete,title=passing.length?tr('Alternatives inside your arrival limits.','任务抵达限制内的替代方案。'):r.status==='insufficient-data'?tr('Coverage is insufficient for a full decision.','数据覆盖不足，无法判断整个请求范围。'):tr('No feasible plan on this search grid.','本次搜索网格内没有满足条件的方案。');
  const preference=r.ranking?.preference==='margin'?tr('Largest weakest nine-point margin first, then the earliest arrival.','先比较九点最弱余量，余量更大优先；并列再取最早抵达。'):tr('Earliest arrival first, then the largest weakest nine-point margin.','先取最早抵达；同一时间再比较九点最弱余量。');
  const range=r.searchCoverage;
  $('search-results').innerHTML=`<p class="panel-kicker">${tr('MISSION-CONSTRAINED SEARCH','有任务边界的搜索')}</p><h2>${title}</h2><p class="search-explainer">${preference} ${tr('All candidates keep the same thresholds and 2 m model. Nine passing samples are required.','所有候选保持相同阈值与 2 米模型，要求九点均满足条件。')}</p><p class="search-explainer">${tr('Reference arrival','任务起算抵达')} ${shortDate(missionConstraints.referenceStart)}<br>${tr('Task deadline','任务截止')} ${range?.requestedLatest?shortDate(range.requestedLatest):tr('Not specified; legacy data-coverage limit','未设置；沿用数据覆盖范围')}<br>${tr('Checked through','已核查抵达至')} ${range?.effectiveLatest?shortDate(range.effectiveLatest):tr('No complete mission interval available','没有完整任务区间')} · ${r.evaluatedCount} ${tr('site/date trials','个地点/日期组合')} · ${r.stepHours||6} h ${tr('arrival grid','抵达步长')}</p>${partial?`<p class="pending-note">${tr('Part of the requested range has no complete data or was not evaluated. Results below describe only the checked dates; missing dates are not treated as infeasible or feasible.','部分请求日期没有完整数据或尚未评估。下方只说明已核查日期，缺数据的日期不判为失败或通过。')}</p>`:''}${!passing.length?`<p>${tr('No thresholds or waiting limits were relaxed. You may explicitly change the mission, or compare the failed candidates below.','没有放宽阈值或等待限制。你可以明确修改任务，或比较下方未通过的候选。')}</p>`:''}<button id="edit-arrival-constraints" class="secondary-btn compact">${tr('Review arrival limits','检查抵达限制')} ↗</button><div class="search-cards">${choices.map(c=>`<article class="search-card"><h3>${escape(siteName(data.sites.find(s=>s.id===c.siteId)))}</h3><p class="mono">${shortDate(c.start)} · +${fmt((Date.parse(c.start)-Date.parse(missionConstraints.referenceStart))/HOUR,1)} h</p><p>${c.feasible?tr('Nine samples meet the nominal limits.','九点满足名义条件。'):tr('Does not meet all nine-point limits.','没有满足全部九点条件。')}</p><p>${tr('Center: darkness','中心：断光')} ${fmt(c.metrics.longestDarkHours)} h · ${tr('Earth gap','对地不可见')} ${fmt(c.metrics.longestCommGapHours)} h · ${tr('shared view','共同可见')} ${fmt(c.metrics.jointHours)} h</p><h4>${tr('The weakest of all nine','整组九点的最不利位置')}</h4>${worstCaseMarkup(c.worstCase,lang)}<div class="candidate-validation" data-validation-site="${c.siteId}" data-validation-start="${c.start}"></div><button class="primary-btn" data-start="${c.start}" data-site="${c.siteId}">${c.feasible?tr('Use this allowed window →','采用这个允许范围内的窗口 →'):tr('Inspect this failed candidate →','查看这个未通过候选 →')}</button></article>`).join('')}</div><p class="search-explainer">${tr('Nominal screening only. Five-minute audits cover named cases, not every search result.','这里给出名义筛选结果。五分钟审计只覆盖指定案例，不代表全部搜索结果已精算。')}</p>`;
  $('search-results').querySelectorAll('[data-validation-site]').forEach(node=>populateValidation(node,{settings:{...settings,start:node.dataset.validationStart},selectedSiteId:node.dataset.validationSite,selectedPoint:{id:'e+0-n+0'},provenance:{algorithmSha256:release.identity.algorithm.sha256,datasetSha256:release.identity.datasets[campaign].sha256}},{language:lang,compact:true}));
  $('edit-arrival-constraints').onclick=()=>{$('arrival-constraints').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'center'});$('arrival-bound-mode').focus({preventScroll:true});};
  $('search-results').querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>{fillConditions({...settings,start:b.dataset.start});selectedId=b.dataset.site;activePatch=null;analyze();$('read-result').scrollIntoView({behavior:'smooth',block:'start'});});
  if(scroll)$('search-results').scrollIntoView({behavior:'smooth',block:'start'});
}

function evidence(){
  if(storedEvidence&&storedEvidence.selectedSiteId===selectedId&&storedEvidence.selectedPoint.id===(activePatch||'e+0-n+0'))return structuredClone(storedEvidence);
  const site=selectedSite(),point=resolvePatch(site.patches,activePatch);
  saveURL();
  const record={project:'LunaMargin',schemaVersion:3,language:lang,exportedAt:new Date().toISOString(),campaign,settings:{...settings},missionConstraints:{...missionConstraints},selectedSiteId:selectedId,
    selectedPoint:{id:point.id,siteId:selectedId,dxM:point.dxM,dyM:point.dyM,lat:point.lat,lon:point.lon,elevationM:point.elevationM,isCenter:!point.dxM&&!point.dyM,result:displayResult()},
    provenance:{buildId:release.buildId,calculationBuildId:release.buildId,interfaceBuildId:currentRelease.buildId,algorithmSha256:release.identity.algorithm.sha256,datasetSha256:release.identity.datasets[campaign].sha256,
      modelMethodVersion:release.identity.methodVersion,observerHeightM:settings.observerHeightM,verification:'sha256-verified',
      manifestURL:new URL(`evidence-assets/build-${release.buildId}.json`,location.href).href,
      interfaceManifestURL:new URL(`evidence-assets/build-${currentRelease.buildId}.json`,location.href).href,
      algorithmSnapshotURL:new URL(release.identity.algorithm.snapshot,location.href).href,
      datasetSnapshotURL:new URL(release.identity.datasets[campaign].snapshot,location.href).href,
      sourceIdentity:release.identity.sourceIdentity},
    inputSnapshot:{format:'utf8-json',sha256:release.identity.datasets[campaign].sha256,text:datasetText},
    algorithmSnapshot:{format:'javascript-source',sha256:release.identity.algorithm.sha256,text:algorithmSource},
    shareURL:location.href,stressTest:currentStress(),searchRule:missionSearchRule(missionConstraints),
    data:{generatedAt:data.generatedAt,referenceFrame:data.referenceFrame,start:data.start,stop:data.stop,sampleIntervalMinutes:data.sampleIntervalMinutes,horizonMethod:data.horizonMethod,sources:data.sources,limitations:data.limitations},
    sites:data.sites.map(s=>({id:s.id,name:s.name,lat:s.lat,lon:s.lon,elevationM:s.elevationM,slopeDeg:s.slopeDeg,heightRmsErrorM:s.heightRmsErrorM,ephemerisSources:s.ephemerisSources,patches:s.patches.map(({id,dxM,dyM,lat,lon,elevationM})=>({id,dxM,dyM,lat,lon,elevationM}))})),
    results:results.map(({timeline,...r})=>r),interpretation:'Geometric screening, not flight safety, power or radio-link assurance. Footprint fractions are discrete scenario counts, not probabilities.'};
  record.validationEvidence=buildRecordValidation(record,currentRelease,auditCatalog);return record;
}
function renderVersion(){
  const messages={
    current:tr('This calculation uses verified, saved algorithm and data snapshots.','本次计算使用已核对并保存的算法与数据快照。'),
    matched:tr('The shared version matches this calculation.','分享记录的版本与本次计算一致。'),
    archived:tr('Restored the original calculation version. The interface is current; the algorithm and data come from the saved version.','已恢复记录中的原版计算。界面使用当前版本，算法和数据使用保存的原版本。'),
    unversioned:tr('This entry did not record a version. These results use the verified version shown below.','此入口未记录历史版本，本次结果采用下方已核对的版本。'),
    recalculated:tr('Recalculated with the current version at your request. This is a new calculation, not the original saved result.','已按你的选择使用当前版本重算。这是新的计算，不冒充原记录的结果。'),
  };
  const id=release.buildId;
  $('version-details').innerHTML=`<p class="${['archived','recalculated'].includes(versionMode)?'version-note':''}">${messages[versionMode]}</p><p>${tr('Calculation version','计算版本')} <code>${id.slice(0,12)}</code> · ${tr('Algorithm','算法')} <code>${release.identity.algorithm.sha256.slice(0,12)}</code><br><a href="evidence-assets/build-${id}.json" target="_blank" rel="noreferrer">${tr('Inspect exact version & input snapshots ↗','查看完整版本与输入快照 ↗')}</a></p>`;
  if(['archived','recalculated'].includes(versionMode))$('version-panel').open=true;
}
async function initializeCalculation(){
  try{
    if(pendingConstraintsError)throw pendingConstraintsError;
    if(params.has('start'))normalizeMissionConstraints(undefined,{start:params.get('start')});
    currentRelease=await readManifest(new URL('build-info.json',location.href));
    auditCatalog=await loadValidationCatalog({release:currentRelease,baseUrl:new URL('.',location.href)}).catch(()=>null);
    const requested=params.get('build');
    if(requested&&!validDigest(requested))throw new Error('Invalid saved version identifier.');
    release=requested&&requested!==currentRelease.buildId?await readManifest(new URL(`evidence-assets/build-${requested}.json`,location.href),requested):currentRelease;
    for(const[id,d]of Object.entries(release.identity.datasets))if(!campaigns[id]){campaigns[id]={start:d.start.slice(0,10),end:d.stop};$('campaign').add(new Option(d.start.slice(0,10)+' / NASA',id));}
    if(params.has('algo')&&params.get('algo')!==release.identity.algorithm.sha256)throw new Error('Saved algorithm version does not match its release.');
    const requestedCampaign=campaigns[params.get('campaign')]?params.get('campaign'):'jun',height=release.identity.datasets[requestedCampaign].observerHeightM;
    if(height!==2||params.has('observerHeightM')&&Number(params.get('observerHeightM'))!==height)throw new Error(tr('This calculation version does not support the requested device height.','此计算版本不支持请求的设备高度。'));
    const algorithm=await importVerifiedAlgorithm(release.identity.algorithm,location.href);algorithmSource=algorithm.source;
    ({analyzeSite,interpolateHorizon,stressTestSite}=algorithm.module);
    if(![analyzeSite,interpolateHorizon,stressTestSite].every(f=>typeof f==='function'))throw new Error('Saved calculation API is unsupported.');
    versionMode=params.has('recalculated')?'recalculated':requested&&requested!==currentRelease.buildId?'archived':requested?'matched':params.has('site')||params.has('start')?'unversioned':'current';
    renderVersion();await loadCampaign(campaigns[params.get('campaign')]?params.get('campaign'):'jun',true);
  }catch(error){
    $('loading').hidden=false;$('app').hidden=true;$('compare').hidden=true;
    const retry=new URL(location.href);for(const key of ['build','algo','data'])retry.searchParams.delete(key);retry.searchParams.set('recalculated','1');retry.searchParams.set('observerHeightM','2');
    $('loading').innerHTML=`<div><strong>${tr('The saved calculation could not be verified.','无法核对保存的计算版本。')}</strong><p>${tr('Its version, inputs or snapshots could not be verified. No replacement calculation has been made.','无法核对版本、输入或快照，尚未用其他条件替换计算。')}</p><p>${escape(error.message)}</p><a class="secondary-btn" href="${escape(retry.href)}">${tr('Choose a new calculation with the current 2 m model →','选择以当前 2 米模型开展新计算 →')}</a></div>`;
  }
}
async function openSavedRecord(file){
  if(!file||!currentRelease)return;
  $('record-dialog').showModal();$('record-original').disabled=true;$('record-current').disabled=true;
  $('record-body').textContent=tr('Checking the record and saved input bytes…','正在核对记录与保存的输入字节…');
  try{
    if(file.size>50_000_000)throw new Error('Record exceeds the supported 50 MB size.');
    const record=JSON.parse(await file.text()),inspection=await inspectRecord(record,currentRelease);
    const result=record.selectedPoint?.result||record.results?.find(r=>r.siteId===record.selectedSiteId);
    const headings={legacy:tr('Version unknown','版本未知'),build:tr('Application version differs','应用版本不同'),algorithm:tr('Algorithm differs','算法不同'),data:tr('Dataset differs','数据不同')};
    const difference=inspection.differences.length?inspection.differences.map(k=>headings[k]).join(' · '):tr('Same verified version','相同已核对版本');
    $('record-body').replaceChildren();
    const add=text=>{const p=document.createElement('p');p.textContent=text;$('record-body').append(p);};
    add(difference);add(tr('These are the values stored in your file, before any recalculation.','以下是文件中保存的结果，尚未重新计算。'));
    add(`${record.selectedSiteId} · ${record.selectedPoint?.id||'center'} · ${record.settings.start}`);
    if(result?.metrics)add(tr(`Saved darkness ${fmt(result.metrics.longestDarkHours,3)} h · Earth gap ${fmt(result.metrics.longestCommGapHours,3)} h · shared view ${fmt(result.metrics.jointHours,3)} h`,`记录的断光 ${fmt(result.metrics.longestDarkHours,3)} h · 地球不可见 ${fmt(result.metrics.longestCommGapHours,3)} h · 共同可见 ${fmt(result.metrics.jointHours,3)} h`));
    add(inspection.snapshotStatus==='verified'?tr('Embedded input snapshot: SHA-256 verified.','内嵌输入快照：SHA-256 校验通过。'):tr('This file has no embedded input snapshot. Its original input availability must be checked separately.','此文件没有内嵌输入快照，需要另行核对原始输入是否仍可获取。'));
    $('record-current').disabled=false;$('record-current').onclick=()=>location.assign(scenarioURL(record,location.href,{current:true}));
    if(inspection.legacy){add(tr('An older record cannot establish its original version. You may explicitly start a new calculation.','旧格式记录无法确认原始版本；你可以明确选择开展一次新计算。'));return;}
    try{
      const original=await readManifest(new URL(`evidence-assets/build-${record.provenance.buildId}.json`,location.href),record.provenance.buildId);
      if(original.identity.algorithm.sha256!==record.provenance.algorithmSha256||original.identity.datasets[inspection.campaign]?.sha256!==record.provenance.datasetSha256)throw new Error('Recorded version fingerprints disagree.');
      if(record.settings.observerHeightM!==original.identity.datasets[inspection.campaign].observerHeightM)throw new Error('The recorded height does not match the input snapshot.');
      await Promise.all([verifiedText(original.identity.algorithm,location.href),verifiedText(original.identity.datasets[inspection.campaign],location.href)]);
      add(tr('The original calculation snapshots are available and verified.','原版计算快照可获取，且已校验通过。'));
      $('record-original').disabled=false;$('record-original').onclick=()=>location.assign(scenarioURL(record,location.href));
    }catch(error){add(tr('The original snapshots are unavailable or fail verification. The saved values above remain available; current-version recalculation requires your explicit choice.','原版快照缺失或未通过校验。上方仍保留文件中的旧结果；只有明确选择后才会使用当前版本重算。'));}
  }catch(error){$('record-body').textContent=tr('This record could not be verified: ','记录无法通过校验：')+error.message;}
}
function currentStress(){const key=selectedId+JSON.stringify(settings);if(!stressCache.has(key))stressCache.set(key,stressTestSite(selectedSite(),settings));return stressCache.get(key);}
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
async function ensureExportReady(){if(storedEvidence||auditCatalog)return true;try{auditCatalog=await loadValidationCatalog({release:currentRelease,baseUrl:new URL('.',location.href)});render();return true;}catch(error){notify(tr('The validation catalog could not be verified. The preview remains available; retry Save or Export when connected. ','核验目录暂未校验成功。可以继续预览；恢复连接后请重试保存或导出。 ')+error.message);return false;}}
async function exportEvidence(){if(updateDraftUI()||!await ensureExportReady())return;const doc=evidence();download(JSON.stringify(doc,null,2),`lunamargin-${campaign}-${settings.start.slice(0,10)}-evidence.json`,'application/json');notify(tr('Evidence exported with sources, assumptions, and every window.','已导出证据：包含来源、假设及全部窗口。'));}
function renderInspectedMetrics(){
  const patch=currentPatch(),r=displayResult();renderMetrics({...r,patchStats:selectedResult().patchStats});
  $('inspection-context').textContent=tr(`Viewing ${patchName(patch,lang).toLowerCase()} · first three numbers are for this point; the last counts all nine.`,`当前查看${patchName(patch,lang)} · 前三项是这个点，最后一项统计整组九点。`);
}
async function exportCSV(){if(updateDraftUI()||!await ensureExportReady())return;download(comparisonCSV(evidence()),`lunamargin-${settings.start.slice(0,10)}-centers-and-samples.csv`,'text/csv;charset=utf-8');notify(tr('Exported centers and all samples, with the selected point marked.','已导出中心与全部取样点，并标记当前选择。'));}
async function exportHTML(){if(updateDraftUI()||!await ensureExportReady())return;download(missionBrief(evidence()),`lunamargin-${settings.start.slice(0,10)}-${resolvePatch(selectedSite().patches,activePatch).id}-${lang}-brief.html`,'text/html');notify(tr('Your selected point and applied settings are saved.','已保存当前取样点与已应用设置。'));}
function stopPlaying(){if(playTimer){clearInterval(playTimer);playTimer=null;}const button=$('play-btn');if(button){button.textContent='▶';button.setAttribute('aria-label',tr('Play time animation','播放时间变化'));}}
window.addEventListener('lunamargin:home-root',event=>{if(event.detail?.active)stopPlaying();});
function togglePlaying(){if(playTimer){stopPlaying();return;}if(matchMedia('(prefers-reduced-motion: reduce)').matches){notify(tr('Use the time slider; reduced-motion is enabled.','已启用减少动态效果，请使用时间滑块。'));return;}$('play-btn').textContent='Ⅱ';$('play-btn').setAttribute('aria-label',tr('Pause time animation','暂停时间变化'));playTimer=setInterval(()=>{const count=missionSamples().length;timeIndex=(timeIndex+1)%count;renderHorizon();},250);}
function showTour(){
  const steps=tr([
    ['Start with one real example.','Choose “Try the example” to load a seven-day stay at Ridge 6. Everything is already filled in. The three steps at the top take you to a place, your mission, and the result.'],
    ['Read the sentence before the numbers.','The center meets the example limits, but only eight of nine samples do. This is a count of tested locations, not a chance of landing successfully.'],
    ['Move 25 meters. See the difference.','Choose the southeast point in the nine-button grid. Its longest time without the Sun is about 167.5 hours. Choose the center to compare. The explanation always follows your selected point.'],
    ['Try a different date. Keep what you learn.','Use “Find a later date” to search this month. Adopt a returned window, or change a preset and select “View mission results”. Save the brief when you want to keep the results.']
  ],[
    ['先从一个真实案例开始。','点击“从示例开始”，即可载入连接脊 6 的七天任务，所有条件都已填好。上方三步入口分别带你选地点、设任务和看结果。'],
    ['先读一句结论，再看数字。','示例的中心点满足条件，但九个取样点中只有八个满足。这是检查过的位置数量，不是着陆成功率。'],
    ['移动 25 米，看看有什么不同。','点选九宫格中的东南点。它最长约有 167.5 小时看不见太阳，再点中心作比较。上方结论和点选区摘要会跟随你选择的位置变化。'],
    ['换个日期，把发现留下来。','点击“帮我找更晚的日期”搜索当前月份，并采用返回的窗口。也可以换个预设，再点“查看任务结果”。最后保存简报，留下你的探索结果。']
  ]);
  $('tour-step').textContent=tr(`QUICK GUIDE / ${tourIndex+1} OF 4`,`快速上手 / 第 ${tourIndex+1} 步，共 4 步`);
  $('tour-title').textContent=steps[tourIndex][0];$('tour-body').textContent=steps[tourIndex][1];
  $('tour-next').textContent=tourIndex===3?tr('Try it →','开始示例 →'):tr('Next →','下一步 →');
  if(!$('tour-dialog').open)$('tour-dialog').showModal();
}


function explainMetric(metric='overview'){
  if(!data||!results.length)return;
  openEvidenceDrawer(evidence(),{metric,language:lang,onLocate:({time,patchId})=>{
    if(patchId)selectPatch(patchId);
    if(time){const samples=missionSamples(),target=Date.parse(time);timeIndex=samples.reduce((best,item,index)=>Math.abs(Date.parse(item.time)-target)<Math.abs(Date.parse(samples[best].time)-target)?index:best,0);}
    $('detail-charts').open=true;renderHorizon();$('linked-sky').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});$('linked-time-slider').focus({preventScroll:true});
  }});
}
$('metrics').addEventListener('click',e=>{const b=e.target.closest('[data-explain-metric]');if(b)explainMetric(b.dataset.explainMetric);});

$('mission-form').onsubmit=e=>{e.preventDefault();if(analyze())$('read-result').scrollIntoView({behavior:'smooth',block:'start'});};$('lang-toggle').onclick=()=>{inputRevision++;lang=lang==='en'?'zh':'en';setLanguage();if(data)saveURL();};
labels.zh.exportTitle='把判断依据带走。';labels.zh.exportIntro='保存可阅读的任务简报、表格对比结果，或包含完整区间的计算记录。';
for(const id of ['dark-limit','comm-limit','joint-limit'])$(id).addEventListener('input',updateRangeLabels);
$('duration').onchange=updateRangeLabels;$('start-date').onchange=updateRangeLabels;$('campaign').onchange=()=>{inputRevision++;loadCampaign($('campaign').value);};
$('time-slider').oninput=()=>{stopPlaying();timeIndex=Number($('time-slider').value);renderHorizon();};$('play-btn').onclick=togglePlaying;
$('terrain-canvas').onclick=e=>{const r=$('terrain-canvas').getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;const hit=terrainHits.find(p=>Math.hypot(p.x-x,p.y-y)<16);if(hit)selectPatch(hit.id);};
$('terrain-canvas').onkeydown=e=>{if(data&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const next=adjacentPatch(selectedSite().patches,activePatch,e.key);if(next)selectPatch(next.id);}};
$('find-window').onclick=findWindow;$('export-btn').onclick=()=>$('export-dialog').showModal();$('export-json').onclick=exportEvidence;$('export-csv').onclick=exportCSV;$('export-html').onclick=exportHTML;
for(const id of ['method-open','sources-open'])$(id).onclick=()=>explainMetric('overview');
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('tour-start').onclick=()=>{tourIndex=0;showTour();};$('tour-next').onclick=()=>{if(tourIndex===3){$('tour-dialog').close();startExample();return;}tourIndex++;showTour();};
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderVisuals,100);});

function constraintsDirty(){if(!missionConstraints)return false;try{return JSON.stringify(arrivalUI.get(getSettings().start))!==JSON.stringify(missionConstraints);}catch{return true;}}
function updateDraftUI(){
  if(!data)return;
  const dirty=renderDraft({lang,draft:getSettings(),applied:settings,loading:campaignLoading,extraDirty:constraintsDirty()});
  if(dirty&&(searchBusy||searchResult)){searchId++;searchBusy=false;searchResult=null;$('search-results').hidden=true;}
  $('find-window').disabled=campaignLoading||searchBusy;
  $('find-window').textContent=searchBusy?tr('Finding a date…','正在寻找日期…'):dirty?tr('Apply & find a later date →','应用设置并找日期 →'):tr('Find a later date →','帮我找更晚的日期 →');
  return dirty;
}
function selectPatch(id){
  inputRevision++;
  if(campaignLoading)return;
  const patch=selectedSite().patches.find(p=>p.id===id);
  if(!patch)return;
  activePatch=!patch.dxM&&!patch.dyM?null:id;render();saveURL();
}
function applyPreset(key){inputRevision++;
  if(key==='custom'){$('advanced-settings').open=true;$('advanced-settings').scrollIntoView({behavior:'smooth',block:'center'});return;}
  if(!presets[key]||campaignLoading)return;
  for(const[field,id] of [['durationHours','duration'],['maxDarkHours','dark-limit'],['maxCommGapHours','comm-limit'],['minJointHours','joint-limit'],['clearanceDeg','clearance']])$(id).value=presets[key][field];
  updateRangeLabels();updateDraftUI();
}
async function startExample(){inputRevision++;
  if(campaignLoading)return;
  applyPreset('explorer');$('start-date').value='2027-06-02';$('start-hour').value='6';arrivalUI.set(defaultMissionConstraints('2027-06-02T06:00:00Z'));selectedId='ridge-6';pendingPatch=null;activePatch=null;
  $('advanced-settings').open=false;$('detail-charts').open=false;
  await loadCampaign('jun',true);
  $('read-result').scrollIntoView({behavior:'smooth',block:'start'});
}
$('site-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-site]');if(b)selectSite(b.dataset.site);});
$('point-selector').addEventListener('click',e=>{const b=e.target.closest('[data-patch]');if(b)selectPatch(b.dataset.patch);});
$('preset-buttons').addEventListener('click',e=>{const b=e.target.closest('[data-preset]');if(b)applyPreset(b.dataset.preset);});
$('mission-form').addEventListener('input',e=>{inputRevision++;if(data){if(['start-date','start-hour'].includes(e.target.id))arrivalUI.rebase(getSettings().start);updateRangeLabels();updateDraftUI();}});
$('mission-form').addEventListener('change',e=>{inputRevision++;if(data){if(['start-date','start-hour'].includes(e.target.id))arrivalUI.rebase(getSettings().start);updateRangeLabels();updateDraftUI();}});
$('pending-note').addEventListener('click',e=>{if(e.target.closest('#apply-pending'))$('mission-form').requestSubmit();});
$('example-start').onclick=startExample;
$('help-start').onclick=()=>{tourIndex=0;showTour();};
$('share-point').onclick=async()=>{if(updateDraftUI())return;saveURL();try{await navigator.clipboard.writeText(location.href);notify(tr('Link copied — it restores this exact point.','链接已复制，将恢复同一取样点。'));}catch{$('share-link').value=location.href;$('share-dialog').showModal();$('share-link').select();}};
$('save-brief').onclick=()=>{if(!updateDraftUI())exportHTML();};
$('import-record').onclick=()=>$('record-file').click();
$('record-file').onchange=()=>{const file=$('record-file').files[0];$('record-file').value='';openSavedRecord(file);};
$('inspect-risk').onclick=()=>{selectPatch($('inspect-risk').dataset.patch);$('read-result').scrollIntoView({behavior:'smooth',block:'start'});};
$('detail-charts').addEventListener('toggle',()=>{if($('detail-charts').open)requestAnimationFrame(renderHorizon);else stopPlaying();});

let params=new URLSearchParams(location.search);if(['en','zh'].includes(params.get('lang')))lang=params.get('lang');if(params.has('site'))selectedId=params.get('site');pendingPatch=params.get('patch');
for(const [param,id] of [['durationHours','duration'],['maxDarkHours','dark-limit'],['maxCommGapHours','comm-limit'],['minJointHours','joint-limit'],['clearanceDeg','clearance']])if(params.has(param)&&Number.isFinite(Number(params.get(param)))){const e=$(id),value=params.get(param),n=Number(value);if(n>=0&&n<=744){if(e.tagName==='SELECT'&&![...e.options].some(o=>o.value===value))e.add(new Option(value,value));if(e.type==='range'){e.max=Math.max(Number(e.max),n);e.step='any';}e.value=value;}}
if(params.has('start')&&Number.isFinite(Date.parse(params.get('start')))){const valid=new Date(params.get('start')).toISOString();$('start-date').value=valid.slice(0,10);const hour=valid.slice(14,23)==='00:00.000'?String(Number(valid.slice(11,13))):valid.slice(11,23);if(![...$('start-hour').options].some(o=>o.value===hour))$('start-hour').add(new Option(valid.slice(11,19),hour));$('start-hour').value=hour;}
function restoreConstraintsFromURL(){pendingConstraintsError=null;try{arrivalUI.set(missionConstraintsFromParams(params,{start:getSettings().start,newMission:!['start','site','campaign','task','share','build'].some(key=>params.has(key))}));}catch(error){pendingConstraintsError=error;arrivalUI.set(undefined,getSettings().start);}}
restoreConstraintsFromURL();
function state(){return{revision:inputRevision,missionConstraints:missionConstraints?{...missionConstraints}:null,interfaceBuildId:currentRelease?.buildId,algorithmSha256:release?.identity.algorithm.sha256,datasetSha256:release?.identity.datasets[campaign]?.sha256,language:lang,campaign,siteId:selectedId,patchId:activePatch||'e+0-n+0',settings:{...settings},dirty:!!data&&!!$('mission-form')&&(constraintsDirty()||Object.entries(getSettings()).some(([k,v])=>k==='start'?Date.parse(v)!==Date.parse(settings[k]):v!==settings[k])),ready:!!data&&results.length>0,buildId:release?.buildId};}
function fillConditions(s){for(const[key,id]of[['durationHours','duration'],['maxDarkHours','dark-limit'],['maxCommGapHours','comm-limit'],['minJointHours','joint-limit'],['clearanceDeg','clearance']]){const el=$(id);if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===String(s[key])))el.add(new Option(String(s[key]),String(s[key])));if(el.type==='range'){el.max=Math.max(Number(el.max),s[key]);el.step='any';}el.value=s[key];}const dt=new Date(s.start).toISOString();$('start-date').value=dt.slice(0,10);const hr=dt.slice(14,23)==='00:00.000'?String(Number(dt.slice(11,13))):dt.slice(11,23);if(![...$('start-hour').options].some(o=>o.value===hr))$('start-hour').add(new Option(dt.slice(11,19),hr));$('start-hour').value=hr;}
async function applyURL(url){inputRevision++;params=new URL(url,location.href).searchParams;storedEvidence=null;if(['en','zh'].includes(params.get('lang')))lang=params.get('lang');selectedId=params.get('site')||selectedId;pendingPatch=params.get('patch');if(params.has('start'))fillConditions({...getSettings(),...Object.fromEntries([...params].filter(([key])=>['start','durationHours','maxDarkHours','maxCommGapHours','minJointHours','clearanceDeg'].includes(key)).map(([k,v])=>[k,k==='start'?v:Number(v)]))});restoreConstraintsFromURL();setLanguage();await initializeCalculation();}
async function restoreServerRecord(record,{shouldApply,verifyResults=false}={}){
  if(record.project!=='LunaMargin'||record.schemaVersion!==3||await sha256(record.inputSnapshot.text)!==record.provenance.datasetSha256)throw new Error('Saved input checksum mismatch.');
  const original=await readManifest(new URL(`evidence-assets/build-${record.provenance.buildId}.json`,location.href),record.provenance.buildId);
  if(original.identity.algorithm.sha256!==record.provenance.algorithmSha256||original.identity.datasets[record.campaign]?.sha256!==record.provenance.datasetSha256)throw new Error('Saved version fingerprints disagree.');
  const algorithm=await importVerifiedAlgorithm(original.identity.algorithm,location.href);
  const incoming=JSON.parse(record.inputSnapshot.text);if(incoming.observerHeightM!==record.settings.observerHeightM)throw new Error('Unsupported observer height.');
  if(verifyResults){
    const stable=v=>JSON.stringify(v,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
    const compare=(saved,actual,footprint=false)=>{for(const key of ['metrics','windows','centerFeasible','status','reasons',...(footprint?['patchStats']:[])])if(stable(saved?.[key])!==stable(actual[key]))throw new Error(tr('Saved result differs from its verified inputs. No replacement was displayed.','保存结果与已校验输入不一致，未替换当前结果。'));};
    for(const site of incoming.sites)compare(record.results.find(r=>r.siteId===site.id),algorithm.module.analyzeSite(site,record.settings),true);
    const site=incoming.sites.find(s=>s.id===record.selectedSiteId),point=site?.patches.find(p=>p.id===record.selectedPoint?.id);if(!site||!point)throw new Error('Saved point is outside verified coverage.');
    compare(record.selectedPoint.result,algorithm.module.analyzeSite({...site,...point,samples:point.samples||site.samples,patches:[]},record.settings));
  }
  await verifyRecordValidation(record,location.href);
  const restoredConstraints=assertMissionArrival(record.settings,normalizeMissionConstraints(record.missionConstraints,{start:record.settings.start}));
  if(shouldApply&&!shouldApply())return false;
  release=original;algorithmSource=algorithm.source;({analyzeSite,interpolateHorizon,stressTestSite}=algorithm.module);data=incoming;datasetText=record.inputSnapshot.text;campaign=record.campaign;campaigns[campaign]={start:data.start.slice(0,10),end:data.stop};
  if(!$('campaign').querySelector(`option[value="${CSS.escape(campaign)}"]`))$('campaign').add(new Option(data.start.slice(0,10)+' / NASA',campaign));$('campaign').value=campaign;
  $('start-date').min=data.start.slice(0,10);selectedId=record.selectedSiteId;activePatch=record.selectedPoint.isCenter?null:record.selectedPoint.id;settings={...record.settings};missionConstraints=restoredConstraints;fillConditions(settings);arrivalUI.set(restoredConstraints,settings.start);results=record.results;timeIndex=0;stressCache.clear();storedEvidence=structuredClone(record);versionMode=release.buildId===currentRelease.buildId?'matched':'archived';campaignLoading=false;lang=record.language==='zh'?'zh':'en';
  $('loading').hidden=true;$('app').hidden=false;$('compare').hidden=false;setLanguage();updateRangeLabels();render();renderVersion();renderMethod();saveURL();return true;
}
window.lunaMargin={ensureExportReady,getSearchResult:()=>searchResult,getCurrentRelease:()=>currentRelease,explainMetric,getState:state,getDraft:()=>data?getSettings():null,getEvidence:evidence,applyURL,restoreServerRecord,analyze,selectSite,selectPatch};
setLanguage();await initializeCalculation();
window.dispatchEvent(new CustomEvent('lunamargin:ready'));
const {startMissionService}=await import('./mission-service.js');startMissionService(window.lunaMargin);
