// AI-assisted visualization of supplied NASA data. No synthetic scientific values.
import { interpolateHorizon } from './analysis.js';
const TAU = Math.PI * 2;
function setup(canvas) {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(r.width*dpr); canvas.height = Math.round(r.height*dpr);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr,dpr);
  return {ctx,w:r.width,h:r.height};
}
function line(ctx, x1,y1,x2,y2,color,width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
export function drawTerrain(canvas, site, result, activePatch) {
  const {ctx,w,h}=setup(canvas),t=site.terrain;
  ctx.fillStyle='#15232c';ctx.fillRect(0,0,w,h);
  if(!t?.elevations?.length)return [];
  const grid=document.createElement('canvas');grid.width=t.width;grid.height=t.height;
  const gc=grid.getContext('2d'), img=gc.createImageData(t.width,t.height),z=t.elevations;
  const values=z.filter(Number.isFinite),min=Math.min(...values),max=Math.max(...values),range=Math.max(1,max-min);
  const at=(x,y)=>z[Math.max(0,Math.min(t.height-1,y))*t.width+Math.max(0,Math.min(t.width-1,x))];
  for(let y=0;y<t.height;y++)for(let x=0;x<t.width;x++){
    const i=y*t.width+x,v=z[i]; if(!Number.isFinite(v))continue;
    const dx=(at(x+1,y)-at(x-1,y))/(2*t.cellSizeM),dy=(at(x,y+1)-at(x,y-1))/(2*t.cellSizeM);
    // Fixed map illumination is cartographic shading, not modeled solar light.
    const norm=Math.sqrt(dx*dx+dy*dy+1),shade=Math.max(0,(-dx*.45+dy*.55+.7)/norm),height=(v-min)/range;
    const brightness=.25+.7*shade,offset=i*4;
    img.data[offset]=(55+height*95)*brightness;img.data[offset+1]=(75+height*92)*brightness;img.data[offset+2]=(83+height*93)*brightness;img.data[offset+3]=255;
  }
  gc.putImageData(img,0,0);
  const scale=Math.max(w/t.width,h/t.height)*1.08,gw=t.width*scale,gh=t.height*scale,ox=(w-gw)/2,oy=(h-gh)/2;
  ctx.imageSmoothingEnabled=true;ctx.drawImage(grid,ox,oy,gw,gh);
  ctx.globalAlpha=.18;
  for(let y=1;y<t.height;y++)for(let x=1;x<t.width;x++){
    const a=at(x,y), b=at(x-1,y), c=at(x,y-1);
    if([a,b,c].every(Number.isFinite) && (Math.floor(a/100)!==Math.floor(b/100)||Math.floor(a/100)!==Math.floor(c/100))){ctx.fillStyle='#abc3c5';ctx.fillRect(ox+x*scale,oy+y*scale,scale*.7,1);}
  }ctx.globalAlpha=1;
  const fade=ctx.createLinearGradient(0,0,w,h);fade.addColorStop(0,'#13263120');fade.addColorStop(1,'#06131c55');ctx.fillStyle=fade;ctx.fillRect(0,0,w,h);
  // A labeled magnifying lens keeps 25 m sampling visible on a 6.4 km overview.
  const cx=w*.40,cy=h*.49,lensSize=w<500?118:148,lx=w-lensSize-24,ly=61;
  const mx=w/2,my=h/2;
  ctx.strokeStyle='#e7b965bb';ctx.setLineDash([4,4]);ctx.strokeRect(mx-8,my-8,16,16);line(ctx,mx+9,my,lx,ly+lensSize/2,'#d4b47670');ctx.setLineDash([]);
  ctx.fillStyle='#0e1b23ec';ctx.strokeStyle='#63808a90';ctx.lineWidth=1;ctx.fillRect(lx,ly,lensSize,lensSize);ctx.strokeRect(lx,ly,lensSize,lensSize);
  ctx.font='8px "Segoe UI",sans-serif';ctx.fillStyle='#adc0c7';ctx.fillText('FOOTPRINT LENS / 50 × 50 m',lx+10,ly+15);
  const inner=lensSize-44,centerX=lx+lensSize/2,centerY=ly+lensSize/2+7;
  for(let j=-1;j<=1;j++){line(ctx,centerX-inner/2,centerY+j*inner/2,centerX+inner/2,centerY+j*inner/2,'#324b58',.7);line(ctx,centerX+j*inner/2,centerY-inner/2,centerX+j*inner/2,centerY+inner/2,'#324b58',.7);}
  const hits=[];
  for(const patch of site.patches||[]){
    const p=result.patchStats.scenarios.find(s=>s.id===patch.id),px=centerX+patch.dxM/50*inner,py=centerY-patch.dyM/50*inner,selected=activePatch===patch.id;
    ctx.beginPath();ctx.arc(px,py,selected?7:5,0,TAU);ctx.fillStyle=p?.feasible?'#efc375':'#8498a3';ctx.fill();
    if(selected){ctx.beginPath();ctx.arc(px,py,10,0,TAU);ctx.strokeStyle='#f5e8d0';ctx.stroke();}
    if(patch.dxM===0&&patch.dyM===0){line(ctx,px-3,py,px+3,py,'#182731',1);line(ctx,px,py-3,px,py+3,'#182731',1);}
    hits.push({id:patch.id,x:px,y:py});
  }
  ctx.fillStyle='#e4e8e0';ctx.font='11px "Segoe UI",sans-serif';ctx.fillText(`ROI ${site.sourceRoiNumber}`,Math.max(20,mx-70),my-15);
  ctx.font='9px Consolas,monospace';ctx.fillStyle='#afc2ca';ctx.fillText(`${site.elevationM.toFixed(0)} m`,Math.max(20,mx-70),my);
  const scaleBar=Math.min(100,w*.2),physical=scaleBar/(scale)*t.cellSizeM;
  line(ctx,20,h-100,20+scaleBar,h-100,'#c9d4d5');line(ctx,20,h-104,20,h-96,'#c9d4d5');line(ctx,20+scaleBar,h-104,20+scaleBar,h-96,'#c9d4d5');
  ctx.font='8px Consolas,monospace';ctx.fillStyle='#adc0c7';ctx.fillText(`${(physical/1000).toFixed(1)} km · cartographic shading`,20,h-110);
  return hits;
}
export function drawHorizon(canvas, horizon, sample, clearance=0) {
  const {ctx,w,h}=setup(canvas),left=36,right=18,top=21,bottom=30,pw=w-left-right,ph=h-top-bottom;
  const min=Math.floor(Math.min(-3,...horizon,sample?.sunEl??0,sample?.earthEl??0))-1;
  const max=Math.ceil(Math.max(4,...horizon,sample?.sunEl??0,sample?.earthEl??0))+1;
  const x=az=>left+az/360*pw,y=el=>top+(max-el)/(max-min)*ph;
  const gradient=ctx.createLinearGradient(0,top,0,top+ph);gradient.addColorStop(0,'#12232e');gradient.addColorStop(1,'#1a2d38');ctx.fillStyle=gradient;ctx.fillRect(left,top,pw,ph);
  ctx.font='9px Consolas,monospace';ctx.textAlign='right';
  for(let el=Math.ceil(min/2)*2;el<=max;el+=2){line(ctx,left,y(el),w-right,y(el),'#2a3d48',.6);ctx.fillStyle='#7f97a3';ctx.fillText(`${el}°`,left-8,y(el)+3);}
  ctx.textAlign='center';
  for(let az=0;az<=360;az+=45){line(ctx,x(az),top,x(az),top+ph,'#2a3d48',.6);ctx.fillStyle='#8199a5';ctx.fillText(az%90===0?`${['N','E','S','W','N'][az/90]} ${az}°`:`${az}°`,x(az),h-10);}
  line(ctx,left,y(0),w-right,y(0),'#9ab5c160',1);
  ctx.beginPath();ctx.moveTo(x(0),top+ph);for(let az=0;az<=360;az++)ctx.lineTo(x(az),y(horizon[az%360]));ctx.lineTo(x(360),top+ph);ctx.closePath();ctx.fillStyle='#344954';ctx.fill();
  ctx.beginPath();for(let az=0;az<=360;az++){if(!az)ctx.moveTo(x(az),y(horizon[0]));else ctx.lineTo(x(az),y(horizon[az%360]));}ctx.strokeStyle='#8b9d9f';ctx.lineWidth=1.2;ctx.stroke();
  if(clearance){ctx.beginPath();ctx.setLineDash([3,4]);for(let az=0;az<=360;az++){if(!az)ctx.moveTo(x(az),y(horizon[0]+clearance));else ctx.lineTo(x(az),y(horizon[az%360]+clearance));}ctx.strokeStyle='#e7b9656b';ctx.stroke();ctx.setLineDash([]);}
  if(sample)for(const body of [{key:'sun',name:'SUN',color:'#f0c574',radius:6},{key:'earth',name:'EARTH',color:'#94d2e0',radius:5}]){
    const az=sample[body.key+'Az'],el=sample[body.key+'El'],px=x(az),py=y(el),visible=el>interpolateHorizon(horizon,az)+clearance;
    ctx.save();ctx.shadowColor=body.color;ctx.shadowBlur=visible?18:0;ctx.beginPath();ctx.arc(px,py,body.radius,0,TAU);ctx.fillStyle=body.color;ctx.globalAlpha=visible?1:.55;ctx.fill();ctx.restore();
    if(body.key==='sun')for(let i=0;i<8;i++){const a=i*TAU/8;line(ctx,px+Math.cos(a)*9,py+Math.sin(a)*9,px+Math.cos(a)*12,py+Math.sin(a)*12,body.color,.7);}
    ctx.font='8px "Segoe UI",sans-serif';ctx.textAlign=px>w-100?'right':px<80?'left':'center';ctx.fillStyle=body.color;ctx.fillText(`${body.name} ${el.toFixed(2)}°`,px,py<45?py+24:py-18);
  }
}
