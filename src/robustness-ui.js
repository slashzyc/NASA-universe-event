import {patchName} from './navigator-ui.js';
const n=value=>Number.isFinite(value)?value.toFixed(2):'—';
export function worstCaseMarkup(w,lang='en') {
  const t=(en,zh)=>lang==='zh'?zh:en;
  if(!w?.allKnown)return `<p>${t('Some samples are unknown. A whole-group margin cannot be stated.','部分样本未知，不能确认整组余量。')}</p>`;
  const rows=[['longestDarkHours','darknessHours',t('Longest darkness','最长断光')],['longestCommGapHours','earthGapHours',t('Longest Earth-view gap','最长地球不可见')],['jointHours','jointHours',t('Least shared visibility','最少共同可见')]];
  return `<dl class="worst-grid">${rows.map(([metric,margin,label])=>`<div><dt>${label}</dt><dd><strong>${n(w.metrics[metric])} <small>h</small></strong><span>${patchName(w.points[metric],lang)} · ${t('margin','余量')} ${n(w.margins[margin])} h</span></dd></div>`).join('')}</dl><p class="margin-note">${t('Smallest margin across all three limits','三项条件中最小的剩余时间')} <strong>${n(w.minimumMarginHours)} h</strong>. ${t('Negative means a limit is missed. This is time, not a probability.','负数表示已有条件未满足。这是时间余量，不是概率。')}</p>`;
}
export function stressMarkup(stress,lang='en') {
  const t=(en,zh)=>lang==='zh'?zh:en;
  const reasons={ 'dark-gap':t('darkness','断光'),'comm-gap':t('Earth gap','地球不可见'),'joint-shortfall':t('shared view','共同可见')};
  return `<p>${t('Each increment is added to the applied baseline','每档增量都加在已应用的基准角度上')} ${stress.baselineClearanceDeg}°. ${t('These are deterministic stress settings, not calibrated errors or success probabilities.','这是人为设定的确定性压力测试，不是已校准的误差或成功概率。')}</p><div class="stress-table-wrap"><table class="stress-table"><thead><tr>${[t('Extra / total angle','增量 / 总角度'),t('Passing','通过'),t('Worst darkness','最坏断光'),t('Outside / unknown points','未通过 / 未知点')].map(v=>`<th>${v}</th>`).join('')}</tr></thead><tbody>${stress.levels.map(level=>`<tr><td>+${level.incrementDeg}° / ${Number(level.clearanceDeg.toFixed(4))}°</td><td>${level.feasibleCount}/${level.count}</td><td>${n(level.worstCase.metrics.longestDarkHours)} h</td><td>${level.scenarios.filter(p=>p.feasible!==true).map(p=>`${patchName(p,lang)}: ${p.feasible===null?t('unknown','未知'):p.reasons.map(r=>reasons[r.code]||r.code).join(', ')}`).join('; ')||t('All pass','全部满足')}</td></tr>`).join('')}</tbody></table></div>`;
}
