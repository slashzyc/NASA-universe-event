import {loadValidationCatalog,matchValidationEvidence,validationEvidenceMarkup} from './validation-evidence.js';
let catalog;
const pending=new WeakMap();
/** Presentation reads an exact mission/hash match; it never changes its record. */
export async function populateValidation(node,record,{language='en',compact=false}={}){
  const request={},t=(en,zh)=>language==='zh'?zh:en;pending.set(node,request);
  node.innerHTML=`<p role="status">${t('Checking the numerical evidence for these exact conditions…','正在核对与本方案完整条件匹配的数值证据…')}</p>`;
  try{
    catalog??=loadValidationCatalog().catch(error=>{catalog=null;throw error;});
    const evidence=matchValidationEvidence(await catalog,record);if(!node.isConnected||pending.get(node)!==request)return;
    node.dataset.auditStatus=evidence.validationStatus;
    const title=!evidence.matched?t('Not audited under these exact conditions','当前完整条件未核验'):evidence.validationStatus==='sensitive'?t('Numerical checks found sensitivity','数值核验显示敏感性'):t('Numerical evidence and its limits','数值核验及范围');
    const full=validationEvidenceMarkup(evidence,language);
    node.innerHTML=compact?`<details><summary>${title}</summary>${full}</details>`:`<h3>${t('Nominal decision and validation are separate','名义判定与核验证据分开看')}</h3>${full}`;
  }catch(error){if(!node.isConnected||pending.get(node)!==request)return;node.dataset.auditStatus='unavailable';node.replaceChildren();const message=document.createElement('p');message.setAttribute('role','status');message.textContent=t('The validation evidence could not be loaded. The nominal calculation is retained; no audit status is inferred. ','无法读取核验证据。名义结果保留，不据此推定已核验。')+error.message;const retry=document.createElement('button');retry.type='button';retry.className='secondary-btn compact';retry.textContent=t('Retry evidence lookup','重试核验查询');retry.onclick=()=>populateValidation(node,record,{language,compact});node.append(message,retry);}
}
