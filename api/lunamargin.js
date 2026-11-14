import {Readable} from 'node:stream';
import {makeGateway,originsFromEnv} from '../deploy/vercel/gateway.mjs';

/** Vercel Node adapter. The scientific computation remains on the existing Worker. */
export default async function handler(req,res){
  try{
    const host=req.headers.host;
    if(typeof host!=='string'||!host||/[\s\\/@?#]/.test(host)){res.statusCode=403;res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:{code:'untrusted-host',message:'Invalid request host.'}}));return;}
    const local=process.env.VERCEL_ENV==='development'||process.env.NODE_ENV==='test';
    const protocol=local&&/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host)?'http:':'https:';
    const url=new URL('/api/lunamargin',`${protocol}//${host}`);
    // Vercel merges captures and user query parameters into req.query. Arrays
    // remain repeated parameters so the core rejects ambiguous route injection.
    const query=req.query?Object.entries(req.query):new URL(req.url,`${protocol}//${host}`).searchParams;
    for(const[key,value]of query)for(const item of Array.isArray(value)?value:[value])if(item!==undefined)url.searchParams.append(key,String(item));
    const headers=new Headers();for(const key of ['origin','sec-fetch-site','cookie','content-type','content-length']){const value=req.headers[key];if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);}
    const method=req.method||'GET';let body;
    if(!['GET','HEAD'].includes(method))body=req.body!==undefined?(typeof req.body==='string'||Buffer.isBuffer(req.body)?req.body:JSON.stringify(req.body)):Readable.toWeb(req);
    const response=await makeGateway({allowedOrigins:originsFromEnv(process.env)})(new Request(url,{method,headers,body,...(body?{duplex:'half'}:{})}));
    res.statusCode=response.status;
    response.headers.forEach((value,key)=>{if(key!=='set-cookie')res.setHeader(key,value);});
    const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.statusCode=503;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.end(JSON.stringify({error:{code:'gateway-unconfigured',message:'The gateway is unavailable or its public origin is not configured / 网关暂不可用或未配置访问域名。'}}));}
}
