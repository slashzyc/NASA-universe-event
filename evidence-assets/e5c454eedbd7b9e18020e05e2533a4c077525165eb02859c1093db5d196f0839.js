/** Cloud API. Generated build bindings contain the unchanged verified algorithm and NASA inputs. */
/*__GENERATED_BINDINGS__*/
const UPSTREAM='https://slashzyc.github.io/NASA-universe-event/';
const CAPABILITIES={serverSave:true,newDates:false,browserFiles:true,compare:true,readOnlySharing:true};
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const now=()=>new Date().toISOString();
const encoder=new TextEncoder();
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?encoder.encode(value):value))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function token(){return [...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');}
class ServiceError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const fail=(status,code,message)=>{throw new ServiceError(status,code,message);};
const reject=(code,message)=>fail(422,code,message);
/*__VALIDATE_SETTINGS__*/
function response(value,status=200,headers={}){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
async function body(request){
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))fail(415,'json-required','Send JSON / 请求须为 JSON。');
  if(Number(request.headers.get('Content-Length'))>65536)fail(413,'body-too-large','Request exceeds 64 KB.');
  const reader=request.body?.getReader();let length=0,text='';if(reader){const decoder=new TextDecoder();for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>65536){await reader.cancel();fail(413,'body-too-large','Request exceeds 64 KB.');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
  let parsed;try{parsed=JSON.parse(text);}catch{fail(400,'invalid-json','Invalid JSON.');}if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail(400,'invalid-json','A JSON object is required.');return parsed;
}
function nameOf(value){if(typeof value!=='string'||!value.trim()||value.trim().length>120)fail(422,'invalid-name','Use 1–120 characters / 名称须为 1–120 个字符。');return value.trim();}
const dbFirst=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const dbRun=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).run();
const dbAll=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results;
let initializePromise;
const inputCache=new Map();
async function input(campaign,release=RELEASE,env){
  const descriptor=release.identity.datasets[campaign];if(!descriptor)reject('unsupported-campaign','No verified data for this campaign / 此数据集暂无可计算数据。');
  let result=inputCache.get(descriptor.sha256);if(result)return result;
  const text=ASSETS[descriptor.snapshot]||await (await env?.BUCKET?.get(descriptor.snapshot))?.text();if(!text||await digest(text)!==descriptor.sha256)fail(503,'dataset-unavailable','Verified input snapshot is unavailable / 输入快照暂不可用。');
  result={text,data:JSON.parse(text),descriptor};inputCache.set(descriptor.sha256,result);return result;
}
async function initialize(env){
  if(!env.DB||!env.BUCKET)fail(503,'storage-unavailable','Cloud storage is not connected. Device file saving is available / 云存储尚未连接，可保存到设备文件。');
  if(initializePromise)return initializePromise;
  initializePromise=(async()=>{
    if(await digest(ALGORITHM_SOURCE)!==RELEASE.identity.algorithm.sha256||await digest(JSON.stringify(RELEASE.identity))!==RELEASE.buildId)fail(503,'build-checksum','Cloud build verification failed.');
    const validationDescriptor=RELEASE.identity.resources['data/science-validation-summary.json'];if(await digest(ASSETS[validationDescriptor.snapshot])!==validationDescriptor.sha256)fail(503,'validation-checksum','Validation catalog checksum failed.');
    if(await dbFirst(env,'SELECT id FROM lm_datasets WHERE id=?',RELEASE.buildId+':jun'))return;
    const statements=[];
    for(const [id,descriptor]of Object.entries(RELEASE.identity.datasets)){
      const {data,text}=await input(id);const meta={id,...descriptor,sampleIntervalMinutes:data.sampleIntervalMinutes,sourceDataTime:data.sourceDataTime||data.generatedAt,origin:'verified-bundled'};
      statements.push(env.DB.prepare('INSERT OR REPLACE INTO lm_datasets(id,sha256,metadata_json) VALUES(?,?,?)').bind(RELEASE.buildId+':'+id,descriptor.sha256,JSON.stringify(meta)));
      await env.BUCKET.put(descriptor.snapshot,text,{httpMetadata:{contentType:'application/json'},sha256:descriptor.sha256});
      if(id==='jun')for(const site of data.sites){const region=regionOf(site,data);statements.push(env.DB.prepare('INSERT OR REPLACE INTO lm_regions(id,metadata_json) VALUES(?,?)').bind(RELEASE.buildId+':'+site.id,JSON.stringify(region)));}
    }
    await env.BUCKET.put(RELEASE.identity.algorithm.snapshot,ALGORITHM_SOURCE,{httpMetadata:{contentType:'text/javascript'},sha256:RELEASE.identity.algorithm.sha256});
    await env.BUCKET.put(`evidence-assets/build-${RELEASE.buildId}.json`,JSON.stringify(RELEASE),{httpMetadata:{contentType:'application/json'}});
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO lm_releases(build_id,algorithm_sha256,manifest_json) VALUES(?,?,?)').bind(RELEASE.buildId,RELEASE.identity.algorithm.sha256,JSON.stringify(RELEASE)));
    await env.DB.batch(statements);
  })().catch(error=>{initializePromise=null;throw error;});return initializePromise;
}
function regionOf(site,data){return{id:site.id,name:site.name,lat:site.lat,lon:site.lon,elevationM:site.elevationM,regionId:'connecting-ridge',observerHeightsM:[2],points:site.patches.map(({id,dxM,dyM,lat,lon,elevationM})=>({id,dxM,dyM,lat,lon,elevationM})),coverage:{kind:'discrete-sampled-points',pointCount:9,pointSpacingM:25,terrainPixelSpacingM:[5,80],horizonAzimuthSpacingDeg:1,horizonRangeKm:250},sources:data.sources,limitations:data.limitations,sourceDataTime:data.sourceDataTime||data.generatedAt};}
async function coverage(env){const campaigns=[];for(const [id,descriptor]of Object.entries(RELEASE.identity.datasets)){const row=await dbFirst(env,'SELECT sha256,metadata_json FROM lm_datasets WHERE id=?',RELEASE.buildId+':'+id);if(!row||row.sha256!==descriptor.sha256)fail(503,'coverage-version','Coverage index is unavailable; please retry / 数据覆盖索引暂不可用，请重试。');campaigns.push({...JSON.parse(row.metadata_json),buildId:RELEASE.buildId,algorithmSha256:RELEASE.identity.algorithm.sha256,name:({dec:'December 2026 / 2026 年 12 月',mar:'March 2027 / 2027 年 3 月',jun:'June 2027 / 2027 年 6 月'})[id]||id});}const sites=(await input('jun')).data.sites,index=new Map((await dbAll(env,'SELECT id,metadata_json FROM lm_regions WHERE id IN ('+sites.map(()=>'?').join(',')+')',...sites.map(site=>RELEASE.buildId+':'+site.id))).map(row=>[JSON.parse(row.metadata_json).id,JSON.parse(row.metadata_json)])),regions=sites.map(site=>index.get(site.id));if(regions.some(region=>!region))fail(503,'coverage-unavailable','Research-region index unavailable / 研究区索引暂不可用。');return{regions,campaigns,heights:[2],version:RELEASE.buildId,release:ReleasePolicy.releaseDescriptor(RELEASE),algorithmSha256:RELEASE.identity.algorithm.sha256,sourceTimeMeaning:'Retrieval/cache time; not live observation',storage:'Cloudflare D1 + R2',capabilities:CAPABILITIES,serverTime:now()};}
async function visitor(request,env,headers){
  const cookie=request.headers.get('Cookie')||'',candidate=cookie.match(/(?:^|;\s*)lm_session=([a-f0-9]{64})(?:;|$)/)?.[1];let key=candidate&&await digest(candidate);
  if(!key||!await dbFirst(env,'SELECT token_hash FROM lm_visitors WHERE token_hash=?',key)){const raw=token();key=await digest(raw);await dbRun(env,'INSERT INTO lm_visitors(token_hash,created_at,last_seen_at) VALUES(?,?,?)',key,now(),now());headers['Set-Cookie']=`lm_session=${raw}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;}
  return key;
}
async function rateLimit(env,owner){const bucket=Math.floor(Date.now()/60000),id=`${owner}:${bucket}`;await dbRun(env,'INSERT INTO lm_request_rates(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1',id,(bucket+2)*60000);const row=await dbFirst(env,'SELECT count FROM lm_request_rates WHERE id=?',id);if(row.count>30)fail(429,'rate-limit','Please wait before submitting more changes / 操作较频繁，请稍后重试。');}
async function requestedRelease(id,env){const release=await staticRelease(id||RELEASE.buildId,env);if(release.identity.algorithm.sha256!==RELEASE.identity.algorithm.sha256)reject('unsupported-algorithm','This cloud service cannot execute that historical algorithm. View its original evidence or explicitly calculate with the current version / 云服务不执行此历史算法，可查看原证据或明确使用当前版本重算。');return release;}
async function calculate(env,requestValue,owner,origin){
  ReleasePolicy.assertClientRelease(requestValue,RELEASE);
  const settings=validateSettings(requestValue.settings),release=await requestedRelease(requestValue.buildId,env),campaign=requestValue.campaign;
  let missionConstraints;try{missionConstraints=MissionPolicy.assertMissionArrival(settings,requestValue.missionConstraints);}catch(error){reject('invalid-mission-constraints',error.message);}
  if(typeof campaign!=='string'||campaign.length>100)reject('unsupported-campaign','Select a supported campaign.');
  if(requestValue.lat!==undefined||requestValue.lon!==undefined)reject('uncovered-location','Arbitrary coordinates cannot reuse a nearby result / 任意坐标不能套用邻近结果。');
  const {text,data,descriptor}=await input(campaign,release,env);ReleasePolicy.assertCalculationRelease(requestValue,release,descriptor);const site=data.sites.find(s=>s.id===requestValue.siteId);if(!site)reject('uncovered-location','No verified data for this location / 该位置暂无可计算数据。');const point=site.patches.find(p=>p.id===(requestValue.patchId||'e+0-n+0'));if(!point)reject('uncovered-point','No verified data for this point / 此取样点没有经过验证的数据。');
  const end=Date.parse(settings.start)+settings.durationHours*3600000;if(Date.parse(settings.start)<Date.parse(data.start)||end>Date.parse(data.stop))reject('uncovered-date','The mission exceeds verified data coverage. Choose a listed date range / 任务超出可计算日期，请选择已有覆盖范围。');
  if(data.observerHeightM!==settings.observerHeightM)reject('unsupported-height','Terrain and ephemerides do not match this height.');
  if((await dbFirst(env,'SELECT count(*) AS n FROM lm_analyses WHERE owner_hash=?',owner)).n>=1000)fail(409,'analysis-limit','This visitor has reached the 1,000 calculation limit.');
  const id=crypto.randomUUID(),createdAt=now(),language=requestValue.language==='zh'?'zh':'en',parameters={campaign,siteId:site.id,patchId:point.id,settings,missionConstraints,buildId:release.buildId,language};
  await dbRun(env,'INSERT INTO lm_analyses(id,owner_hash,status,created_at,parameters_json) VALUES(?,?,?,?,?)',id,owner,'processing',createdAt,JSON.stringify(parameters));
  try{
    const results=data.sites.map(s=>Algorithm.analyzeSite(s,settings)),selectedPointResult=Algorithm.analyzeSite({...site,...point,samples:point.samples||site.samples,patches:[]},settings);
    if(results.some(r=>r.status!=='complete')||selectedPointResult.status!=='complete')reject('incomplete-data','Data coverage is incomplete; no formal result was saved / 数据覆盖不完整，未生成正式结果。');
    const calculatedAt=now(),absolute=p=>new URL(p,origin).href,url=new URL('navigator.html',origin);for(const[k,v]of Object.entries({campaign,site:site.id,patch:point.id,lang:language,...settings,build:release.buildId,algo:release.identity.algorithm.sha256,data:descriptor.sha256}))url.searchParams.set(k,String(v));
    MissionPolicy.appendMissionConstraints(url.searchParams,missionConstraints);
    const record={project:'LunaMargin',schemaVersion:3,language,exportedAt:calculatedAt,calculatedAt,sourceDataTime:data.sourceDataTime||data.generatedAt,campaign,settings,missionConstraints,selectedSiteId:site.id,
      selectedPoint:{id:point.id,siteId:site.id,dxM:point.dxM,dyM:point.dyM,lat:point.lat,lon:point.lon,elevationM:point.elevationM,isCenter:!point.dxM&&!point.dyM,result:selectedPointResult},
      provenance:{buildId:release.buildId,calculationBuildId:release.buildId,interfaceBuildId:RELEASE.buildId,algorithmSha256:release.identity.algorithm.sha256,datasetSha256:descriptor.sha256,modelMethodVersion:release.identity.methodVersion,observerHeightM:2,verification:'sha256-verified',manifestURL:absolute(`evidence-assets/build-${release.buildId}.json`),interfaceManifestURL:absolute(`evidence-assets/build-${RELEASE.buildId}.json`),algorithmSnapshotURL:absolute(release.identity.algorithm.snapshot),datasetSnapshotURL:absolute(descriptor.snapshot),sourceIdentity:release.identity.sourceIdentity},
      inputSnapshot:{format:'utf8-json',sha256:descriptor.sha256,text},algorithmSnapshot:{format:'javascript-source',sha256:release.identity.algorithm.sha256,text:ALGORITHM_SOURCE},shareURL:url.href,
      stressTest:Algorithm.stressTestSite(site,settings),searchRule:MissionPolicy.missionSearchRule(missionConstraints),
      data:{generatedAt:data.generatedAt,referenceFrame:data.referenceFrame,start:data.start,stop:data.stop,sampleIntervalMinutes:data.sampleIntervalMinutes,horizonMethod:data.horizonMethod,sources:data.sources,limitations:data.limitations},
      sites:data.sites.map(s=>({id:s.id,name:s.name,lat:s.lat,lon:s.lon,elevationM:s.elevationM,slopeDeg:s.slopeDeg,heightRmsErrorM:s.heightRmsErrorM,ephemerisSources:s.ephemerisSources,patches:s.patches.map(({id,dxM,dyM,lat,lon,elevationM})=>({id,dxM,dyM,lat,lon,elevationM}))})),results,
      server:{analysisId:id,calculatedAt,sourceDataTime:data.sourceDataTime||data.generatedAt,execution:'verified-server-algorithm',storage:'Cloudflare D1 + R2'},interpretation:'Geometric screening, not flight safety, power or radio-link assurance. Footprint fractions are discrete scenario counts, not probabilities.'};
    record.validationEvidence=RecordPolicy.buildRecordValidation(record,RELEASE,VALIDATION_CATALOG);
    const recordJSON=JSON.stringify(record),recordSha256=await digest(recordJSON),recordKey=`records/${id}.json`;
    await env.BUCKET.put(recordKey,recordJSON,{httpMetadata:{contentType:'application/json'},sha256:recordSha256});
    await dbRun(env,'UPDATE lm_analyses SET status=?,completed_at=?,record_key=?,record_sha256=? WHERE id=?','completed',calculatedAt,recordKey,recordSha256,id);
    return{id,status:'completed',record,recordSha256};
  }catch(error){await dbRun(env,'UPDATE lm_analyses SET status=?,completed_at=?,error_json=? WHERE id=?','failed',now(),JSON.stringify({code:error.code||'calculation-failed',message:error.message}),id);throw error;}
}
async function recordOf(env,row){if(!row.record_key||!row.record_sha256)fail(409,'record-incomplete','This calculation has no completed record.');const object=await env.BUCKET.get(row.record_key);if(!object)fail(503,'record-unavailable','Saved evidence is temporarily unavailable / 保存的证据暂不可用，请重试。');const text=await object.text();if(await digest(text)!==row.record_sha256)fail(503,'stored-checksum','Saved evidence checksum failed / 保存的证据校验失败。');return JSON.parse(text);}
const taskMetadata=row=>({id:row.id,analysisId:row.analysis_id,name:row.name,createdAt:row.created_at,updatedAt:row.updated_at,calculatedAt:row.completed_at,recordSha256:row.record_sha256});
async function ownedTask(env,id,owner){const row=await dbFirst(env,'SELECT t.*,a.record_key,a.record_sha256,a.completed_at FROM lm_tasks t JOIN lm_analyses a ON a.id=t.analysis_id WHERE t.id=? AND t.owner_hash=?',id,owner);if(!row)fail(404,'task-not-found','Task not found for this visitor / 当前访客没有此任务。');return row;}
async function taskResponse(env,row,readOnly=false){return{task:taskMetadata(row),record:await recordOf(env,row),recordSha256:row.record_sha256,readOnly};}
async function taskLimit(env,owner){if((await dbFirst(env,'SELECT count(*) AS n FROM lm_tasks WHERE owner_hash=?',owner)).n>=200)fail(409,'task-limit','Keep up to 200 saved missions / 最多保存 200 项任务。');}
async function api(request,env,url,headers){
  await initialize(env);const method=request.method,pathname=url.pathname;
  if(!['GET','POST','PATCH','DELETE'].includes(method))fail(405,'method-not-allowed','Method not allowed.');
  if(method!=='GET'&&(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site'))fail(403,'cross-origin','Cross-origin changes are not permitted.');
  if(pathname==='/api/health'&&method==='GET'){await dbFirst(env,'SELECT build_id FROM lm_releases WHERE build_id=?',RELEASE.buildId);return{ok:true,service:'LunaMargin',database:'Cloudflare D1',objectStorage:'R2',persistent:true,time:now(),schemaVersion:1,capabilities:CAPABILITIES,release:ReleasePolicy.releaseDescriptor(RELEASE)};}
  const owner=await visitor(request,env,headers);if(method!=='GET')await rateLimit(env,owner);
  if(pathname==='/api/coverage'&&method==='GET')return coverage(env);
  if(pathname==='/api/analyses'&&method==='POST')return calculate(env,await body(request),owner,url.origin);
  const analysisMatch=/^\/api\/analyses\/([a-f0-9-]{36})$/.exec(pathname);if(analysisMatch&&method==='GET'){const row=await dbFirst(env,'SELECT * FROM lm_analyses WHERE id=? AND owner_hash=?',analysisMatch[1],owner);if(!row)fail(404,'analysis-not-found','Calculation not found for this visitor.');return{id:row.id,status:row.status,record:row.status==='completed'?await recordOf(env,row):null,recordSha256:row.record_sha256,error:row.error_json?JSON.parse(row.error_json):null};}
  if(pathname==='/api/tasks'){
    if(method==='GET'){const rows=await dbAll(env,'SELECT t.*,a.record_sha256,a.completed_at,a.parameters_json FROM lm_tasks t JOIN lm_analyses a ON a.id=t.analysis_id WHERE t.owner_hash=? ORDER BY t.created_at DESC LIMIT 200',owner);return{tasks:rows.map(row=>({...taskMetadata(row),parameters:JSON.parse(row.parameters_json)}))};}
    if(method==='POST'){const value=await body(request),name=nameOf(value.name),analysis=await dbFirst(env,"SELECT id FROM lm_analyses WHERE id=? AND owner_hash=? AND status='completed'",String(value.analysisId||''),owner);if(!analysis)fail(404,'analysis-not-found','Save your own completed calculation / 请保存属于当前访客的已完成计算。');await taskLimit(env,owner);const id=crypto.randomUUID(),date=now();await dbRun(env,'INSERT INTO lm_tasks(id,owner_hash,analysis_id,name,created_at,updated_at) VALUES(?,?,?,?,?,?)',id,owner,analysis.id,name,date,date);return taskResponse(env,await ownedTask(env,id,owner));}
  }
  const match=/^\/api\/tasks\/([a-f0-9-]{36})(?:\/(copy|share))?$/.exec(pathname);if(match){const row=await ownedTask(env,match[1],owner),action=match[2];
    if(!action&&method==='GET')return taskResponse(env,row);
    if(!action&&method==='PATCH'){await dbRun(env,'UPDATE lm_tasks SET name=?,updated_at=? WHERE id=? AND owner_hash=?',nameOf((await body(request)).name),now(),row.id,owner);return taskResponse(env,await ownedTask(env,row.id,owner));}
    if(!action&&method==='DELETE'){await env.DB.batch([env.DB.prepare('DELETE FROM lm_shares WHERE task_id=?').bind(row.id),env.DB.prepare('DELETE FROM lm_tasks WHERE id=? AND owner_hash=?').bind(row.id,owner)]);return{deleted:true,id:row.id};}
    if(action==='copy'&&method==='POST'){const value=await body(request);await taskLimit(env,owner);const id=crypto.randomUUID(),date=now();await dbRun(env,'INSERT INTO lm_tasks(id,owner_hash,analysis_id,name,created_at,updated_at) VALUES(?,?,?,?,?,?)',id,owner,row.analysis_id,nameOf(value.name||row.name.slice(0,110)+' · copy'),date,date);return taskResponse(env,await ownedTask(env,id,owner));}
    if(action==='share'&&method==='POST'){const raw=token();await dbRun(env,'INSERT INTO lm_shares(token_hash,task_id,created_at) VALUES(?,?,?)',await digest(raw),row.id,now());const link=new URL('navigator.html',url.origin);link.searchParams.set('share',raw);return{token:raw,url:link.href,readOnly:true,taskId:row.id};}
  }
  const share=/^\/api\/shared\/([a-f0-9]{64})$/.exec(pathname);if(share&&method==='GET'){const row=await dbFirst(env,'SELECT t.*,a.record_key,a.record_sha256,a.completed_at FROM lm_shares s JOIN lm_tasks t ON t.id=s.task_id JOIN lm_analyses a ON a.id=t.analysis_id WHERE s.token_hash=?',await digest(share[1]));if(!row)fail(404,'share-not-found','Read-only link unavailable or deleted / 只读链接不可用或任务已删除。');return taskResponse(env,row,true);}
  if(pathname==='/api/data-jobs'&&method==='GET')return{jobs:[],capabilities:CAPABILITIES};
  if(pathname.startsWith('/api/data-jobs'))fail(422,'new-dates-unavailable','New-date acquisition is not deployed on this cloud service. Choose existing coverage or save your conditions to a file / 此云服务尚未部署新日期获取，可选择已有覆盖或保存条件文件。');
  fail(404,'not-found','API route not found.');
}
const MIME={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json; charset=utf-8',svg:'image/svg+xml',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',webm:'video/webm',vtt:'text/vtt; charset=utf-8',md:'text/plain; charset=utf-8',txt:'text/plain; charset=utf-8'};
const assetFlights=new Map();
async function staticRelease(id,env){
 if(id===RELEASE.buildId)return RELEASE;if(!validHash(id))fail(404,'version-unavailable','Unknown release.');
 const key=`evidence-assets/build-${id}.json`,text=ASSETS[key]||await(await env?.BUCKET?.get(key))?.text();if(!text)fail(404,'version-unavailable','Saved version unavailable / 所需历史版本不可用。');
 const release=JSON.parse(text);if(release.buildId!==id||await digest(JSON.stringify(release.identity))!==id)fail(503,'release-checksum','Version checksum failed.');return release;
}
function descriptorFor(release,key){
 const identity=release.identity;if(identity.application[key])return identity.application[key];if(identity.resources?.[key])return identity.resources[key];
 const dataset=Object.values(identity.datasets).find(item=>item.path===key);if(dataset)return dataset;
 return [...Object.values(identity.application),...Object.values(identity.datasets),...Object.values(identity.resources||{}),...Object.values(identity.service||{})].find(item=>item.snapshot===key);
}
function assetRange(header,size){if(!header)return null;const match=/^bytes=(\d*)-(\d*)$/.exec(header);let start=0,end=size-1;if(!match||!match[1]&&!match[2])fail(416,'invalid-range','Unsupported byte range.');if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),end);}else{const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)fail(416,'invalid-range','Unsupported byte range.');start=Math.max(0,size-suffix);}if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=size)fail(416,'invalid-range','Unsupported byte range.');return{start,end};}
async function checkedAsset(descriptor,env){
 const key=descriptor.snapshot;if(!validHash(descriptor.sha256)||!new RegExp('^evidence-assets/'+descriptor.sha256+'\\.[a-z0-9]+$').test(key))fail(503,'asset-index','Invalid resource index.');
 if(Object.hasOwn(ASSETS,key))return encoder.encode(ASSETS[key]);
 if(Object.hasOwn(BINARY_ASSETS,key))return Uint8Array.from(atob(BINARY_ASSETS[key]),c=>c.charCodeAt(0));
 if(assetFlights.has(key))return assetFlights.get(key);
 const promise=(async()=>{
   const saved=await env?.BUCKET?.get(key);if(saved){const bytes=new Uint8Array(await saved.arrayBuffer());if(await digest(bytes)!==descriptor.sha256)fail(503,'asset-checksum','Archived resource checksum failed / 归档资源校验失败。');return bytes;}
   if(!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<0||descriptor.bytes>16*1024*1024)fail(503,'asset-unavailable','This resource is not available in the verified asset store / 此资源尚未进入可验证存储。');
   // Only a descriptor's content-addressed URL can leave this service. Mutable
   // HTML, script, data or media paths are never fetched from another release.
   const upstream=await fetch(new URL(key,UPSTREAM),{redirect:'manual',headers:{'Accept-Encoding':'identity'}});
   if(upstream.status!==200)fail(503,'asset-unavailable','The immutable resource is not yet available. Retry after publication / 固定版本资源尚未就绪，请稍后重试。');
   const reader=upstream.body.getReader(),chunks=[];let length=0;for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>descriptor.bytes){await reader.cancel();fail(503,'asset-checksum','Resource size exceeds its verified index.');}chunks.push(value);}
   const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}if(length!==descriptor.bytes||await digest(bytes)!==descriptor.sha256)fail(503,'asset-checksum','Resource checksum mismatch; no substitute was served / 资源校验失败，未提供替代内容。');
   if(!env.BUCKET)fail(503,'storage-unavailable','Verified object storage is unavailable.');await env.BUCKET.put(key,bytes,{sha256:descriptor.sha256,httpMetadata:{contentType:MIME[key.split('.').pop()]||'application/octet-stream'}});return bytes;
 })().finally(()=>assetFlights.delete(key));assetFlights.set(key,promise);return promise;
}
async function staticResponse(request,env,ctx,release,key){
 if(key==='build-info.json')return response(release,200,{'X-LunaMargin-Release':release.buildId});
 const manifestMatch=/^evidence-assets\/build-([a-f0-9]{64})\.json$/.exec(key);if(manifestMatch)return response(await staticRelease(manifestMatch[1],env),200,{'Cache-Control':'public,max-age=31536000,immutable'});
 const oldAsset=/^evidence-assets\/([a-f0-9]{64})\.[a-z0-9]+$/.exec(key),descriptor=descriptorFor(release,key)||(oldAsset?{sha256:oldAsset[1],snapshot:key}:null);if(!descriptor)fail(404,'asset-not-in-release','This file is not part of the requested release / 此文件不属于请求的发布版本。');
 const bytes=await checkedAsset(descriptor,env),range=assetRange(request.headers.get('Range'),bytes.length),headers={'Content-Type':MIME[descriptor.snapshot.split('.').pop()]||'application/octet-stream','Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff','X-LunaMargin-Release':release.buildId,'X-LunaMargin-Asset-SHA256':descriptor.sha256,'Accept-Ranges':'bytes','Content-Length':String(range?range.end-range.start+1:bytes.length)};
 if(range)headers['Content-Range']=`bytes ${range.start}-${range.end}/${bytes.length}`;
 // A deploy's interface remains archived in the same private store as its data.
 if(env.BUCKET&&ctx?.waitUntil&&Object.hasOwn(ASSETS,descriptor.snapshot))ctx.waitUntil(env.BUCKET.put(descriptor.snapshot,bytes,{sha256:descriptor.sha256,httpMetadata:{contentType:headers['Content-Type']}}).catch(error=>console.error('Archive asset failed',error.message)));
 return new Response(request.method==='HEAD'?null:range?bytes.subarray(range.start,range.end+1):bytes,{status:range?206:200,headers});
}
export default {async fetch(request,env,ctx){
  const headers={};
  try{
    const url=new URL(request.url),prefix=/^\/releases\/([a-f0-9]{64})\/(.*)$/.exec(url.pathname),key=prefix?prefix[2]:url.pathname.slice(1),routed=new URL(url);routed.pathname='/'+key;
    if(key==='service-config.json')return response({service:true,serviceType:'cloud-d1',capabilities:CAPABILITIES,release:ReleasePolicy.releaseDescriptor(RELEASE)});
    if(key.startsWith('api/'))return response(await api(request,env,routed,headers),request.method==='POST'?201:200,headers);
    if(!['GET','HEAD'].includes(request.method))fail(405,'method-not-allowed','Method not allowed.');
    if(!prefix&&['','index.html','navigator.html'].includes(key)){const target=new URL(url);target.pathname=`/releases/${RELEASE.buildId}/${key||'index.html'}`;return new Response(null,{status:302,headers:{Location:target.href,'Cache-Control':'no-store'}});}
    if(key.split('/').some(part=>part.startsWith('.'))||url.search.length>2048)fail(404,'not-found','Not found.');
    const release=prefix?await staticRelease(prefix[1],env):RELEASE;
    // Legacy snapshot links still resolve by their immutable digest. No alias is allowed to drift.
    if(!prefix&&ASSETS[key])return new Response(request.method==='HEAD'?null:ASSETS[key],{headers:{'Content-Type':MIME[key.split('.').pop()]||'application/octet-stream','Cache-Control':'public,max-age=31536000,immutable'}});
    const result=await staticResponse(request,env,ctx,release,key||'index.html');
    if(!prefix&&!key.startsWith('evidence-assets/'))result.headers.set('Cache-Control','no-store');
    return result;
  }catch(error){if(!error.status)console.error('Cloud service error',error.message);return response({error:{code:error.code||'service-error',message:error.status?error.message:'Cloud service could not complete this request. Your draft remains available / 云服务暂未完成请求，你的草稿仍会保留。'}},error.status||503,headers);}
}};
