import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import handler from '../api/lunamargin.js';
import {makeGateway,originsFromEnv,BACKEND_ORIGIN,PINNED_RELEASE} from '../deploy/vercel/gateway.mjs';

const SITE='https://lunamargin.vercel.app',SESSION='a'.repeat(64),SHARE='b'.repeat(64);
const ID='11111111-2222-4333-8444-555555555555';
const sessionCookie=`lm_session=${SESSION}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;
const json=(value,status=200,headers={})=>new Response(typeof value==='string'?value:JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...headers}});
const request=(route,options={})=>{
  const {method='GET',headers={},body,query='',origin=SITE,host=SITE}=options;
  return new Request(`${host}/api/lunamargin?route=${encodeURIComponent(route)}${query}`,{method,headers:{...(origin===null?{}:{Origin:origin}),'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
};
function fixture(fetcher=async()=>json({ok:true}),options={}){const calls=[];return{calls,run:makeGateway({allowedOrigins:[SITE],...options,fetcher:async(...args)=>{calls.push(args);return fetcher(...args);}})};}
async function assertError(response,status,code){assert.equal(response.status,status);assert.equal((await response.json()).error.code,code);assert.match(response.headers.get('Cache-Control'),/no-store/);}

test('exact deployed NASA evidence bytes and handshake reach the fixed backend unchanged',async()=>{
  const recordBytes=`{ "record": {"shareURL":"${BACKEND_ORIGIN}/navigator.html?build=${PINNED_RELEASE}","recordSha256":"${'d'.repeat(64)}","provenance":{"buildId":"${PINNED_RELEASE}"}}, "readOnly":false }`;
  const payload=JSON.stringify({clientRelease:{apiVersion:2,buildId:PINNED_RELEASE},buildId:PINNED_RELEASE,algorithmSha256:'e'.repeat(64),datasetSha256:'f'.repeat(64),settings:{start:'2026-09-15T00:00:00Z'}});
  const f=fixture(async()=>json(recordBytes));
  const response=await f.run(request('analyses',{method:'POST',body:payload,headers:{Cookie:`__cf_bm=unrelated; lm_session=${SESSION}; vercel_session=unrelated`,Authorization:'Bearer must-not-leave',Host:'evil.invalid','X-Forwarded-Host':'evil.invalid'}}));
  assert.equal(response.status,200);const actual=await response.text();assert.equal(actual,recordBytes);
  assert.equal(createHash('sha256').update(actual).digest('hex'),createHash('sha256').update(recordBytes).digest('hex'));
  const [target,options]=f.calls[0];assert.equal(target.href,`${BACKEND_ORIGIN}/releases/${PINNED_RELEASE}/api/analyses`);
  assert.equal(new TextDecoder().decode(options.body),payload);assert.equal(options.redirect,'manual');
  assert.equal(options.headers.get('Origin'),BACKEND_ORIGIN);assert.equal(options.headers.get('Cookie'),`lm_session=${SESSION}`);
  for(const key of ['Authorization','Host','X-Forwarded-Host','Sec-Fetch-Site'])assert.equal(options.headers.get(key),null);
  for(const key of ['Cache-Control','CDN-Cache-Control','Vercel-CDN-Cache-Control'])assert.match(response.headers.get(key),/no-store/);
});

test('rejects foreign, null and absent mutation origins before rewriting any upstream header',async()=>{
  const f=fixture();
  for(const options of [{origin:'https://evil.invalid'},{origin:'null'},{origin:null},{headers:{'Sec-Fetch-Site':'cross-site'}}]){
    const response=await f.run(request('analyses',{method:'POST',body:{},...options}));assert.equal(response.status,403);
  }
  await assertError(await f.run(request('health',{host:'https://evil.invalid'})),403,'untrusted-host');
  assert.equal(f.calls.length,0);
  assert.equal((await f.run(request('health',{origin:null,headers:{'Sec-Fetch-Site':'none'}}))).status,200);
  assert.equal(f.calls.length,1);
});

test('allows only one explicit route and release; disallows open proxy targets and traversal',async()=>{
  const f=fixture();
  for(const query of ['&route=tasks','&target=https://evil.invalid','&host=evil.invalid','&release=x',`&release=${PINNED_RELEASE}&release=${PINNED_RELEASE}`])await assertError(await f.run(request('health',{query})),400,'invalid-proxy-route');
  for(const route of ['https://evil.invalid','../tasks','api/health','//evil.invalid','tasks?target=x','tasks/%2e%2e/health'])await assertError(await f.run(request(route)),404,'unknown-route');
  assert.equal(f.calls.length,0);
  await f.run(request('health',{query:`&release=${'1'.repeat(64)}`}));
  assert.equal(f.calls[0][0].href,`${BACKEND_ORIGIN}/releases/${PINNED_RELEASE}/api/health`);
});

test('all supported lifecycle routes pass through and read-only route rejects writes',async()=>{
  const f=fixture();
  for(const [route,methods] of [['health',['GET']],['coverage',['GET']],['service-config.json',['GET']],['analyses',['POST']],[`analyses/${ID}`,['GET']],['tasks',['GET','POST']],[`tasks/${ID}`,['GET','PATCH','DELETE']],[`tasks/${ID}/copy`,['POST']],[`shared/${SHARE}`,['GET']],['data-jobs',['GET','POST']],[`data-jobs/${ID}`,['GET']]]){
    for(const method of methods){const r=await f.run(request(route,{method,...(['POST','PATCH'].includes(method)?{body:{}}:{})}));assert.equal(r.status,200,`${method} ${route}`);}
  }
  assert.equal(f.calls.find(([u])=>u.pathname.endsWith('service-config.json'))[0].pathname,`/releases/${PINNED_RELEASE}/service-config.json`);
  const before=f.calls.length;
  await assertError(await f.run(request(`shared/${SHARE}`,{method:'PATCH',body:{name:'intrusion'}})),405,'method-not-allowed');
  assert.equal(f.calls.length,before);
});

test('forwards only valid unambiguous application sessions',async()=>{
  const f=fixture();
  await assertError(await f.run(request('health',{headers:{Cookie:`lm_session=${SESSION}; lm_session=${SHARE}`}})),400,'ambiguous-session');
  await assertError(await f.run(request('health',{headers:{Cookie:'lm_session=bad'}})),400,'invalid-session');
  assert.equal(f.calls.length,0);
  await f.run(request('health',{headers:{Cookie:'platform=private; analytics=other'}}));assert.equal(f.calls[0][1].headers.get('Cookie'),null);
});

test('reissues only the host-only secure anonymous cookie and rejects broadened session scope',async()=>{
  const headers=new Headers({'Content-Type':'application/json'});headers.append('Set-Cookie','platform=ignore; Domain=.chatgpt.site');headers.append('Set-Cookie',sessionCookie);
  const response=await fixture(async()=>new Response('{}',{headers})).run(request('health'));assert.deepEqual(response.headers.getSetCookie(),[sessionCookie]);
  for(const cookie of [sessionCookie+'; Domain=.vercel.app',sessionCookie.replace('; Secure',''),sessionCookie.replace('Path=/','Path=/api'),sessionCookie.replace('SameSite=Lax','SameSite=None')])await assertError(await fixture(async()=>json({},200,{'Set-Cookie':cookie})).run(request('health')),502,'backend-session-invalid');
  const duplicated=new Headers({'Content-Type':'application/json'});duplicated.append('Set-Cookie',sessionCookie);duplicated.append('Set-Cookie',sessionCookie);
  await assertError(await fixture(async()=>new Response('{}',{headers:duplicated})).run(request('health')),502,'backend-session-invalid');
});

test('read-only share rewrites only its outer URL to the exact accessing origin and pinned UI',async()=>{
  const original={token:SHARE,url:`${BACKEND_ORIGIN}/navigator.html?share=${SHARE}`,readOnly:true,taskId:ID};
  const response=await fixture(async()=>json(original)).run(request(`tasks/${ID}/share`,{method:'POST',body:{},headers:{'X-Forwarded-Host':'evil.invalid'}}));
  assert.deepEqual(await response.json(),{...original,url:`${SITE}/releases/${PINNED_RELEASE}/navigator.html?share=${SHARE}`});
  for(const bad of [{...original,url:`https://evil.invalid/navigator.html?share=${SHARE}`},{...original,record:{shareURL:original.url}},{...original,readOnly:false}])await assertError(await fixture(async()=>json(bad)).run(request(`tasks/${ID}/share`,{method:'POST',body:{}})),502,'backend-invalid-share');
});

test('retains true release B metadata and 409 mismatch instead of claiming pinned service compatibility',async()=>{
  const releaseB={apiVersion:2,buildId:'7'.repeat(64),algorithmSha256:'8'.repeat(64),datasets:[]};
  const configBytes=JSON.stringify({service:true,release:releaseB,capabilities:{newDates:false,serverSave:true}});
  assert.equal(await (await fixture(async()=>json(configBytes)).run(request('service-config.json'))).text(),configBytes);
  const mismatch='{"error":{"code":"client-release-mismatch","message":"Reload the current release."}}';
  const response=await fixture(async()=>json(mismatch,409)).run(request('analyses',{method:'POST',body:{clientRelease:{buildId:PINNED_RELEASE}}}));
  assert.equal(response.status,409);assert.equal(await response.text(),mismatch);
});

test('real service failure bytes survive; transport failures never become success',async()=>{
  const bytes='{"error":{"code":"database-unavailable","message":"Try again."}}';
  const response=await fixture(async()=>json(bytes,503)).run(request('coverage'));assert.equal(response.status,503);assert.equal(await response.text(),bytes);
  await assertError(await fixture(async()=>{throw new Error('private network details');}).run(request('coverage')),502,'backend-unreachable');
  await assertError(await fixture(async()=>new Response(null,{status:302,headers:{Location:'https://evil.invalid'}})).run(request('health')),502,'backend-redirect');
  await assertError(await fixture(async()=>new Response('<html>challenge</html>',{headers:{'Content-Type':'text/html'}})).run(request('health')),502,'backend-invalid-response');
});

test('timeout covers both initial response and stalled response body',async()=>{
  const pending=fixture(async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))),{timeoutMs:10});
  await assertError(await pending.run(request('health')),504,'backend-timeout');
  const stalled=fixture(async(_url,{signal})=>new Response(new ReadableStream({start(controller){signal.addEventListener('abort',()=>controller.error(new Error('aborted')));}}),{headers:{'Content-Type':'application/json'}}),{timeoutMs:10});
  await assertError(await stalled.run(request('health')),504,'backend-timeout');
});

test('bounded requests and responses reject oversized input; JSON body is required for mutations',async()=>{
  const f=fixture();
  await assertError(await f.run(request('analyses',{method:'POST',body:'x'.repeat(65537)})),413,'request-too-large');
  await assertError(await f.run(request('analyses',{method:'POST',body:'{}',headers:{'Content-Length':'65537'}})),413,'request-too-large');
  await assertError(await f.run(request('analyses',{method:'POST',body:'{}',headers:{'Content-Type':'text/plain'}})),415,'json-required');
  assert.equal(f.calls.length,0);
  await assertError(await fixture(async()=>json(' '.repeat(4*1024*1024+1))).run(request('tasks')),502,'backend-response-too-large');
});

test('explicit environment origins support production, deployment and branch domains without wildcard trust',()=>{
  assert.deepEqual(originsFromEnv({LUNAMARGIN_PUBLIC_ORIGIN:'https://moon.example',VERCEL_URL:'deployment.vercel.app',VERCEL_PROJECT_PRODUCTION_URL:'lunamargin.vercel.app',VERCEL_BRANCH_URL:'branch.vercel.app'}),['https://moon.example','https://deployment.vercel.app',SITE,'https://branch.vercel.app']);
  for(const origin of ['http://moon.example','https://moon.example/path','https://user:secret@moon.example','https://moon.example?x=1'])assert.throws(()=>originsFromEnv({LUNAMARGIN_PUBLIC_ORIGIN:origin}));
  assert.deepEqual(originsFromEnv({NODE_ENV:'test',LUNAMARGIN_PUBLIC_ORIGIN:'http://localhost:3000'}),['http://localhost:3000']);
});

test('Node adapter preserves duplicate routing parameters, payloads, status and session headers',async()=>{
  const envKeys=['NODE_ENV','LUNAMARGIN_PUBLIC_ORIGIN','PUBLIC_ORIGIN','VERCEL_URL','VERCEL_PROJECT_PRODUCTION_URL','VERCEL_BRANCH_URL','VERCEL_ENV'];
  const saved=Object.fromEntries(envKeys.map(key=>[key,process.env[key]])),savedFetch=globalThis.fetch;const calls=[];
  for(const key of envKeys)delete process.env[key];process.env.VERCEL_PROJECT_PRODUCTION_URL='lunamargin.vercel.app';
  const invoke=async({query,url='/api/lunamargin',method='GET',body,headers={}}={})=>{
    const req=Readable.from(body===undefined?[]:[Buffer.from(body)]);Object.assign(req,{url,method,headers:{host:'lunamargin.vercel.app',origin:SITE,'content-type':'application/json',...headers}});if(query!==undefined)req.query=query;
    const result={headers:{}};const res={statusCode:200,setHeader(key,value){result.headers[key.toLowerCase()]=value;},end(value){result.body=Buffer.from(value).toString('utf8');result.status=this.statusCode;}};
    await handler(req,res);return result;
  };
  try{
    globalThis.fetch=async(url,options)=>{calls.push([url,options]);return json(' {"ok":true} ',201,{'Set-Cookie':sessionCookie});};
    const actual=await invoke({query:{route:'analyses',release:PINNED_RELEASE},method:'POST',body:' {"exact":true} ',headers:{cookie:`lm_session=${SESSION}; platform=secret`}});
    assert.equal(actual.status,201);assert.equal(actual.body,' {"ok":true} ');assert.deepEqual(actual.headers['set-cookie'],[sessionCookie]);
    assert.equal(new TextDecoder().decode(calls[0][1].body),' {"exact":true} ');
    const count=calls.length;
    for(const args of [{query:{route:['health','tasks']}},{url:'/api/lunamargin?route=health&route=tasks'},{query:{route:'health'},headers:{host:'evil.invalid','x-forwarded-host':'lunamargin.vercel.app'}},{query:{route:'health'},headers:{origin:'https://evil.invalid'}}]){
      assert.ok([400,403].includes((await invoke(args)).status));
    }
    assert.equal(calls.length,count);
    const fallback=await invoke({url:'/api/lunamargin?route=health'});assert.equal(fallback.status,201);assert.equal(calls.length,count+1);
  }finally{globalThis.fetch=savedFetch;for(const key of envKeys)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
});
