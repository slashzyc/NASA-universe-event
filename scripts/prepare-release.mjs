/** Content-addressed calculation releases. Existing snapshots are never replaced. */
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function immutable(file,bytes){
  const target=path.join(root,file);
  const previous=await readFile(target).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
  if(previous){if(!previous.equals(Buffer.from(bytes)))throw new Error(`Immutable release asset changed: ${file}`);return;}
  await writeFile(target,bytes);
}
export async function prepareRelease(){
  await mkdir(path.join(root,'evidence-assets'),{recursive:true});
  const sourceFiles=['index.html','navigator.html',...(await readdir(path.join(root,'src'))).filter(f=>/\.(js|css)$/.test(f)).map(f=>'src/'+f)].sort();
  const application={};
  for(const file of sourceFiles){
    // Git stores source text with LF; canonicalize platform line endings before archiving.
    const bytes=Buffer.from((await readFile(path.join(root,file),'utf8')).replaceAll('\r\n','\n'));
    const sha256=hash(bytes),snapshot=`evidence-assets/${sha256}${path.extname(file)}`;
    await immutable(snapshot,bytes);application[file]={sha256,snapshot};
  }
  const datasets={};
  for(const [campaign,file]of[['dec','lunar-sites.json'],['mar','lunar-sites-march.json'],['jun','lunar-sites-june.json']]){
    const bytes=await readFile(path.join(root,'data',file)),bundle=JSON.parse(bytes);
    const sha256=hash(bytes),snapshot=`evidence-assets/${sha256}.json`;
    await immutable(snapshot,bytes);
    datasets[campaign]={path:`data/${file}`,sha256,snapshot,observerHeightM:bundle.observerHeightM,
      generatedAt:bundle.generatedAt,start:bundle.start,stop:bundle.stop};
  }
  const identity={schemaVersion:1,methodVersion:'terrain-center-clearance-linear-v1',
    sourceRepository:'https://github.com/slashzyc/NASA-universe-event',
    sourceIdentity:'SHA-256 of canonical LF application sources, exact dataset bytes and model identity; not a Git commit.',
    application,algorithm:application['src/analysis.js'],datasets};
  const buildId=hash(JSON.stringify(identity)),manifest={schemaVersion:1,buildId,identity};
  const bytes=JSON.stringify(manifest,null,2)+'\n';
  await immutable(`evidence-assets/build-${buildId}.json`,Buffer.from(bytes));
  await writeFile(path.join(root,'build-info.json'),bytes);
  return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const release=await prepareRelease();console.log(`Prepared immutable calculation release ${release.buildId}.`);
}
