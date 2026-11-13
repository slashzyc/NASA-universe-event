import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {prepareRelease} from './prepare-release.mjs';
import { fileURLToPath } from 'node:url';
const checkout = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(checkout,process.env.LUNAMARGIN_SERVE_ROOT||'.');
if(root!==checkout&&root!==path.join(checkout,'dist'))throw new Error('Preview root must be this checkout or its dist directory.');
if(root===checkout)await prepareRelease();
const port = Number(process.env.PORT || 4173);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.webm':'video/webm','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(p => p.startsWith('.')) || !['GET','HEAD'].includes(req.method)) { res.writeHead(403).end('Forbidden'); return; }
    const info=await stat(target);
    if (!info.isFile()) { res.writeHead(404).end('Not found'); return; }
    const headers={'Content-Type':mime[path.extname(target)] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-cache','Accept-Ranges':'bytes','Content-Length':info.size};
    // Browser media seeks request individual byte ranges, including suffixes.
    // Keep local playback equivalent to the published static host.
    if(req.method==='GET'&&req.headers.range){
      const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      let start=0,end=info.size-1;
      let valid=Boolean(match&&(match[1]||match[2]));
      if(valid){
        if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),end);}
        else{const count=Number(match[2]);valid=Number.isSafeInteger(count)&&count>0;start=Math.max(0,info.size-count);}
        valid=valid&&Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<=end&&start<info.size;
      }
      if(!valid){res.writeHead(416,{'Content-Range':`bytes */${info.size}`,'Content-Length':0}).end();return;}
      const bytes=await readFile(target);
      res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${info.size}`,'Content-Length':end-start+1});
      res.end(bytes.subarray(start,end+1));return;
    }
    res.writeHead(200,headers);
    res.end(req.method === 'HEAD' ? undefined : await readFile(target));
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`LunaMargin running at http://127.0.0.1:${port}`));
