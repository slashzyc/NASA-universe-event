"""Rebuild the published lunar terrain/ephemeris bundle from primary sources.

Run from any directory: python data-pipeline/build_dataset.py
Raw NASA rasters are cached outside the deployable project in research-data/.
No stochastic, fabricated, or image-derived elevations are used.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import sys
import tarfile

LOCAL_DEPS = Path(__file__).parent / '.deps'
if LOCAL_DEPS.exists():
    sys.path.insert(0, str(LOCAL_DEPS))

import numpy as np
import rasterio
import requests
import shapefile

PROJECT = Path(__file__).resolve().parents[1]
RAW = PROJECT.parent / 'research-data'
OUTPUT = PROJECT / 'data'
RADIUS_M = 1737400.0
OBSERVER_HEIGHT_M = 2.0
START = '2026-12-01'
STOP = '2027-01-01'
STEP = '30 m'
PGDA = 'https://pgda.gsfc.nasa.gov/data/'
FILES = {
    'local-dem': PGDA + 'LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif',
    'height-error': PGDA + 'LOLA_5mpp/Site01/Site01_final_adj_5mpp_toterr.tif',
    'slope': PGDA + 'LOLA_5mpp/Site01/Site01_final_adj_5mpp_slp.tif',
    'slope-error': PGDA + 'LOLA_5mpp/Site01/Site01_final_adj_5mpp_slperr.tif',
    'regional-dem': PGDA + 'LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF',
    'regions': PGDA + 'LOLA_5mpp/Site01/Site01_ROIs.tgz',
}


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def download(item):
    key, url = item
    destination = RAW / url.rsplit('/', 1)[-1]
    if not destination.exists():
        print(f'Downloading {key}', flush=True)
        with requests.get(url, stream=True, timeout=(20, 120)) as response:
            response.raise_for_status()
            temporary = destination.with_suffix(destination.suffix + '.part')
            with temporary.open('wb') as stream:
                for chunk in response.iter_content(1024 * 1024):
                    stream.write(chunk)
            expected = response.headers.get('Content-Length')
            if expected is not None and temporary.stat().st_size != int(expected):
                raise ValueError(f'Incomplete download: {url}')
            temporary.replace(destination)
    return key, {'url': url, 'file': destination.name, 'bytes': destination.stat().st_size,
                 'sha256': sha256(destination)}


def xy_to_lonlat(x, y):
    """Inverse spherical south-polar stereographic, scale factor 1 at pole."""
    rho = np.hypot(x, y)
    lat = -np.pi / 2 + 2 * np.arctan(rho / (2 * RADIUS_M))
    lon = np.arctan2(x, y)
    return np.rad2deg(lon) % 360, np.rad2deg(lat)


def lonlat_to_xy(lon, lat):
    rho = 2 * RADIUS_M * np.tan((np.deg2rad(lat) + np.pi / 2) / 2)
    return rho * np.sin(np.deg2rad(lon)), rho * np.cos(np.deg2rad(lon))


def destination(lon, lat, bearing, distance):
    """Spherical forward geodesic. Bearing is clockwise from geographic north."""
    lon, lat, bearing = np.deg2rad(lon), np.deg2rad(lat), np.deg2rad(bearing)
    delta = np.asarray(distance) / RADIUS_M
    end_lat = np.arcsin(np.sin(lat) * np.cos(delta) +
                        np.cos(lat) * np.sin(delta) * np.cos(bearing))
    end_lon = lon + np.arctan2(np.sin(bearing) * np.sin(delta) * np.cos(lat),
                              np.cos(delta) - np.sin(lat) * np.sin(end_lat))
    return np.rad2deg(end_lon) % 360, np.rad2deg(end_lat)


class Raster:
    def __init__(self, filename):
        with rasterio.open(filename) as src:
            self.values = src.read(1)
            self.transform = src.transform
            self.width, self.height = src.width, src.height
            self.pixel_m = abs(src.transform.a)
            self.crs_wkt = src.crs.to_wkt()
            self.bounds = list(src.bounds)
            self.nodata = src.nodata

    def sample(self, x, y):
        """Bilinear sampling at pixel centers; outside/invalid pixels become NaN."""
        col = (np.asarray(x) - self.transform.c) / self.transform.a - 0.5
        row = (np.asarray(y) - self.transform.f) / self.transform.e - 0.5
        col, row = np.broadcast_arrays(col, row)
        valid = (col >= 0) & (row >= 0) & (col < self.width - 1) & (row < self.height - 1)
        ci = np.floor(np.clip(col, 0, self.width - 2)).astype(np.int32)
        ri = np.floor(np.clip(row, 0, self.height - 2)).astype(np.int32)
        fc, fr = col - ci, row - ri
        corners = [self.values[ri, ci], self.values[ri, ci + 1],
                   self.values[ri + 1, ci], self.values[ri + 1, ci + 1]]
        if self.nodata is not None and np.isfinite(self.nodata):
            for corner in corners:
                valid &= corner != self.nodata
        z = (corners[0] * (1-fc) * (1-fr) + corners[1] * fc * (1-fr) +
             corners[2] * (1-fc) * fr + corners[3] * fc * fr)
        return np.where(valid, z, np.nan)


def combined_elevation(local, regional, x, y):
    close = local.sample(x, y)
    far = regional.sample(x, y)
    result = np.where(np.isfinite(close), close, far)
    if not np.all(np.isfinite(result)):
        raise ValueError('Terrain sampling extends outside available DEM coverage')
    return result


def horizon(local, regional, lon, lat, elevation, angular_step=1.0, radial_scale=0.5):
    """Terrain horizon with full spherical curvature, 1 degree azimuth bins.

    Published rays use 2.5 m radial steps to 2 km, 10 m to 8 km, and 40 m to 250 km.
    A finite ray/DEM grid can miss subpixel obstacles. This is a regional
    screening horizon, never a vehicle-scale landing hazard certification.
    """
    distance = np.concatenate([np.arange(5. * radial_scale, 2000., 5. * radial_scale),
                               np.arange(2000., 8000., 20. * radial_scale),
                               np.arange(8000., 250000. + 1, 80. * radial_scale)])
    bearing = np.arange(0., 360., angular_step)[:, None]
    ray_lon, ray_lat = destination(lon, lat, bearing, distance[None, :])
    x, y = lonlat_to_xy(ray_lon, ray_lat)
    z = combined_elevation(local, regional, x, y)
    delta = distance / RADIUS_M
    horizontal = (RADIUS_M + z) * np.sin(delta)
    vertical = (RADIUS_M + z) * np.cos(delta) - (RADIUS_M + elevation + OBSERVER_HEIGHT_M)
    angles = np.rad2deg(np.arctan2(vertical, horizontal))
    maxima = angles.max(axis=1)
    return np.round(maxima, 5).tolist(), distance[angles.argmax(axis=1)]


def query_horizons(site, target, start=START, stop=STOP):
    suffix = '' if start == START else '-' + start[:7]
    cache = OUTPUT / 'raw' / f'{site["id"]}-{target}{suffix}-horizons.json'
    parameters = {
        'format': 'json', 'COMMAND': f"'{target}'", 'OBJ_DATA': "'NO'",
        'MAKE_EPHEM': "'YES'", 'EPHEM_TYPE': "'OBSERVER'", 'CENTER': "'coord@301'",
        'COORD_TYPE': "'GEODETIC'",
        'SITE_COORD': f"'{site['lon']:.9f},{site['lat']:.9f},{(site['elevationM'] + OBSERVER_HEIGHT_M)/1000:.9f}'",
        'START_TIME': f"'{start}'", 'STOP_TIME': f"'{stop}'", 'STEP_SIZE': f"'{STEP}'",
        'QUANTITIES': "'4'", 'CSV_FORMAT': "'YES'", 'ANG_FORMAT': "'DEG'",
        'APPARENT': "'AIRLESS'", 'TIME_DIGITS': "'SECONDS'", 'EXTRA_PREC': "'YES'",
    }
    if cache.exists():
        envelope = json.loads(cache.read_text(encoding='utf-8'))
        if envelope['parameters'] != parameters:
            raise ValueError(f'Stale query cache: {cache}')
    else:
        response = requests.get('https://ssd.jpl.nasa.gov/api/horizons.api', params=parameters,
                                timeout=(20, 120))
        response.raise_for_status()
        envelope = {'requestedAt': datetime.now(timezone.utc).isoformat(),
                    'url': response.url, 'parameters': parameters, 'response': response.json()}
        if 'error' in envelope['response']:
            raise ValueError(envelope['response']['error'])
        cache.write_text(json.dumps(envelope, indent=2), encoding='utf-8')
    result = envelope['response']['result']
    if '$$SOE' not in result or '$$EOE' not in result:
        raise ValueError(f'No ephemeris data: {result[:1000]}')
    records = []
    for row in csv.reader(result.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()):
        # Quantity 4 CSV columns: UTC date, solar flag, lunar flag, azimuth, elevation.
        stamp = datetime.strptime(row[0].strip(), '%Y-%b-%d %H:%M:%S')
        records.append({'time': stamp.strftime('%Y-%m-%dT%H:%M:%SZ'),
                        'az': float(row[3]), 'el': float(row[4])})
    return records, {'path': f'raw/{cache.name}', 'sha256': sha256(cache),
                     'url': envelope['url']}


def build():
    RAW.mkdir(parents=True, exist_ok=True)
    (OUTPUT / 'raw').mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        source_files = dict(pool.map(download, FILES.items()))
    (OUTPUT / 'source-manifest.json').write_text(json.dumps(source_files, indent=2), encoding='utf-8')
    rasters = {key: Raster(RAW / source_files[key]['file']) for key in
               ['local-dem', 'regional-dem', 'height-error', 'slope', 'slope-error']}
    local, regional = rasters['local-dem'], rasters['regional-dem']
    with tarfile.open(RAW / source_files['regions']['file']) as archive:
        rois = shapefile.Reader(**{ext: io.BytesIO(archive.extractfile(f'Site01_ROIs.{ext}').read())
                                   for ext in ['shp', 'shx', 'dbf']})
        roi_records = list(rois.records())
    sites = []
    for roi in [1, 4, 6]:
        x, y = map(float, roi_records[roi-1])
        lon, lat = map(float, xy_to_lonlat(x, y))
        z = float(local.sample(x, y))
        site = {'id': f'ridge-{roi}', 'name': f'Connecting Ridge · ROI {roi}',
                'lat': round(lat, 9), 'lon': round(lon, 9), 'elevationM': round(z, 3),
                'observerHeightM': OBSERVER_HEIGHT_M, 'horizonHeightM': OBSERVER_HEIGHT_M,
                'sampleStepHours': 0.5, 'sourceRoiNumber': roi,
                'positionSource': 'X/Y attribute of NASA PGDA Site01_ROIs.shp (1-indexed feature)',
                'slopeDeg': round(float(rasters['slope'].sample(x, y)), 3),
                'slopeRmsErrorDeg': round(float(rasters['slope-error'].sample(x, y)), 3),
                'heightRmsErrorM': round(float(rasters['height-error'].sample(x, y)), 3),
                'horizonAzimuthConvention': 'clockwise from geographic north',
                'horizonCoverageM': 250000, 'patchSpacingM': 25,
                'patchOffsetConvention': 'dxM: geographic east; dyM: geographic north; spherical geodesic offsets',
                'patches': []}
        for north in [-25, 0, 25]:
            for east in [-25, 0, 25]:
                distance = np.hypot(east, north)
                plon, plat = destination(lon, lat, np.rad2deg(np.arctan2(east, north)), distance)
                px, py = lonlat_to_xy(plon, plat)
                pz = float(local.sample(px, py))
                mask, limits = horizon(local, regional, float(plon), float(plat), pz)
                patch = {'id': f'e{east:+d}-n{north:+d}', 'dxM': east, 'dyM': north,
                         'lat': round(float(plat), 9), 'lon': round(float(plon), 9),
                         'elevationM': round(pz, 3), 'horizon': mask}
                site['patches'].append(patch)
                if east == 0 and north == 0:
                    site['horizon'] = mask
                    site['horizonOccluderDistanceM'] = limits.astype(int).tolist()
        grid = np.linspace(-3200, 3200, 129)
        east, north = np.meshgrid(grid, grid[::-1])
        tlon, tlat = destination(lon, lat, np.rad2deg(np.arctan2(east, north)), np.hypot(east, north))
        tx, ty = lonlat_to_xy(tlon, tlat)
        terrain = combined_elevation(local, regional, tx, ty)
        site['terrain'] = {'width': 129, 'height': 129, 'cellSizeM': 50,
                           'northUp': True, 'rowOrder': 'north to south',
                           'elevations': np.round(terrain, 2).ravel().tolist(),
                           'sourcePixelSizeM': 5, 'displaySampling': 'bilinear samples, 50 m spacing',
                           'extentM': 6400}
        print(f'Computed terrain and 9 horizon masks for {site["name"]}', flush=True)
        sun, sun_provenance = query_horizons(site, '10')
        earth, earth_provenance = query_horizons(site, '399')
        if [item['time'] for item in sun] != [item['time'] for item in earth]:
            raise ValueError('Sun/Earth timestamps disagree')
        site['samples'] = [{'time': s['time'], 'sunAz': s['az'], 'sunEl': s['el'],
                            'earthAz': e['az'], 'earthEl': e['el']} for s, e in zip(sun, earth)]
        site['ephemerisSources'] = {'sun': sun_provenance, 'earth': earth_provenance}
        sites.append(site)
        print(f'Fetched {len(sun)} Sun/Earth samples for {site["id"]}', flush=True)
    bundle = {'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(),
              'title': 'Lunar Margin · Connecting Ridge research cases',
              'referenceFrame': 'LOLA Moon mean-Earth DE421; Horizons MEAN_ME orientation / DE441 dynamics; sphere radius 1737400 m',
              'start': START + 'T00:00:00Z', 'stop': STOP + 'T00:00:00Z',
              'sampleIntervalMinutes': 30, 'observerHeightM': OBSERVER_HEIGHT_M,
              'patchInterpretation': 'Nine explicit terrain locations, not a probability distribution. '
                                     'Central ephemeris reused within 35.4 m; terrain masks differ.',
              'horizonMethod': 'Geographic 1-degree azimuth rays; exact spherical curvature; '
                               '5m local LOLA + 80m regional LOLA, bilinear samples; 250km radius; '
                               'radial steps 2.5m below 2km, 10m to 8km, 40m thereafter.',
              'sources': [{'title': 'NASA PGDA high-resolution south polar LOLA DEMs',
                           'url': 'https://pgda.gsfc.nasa.gov/products/78',
                           'paper': 'https://doi.org/10.1016/j.pss.2020.105119'},
                          {'title': 'NASA PGDA orbit-adjusted south-pole products',
                           'url': 'https://pgda.gsfc.nasa.gov/products/90',
                           'paper': 'https://doi.org/10.3847/PSJ/acf3e1'},
                          {'title': 'NASA JPL Horizons',
                           'url': 'https://ssd.jpl.nasa.gov/horizons/manual.html'}],
              'limitations': ['Research screening cases, not NASA-approved landing sites or flight guidance.',
                              'All three points are in Connecting Ridge; they are nearby alternatives, not three separate regions.',
                              '5 m pixel spacing is not 5 m effective resolution; many LOLA grid cells are interpolated.',
                              '1 degree rays and finite distance steps can miss narrow terrain or small obstacles.',
                              'Horizon terrain coverage ends at 250 km; vehicle-scale hazards are unresolved.',
                              'Sun and Earth center elevation only; partial-disc illumination and ground-station links are not modeled.',
                              '30 minute samples cannot resolve short eclipses or precise transition times.',
                              'LOLA RMS errors are supplied as metadata, not turned into unvalidated probability distributions.',
                              'Ephemerides of the central point are reused at each nearby terrain perturbation.',
                              'Local and regional DEMs come from different published adjustments; their boundary may have a height mismatch.'],
              'sites': sites}
    path = OUTPUT / 'lunar-sites.json'
    path.write_text(json.dumps(bundle, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    print(f'Wrote {path} ({path.stat().st_size:,} bytes)', flush=True)


def add_seasons():
    """Keep identical audited terrain while fetching independent seasonal ephemerides."""
    for season, start, stop in [('march', '2027-03-01', '2027-04-01'),
                                ('june', '2027-06-01', '2027-07-01')]:
        bundle = json.loads((OUTPUT / 'lunar-sites.json').read_text(encoding='utf-8'))
        bundle['start'], bundle['stop'] = start + 'T00:00:00Z', stop + 'T00:00:00Z'
        bundle['season'] = season
        bundle['generatedAt'] = datetime.now(timezone.utc).isoformat()
        for site in bundle['sites']:
            sun, sun_provenance = query_horizons(site, '10', start, stop)
            earth, earth_provenance = query_horizons(site, '399', start, stop)
            if [s['time'] for s in sun] != [e['time'] for e in earth]:
                raise ValueError('Seasonal Sun/Earth timestamps disagree')
            site['samples'] = [{'time': s['time'], 'sunAz': s['az'], 'sunEl': s['el'],
                                'earthAz': e['az'], 'earthEl': e['el']} for s, e in zip(sun, earth)]
            site['ephemerisSources'] = {'sun': sun_provenance, 'earth': earth_provenance}
            print(f'{season}: fetched {len(sun)} paired samples for {site["id"]}', flush=True)
        path = OUTPUT / f'lunar-sites-{season}.json'
        path.write_text(json.dumps(bundle, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
        print(f'Wrote {path.name} ({path.stat().st_size:,} bytes)', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seasons-only', action='store_true', help='Reuse existing terrain bundle and fetch March/June cases')
    parser.add_argument('--include-seasons', action='store_true', help='Also build March/June cases after December')
    args = parser.parse_args()
    if not args.seasons_only:
        build()
    if args.include_seasons or args.seasons_only:
        add_seasons()
