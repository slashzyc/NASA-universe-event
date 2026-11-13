"""Independent coordinate, seam, and horizon-convergence audit of the release bundle."""
from datetime import datetime, timezone
import json
import re
import build_dataset as p
import numpy as np
from pyproj import CRS, Transformer


def run():
    bundle = json.loads((p.OUTPUT / 'lunar-sites.json').read_text(encoding='utf-8'))
    manifest = json.loads((p.OUTPUT / 'source-manifest.json').read_text(encoding='utf-8'))
    local = p.Raster(p.RAW / manifest['local-dem']['file'])
    regional = p.Raster(p.RAW / manifest['regional-dem']['file'])
    transform = Transformer.from_crs(CRS.from_wkt(local.crs_wkt),
                                    CRS.from_proj4('+proj=longlat +R=1737400'), always_xy=True)
    corner_x = np.linspace(local.bounds[0] + 7.5, local.bounds[2] - 7.5, 201)
    corner_y = np.linspace(local.bounds[1] + 7.5, local.bounds[3] - 7.5, 201)
    x = np.concatenate([corner_x, corner_x,
                        np.full(201, corner_x[0]), np.full(201, corner_x[-1])])
    y = np.concatenate([np.full(201, corner_y[0]), np.full(201, corner_y[-1]), corner_y, corner_y])
    residual = local.sample(x, y) - regional.sample(x, y)
    residual = residual[np.isfinite(residual)]
    report = {
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'bundleSha256': p.sha256(p.OUTPUT / 'lunar-sites.json'),
        'projection': {'library': 'PROJ via pyproj', 'maximumCoordinateDifferenceDeg': 0},
        'terrainOrientation': 'Geographic north-up; each grid point is placed by a forward spherical '
                              'geodesic from a local east/north offset. This is not projection grid north.',
        'patchOffsets': 'dxM is geographic east and dyM geographic north. Maximum offset is 35.355 m.',
        'demSeam': {'samples': int(len(residual)),
                    'sampling': '804 boundary samples 7.5 m inside the 16 km Site01 tile, ~80 m spacing',
                    'signedMedianM': round(float(np.median(residual)), 4),
                    'rmsDifferenceM': round(float(np.sqrt(np.mean(residual**2))), 4),
                    'absoluteP95M': round(float(np.percentile(abs(residual), 95)), 4),
                    'absoluteMaxM': round(float(np.max(abs(residual))), 4),
                    'interpretation': 'Cross-product elevation differences combine adjustment and '
                                      '5 m versus 80 m resolution effects; they are not error bars.'},
        'sites': [],
    }
    for site in bundle['sites']:
        x, y = p.lonlat_to_xy(site['lon'], site['lat'])
        independent_lon, independent_lat = transform.transform(float(x), float(y))
        lon_error = abs((independent_lon - site['lon'] + 180) % 360 - 180)
        lat_error = abs(independent_lat - site['lat'])
        report['projection']['maximumCoordinateDifferenceDeg'] = max(
            report['projection']['maximumCoordinateDifferenceDeg'], lon_error, lat_error)
        lon_north, lat_north = p.destination(site['lon'], site['lat'], 0, 3200)
        assert lat_north > site['lat'] and abs(lon_north - site['lon']) < 1e-9
        # First use half radial steps at the original bearings, then check mid-bearing extrema.
        fine, _ = p.horizon(local, regional, site['lon'], site['lat'], site['elevationM'],
                            angular_step=0.5, radial_scale=0.25)
        fine = np.asarray(fine)
        original = np.asarray(site['horizon'])
        coarse_interpolation = (original + np.roll(original, -1)) / 2
        radial_error = fine[::2] - original
        angular_error = fine[1::2] - coarse_interpolation
        cdist = np.array(site['horizonOccluderDistanceM'])
        clon, clat = p.destination(site['lon'], site['lat'], np.arange(360), cdist)
        cx, cy = p.lonlat_to_xy(clon, clat)
        inside = (cx > local.bounds[0]) & (cx < local.bounds[2]) & (cy > local.bounds[1]) & (cy < local.bounds[3])
        boundary_distance = np.minimum.reduce([abs(cx-local.bounds[0]), abs(cx-local.bounds[2]),
                                              abs(cy-local.bounds[1]), abs(cy-local.bounds[3])])
        raw = json.loads((p.OUTPUT / site['ephemerisSources']['sun']['path']).read_text(encoding='utf-8'))
        header = raw['response']['result'].split('$$SOE')[0]
        selected = [line.strip() for line in header.splitlines() if
                    any(label in line for label in ['Center body name:', 'Center geodetic :',
                                                    'Center pole/equ :', 'Center radii    :',
                                                    'Atmos refraction:'])]
        assert 'MEAN_ME' in header and '1737.4, 1737.4, 1737.4' in header
        report['sites'].append({
            'id': site['id'], 'horizonsHeader': selected,
            'northGridEndpoint': {'lon': float(lon_north), 'lat': float(lat_north)},
            'radialRefinement': {'stepMultiplier': 0.5,
                                 'maximumAbsoluteDifferenceDeg': round(float(max(abs(radial_error))), 6),
                                 'rmsDifferenceDeg': round(float(np.sqrt(np.mean(radial_error**2))), 6)},
            'halfDegreeMidBearingCheck': {'maximumAbsoluteDifferenceFromLinearInterpolationDeg':
                                          round(float(max(abs(angular_error))), 6),
                                          'rmsDifferenceDeg': round(float(np.sqrt(np.mean(angular_error**2))), 6)},
            'controllingTerrain': {'insideLocalDemBearings': int(inside.sum()),
                                   'regionalDemBearings': int((~inside).sum()),
                                   'within160MOfTileBoundaryBearings': int((boundary_distance < 160).sum())},
        })
        print(site['id'], report['sites'][-1]['radialRefinement'],
              report['sites'][-1]['halfDegreeMidBearingCheck'], flush=True)
    (p.OUTPUT / 'geometry-audit.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'projection': report['projection'], 'demSeam': report['demSeam']}, indent=2))


if __name__ == '__main__':
    run()
