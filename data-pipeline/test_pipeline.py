"""Independent geometry and published-data checks; run with python -m unittest discover -s data-pipeline."""
from datetime import datetime, timedelta
import json
from pathlib import Path
import tempfile
import unittest

import build_dataset as p
import numpy as np
import rasterio
from rasterio.transform import from_origin


class GeometryTests(unittest.TestCase):
    def test_projection_roundtrip(self):
        for lon, lat in [(0, -89), (222.9, -89.45), (359.9, -81), (90, -87)]:
            x, y = p.lonlat_to_xy(lon, lat)
            actual_lon, actual_lat = p.xy_to_lonlat(x, y)
            self.assertAlmostEqual(float(actual_lon), lon, places=10)
            self.assertAlmostEqual(float(actual_lat), lat, places=10)

    def test_geographic_north_and_distance(self):
        lon, lat = p.destination(223, -89.4, 0, 1000)
        self.assertAlmostEqual(float(lon), 223, places=10)
        self.assertAlmostEqual(float(lat), -89.4 + np.rad2deg(1000/p.RADIUS_M), places=9)
        west_lon, west_lat = p.destination(223, -89.4, 270, 1000)
        self.assertLess(float(west_lon), 223)

    def test_bilinear_plane_and_bounds(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'plane.tif'
            values = np.array([[2, 5, 8], [7, 10, 13], [12, 15, 18]], dtype=np.float32)
            with rasterio.open(path, 'w', driver='GTiff', width=3, height=3, count=1,
                               dtype='float32', crs='+proj=longlat +R=1737400',
                               transform=from_origin(0, 3, 1, 1)) as dst:
                dst.write(values, 1)
            raster = p.Raster(path)
            self.assertEqual(float(raster.sample(1, 2)), 6)
            self.assertTrue(np.isnan(raster.sample(-1, 1)))

    def test_flat_sphere_matches_analytic_horizon_dip(self):
        class Sphere:
            def sample(self, x, y):
                return np.zeros_like(x, dtype=float)
        mask, occluders = p.horizon(Sphere(), Sphere(), 222.9, -89.45, 0)
        analytic = -np.rad2deg(np.arccos(p.RADIUS_M / (p.RADIUS_M + p.OBSERVER_HEIGHT_M)))
        self.assertTrue(np.allclose(mask, analytic, atol=0.00002))
        self.assertTrue(np.all((occluders > 2500) & (occluders < 2800)))


class PublishedBundleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = p.OUTPUT / 'lunar-sites.json'
        if not path.exists():
            raise unittest.SkipTest('Run build_dataset.py before published-data checks')
        cls.bundle = json.loads(path.read_text(encoding='utf-8'))

    def test_three_sources_and_real_coordinates(self):
        self.assertEqual([s['id'] for s in self.bundle['sites']], ['ridge-1', 'ridge-4', 'ridge-6'])
        self.assertEqual(self.bundle['observerHeightM'], 2)
        for site in self.bundle['sites']:
            self.assertTrue(-89.6 < site['lat'] < -89.3)
            self.assertTrue(222 < site['lon'] < 224)
            self.assertGreater(site['heightRmsErrorM'], 0)
            self.assertGreater(site['slopeRmsErrorDeg'], 0)

    def test_masks_and_terrain(self):
        for site in self.bundle['sites']:
            self.assertEqual(len(site['horizon']), 360)
            self.assertEqual(len(site['patches']), 9)
            center = next(patch for patch in site['patches'] if patch['dxM'] == patch['dyM'] == 0)
            self.assertEqual(center['horizon'], site['horizon'])
            self.assertEqual(len(site['terrain']['elevations']), 129*129)
            for patch in site['patches']:
                self.assertEqual(len(patch['horizon']), 360)
                self.assertTrue(np.all(np.isfinite(patch['horizon'])))
                self.assertTrue(np.all(np.abs(patch['horizon']) < 90))

    def test_ephemerides_have_complete_regular_utc_grid(self):
        start = datetime.fromisoformat('2026-12-01T00:00:00+00:00')
        for site in self.bundle['sites']:
            self.assertEqual(len(site['samples']), 1489)
            for index, sample in enumerate(site['samples']):
                self.assertEqual(datetime.fromisoformat(sample['time']), start + timedelta(minutes=30*index))
                for body in ['sun', 'earth']:
                    self.assertTrue(0 <= sample[body+'Az'] < 360)
                    self.assertTrue(-90 <= sample[body+'El'] <= 90)

    def test_original_ephemeris_files_match_recorded_checksums(self):
        for site in self.bundle['sites']:
            for source in site['ephemerisSources'].values():
                path = p.OUTPUT / source['path']
                self.assertEqual(p.sha256(path), source['sha256'])
                raw = json.loads(path.read_text(encoding='utf-8'))
                self.assertEqual(raw['parameters']['CENTER'], "'coord@301'")
                self.assertEqual(raw['parameters']['QUANTITIES'], "'4'")

    def test_seasonal_bundles_use_same_terrain_and_separate_time_grids(self):
        for season, start, count in [('march', '2027-03-01T00:00:00+00:00', 1489),
                                     ('june', '2027-06-01T00:00:00+00:00', 1441)]:
            path = p.OUTPUT / f'lunar-sites-{season}.json'
            if not path.exists():
                self.skipTest('Build optional seasonal cases with --include-seasons')
            bundle = json.loads(path.read_text(encoding='utf-8'))
            for base, site in zip(self.bundle['sites'], bundle['sites']):
                self.assertEqual(site['id'], base['id'])
                self.assertEqual(site['terrain'], base['terrain'])
                self.assertEqual(site['patches'], base['patches'])
                self.assertEqual(site['horizon'], base['horizon'])
                self.assertEqual(site['horizonHeightM'], 2)
                self.assertEqual(site['sampleStepHours'], 0.5)
                self.assertEqual(len(site['samples']), count)
                for index, sample in enumerate(site['samples']):
                    self.assertEqual(datetime.fromisoformat(sample['time']),
                                     datetime.fromisoformat(start) + timedelta(minutes=30*index))
                for source in site['ephemerisSources'].values():
                    self.assertEqual(p.sha256(p.OUTPUT / source['path']), source['sha256'])

    def test_demo_audit_is_fine_regular_and_uses_actual_patch_coordinates(self):
        path = p.OUTPUT / 'fine-ephemeris-validation.json'
        if not path.exists():
            self.skipTest('Run audit_demo.py for fine-cadence validation')
        audit = json.loads(path.read_text(encoding='utf-8'))
        self.assertEqual(audit['publishedJuneBundleSha256'], p.sha256(p.OUTPUT / 'lunar-sites-june.json'))
        self.assertNotEqual(audit['cases']['center']['location'], audit['cases']['southeast']['location'])
        for case in audit['cases'].values():
            self.assertEqual(len(case['samples']), 2017)
            self.assertEqual(len(case['fineHorizon']), 720)
            for index, sample in enumerate(case['samples']):
                self.assertEqual(datetime.fromisoformat(sample['time']),
                                 datetime.fromisoformat(audit['start']) + timedelta(minutes=5*index))
            for source in case['sources'].values():
                self.assertEqual(p.sha256(p.OUTPUT / source['path']), source['sha256'])


if __name__ == '__main__':
    unittest.main()
