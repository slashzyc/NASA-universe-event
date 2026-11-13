import {matchValidationEvidence,validationEvidenceMarkup} from './validation-evidence.js';
import {readManifest,verifiedText,validDigest} from './provenance.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Pure constructor shared by browser, Node and Worker. It records what was
 * available at calculation time and never updates an existing saved record. */
export function buildRecordValidation(record,release,catalog){
  const descriptor=release?.identity.resources?.['data/science-validation-summary.json'];
  const identity=descriptor?{releaseBuildId:release.buildId,sha256:descriptor.sha256,snapshot:descriptor.snapshot}:null;
  if(!catalog||!descriptor)return{schemaVersion:1,catalog:identity,matched:false,validationStatus:'unavailable',reason:'A verified catalog was not available when this record was created. No validation claim is made.'};
  const {availableCases,...matched}=matchValidationEvidence(catalog,record);
  return{schemaVersion:1,catalog:identity,...matched};
}
export async function verifyRecordValidation(record,base){
  const saved=record.validationEvidence,provenance=record.provenance||{};
  const manifests=new Map(),getRelease=async id=>{if(!manifests.has(id))manifests.set(id,await readManifest(new URL(`evidence-assets/build-${id}.json`,base),id));return manifests.get(id);};
  const builds=[...new Set([provenance.interfaceBuildId,provenance.calculationBuildId||provenance.buildId].filter(validDigest))];
  const sourceReleases=await Promise.all(builds.map(getRelease));
  const auditRelease=sourceReleases.find(release=>release.identity.application?.['src/record-validation.js']&&release.identity.resources?.['data/science-validation-summary.json']);
  if(!saved){if(auditRelease)throw new Error('This release requires its recorded validation snapshot / 此版本的保存记录缺少必要核验信息。');return true;}
  if(saved.schemaVersion!==1)throw new Error('Unsupported recorded validation schema.');
  if(!saved.catalog){if(!auditRelease&&saved.validationStatus==='unavailable'&&saved.matched===false)return true;throw new Error('Recorded validation has no source identity / 保存的核验信息缺少原始目录标识。');}
  if(auditRelease&&saved.catalog.releaseBuildId!==auditRelease.buildId)throw new Error('Recorded validation belongs to another interface release / 保存的核验信息不属于原界面版本。');
  const release=await getRelease(saved.catalog.releaseBuildId),descriptor=release.identity.resources?.['data/science-validation-summary.json'];
  if(!descriptor||descriptor.sha256!==saved.catalog.sha256||descriptor.snapshot!==saved.catalog.snapshot)throw new Error('Recorded validation source fingerprints disagree.');
  if(saved.validationStatus==='unavailable'&&saved.matched===false)throw new Error('The saved audit was unavailable and cannot be verified as a complete record. Keep the original file and recalculate to obtain new evidence / 原记录的核验信息不可用，无法通过完整证据校验；请保留原文件并重新计算。');
  const catalog=JSON.parse(await verifiedText(descriptor,base)),expected=buildRecordValidation(record,release,catalog);
  const stable=value=>JSON.stringify(value,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
  if(stable(saved)!==stable(expected))throw new Error('Recorded validation differs from its immutable catalog / 保存的核验信息与原始目录不一致。');
  return true;
}
export function recordedValidationMarkup(record,language='en'){
  const t=(en,zh)=>language==='zh'?zh:en,v=record.validationEvidence;
  if(!v)return `<p>${t('This historical record did not preserve a validation snapshot. Its nominal values remain unchanged; a new live audit lookup is not part of the original evidence.','这份历史记录未保存核验快照。原名义结果保持不变；当前查询的审计不能冒充原记录的一部分。')}</p>`;
  const base=record.shareURL||(record.provenance?.manifestURL?new URL('../',record.provenance.manifestURL).href:null);
  const source=v.catalog&&base?new URL(v.catalog.snapshot,base).href:null;
  const display=structuredClone(v);if(base&&display.source)display.source=new URL(display.source,base).href;if(base&&display.terrainUncertainty?.source)display.terrainUncertainty.source=new URL(display.terrainUncertainty.source,base).href;
  const body=v.validationStatus==='unavailable'?`<p>${t('Validation evidence was unavailable at calculation time. No audit is claimed.','生成记录时核验证据不可用；此记录不声明已审计。')}</p>`:validationEvidenceMarkup(display,language);
  return `<h2>${t('Recorded numerical validation and remaining uncertainty','保存的数值核验与未知范围')}</h2>${body}${source?`<p><a href="${escape(source)}">${t('Immutable validation catalog','不可变核验目录')} ↗</a><br>SHA-256 <code>${escape(v.catalog.sha256)}</code><br>${t('Catalog release','目录发布版本')} <code>${escape(v.catalog.releaseBuildId)}</code></p>`:''}`;
}
