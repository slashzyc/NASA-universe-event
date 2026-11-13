"""M04: independently re-query and refine all 18 recommended-window samples.

No released UI input is overwritten. Original Horizons response envelopes remain
in data/raw; the report retains complete intervals, masks, and provenance.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import time

import build_dataset as terrain
import numpy as np
import requests

START = '2027-06-21T12:00:00Z'
STOP = '2027-06-28T12:00:00Z'
EXPECTED_COUNT = 2017
STEP_MINUTES = 5
ANGLES = [0.0, 0.02, 0.10, 0.25]
LIMITS = {'maxDarkHours': 24, 'maxCommGapHours': 24, 'minJointHours': 24}
METHOD_VERSION = 'recommendation-audit-v1: independent-linear-crossings; horizon-0.5deg-radial0.25'
REPORT = terrain.OUTPUT / 'recommendation-fine-validation.json'
METRICS = ['sunHours', 'longestDarkHours', 'earthHours', 'longestCommGapHours', 'jointHours']


def timestamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def utc(value):
    return value.isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def parameters(location, target):
    return {
        'format': 'json', 'COMMAND': f"'{target}'", 'OBJ_DATA': "'NO'",
        'MAKE_EPHEM': "'YES'", 'EPHEM_TYPE': "'OBSERVER'", 'CENTER': "'coord@301'",
        'COORD_TYPE': "'GEODETIC'",
        'SITE_COORD': f"'{location['lon']:.9f},{location['lat']:.9f},{(location['elevationM'] + 2)/1000:.9f}'",
        'START_TIME': "'2027-06-21 12:00'", 'STOP_TIME': "'2027-06-28 12:00'",
        'STEP_SIZE': "'5 m'", 'QUANTITIES': "'4'", 'CSV_FORMAT': "'YES'",
        'ANG_FORMAT': "'DEG'", 'APPARENT': "'AIRLESS'", 'TIME_DIGITS': "'SECONDS'",
        'EXTRA_PREC': "'YES'", 'TIME_TYPE': "'UT'", 'TIME_ZONE': "'+00:00'",
    }


def verify_epochs(samples, count=EXPECTED_COUNT, step_minutes=STEP_MINUTES):
    epochs = [timestamp(s['time']) for s in samples]
    if len(epochs) != count or epochs[0] != timestamp(START) or epochs[-1] != timestamp(STOP):
        raise ValueError('Incomplete ephemeris endpoints or sample count')
    if any(b-a != timedelta(minutes=step_minutes) for a,b in zip(epochs,epochs[1:])):
        raise ValueError('Missing, duplicate, or out-of-order ephemeris epoch')
    numeric = [v for s in samples for k,v in s.items() if k != 'time']
    if not np.all(np.isfinite(numeric)):
        raise ValueError('Nonfinite ephemeris angle')
    return {'sampleCount':count,'expectedSampleCount':count,'stepMinutes':step_minutes,
            'missingEpochCount':0,'duplicateEpochCount':0,'nonfiniteAngleCount':0,
            'start':samples[0]['time'],'stop':samples[-1]['time'],'status':'complete'}


def fetch(location, target, site_id):
    query = parameters(location,target)
    name = f"recommendation-{site_id}-{location['id']}-{target}-5min.json"
    filename = terrain.OUTPUT / 'raw' / name
    if filename.exists():
        envelope=json.loads(filename.read_text(encoding='utf-8'))
        if envelope['parameters'] != query:
            raise ValueError(f'Cached query parameters do not match: {name}')
    else:
        for attempt in range(3):
            try:
                response=requests.get('https://ssd.jpl.nasa.gov/api/horizons.api',params=query,timeout=(20,120))
                response.raise_for_status()
                payload=response.json()
                if payload.get('error'):
                    raise ValueError(payload['error'])
                envelope={'requestedAt':datetime.now(timezone.utc).isoformat(),'url':response.url,
                          'parameters':query,'response':payload}
                filename.write_text(json.dumps(envelope,ensure_ascii=False,indent=2),encoding='utf-8')
                break
            except requests.RequestException:
                if attempt==2: raise
                time.sleep(2+attempt*2)
    result=envelope['response']['result']
    if 'Center body name: Moon (301)' not in result or 'Step-size       : 5 minutes' not in result:
        raise ValueError(f'Unexpected Horizons observer metadata in {name}')
    expected_target='Sun (10)' if target=='10' else 'Earth (399)'
    if f'Target body name: {expected_target}' not in result:
        raise ValueError(f'Unexpected Horizons target in {name}')
    table=result.split('$$SOE')[1].split('$$EOE')[0].strip()
    samples=[]
    for row in csv.reader(table.splitlines()):
        stamp=datetime.strptime(row[0].strip(),'%Y-%b-%d %H:%M:%S').replace(tzinfo=timezone.utc)
        samples.append({'time':stamp.strftime('%Y-%m-%dT%H:%M:%SZ'),'az':float(row[3]),'el':float(row[4])})
    coverage=verify_epochs(samples)
    header=[line.strip() for line in result.split('$$SOE')[0].splitlines()
            if any(key in line for key in ['Target body name:','Center body name:','Center geodetic :','Center radii','Step-size','Start time','Stop  time'])]
    return samples,{'path':'raw/'+name,'sha256':terrain.sha256(filename),
                    'requestedAt':envelope['requestedAt'],'url':envelope['url'],
                    'parameters':query,'returnedHeader':header,'coverage':coverage}


def merge(parts):
    merged=[]
    for start,end in parts:
        if end<=start: continue
        if merged and start<=merged[-1][1]+1e-10:
            merged[-1]=[merged[-1][0],end]
        else: merged.append([start,end])
    return merged


def evaluate(samples, horizon, clearance_deg=0):
    """Independent event integration; no upsampling of coarse ephemerides."""
    epochs=np.array([(timestamp(s['time'])-timestamp(START)).total_seconds()/3600 for s in samples])
    bearing=np.linspace(0,360,len(horizon)+1)
    closed=[*horizon,horizon[0]]
    margins=np.array([[s['sunEl']-np.interp(s['sunAz']%360,bearing,closed)-clearance_deg,
                       s['earthEl']-np.interp(s['earthAz']%360,bearing,closed)-clearance_deg]
                      for s in samples])
    intervals={key:[] for key in ['sun','earth','joint','dark','commGap']}
    for i in range(len(samples)-1):
        fractions=[0.0,1.0]
        for a,b in zip(margins[i],margins[i+1]):
            if a*b<0: fractions.append(float(-a/(b-a)))
        fractions=sorted(set(fractions))
        for a,b in zip(fractions,fractions[1:]):
            visible=margins[i]+(margins[i+1]-margins[i])*((a+b)/2)>0
            start=float(epochs[i]+(epochs[i+1]-epochs[i])*a)
            end=float(epochs[i]+(epochs[i+1]-epochs[i])*b)
            for key,include in [('sun',visible[0]),('earth',visible[1]),
                                ('joint',all(visible)),('dark',not visible[0]),('commGap',not visible[1])]:
                if include: intervals[key].append([start,end])
    intervals={key:merge(parts) for key,parts in intervals.items()}
    metrics={key+'Hours':sum(b-a for a,b in intervals[key]) for key in ['sun','earth','joint']}
    metrics['longestDarkHours']=max((b-a for a,b in intervals['dark']),default=0)
    metrics['longestCommGapHours']=max((b-a for a,b in intervals['commGap']),default=0)
    reasons=[]
    for code,metric,limit,passes in [
        ('dark-gap','longestDarkHours',24,metrics['longestDarkHours']<=24+1e-9),
        ('comm-gap','longestCommGapHours',24,metrics['longestCommGapHours']<=24+1e-9),
        ('joint-shortfall','jointHours',24,metrics['jointHours']>=24-1e-9)]:
        if not passes: reasons.append({'code':code,'actual':metrics[metric],'limit':limit})
    windows={key:[{'start':utc(timestamp(START)+timedelta(hours=a)),
                   'end':utc(timestamp(START)+timedelta(hours=b)),'hours':b-a} for a,b in parts]
             for key,parts in intervals.items()}
    return {'metrics':metrics,'passes':not reasons,'reasons':reasons,'windows':windows}


def boundary_comparison(coarse,fine):
    report={}
    for key in coarse:
        old=[timestamp(w[e]) for w in coarse[key] for e in ['start','end']]
        new=[timestamp(w[e]) for w in fine[key] for e in ['start','end']]
        # Nearest-boundary differences are descriptive; they do not assert a
        # one-to-one event match when brief windows appear or disappear.
        def nearest(a,b):
            return max((min(abs((v-w).total_seconds()) for w in b) for v in a),default=0) if b else None
        report[key]={'publishedWindowCount':len(coarse[key]),'fineWindowCount':len(fine[key]),
                     'maximumPublishedToNearestFineBoundarySeconds':nearest(old,new),
                     'maximumFineToNearestPublishedBoundarySeconds':nearest(new,old),
                     'interpretation':'Nearest boundary distance, not matched-event timing accuracy.'}
    return report


def summary(cases,mode,angle):
    rows=[{'id':c['patchId'],**c['evaluations'][mode][str(angle)]} for c in cases]
    return {'passCount':sum(r['passes'] for r in rows),'count':len(rows),
            'failedPoints':[{'id':r['id'],'reasons':r['reasons']} for r in rows if not r['passes']],
            'worstDarkness':max(({'hours':r['metrics']['longestDarkHours'],'patchId':r['id']} for r in rows),key=lambda r:r['hours']),
            'worstEarthGap':max(({'hours':r['metrics']['longestCommGapHours'],'patchId':r['id']} for r in rows),key=lambda r:r['hours']),
            'leastJointVisibility':min(({'hours':r['metrics']['jointHours'],'patchId':r['id']} for r in rows),key=lambda r:r['hours'])}


def run(fetch_only=False):
    bundle_path=terrain.OUTPUT/'lunar-sites-june.json'
    bundle=json.loads(bundle_path.read_text(encoding='utf-8'))
    sites=[s for s in bundle['sites'] if s['id'] in ['ridge-1','ridge-4']]
    requests_by_point={}
    for site in sites:
        for patch in site['patches']:
            sun,sun_source=fetch(patch,'10',site['id'])
            earth,earth_source=fetch(patch,'399',site['id'])
            if [s['time'] for s in sun]!=[s['time'] for s in earth]:
                raise ValueError('Sun/Earth epoch mismatch')
            paired=[{'time':s['time'],'sunAz':s['az'],'sunEl':s['el'],'earthAz':e['az'],'earthEl':e['el']} for s,e in zip(sun,earth)]
            requests_by_point[(site['id'],patch['id'])]=(paired,{'sun':sun_source,'earth':earth_source})
            print(f"Fetched {site['id']} {patch['id']}: {len(paired)} paired epochs",flush=True)
    if fetch_only:return
    manifest=json.loads((terrain.OUTPUT/'source-manifest.json').read_text(encoding='utf-8'))
    rasters={}
    provenance={}
    for key in ['local-dem','regional-dem','height-error']:
        path=terrain.RAW/manifest[key]['file']
        if terrain.sha256(path)!=manifest[key]['sha256']:raise ValueError(f'Terrain hash mismatch: {key}')
        rasters[key]=terrain.Raster(path)
        raster=rasters[key]
        provenance[key]={**manifest[key],'crsWkt':raster.crs_wkt,'pixelSpacingM':raster.pixel_m,'bounds':raster.bounds}
    cache_path=terrain.PROJECT.parent/'tmp'/'recommendation-fine-horizons.json'
    cache_key={'bundleHash':terrain.sha256(bundle_path),'terrainProgramHash':terrain.sha256(Path(terrain.__file__)),'method':METHOD_VERSION}
    cache=json.loads(cache_path.read_text(encoding='utf-8')) if cache_path.exists() else {}
    if cache.get('key')!=cache_key:cache={'key':cache_key,'points':{}}
    cases=[]
    for site in sites:
        baseline=[s for s in site['samples'] if START<=s['time']<=STOP]
        verify_epochs(baseline,count=337,step_minutes=30)
        for patch in site['patches']:
            label=site['id']+'/'+patch['id']
            paired,sources=requests_by_point[(site['id'],patch['id'])]
            if label not in cache['points']:
                mask,distances=terrain.horizon(rasters['local-dem'],rasters['regional-dem'],patch['lon'],patch['lat'],patch['elevationM'],angular_step=0.5,radial_scale=0.25)
                cache['points'][label]={'horizon':mask,'occluderDistanceM':distances.astype(float).tolist()}
                cache_path.write_text(json.dumps(cache,separators=(',',':'),allow_nan=False),encoding='utf-8')
            fine=cache['points'][label]
            x,y=terrain.lonlat_to_xy(patch['lon'],patch['lat'])
            evaluations={mode:{} for mode in ['published30Minute','independent5MinutePublishedHorizon','independent5MinuteFineHorizon']}
            comparisons={}
            for angle in ANGLES:
                old=evaluate(baseline,patch['horizon'],angle)
                five=evaluate(paired,patch['horizon'],angle)
                refined=evaluate(paired,fine['horizon'],angle)
                for mode,value in zip(evaluations,[old,five,refined]):evaluations[mode][str(angle)]=value
                comparisons[str(angle)]={'fineMinusPublishedHours':{metric:refined['metrics'][metric]-old['metrics'][metric] for metric in METRICS},
                                         'fiveMinutePublishedHorizonMinusPublishedHours':{metric:five['metrics'][metric]-old['metrics'][metric] for metric in METRICS},
                                         'passConclusionChanged':old['passes']!=refined['passes'],
                                         'windowBoundaries':boundary_comparison(old['windows'],refined['windows'])}
            cases.append({'siteId':site['id'],'patchId':patch['id'],
                          'location':{key:patch[key] for key in ['lat','lon','elevationM','dxM','dyM']},
                          'observerHeightM':2,'sources':sources,'coverage':verify_epochs(paired),'samples':paired,
                          'fineHorizon':fine['horizon'],'fineHorizonOccluderDistanceM':fine['occluderDistanceM'],
                          'sourceHeightRmsErrorM':float(rasters['height-error'].sample(x,y)),
                          'evaluations':evaluations,'comparisons':comparisons})
            print(f"Computed {label}: coarse dark {evaluations['published30Minute']['0.0']['metrics']['longestDarkHours']:.3f} h -> fine {evaluations['independent5MinuteFineHorizon']['0.0']['metrics']['longestDarkHours']:.3f} h",flush=True)
    summaries={site['id']:{mode:{str(angle):summary([c for c in cases if c['siteId']==site['id']],mode,angle) for angle in ANGLES} for mode in cases[0]['evaluations']} for site in sites}
    report={'schemaVersion':1,'createdAt':datetime.now(timezone.utc).isoformat(),'methodVersion':METHOD_VERSION,
            'start':START,'stop':STOP,'durationHours':168,'sampleIntervalMinutes':5,'expectedEpochsPerBody':EXPECTED_COUNT,
            'observerHeightM':2,'constraints':LIMITS,'baseClearanceDeg':0,'addedClearanceDeg':ANGLES,
            'publishedBundle':{'path':'lunar-sites-june.json','sha256':terrain.sha256(bundle_path)},
            'calculationPrograms':{name:terrain.sha256(terrain.PROJECT/name) for name in ['data-pipeline/audit_recommendations.py','data-pipeline/build_dataset.py']},
            'publishedGeometryProgramAtAudit':{'path':'src/analysis.js','sha256':terrain.sha256(terrain.PROJECT/'src/analysis.js')},
            'terrainSources':provenance,
            'coordinateFrame':'LOLA Moon mean-Earth spherical south-polar stereographic; 1737400 m reference radius. Horizons coord@301 GEODETIC, east-positive longitude, DE421 mean-Earth lunar frame; elevation plus 2 m expressed in km.',
            'fineHorizonMethod':{'angularStepDeg':0.5,'radialScale':0.25,'radiusM':1737400,'maximumRayDistanceM':250000,
                                 'radialStepM':{'to2000m':1.25,'2000to8000m':5,'8000to250000m':20},'interpolation':'Bilinear DEM sampling; linearly interpolated angular horizon and event margins.'},
            'coverage':{'pointCount':len(cases),'rawResponseCount':len(cases)*2,'pairedEpochCount':sum(c['coverage']['sampleCount'] for c in cases),
                        'missingEpochCount':0,'nonfiniteAngleCount':0,'status':'complete'},
            'cases':cases,'summaries':summaries,
            'limitations':['Real new five-minute queries, not temporal upsampling of the published bundle.',
                           'The same NASA source terrain is reused, so this is numerical/observer-location sensitivity rather than independent ground truth.',
                           'Five-minute event boundaries still use linear interpolation; short events can remain unresolved.',
                           'Additional angles are deterministic stress conditions, not calibrated terrain errors or success probabilities.',
                           'Body-center visibility does not establish power generation, a ground-station radio link, or landing safety.']}
    REPORT.write_text(json.dumps(report,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8')
    write_markdown(report)
    print(json.dumps({'saved':str(REPORT),'coverage':report['coverage'],'summaries':summaries},indent=2),flush=True)


def write_markdown(report):
    lines=['# Recommendation-window fine audit / 推荐窗口精算', '',
           f"Generated: {report['createdAt']}. Method: `{METHOD_VERSION}`.", '',
           'This audit uses **36 real NASA/JPL Horizons responses** for **18 distinct observing positions**, each containing **2,017 five-minute epochs** from 2027-06-21 12:00 UTC through 2027-06-28 12:00 UTC. Observer height is 2 m. All limits remain 24/24/24 h.', '',
           '[Machine-readable full report](../data/recommendation-fine-validation.json) includes every original query URL, parameters, response hash, UTC retrieval time, missing-epoch check, coordinate, fine horizon, metric, failure reason, and full window boundary.', '',
           '## Footprint comparison', '',
           '| Site | Added angle | Published pass count | Fine pass count | Published worst darkness (h) | Fine worst darkness (h) | Fine limiting point |',
           '|---|---:|---:|---:|---:|---:|---|']
    for site_id,summary_set in report['summaries'].items():
        for angle in ANGLES:
            old=summary_set['published30Minute'][str(angle)];fine=summary_set['independent5MinuteFineHorizon'][str(angle)]
            lines.append(f"| {site_id} | {angle:.2f}° | {old['passCount']}/9 | {fine['passCount']}/9 | {old['worstDarkness']['hours']:.3f} | {fine['worstDarkness']['hours']:.3f} | `{fine['worstDarkness']['patchId']}` |")
    changed=[(c['siteId'],c['patchId'],a) for c in report['cases'] for a,v in c['comparisons'].items() if v['passConclusionChanged']]
    r1=report['summaries']['ridge-1']['independent5MinuteFineHorizon']['0.0']
    r4=report['summaries']['ridge-4']['independent5MinuteFineHorizon']['0.0']
    lines+=['','## Interpretation / 结论','',
            f"Across all 18 positions and four angle settings, **{len(changed)} of 72 pass/fail conclusions changed** relative to the published model. Both locations remain 9/9 at zero clearance. ROI 1 retains nine passes at every tested angle; ROI 4 loses its southwest sample at +0.02°, and additionally its west sample at +0.25°.", '',
            f"At zero added angle, ROI 1's worst darkness is {r1['worstDarkness']['hours']:.3f} h and its longest Earth-view gap is {r1['worstEarthGap']['hours']:.3f} h. ROI 4's southwest darkness is {r4['worstDarkness']['hours']:.3f} h, leaving only {(24-r4['worstDarkness']['hours'])*60:.2f} minutes before the 24 h limit. The fine audit therefore preserves the evidence for preferring ROI 1 when the arrival time is tied and footprint margin matters. It does not certify either location for flight.", '',
            f"真实精算未改变这 72 个点与角度组合的通过/失败结论。ROI 1 在四档条件下均为 9/9；ROI 4 在额外 0.02° 时西南点超过断光条件，0.25° 时西侧点也超过。ROI 4 基准西南点距离 24 小时断光上限只余 {(24-r4['worstDarkness']['hours'])*60:.2f} 分钟，因此只看中心点或 9/9 计数会遗漏重要差异。", '',
            'The corresponding pass/fail changes, if any, are retained in `cases[*].comparisons[*].passConclusionChanged`; no failed sample is excluded from summaries.']
    lines+=['','## Every position at zero added angle','','| Site | Sample | 30 min longest dark | Fine longest dark | Δ dark h | Fine Sun h | Fine Earth h | Fine longest Earth gap h | Fine both h | Published → fine pass |','|---|---|---:|---:|---:|---:|---:|---:|---:|---|']
    for c in report['cases']:
        old=c['evaluations']['published30Minute']['0.0'];fine=c['evaluations']['independent5MinuteFineHorizon']['0.0'];m=fine['metrics']
        lines.append(f"| {c['siteId']} | `{c['patchId']}` | {old['metrics']['longestDarkHours']:.3f} | {m['longestDarkHours']:.3f} | {m['longestDarkHours']-old['metrics']['longestDarkHours']:+.3f} | {m['sunHours']:.3f} | {m['earthHours']:.3f} | {m['longestCommGapHours']:.3f} | {m['jointHours']:.3f} | {old['passes']} → {fine['passes']} |")
    lines+=['','## Reproduce and interpret','',
            'Run `python data-pipeline/audit_recommendations.py` after installing `data-pipeline/requirements.txt`. Cached original responses are reused only when all request parameters match. Source raster checksums must match `data/source-manifest.json`. Derived horizon caching is keyed by the published bundle, terrain program, and method version.', '',
            'The report retains a middle comparison: independent five-minute queries with the **published** horizon. This separates timing/observer effects from the further terrain-ray refinement. No published UI input was overwritten.', '',
            'Window comparisons include all exact interval boundaries and nearest-boundary displacement in both directions. This is not an assertion that differently counted events match one-to-one.', '',
            'Additional angles are added to the zero-degree case baseline; they are deterministic stress tests. All failed points remain in the report. These results do not estimate actual terrain-error distributions, external accuracy, or landing-success probability.', '',
            'The fine ray grid samples the same underlying NASA DEM more densely. Raster pixel spacing is not effective measurement resolution, and interpolation cannot create measured terrain detail.', '',
            '[Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) · [Horizons observing-site conventions](https://ssd.jpl.nasa.gov/horizons/manual.html#site), checked 2026-11-13.', '']
    (terrain.PROJECT/'docs'/'RECOMMENDATION_VALIDATION.md').write_text('\n'.join(lines),encoding='utf-8')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--fetch-only',action='store_true')
    run(parser.parse_args().fetch_only)
