"""R01 regressions. Synthetic fixtures stay in memory, never in NASA datasets."""
import copy
import json
from pathlib import Path
import unittest

from recommendation_report import derive_results, render_markdown, FINE, MODES, PUBLISHED


def synthetic_fixture():
    """Deliberately use different counts, IDs, thresholds and angles from NASA."""
    report = {'fixtureType': 'SYNTHETIC REPORT TEST ONLY; NOT NASA DATA',
              'createdAt': 'synthetic-test', 'methodVersion': 'synthetic-test-v1',
              'start': '2030-01-01T00:00:00Z', 'stop': '2030-01-02T00:00:00Z',
              'durationHours': 24, 'observerHeightM': 7, 'sampleIntervalMinutes': 10,
              'expectedEpochsPerBody': 145, 'baseClearanceDeg': 0.2,
              'addedClearanceDeg': [0.0, 0.1],
              'constraints': {'maxDarkHours': 15, 'maxCommGapHours': 12, 'minJointHours': 3},
              'coverage': {'rawResponseCount': 8, 'pointCount': 4}, 'cases': []}
    for site_id, dark in [('synthetic-a', 10), ('synthetic-b', 13)]:
        for patch_id, dx in [('center', 0), ('east', 25)]:
            item = {'siteId': site_id, 'patchId': patch_id,
                    'location': {'dxM': dx, 'dyM': 0}, 'coverage': {'status': 'complete'},
                    'evaluations': {mode: {} for mode in MODES}}
            for mode in MODES:
                for angle in report['addedClearanceDeg']:
                    item['evaluations'][mode][str(angle)] = {
                        'passes': True, 'reasons': [], 'windows': {},
                        'metrics': {'longestDarkHours': dark - (1 if dx else 0),
                                    'longestCommGapHours': 1, 'jointHours': 10,
                                    'sunHours': 12, 'earthHours': 23}}
            report['cases'].append(item)
    report['expectedPositions'] = [{'siteId': c['siteId'], 'patchId': c['patchId']} for c in report['cases']]
    return report


def modify(report, index, angle=0.0, **metrics):
    result = report['cases'][index]['evaluations'][FINE][str(angle)]
    result['metrics'].update(metrics)
    limits = report['constraints']
    result['reasons'] = []
    for metric, key, code, direction in [
        ('longestDarkHours', 'maxDarkHours', 'dark-gap', 'max'),
        ('longestCommGapHours', 'maxCommGapHours', 'comm-gap', 'max'),
        ('jointHours', 'minJointHours', 'joint-shortfall', 'min')]:
        actual, limit = result['metrics'][metric], limits[key]
        if (actual > limit if direction == 'max' else actual < limit):
            result['reasons'].append({'code': code, 'actual': actual, 'limit': limit})
    result['passes'] = not result['reasons']


class RecommendationNarrativeTests(unittest.TestCase):
    def verify(self, report):
        before = copy.deepcopy(report)
        summaries, facts = derive_results(report)
        text = render_markdown(report)
        self.assertEqual(report, before, 'Report derivation must not mutate its observations.')
        for site_id, modes in summaries.items():
            for angle in report['addedClearanceDeg']:
                old, fine = (modes[m][str(angle)] for m in [PUBLISHED, FINE])
                self.assertIn(f'| {site_id} | +{angle:.2f}° | {old["passCount"]}/{old["count"]} | '
                              f'{fine["passCount"]}/{fine["count"]} | {fine["knownCount"]}/{fine["count"]}', text)
                self.assertIn(f'发布通过 {old["passCount"]}/{old["count"]} → 精算通过 '
                              f'{fine["passCount"]}/{fine["count"]}；精算未知 {fine["unknownCount"]} 项', text)
        count = facts['comparison']
        self.assertIn(f'{count["changedCount"]} of {count["comparableCount"]} comparable pass/fail conclusions changed', text)
        self.assertIn(f'{count["comparableCount"]} 项可比较结论中 {count["changedCount"]} 项改变', text)
        return summaries, facts, text

    def test_synthetic_zero_changes_and_dynamic_counts_thresholds(self):
        report = synthetic_fixture()
        _, facts, text = self.verify(report)
        self.assertEqual(facts['comparison']['changedCount'], 0)
        self.assertEqual(facts['comparison']['expectedCount'], 8)
        self.assertIn('darkness / 断光 ≤ **15 h**', text)
        self.assertIn('Earth gap / 地球不可见 ≤ **12 h**', text)
        self.assertIn('joint visibility / 共同可见 ≥ **3 h**', text)
        self.assertIn('**7 m**', text)
        self.assertNotIn('72', text)
        self.assertNotIn('9/9', text)
        self.assertNotIn('ROI 1', text)

    def test_synthetic_single_point_changes_both_languages_and_failure_reason(self):
        report = synthetic_fixture()
        modify(report, 1, longestDarkHours=16)
        summaries, facts, text = self.verify(report)
        self.assertEqual(summaries['synthetic-a'][FINE]['0.0']['passCount'], 1)
        self.assertEqual(facts['comparison']['changedCount'], 1)
        self.assertIn('dark-gap: 16.000 h; limit / 门槛 15.000 h', text)
        self.assertIn('| synthetic-a | `east` | +0.00° | pass / 通过 | fail / 未通过 |', text)

    def test_synthetic_multiple_changes_include_recovered_and_failed_points(self):
        report = synthetic_fixture()
        modify(report, 1, longestDarkHours=16)
        modify(report, 3, angle=0.1, jointHours=1)
        _, facts, text = self.verify(report)
        self.assertEqual(facts['comparison']['changedCount'], 2)
        self.assertEqual(len(facts['comparison']['changedPoints']), 2)
        self.assertIn('| synthetic-b | `east` | +0.10° | pass / 通过 | fail / 未通过 |', text)
        report['cases'][1]['evaluations'][PUBLISHED]['0.0'] = copy.deepcopy(report['cases'][1]['evaluations'][FINE]['0.0'])
        modify(report, 1, longestDarkHours=8)
        _, facts, text = self.verify(report)
        self.assertEqual(facts['comparison']['changedCount'], 2)
        self.assertIn('| synthetic-a | `east` | +0.00° | fail / 未通过 | pass / 通过 |', text)

    def test_synthetic_worst_point_switch_and_ties_are_named(self):
        report = synthetic_fixture()
        modify(report, 0, longestDarkHours=8)
        modify(report, 1, longestDarkHours=11)
        summaries, _, text = self.verify(report)
        self.assertEqual(summaries['synthetic-a'][FINE]['0.0']['worstDarkness']['patchId'], 'east')
        self.assertIn('worst darkness / 最长断光: **11.000 h**, at / 位置 `east`', text)
        modify(report, 0, longestDarkHours=11)
        summaries, _, text = self.verify(report)
        self.assertEqual(summaries['synthetic-a'][FINE]['0.0']['worstDarkness']['tiedPatchIds'], ['center', 'east'])
        self.assertIn('at / 位置 `center`, `east`', text)

    def test_synthetic_preference_reversal_without_changing_pass_counts(self):
        report = synthetic_fixture()
        modify(report, 0, longestDarkHours=14.5)
        _, facts, text = self.verify(report)
        ranking = facts['ranking']['byAddedAngle']['0.0']
        self.assertEqual(ranking['published']['preferredSiteId'], 'synthetic-a')
        self.assertEqual(ranking['fine']['preferredSiteId'], 'synthetic-b')
        self.assertTrue(ranking['preferenceChanged'])
        self.assertIn('preference **changes**: **synthetic-a → synthetic-b**', text)
        self.assertIn('优先建议**改变**：**synthetic-a → synthetic-b**', text)

    def test_synthetic_missing_evaluation_is_not_unchanged_or_a_pass(self):
        report = synthetic_fixture()
        report['cases'][1]['evaluations'][FINE]['0.0'] = None
        summaries, facts, text = self.verify(report)
        summary = summaries['synthetic-a'][FINE]['0.0']
        self.assertEqual(summary['unknownPoints'], ['east'])
        self.assertIsNone(summary['worstDarkness'])
        self.assertIsNotNone(summary['knownExtrema']['worstDarkness'])
        self.assertEqual(facts['comparison']['unknownCount'], 1)
        self.assertEqual(facts['comparison']['unchangedCount'], 7)
        self.assertIsNone(facts['ranking']['byAddedAngle']['0.0']['fine']['preferredSiteId'])
        self.assertIn('不能判断发布模型与精算模型的优先顺序是否一致', text)

    def test_synthetic_missing_position_remains_in_expected_denominator(self):
        report = synthetic_fixture()
        report['cases'].pop()
        summaries, facts, _ = self.verify(report)
        self.assertEqual(facts['pointCount'], 4)
        self.assertEqual(facts['comparison']['expectedCount'], 8)
        self.assertEqual(facts['comparison']['unknownCount'], 2)
        self.assertEqual(summaries['synthetic-b'][FINE]['0.0']['count'], 2)

    def test_synthetic_incomplete_coverage_and_nonfinite_metrics_stay_unknown(self):
        report = synthetic_fixture()
        report['cases'][0]['coverage']['status'] = 'incomplete'
        report['cases'][1]['evaluations'][FINE]['0.0']['metrics']['jointHours'] = None
        _, facts, text = self.verify(report)
        self.assertEqual(facts['comparison']['unknownCount'], 3)
        self.assertIn('3 项未知', text)

    def test_synthetic_stale_complete_label_cannot_hide_missing_epochs(self):
        report = synthetic_fixture()
        report['cases'][0]['coverage']['missingEpochCount'] = 1
        report['cases'][1]['coverage'].update({'sampleCount': 3, 'expectedSampleCount': 3})
        report['cases'][1]['samples'] = [{'time': 'test-only'}] * 2
        _, facts, _ = self.verify(report)
        self.assertEqual(facts['comparison']['unknownCount'], 4)
        self.assertEqual(facts['comparison']['comparableCount'], 4)

    def test_synthetic_no_feasible_footprint_does_not_recommend_top_failure(self):
        report = synthetic_fixture()
        modify(report, 0, longestDarkHours=16)
        modify(report, 2, longestDarkHours=18)
        _, facts, text = self.verify(report)
        ranking = facts['ranking']['byAddedAngle']['0.0']['fine']
        self.assertEqual(ranking['status'], 'no-feasible-footprint')
        self.assertIsNone(ranking['preferredSiteId'])
        self.assertIn('no feasible site is recommended', text)
        self.assertIn('因此不推荐可行地点', text)

    def test_real_baseline_keeps_scientific_values_and_ignores_stale_summaries(self):
        report = json.loads((Path(__file__).resolve().parents[1] / 'data/recommendation-fine-validation.json').read_text(encoding='utf-8'))
        original_summaries = copy.deepcopy(report['summaries'])
        report['summaries'] = {'deliberately-stale': 'ignored by pure generator'}
        summaries, facts, text = self.verify(report)
        for site_id, modes in original_summaries.items():
            for mode, angles in modes.items():
                for angle, original in angles.items():
                    actual = summaries[site_id][mode][angle]
                    self.assertEqual(actual['passCount'], original['passCount'])
                    for key in ['worstDarkness', 'worstEarthGap', 'leastJointVisibility']:
                        self.assertEqual(actual[key]['hours'], original[key]['hours'])
        self.assertEqual(facts['comparison']['changedCount'], 0)
        self.assertEqual(facts['comparison']['comparableCount'], 72)
        self.assertEqual(facts['ranking']['byAddedAngle']['0.0']['fine']['preferredSiteId'], 'ridge-1')
        self.assertIn('9.96 min', text)


if __name__ == '__main__':
    unittest.main()
