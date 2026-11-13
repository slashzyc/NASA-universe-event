import {assertMissionArrival,appendMissionConstraints} from './mission-constraints.js';
/** Verifies bytes before using a calculation release. Uploaded code is never executed. */
export const validDigest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export async function sha256(value){
  const bytes=typeof value==='string'?new TextEncoder().encode(value):value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function verifyManifest(manifest,expectedId){
  if(manifest?.schemaVersion!==1||!validDigest(manifest.buildId)||!manifest.identity||
    await sha256(JSON.stringify(manifest.identity))!==manifest.buildId||expectedId&&manifest.buildId!==expectedId)
    throw new Error('Release manifest checksum mismatch.');
  const datasets=manifest.identity.datasets;
  if(!datasets||typeof datasets!=='object'||Array.isArray(datasets)||!Object.keys(datasets).length)
    throw new Error('Release manifest has no dataset assets.');
  for(const[asset,extension]of[[manifest.identity.algorithm,'js'],...Object.values(datasets).map(value=>[value,'json'])]){
    if(!validDigest(asset?.sha256)||asset.snapshot!==`evidence-assets/${asset.sha256}.${extension}`)
      throw new Error('Release asset is not content-addressed for its algorithm or dataset role.');
  }
  return manifest;
}
export async function readManifest(url,expectedId,fetcher=fetch){
  const response=await fetcher(url,{cache:'no-store'});
  if(!response.ok)throw new Error(`Saved calculation version unavailable (${response.status}).`);
  return verifyManifest(await response.json(),expectedId);
}
export async function verifiedText(asset,base,fetcher=fetch){
  if(!validDigest(asset?.sha256)||!new RegExp(`^evidence-assets/${asset.sha256}\\.[a-z]+$`).test(asset.snapshot))throw new Error('Invalid snapshot location.');
  const response=await fetcher(new URL(asset.snapshot,base),{cache:'no-store'});
  if(!response.ok)throw new Error(`Saved input snapshot unavailable (${response.status}).`);
  const text=await response.text();
  if(await sha256(text)!==asset.sha256)throw new Error('Snapshot checksum mismatch; calculation stopped.');
  return text;
}
export async function importVerifiedAlgorithm(asset,base){
  const source=await verifiedText(asset,base);
  // Execute exactly the verified response, not a second potentially different fetch.
  // Only same-origin release assets reach this function; uploaded code never does.
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  try{return {source,module:await import(url)};}finally{URL.revokeObjectURL(url);}
}
export function versionDifferences(saved,current,campaign){
  if(!saved?.buildId)return ['legacy'];
  const differences=[];
  if(saved.buildId!==current.buildId)differences.push('build');
  if(saved.algorithmSha256!==current.identity.algorithm.sha256)differences.push('algorithm');
  if(saved.datasetSha256!==current.identity.datasets[campaign]?.sha256)differences.push('data');
  return differences;
}
export async function inspectRecord(record,current){
  if(record?.project!=='LunaMargin'||![1,2,3].includes(record.schemaVersion))throw new Error('Unsupported LunaMargin evidence schema.');
  if(!record.settings||!Number.isFinite(Date.parse(record.settings.start))||!record.selectedSiteId)throw new Error('The saved scenario is incomplete.');
  if(record.schemaVersion===3&&!['buildId','algorithmSha256','datasetSha256'].every(key=>validDigest(record.provenance?.[key])))
    throw new Error('The saved version provenance is incomplete.');
  assertMissionArrival(record.settings,record.missionConstraints);
  const campaign=record.campaign||({'12':'dec','03':'mar','06':'jun'}[record.settings.start.slice(5,7)]);
  if(!current.identity.datasets[campaign])throw new Error('The saved campaign is unavailable.');
  const differences=versionDifferences(record.provenance,current,campaign);
  let snapshotStatus='missing';
  if(record.inputSnapshot?.text){
    if(!validDigest(record.inputSnapshot.sha256)||await sha256(record.inputSnapshot.text)!==record.inputSnapshot.sha256||
      record.provenance?.datasetSha256&&record.inputSnapshot.sha256!==record.provenance.datasetSha256)
      throw new Error('Saved input snapshot checksum mismatch.');
    const input=JSON.parse(record.inputSnapshot.text);
    if(Number.isFinite(input.observerHeightM)&&record.settings.observerHeightM!==input.observerHeightM)
      throw new Error('The saved device height does not match its input snapshot.');
    snapshotStatus='verified';
  }
  if(record.algorithmSnapshot?.text&&(await sha256(record.algorithmSnapshot.text)!==record.algorithmSnapshot.sha256||
    record.provenance?.algorithmSha256&&record.algorithmSnapshot.sha256!==record.provenance.algorithmSha256))
    throw new Error('Saved algorithm snapshot checksum mismatch.');
  return {campaign,differences,snapshotStatus,legacy:!record.provenance?.buildId};
}
export function scenarioURL(record,base,{current=false}={}){
  const url=new URL('navigator.html',base),p=url.searchParams,s=record.settings;
  const campaign=record.campaign||({'12':'dec','03':'mar','06':'jun'}[s.start.slice(5,7)]);
  appendMissionConstraints(p,record.missionConstraints);
  p.set('campaign',campaign);p.set('site',record.selectedSiteId);p.set('patch',record.selectedPoint?.id||'e+0-n+0');
  p.set('lang',record.language==='zh'?'zh':'en');
  for(const key of ['start','durationHours','maxDarkHours','maxCommGapHours','minJointHours','clearanceDeg','observerHeightM'])if(s[key]!==undefined)p.set(key,String(s[key]));
  if(!current&&record.provenance?.buildId){p.set('build',record.provenance.buildId);p.set('algo',record.provenance.algorithmSha256);p.set('data',record.provenance.datasetSha256);}
  else p.set('recalculated','1');
  return url.href;
}
