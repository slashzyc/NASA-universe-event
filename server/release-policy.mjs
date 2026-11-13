/** Shared request protocol. Calculation versions never follow a server default silently. */
export const API_VERSION=2;
export function releaseDescriptor(release){return{apiVersion:API_VERSION,buildId:release.buildId,algorithmSha256:release.identity.algorithm.sha256,datasets:Object.fromEntries(Object.entries(release.identity.datasets).map(([id,value])=>[id,value.sha256]))};}
export function assertClientRelease(input,current){
  const value=input?.clientRelease;
  if(value?.apiVersion!==API_VERSION||value?.buildId!==current.buildId){const error=new Error('The interface and service releases do not match. Reload the current workspace before recording a calculation / 界面与服务版本不一致，请重新打开当前工作台后再记录计算。');error.status=409;error.code='client-release-mismatch';throw error;}
  if(typeof input.buildId!=='string'||!/^[a-f0-9]{64}$/.test(input.buildId)){const error=new Error('Choose an explicit verified calculation version / 请明确选择经过验证的计算版本。');error.status=409;error.code='calculation-version-required';throw error;}
}
export function assertCalculationRelease(input,release,descriptor){
  if(input.buildId!==release.buildId||input.algorithmSha256!==release.identity.algorithm.sha256||input.datasetSha256!==descriptor.sha256){const error=new Error('Requested algorithm, data and calculation version disagree. No calculation was recorded / 请求中的算法、数据与计算版本不一致，未记录计算。');error.status=409;error.code='calculation-release-mismatch';throw error;}
}
