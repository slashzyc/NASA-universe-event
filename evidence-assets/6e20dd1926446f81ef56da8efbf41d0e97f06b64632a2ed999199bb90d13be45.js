// Plain-language presentation of the existing geometric analysis.
// This module does not change thresholds, scientific inputs, or calculations.
const $ = id => document.getElementById(id);
const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hours = n => Number.isFinite(n) ? n.toFixed(1) : '—';
export const presets = {
  explorer: {durationHours:168,maxDarkHours:24,maxCommGapHours:24,minJointHours:24,clearanceDeg:0},
  short: {durationHours:72,maxDarkHours:12,maxCommGapHours:12,minJointHours:12,clearanceDeg:0},
};
export const interfaceCopy = {
  en: {navWorkspace:'Your mission',navCompare:'Compare places',navMethod:'How it works ↗',campaignLabel:'Choose a month',dateLabel:'Arrival date · UTC',hourLabel:'Arrival time · UTC',durationLabel:'How long will you stay?',darkLabel:'Longest time without the Sun',commLabel:'Longest time without Earth in view',jointLabel:'Total time with both in view',assumptions:'More model settings',clearanceLabel:'Extra angle above the terrain',analyze:'View mission results',findWindow:'Find a later date →',scopeNote:'Example limits for exploring a mission. You can adjust them as you learn.',horizonTitle:'What is the terrain hiding?',timelineTitle:'When can you see the Sun and Earth?',timelineCaption:'Colored segments mean visible; dark gaps mean hidden. “Both” is the total time with Sun and Earth together, not necessarily one continuous window.',mapHint:'Try the nine point buttons below',passes:'Meets limits',outside:'Outside limits',compareTitle:'Three places. Your conditions.',comparisonNote:'The count includes the center and eight nearby samples. It is not a landing success probability.',export:'Download results ↓',exportTitle:'Keep your mission notes.',exportIntro:'Start with the readable brief. The spreadsheet and full record are there when you need more detail.',tour:'Quick guide ↗',inspectionCenter:'Center point',centerResult:'Center result'},
  zh: {navWorkspace:'我的任务',navCompare:'地点比较',navMethod:'这是怎么算的 ↗',campaignLabel:'选择月份',dateLabel:'哪天抵达 · UTC',hourLabel:'抵达时刻 · UTC',durationLabel:'准备停留多久？',darkLabel:'最多多久看不见太阳',commLabel:'最多多久看不见地球',jointLabel:'至少多久同时看见两者',assumptions:'更多模型设置',clearanceLabel:'在地形上方再多留一点角度',analyze:'查看任务结果',findWindow:'帮我找更晚的日期 →',scopeNote:'这些是练习用任务条件。熟悉后，可以展开设置自行调整。',horizonTitle:'地形挡住了什么？',timelineTitle:'什么时候能看见太阳和地球？',timelineCaption:'彩色表示可见，深色空白表示被挡住。“两者”是同时可见的累计时间，不要求连续。',mapHint:'试试下方九个位置按钮',passes:'满足条件',outside:'超出条件',compareTitle:'三个地点，用同一把尺子比较。',comparisonNote:'九点包括中心和八个邻近样本。通过数量不代表着陆成功率。',export:'下载结果 ↓',exportTitle:'把这次探索带走。',exportIntro:'第一次使用，选择可直接阅读的任务简报即可。需要进一步分析时，再选表格或完整记录。',tour:'快速上手 ↗',inspectionCenter:'中心点',centerResult:'中心结果'},
};
Object.assign(interfaceCopy.en, {sharePoint:'Share this point ↗',shareTitle:'Copy this point’s link',shareHint:'The link includes your point and applied settings.'});
Object.assign(interfaceCopy.zh, {sharePoint:'分享这个点 ↗',shareTitle:'复制当前取样点的链接',shareHint:'链接包含你选中的位置与已应用的任务条件。',
  navigatorBrand:'月球着陆点探索仪', welcomeKicker:'你的第一次月面探索，从这里开始',
  welcomeTitle:'找到属于你的<em>时间窗口。</em>', welcomeIntro:'选个地点，设定一次任务，看看周边有什么不同。不懂航天，也能开始。',
  exampleStart:'从示例开始', helpStart:'教我怎么用', stepChoose:'选地点', stepMission:'设任务', stepResult:'看结果',
  placeKicker:'01 / 选择地点', chooseSiteTitle:'从哪里开始探索？', chooseSiteIntro:'月球南极的三个邻近研究点。先从任意一个开始。',
  settingsKicker:'02 / 设定任务', settingsTitle:'安排一次月面停留。', settingsIntro:'先选一个练习情景，再调整抵达日期和停留时间。',
  advancedTitle:'调整任务条件', advancedIntro:'预设已经帮你填好条件。想试试自己的设想时，再调整这些数值。',
  resultKicker:'03 / 这次任务，一眼读懂', inspectRisk:'查看未通过的点 ↗', saveBrief:'保存这份简报 ↓',
  terrainKicker:'走近一点 / 真实月面地形', pointsKicker:'移动一点，视野就可能不同',
  pointsTitle:'相隔 25 米，会有什么不同？', pointsIntro:'点选九个位置，比较相邻取样点。每行、每列间隔 25 米。',
  detailKicker:'再深入一点，看看原因', detailTitle:'看看为什么 · 光照与地平线',
  timezoneHint:'UTC 是统一时间，不随你的本地时区变化。',
  modelScope:'这里判断太阳和地球是否被地形挡住；实际供电与通信还取决于设备。',
});

export function patchName(patch, lang, short = false) {
  const zh = lang === 'zh';
  if (!patch || (!patch.dxM && !patch.dyM)) return zh ? '中心' : 'Center';
  const y = patch.dyM > 0 ? 'N' : patch.dyM < 0 ? 'S' : '';
  const x = patch.dxM > 0 ? 'E' : patch.dxM < 0 ? 'W' : '';
  const names = {N:['North','北'],S:['South','南'],E:['East','东'],W:['West','西'],NE:['Northeast','东北'],NW:['Northwest','西北'],SE:['Southeast','东南'],SW:['Southwest','西南']};
  return short && !zh ? y + x : names[y+x][zh ? 1 : 0];
}

export function renderBeginnerView(state) {
  if (!$('result-summary')) return;
  const {lang,site,sites,result,inspected,patch,settings,results} = state;
  const t = (en,zh) => lang === 'zh' ? zh : en;
  const focus = document.activeElement;
  const focusSite = focus?.dataset.site, focusPatch = focus?.dataset.patch;
  const restoreSite = Boolean(focus?.closest('#site-tabs')), restorePatch = Boolean(focus?.closest('#point-selector'));
  $('site-tabs').innerHTML = sites.map(s => {
    const r = results.find(item => item.siteId === s.id);
    return `<button type="button" class="site-tab" data-site="${s.id}" aria-pressed="${s.id===site.id}"><span class="site-tab-name">${t('Ridge','连接脊')} ${s.sourceRoiNumber}</span><span class="site-tab-caption">${t('Research location','研究地点')} · ${Math.abs(s.lat).toFixed(3)}° S</span><span class="site-tab-count">${r.patchStats.feasibleCount}/${r.patchStats.count} ${t('samples meet limits','点满足条件')}</span></button>`;
  }).join('');
  const reasons = inspected.reasons.filter(r => ['dark-gap','comm-gap','joint-shortfall'].includes(r.code));
  const all = result.patchStats, isCenter = !patch || (!patch.dxM && !patch.dyM);
  let title, explanation, status;
  if (inspected.status !== 'complete' || inspected.centerFeasible === null) {
    status = 'unknown'; title = t('We need more data for this window.','这段时间，还缺少足够的数据。');
    explanation = t('Choose a date and duration within the available month. Missing data is never counted as a pass.','请选择当前月份覆盖的日期与时长。缺少数据的时间不会被算作满足条件。');
  } else if (!inspected.centerFeasible) {
    status = 'caution'; title = t(`This point misses ${reasons.length} ${reasons.length===1?'limit':'limits'}.`,`这个点，有 ${reasons.length} 项条件未满足。`);
    explanation = t('The terrain blocks the view for longer than your mission allows. Try the center or look for a later arrival.','地形遮挡让这个位置达不到你的任务要求。可以看看中心点，或寻找更晚的抵达日期。');
  } else if (all.allKnown && all.feasibleCount === all.count) {
    status = 'pass'; title = t('All nine samples meet your limits.','九个取样点，都满足你的条件。');
    explanation = t('This is a useful window to explore further. Compare the places or download a brief to keep the evidence.','这是一段值得继续研究的时间窗口。你可以比较其他地点，或下载简报保存判断依据。');
  } else {
    status = 'caution'; title = isCenter ? t('The center works. Check its neighbors.','中心满足条件，周边还要看一眼。') : t('This point meets your limits. Others differ.','这个点满足条件，其他位置有差异。');
    explanation = all.allKnown ? t(`${all.feasibleCount} of ${all.count} samples meet your limits. Choose a point below to see what changes within 25 meters.`,`${all.count} 个样本中有 ${all.feasibleCount} 个满足条件。点选下方位置，看看相邻 25 米会带来什么变化。`) : t('Some samples have incomplete data. Explore their individual results before drawing a conclusion.','部分取样点数据不完整。请先查看单点结果，再作判断。');
  }
  $('read-result').dataset.state = status;
  const duration = settings.durationHours % 24 === 0 ? `${settings.durationHours/24} ${t('days','天')}` : `${settings.durationHours} h`;
  const date = settings.start.slice(0,16).replace('T',' ');
  const reasonText = r => r.code==='dark-gap' ? t(`Without the Sun: ${hours(r.actual)} h · limit ${r.limit} h`,`看不见太阳：${hours(r.actual)} 小时 · 上限 ${r.limit} 小时`) : r.code==='comm-gap' ? t(`Without Earth: ${hours(r.actual)} h · limit ${r.limit} h`,`看不见地球：${hours(r.actual)} 小时 · 上限 ${r.limit} 小时`) : t(`Both in view: ${hours(r.actual)} h total · need ${r.limit} h`,`两者同时可见：累计 ${hours(r.actual)} 小时 · 至少需要 ${r.limit} 小时`);
  $('result-summary').innerHTML = `<div class="result-eyebrow"><span>${t('RIDGE','连接脊')} ${site.sourceRoiNumber} / ${safe(patchName(patch,lang))}</span><span>${date} UTC · ${duration}</span></div><h2 class="result-verdict">${title}</h2><p class="result-explanation">${explanation}</p>${reasons.length?`<ul class="result-reasons">${reasons.map(r=>`<li>${reasonText(r)}</li>`).join('')}</ul>`:''}`;
  const failed = all.scenarios.find(p => p.feasible === false);
  $('inspect-risk').hidden = !failed&&isCenter;
  $('inspect-risk').dataset.patch = !isCenter?'e+0-n+0':failed?.id || '';
  $('inspect-risk').textContent = !isCenter?t('Compare with the center ↗','查看中心，比较替代位置 ↗'):t(`Inspect ${patchName(failed,lang).toLowerCase()} point ↗`,`查看${patchName(failed,lang)}未通过点 ↗`);
  $('point-selector').innerHTML = [...site.patches].sort((a,b) => b.dyM-a.dyM || a.dxM-b.dxM).map(p => {
    const scenario = all.scenarios.find(s => s.id === p.id);
    const active = patch ? patch.id===p.id : !p.dxM&&!p.dyM;
    const label = scenario.feasible===true?t('Meets limits','满足条件'):scenario.feasible===false?t('Outside limits','超出条件'):t('Missing data','数据不足');
    return `<button type="button" class="point-button" data-patch="${p.id}" data-status="${scenario.feasible===true?'pass':scenario.feasible===false?'fail':'unknown'}" aria-pressed="${active}" aria-label="${patchName(p,lang)} · ${label}"><span class="point-direction">${patchName(p,lang,true)}</span><span class="point-status">${scenario.feasible===true?'✓':scenario.feasible===false?'!':'?'} ${label}</span></button>`;
  }).join('');
  const offset = isCenter ? t('Center point','中心点') : t(`${patchName(patch,lang)} · ${Math.abs(patch.dxM)} m ${patch.dxM<0?'west':'east'}, ${Math.abs(patch.dyM)} m ${patch.dyM<0?'south':'north'}`,`${patchName(patch,lang)}点 · ${patch.dxM<0?'西':'东'} ${Math.abs(patch.dxM)} 米，${patch.dyM<0?'南':'北'} ${Math.abs(patch.dyM)} 米`);
  const pointState = inspected.centerFeasible===true?t('Meets limits','满足条件'):inspected.centerFeasible===false?t('Outside limits','超出条件'):t('Missing data','数据不足');
  $('point-caption').innerHTML = `<span>${offset}</span><strong>${t('Longest time without the Sun','最长看不见太阳')} ${hours(inspected.metrics.longestDarkHours)} h · ${pointState}</strong><a href="#read-result">${t('See this point’s result ↑','查看这个点的完整结论 ↑')}</a>`;
  if (focusSite && restoreSite) $('site-tabs').querySelector(`[data-site="${focusSite}"]`)?.focus({preventScroll:true});
  if (focusPatch && restorePatch) $('point-selector').querySelector(`[data-patch="${focusPatch}"]`)?.focus({preventScroll:true});
}

export function renderDraft({lang,draft,applied,loading,extraDirty=false}) {
  if (!$('preset-buttons')) return;
  const t = (en,zh) => lang==='zh' ? zh : en;
  const fields = ['start','durationHours','maxDarkHours','maxCommGapHours','minJointHours','clearanceDeg'];
  const dirty = extraDirty || Boolean(applied.start) && fields.some(key => key==='start'?Date.parse(draft[key])!==Date.parse(applied[key]):draft[key] !== applied[key]);
  const matched = Object.keys(presets).find(key => Object.entries(presets[key]).every(([field,value])=>draft[field]===value));
  const previousFocus = document.activeElement?.dataset.preset;
  $('preset-buttons').innerHTML = [['explorer',t('7-day exploration','7 天探索'),t('24 h limits','24 小时条件')],['short',t('3-day visit','3 天短访'),t('12 h limits','12 小时条件')],['custom',t('Set my own','自己设置'),t('Adjust the limits','调整任务条件')]].map(([id,title,caption])=>`<button type="button" class="preset-button" data-preset="${id}" aria-pressed="${(matched||'custom')===id}" ${loading?'disabled':''}><strong>${title}</strong><span>${caption}</span></button>`).join('');
  if (previousFocus) $('preset-buttons').querySelector(`[data-preset="${previousFocus}"]`)?.focus({preventScroll:true});
  if ($('preset-description')) $('preset-description').textContent = t(`Example limits: no Sun for up to ${draft.maxDarkHours} h; no Earth view for up to ${draft.maxCommGapHours} h; both visible for at least ${draft.minJointHours} h in total.`,`练习条件：最长 ${draft.maxDarkHours} 小时看不见太阳，最长 ${draft.maxCommGapHours} 小时看不见地球，两者同时可见累计至少 ${draft.minJointHours} 小时。`);
  $('pending-note').hidden = !dirty && !loading;
  $('pending-note').innerHTML = loading ? `<span>${t('Loading the selected month…','正在读取所选月份…')}</span>` : `<span>${t('Settings changed. These results still use your last applied conditions.','设置已修改。当前结果仍对应上一次应用的条件。')}</span><button type="button" id="apply-pending">${t('Update results →','更新结果 →')}</button>`;
  $('read-result').dataset.pending = String(dirty || loading);
  if ($('settings-status')) $('settings-status').textContent = loading ? t('Loading data…','正在读取数据…') : dirty ? t('Ready to update. Use “View mission results”.','设置已修改，点击“查看任务结果”更新。') : t('Your results are up to date.','结果已按当前设置更新。');
  for (const id of ['save-brief','export-btn','share-point','export-json','export-html','export-csv']) if ($(id)) $(id).disabled = dirty || loading;
  for (const id of ['example-start','inspect-risk']) if ($(id)) $(id).disabled = loading;
  if (loading && $('find-window')) $('find-window').disabled = true;
  return dirty;
}
