import {analyzeSite} from './analysis.js';

const $=id=>document.getElementById(id);
const english={};
document.querySelectorAll('[data-i18n]').forEach(element=>english[element.dataset.i18n]=element.innerHTML);
const chinese={
  navMission:'项目理念',navExperience:'交互体验',navScience:'科学依据',navLaunch:'进入导航仪',
  heroEyebrow:'从开放数据出发，探索月球南极',heroTitle:'留一点余量。<br>看见另一种<br><em>可能。</em>',
  heroDescription:'在月球上，几米之差，就能改变眼前的风景。<br>读懂光照、地形与时间，<br>从一个理想的点，走向一个更周全的计划。',
  heroLaunch:'探索月面导航仪',watchFilm:'观看短片',scroll:'向下探索',
  ribbonLabel:'立足开放科学',ribbonSub:'为 NASA Space Apps 2026 而作',ribbonNote:'真实数据 · 开源探索',
  missionOverline:'01 / 换一个位置，看见不同',missionTitle:'小小的位移。<br>不同的<em>地平线。</em>',
  missionCopy:'一个落点，看起来几乎完美。<br>那么，几米之外呢？<br><br>我们结合 NASA 地形与星历，让理想落点周围的空间，也成为决策的一部分。',
  sampleHeading:'连接脊 / 研究点 6',sampleHint:'选一个点，看看黑夜有多长。',diagramNote:'位置示意 · 九个真实地形取样点',
  darknessLabel:'最长连续断光时间',sunLabel:'太阳中心可见时长占比',sampleResult:'你设定的 24 小时断光上限',
  storyDisclosure:'使用 NASA 数据计算七天内的太阳中心可见性。这些是离散取样位置，不代表着陆成功概率。',
  inspectCase:'查看完整案例',missionBottom:'同一颗月球，同一段时间。<br><strong>截然不同的任务余量。</strong>',validationLink:'查看数值复核记录 ↗',
  experienceOverline:'02 / 从好奇，到理解',experienceTitle:'复杂的任务。<br><em>清晰的体验。</em>',
  experienceCopy:'看清复杂地形背后的选择。<br>让时间向前，目光越过地平线。<br>找到一个留有余量的窗口。',openWorkspace:'打开任务工作台',enterWorkspace:'进入任务工作台',
  step1Title:'设定你的任务。',step1Copy:'选择地点、抵达日期，以及任务能够承受的连续空窗。',
  step2Title:'看清每个取舍。',step2Copy:'比较附近位置的地平线、连续断光与地球可见窗口。',
  step3Title:'带走完整依据。',step3Copy:'寻找另一个时间窗口，导出假设、结果及对应的 NASA 数据来源。',
  scienceOverline:'03 / 每个结论，都有出处',scienceTitle:'从开放数据。<br>到<em>清晰判断。</em>',
  scienceCopy:'每一道地平线，都来自真实地形。<br>每一段时间窗口，都由星历计算。<br>每一个结果，都留下可复查的记录。',readMethod:'了解科学方法',
  source1:'从脚下的山脊到远方的地平线，还原月球表面的真实形状。',source2:'计算太阳与地球的位置，为每个研究地点找到对应的天空。',source3Title:'依据，随结果交付。',source3:'原始响应、来源校验、敏感性分析，以及更密的五分钟案例复核。',
  closingEyebrow:'走向下一片疆域，从提出一个更好的问题开始。',closingTitle:'找到你的<em>余量。</em>',closingLaunch:'开始你的探索',
  footerDescription:'一个月面着陆窗口实验室。<br>由好奇心驱动，以 NASA 数据为依据。',guide:'开始使用 ↗',footerFilm:'观看演示 ↗',
  footerNote:'独立教育项目。比较几何可见性，不提供飞行指引；无 NASA 背书。',disclosure:'项目与 AI 使用披露 ↗',
  filmCaption:'真实应用操作录像，英文字幕，无音轨。已标注 AI 辅助项目录屏。'
};

let language='en';
try{language=localStorage.getItem('lunamargin-language')==='zh'?'zh':'en';}catch{}
let caseSite=null,selectedPatch=null,patchResults=new Map();
const settings={start:'2027-06-02T06:00:00Z',durationHours:168,maxDarkHours:24,maxCommGapHours:24,minJointHours:24,clearanceDeg:0,observerHeightM:2,nominalStepHours:.5};
const tr=(en,zh)=>language==='zh'?zh:en;

function restoreSelectedPatch(){
  const stored=history.state?.lunamarginLanding;
  selectedPatch=caseSite.patches.find(patch=>stored?.site===caseSite.id&&patch.id===stored.patch)
    ||caseSite.patches.find(patch=>patch.dxM===0&&patch.dyM===0);
}

function updateCaseLink(){
  const parameters=new URLSearchParams({campaign:'jun',site:caseSite.id,patch:selectedPatch.id,lang:language});
  for(const[key,value]of Object.entries(settings))if(key!=='nominalStepHours')parameters.set(key,String(value));
  $('inspect-case').href=`navigator.html?${parameters}`;
  // Keep the editorial URL intact: scenario query parameters intentionally
  // redirect legacy homepage links into the navigator. History state also
  // survives browser Back and reload without affecting another homepage tab.
  history.replaceState({...history.state,lunamarginLanding:{site:caseSite.id,patch:selectedPatch.id}},'',location.href);
}

function setLanguage(){
  document.documentElement.lang=language==='zh'?'zh-CN':'en';
  document.querySelectorAll('[data-i18n]').forEach(element=>{element.innerHTML=language==='zh'?(chinese[element.dataset.i18n]??english[element.dataset.i18n]):english[element.dataset.i18n];});
  $('language').textContent=language==='zh'?'EN / 中':'中 / EN';
  $('language').setAttribute('aria-label',language==='zh'?'Switch to English':'切换为中文');
  try{localStorage.setItem('lunamargin-language',language);}catch{}
  if(caseSite){renderSampling();renderReading();}
}

function positionLabel(patch){
  if(patch.dxM===0&&patch.dyM===0)return tr('THE CENTER POINT','理想中心点');
  const east=patch.dxM===0?'':tr(`${Math.abs(patch.dxM)} m ${patch.dxM>0?'EAST':'WEST'}`,`${patch.dxM>0?'向东':'向西'} ${Math.abs(patch.dxM)} 米`);
  const north=patch.dyM===0?'':tr(`${Math.abs(patch.dyM)} m ${patch.dyM>0?'NORTH':'SOUTH'}`,`${patch.dyM>0?'向北':'向南'} ${Math.abs(patch.dyM)} 米`);
  return [east,north].filter(Boolean).join(' / ');
}

function renderSampling(){
  const grid=$('sampling-grid');grid.replaceChildren();
  const sorted=[...caseSite.patches].sort((a,b)=>b.dyM-a.dyM||a.dxM-b.dxM);
  for(const patch of sorted){
    const button=document.createElement('button');
    button.type='button';button.className='sample-button'+(patchResults.get(patch.id).feasible?'':' outside');button.dataset.patch=patch.id;
    button.setAttribute('aria-pressed',String(selectedPatch.id===patch.id));button.setAttribute('aria-label',positionLabel(patch));button.title=positionLabel(patch);
    const dot=document.createElement('span');dot.className='sample-dot';
    const label=document.createElement('span');label.className='point-label';label.textContent=patch.dxM===0&&patch.dyM===0?tr('CENTER','中心'):(patch.dyM>0?'N':patch.dyM<0?'S':'')+(patch.dxM>0?'E':patch.dxM<0?'W':'');
    button.append(dot,label);button.addEventListener('click',()=>{selectedPatch=patch;renderReading();grid.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.patch===patch.id)));});
    grid.append(button);
  }
}

function renderReading(){
  const result=patchResults.get(selectedPatch.id),pass=result.metrics.longestDarkHours<=settings.maxDarkHours;
  updateCaseLink();
  $('sample-label').textContent=positionLabel(selectedPatch);
  $('dark-hours').textContent=result.metrics.longestDarkHours.toFixed(2);
  $('dark-hours').style.color=pass?'#253f2d':'#aa6945';
  $('sun-percent').textContent=(result.metrics.sunHours/settings.durationHours*100).toFixed(1)+'%';
  $('sample-result').textContent=pass?tr('Within limits','满足条件'):tr('Outside limits','超出条件');$('sample-result').className=pass?'':'outside';
  const track=$('story-timeline');track.replaceChildren();
  for(const interval of result.windows.sun){const segment=document.createElement('span');segment.style.left=((interval.startMs-Date.parse(settings.start))/(settings.durationHours*3600000)*100)+'%';segment.style.width=interval.hours/settings.durationHours*100+'%';track.append(segment);}
}

async function loadCase(){
  try{
    const response=await fetch('data/lunar-sites-june.json');if(!response.ok)throw new Error(`Data request returned ${response.status}`);
    const bundle=await response.json();caseSite=bundle.sites.find(site=>site.id==='ridge-6');
    if(!caseSite?.patches?.length)throw new Error('The declared case is unavailable.');
    for(const patch of caseSite.patches)patchResults.set(patch.id,analyzeSite({...caseSite,...patch,samples:caseSite.samples,patches:[]},settings));
    restoreSelectedPatch();renderSampling();renderReading();
  }catch{
    $('sample-label').textContent=tr('INTERACTIVE CASE UNAVAILABLE','互动案例暂时无法加载');
    $('sampling-grid').textContent=tr('Open the navigator to explore the data.','请打开导航仪探索数据。');
  }
}

function openFilm(){const dialog=$('film-dialog');dialog.showModal();$('film').play().catch(()=>{});}
for(const id of ['watch-film','footer-film'])$(id).addEventListener('click',openFilm);
$('close-film').addEventListener('click',()=>$('film-dialog').close());
$('film-dialog').addEventListener('close',()=>$('film').pause());
$('film-dialog').addEventListener('click',event=>{if(event.target===$('film-dialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();}});
$('language').addEventListener('click',()=>{language=language==='en'?'zh':'en';setLanguage();});
window.addEventListener('pageshow',()=>{
  if(!caseSite)return;
  try{language=localStorage.getItem('lunamargin-language')==='zh'?'zh':'en';}catch{}
  restoreSelectedPatch();setLanguage();
});

// Reveal editorial sections only when motion is welcome; all content works without it.
if('IntersectionObserver' in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  document.documentElement.classList.add('js-motion');
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target);}}),{threshold:.08});
  document.querySelectorAll('.editorial-heading,.footprint-story,.experience-steps,.science-intro,.science-sources').forEach(element=>{element.classList.add('reveal');observer.observe(element);});
}
setLanguage();loadCase();
