/** Bundle a dependency-free Worker after the ordinary, verified frontend build. */
import {readFile,writeFile,readdir,mkdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),hash=text=>createHash('sha256').update(text).digest('hex');
const release=JSON.parse(await readFile(path.join(root,'dist/build-info.json'),'utf8'));
if(hash(JSON.stringify(release.identity))!==release.buildId)throw new Error('Build the verified frontend first.');
const source=await readFile(path.join(root,'dist',release.identity.algorithm.snapshot),'utf8');
if(hash(source)!==release.identity.algorithm.sha256)throw new Error('Algorithm bytes mismatch.');
const assets={};for(const descriptor of [release.identity.algorithm,...Object.values(release.identity.datasets)]){const text=await readFile(path.join(root,'dist',descriptor.snapshot),'utf8');if(hash(text)!==descriptor.sha256)throw new Error('Input bytes mismatch.');assets[descriptor.snapshot]=text;}
for(const name of await readdir(path.join(root,'dist/evidence-assets'))){if(/^build-[a-f0-9]{64}\.json$/.test(name)){const text=await readFile(path.join(root,'dist/evidence-assets',name),'utf8'),manifest=JSON.parse(text);if(hash(JSON.stringify(manifest.identity))!==manifest.buildId)throw new Error('Archived manifest mismatch.');assets['evidence-assets/'+name]=text;}}
let worker=await readFile(path.join(root,'worker/index.js'),'utf8');
const generated=`const RELEASE=${JSON.stringify(release)};\nconst ASSETS=${JSON.stringify(assets)};\nconst ALGORITHM_SOURCE=${JSON.stringify(source)};\nconst Algorithm=(()=>{\n${source.replace(/^export /gm,'')}\nreturn{analyzeSite,stressTestSite};\n})();`;
const validation=(await readFile(path.join(root,'server/calculation.mjs'),'utf8')).split('export function validateSettings')[1].split('export async function createCalculator')[0];
worker=worker.replace('/*__GENERATED_BINDINGS__*/',generated).replace('/*__VALIDATE_SETTINGS__*/','function validateSettings'+validation);
await mkdir(path.join(root,'dist/server'),{recursive:true});await mkdir(path.join(root,'dist/.openai'),{recursive:true});
await writeFile(path.join(root,'dist/server/index.js'),worker);await cp(path.join(root,'.openai/hosting.json'),path.join(root,'dist/.openai/hosting.json'));
console.log(`Built cloud Worker (${Buffer.byteLength(worker)} bytes), algorithm ${release.identity.algorithm.sha256.slice(0,12)}, release ${release.buildId.slice(0,12)}. D1 schema: drizzle/.`);
