import {readFile,stat,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {verifyManifest} from '../src/provenance.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const required=['index.html','navigator.html','src/landing.css','src/landing.js','assets/imagery/moon-gibbous.jpg','src/app.js','src/navigator-ui.js','src/navigator.css','src/analysis.js','src/visuals.js','src/search-worker.js','src/selection.js','src/evidence.js','src/robustness-ui.js','src/style.css','docs/METHODOLOGY.md','docs/AI_DISCLOSURE.md','docs/validation-results.json','docs/demo-evidence.json','data/source-manifest.json','data/geometry-audit.json','data/fine-ephemeris-validation.json','data/robustness-validation.json','data/recommendation-fine-validation.json'];
for(const file of required){if(!(await stat(path.join(root,file))).isFile())throw new Error(`Missing ${file}`);}
const sha256=async file=>createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
const release=await verifyManifest(JSON.parse(await readFile(path.join(root,'build-info.json'),'utf8')));
for(const [file,asset]of Object.entries(release.identity.application)){
  const source=(await readFile(path.join(root,file),'utf8')).replaceAll('\r\n','\n');
  if(createHash('sha256').update(source).digest('hex')!==asset.sha256)throw new Error(`Build identity is stale for ${file}; build again.`);
}
for(const asset of Object.values(release.identity.datasets))if(await sha256(asset.path)!==asset.sha256)throw new Error(`Build dataset is stale for ${asset.path}.`);
for(const file of await readdir(path.join(root,'evidence-assets'))){
  if(file.startsWith('build-')){
    const archived=await verifyManifest(JSON.parse(await readFile(path.join(root,'evidence-assets',file),'utf8')),file.slice(6,-5));
    for(const asset of [...Object.values(archived.identity.application),...Object.values(archived.identity.datasets)]){
      if(await sha256(asset.snapshot)!==asset.sha256)throw new Error(`Archived snapshot changed: ${asset.snapshot}`);
    }
  }else if(await sha256('evidence-assets/'+file)!==file.split('.')[0])throw new Error(`Content-addressed bytes changed: ${file}`);
}
const demo=JSON.parse(await readFile(path.join(root,'docs/demo-evidence.json'),'utf8'));
for(const [file,expected] of [[demo.dataset,demo.datasetSha256],['src/analysis.js',demo.analysisSha256],
  [demo.finerCheck.source,demo.finerCheck.sha256],[demo.recommendationCheck.source,demo.recommendationCheck.sha256]]) {
  if(await sha256(file)!==expected)throw new Error(`Demo evidence is stale for ${file}; run node scripts/snapshot-demo.mjs.`);
}
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
