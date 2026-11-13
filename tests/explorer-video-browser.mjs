/** Verify exact published recording bytes: finite metadata, seeking and playback. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const file=new URL('../docs/media/lunamargin-explorer-flow.webm',import.meta.url),bytes=await readFile(file);
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-proxy-server']});
try{
 const page=await browser.newPage();
 await page.setContent('<body style="margin:0;background:#080b0d"><video id="video" controls muted preload="auto" style="width:100%"></video></body>');
 const metadata=await page.evaluate(async base64=>{
   const player=document.querySelector('video'),raw=atob(base64),data=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)data[i]=raw.charCodeAt(i);
   player.src=URL.createObjectURL(new Blob([data],{type:'video/webm'}));
   await new Promise((resolve,reject)=>{player.onloadedmetadata=resolve;player.onerror=()=>reject(new Error('Recording cannot be decoded'));});
   return {duration:player.duration,finite:Number.isFinite(player.duration),width:player.videoWidth,height:player.videoHeight};
 },bytes.toString('base64'));
 assert.equal(metadata.finite,true,'Duration must be finite before playback or seeking');assert.ok(metadata.duration>10);assert.equal(metadata.width,1440);assert.equal(metadata.height,1000);
 const seekChecks=await page.evaluate(async()=>{
  const player=document.querySelector('video'),canvas=document.createElement('canvas');canvas.width=144;canvas.height=100;const ctx=canvas.getContext('2d'),checks=[];
  for(const target of [1,player.duration*.25,player.duration*.65,player.duration-1]){
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Seek timeout')),10000);player.addEventListener('seeked',()=>{clearTimeout(timer);resolve();},{once:true});player.currentTime=target;});
   ctx.drawImage(player,0,0,144,100);const data=ctx.getImageData(0,0,144,100).data;let low=255,high=0,sum=0;for(let i=0;i<data.length;i+=4){const value=data[i];low=Math.min(low,value);high=Math.max(high,value);sum+=value;}
   checks.push({target,actual:player.currentTime,pixelRange:high-low,pixelSum:sum,seekableEnd:player.seekable.end(player.seekable.length-1)});
  }return checks;
 });
 for(const check of seekChecks){assert.ok(Math.abs(check.actual-check.target)<.15);assert.ok(check.pixelRange>80,'Decoded frame must not be blank');assert.ok(check.seekableEnd>=metadata.duration-.1);}
 assert.ok(new Set(seekChecks.map(c=>c.pixelSum)).size>=3,'Recording must contain changing real frames');
 const playback=await page.evaluate(async()=>{
  const player=document.querySelector('video');player.currentTime=0;player.playbackRate=3;const start=performance.now();
  const result=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Playback did not finish')),90000);player.onended=()=>{clearTimeout(timer);resolve({ended:player.ended,lastTime:player.currentTime,wallSeconds:(performance.now()-start)/1000,playbackRate:player.playbackRate,decodedFrames:player.getVideoPlaybackQuality().totalVideoFrames,droppedFrames:player.getVideoPlaybackQuality().droppedVideoFrames});};player.onerror=()=>reject(new Error('Playback error'));});await player.play();return await result;
 });
 assert.equal(playback.ended,true);assert.ok(playback.decodedFrames>50);
 const report={verifiedAt:new Date().toISOString(),file:'docs/media/lunamargin-explorer-flow.webm',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),transport:'Exact file bytes as browser Blob, independent of server Range handling',metadata,seekChecks,playback,status:'PASS'};
 await writeFile(new URL('../docs/explorer-video-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
