import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openStore} from './store.mjs';
import {createCalculator,APIError,digest} from './calculation.mjs';
import {createHorizonsPipeline,validateDataRange} from './horizons.mjs';

const checkout=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.webm':'video/webm','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const now=()=>new Date().toISOString();
function json(res,status,value){const text=JSON.stringify(value);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(text),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(text);}
function fail(status,code,message){throw new APIError(status,code,message);}
async function body(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail(415,'json-required','Send application/json / 请求必须使用 JSON。');
  if(Number(req.headers['content-length'])>65536){req.resume();fail(413,'body-too-large','Request body exceeds 64 KB.');}
  const chunks=await new Promise((resolve,reject)=>{
    let size=0,exceeded=false;const received=[];
    req.on('data',chunk=>{size+=chunk.length;if(size>65536){if(!exceeded){exceeded=true;received.length=0;reject(new APIError(413,'body-too-large','Request body exceeds 64 KB.'));}return;}received.push(chunk);});
    req.on('end',()=>{if(!exceeded)resolve(received);});req.on('error',reject);
  });
  let value;try{value=JSON.parse(Buffer.concat(chunks).toString());}catch{fail(400,'invalid-json','Invalid JSON request.');}
  if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'invalid-json','A JSON object is required.');return value;
}
function taskName(value){if(typeof value!=='string'||!value.trim()||value.trim().length>120)fail(422,'invalid-name','Name must contain 1–120 characters / 任务名称须为 1–120 个字符。');return value.trim();}

/** One process owns SQLite and the serial Horizons queue. No browser credentials. */
export async function createService(options={}){
  const root=path.resolve(options.root||checkout),staticRoot=path.resolve(options.staticRoot||path.join(root,'dist'));
  const dataDir=path.resolve(options.dataDir||process.env.LUNAMARGIN_DATA_DIR||path.join(root,'var'));
  await stat(path.join(staticRoot,'build-info.json')).catch(()=>{throw new Error('Build the frontend first: npm run build');});
  const db=openStore(dataDir);
  // A process interruption cannot turn a partially written analysis into a success.
  db.prepare("UPDATE analyses SET status='failed',completed_at=?,error_json=? WHERE status='processing'").run(now(),JSON.stringify({code:'server-restarted',message:'Server restarted before this calculation completed. Please retry.'}));
  const pipeline=options.pipeline||await createHorizonsPipeline({root:staticRoot,dataDir,
    onJob:async job=>db.prepare('INSERT INTO data_jobs(id,status,metadata_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at').run(job.id,job.status,JSON.stringify(job),now()),
    onDataset:async entry=>db.prepare('INSERT OR REPLACE INTO datasets VALUES(?,?,?)').run(entry.id,entry.sha256,JSON.stringify(entry))});
  const durableJobIds=new Set(pipeline.listJobs().map(job=>job.id));
  for(const row of db.prepare("SELECT id,metadata_json FROM data_jobs WHERE status NOT IN ('completed','succeeded','failed')").all())if(!durableJobIds.has(row.id)){
    const job=JSON.parse(row.metadata_json);job.status='failed';job.stage='failed';job.updatedAt=now();job.error={code:'queue-interrupted',message:'The service stopped before this request entered the durable queue. Please submit it again.'};job.message=job.error.message;
    db.prepare('UPDATE data_jobs SET status=?,metadata_json=?,updated_at=? WHERE id=?').run('failed',JSON.stringify(job),now(),row.id);
  }
  const calculator=await createCalculator({staticRoot,dataDir,db,pipeline});
  await calculator.coverage();
  const rates=new Map();
  function checkRate(owner){const t=Date.now(),previous=rates.get(owner)||[];const recent=previous.filter(value=>t-value<60000);if(recent.length>=30)fail(429,'rate-limit','Please wait before submitting more changes / 操作较频繁，请稍后再试。');recent.push(t);rates.set(owner,recent);if(rates.size>10000)for(const[key,values]of rates)if(!values.some(value=>t-value<60000))rates.delete(key);}
  function visitor(req,res){
    const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(value=>value.trim().split('=')));
    let token=cookies.lm_session,owner=typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)?digest(token):null;
    if(!owner||!db.prepare('SELECT token_hash FROM visitors WHERE token_hash=?').get(owner)){
      token=randomBytes(32).toString('hex');owner=digest(token);
      const date=now();db.prepare('INSERT INTO visitors VALUES(?,?,?)').run(owner,date,date);
      res.setHeader('Set-Cookie',`lm_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${options.publicURL?.startsWith('https:')||process.env.LUNAMARGIN_PUBLIC_URL?.startsWith('https:')?'; Secure':''}`);
    }else db.prepare('UPDATE visitors SET last_seen_at=? WHERE token_hash=?').run(now(),owner);
    return owner;
  }
  const parseRecord=row=>{if(!row?.record_json||digest(row.record_json)!==row.record_sha256)fail(500,'stored-checksum','Stored result checksum mismatch; export stopped / 保存结果校验失败，已停止导出。');return JSON.parse(row.record_json);};
  function ownedTask(id,owner){const row=db.prepare('SELECT t.*,a.record_json,a.record_sha256,a.completed_at FROM tasks t JOIN analyses a ON a.id=t.analysis_id WHERE t.id=? AND t.owner_hash=?').get(id,owner);if(!row)fail(404,'task-not-found','Task not found for this visitor / 当前访客没有此任务。');return row;}
  function taskMetadata(row){return{id:row.id,analysisId:row.analysis_id,name:row.name,createdAt:row.created_at,updatedAt:row.updated_at,calculatedAt:row.completed_at,recordSha256:row.record_sha256};}
  function taskResponse(row,readOnly=false){return{task:taskMetadata(row),record:parseRecord(row),recordSha256:row.record_sha256,readOnly};}
  const activeRequests=new Set();let closing=false;
  const handleRequest=async(req,res)=>{
    try{
      if(closing)fail(503,'service-stopping','The service is restarting. Please retry / 服务正在重启，请稍后重试。');
      const host=req.headers.host||'127.0.0.1',origin=options.publicURL||process.env.LUNAMARGIN_PUBLIC_URL||`http://${host}`;
      const url=new URL(req.url,origin),pathname=decodeURIComponent(url.pathname);
      if(pathname==='/service-config.json'&&req.method==='GET'){json(res,200,{service:true,serviceType:'node-sqlite'});return;}
      if(pathname.startsWith('/api/')){
        const method=req.method;
        if(!['GET','POST','PATCH','DELETE'].includes(method))fail(405,'method-not-allowed','Method not allowed.');
        if(method!=='GET'){
          if(req.headers.origin&&req.headers.origin!==new URL(origin).origin)fail(403,'cross-origin','Cross-origin changes are not permitted.');
          if(req.headers['sec-fetch-site']==='cross-site')fail(403,'cross-origin','Cross-site changes are not permitted.');
        }
        const owner=visitor(req,res);if(method!=='GET')checkRate(owner);
        if(pathname==='/api/health'&&method==='GET'){json(res,200,{ok:true,service:'LunaMargin',database:'SQLite',persistent:true,time:now(),schemaVersion:1});return;}
        if(pathname==='/api/coverage'&&method==='GET'){json(res,200,await calculator.coverage());return;}
        if(pathname==='/api/analyses'&&method==='POST'){
          if(db.prepare('SELECT count(*) AS n FROM analyses WHERE owner_hash=?').get(owner).n>=1000)fail(409,'analysis-limit','Visitor storage limit reached (1,000 calculations).');
          json(res,201,await calculator.calculate(await body(req),{owner,origin}));return;
        }
        const analysisMatch=/^\/api\/analyses\/([a-f0-9-]{36})$/.exec(pathname);
        if(analysisMatch&&method==='GET'){
          const row=db.prepare('SELECT * FROM analyses WHERE id=? AND owner_hash=?').get(analysisMatch[1],owner);
          if(!row)fail(404,'analysis-not-found','Calculation not found for this visitor.');
          json(res,200,{id:row.id,status:row.status,record:row.status==='completed'?parseRecord(row):null,recordSha256:row.record_sha256,error:row.error_json?JSON.parse(row.error_json):null});return;
        }
        if(pathname==='/api/tasks'){
          if(method==='GET'){
            const rows=db.prepare('SELECT t.*,a.record_sha256,a.completed_at,a.parameters_json FROM tasks t JOIN analyses a ON a.id=t.analysis_id WHERE t.owner_hash=? ORDER BY t.created_at DESC LIMIT 200').all(owner);
            json(res,200,{tasks:rows.map(row=>({...taskMetadata(row),parameters:JSON.parse(row.parameters_json)}))});return;
          }
          if(method==='POST'){
            const input=await body(req),name=taskName(input.name),analysis=db.prepare("SELECT id FROM analyses WHERE id=? AND owner_hash=? AND status='completed'").get(String(input.analysisId||''),owner);
            if(!analysis)fail(404,'analysis-not-found','Save a completed calculation belonging to this visitor.');
            if(db.prepare('SELECT count(*) AS n FROM tasks WHERE owner_hash=?').get(owner).n>=200)fail(409,'task-limit','A visitor can keep at most 200 tasks.');
            const id=randomUUID(),date=now();db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?)').run(id,owner,analysis.id,name,date,date);
            json(res,201,taskResponse(ownedTask(id,owner)));return;
          }
        }
        const taskMatch=/^\/api\/tasks\/([a-f0-9-]{36})(?:\/(copy|share))?$/.exec(pathname);
        if(taskMatch){
          const row=ownedTask(taskMatch[1],owner),action=taskMatch[2];
          if(!action&&method==='GET'){json(res,200,taskResponse(row));return;}
          if(!action&&method==='PATCH'){const name=taskName((await body(req)).name);db.prepare('UPDATE tasks SET name=?,updated_at=? WHERE id=? AND owner_hash=?').run(name,now(),row.id,owner);json(res,200,taskResponse(ownedTask(row.id,owner)));return;}
          if(!action&&method==='DELETE'){db.prepare('DELETE FROM tasks WHERE id=? AND owner_hash=?').run(row.id,owner);json(res,200,{deleted:true,id:row.id});return;}
          if(action==='copy'&&method==='POST'){
            const input=await body(req),id=randomUUID(),date=now(),name=taskName(input.name||`${row.name.slice(0,110)} · copy`);
            if(db.prepare('SELECT count(*) AS n FROM tasks WHERE owner_hash=?').get(owner).n>=200)fail(409,'task-limit','A visitor can keep at most 200 tasks.');
            db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?)').run(id,owner,row.analysis_id,name,date,date);json(res,201,taskResponse(ownedTask(id,owner)));return;
          }
          if(action==='share'&&method==='POST'){
            const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO shares VALUES(?,?,?)').run(digest(token),row.id,now());
            const shareURL=new URL('navigator.html',origin);shareURL.searchParams.set('share',token);
            json(res,201,{token,url:shareURL.href,readOnly:true,taskId:row.id});return;
          }
        }
        const sharedMatch=/^\/api\/shared\/([a-f0-9]{64})$/.exec(pathname);
        if(sharedMatch&&method==='GET'){
          const row=db.prepare('SELECT t.*,a.record_json,a.record_sha256,a.completed_at FROM shares s JOIN tasks t ON t.id=s.task_id JOIN analyses a ON a.id=t.analysis_id WHERE s.token_hash=?').get(digest(sharedMatch[1]));
          if(!row)fail(404,'share-not-found','This read-only link is unavailable or its task was deleted / 此只读链接不可用，原任务可能已删除。');
          json(res,200,taskResponse(row,true));return;
        }
        if(pathname==='/api/data-jobs'&&method==='GET'){
          json(res,200,{jobs:db.prepare('SELECT metadata_json FROM data_jobs WHERE owner_hash=? ORDER BY updated_at DESC LIMIT 50').all(owner).map(row=>JSON.parse(row.metadata_json))});return;
        }
        if(pathname==='/api/data-jobs'&&method==='POST'){
          const input=await body(req);
          if(input.siteId&&!['ridge-1','ridge-4','ridge-6'].includes(input.siteId))fail(422,'uncovered-location','No validated terrain exists for this location.');
          if(input.lat!==undefined||input.lon!==undefined)fail(422,'uncovered-location','Arbitrary coordinates have no validated terrain model / 任意坐标没有经过验证的地形模型。');
          const range=validateDataRange(input),available=(await calculator.coverage()).campaigns.find(item=>Date.parse(item.start)<=Date.parse(range.start)&&Date.parse(item.stop)>=Date.parse(range.stop));
          if(available){
            const job={id:randomUUID(),...range,status:'succeeded',stage:'complete',createdAt:now(),updatedAt:now(),completedAt:now(),cached:true,completedRequests:0,totalRequests:0,datasetId:available.id,sourceDataTime:available.sourceDataTime,message:'Reused verified existing data; no upstream request was needed / 已复用校验通过的现有数据，无需重新下载。'};
            db.prepare('INSERT INTO data_jobs VALUES(?,?,?,?,?)').run(job.id,owner,job.status,JSON.stringify(job),now());json(res,202,{job});return;
          }
          if(db.prepare("SELECT count(*) AS n FROM data_jobs WHERE owner_hash=? AND status NOT IN ('completed','succeeded','failed')").get(owner).n>=3)fail(409,'job-limit','At most three data requests can be pending per visitor.');
          let job,pendingJob;
          try{job=await pipeline.enqueue(input,{beforePersist:async created=>{
            pendingJob=created;
            // Ownership is durable before the pipeline can persist or publish work.
            db.prepare('INSERT INTO data_jobs VALUES(?,?,?,?,?)').run(created.id,owner,created.status,JSON.stringify(created),now());
          }});}catch(error){
            if(pendingJob){pendingJob.status='failed';pendingJob.error={code:'queue-persistence-failed',message:error.message};db.prepare('UPDATE data_jobs SET status=?,metadata_json=?,updated_at=? WHERE id=?').run('failed',JSON.stringify(pendingJob),now(),pendingJob.id);}
            if(error.status)throw error;fail(422,'invalid-data-request',error.message);
          }
          db.prepare('INSERT INTO data_jobs VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET owner_hash=excluded.owner_hash,status=excluded.status,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at').run(job.id,owner,job.status,JSON.stringify(job),now());
          json(res,202,{job});return;
        }
        const jobMatch=/^\/api\/data-jobs\/([^/]{1,100})$/.exec(pathname);
        if(jobMatch&&method==='GET'){
          const row=db.prepare('SELECT metadata_json FROM data_jobs WHERE id=? AND owner_hash=?').get(jobMatch[1],owner);
          if(!row)fail(404,'job-not-found','Data request not found for this visitor.');
          json(res,200,{job:JSON.parse(row.metadata_json)});return;
        }
        fail(404,'not-found','API route not found.');
      }
      if(!['GET','HEAD'].includes(req.method))fail(405,'method-not-allowed','Method not allowed.');
      const target=path.resolve(staticRoot,`.${pathname==='/'?'/index.html':pathname}`),relative=path.relative(staticRoot,target);
      if(relative.startsWith('..')||path.isAbsolute(relative)||relative.split(path.sep).some(part=>part.startsWith('.')))fail(403,'forbidden','Forbidden');
      let bytes,info;
      try{info=await stat(target);if(!info.isFile())fail(404,'not-found','Not found');bytes=await readFile(target);}
      catch(error){
        if(error.code==='ENOENT'&&/^\/evidence-assets\/(?:build-)?[a-f0-9]{64}\.(?:json|js)$/.test(pathname)){bytes=Buffer.from(await calculator.asset(pathname.slice(1)));info={size:bytes.length};}
        else throw error;
      }
      const headers={'Content-Type':MIME[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':pathname.startsWith('/evidence-assets/')?'public, max-age=31536000, immutable':'no-cache','Accept-Ranges':'bytes','Content-Length':info.size};
      if(req.method==='GET'&&req.headers.range){
        const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);let start=0,end=info.size-1,valid=Boolean(match&&(match[1]||match[2]));
        if(valid){if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),end);}else{const count=Number(match[2]);valid=Number.isSafeInteger(count)&&count>0;start=Math.max(0,info.size-count);}valid=valid&&Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<=end&&start<info.size;}
        if(!valid){res.writeHead(416,{'Content-Range':`bytes */${info.size}`,'Content-Length':0}).end();return;}
        res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${info.size}`,'Content-Length':end-start+1}).end(bytes.subarray(start,end+1));return;
      }
      res.writeHead(200,headers).end(req.method==='HEAD'?undefined:bytes);
    }catch(error){if(!res.headersSent)json(res,error.status||(error.code==='ENOENT'?404:500),{error:{code:error.code||'service-error',message:error.status?error.message:error.code==='ENOENT'?'Not found':'The service could not complete this request / 服务未能完成此次请求，请重试。'}});else res.end();if(!error.status&&error.code!=='ENOENT')console.error('LunaMargin service error:',error.message);}
  };
  const server=http.createServer((req,res)=>{const pending=handleRequest(req,res);activeRequests.add(pending);pending.finally(()=>activeRequests.delete(pending));});
  server.requestTimeout=30000;server.headersTimeout=15000;
  await pipeline.resume();
  return{server,db,dataDir,calculator,pipeline,async listen(port=Number(process.env.PORT||4173),host=process.env.HOST||'127.0.0.1'){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});return server.address();},async close(){
    closing=true;const stopped=new Promise(resolve=>server.close(resolve));server.closeIdleConnections();
    await pipeline.close();
    // Socket shutdown and async handler completion are distinct. Keep SQLite open
    // until every already-running coverage/calculation request has finished.
    while(activeRequests.size)await Promise.allSettled([...activeRequests]);
    server.closeAllConnections();await stopped;db.close();
  }};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const service=await createService();const address=await service.listen();
  console.log(`LunaMargin full service: http://${address.address}:${address.port}`);
  console.log(`Persistent SQLite: ${path.join(service.dataDir,'lunamargin.sqlite')}`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await service.close();process.exit(0);});
}
