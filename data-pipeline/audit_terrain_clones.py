"""Sparse, fixed-ID diagnostic of actual official spatially correlated error maps.

Not a probability estimate. The regional DEM remains fixed; local observer ground
and local occluders use the same official field. Re-query the changed observer.
"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
import numpy as np
import requests
import build_dataset as terrain
import rasterio
import audit_case_matrix as matrix
import audit_recommendations as integration

ROOT=terrain.PROJECT
PLAN=ROOT/'docs/science-validation/experiment-plan/terrain-clones.json'
OUT=ROOT/'data/terrain-clone-validation.json'
def run():
    if PLAN.exists():plan=json.loads(PLAN.read_text());interpretation=json.loads((PLAN.parent/'terrain-clones-interpretation.json').read_text())
    else:
        plan={'frozenAt':matrix.stamp(),'cloneIds':['0001','0025','0050','0075','0100'],'points':[{'siteId':'ridge-1','patchId':'e+0-n+0'},{'siteId':'ridge-4','patchId':'e-25-n-25'}],'start':'2027-06-21T12:00:00Z','durationHours':168,'observerHeightM':2,'thresholds':{'maxDarkHours':24,'maxCommGapHours':24,'minJointHours':24},'clearanceDeg':0,'assurance':'exploratory sparse diagnostic','selection':'Fixed clone IDs inherited from frozen main plan; ROI1 center as reference and ROI4 southwest chosen from the previously reported ~10-minute limiting margin. Outcome-informed point selection is explicit and not independent confirmation. No clone outcomes read before this plan.','semantics':{'product':'https://pgda.gsfc.nasa.gov/products/78','readme':'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README','paper':'https://ntrs.nasa.gov/api/citations/20205009660/downloads/Mike%20Barker_%20Paper_%20Improved%20Lola.pdf','section':'Section 3 and Figure 11: observation-filtered minus simulated terrain gives Z error, added to original LDEM to construct a clone. Downloaded official filenames end in _err.tif; near-zero values and GeoTIFF metadata are also checked.','units':'Z metres; planar XY metres; 5 m raster spacing','referenceFrame':'MOON_ME DE421, south polar stereographic; radius 1737400 m','missingData':'Any missing or nonfinite clone field inside nominal valid local terrain makes that clone unknown, never zero. A failed source or point query retains both planned point records as unknown where applicable.','sign':'Add signed official Z error to the original surface; positive raises surface height. Observer and all local horizon samples use that same realization.','spatialCorrelation':'Use complete official raster without reshuffling, independent pixel noise or RMS-to-angle conversion. Preserve joint local ground/occluder field.','observer':'Each clone observer elevation = bilinear original surface + bilinear same error field, then +2 m. Exact changed elevation sent to Horizons for separate 5-minute Sun/Earth predictions.','regionalBoundary':'Only Site01 local errors represented. Outside local tile use fixed regional DEM; no regional covariance is available. Product seam and far-field errors remain unknown.'},'limits':['5 of 100 official realizations, selected by fixed ID: no probabilities, quantiles or confidence coverage.','2 of 18 prior audited locations only: no claim about nine-point whole-footprint worst case.','Same source model and own runner; not independent external validation.','0.5 degree azimuth, refined radial sampling; finite ray/DEM and 5-minute cadence limitations remain.']}
        matrix.dump(PLAN,plan)
    manifest=json.loads((ROOT/'data/source-manifest.json').read_text());base_path=terrain.RAW/manifest['local-dem']['file'];regional_path=terrain.RAW/manifest['regional-dem']['file']
    for key,path in [('local-dem',base_path),('regional-dem',regional_path)]:
        if terrain.sha256(path)!=manifest[key]['sha256']:raise ValueError('Source hash mismatch')
    base=terrain.Raster(base_path);regional=terrain.Raster(regional_path);prior=json.loads((ROOT/'data/recommendation-fine-validation.json').read_text());report={'schemaVersion':1,'startedAt':matrix.stamp(),'plan':plan,'planSha256':terrain.sha256(PLAN),'interpretation':interpretation,'interpretationSha256':terrain.sha256(PLAN.parent/'terrain-clones-interpretation.json'),'priorRejectedRun':'data/terrain-clone-validation-rejected.json','terrainSources':manifest,'runnerSha256':terrain.sha256(Path(__file__)),'sources':[],'cases':[],'attempts':[],'status':'running','limitations':plan['limits']}
    output_cache=ROOT.parent/'tmp'/'terrain-clone-horizons.json';cache=json.loads(output_cache.read_text()) if output_cache.exists() else {}
    for clone_id in plan['cloneIds']:
        filename=f'Site01_final_adj_5mpp_{clone_id}_err.tif';url='https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Clones/'+filename;path=terrain.RAW/filename
        try:
            if not path.exists():
                for attempt in range(3):
                    try:
                        response=requests.get(url,stream=True,headers={'User-Agent':matrix.USER_AGENT},timeout=(20,120));response.raise_for_status();temporary=path.with_suffix('.tif.part')
                        with temporary.open('wb') as f:
                            for part in response.iter_content(1024*1024):f.write(part)
                        if response.headers.get('Content-Length') and temporary.stat().st_size!=int(response.headers['Content-Length']):raise ValueError('Incomplete clone download')
                        temporary.replace(path);break
                    except (requests.RequestException,ValueError) as e:
                        report['attempts'].append({'cloneId':clone_id,'stage':'download','attempt':attempt+1,'error':str(e)})
                        if attempt==2:raise
                        time.sleep(5*2**attempt)
            error=terrain.Raster(path)
            if rasterio.crs.CRS.from_wkt(error.crs_wkt).to_dict()!=rasterio.crs.CRS.from_wkt(base.crs_wkt).to_dict() or error.transform!=base.transform or error.values.shape!=base.values.shape:raise ValueError('Official clone grid/frame does not match local DEM')
            valid=np.isfinite(base.values)
            if base.nodata is not None:valid&=base.values!=base.nodata
            if not np.isfinite(error.values[valid]).all():raise ValueError('Unknown error field inside nominal valid terrain')
            if error.nodata is not None and np.any(error.values[valid]==error.nodata):raise ValueError('Missing error field inside nominal valid terrain')
            delta_values=error.values-base.values
            if np.max(np.abs(delta_values[valid]))>100:raise ValueError('File values inconsistent with metre error-map interpretation; require manual review')
            with rasterio.open(path) as ds:tags=ds.tags()
            source={'cloneId':clone_id,'url':url,'file':filename,'sha256':terrain.sha256(path),'bytes':path.stat().st_size,'tags':tags,'units':'absolute surface metres per official LDEM clone convention','representation':'complete clone surface, never added again','signedDifference':'clone minus nominal, metres','gridMatched':True,'minimumM':float(delta_values[valid].min()),'maximumM':float(delta_values[valid].max()),'meanM':float(delta_values[valid].mean()),'rmsM':float(np.sqrt(np.mean(delta_values[valid]**2))),'medianM':float(np.median(delta_values[valid])),'projectionParameters':rasterio.crs.CRS.from_wkt(error.crs_wkt).to_dict(),'transform':list(error.transform),'shape':list(error.values.shape),'surfaceValueRangeM':[float(error.values[valid].min()),float(error.values[valid].max())]};report['sources'].append(source)
            clone=error
            for point in plan['points']:
                original=next(c for c in prior['cases'] if c['siteId']==point['siteId'] and c['patchId']==point['patchId']);loc=dict(original['location']);x,y=terrain.lonlat_to_xy(loc['lon'],loc['lat']);observer_error=float(clone.sample(x,y)-base.sample(x,y));loc['elevationM']=float(clone.sample(x,y))
                case={'id':f"clone-{clone_id}-{point['siteId']}-{point['patchId']}",'settings':{**plan['thresholds'],'start':plan['start'],'durationHours':168,'clearanceDeg':0,'observerHeightM':2},'location':loc}
                item={'id':case['id'],'cloneId':clone_id,**point,'settings':case['settings'],'location':loc,'observerGroundDeltaM':observer_error,'publishedObserverGroundM':original['location']['elevationM'],'observerGroundDeltaToPublishedM':loc['elevationM']-original['location']['elevationM'],'status':'pending'};report['cases'].append(item)
                try:
                    key_inputs={'location':loc,'observerHeightM':2,'cloneSha':source['sha256'],'localSha':manifest['local-dem']['sha256'],'regionalSha':manifest['regional-dem']['sha256'],'method':'sphere-bilinear-.5deg-.25radial-v1'};key=hashlib.sha256(json.dumps(key_inputs,sort_keys=True).encode()).hexdigest();item['cacheKeyInputs']=key_inputs;item['cacheKeySha256']=key
                    if key not in cache:cache[key]=matrix.horizon_chunked(clone,regional,loc,.5,.25);matrix.dump(output_cache,cache)
                    geometry=cache[key];sun,ss=matrix.fetch(case,'10',report['attempts']);earth,es=matrix.fetch(case,'399',report['attempts']);paired=[{'time':s['time'],'sunAz':s['az'],'sunEl':s['el'],'earthAz':e['az'],'earthEl':e['el']} for s,e in zip(sun,earth)]
                    integration.START=plan['start'];integration.STOP='2027-06-28T12:00:00Z';integration.LIMITS=plan['thresholds'];nominal=original['evaluations']['independent5MinuteFineHorizon']['0.0'];perturbed=integration.evaluate(paired,geometry['horizon'])
                    item.update(status='complete',sources={'sun':ss,'earth':es},geometry=geometry,samples=paired,nominal=nominal,perturbed=perturbed,deltaHours={k:perturbed['metrics'][k]-nominal['metrics'][k] for k in matrix.METRICS},decisionChanged=perturbed['passes']!=nominal['passes'])
                    print('Clone',clone_id,point['siteId'],point['patchId'],'dark',perturbed['metrics']['longestDarkHours'],'passes',perturbed['passes'],flush=True)
                except Exception as e:item.update(status='unknown',error=str(e));print('UNKNOWN',item['id'],str(e),flush=True)
                finally:report['updatedAt']=matrix.stamp();matrix.dump(OUT,report)
        except Exception as e:
            report['sources'].append({'cloneId':clone_id,'url':url,'status':'unknown','error':str(e)})
            for point in plan['points']:report['cases'].append({'cloneId':clone_id,**point,'status':'unknown','error':str(e)})
            matrix.dump(OUT,report);print('UNKNOWN CLONE',clone_id,str(e),flush=True)
    report['status']='complete' if all(c['status']=='complete' for c in report['cases']) else 'partial';report['finishedAt']=matrix.stamp();report['summary']={'expected':10,'complete':sum(c['status']=='complete' for c in report['cases']),'unknown':sum(c['status']!='complete' for c in report['cases']),'decisionChanges':sum(c.get('decisionChanged',False) for c in report['cases'])};matrix.dump(OUT,report);print(json.dumps(report['summary']),flush=True)
if __name__=='__main__':run()
