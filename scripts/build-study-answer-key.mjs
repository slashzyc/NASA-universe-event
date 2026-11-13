/** Prepare scored tasks from computed evidence. This never generates observations. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base=new URL('../docs/study/',import.meta.url),read=async name=>readFile(new URL(name,base));
const raw=await read('study-cases.json'),study=JSON.parse(raw);
assert.equal(study.participantsTested,0);
const cases=study.cases.map(c=>{
  const initial=c.plans.find(p=>p.role==='initial');
  const allowed=c.plans.filter(p=>p.role==='alternative'&&p.feasibleCount===9&&Date.parse(p.settings.start)<=Date.parse(c.missionConstraints.latestArrival));
  allowed.sort((a,b)=>a.delayHours-b.delayHours||b.worstCase.minimumMarginHours-a.worstCase.minimumMarginHours||a.siteId.localeCompare(b.siteId));
  assert.ok(allowed.length);
  const selected=allowed[0],margins=selected.points.flatMap(p=>Object.entries(p.margins).map(([metric,hours])=>({pointId:p.id,metric,hours}))).sort((a,b)=>a.hours-b.hours);
  return {caseId:c.id,conditions:c.missionConstraints,correctAnswers:{
    task1:{failedPoints:initial.points.filter(p=>!p.result.centerFeasible).map(p=>({id:p.id,reasons:p.result.reasons})),centerPasses:initial.centerFeasible},
    task2:{weakest: marginGuard(margins[0]),meaning:'Positive is remaining threshold allowance; negative exceeds a user limit. Nine samples are not a probability.'},
    task3:{planId:selected.id,siteId:selected.siteId,start:selected.settings.start,delayHours:selected.delayHours,latestArrival:c.missionConstraints.latestArrival,rankingPreference:c.missionConstraints.rankingPreference,acceptableRule:'All nine pass, full data coverage, arrival no later than deadline; earliest arrival, then weakest margin.'},
    task4:{planId:selected.id,pointId:margins[0].pointId,requiredFields:['siteId','pointId','start','durationHours','maxDarkHours','maxCommGapHours','minJointHours','observerHeightM','missionConstraints','metrics','input and algorithm versions'],mustReopen:true},
    task5:{minimumRequired:['No independent dense verification for this exact whole footprint and interval','Angular stress is not a measured terrain error distribution','Geometric visibility is not electrical power, a working ground-station link or landing safety'],acceptEquivalentWords:true}
  }};
});
function marginGuard(value){assert.ok(Number.isFinite(value.hours));return value;}
const write=async(name,value)=>writeFile(new URL(name,base),JSON.stringify(value,null,2)+'\n');
await write('moderator-answer-key.json',{schemaVersion:1,status:'answers-only-not-observations',caseFileSha256:createHash('sha256').update(raw).digest('hex'),analysisSha256:study.analysisSha256,cases});
await write('observations.blank.json',{schemaVersion:1,status:'pending-participants',participantsTested:0,interviewsCompleted:0,participants:[],interview:null,releaseFreeze:null,retention:'No names or contacts in the public repository. Record consent and quotation permission separately.',participantTemplate:{anonymousId:null,dateUTC:null,order:null,device:null,language:null,consent:null,quotationPermission:null,sessions:[],events:[],withdrawal:null},taskTemplate:{condition:null,caseId:null,taskNumber:null,startedAtUTC:null,endedAtUTC:null,elapsedSeconds:null,firstAnswer:null,criterionScores:null,completed:null,assistanceCount:null,prompts:[],misunderstandings:[],verbatimQuote:null,timeout:null,aborted:null,technicalFailure:null,artifacts:[]},interviewQuestions:['Primary users and concept-design stage','Are the practice limits meaningful; what source supports actual limits?','Latest arrival and ranking preference','Meaning of nine samples and validation status','Can the exported record support review?'],obstacleRetestTemplate:{observationId:null,participantId:null,obstacle:null,change:null,retestRelease:null,retestDate:null,result:null}});
const files=['case-a-static.html','case-b-static.html','app-condition.html','static-condition.html','study-cases.json','study-values.csv','study-windows.csv','moderator-answer-key.json','observations.blank.json'];
const hashes={};for(const file of files)hashes[file]=createHash('sha256').update(await read(file)).digest('hex');
await write('protocol-manifest.json',{schemaVersion:1,status:'materials-prepared-study-not-started',participantsTested:0,interviewsCompleted:0,files:hashes,analysisSha256:study.analysisSha256,datasets:study.cases.map(c=>({caseId:c.id,campaign:c.campaign,sha256:c.datasetSha256})),freezeRule:'Before P01, record the immutable public /releases/<buildId>/ URL and release identity, verify these material hashes and unchanged algorithm/data. Use that version for both conditions and all participants. If a repair is needed, stop and open a new versioned round.'});
console.log(JSON.stringify({cases:cases.length,materials:files.length,participantsTested:0,interviewsCompleted:0,status:'prepared-not-run'}));
