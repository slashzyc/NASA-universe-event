"""Fresh full-array ray recomputation of the adverse clone, without audit cache."""
import json
import math
from pathlib import Path
import build_dataset as terrain
import audit_recommendations as integration
import audit_case_matrix as matrix
import numpy as np
ROOT=terrain.PROJECT
prior=json.loads((ROOT/'data/recommendation-fine-validation.json').read_text())
run=json.loads((ROOT/'data/terrain-clone-validation.json').read_text())
original=next(c for c in prior['cases'] if c['siteId']=='ridge-4' and c['patchId']=='e-25-n-25')
case=next(c for c in run['cases'] if c['cloneId']=='0025' and c['siteId']=='ridge-4')
source=next(s for s in run['sources'] if s['cloneId']=='0025')
base_source=prior['terrainSources']['local-dem'];regional_source=prior['terrainSources']['regional-dem']
assert terrain.sha256(terrain.RAW/base_source['file'])==base_source['sha256']
assert terrain.sha256(terrain.RAW/regional_source['file'])==regional_source['sha256']
assert terrain.sha256(terrain.RAW/source['file'])==source['sha256']
base=terrain.Raster(terrain.RAW/base_source['file']);clone=terrain.Raster(terrain.RAW/source['file']);regional=terrain.Raster(terrain.RAW/regional_source['file']);loc=case['location'];x,y=terrain.lonlat_to_xy(loc['lon'],loc['lat'])
ground=float(clone.sample(x,y));assert abs(ground-loc['elevationM'])<1e-9
fresh,distances=terrain.horizon(clone,regional,loc['lon'],loc['lat'],ground,angular_step=.5,radial_scale=.25)
assert np.max(np.abs(np.array(fresh)-case['geometry']['horizon']))<1e-9
integration.START=run['plan']['start'];integration.STOP='2027-06-28T12:00:00Z';integration.LIMITS=run['plan']['thresholds'];result=integration.evaluate(case['samples'],fresh)
assert abs(result['metrics']['longestDarkHours']-case['perturbed']['metrics']['longestDarkHours'])<1e-9
delta=np.array(fresh)-original['fineHorizon'];order=np.argsort(-np.abs(delta));field=clone.values-base.values
longest=max(result['windows']['dark'],key=lambda w:w['hours']);boundaries={}
for label in ['start','end']:
    target=integration.timestamp(longest[label]);i=min(range(len(case['samples'])),key=lambda j:abs((integration.timestamp(case['samples'][j]['time'])-target).total_seconds()));details=[]
    for s in case['samples'][max(0,i-2):min(len(case['samples']),i+3)]:
        bearing=np.linspace(0,360,len(fresh)+1);h=float(np.interp(s['sunAz']%360,bearing,[*fresh,fresh[0]]));old=float(np.interp(s['sunAz']%360,bearing,[*original['fineHorizon'],original['fineHorizon'][0]]));details.append({'time':s['time'],'sunAzDeg':s['sunAz'],'sunElevationDeg':s['sunEl'],'cloneHorizonDeg':h,'nominalHorizonDeg':old,'cloneMarginDeg':s['sunEl']-h,'nominalTerrainMarginDegUsingCloneObserver':s['sunEl']-old})
    boundaries[label]={'interpolatedBoundary':longest[label],'samples':details}
raw=[]
for body,s in case['sources'].items():
    p=ROOT/s['path'];assert terrain.sha256(p)==s['sha256'];env=json.loads(p.read_text());assert env['parameters']==s['parameters'];assert env['parameters']['SITE_COORD']==f"'{loc['lon']:.9f},{loc['lat']:.9f},{(ground+2)/1000:.9f}'";raw.append({'body':body,'path':s['path'],'sha256':s['sha256'],'parameters':s['parameters'],'sampleCount':s['count']})
report={'checkedAt':matrix.stamp(),'scope':'One adverse local clone at ROI4 southwest; no full-nine-point or regional error conclusion.','method':'Fresh original build_dataset.horizon full-array implementation, no chunk/cache path; separate repeated interval calculation. Production JavaScript independently tests the retained geometry. Same source physics, not external validation.','sameOriginalLocalSource':base_source,'sameOriginalRegionalSource':regional_source,'cloneSource':source,'sameGrid':clone.transform==base.transform and clone.values.shape==base.values.shape,'cloneMinusBaseM':{'minimum':float(np.nanmin(field)),'median':float(np.nanmedian(field)),'rms':float(np.sqrt(np.nanmean(field**2))),'maximum':float(np.nanmax(field))},'observer':{'longitude':loc['lon'],'latitude':loc['lat'],'nominalDEMGroundM':float(base.sample(x,y)),'publishedRoundedGroundM':original['location']['elevationM'],'cloneGroundM':ground,'differenceFromNominalDEM_M':ground-float(base.sample(x,y)),'heightAboveCloneGroundM':2,'horizonsHeightAbove1737400mReferenceKm':(ground+2)/1000},'freshVersusCachedMaximumHorizonDeltaDeg':float(np.max(np.abs(np.array(fresh)-case['geometry']['horizon']))),'largestChangedBearings':[{'azimuthDeg':float(i*.5),'nominalHorizonDeg':original['fineHorizon'][i],'cloneHorizonDeg':fresh[i],'differenceDeg':float(delta[i]),'nominalOccluderDistanceM':original['fineHorizonOccluderDistanceM'][i],'cloneOccluderDistanceM':float(distances[i])} for i in order[:12]],'nominal':original['evaluations']['independent5MinuteFineHorizon']['0.0'],'fresh':result,'longestDarkInterval':longest,'boundaryEvidence':boundaries,'rawResponseChecks':raw,'status':'reproduced','cacheKeyAudit':'Primary cache includes full location including clone ground, clone SHA, original local and regional SHA, fixed 2m/.5deg/.25radial method. This check does not read the horizon cache.'}
matrix.dump(ROOT/'data/terrain-clone-outlier-recheck.json',report);print(json.dumps({'status':report['status'],'darkHours':longest['hours'],'observerGroundDeltaM':report['observer']['differenceFromNominalDEM_M'],'maximumHorizonIncreaseDeg':float(delta.max()),'maximumHorizonDecreaseDeg':float(delta.min())}),flush=True)
