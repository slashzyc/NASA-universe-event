import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const required=['index.html','navigator.html','src/landing.css','src/landing.js','assets/imagery/moon-gibbous.jpg','src/app.js','src/analysis.js','src/visuals.js','src/search-worker.js','src/style.css','docs/METHODOLOGY.md','docs/AI_DISCLOSURE.md','docs/validation-results.json','data/source-manifest.json','data/geometry-audit.json','data/fine-ephemeris-validation.json'];
for(const file of required){if(!(await stat(path.join(root,file))).isFile())throw new Error(`Missing ${file}`);}
let samples=0;
for(const file of ['lunar-sites.json','lunar-sites-march.json','lunar-sites-june.json']){
  const data=JSON.parse(await readFile(path.join(root,'data',file),'utf8'));
  if(data.sites.length!==3)throw new Error(`${file}: expected three research sites`);
  for(const s of data.sites){
    if(s.horizon.length!==360||s.patches.length!==9)throw new Error(`${s.id}: invalid horizon or footprint`);
    if(s.terrain.elevations.length!==s.terrain.width*s.terrain.height)throw new Error(`${s.id}: invalid terrain dimensions`);
    if(!s.horizon.every(Number.isFinite)||!s.terrain.elevations.every(Number.isFinite))throw new Error(`${s.id}: nonfinite terrain`);
    if(s.samples[0].time!==data.start||s.samples.at(-1).time!==data.stop)throw new Error(`${s.id}: invalid epoch bounds`);
    for(let i=1;i<s.samples.length;i++)if(Date.parse(s.samples[i].time)-Date.parse(s.samples[i-1].time)!==data.sampleIntervalMinutes*60000)throw new Error(`${s.id}: missing or unordered ephemeris`);
    for(const [body,src] of Object.entries(s.ephemerisSources)){
      const content=await readFile(path.join(root,'data',src.path));
      if(createHash('sha256').update(content).digest('hex')!==src.sha256)throw new Error(`${file}/${s.id}/${body}: original response checksum mismatch`);
    }
    samples+=s.samples.length;
  }
}
console.log(`Publication checks passed: 3 campaigns, 9 site/month records, ${samples.toLocaleString()} paired Sun/Earth epochs, 18 original-response hashes.`);
