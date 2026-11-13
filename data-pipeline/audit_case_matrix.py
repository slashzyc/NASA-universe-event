"""Execute the frozen, exploratory three-season case matrix; no release input changes.

Fetches are strictly serial, exact-key cached, version checked and backed off.
Geometry interventions are separate; arbitrary clearance is never terrain error.
"""
from __future__ import annotations
import csv
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import time
import argparse
import build_dataset as terrain
import audit_recommendations as integration
import numpy as np
import requests

ROOT=terrain.PROJECT
OUT=ROOT/'data'/'science-validation-audit.json'
RAW=ROOT/'data'/'raw'/'science-matrix'
CACHE=ROOT.parent/'tmp'/'science-matrix-horizons.json'
USER_AGENT='LunaMargin-ScienceAudit/1.0 (+https://github.com/slashzyc/NASA-universe-event/issues)'
METRICS=['sunHours','earthHours','jointHours','longestDarkHours','longestCommGapHours']
def stamp():return datetime.now(timezone.utc).isoformat()
def dump(path,value):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8')
def sha(path):return terrain.sha256(path)
def parse(s):return datetime.fromisoformat(s.replace('Z','+00:00'))
def query(case,target):
    p=case['location'];start=parse(case['settings']['start']);stop=start+timedelta(hours=168)
    return {'format':'json','COMMAND':f"'{target}'",'OBJ_DATA':"'NO'",'MAKE_EPHEM':"'YES'",'EPHEM_TYPE':"'OBSERVER'",'CENTER':"'coord@301'",'COORD_TYPE':"'GEODETIC'",'SITE_COORD':f"'{p['lon']:.9f},{p['lat']:.9f},{(p['elevationM']+2)/1000:.9f}'",'START_TIME':"'"+start.strftime('%Y-%m-%d %H:%M')+"'",'STOP_TIME':"'"+stop.strftime('%Y-%m-%d %H:%M')+"'",'STEP_SIZE':"'5 m'",'QUANTITIES':"'4'",'CSV_FORMAT':"'YES'",'ANG_FORMAT':"'DEG'",'APPARENT':"'AIRLESS'",'TIME_DIGITS':"'SECONDS'",'EXTRA_PREC':"'YES'",'TIME_TYPE':"'UT'",'TIME_ZONE':"'+00:00'"}
def fetch(case,target,attempts):
    params=query(case,target);key=hashlib.sha256(json.dumps(params,sort_keys=True).encode()).hexdigest();path=RAW/(key+'.json')
    if path.exists():
        env=json.loads(path.read_text(encoding='utf-8'))
        if env['parameters']!=params:raise ValueError('Cached parameters mismatch')
    else:
        for number in range(3):
            event={'time':stamp(),'caseId':case['id'],'target':target,'attempt':number+1}
            try:
                r=requests.get('https://ssd.jpl.nasa.gov/api/horizons.api',params=params,headers={'User-Agent':USER_AGENT},timeout=(20,120));event['httpStatus']=r.status_code;r.raise_for_status();payload=r.json()
                if payload.get('error'):raise ValueError(payload['error'])
                if payload.get('signature',{}).get('version')!='1.2':raise ValueError('Unreviewed upstream API version')
                env={'requestedAt':stamp(),'parameters':params,'url':r.url,'userAgent':USER_AGENT,'response':payload};dump(path,env);event['status']='success';attempts.append(event);time.sleep(1);break
            except (requests.RequestException,ValueError) as e:
                event.update(status='failed',error=str(e));attempts.append(event)
                if number==2:raise
                delay=max(5*(2**number),int(r.headers.get('Retry-After','0')) if 'r' in locals() and r.headers.get('Retry-After','').isdigit() else 0);time.sleep(min(delay,60))
    payload=env['response']
    if payload.get('signature',{}).get('version')!='1.2':raise ValueError('Unreviewed cached API version')
    text=payload['result'];expected='Sun (10)' if target=='10' else 'Earth (399)'
    for fragment in ['Center body name: Moon (301)','Target body name: '+expected,'Step-size       : 5 minutes','MEAN_ME']:
        if fragment not in text:raise ValueError('Missing observer metadata: '+fragment)
    samples=[]
    for row in csv.reader(text.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()):
        dt=datetime.strptime(row[0].strip(),'%Y-%b-%d %H:%M:%S').replace(tzinfo=timezone.utc)
        samples.append({'time':dt.strftime('%Y-%m-%dT%H:%M:%SZ'),'az':float(row[3]),'el':float(row[4])})
    start=parse(case['settings']['start']);expected_epochs=[start+timedelta(minutes=5*i) for i in range(2017)]
    if [parse(s['time']) for s in samples]!=expected_epochs:raise ValueError('Missing, duplicate, out-of-order or truncated epochs')
    if not np.isfinite([[s['az'],s['el']] for s in samples]).all():raise ValueError('Nonfinite angles')
    return samples,{'path':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':sha(path),'parameters':params,'requestedAt':env['requestedAt'],'apiVersion':payload['signature']['version'],'count':len(samples),'missingEpochCount':0,'sourceTimeMeaning':'retrieval time of predicted ephemerides, not real-time observation'}
def horizon_chunked(local,regional,point,angle,radial):
    distance=np.concatenate([np.arange(5*radial,2000,5*radial),np.arange(2000,8000,20*radial),np.arange(8000,250001,80*radial)])
    horizon=[];occluders=[]
    for bearings in np.array_split(np.arange(0.,360.,angle),24):
        lon,lat=terrain.destination(point['lon'],point['lat'],bearings[:,None],distance[None,:]);x,y=terrain.lonlat_to_xy(lon,lat);z=terrain.combined_elevation(local,regional,x,y);delta=distance/terrain.RADIUS_M
        angles=np.rad2deg(np.arctan2((terrain.RADIUS_M+z)*np.cos(delta)-(terrain.RADIUS_M+point['elevationM']+2),(terrain.RADIUS_M+z)*np.sin(delta)))
        horizon.extend(np.round(angles.max(axis=1),5).tolist());occluders.extend(distance[angles.argmax(axis=1)].tolist())
    return {'horizon':horizon,'occluderDistanceM':occluders,'angularStepDeg':angle,'radialScale':radial}
def run(fetch_only=False):
    selection_path=ROOT/'data/science-validation-cases.json';selection=json.loads(selection_path.read_text(encoding='utf-8'));plan=ROOT/'docs/science-validation/experiment-plan/claim-map.json'
    if selection['planSha256']!=sha(plan):raise ValueError('Selection no longer matches frozen rules')
    frozen_hash=sha(selection_path);old=json.loads(OUT.read_text()) if OUT.exists() else {}
    if old and old['selectionSha256']!=frozen_hash:raise ValueError('Existing run bound to different frozen cases')
    report={'schemaVersion':1,'startedAt':old.get('startedAt',stamp()),'updatedAt':stamp(),'selectionSha256':frozen_hash,'selectionFrozenAt':selection['frozenAt'],'planSha256':selection['planSha256'],'assurance':'exploratory','algorithmSha256':sha(ROOT/'src/analysis.js'),'runnerSha256':sha(Path(__file__)),'cases':[],'attempts':old.get('attempts',[]),'unavailableStrata':[{k:s[k] for k in ['campaign','category','eligibleCount','status']} for s in selection['selected'] if not s['case']],'terrainUncertainty':{'status':'pending','reason':'Official spatially correlated clone interpretation and complete terrain/observer treatment must be verified separately; angular clearance is not an error propagation.'},'priorJuneAudit':{'path':'data/recommendation-fine-validation.json','sha256':sha(ROOT/'data/recommendation-fine-validation.json'),'classification':'prior exploratory recommendation-selected audit; not new preregistration'}}
    bundles={k:json.loads((ROOT/f).read_text()) for k,f in [('dec','data/lunar-sites.json'),('mar','data/lunar-sites-march.json'),('jun','data/lunar-sites-june.json')]}
    cache=json.loads(CACHE.read_text()) if CACHE.exists() else {};manifest=json.loads((ROOT/'data/source-manifest.json').read_text());local=regional=None
    for item in selection['selected']:
        if not item['case']:continue
        case=item['case'];r={'id':case['id'],'category':item['category'],'campaign':case['campaign'],'siteId':case['siteId'],'patchId':case['patchId'],'settings':case['settings'],'location':case['location'],'dataSha256':case['dataSha256'],'algorithmSha256':case['algorithmSha256'],'nominalFootprint':case['footprint'],'status':'pending','evaluations':{}};report['cases'].append(r)
        try:
            sun,ss=fetch(case,'10',report['attempts']);earth,es=fetch(case,'399',report['attempts']);paired=[{'time':s['time'],'sunAz':s['az'],'sunEl':s['el'],'earthAz':e['az'],'earthEl':e['el']} for s,e in zip(sun,earth)]
            r.update(sources={'sun':ss,'earth':es},samples=paired,coverage={'expected':2017,'actual':len(paired),'missingEpochCount':0})
            if fetch_only:r['status']='fetched';continue
            if local is None:
                for key in ['local-dem','regional-dem']:
                    if sha(terrain.RAW/manifest[key]['file'])!=manifest[key]['sha256']:raise ValueError('DEM source hash mismatch')
                local=terrain.Raster(terrain.RAW/manifest['local-dem']['file']);regional=terrain.Raster(terrain.RAW/manifest['regional-dem']['file'])
            site=next(s for s in bundles[case['campaign']]['sites'] if s['id']==case['siteId']);patch=next(p for p in site['patches'] if p['id']==case['patchId']);start=case['settings']['start'];stop=(parse(start)+timedelta(hours=168)).strftime('%Y-%m-%dT%H:%M:%SZ')
            integration.START=start;integration.STOP=stop;integration.LIMITS={k:case['settings'][k] for k in ['maxDarkHours','maxCommGapHours','minJointHours']}
            published=[s for s in site['samples'] if start<=s['time']<=stop]
            nominal=integration.evaluate(published,patch['horizon']);r['evaluations']['nominal']=nominal
            r['productionReproductionMaximumDeltaHours']=max(abs(nominal['metrics'][k]-case['metrics'][k]) for k in METRICS)
            if r['productionReproductionMaximumDeltaHours']>1e-6:raise ValueError('Independent integrator disagrees with production beyond roundoff gate')
            r['evaluations']['own30']=integration.evaluate(paired[::6],patch['horizon']);r['evaluations']['dense5']=integration.evaluate(paired,patch['horizon'])
            r['geometry']={}
            for mode,angle,radial in [('radial',1,.25),('azimuth',.5,.5),('combined',.5,.25)]:
                key=hashlib.sha256(json.dumps({'location':case['location'],'angle':angle,'radial':radial,'terrain':{k:manifest[k]['sha256'] for k in ['local-dem','regional-dem']},'method':'sphere-bilinear-chunked-v1'},sort_keys=True).encode()).hexdigest()
                if key not in cache:cache[key]=horizon_chunked(local,regional,case['location'],angle,radial);dump(CACHE,cache)
                geo=cache[key];r['geometry'][mode]=geo;r['evaluations'][mode]=integration.evaluate(paired,geo['horizon']);print('Geometry',case['id'],mode,flush=True)
            r['stress']={str(a):integration.evaluate(paired,r['geometry']['combined']['horizon'],a) for a in [0.,.02,.1,.25]}
            r['comparisons']={mode:{'versus':base,'deltaHours':{k:r['evaluations'][mode]['metrics'][k]-r['evaluations'][base]['metrics'][k] for k in METRICS},'decisionChanged':r['evaluations'][mode]['passes']!=r['evaluations'][base]['passes'],'windowBoundaries':integration.boundary_comparison(r['evaluations'][base]['windows'],r['evaluations'][mode]['windows'])} for mode,base in [('own30','nominal'),('dense5','own30'),('radial','dense5'),('azimuth','dense5'),('combined','dense5')]}
            r['status']='complete';print('Complete',case['id'],r['evaluations']['nominal']['passes'],'->',r['evaluations']['combined']['passes'],flush=True)
        except Exception as exc:r.update(status='unknown',error=str(exc));print('UNKNOWN',case['id'],str(exc),flush=True)
        finally:report['updatedAt']=stamp();dump(OUT,report)
    report['finishedAt']=stamp();report['summary']={'selectedCount':len(report['cases']),'completeCount':sum(c['status']=='complete' for c in report['cases']),'unknownCount':sum(c['status']=='unknown' for c in report['cases']),'unavailableStrataCount':len(report['unavailableStrata'])};dump(OUT,report);print(json.dumps(report['summary']),flush=True)
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--fetch-only',action='store_true');args=parser.parse_args();run(args.fetch_only)
