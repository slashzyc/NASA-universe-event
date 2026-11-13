import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {assertClientRelease,assertCalculationRelease,releaseDescriptor} from './release-policy.mjs';
import {assertMissionArrival,appendMissionConstraints,missionSearchRule} from '../src/mission-constraints.js';
import {buildRecordValidation} from '../src/record-validation.js';

export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export class APIError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const reject=(code,message)=>{throw new APIError(422,code,message);};
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const HOUR=3600000;
export function validateSettings(settings){
  if(!settings||typeof settings!=='object'||Array.isArray(settings))reject('invalid-settings','Task settings are required / 请填写任务条件。');
  if(typeof settings.start!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?Z$/.test(settings.start)||!Number.isFinite(Date.parse(settings.start)))reject('invalid-date','Start must be a valid UTC date / 开始时间必须是有效 UTC 日期。');
  if(new Date(settings.start).toISOString().slice(0,16)!==settings.start.slice(0,16))reject('invalid-date','This calendar date does not exist / 该日历日期不存在。');
  const result={start:new Date(settings.start).toISOString()};
  for(const[key,min,max]of[['durationHours',1,744],['maxDarkHours',0,744],['maxCommGapHours',0,744],['minJointHours',0,744],['clearanceDeg',0,5]]){
    const value=settings[key];
    if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)reject('invalid-settings',`${key} must be ${min}–${max} / 参数超出支持范围。`);
    result[key]=value;
  }
  if(settings.observerHeightM!==2)reject('unsupported-height','Only the validated 2 m terrain and ephemerides are available / 当前仅支持完成匹配验证的 2 米设备高度。');
  if(settings.nominalStepHours!==undefined&&settings.nominalStepHours!==.5)reject('unsupported-sampling','Validated data use 30-minute sampling / 已验证数据采用 30 分钟采样。');
  result.observerHeightM=2;result.nominalStepHours=.5;
  return result;
}
export async function createCalculator({staticRoot,dataDir,db,pipeline}){
  const archiveRoot=path.join(dataDir,'evidence-assets');await mkdir(archiveRoot,{recursive:true});
  const moduleCache=new Map(),datasetCache=new Map(),catalogCache=new Map();
  // A running service retains its startup release. Replacing dist requires a
  // restart; new interface requests are rejected rather than relabeling old code.
  const startupManifestText=await readFile(path.join(staticRoot,'build-info.json'),'utf8');
  async function asset(relative){
    if(!/^evidence-assets\/(?:build-)?[a-f0-9]{64}\.(?:js|json)$/.test(relative))throw new APIError(500,'invalid-release','Invalid trusted release asset.');
    try{return await readFile(path.join(staticRoot,relative),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;return readFile(path.join(dataDir,relative),'utf8');}
  }
  async function immutable(relative,text){
    const file=path.join(dataDir,relative);const old=await readFile(file,'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
    if(old!==null&&old!==text)throw new Error('Immutable evidence collision.');
    if(old===null)await writeFile(file,text,{flag:'wx'});
  }
  async function manifest(buildId){
    if(buildId!==undefined&&!validHash(buildId))reject('invalid-version','Invalid calculation version.');
    let result;
    try{result=JSON.parse(buildId?await asset(`evidence-assets/build-${buildId}.json`):startupManifestText);}
    catch{throw new APIError(404,'version-unavailable','The requested calculation version is unavailable / 所需计算版本不存在。');}
    if(result.schemaVersion!==1||digest(JSON.stringify(result.identity))!==result.buildId||buildId&&result.buildId!==buildId)throw new APIError(500,'release-checksum','Calculation manifest checksum mismatch.');
    const algo=result.identity.algorithm;
    if(!validHash(algo?.sha256)||algo.snapshot!==`evidence-assets/${algo.sha256}.js`)throw new APIError(500,'release-checksum','Invalid algorithm identity.');
    db.prepare('INSERT OR IGNORE INTO releases VALUES(?,?,?)').run(result.buildId,algo.sha256,JSON.stringify(result));
    return result;
  }
  async function sourceAndModule(release){
    const key=release.identity.algorithm.sha256;
    if(moduleCache.has(key))return moduleCache.get(key);
    const source=await asset(release.identity.algorithm.snapshot);
    if(digest(source)!==key)throw new APIError(500,'algorithm-checksum','Algorithm checksum mismatch; no calculation was produced.');
    // Import the exact verified bytes, rather than re-reading a mutable file.
    const module=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const entry={source,module};moduleCache.set(key,entry);return entry;
  }
  async function dataFor(campaign,requestedBuild){
    if(typeof campaign!=='string'||campaign.length>100)reject('unsupported-campaign','Select an available dataset / 请选择已有数据集。');
    let release=await manifest(requestedBuild),descriptor=release.identity.datasets[campaign];
    if(!descriptor&&!requestedBuild){
      const generated=await pipeline?.resolveDataset(campaign);
      if(generated){
        const text=await readFile(generated.path,'utf8');
        if(digest(text)!==generated.sha256)throw new APIError(500,'dataset-checksum','Cached data checksum mismatch.');
        const data=JSON.parse(text),sha256=digest(text),snapshot=`evidence-assets/${sha256}.json`;
        await immutable(snapshot,text);
        descriptor={path:`api/datasets/${campaign}`,sha256,snapshot,observerHeightM:data.observerHeightM,generatedAt:data.generatedAt,start:data.start,stop:data.stop};
        const identity={...release.identity,datasets:{...release.identity.datasets,[campaign]:descriptor}};
        release={schemaVersion:1,buildId:digest(JSON.stringify(identity)),identity};
        await immutable(`evidence-assets/build-${release.buildId}.json`,JSON.stringify(release,null,2)+'\n');
        db.prepare('INSERT OR IGNORE INTO releases VALUES(?,?,?)').run(release.buildId,release.identity.algorithm.sha256,JSON.stringify(release));
      }
    }
    if(!descriptor)reject('unsupported-campaign','No calculated data covers that dataset. Request a data job first / 暂无可计算数据，请先提交数据任务。');
    if(!validHash(descriptor.sha256)||descriptor.snapshot!==`evidence-assets/${descriptor.sha256}.json`)throw new APIError(500,'dataset-checksum','Invalid dataset identity.');
    let entry=datasetCache.get(descriptor.sha256);
    if(!entry){
      const text=await asset(descriptor.snapshot);
      if(digest(text)!==descriptor.sha256)throw new APIError(500,'dataset-checksum','Input checksum mismatch; no calculation was produced.');
      entry={text,data:JSON.parse(text)};datasetCache.set(descriptor.sha256,entry);
    }
    return {...entry,release,descriptor};
  }
  async function coverage(){
    const release=await manifest(),campaigns=[],regions=new Map();
    for(const[id,descriptor]of Object.entries(release.identity.datasets)){
      const {data}=await dataFor(id);
      campaigns.push({id,name:({dec:'December 2026 / 2026 年 12 月',mar:'March 2027 / 2027 年 3 月',jun:'June 2027 / 2027 年 6 月'})[id]||id,...descriptor,buildId:release.buildId,algorithmSha256:release.identity.algorithm.sha256,sampleIntervalMinutes:data.sampleIntervalMinutes,sourceDataTime:data.generatedAt,origin:'bundled'});
      db.prepare('INSERT OR REPLACE INTO datasets VALUES(?,?,?)').run(id,descriptor.sha256,JSON.stringify(campaigns.at(-1)));
      for(const site of data.sites)if(!regions.has(site.id)){
        const points=site.patches.map(({id,dxM,dyM,lat,lon,elevationM})=>({id,dxM,dyM,lat,lon,elevationM}));
        const region={id:site.id,name:site.name,lat:site.lat,lon:site.lon,elevationM:site.elevationM,regionId:'connecting-ridge',observerHeightsM:[2],points,coverage:{kind:'discrete-sampled-points',pointCount:9,pointSpacingM:25,terrainPixelSpacingM:[5,80],horizonAzimuthSpacingDeg:1,horizonRangeKm:250},sources:data.sources,limitations:data.limitations,sourceDataTime:data.generatedAt};
        regions.set(site.id,region);db.prepare('INSERT OR REPLACE INTO regions VALUES(?,?)').run(site.id,JSON.stringify(region));
      }
    }
    for(const entry of await pipeline?.listDatasets()||[]){
      const {data,descriptor,release:generatedRelease}=await dataFor(entry.id);
      const meta={id:entry.id,name:`${data.start.slice(0,10)} → ${data.stop.slice(0,10)}`,...descriptor,buildId:generatedRelease.buildId,algorithmSha256:generatedRelease.identity.algorithm.sha256,sampleIntervalMinutes:data.sampleIntervalMinutes,sourceDataTime:data.sourceDataTime||data.generatedAt,origin:'jpl-cached'};
      campaigns.push(meta);db.prepare('INSERT OR REPLACE INTO datasets VALUES(?,?,?)').run(entry.id,descriptor.sha256,JSON.stringify(meta));
    }
    return {regions:[...regions.values()],campaigns,heights:[2],version:release.buildId,release:releaseDescriptor(release),algorithmSha256:release.identity.algorithm.sha256,sourceTimeMeaning:'Acquisition/cache time; not live observation',newDateLimits:{min:'2026-01-01',max:'2029-01-01',maxDays:31,observerHeightM:2},storage:'SQLite',serverTime:new Date().toISOString()};
  }
  async function calculate(input,{owner,origin}){
    const current=await manifest();assertClientRelease(input,current);
    const catalogDescriptor=current.identity.resources?.['data/science-validation-summary.json'];if(!catalogDescriptor)throw new APIError(503,'validation-unavailable','The current release has no verified validation catalog.');
    let catalog=catalogCache.get(catalogDescriptor.sha256);if(!catalog){const source=await asset(catalogDescriptor.snapshot);if(digest(source)!==catalogDescriptor.sha256)throw new APIError(503,'validation-checksum','Validation catalog checksum mismatch.');catalog=JSON.parse(source);catalogCache.set(catalogDescriptor.sha256,catalog);}
    const settings=validateSettings(input.settings),{text,data,release,descriptor}=await dataFor(input.campaign,input.buildId);
    assertCalculationRelease(input,release,descriptor);
    let missionConstraints;try{missionConstraints=assertMissionArrival(settings,input.missionConstraints);}catch(error){reject('invalid-mission-constraints',error.message);}
    const site=data.sites.find(item=>item.id===input.siteId);
    if(!site)reject('uncovered-location','This location has no validated terrain and sky data / 该位置暂无可计算数据。');
    const point=site.patches.find(item=>item.id===(input.patchId||'e+0-n+0'));
    if(!point)reject('uncovered-point','The requested point is outside the sampled coverage / 该取样点没有经过验证的数据。');
    const start=Date.parse(settings.start),end=start+settings.durationHours*HOUR;
    if(start<Date.parse(data.start)||end>Date.parse(data.stop))reject('uncovered-date','The full mission must fit the selected data coverage. Request missing dates first / 任务完整时段超出当前数据覆盖，请先获取缺失日期。');
    if(data.observerHeightM!==settings.observerHeightM)reject('unsupported-height','Terrain and ephemerides do not match this height.');
    if(input.lat!==undefined||input.lon!==undefined)reject('arbitrary-coordinates','Select a supported research point; arbitrary coordinates cannot reuse a nearby result / 仅支持明确列出的取样点，不能套用邻近结果。');
    const id=randomUUID(),createdAt=new Date().toISOString();
    const parameters={campaign:input.campaign,siteId:site.id,patchId:point.id,settings,missionConstraints,buildId:release.buildId,language:input.language==='zh'?'zh':'en'};
    db.prepare('INSERT INTO analyses(id,owner_hash,status,created_at,parameters_json) VALUES(?,?,?,?,?)').run(id,owner,'processing',createdAt,JSON.stringify(parameters));
    try{
      const{source,module}=await sourceAndModule(release);
      const results=data.sites.map(item=>module.analyzeSite(item,settings));
      if(results.some(item=>item.status!=='complete'))throw new APIError(422,'incomplete-data','The data do not completely cover this request; no official result was saved / 数据覆盖不完整，未生成正式结果。');
      const selectedPointResult=module.analyzeSite({...site,...point,samples:point.samples||site.samples,patches:[]},settings);
      if(selectedPointResult.status!=='complete')throw new APIError(422,'incomplete-data','Selected point has incomplete input coverage.');
      const now=new Date().toISOString(),url=new URL('navigator.html',origin);
      for(const[key,value]of Object.entries({campaign:input.campaign,site:site.id,patch:point.id,lang:parameters.language,...settings,build:release.buildId,algo:release.identity.algorithm.sha256,data:descriptor.sha256}))url.searchParams.set(key,String(value));
      appendMissionConstraints(url.searchParams,missionConstraints);
      const absolute=value=>new URL(value,origin).href;
      const record={project:'LunaMargin',schemaVersion:3,language:parameters.language,exportedAt:now,calculatedAt:now,sourceDataTime:data.sourceDataTime||data.generatedAt,campaign:input.campaign,settings,missionConstraints,selectedSiteId:site.id,
        selectedPoint:{id:point.id,siteId:site.id,dxM:point.dxM,dyM:point.dyM,lat:point.lat,lon:point.lon,elevationM:point.elevationM,isCenter:!point.dxM&&!point.dyM,result:selectedPointResult},
        provenance:{buildId:release.buildId,calculationBuildId:release.buildId,interfaceBuildId:current.buildId,algorithmSha256:release.identity.algorithm.sha256,datasetSha256:descriptor.sha256,modelMethodVersion:release.identity.methodVersion,observerHeightM:2,verification:'sha256-verified',manifestURL:absolute(`evidence-assets/build-${release.buildId}.json`),interfaceManifestURL:absolute(`evidence-assets/build-${current.buildId}.json`),algorithmSnapshotURL:absolute(release.identity.algorithm.snapshot),datasetSnapshotURL:absolute(descriptor.snapshot),sourceIdentity:release.identity.sourceIdentity},
        inputSnapshot:{format:'utf8-json',sha256:descriptor.sha256,text},algorithmSnapshot:{format:'javascript-source',sha256:release.identity.algorithm.sha256,text:source},
        shareURL:url.href,stressTest:module.stressTestSite(site,settings),searchRule:missionSearchRule(missionConstraints),
        data:{generatedAt:data.generatedAt,referenceFrame:data.referenceFrame,start:data.start,stop:data.stop,sampleIntervalMinutes:data.sampleIntervalMinutes,horizonMethod:data.horizonMethod,sources:data.sources,limitations:data.limitations},
        sites:data.sites.map(item=>({id:item.id,name:item.name,lat:item.lat,lon:item.lon,elevationM:item.elevationM,slopeDeg:item.slopeDeg,heightRmsErrorM:item.heightRmsErrorM,ephemerisSources:item.ephemerisSources,patches:item.patches.map(({id,dxM,dyM,lat,lon,elevationM})=>({id,dxM,dyM,lat,lon,elevationM}))})),results,
        server:{analysisId:id,calculatedAt:now,sourceDataTime:data.sourceDataTime||data.generatedAt,execution:'verified-server-algorithm',storage:'SQLite'},interpretation:'Geometric screening, not flight safety, power or radio-link assurance. Footprint fractions are discrete scenario counts, not probabilities.'};
      record.validationEvidence=buildRecordValidation(record,current,catalog);
      const recordJSON=JSON.stringify(record),recordSha256=digest(recordJSON);
      db.prepare('UPDATE analyses SET status=?,completed_at=?,record_json=?,record_sha256=? WHERE id=?').run('completed',now,recordJSON,recordSha256,id);
      return {id,status:'completed',record,recordSha256};
    }catch(error){db.prepare('UPDATE analyses SET status=?,completed_at=?,error_json=? WHERE id=?').run('failed',new Date().toISOString(),JSON.stringify({code:error.code||'calculation-failed',message:error.message}),id);throw error;}
  }
  return{coverage,calculate,asset,manifest,dataFor};
}
