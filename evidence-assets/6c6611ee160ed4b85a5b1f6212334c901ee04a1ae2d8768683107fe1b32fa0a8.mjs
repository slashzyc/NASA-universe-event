/** One deployable ESM: exact interface, algorithm and baseline data share a release. */
import {readFile,writeFile,readdir,mkdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function buildWorker({staticRoot=path.join(root,'dist'),outputFile=path.join(staticRoot,'server/index.js')}={}){
 const release=JSON.parse(await readFile(path.join(staticRoot,'build-info.json'),'utf8'));
 if(hash(JSON.stringify(release.identity))!==release.buildId)throw new Error('Build the verified frontend first.');
 const assets={},binaryAssets={},releases=[];
 async function verified(descriptor){const bytes=await readFile(path.join(staticRoot,descriptor.snapshot));if(hash(bytes)!==descriptor.sha256)throw new Error('Release asset bytes mismatch: '+descriptor.snapshot);return bytes;}
 for(const name of await readdir(path.join(staticRoot,'evidence-assets'))){if(!/^build-[a-f0-9]{64}\.json$/.test(name))continue;const text=await readFile(path.join(staticRoot,'evidence-assets',name),'utf8'),saved=JSON.parse(text);if(hash(JSON.stringify(saved.identity))!==saved.buildId)throw new Error('Archived manifest mismatch.');assets['evidence-assets/'+name]=text;releases.push(saved);}
 // Archived application snapshots are deduplicated and let open tabs finish loading across rollouts.
 for(const saved of releases)for(const descriptor of Object.values(saved.identity.application)){if(!assets[descriptor.snapshot])assets[descriptor.snapshot]=(await verified(descriptor)).toString('utf8');}
 for(const descriptor of Object.values(release.identity.service||{}))assets[descriptor.snapshot]=(await verified(descriptor)).toString('utf8');
 for(const descriptor of Object.values(release.identity.datasets))assets[descriptor.snapshot]=(await verified(descriptor)).toString('utf8');
 const source=assets[release.identity.algorithm.snapshot];if(!source||hash(source)!==release.identity.algorithm.sha256)throw new Error('Algorithm bytes mismatch.');
 for(const [file,descriptor]of Object.entries(release.identity.resources||{})){
   // Necessary Moon images work without a second host. Large audit files and
   // recordings use only checked SHA-addressed objects cached in R2.
   if(file.startsWith('assets/')||descriptor.bytes<=65536){const bytes=await verified(descriptor);if(/\.(?:js|css|html|json|md|txt|svg|vtt)$/.test(file))assets[descriptor.snapshot]=bytes.toString('utf8');else binaryAssets[descriptor.snapshot]=bytes.toString('base64');}
 }
 const validationDescriptor=release.identity.resources?.['data/science-validation-summary.json'];
 if(!validationDescriptor)throw new Error('The calculation release must contain its verified validation catalog.');
 assets[validationDescriptor.snapshot]=(await verified(validationDescriptor)).toString('utf8');
 const sourceFor=async file=>release.identity.service?.[file]?(await verified(release.identity.service[file])).toString('utf8'):readFile(path.join(root,file),'utf8');
 const policy=await sourceFor('server/release-policy.mjs'),constraints=assets[release.identity.application['src/mission-constraints.js'].snapshot];
 const validationSource=assets[release.identity.application['src/validation-evidence.js'].snapshot],recordSource=assets[release.identity.application['src/record-validation.js'].snapshot],plain=source=>source.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
 const bindings=`const RELEASE=${JSON.stringify(release)};\nconst ASSETS=${JSON.stringify(assets)};\nconst BINARY_ASSETS=${JSON.stringify(binaryAssets)};\nconst ALGORITHM_SOURCE=${JSON.stringify(source)};\nconst Algorithm=(()=>{\n${source.replace(/^export /gm,'')}\nreturn{analyzeSite,stressTestSite};\n})();\nconst ReleasePolicy=(()=>{\n${policy.replace(/^export /gm,'')}\nreturn{API_VERSION,releaseDescriptor,assertClientRelease,assertCalculationRelease};\n})();\nconst MissionPolicy=(()=>{\n${constraints.replace(/^export /gm,'')}\nreturn{assertMissionArrival,appendMissionConstraints,missionSearchRule};\n})();`;
 const validationBindings=`\nconst VALIDATION_CATALOG=JSON.parse(ASSETS[${JSON.stringify(validationDescriptor.snapshot)}]);\nconst ValidationPolicy=(()=>{\n${plain(validationSource)}\nreturn{matchValidationEvidence};\n})();\nconst RecordPolicy=(()=>{\nconst {matchValidationEvidence}=ValidationPolicy;\n${plain(recordSource)}\nreturn{buildRecordValidation};\n})();`;
 const validation=(await sourceFor('server/calculation.mjs')).split('export function validateSettings')[1].split('export async function createCalculator')[0];
 // A replacement callback preserves literal $&, $` and $' inside embedded sources.
 const worker=(await sourceFor('worker/index.js')).replace('/*__GENERATED_BINDINGS__*/',()=>bindings+validationBindings).replace('/*__VALIDATE_SETTINGS__*/',()=>'function validateSettings'+validation);
 const compressedBytes=gzipSync(worker).byteLength;
 if(compressedBytes>3*1024*1024)throw new Error(`Worker gzip is ${compressedBytes} bytes, above the conservative 3 MiB bundle budget.`);
 await mkdir(path.dirname(outputFile),{recursive:true});await writeFile(outputFile,worker);
 await mkdir(path.join(staticRoot,'.openai'),{recursive:true});await cp(path.join(root,'.openai/hosting.json'),path.join(staticRoot,'.openai/hosting.json'));
 const result={buildId:release.buildId,rawBytes:Buffer.byteLength(worker),gzipBytes:compressedBytes,embeddedTextAssets:Object.keys(assets).length,embeddedBinaryAssets:Object.keys(binaryAssets).length};
 console.log('Built coherent cloud release '+JSON.stringify(result));return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildWorker();
