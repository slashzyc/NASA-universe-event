/** Explicit real NASA request used to reproduce the optional new-date browser gate.
 * Re-running uses verified cached datasets/responses. No synthetic data is used. */
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createHorizonsPipeline } from '../server/horizons.mjs';

const root=resolve(import.meta.dirname,'..');
const args=process.argv.slice(2);
if(args.length && !(args.length===2&&args[0]==='--data-dir')){
  console.error('Usage: node scripts/fetch-validation-seed.mjs [--data-dir DIRECTORY]');process.exit(2);
}
const dataDir=resolve(args[1]||join(root,'..','tmp','explorer-real-pipeline'));
let pipeline,jobId;
try{
  pipeline=await createHorizonsPipeline({root,dataDir,onJob:job=>{
    if(job.id===jobId)console.log(`${job.status} / ${job.stage} · ${job.completedRequests}/6 source tables · ${job.message}`);
  }});
  await pipeline.resume();
  const job=await pipeline.enqueue({start:'2027-07-01',stop:'2027-07-03',observerHeightM:2});jobId=job.id;
  console.log(`Real NASA validation request ${jobId}. Cache: ${dataDir}`);
  for(;;){
    const current=pipeline.getJob(jobId);
    if(current.status==='failed')throw new Error(current.error?.message||current.message);
    if(current.status==='succeeded'){
      const dataset=pipeline.resolveDataset(current.datasetId);
      if(!dataset)throw new Error('The validation dataset was not registered.');
      console.log(JSON.stringify({datasetId:dataset.id,sha256:dataset.sha256,start:dataset.start,stop:dataset.stop,
        sourceDataTime:dataset.sourceDataTime,generatedAt:dataset.generatedAt,cacheDirectory:join(dataDir,'horizons')},null,2));
      break;
    }
    await delay(250);
  }
}catch(error){console.error(`NASA seed request failed: ${error.message}`);process.exitCode=1;}
finally{await pipeline?.close();}
