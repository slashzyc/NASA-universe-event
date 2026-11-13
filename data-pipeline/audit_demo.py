"""Independently audit the seven-day ROI 6 demonstration at finer fidelity.

This never changes the three released UI bundles. It queries the actual observer
coordinates of both the nominal point and the southeast terrain perturbation.
"""
import csv
from datetime import datetime, timezone
import json
import build_dataset as p
import numpy as np
import requests

START = '2027-06-02 06:00'
STOP = '2027-06-09 06:00'
STEP_MINUTES = 5


def fetch(location, target, label):
    parameters = {
        'format': 'json', 'COMMAND': f"'{target}'", 'OBJ_DATA': "'NO'",
        'MAKE_EPHEM': "'YES'", 'EPHEM_TYPE': "'OBSERVER'", 'CENTER': "'coord@301'",
        'COORD_TYPE': "'GEODETIC'",
        'SITE_COORD': f"'{location['lon']:.9f},{location['lat']:.9f},{(location['elevationM'] + 2)/1000:.9f}'",
        'START_TIME': f"'{START}'", 'STOP_TIME': f"'{STOP}'", 'STEP_SIZE': "'5 m'",
        'QUANTITIES': "'4'", 'CSV_FORMAT': "'YES'", 'ANG_FORMAT': "'DEG'",
        'APPARENT': "'AIRLESS'", 'TIME_DIGITS': "'SECONDS'", 'EXTRA_PREC': "'YES'",
    }
    filename = p.OUTPUT / 'raw' / f'validation-ridge-6-{label}-{target}-5min.json'
    if filename.exists():
        raw = json.loads(filename.read_text(encoding='utf-8'))
        assert raw['parameters'] == parameters
    else:
        response = requests.get('https://ssd.jpl.nasa.gov/api/horizons.api', params=parameters,
                                timeout=(20, 120))
        response.raise_for_status()
        raw = {'requestedAt': datetime.now(timezone.utc).isoformat(),
               'url': response.url, 'parameters': parameters, 'response': response.json()}
        if 'error' in raw['response']:
            raise ValueError(raw['response']['error'])
        filename.write_text(json.dumps(raw, indent=2), encoding='utf-8')
    result = raw['response']['result']
    table = result.split('$$SOE')[1].split('$$EOE')[0].strip()
    samples = []
    for row in csv.reader(table.splitlines()):
        stamp = datetime.strptime(row[0].strip(), '%Y-%b-%d %H:%M:%S')
        samples.append({'time': stamp.strftime('%Y-%m-%dT%H:%M:%SZ'),
                        'az': float(row[3]), 'el': float(row[4])})
    assert len(samples) == 2017
    return samples, {'path': 'raw/' + filename.name, 'sha256': p.sha256(filename),
                     'url': raw['url']}


def join(intervals):
    result = []
    for a, b in intervals:
        if b <= a:
            continue
        if result and a <= result[-1][1] + 1e-10:
            result[-1][1] = max(result[-1][1], b)
        else:
            result.append([a, b])
    return result


def interpolate(mask, azimuth):
    return float(np.interp(azimuth % 360, np.linspace(0, 360, len(mask)+1), [*mask, mask[0]]))


def metrics(samples, mask):
    """Independent linear-margin event integration; times are hours from start."""
    epochs = [datetime.fromisoformat(s['time']).timestamp() / 3600 for s in samples]
    t = np.array(epochs) - epochs[0]
    margins = np.array([[s['sunEl'] - interpolate(mask, s['sunAz']),
                         s['earthEl'] - interpolate(mask, s['earthAz'])] for s in samples])
    intervals = {k: [] for k in ['sun', 'earth', 'joint', 'dark', 'commGap']}
    for i in range(len(samples)-1):
        fractions = [0.0, 1.0]
        for j in [0, 1]:
            a, b = margins[i, j], margins[i+1, j]
            if a * b < 0:
                fractions.append(float(-a/(b-a)))
        fractions = sorted(set(fractions))
        for a, b in zip(fractions[:-1], fractions[1:]):
            visible = margins[i] + (margins[i+1]-margins[i]) * ((a+b)/2) > 0
            start, end = float(t[i] + (t[i+1]-t[i])*a), float(t[i] + (t[i+1]-t[i])*b)
            for name, include in [('sun', visible[0]), ('earth', visible[1]),
                                   ('joint', visible[0] and visible[1]),
                                   ('dark', not visible[0]), ('commGap', not visible[1])]:
                if include:
                    intervals[name].append((start, end))
    intervals = {name: join(parts) for name, parts in intervals.items()}
    result = {name+'Hours': sum(b-a for a, b in intervals[name]) for name in ['sun', 'earth', 'joint']}
    result['longestDarkHours'] = max([b-a for a,b in intervals['dark']], default=0)
    result['longestCommGapHours'] = max([b-a for a,b in intervals['commGap']], default=0)
    result['passesDemoConstraints'] = bool(result['longestDarkHours'] <= 24 and
                                           result['longestCommGapHours'] <= 24 and
                                           result['jointHours'] >= 24)
    result['minimumSunMarginDeg'] = float(min(margins[:,0]))
    result['maximumSunMarginDeg'] = float(max(margins[:,0]))
    return result


def run():
    source = p.OUTPUT / 'lunar-sites-june.json'
    bundle = json.loads(source.read_text(encoding='utf-8'))
    site = next(s for s in bundle['sites'] if s['id'] == 'ridge-6')
    patch = next(s for s in site['patches'] if s['dxM'] == 25 and s['dyM'] == -25)
    manifest = json.loads((p.OUTPUT / 'source-manifest.json').read_text(encoding='utf-8'))
    local = p.Raster(p.RAW / manifest['local-dem']['file'])
    regional = p.Raster(p.RAW / manifest['regional-dem']['file'])
    height_error = p.Raster(p.RAW / manifest['height-error']['file'])
    cases = {}
    for label, location in [('center', site), ('southeast', patch)]:
        sun, sun_source = fetch(location, '10', label)
        earth, earth_source = fetch(location, '399', label)
        assert [s['time'] for s in sun] == [e['time'] for e in earth]
        paired = [{'time': s['time'], 'sunAz': s['az'], 'sunEl': s['el'],
                   'earthAz': e['az'], 'earthEl': e['el']} for s, e in zip(sun, earth)]
        fine_horizon, occluders = p.horizon(local, regional, location['lon'], location['lat'],
                                           location['elevationM'], angular_step=0.5, radial_scale=0.25)
        x, y = p.lonlat_to_xy(location['lon'], location['lat'])
        sun_direction_indices = np.array([int(round(s['sunAz'] * 2)) % 720 for s in paired])
        sun_occluder_distance = occluders[sun_direction_indices]
        cases[label] = {
            'location': {key: location[key] for key in ['lat', 'lon', 'elevationM']},
            'sources': {'sun': sun_source, 'earth': earth_source},
            'samples': paired, 'fineHorizon': fine_horizon,
            'fineHorizonOccluderDistanceM': occluders.astype(float).tolist(),
            'sourceHeightRmsErrorM': float(height_error.sample(x, y)),
            'sunDirectionControllingTerrain': {
                'nearestBearingApproximationDeg': 0.25,
                'minimumDistanceM': float(min(sun_occluder_distance)),
                'medianDistanceM': float(np.median(sun_occluder_distance)),
                'maximumDistanceM': float(max(sun_occluder_distance)),
                'fractionOfSamplesWithin100M': float(np.mean(sun_occluder_distance <= 100)),
            },
            'fiveMinuteWithPublishedHorizon': metrics(paired, location['horizon']),
            'fiveMinuteWithFineHorizon': metrics(paired, fine_horizon),
        }
        print(label, cases[label]['fiveMinuteWithFineHorizon'], flush=True)
    baseline_samples = [s for s in site['samples'] if '2027-06-02T06:00:00Z' <= s['time'] <= '2027-06-09T06:00:00Z']
    central = cases['center']['samples']
    displaced = cases['southeast']['samples']
    azimuth_error = {body: max(abs((a[body+'Az'] - b[body+'Az'] + 180)%360-180)
                                 for a,b in zip(central,displaced)) for body in ['sun','earth']}
    elevation_error = {body: max(abs(a[body+'El'] - b[body+'El'])
                                   for a,b in zip(central,displaced)) for body in ['sun','earth']}
    report = {
        'createdAt': datetime.now(timezone.utc).isoformat(), 'schemaVersion': 1,
        'publishedJuneBundleSha256': p.sha256(source), 'siteId': 'ridge-6',
        'start': '2027-06-02T06:00:00Z', 'stop': '2027-06-09T06:00:00Z',
        'durationHours': 168, 'sampleIntervalMinutes': 5, 'observerHeightM': 2,
        'fineHorizonMethod': '0.5-degree bearing bins; radial steps 1.25m to 2km, 5m to 8km, 20m to 250km; same real NASA DEMs',
        'constraints': {'maxDarkHours':24, 'maxCommGapHours':24, 'minJointHours':24, 'clearanceDeg':0},
        'baselineThirtyMinuteCenter': metrics(baseline_samples, site['horizon']),
        'baselineThirtyMinuteSoutheastUsingCentralEphemeris': metrics(baseline_samples, patch['horizon']),
        'fiveMinuteSoutheastUsingCentralEphemerisWithFineHorizon': metrics(central, cases['southeast']['fineHorizon']),
        'centralEphemerisReuseError': {'maximumAzimuthDifferenceDeg': azimuth_error,
                                      'maximumElevationDifferenceDeg': elevation_error},
        'terrainContrast': {
            'separationM': float(np.hypot(25, 25)),
            'southeastSurfaceLowerThanCenterM': site['elevationM'] - patch['elevationM'],
            'explanation': 'At the lower southeast point, nearby terrain frequently sets the solar-direction '
                           'horizon. This is sensitivity in the published DEM model, not a certified surface hazard.'},
        'cases': cases,
        'limitations': ['Uses the same source terrain, so it tests numerical and ephemeris approximations, not independent ground truth.',
                        'Five-minute crossing times still use linear interpolation of sampled margins.',
                        'A two-location audit does not validate all nine patch ephemerides.',
                        'Partial Sun disc, vehicle hazards, terrain measurement error and real communication link budgets remain outside scope.'],
    }
    out = p.OUTPUT / 'fine-ephemeris-validation.json'
    out.write_text(json.dumps(report, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    print('Reuse errors:', json.dumps(report['centralEphemerisReuseError']))
    print('Saved', out, out.stat().st_size, 'bytes', flush=True)


if __name__ == '__main__':
    run()
