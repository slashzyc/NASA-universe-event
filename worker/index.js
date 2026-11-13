/** Cloud API. Generated build bindings contain the unchanged verified algorithm and NASA inputs. */
/*__GENERATED_BINDINGS__*/
const UPSTREAM='https://slashzyc.github.io/NASA-universe-event/';
const CAPABILITIES={serverSave:true,newDates:false,browserFiles:true,readOnlySharing:true};
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const now=()=>new Date().toISOString();
const encoder=new TextEncoder();
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
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
async function input(campaign,release=RELEASE){
  const descriptor=release.identity.datasets[campaign];if(!descriptor)reject('unsupported-campaign','No verified data for this campaign / 此数据集暂无可计算数据。');
  let result=inputCache.get(descriptor.sha256);if(result)return result;
  const text=ASSETS[descriptor.snapshot];if(!text||await digest(text)!==descriptor.sha256)fail(503,'dataset-unavailable','Verified input snapshot is unavailable / 输入快照暂不可用。');
  result={text,data:JSON.parse(text),descriptor};inputCache.set(descriptor.sha256,result);return result;
}
async function initialize(env){
  if(!env.DB||!env.BUCKET)fail(503,'storage-unavailable','Cloud storage is not connected. Device file saving is available / 云存储尚未连接，可保存到设备文件。');
  if(initializePromise)return initializePromise;
  initializePromise=(async()=>{
    if(await digest(ALGORITHM_SOURCE)!==RELEASE.identity.algorithm.sha256||await digest(JSON.stringify(RELEASE.identity))!==RELEASE.buildId)fail(503,'build-checksum','Cloud build verification failed.');
    if(await dbFirst(env,'SELECT build_id FROM lm_releases WHERE build_id=?',RELEASE.buildId))return;
    const statements=[];
    for(const [id,descriptor]of Object.entries(RELEASE.identity.datasets)){
      const {data,text}=await input(id);const meta={id,...descriptor,sampleIntervalMinutes:data.sampleIntervalMinutes,sourceDataTime:data.sourceDataTime||data.generatedAt,origin:'verified-bundled'};
      statements.push(env.DB.prepare('INSERT OR REPLACE INTO lm_datasets(id,sha256,metadata_json) VALUES(?,?,?)').bind(id,descriptor.sha256,JSON.stringify(meta)));
      await env.BUCKET.put(descriptor.snapshot,text,{httpMetadata:{contentType:'application/json'},sha256:descriptor.sha256});
      if(id==='jun')for(const site of data.sites){const region=regionOf(site,data);statements.push(env.DB.prepare('INSERT OR REPLACE INTO lm_regions(id,metadata_json) VALUES(?,?)').bind(site.id,JSON.stringify(region)));}
    }
    await env.BUCKET.put(RELEASE.identity.algorithm.snapshot,ALGORITHM_SOURCE,{httpMetadata:{contentType:'text/javascript'},sha256:RELEASE.identity.algorithm.sha256});
    await env.BUCKET.put(`evidence-assets/build-${RELEASE.buildId}.json`,JSON.stringify(RELEASE),{httpMetadata:{contentType:'application/json'}});
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO lm_releases(build_id,algorithm_sha256,manifest_json) VALUES(?,?,?)').bind(RELEASE.buildId,RELEASE.identity.algorithm.sha256,JSON.stringify(RELEASE)));
    await env.DB.batch(statements);
  })().catch(error=>{initializePromise=null;throw error;});return initializePromise;
}
function regionOf(site,data){return{id:site.id,name:site.name,lat:site.lat,lon:site.lon,elevationM:site.elevationM,regionId:'connecting-ridge',observerHeightsM:[2],points:site.patches.map(({id,dxM,dyM,lat,lon,elevationM})=>({id,dxM,dyM,lat,lon,elevationM})),coverage:{kind:'discrete-sampled-points',pointCount:9,pointSpacingM:25,terrainPixelSpacingM:[5,80],horizonAzimuthSpacingDeg:1,horizonRangeKm:250},sources:data.sources,limitations:data.limitations,sourceDataTime:data.sourceDataTime||data.generatedAt};}
async function coverage(env){const campaigns=[];for(const [id,descriptor]of Object.entries(RELEASE.identity.datasets)){const row=await dbFirst(env,'SELECT sha256,metadata_json FROM lm_datasets WHERE id=?',id);if(!row||row.sha256!==descriptor.sha256)fail(503,'coverage-version','Coverage index is updating; please retry / 数据覆盖索引正在更新，请重试。');campaigns.push({...JSON.parse(row.metadata_json),name:({dec:'December 2026 / 2026 年 12 月',mar:'March 2027 / 2027 年 3 月',jun:'June 2027 / 2027 年 6 月'})[id]||id});}const index=new Map((await dbAll(env,'SELECT id,metadata_json FROM lm_regions')).map(row=>[row.id,JSON.parse(row.metadata_json)])),regions=(await input('jun')).data.sites.map(site=>index.get(site.id));if(regions.some(region=>!region))fail(503,'coverage-unavailable','Research-region index unavailable / 研究区索引暂不可用。');return{regions,campaigns,heights:[2],version:RELEASE.buildId,algorithmSha256:RELEASE.identity.algorithm.sha256,sourceTimeMeaning:'Retrieval/cache time; not live observation',storage:'Cloudflare D1 + R2',capabilities:CAPABILITIES,serverTime:now()};}
async function visitor(request,env,headers){
  const cookie=request.headers.get('Cookie')||'',candidate=cookie.match(/(?:^|;\s*)lm_session=([a-f0-9]{64})(?:;|$)/)?.[1];let key=candidate&&await digest(candidate);
  if(!key||!await dbFirst(env,'SELECT token_hash FROM lm_visitors WHERE token_hash=?',key)){const raw=token();key=await digest(raw);await dbRun(env,'INSERT INTO lm_visitors(token_hash,created_at,last_seen_at) VALUES(?,?,?)',key,now(),now());headers['Set-Cookie']=`lm_session=${raw}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;}
  return key;
}
async function rateLimit(env,owner){const bucket=Math.floor(Date.now()/60000),id=`${owner}:${bucket}`;await dbRun(env,'INSERT INTO lm_request_rates(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1',id,(bucket+2)*60000);const row=await dbFirst(env,'SELECT count FROM lm_request_rates WHERE id=?',id);if(row.count>30)fail(429,'rate-limit','Please wait before submitting more changes / 操作较频繁，请稍后重试。');}
async function requestedRelease(id){if(!id||id===RELEASE.buildId)return RELEASE;if(!validHash(id))reject('invalid-version','Invalid saved version.');const text=ASSETS[`evidence-assets/build-${id}.json`];if(!text)fail(404,'version-unavailable','Saved version unavailable / 所需历史版本不可用。');const release=JSON.parse(text);if(await digest(JSON.stringify(release.identity))!==id)fail(503,'release-checksum','Version checksum failed.');if(release.identity.algorithm.sha256!==RELEASE.identity.algorithm.sha256)reject('unsupported-algorithm','This cloud service cannot execute that historical algorithm. View its original evidence or explicitly calculate with the current version / 云服务不执行此历史算法，可查看原证据或明确使用当前版本重算。');return release;}
async function calculate(env,requestValue,owner,origin){
  const settings=validateSettings(requestValue.settings),release=await requestedRelease(requestValue.buildId),campaign=requestValue.campaign;
  if(typeof campaign!=='string'||campaign.length>100)reject('unsupported-campaign','Select a supported campaign.');
  if(requestValue.lat!==undefined||requestValue.lon!==undefined)reject('uncovered-location','Arbitrary coordinates cannot reuse a nearby result / 任意坐标不能套用邻近结果。');
  const {text,data,descriptor}=await input(campaign,release),site=data.sites.find(s=>s.id===requestValue.siteId);if(!site)reject('uncovered-location','No verified data for this location / 该位置暂无可计算数据。');const point=site.patches.find(p=>p.id===(requestValue.patchId||'e+0-n+0'));if(!point)reject('uncovered-point','No verified data for this point / 此取样点没有经过验证的数据。');
  const end=Date.parse(settings.start)+settings.durationHours*3600000;if(Date.parse(settings.start)<Date.parse(data.start)||end>Date.parse(data.stop))reject('uncovered-date','The mission exceeds verified data coverage. Choose a listed date range / 任务超出可计算日期，请选择已有覆盖范围。');
  if(data.observerHeightM!==settings.observerHeightM)reject('unsupported-height','Terrain and ephemerides do not match this height.');
  if((await dbFirst(env,'SELECT count(*) AS n FROM lm_analyses WHERE owner_hash=?',owner)).n>=1000)fail(409,'analysis-limit','This visitor has reached the 1,000 calculation limit.');
  const id=crypto.randomUUID(),createdAt=now(),language=requestValue.language==='zh'?'zh':'en',parameters={campaign,siteId:site.id,patchId:point.id,settings,buildId:release.buildId,language};
  await dbRun(env,'INSERT INTO lm_analyses(id,owner_hash,status,created_at,parameters_json) VALUES(?,?,?,?,?)',id,owner,'processing',createdAt,JSON.stringify(parameters));
  try{
    const results=data.sites.map(s=>Algorithm.analyzeSite(s,settings)),selectedPointResult=Algorithm.analyzeSite({...site,...point,samples:point.samples||site.samples,patches:[]},settings);
    if(results.some(r=>r.status!=='complete')||selectedPointResult.status!=='complete')reject('incomplete-data','Data coverage is incomplete; no formal result was saved / 数据覆盖不完整，未生成正式结果。');
    const calculatedAt=now(),absolute=p=>new URL(p,origin).href,url=new URL('navigator.html',origin);for(const[k,v]of Object.entries({campaign,site:site.id,patch:point.id,lang:language,...settings,build:release.buildId,algo:release.identity.algorithm.sha256,data:descriptor.sha256}))url.searchParams.set(k,String(v));
    const record={project:'LunaMargin',schemaVersion:3,language,exportedAt:calculatedAt,calculatedAt,sourceDataTime:data.sourceDataTime||data.generatedAt,campaign,settings,selectedSiteId:site.id,
      selectedPoint:{id:point.id,siteId:site.id,dxM:point.dxM,dyM:point.dyM,lat:point.lat,lon:point.lon,elevationM:point.elevationM,isCenter:!point.dxM&&!point.dyM,result:selectedPointResult},
      provenance:{buildId:release.buildId,calculationBuildId:release.buildId,interfaceBuildId:RELEASE.buildId,algorithmSha256:release.identity.algorithm.sha256,datasetSha256:descriptor.sha256,modelMethodVersion:release.identity.methodVersion,observerHeightM:2,verification:'sha256-verified',manifestURL:absolute(`evidence-assets/build-${release.buildId}.json`),interfaceManifestURL:absolute(`evidence-assets/build-${RELEASE.buildId}.json`),algorithmSnapshotURL:absolute(release.identity.algorithm.snapshot),datasetSnapshotURL:absolute(descriptor.snapshot),sourceIdentity:release.identity.sourceIdentity},
      inputSnapshot:{format:'utf8-json',sha256:descriptor.sha256,text},algorithmSnapshot:{format:'javascript-source',sha256:release.identity.algorithm.sha256,text:ALGORITHM_SOURCE},shareURL:url.href,
      stressTest:Algorithm.stressTestSite(site,settings),searchRule:'Earliest date first; then greatest minimum nine-point time margin; then darkness, Earth-gap and shared-view margins; center metrics; stable site ID.',
      data:{generatedAt:data.generatedAt,referenceFrame:data.referenceFrame,start:data.start,stop:data.stop,sampleIntervalMinutes:data.sampleIntervalMinutes,horizonMethod:data.horizonMethod,sources:data.sources,limitations:data.limitations},
      sites:data.sites.map(s=>({id:s.id,name:s.name,lat:s.lat,lon:s.lon,elevationM:s.elevationM,slopeDeg:s.slopeDeg,heightRmsErrorM:s.heightRmsErrorM,ephemerisSources:s.ephemerisSources,patches:s.patches.map(({id,dxM,dyM,lat,lon,elevationM})=>({id,dxM,dyM,lat,lon,elevationM}))})),results,
      server:{analysisId:id,calculatedAt,sourceDataTime:data.sourceDataTime||data.generatedAt,execution:'verified-server-algorithm',storage:'Cloudflare D1 + R2'},interpretation:'Geometric screening, not flight safety, power or radio-link assurance. Footprint fractions are discrete scenario counts, not probabilities.'};
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
  if(pathname==='/api/health'&&method==='GET'){await dbFirst(env,'SELECT build_id FROM lm_releases WHERE build_id=?',RELEASE.buildId);return{ok:true,service:'LunaMargin',database:'Cloudflare D1',objectStorage:'R2',persistent:true,time:now(),schemaVersion:1,capabilities:CAPABILITIES};}
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
export default {async fetch(request,env,ctx){
  const headers={};
  try{
    const url=new URL(request.url);if(url.pathname==='/service-config.json')return response({service:true,serviceType:'cloud-d1',capabilities:CAPABILITIES});
    if(url.pathname.startsWith('/api/'))return response(await api(request,env,url,headers),request.method==='POST'?201:200,headers);
    if(!['GET','HEAD'].includes(request.method))fail(405,'method-not-allowed','Method not allowed.');
    const key=url.pathname.slice(1);if(key==='build-info.json')return new Response(request.method==='HEAD'?null:JSON.stringify(RELEASE),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    if(ASSETS[key])return new Response(request.method==='HEAD'?null:ASSETS[key],{headers:{'Content-Type':key.endsWith('.js')?'text/javascript':'application/json','Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff'}});
    if(/^evidence-assets\/(?:build-)?[a-f0-9]{64}\.(?:js|json)$/.test(key)&&env.BUCKET){const object=await env.BUCKET.get(key);if(object)return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':key.endsWith('.js')?'text/javascript':'application/json','Cache-Control':'public,max-age=31536000,immutable'}});}
    if(!/^(?:|index\.html|navigator\.html|(?:src|assets|data|docs|evidence-assets)\/[^?]+)$/.test(key)||key.split('/').some(p=>p.startsWith('.'))||url.search.length>2048)fail(404,'not-found','Not found.');
    const target=new URL(key||'index.html',UPSTREAM);const forwardedHeaders={};if(request.headers.has('Range'))forwardedHeaders.Range=request.headers.get('Range');
    const upstream=await fetch(target,{method:request.method,headers:forwardedHeaders,redirect:'error'});const out=new Headers(upstream.headers);out.delete('Set-Cookie');out.set('X-Content-Type-Options','nosniff');out.set('Cache-Control',key.startsWith('evidence-assets/')?'public,max-age=31536000,immutable':'no-store');out.set('X-LunaMargin-Frontend','github-pages-origin');return new Response(upstream.body,{status:upstream.status,headers:out});
  }catch(error){if(!error.status)console.error('Cloud service error',error.message);return response({error:{code:error.code||'service-error',message:error.status?error.message:'Cloud service could not complete this request. Your draft remains available / 云服务暂未完成请求，你的草稿仍会保留。'}},error.status||503,headers);}
}};
