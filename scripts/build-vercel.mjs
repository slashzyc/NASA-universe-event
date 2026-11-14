/** Repackage a verified release for Vercel without creating a new calculation release. */
import {readFile,writeFile,readdir,mkdir,lstat,realpath,rm,link,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const VERCEL_RELEASE='c96336e14ea125b988b4f0038d6436d336792501c98cf189cda865ecad3dad88';
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const snapshotName=/^[a-f0-9]{64}\.[a-z0-9]+$/,manifestName=/^build-([a-f0-9]{64})\.json$/;
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function parseManifest(bytes,expected){let release;try{release=JSON.parse(bytes);}catch{throw new Error('Invalid release JSON.');}if(release.schemaVersion!==1||!digest(release.buildId)||release.buildId!==hash(JSON.stringify(release.identity))||expected&&release.buildId!==expected)throw new Error('Release manifest checksum/identity mismatch.');if(!release.identity.application||!release.identity.datasets||!release.identity.algorithm)throw new Error('Incomplete release manifest.');return release;}
function safeAlias(relative){if(typeof relative!=='string'||!relative||relative.startsWith('/')||relative.includes('\\')||relative.split('/').some(p=>!p||p==='.'||p==='..')||/^[a-z]+:/i.test(relative)||/^(?:api|releases|evidence-assets)(?:\/|$)/.test(relative)||['service-config.json','build-info.json'].includes(relative))throw new Error('Unsafe or reserved release path: '+relative);return relative;}
export async function buildVercel({sourceRoot=projectRoot,expectedBuildId=VERCEL_RELEASE}={}){
 const root=await realpath(sourceRoot),output=path.resolve(root,'vercel-dist');
 if(path.dirname(output)!==root||path.basename(output)!=='vercel-dist')throw new Error('Unsafe output directory.');
 const previous=await lstat(output).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(previous?.isSymbolicLink()||previous&&!previous.isDirectory())throw new Error('vercel-dist must be a normal directory.');
 const release=parseManifest(await readFile(path.join(root,'build-info.json')),expectedBuildId),assets=new Map(),releases=[];
 const archive=path.join(root,'evidence-assets');const archiveStat=await lstat(archive);if(!archiveStat.isDirectory()||archiveStat.isSymbolicLink())throw new Error('The evidence archive must be a normal directory.');
 for(const name of (await readdir(archive)).sort()){
  const target=path.join(archive,name),type=await lstat(target);if(!type.isFile()||type.isSymbolicLink())throw new Error('Evidence archive contains a non-regular file.');
  const bytes=await readFile(target),match=manifestName.exec(name);
  if(match)releases.push(parseManifest(bytes,match[1]));else if(!snapshotName.test(name)||hash(bytes)!==name.split('.')[0])throw new Error('Immutable snapshot checksum/name mismatch: '+name);
  assets.set('evidence-assets/'+name,bytes);
 }
 function verified(descriptor){if(!descriptor||!digest(descriptor.sha256)||typeof descriptor.snapshot!=='string'||!new RegExp('^evidence-assets/'+descriptor.sha256+'\\.[a-z0-9]+$').test(descriptor.snapshot))throw new Error('Invalid content-addressed descriptor.');const bytes=assets.get(descriptor.snapshot);if(!bytes||hash(bytes)!==descriptor.sha256||descriptor.bytes!==undefined&&descriptor.bytes!==bytes.length)throw new Error('Missing or mismatched snapshot: '+descriptor.snapshot);return bytes;}
 for(const archived of releases){for(const item of [archived.identity.algorithm,...Object.values(archived.identity.application),...Object.values(archived.identity.datasets),...Object.values(archived.identity.resources||{}),...Object.values(archived.identity.service||{})])verified(item);}
 const manifestPath=`evidence-assets/build-${release.buildId}.json`,manifestBytes=assets.get(manifestPath);if(!manifestBytes||JSON.stringify(parseManifest(manifestBytes).identity)!==JSON.stringify(release.identity))throw new Error('The current immutable manifest is missing.');
 const aliases=new Map();function alias(name,descriptor){safeAlias(name);verified(descriptor);if(aliases.has(name)&&aliases.get(name).snapshot!==descriptor.snapshot)throw new Error('Conflicting release path: '+name);aliases.set(name,descriptor);}
 for(const[name,descriptor]of Object.entries(release.identity.application))alias(name,descriptor);
 for(const[name,descriptor]of Object.entries(release.identity.resources||{}))alias(name,descriptor);
 for(const descriptor of Object.values(release.identity.datasets))alias(descriptor.path,descriptor);
 for(const required of ['index.html','navigator.html','src/analysis.js'])if(!aliases.has(required))throw new Error('Missing required current application file: '+required);
 // All bytes and paths are checked before replacing the previous successful output.
 if(previous)await rm(output,{recursive:true,force:true});await mkdir(path.join(output,'evidence-assets'),{recursive:true});
 for(const[name,bytes]of assets)await writeFile(path.join(output,name),bytes);
 let copiedAliases=0;async function materialize(snapshot,destination){const from=path.join(output,snapshot),to=path.join(output,destination);await mkdir(path.dirname(to),{recursive:true});try{await link(from,to);}catch(error){if(!['EPERM','ENOTSUP','EXDEV','EACCES'].includes(error.code))throw error;await copyFile(from,to);copiedAliases++;}}
 for(const[name,descriptor]of aliases)await materialize(descriptor.snapshot,name);
 await materialize(manifestPath,'build-info.json');
 const logicalBytes=[...assets.values()].reduce((n,b)=>n+b.length,0)+[...aliases.values()].reduce((n,d)=>n+assets.get(d.snapshot).length,0)+manifestBytes.length;
 const unique=new Map([...assets.values()].map(bytes=>[hash(bytes),bytes.length]));
 const result={schemaVersion:1,buildId:release.buildId,algorithmSha256:release.identity.algorithm.sha256,source:'Existing verified build-info.json and immutable evidence-assets; prepareRelease was not invoked.',archivedReleases:releases.length,archiveFiles:assets.size,currentStaticAliases:aliases.size+1,staticFiles:assets.size+aliases.size+2,logicalBytes,uniqueContentBytes:[...unique.values()].reduce((a,b)=>a+b,0),largestStaticFileBytes:Math.max(...[...assets.values()].map(b=>b.length)),aliasCopyFallbacks:copiedAliases,history:'Full historical manifests and all referenced snapshots remain static. Historical interface paths are forwarded only to the fixed original host by vercel.json; current pinned paths reuse current static files.',media:'All recordings and byte-addressed media are static; no video request enters the API gateway.'};
 await writeFile(path.join(output,'vercel-build-report.json'),JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildVercel()));
