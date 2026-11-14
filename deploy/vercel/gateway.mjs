/** Transport only. NASA inputs, formal records and release handshakes stay unchanged. */
export const BACKEND_ORIGIN='https://lunamargin-slashzyc.laceysquirrel4.chatgpt.site';
export const PINNED_RELEASE='c96336e14ea125b988b4f0038d6436d336792501c98cf189cda865ecad3dad88';
const REQUEST_LIMIT=65536,RESPONSE_LIMIT=4*1024*1024;
const encoder=new TextEncoder();
const UUID='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const routes=[
  [/^(?:health|coverage|service-config\.json)$/,['GET']],
  [/^analyses$/,['POST']],
  [new RegExp(`^analyses/${UUID}$`),['GET']],
  [/^tasks$/,['GET','POST']],
  [new RegExp(`^tasks/${UUID}$`),['GET','PATCH','DELETE']],
  [new RegExp(`^tasks/${UUID}/(?:copy|share)$`),['POST']],
  [/^shared\/[a-f0-9]{64}$/,['GET']],
  [new RegExp(`^data-jobs(?:/${UUID})?$`),['GET','POST']],
];
class GatewayError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const fail=(status,code,message)=>{throw new GatewayError(status,code,message);};
function responseHeaders(){return new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});}
function errorResponse(error){return new Response(JSON.stringify({error:{code:error.code||'gateway-unavailable',message:error.message}}),{status:error.status||502,headers:responseHeaders()});}
function normalizeOrigin(value,{allowLocal=false}={}){
  let url;try{url=new URL(value);}catch{throw new Error('Invalid configured public origin.');}
  const local=allowLocal&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||url.protocol!=='https:'&&!local)throw new Error('Configured origins must be exact HTTPS origins.');
  return url.origin;
}
export function originsFromEnv(env={}){
  const values=[env.LUNAMARGIN_PUBLIC_ORIGIN||env.PUBLIC_ORIGIN,...['VERCEL_URL','VERCEL_PROJECT_PRODUCTION_URL','VERCEL_BRANCH_URL'].map(key=>env[key]&&'https://'+env[key])].filter(Boolean);
  return [...new Set(values.map(value=>normalizeOrigin(value,{allowLocal:env.VERCEL_ENV==='development'||env.NODE_ENV==='test'})))];
}
async function boundedBytes(stream,limit,code){
  if(!stream)return new Uint8Array();const reader=stream.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();fail(code==='request-too-large'?413:502,code,code==='request-too-large'?'Request exceeds the supported 64 KB / 请求超过支持的 64 KB。':'The backend response exceeds this gateway limit / 后端响应超过此网关的大小限制。');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
function applicationCookie(value){
  const matches=(value||'').split(';').map(part=>part.trim()).filter(part=>part.startsWith('lm_session='));
  if(matches.length>1)fail(400,'ambiguous-session','Multiple application sessions were supplied / 请求包含多个应用身份。');
  if(!matches.length)return null;if(!/^lm_session=[a-f0-9]{64}$/.test(matches[0]))fail(400,'invalid-session','Invalid application session / 应用身份格式无效。');return matches[0];
}
function copySessionCookies(upstream,headers){
  const cookies=typeof upstream.headers.getSetCookie==='function'?upstream.headers.getSetCookie():[];
  let sessionCount=0;
  for(const value of cookies){
    if(!/^lm_session=/i.test(value))continue;
    const [pair,...attributes]=value.split(';').map(x=>x.trim()),flags=new Set(attributes.map(x=>x.toLowerCase()));
    if(++sessionCount>1||!/^lm_session=[a-f0-9]{64}$/.test(pair)||attributes.some(x=>/^domain\s*=/i.test(x))||!flags.has('path=/')||!flags.has('secure')||!flags.has('httponly')||!flags.has('samesite=lax'))fail(502,'backend-session-invalid','The backend session attributes are invalid / 后端身份属性校验失败。');
    headers.append('Set-Cookie',value);
  }
}
/** fetcher injection is for contract tests; upstream origin is never configurable by requests. */
export function makeGateway({fetcher=fetch,allowedOrigins=[],timeoutMs=30000}={}){
  const permitted=new Set(allowedOrigins.map(origin=>normalizeOrigin(origin,{allowLocal:true})));
  return async function gateway(request){
    let timer;
    try{
      if(!permitted.size)fail(503,'gateway-origin-unconfigured','This deployment has no configured public origin / 此部署尚未配置访问域名。');
      const incoming=new URL(request.url);
      if(!permitted.has(incoming.origin))fail(403,'untrusted-host','This host is not enabled for this deployment / 此域名未获此部署授权。');
      const origin=request.headers.get('Origin'),fetchSite=request.headers.get('Sec-Fetch-Site');
      if(origin!==null&&origin!==incoming.origin||fetchSite==='cross-site')fail(403,'cross-origin','Cross-origin requests are not permitted / 不允许跨站请求。');
      if(!['GET','HEAD','OPTIONS'].includes(request.method)&&origin!==incoming.origin)fail(403,'origin-required','A same-origin request is required / 此操作需要同站请求。');
      const params=incoming.searchParams;
      if([...params.keys()].some(key=>!['route','release'].includes(key))||params.getAll('route').length!==1||params.getAll('release').length>1)fail(400,'invalid-proxy-route','Use one supported route without extra routing parameters / 请使用唯一受支持的接口路径。');
      const route=params.get('route'),release=params.get('release');
      if(!route||route.length>160||release!==null&&!/^[a-f0-9]{64}$/.test(release))fail(400,'invalid-proxy-route','Invalid route or release / 接口路径或版本格式无效。');
      const rule=routes.find(([pattern])=>pattern.test(route));
      if(!rule)fail(404,'unknown-route','This gateway does not provide that route / 此网关不提供该接口。');
      if(!rule[1].includes(request.method))fail(405,'method-not-allowed','Method not allowed for this route / 此接口不支持该操作。');
      const length=request.headers.get('Content-Length');
      if(length!==null&&(!/^\d+$/.test(length)||Number(length)>REQUEST_LIMIT))fail(413,'request-too-large','Request exceeds the supported 64 KB / 请求超过支持的 64 KB。');
      if(['POST','PATCH'].includes(request.method)&&!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))fail(415,'json-required','Send application/json / 请使用 JSON 请求。');
      const payload=await boundedBytes(request.body,REQUEST_LIMIT,'request-too-large');
      const upstreamHeaders=new Headers({Accept:'application/json'}),cookie=applicationCookie(request.headers.get('Cookie'));
      if(cookie)upstreamHeaders.set('Cookie',cookie);
      if(request.headers.has('Content-Type'))upstreamHeaders.set('Content-Type',request.headers.get('Content-Type'));
      // Check the browser's actual origin above before replacing it for the
      // fixed backend. No Authorization, host, forwarding or platform cookies leave here.
      if(origin!==null||request.method!=='GET')upstreamHeaders.set('Origin',BACKEND_ORIGIN);
      const upstreamPath=route==='service-config.json'?route:'api/'+route;
      const target=new URL(`/releases/${PINNED_RELEASE}/${upstreamPath}`,BACKEND_ORIGIN);
      const controller=new AbortController();timer=setTimeout(()=>controller.abort(),timeoutMs);
      let upstream;
      try{upstream=await fetcher(target,{method:request.method,headers:upstreamHeaders,body:payload.length?payload:undefined,redirect:'manual',signal:controller.signal});}
      catch(error){if(controller.signal.aborted)fail(504,'backend-timeout','The data service timed out. Your draft remains available / 数据服务超时，草稿仍会保留。');fail(502,'backend-unreachable','The data service could not be reached. Retry or keep a device file / 数据服务暂时无法连接，可重试或保存设备文件。');}
      if(upstream.status>=300&&upstream.status<400)fail(502,'backend-redirect','The data service returned an unexpected redirect / 数据服务返回了意外重定向。');
      if(!/^application\/json(?:;|$)/i.test(upstream.headers.get('Content-Type')||''))fail(502,'backend-invalid-response','The data service returned an invalid response / 数据服务响应格式无效。');
      let bytes;
      try{bytes=await boundedBytes(upstream.body,RESPONSE_LIMIT,'backend-response-too-large');}
      catch(error){if(controller.signal.aborted)fail(504,'backend-timeout','The data service timed out. Your draft remains available / 数据服务超时，草稿仍会保留。');throw error;}
      const headers=responseHeaders();copySessionCookies(upstream,headers);
      if(upstream.ok&&request.method==='POST'&&new RegExp(`^tasks/${UUID}/share$`).test(route)){
        let value;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{fail(502,'backend-invalid-share','Invalid read-only share response / 只读分享响应格式无效。');}
        if(!/^[a-f0-9]{64}$/.test(value.token||'')||value.readOnly!==true||Object.hasOwn(value,'record'))fail(502,'backend-invalid-share','Invalid read-only share response / 只读分享响应格式无效。');
        let original;try{original=new URL(value.url);}catch{fail(502,'backend-invalid-share','Invalid read-only share URL / 只读分享地址无效。');}
        if(original.origin!==BACKEND_ORIGIN||original.pathname!=='/navigator.html'||original.searchParams.get('share')!==value.token)fail(502,'backend-invalid-share','The share URL does not identify this backend / 分享地址不属于此数据服务。');
        const link=new URL(`/releases/${PINNED_RELEASE}/navigator.html`,incoming.origin);link.searchParams.set('share',value.token);value.url=link.href;bytes=encoder.encode(JSON.stringify(value));
      }
      return new Response(bytes,{status:upstream.status,headers});
    }catch(error){return errorResponse(error instanceof GatewayError?error:new GatewayError(502,'gateway-unavailable','The gateway could not complete this request / 网关暂未完成请求。'));}
    finally{if(timer)clearTimeout(timer);}
  };
}
