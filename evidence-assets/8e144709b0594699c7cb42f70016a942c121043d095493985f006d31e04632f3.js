/** Mission planning policy only. Does not modify the verified geometry algorithm. */
const HOUR=3600000;
export const MISSION_CONSTRAINTS_VERSION=1;
export const DEFAULT_PRACTICE_DELAY_HOURS=72;
const stamp=(value,label)=>{
  const parts=typeof value==='string'&&value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/);
  if(!parts||!Number.isFinite(Date.parse(value)))throw new RangeError(label+' must be an ISO date/time with an explicit timezone.');
  const [,year,month,day,hour,minute,second='0']=parts,days=new Date(Date.UTC(Number(year),Number(month),0)).getUTCDate();
  if(Number(month)<1||Number(month)>12||Number(day)<1||Number(day)>days||Number(hour)>23||Number(minute)>59||Number(second)>59)throw new RangeError(label+' is not a valid calendar date/time.');
  return new Date(value).toISOString();
};
export function normalizeMissionConstraints(value,{start}={}){
  if(value!==undefined&&value!==null&&(typeof value!=='object'||Array.isArray(value)))throw new RangeError('Mission constraints must be an object.');
  const input=value||{};
  if(input.schemaVersion!==undefined&&input.schemaVersion!==1)throw new RangeError('Unsupported mission-constraint version.');
  const referenceStart=stamp(input.referenceStart||start,'Reference arrival');
  let latestArrival=input.latestArrival===undefined||input.latestArrival===null||input.latestArrival===''?null:stamp(input.latestArrival,'Latest arrival');
  let maxDelayHours=input.maxDelayHours===undefined||input.maxDelayHours===null||input.maxDelayHours===''?null:input.maxDelayHours;
  if(maxDelayHours!==null&&(typeof maxDelayHours!=='number'||!Number.isFinite(maxDelayHours)||maxDelayHours<0||maxDelayHours>8760))throw new RangeError('Maximum delay must be from 0 to 8760 hours.');
  const rankingPreference=input.rankingPreference||'earliest';
  if(!['earliest','margin'].includes(rankingPreference))throw new RangeError('Unknown search preference.');
  if(latestArrival&&Date.parse(latestArrival)<Date.parse(referenceStart))throw new RangeError('Latest arrival must not precede the reference arrival.');
  if(latestArrival!==null&&maxDelayHours!==null&&Date.parse(latestArrival)!==Date.parse(referenceStart)+maxDelayHours*HOUR)throw new RangeError('Latest arrival and maximum delay disagree / 最迟抵达与最大推迟不一致。');
  if(maxDelayHours!==null&&latestArrival===null)latestArrival=new Date(Date.parse(referenceStart)+maxDelayHours*HOUR).toISOString();
  if(latestArrival!==null&&maxDelayHours===null)maxDelayHours=(Date.parse(latestArrival)-Date.parse(referenceStart))/HOUR;
  if(maxDelayHours!==null&&maxDelayHours>8760)throw new RangeError('Maximum delay must not exceed 8760 hours.');
  return{schemaVersion:1,referenceStart,latestArrival,maxDelayHours,rankingPreference};
}
export function defaultMissionConstraints(start){return normalizeMissionConstraints({maxDelayHours:DEFAULT_PRACTICE_DELAY_HOURS},{start});}
export function missionDeadline(constraints){const c=normalizeMissionConstraints(constraints,{start:constraints?.referenceStart});return Math.min(c.latestArrival?Date.parse(c.latestArrival):Infinity,c.maxDelayHours===null?Infinity:Date.parse(c.referenceStart)+c.maxDelayHours*HOUR);}
export function assertMissionArrival(settings,constraints){const c=normalizeMissionConstraints(constraints,{start:settings.start}),arrival=Date.parse(stamp(settings.start,'Mission arrival'));if(arrival<Date.parse(c.referenceStart)||arrival>missionDeadline(c))throw new RangeError('Mission arrival is outside the stated arrival limits / 抵达时间超出任务允许范围。');return c;}
export function appendMissionConstraints(params,constraints){if(!constraints)return params;const c=normalizeMissionConstraints(constraints,{start:constraints.referenceStart});params.set('missionConstraintsVersion','1');params.set('referenceStart',c.referenceStart);params.set('rankingPreference',c.rankingPreference);for(const key of ['latestArrival','maxDelayHours']){params.delete(key);if(c[key]!==null)params.set(key,String(c[key]));}return params;}
export function missionConstraintsFromParams(params,{start,newMission=false}={}){const explicit=['missionConstraintsVersion','referenceStart','latestArrival','maxDelayHours','rankingPreference'].some(key=>params.has(key));if(!explicit)return newMission?defaultMissionConstraints(start):normalizeMissionConstraints(undefined,{start});return normalizeMissionConstraints({schemaVersion:params.has('missionConstraintsVersion')?Number(params.get('missionConstraintsVersion')):1,referenceStart:params.get('referenceStart')||start,latestArrival:params.get('latestArrival'),maxDelayHours:params.has('maxDelayHours')?Number(params.get('maxDelayHours')):null,rankingPreference:params.get('rankingPreference')||'earliest'},{start});}

export function missionSearchRule(constraints){return constraints?.rankingPreference==='margin'?'Declared preference, not proof of an executed search: within the unchanged arrival limits and thresholds, prefer the greatest minimum nine-point time margin, then earliest arrival.':'Declared preference, not proof of an executed search: within the unchanged arrival limits and thresholds, prefer earliest arrival, then the greatest minimum nine-point time margin.';}

export function compareMissionCandidates(a,b,preference='earliest'){
  const margin=()=>Number(b.worstCase?.allKnown)-Number(a.worstCase?.allKnown)||(b.worstCase?.minimumMarginHours??-Infinity)-(a.worstCase?.minimumMarginHours??-Infinity);
  const order=preference==='margin'?margin()||a.delayHours-b.delayHours:a.delayHours-b.delayHours||margin();
  return Number(b.feasible)-Number(a.feasible)||order||a.metrics.longestDarkHours-b.metrics.longestDarkHours||a.metrics.longestCommGapHours-b.metrics.longestCommGapHours||b.metrics.jointHours-a.metrics.jointHours||a.siteId.localeCompare(b.siteId,'en');
}
/** Search only available samples inside the declared arrival bounds. Missing
 * dates are identified independently from a complete search with no solution. */
export function searchMissionWindows(searchWindows,sites,settings,constraints){
  try{
    const c=assertMissionArrival(settings,constraints),deadline=missionDeadline(c),start=Date.parse(settings.start),duration=settings.durationHours*HOUR;
    const ranges=sites.map(site=>{const times=(site.samples||[]).map(s=>Date.parse(s.time)).filter(Number.isFinite);return times.length>1?{siteId:site.id,first:Math.min(...times),lastStart:Math.max(...times)-duration}:null;}).filter(Boolean);
    const dataEnd=ranges.length?Math.max(...ranges.map(r=>r.lastStart)):-Infinity;
    const end=Math.min(deadline,dataEnd),coverageIncomplete=ranges.length!==sites.length||ranges.some(r=>start<r.first||Number.isFinite(deadline)&&deadline>r.lastStart);
    const empty={candidates:[],earliestFeasible:[],earliestDelayHours:null,pareto:[],evaluatedCount:0,excludedCount:0,truncated:false,stepHours:settings.stepHours||6};
    const result=end<start?empty:searchWindows(sites,{...settings,searchEnd:new Date(end).toISOString()});
    result.candidates.sort((a,b)=>compareMissionCandidates(a,b,c.rankingPreference));
    const feasible=result.candidates.filter(x=>x.feasible),unknown=coverageIncomplete||result.excludedCount>0||result.truncated||!result.evaluatedCount;
    return{...result,status:feasible.length?'feasible':unknown?'insufficient-data':'no-feasible',missionConstraints:c,ranking:{id:c.rankingPreference==='earliest'?'mission-earliest-then-margin-v1':'mission-margin-then-earliest-v1',preference:c.rankingPreference},searchCoverage:{requestedStart:new Date(start).toISOString(),requestedLatest:Number.isFinite(deadline)?new Date(deadline).toISOString():null,effectiveLatest:Number.isFinite(end)&&end>=start?new Date(end).toISOString():null,complete:!unknown,boundedByData:deadline>dataEnd,gridHours:result.stepHours,interpretation:'Only complete mission intervals on the stated search grid are evaluated. A partial date range is not a no-solution finding for missing dates.'}};
  }catch(error){return{status:'failed',error:error.message,candidates:[],evaluatedCount:0,excludedCount:0,ranking:null};}
}
