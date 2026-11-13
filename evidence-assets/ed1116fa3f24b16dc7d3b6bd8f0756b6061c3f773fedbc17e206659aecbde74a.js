import {searchMissionWindows} from './mission-constraints.js';
import {importVerifiedAlgorithm} from './provenance.js';
const modules=new Map();
self.onmessage=async({data})=>{try{
  const asset=data.algorithm;
  if(!modules.has(asset?.sha256))modules.set(asset?.sha256,(async()=>{
    const base=new URL('../',self.location.href);
    return (await importVerifiedAlgorithm(asset,base)).module;
  })());
  const {searchWindows}=await modules.get(asset.sha256);
  self.postMessage({id:data.id,result:searchMissionWindows(searchWindows,data.sites,data.settings,data.missionConstraints)});
}catch(error){self.postMessage({id:data.id,error:error.message});}};
