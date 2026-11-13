/* A real indexed WebGL sphere. The texture is aesthetic only; all decisions use
 * the separately verified LOLA/Horizons bundles. No terrain is inferred here. */
const D=Math.PI/180;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function vector(lat,lon){return [Math.cos(lat*D)*Math.sin(lon*D),Math.sin(lat*D),Math.cos(lat*D)*Math.cos(lon*D)];}
function rotate(v,yaw,pitch){const c=Math.cos(yaw),s=Math.sin(yaw),a=Math.cos(pitch),b=Math.sin(pitch);const x=c*v[0]+s*v[2],z=-s*v[0]+c*v[2];return [x,a*v[1]-b*z,b*v[1]+a*z];}
function inverse(v,yaw,pitch){const a=Math.cos(pitch),b=Math.sin(pitch),y=a*v[1]+b*v[2],z=-b*v[1]+a*v[2],c=Math.cos(yaw),s=Math.sin(yaw);return [c*v[0]-s*z,y,s*v[0]+c*z];}

export function createMoonExplorer(host,{language=()=> 'en',onSelect=()=>{}}={}){
  const $=s=>host.querySelector(s),tr=(en,zh)=>language()==='zh'?zh:en;
  let sites=[],selected=null,patchId='e+0-n+0',level='global',browsingUnsupported=false,yaw=-.3,pitch=-.37,zoom=1,auto=!matchMedia('(prefers-reduced-motion:reduce)').matches,active=false,gl=null,textureReady=false,last=0,visible=true,drawCount=0,slowFrames=0;
  const canvas=$('canvas'),marker=$('#moon-region-marker'),points=new Map();
  host.dataset.renderMode='loading';
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;});observer.observe(host);
  function message(en,zh){$('#moon-message').textContent=tr(en,zh);}
  function activate(){active=true;auto=false;host.dataset.active='true';labels();}
  function labels(){
    canvas.setAttribute('aria-label',tr('Interactive Moon. Drag to rotate. Click a surface to inspect coordinates. Arrow keys rotate; plus and minus zoom; Escape releases scroll.','可操作月球。拖动旋转，点击查看坐标。方向键旋转，加减号缩放，Escape 释放滚动。'));
    $('#moon-reset').textContent=tr('Reset','复位');$('#moon-south').textContent=tr('South pole','定位南极');
    $('#moon-pause').textContent=auto?tr('Pause rotation','暂停自转'):tr('Auto rotate','自动旋转');$('#moon-pause').setAttribute('aria-pressed',String(!auto));
    $('#moon-flat').textContent=host.dataset.renderMode==='2d'?tr('Try 3D','尝试三维'):tr('2D map','二维地图');
    $('#moon-map-title').textContent=level==='local'?tr('03 / NINE TERRAIN SAMPLES','03 / 局部九点取样'):level==='region'?tr('02 / CONNECTING RIDGE','02 / 月球南极 · 连接脊'):tr('01 / THE WHOLE MOON','01 / 全球月球');
    $('#moon-art-note').textContent=tr('Visual light only · not the mission Sun','美术光照 · 与任务日期计算光照分开');
    $('#moon-gesture').textContent=active?tr('Drag · scroll to zoom · Esc releases scroll','拖动旋转 · 滚轮缩放 · Esc 释放滚动'):tr('Drag to explore · click to activate zoom','拖动探索 · 点击后启用缩放');
    $('#moon-map-scale').textContent=tr('Nearby research locations · true relative scale','相邻研究点 · 真实相对比例');
    $('#moon-coverage').textContent=tr('Validated: Dec 2026 / Mar & Jun 2027 · 2 m · 5 m local terrain · 30 min ephemerides','已验证：2026 年 12 月 / 2027 年 3、6 月 · 2 米高度 · 局部 5 米地形 · 30 分钟星历');
    $('#moon-region-marker').setAttribute('aria-label',tr('Connecting Ridge: three supported research locations. Open the south-pole map.','连接脊：三个支持计算的研究位置。打开南极区域地图。'));
    $('#moon-region-marker').title=tr('Connecting Ridge · supported data','连接脊 · 有可计算数据');
    $('#moon-back-region').textContent=tr('← Regional map','← 区域地图');
    renderList();updateSelection();
  }
  function entryURL(){
    const p=new URLSearchParams({campaign:'jun',site:selected?.id||'ridge-6',patch:patchId,lang:language(),observerHeightM:'2',start:'2027-06-02T06:00:00Z',durationHours:'168',maxDarkHours:'24',maxCommGapHours:'24',minJointHours:'24',clearanceDeg:'0'});
    return `navigator.html?${p}`;
  }
  function updateSelection(){
    if(!selected)return;
    const point=selected.patches.find(p=>p.id===patchId)||selected;
    $('#moon-place-name').textContent=tr(`Connecting Ridge / ROI ${selected.sourceRoiNumber}`,`连接脊 / 研究点 ${selected.sourceRoiNumber}`);
    $('#moon-place-coordinates').textContent=`${Math.abs(point.lat).toFixed(6)}° S / ${point.lon.toFixed(6)}° E`;
    $('#moon-enter').href=entryURL();$('#moon-enter').textContent=tr('Enter analysis ↗','进入分析 ↗');
    $('#moon-local').textContent=tr('Inspect nine points →','查看局部九点 →');
    $('#moon-selected').hidden=browsingUnsupported;
    if(level==='local')renderLocal();
  }
  function selectSite(id){selected=sites.find(s=>s.id===id);if(!selected)return;browsingUnsupported=false;patchId='e+0-n+0';level='region';$('#moon-local-map').hidden=true;$('#moon-regional-map').hidden=false;activate();labels();renderRegion();onSelect({siteId:id,patchId,url:entryURL()});message('Data available at these three surveyed footprints. Select a location to continue.','这三个已取样区域具有可计算数据。选择研究点后进入分析。');}
  function renderList(){
    const list=$('#moon-region-list');list.replaceChildren();
    for(const site of sites){const b=document.createElement('button');b.type='button';b.dataset.region=site.id;b.setAttribute('aria-pressed',String(selected?.id===site.id));b.innerHTML=`<span>ROI ${site.sourceRoiNumber}</span><small>${Math.abs(site.lat).toFixed(4)}° S</small>`;b.onclick=()=>selectSite(site.id);list.append(b);}
  }
  function renderRegion(){
    const svg=$('#moon-regional-map');svg.replaceChildren();if(!sites.length)return;
    const ns='http://www.w3.org/2000/svg',el=(tag,attrs)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);svg.append(e);return e;};
    // Lunar south-polar plane, local east/north about ROI 6, metres. No spread/jitter.
    const origin=sites.find(s=>s.id==='ridge-6')||sites[0],R=1737400;
    const xy=sites.map(s=>({s,x:R*Math.cos(origin.lat*D)*(s.lon-origin.lon)*D,y:R*(s.lat-origin.lat)*D}));
    const ys=xy.map(p=>p.y),xs=xy.map(p=>p.x),span=Math.max(Math.max(...ys)-Math.min(...ys),Math.max(...xs)-Math.min(...xs),1),scale=180/span,cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
    el('path',{d:'M20 20V215H290',fill:'none',stroke:'#70847a','stroke-width':'.5'});
    el('text',{x:23,y:15,fill:'#8fa394','font-size':'9'}).textContent='N ↑';
    for(const {s,x,y}of xy){const px=150+(x-cx)*scale,py=115-(y-cy)*scale,g=el('g',{'data-map-region':s.id,role:'button',tabindex:'0','aria-label':`ROI ${s.sourceRoiNumber}`});const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',px);circle.setAttribute('cy',py);circle.setAttribute('r','7');circle.setAttribute('fill',selected?.id===s.id?'#efd5a2':'#6c9582');g.append(circle);const text=document.createElementNS(ns,'text');text.setAttribute('x',px+14);text.setAttribute('y',py+3);text.setAttribute('fill','#dfe6d8');text.setAttribute('font-size','11');text.textContent=`ROI ${s.sourceRoiNumber}`;g.append(text);g.onclick=()=>selectSite(s.id);g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectSite(s.id);}};}
    const length=500*scale;el('path',{d:`M30 237h${length}`,stroke:'#c2ad86','stroke-width':'2'});el('text',{x:30,y:253,fill:'#a6b7a9','font-size':'10'}).textContent='500 m';
  }
  function renderLocal(){
    const grid=$('#moon-local-grid');grid.replaceChildren();
    for(const p of [...selected.patches].sort((a,b)=>b.dyM-a.dyM||a.dxM-b.dxM)){const b=document.createElement('button');b.type='button';b.dataset.moonPatch=p.id;b.setAttribute('aria-pressed',String(p.id===patchId));b.setAttribute('aria-label',`${p.dxM} m E / ${p.dyM} m N`);b.textContent=p.dxM===0&&p.dyM===0?tr('Center','中心'):(p.dyM>0?'N':p.dyM<0?'S':'')+(p.dxM>0?'E':p.dxM<0?'W':'');b.onclick=()=>{patchId=p.id;updateSelection();onSelect({siteId:selected.id,patchId,url:entryURL()});};grid.append(b);}
  }
  function south(){activate();yaw=-222.75*D;pitch=-89.4*D;zoom=1.13;level='region';$('#moon-regional-map').hidden=false;$('#moon-local-map').hidden=true;labels();renderRegion();message('Connecting Ridge lies within one compact south-pole region. Open the 500 m map to distinguish its locations.','连接脊的研究点位于同一紧凑南极区域。下方 500 米比例地图可区分各位置。');}
  $('#moon-south').onclick=south;marker.onclick=south;
  $('#moon-reset').onclick=()=>{yaw=-.3;pitch=-.37;zoom=1;level='global';active=false;auto=false;host.dataset.active='false';labels();message('Globe reset. Drag or use the south-pole button.','已复位。拖动月球，或点击定位南极。');};
  $('#moon-pause').onclick=()=>{auto=!auto;labels();};
  $('#moon-local').onclick=()=>{level='local';$('#moon-regional-map').hidden=true;$('#moon-local-map').hidden=false;labels();};
  $('#moon-back-region').onclick=()=>{level='region';$('#moon-regional-map').hidden=false;$('#moon-local-map').hidden=true;labels();renderRegion();};
  function fallback(en='2D mode: browse the map and supported locations below.',zh='二维模式：通过地图和下方地点列表继续探索。'){host.dataset.renderMode='2d';canvas.hidden=true;marker.hidden=true;$('#moon-flat-image').hidden=false;auto=false;labels();message(en,zh);}
  $('#moon-flat').onclick=()=>{if(host.dataset.renderMode==='2d'){if(gl&&textureReady){host.dataset.renderMode='3d';canvas.hidden=false;$('#moon-flat-image').hidden=true;labels();}else{message('Retrying the 3D Moon…','正在重试三维月球…');try{initGL();}catch{fallback();}}}else fallback();};
  $('#moon-flat-image').onclick=e=>{const r=e.currentTarget.getBoundingClientRect(),lon=((e.clientX-r.left)/r.width*360+180)%360,lat=90-(e.clientY-r.top)/r.height*180;showCoordinate(lat,lon);};
  function showCoordinate(lat,lon){browsingUnsupported=true;level='global';labels();$('#moon-selected').hidden=true;message(`${Math.abs(lat).toFixed(3)}° ${lat<0?'S':'N'} · ${lon.toFixed(3)}° E — no calculable data at this arbitrary coordinate. Choose a surveyed location below.`,`${Math.abs(lat).toFixed(3)}°${lat<0?'南纬':'北纬'} · ${lon.toFixed(3)}°东经：此任意坐标暂无可计算数据。请从下方列表选择已取样位置。`);host.dataset.browseLatitude=String(lat);host.dataset.browseLongitude=String(lon);onSelect({siteId:null,patchId:null,url:null,unsupported:true});}
  let dragStart=null,pinchDistance=0;
  canvas.addEventListener('pointerdown',e=>{activate();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);points.set(e.pointerId,[e.clientX,e.clientY]);dragStart={x:e.clientX,y:e.clientY,moved:false};if(points.size===2){const a=[...points.values()];pinchDistance=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]);}});
  canvas.addEventListener('pointermove',e=>{if(!points.has(e.pointerId))return;const previous=points.get(e.pointerId);points.set(e.pointerId,[e.clientX,e.clientY]);if(Math.hypot(e.clientX-dragStart.x,e.clientY-dragStart.y)>5)dragStart.moved=true;if(points.size===2){const a=[...points.values()],d=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]);if(pinchDistance)zoom=clamp(zoom*d/pinchDistance,.72,2.4);pinchDistance=d;}else{yaw+=(e.clientX-previous[0])*.006;pitch=clamp(pitch+(e.clientY-previous[1])*.006,-Math.PI/2,Math.PI/2);}host.dataset.rotation=`${yaw.toFixed(3)},${pitch.toFixed(3)}`;host.dataset.zoom=zoom.toFixed(3);});
  canvas.addEventListener('pointerup',e=>{if(points.size===1&&!dragStart?.moved){const r=canvas.getBoundingClientRect(),aspect=r.width/r.height,k=.86*zoom,x=(2*(e.clientX-r.left)/r.width-1)*aspect/k,y=(1-2*(e.clientY-r.top)/r.height)/k;if(x*x+y*y<=1){const v=inverse([x,y,Math.sqrt(1-x*x-y*y)],yaw,pitch);showCoordinate(Math.asin(clamp(v[1],-1,1))/D,(Math.atan2(v[0],v[2])/D+360)%360);}}points.delete(e.pointerId);pinchDistance=0;});
  canvas.addEventListener('pointercancel',e=>points.delete(e.pointerId));
  canvas.addEventListener('wheel',e=>{if(!active)return;e.preventDefault();auto=false;zoom=clamp(zoom*Math.exp(-e.deltaY*.001),.72,2.4);host.dataset.zoom=zoom.toFixed(3);},{passive:false});
  canvas.addEventListener('keydown',e=>{if(e.key==='Escape'){active=false;host.dataset.active='false';canvas.blur();labels();return;}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(e.key)){e.preventDefault();activate();if(e.key==='ArrowLeft')yaw-=.1;if(e.key==='ArrowRight')yaw+=.1;if(e.key==='ArrowUp')pitch-=.1;if(e.key==='ArrowDown')pitch+=.1;if(e.key==='+'||e.key==='=')zoom=clamp(zoom*1.1,.72,2.4);if(e.key==='-')zoom=clamp(zoom/1.1,.72,2.4);}});
  canvas.addEventListener('blur',()=>{active=false;host.dataset.active='false';labels();});
  function initGL(){
    gl=canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:false});if(!gl)throw new Error('WebGL unavailable');
    const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('Shader compilation failed');return s;};
    const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,`attribute vec3 p;attribute vec2 uv;uniform vec2 angles;uniform float aspect;uniform float zoom;varying vec2 tex;varying vec3 normal;void main(){float c=cos(angles.x),s=sin(angles.x),a=cos(angles.y),b=sin(angles.y);vec3 q=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);normal=vec3(q.x,a*q.y-b*q.z,b*q.y+a*q.z);gl_Position=vec4(normal.x*.86*zoom/aspect,normal.y*.86*zoom,-normal.z*.4,1.);tex=uv;}`));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision mediump float;uniform sampler2D moon;varying vec2 tex;varying vec3 normal;void main(){vec3 n=normalize(normal);float light=max(dot(n,normalize(vec3(-.65,.4,1.))),0.);vec3 col=texture2D(moon,tex).rgb;float rim=pow(1.-max(n.z,0.),3.);gl_FragColor=vec4(col*(.19+light*1.12)+vec3(.12,.16,.16)*rim*.16,1.);}`));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Shader linking failed');gl.useProgram(program);
    const vertices=[],indices=[],rows=64,cols=128;
    for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){const lat=90-j/rows*180,lon=i/cols*360-180;vertices.push(...vector(lat,lon),i/cols,1-j/rows);}
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const k=j*(cols+1)+i;indices.push(k,k+cols+1,k+1,k+1,k+cols+1,k+cols+2);}
    gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);for(const[name,size,offset]of[['p',3,0],['uv',2,12]]){const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,20,offset);}gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);gl.enable(gl.DEPTH_TEST);
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const image=new Image();image.onload=()=>{try{gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);gl.generateMipmap(gl.TEXTURE_2D);textureReady=true;host.dataset.renderMode='3d';canvas.hidden=false;$('#moon-flat-image').hidden=true;labels();message('Explore the Moon. The amber marker opens the supported south-pole region.','开始探索月球。琥珀色标记指向支持计算的南极研究区。');}catch{fallback('Texture unavailable. The 2D map and location list remain usable.','纹理不可用，二维地图和地点列表仍可使用。');}};image.onerror=()=>fallback('Texture unavailable. Use the map and location list.','纹理加载失败。请使用地图和地点列表。');image.src='assets/imagery/moon-color-2025-2k.jpg';
    const angles=gl.getUniformLocation(program,'angles'),aspect=gl.getUniformLocation(program,'aspect'),z=gl.getUniformLocation(program,'zoom');
    function frame(now){requestAnimationFrame(frame);if(!visible||document.hidden||!host.isConnected||!textureReady||host.dataset.renderMode!=='3d'){last=now;return;}const elapsed=now-last;if(elapsed<30)return;last=now;if(auto)yaw+=Math.min(elapsed,100)*.000022;const r=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.5);const w=Math.round(r.width*ratio),h=Math.round(r.height*ratio);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform2f(angles,yaw,pitch);gl.uniform1f(aspect,w/h);gl.uniform1f(z,zoom);const start=performance.now();gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);drawCount++;if(performance.now()-start>35)slowFrames++;if(drawCount===120&&slowFrames>60)fallback('2D mode selected for this device. All research tools remain available.','已为此设备切换二维模式，研究功能继续可用。');const p=rotate(vector(-89.45,222.75),yaw,pitch);marker.hidden=p[2]<0;marker.style.left=`${(1+p[0]*.86*zoom/(w/h))*50}%`;marker.style.top=`${(1-p[1]*.86*zoom)*50}%`;host.dataset.frameCount=String(drawCount);}
    requestAnimationFrame(frame);canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback('3D context lost. Continue with the 2D map.','三维绘图暂时不可用，请通过二维地图继续。');});
  }
  try{initGL();}catch{fallback();}
  labels();
  return {setData(bundle){sites=bundle.sites;selected=sites.find(s=>s.id==='ridge-6')||sites[0];labels();renderRegion();},setLanguage:labels,selectSite,getSelection:()=>({siteId:selected?.id,patchId,url:entryURL()})};
}
