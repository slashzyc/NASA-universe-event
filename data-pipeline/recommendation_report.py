"""Pure report generation from audit observations, including incomplete evidence.

This module performs no I/O and never modifies the supplied observations. Its
synthetic regression fixtures are kept in test_recommendation_report.py only.
"""
from __future__ import annotations

import math

PUBLISHED = 'published30Minute'
FINE = 'independent5MinuteFineHorizon'
MODES = [PUBLISHED, 'independent5MinutePublishedHorizon', FINE]
MEASURES = [
    ('worstDarkness', 'longestDarkHours', 'maxDarkHours', 'darknessHours', max),
    ('worstEarthGap', 'longestCommGapHours', 'maxCommGapHours', 'earthGapHours', max),
    ('leastJointVisibility', 'jointHours', 'minJointHours', 'jointHours', min),
]
RANKING_CRITERIA = ['allPointsPass:true-first', 'minimumMarginHours:desc',
                    'darknessHours:desc', 'earthGapHours:desc', 'jointHours:desc',
                    'center.longestDarkHours:asc', 'center.longestCommGapHours:asc',
                    'center.jointHours:desc', 'siteId:codepoint-asc']


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def angle_key(value):
    return str(float(value))


def evaluation(case, mode, angle):
    value = case.get('evaluations', {}).get(mode, {}).get(angle_key(angle))
    if not isinstance(value, dict) or not isinstance(value.get('passes'), bool):
        return None
    coverage = case.get('coverage', {})
    if coverage.get('status', 'complete') != 'complete':
        return None
    if any(coverage.get(key, 0) != 0 for key in ['missingEpochCount', 'duplicateEpochCount', 'nonfiniteAngleCount']):
        return None
    expected = coverage.get('expectedSampleCount')
    if expected is not None and coverage.get('sampleCount') != expected:
        return None
    if 'samples' in case and expected is not None and len(case['samples']) != expected:
        return None
    if value.get('status', 'complete') != 'complete':
        return None
    if not all(finite(value.get('metrics', {}).get(metric)) for _, metric, _, _, _ in MEASURES):
        return None
    return value


def expected_cases(report):
    observed = {(case['siteId'], case['patchId']): case for case in report['cases']}
    if len(observed) != len(report['cases']):
        raise ValueError('Duplicate observing-position IDs cannot be summarized as independent evidence.')
    positions = report.get('expectedPositions') or [
        {'siteId': case['siteId'], 'patchId': case['patchId']} for case in report['cases']]
    expected = {(point['siteId'], point['patchId']) for point in positions}
    if len(expected) != len(positions):
        raise ValueError('Duplicate positions in the expected-position manifest.')
    if set(observed) - expected:
        raise ValueError('Observed position is absent from the expected-position manifest.')
    return [observed.get((point['siteId'], point['patchId']), {
        **point, 'coverage': {'status': 'missing'}, 'evaluations': {}}) for point in positions]


def summarize(cases, mode, angle, limits):
    rows = [(case, evaluation(case, mode, angle)) for case in cases]
    known = [(case, value) for case, value in rows if value is not None]
    complete = bool(rows) and len(known) == len(rows)
    result = {'passCount': sum(value['passes'] for _, value in known), 'count': len(rows),
              'knownCount': len(known), 'unknownCount': len(rows) - len(known), 'allKnown': complete,
              'failedPoints': [{'id': case['patchId'], 'reasons': value.get('reasons', [])}
                               for case, value in known if not value['passes']],
              'unknownPoints': [case['patchId'] for case, value in rows if value is None],
              'knownExtrema': {}, 'margins': {}, 'minimumMarginHours': None, 'limitingMeasures': []}
    for name, metric, limit, margin_name, direction in MEASURES:
        extreme = None
        if known:
            target = direction(value['metrics'][metric] for _, value in known)
            ids = sorted(case['patchId'] for case, value in known if value['metrics'][metric] == target)
            extreme = {'hours': target, 'patchId': ids[0], 'tiedPatchIds': ids}
        result['knownExtrema'][name] = extreme
        result[name] = extreme if complete else None
        result['margins'][margin_name] = (
            (extreme['hours'] - limits[limit] if direction is min else limits[limit] - extreme['hours'])
            if complete else None)
    if complete:
        result['minimumMarginHours'] = min(result['margins'].values())
        result['limitingMeasures'] = [key for key, value in result['margins'].items()
                                     if value == result['minimumMarginHours']]
    return result


def rank_sites(cases, summaries, mode, angle):
    key = angle_key(angle)
    candidates = []
    for site_id, modes in summaries.items():
        summary = modes[mode][key]
        center = next((evaluation(case, mode, angle) for case in cases
                       if case['siteId'] == site_id and case.get('location', {}).get('dxM') == 0
                       and case.get('location', {}).get('dyM') == 0), None)
        candidates.append({'siteId': site_id, 'allKnown': summary['allKnown'],
                           'allPointsPass': summary['allKnown'] and summary['passCount'] == summary['count'],
                           'passCount': summary['passCount'], 'count': summary['count'],
                           'margins': summary['margins'], 'minimumMarginHours': summary['minimumMarginHours'],
                           'centerMetrics': center['metrics'] if center is not None else None})
    complete = bool(candidates) and all(c['allKnown'] and c['centerMetrics'] is not None for c in candidates)
    if not complete:
        return {'status': 'incomplete', 'preferredSiteId': None, 'order': [], 'candidates': candidates}
    def order(candidate):
        center = candidate['centerMetrics']
        return (not candidate['allPointsPass'], -candidate['minimumMarginHours'],
                *(-candidate['margins'][key] for key in ['darknessHours', 'earthGapHours', 'jointHours']),
                center['longestDarkHours'], center['longestCommGapHours'], -center['jointHours'], candidate['siteId'])
    candidates.sort(key=order)
    feasible = [c for c in candidates if c['allPointsPass']]
    return {'status': 'comparable' if feasible else 'no-feasible-footprint',
            'preferredSiteId': feasible[0]['siteId'] if feasible else None,
            'order': [c['siteId'] for c in candidates], 'candidates': candidates}


def derive_results(report):
    """Rebuild summaries and narrative facts, ignoring any previously cached text."""
    cases = expected_cases(report)
    angles = report['addedClearanceDeg']
    summaries = {site_id: {mode: {angle_key(a): summarize(
        [case for case in cases if case['siteId'] == site_id], mode, a, report['constraints'])
        for a in angles} for mode in MODES} for site_id in sorted({case['siteId'] for case in cases})}
    changes, unknown = [], []
    for case in cases:
        for angle in angles:
            old, fine = evaluation(case, PUBLISHED, angle), evaluation(case, FINE, angle)
            identity = {'siteId': case['siteId'], 'patchId': case['patchId'], 'addedClearanceDeg': angle}
            if old is None or fine is None:
                unknown.append({**identity, 'publishedKnown': old is not None, 'fineKnown': fine is not None})
            elif old['passes'] != fine['passes']:
                changes.append({**identity, 'publishedPass': old['passes'], 'finePass': fine['passes'],
                                'fineReasons': fine.get('reasons', [])})
    rankings = {}
    for angle in angles:
        old, fine = (rank_sites(cases, summaries, mode, angle) for mode in [PUBLISHED, FINE])
        rankings[angle_key(angle)] = {'published': old, 'fine': fine,
            'preferenceChanged': None if 'incomplete' in [old['status'], fine['status']]
            else old['preferredSiteId'] != fine['preferredSiteId']}
    total = len(cases) * len(angles)
    facts = {'schemaVersion': 1, 'pointCount': len(cases), 'angleCount': len(angles),
             'comparison': {'expectedCount': total, 'comparableCount': total-len(unknown),
                            'changedCount': len(changes), 'unchangedCount': total-len(unknown)-len(changes),
                            'unknownCount': len(unknown), 'changedPoints': changes, 'unknownPoints': unknown},
             'ranking': {'scope': 'Same arrival and duration; compare complete footprints under the declared thresholds.',
                         'criteria': RANKING_CRITERIA, 'byAddedAngle': rankings}}
    return summaries, facts


def number(value, precision=3):
    return f'{value:.{precision}f}' if finite(value) else 'unknown / 未知'


def outcome(value):
    return 'unknown / 未知' if value is None else 'pass / 通过' if value else 'fail / 未通过'


def render_markdown(report):
    summaries, facts = derive_results(report)
    comparison = facts['comparison']
    coverage = report.get('coverage', {})
    limits = report['constraints']
    angles = report['addedClearanceDeg']
    cases = expected_cases(report)
    lines = ['# Recommendation-window fine audit / 推荐窗口精算', '',
        f"Generated: {report['createdAt']}. Calculation method: `{report['methodVersion']}`. Narrative schema: `{facts['schemaVersion']}`.", '',
        f"Retained source responses / 保留的原始响应：**{coverage.get('rawResponseCount', 'unknown')}**. "
        f"Expected positions / 预期位置：**{facts['pointCount']}**. "
        f"Expected epochs per position / 每位置预期时刻：**{report.get('expectedEpochsPerBody', 'unknown')}**. "
        f"Cadence / 采样间隔：**{report['sampleIntervalMinutes']} min**. "
        f"Window / 时间：**{report['start']} → {report['stop']}**. "
        f"Observer height / 设备高度：**{report['observerHeightM']} m**.", '',
        f"Applied thresholds / 应用门槛：darkness / 断光 ≤ **{limits['maxDarkHours']} h**; "
        f"Earth gap / 地球不可见 ≤ **{limits['maxCommGapHours']} h**; "
        f"joint visibility / 共同可见 ≥ **{limits['minJointHours']} h**. "
        f"Baseline clearance / 基准角度：**{report['baseClearanceDeg']}°**; table angles are added / 表格角度均为附加增量。", '',
        '[Machine-readable full report / 完整计算记录](../data/recommendation-fine-validation.json) retains original queries, response hashes, coordinates, source coverage, intervals, reasons and structured `conclusions`. The text and tables are regenerated from `cases`, not a stored conclusion. / 正文与表格均由实际 `cases` 重建，不能沿用旧结论。', '',
        '## Footprint comparison / 周边样本比较', '',
        '| Site / 地点 | Added angle / 增量 | Published pass / 发布通过 | Fine pass / 精算通过 | Fine known / 精算已知 | Published worst dark h / 发布最坏断光 | Fine worst dark h / 精算最坏断光 | Fine worst dark point / 精算最坏点 |',
        '|---|---:|---:|---:|---:|---:|---:|---|']
    for site_id, modes in summaries.items():
        for angle in angles:
            old, fine = (modes[mode][angle_key(angle)] for mode in [PUBLISHED, FINE])
            old_worst, fine_worst = old['worstDarkness'], fine['worstDarkness']
            lines.append(f"| {site_id} | +{angle:.2f}° | {old['passCount']}/{old['count']} | "
                f"{fine['passCount']}/{fine['count']} | {fine['knownCount']}/{fine['count']} | "
                f"{number(old_worst['hours'] if old_worst else None)} | "
                f"{number(fine_worst['hours'] if fine_worst else None)} | "
                f"{', '.join(fine_worst['tiedPatchIds']) if fine_worst else 'unknown / 未知'} |")
    lines += ['', '## Interpretation / 结论', '',
        f"Across **{facts['pointCount']} positions** and **{facts['angleCount']} added-angle settings**, "
        f"**{comparison['changedCount']} of {comparison['comparableCount']} comparable pass/fail conclusions changed**; "
        f"**{comparison['unchangedCount']} remained the same**. "
        f"**{comparison['unknownCount']} of {comparison['expectedCount']} expected comparisons are unknown**. "
        'Unknown results are neither passes nor unchanged conclusions.', '',
        f"共 **{facts['pointCount']} 个位置**、**{facts['angleCount']} 档附加角度**："
        f"**{comparison['comparableCount']} 项可比较结论中 {comparison['changedCount']} 项改变**，"
        f"**{comparison['unchangedCount']} 项不变**；"
        f"**{comparison['expectedCount']} 项预期比较中 {comparison['unknownCount']} 项未知**。未知不计为通过，也不计为结论未变。", '']
    for angle in angles:
        key = angle_key(angle)
        lines += [f'### Added angle / 附加角度 +{angle:.2f}°', '']
        for site_id, modes in summaries.items():
            old, fine = (modes[mode][key] for mode in [PUBLISHED, FINE])
            lines += [f"**{site_id}: {old['passCount']}/{old['count']} published passes → "
                f"{fine['passCount']}/{fine['count']} fine passes; {fine['unknownCount']} fine results unknown.** "
                f"**发布通过 {old['passCount']}/{old['count']} → 精算通过 {fine['passCount']}/{fine['count']}；"
                f"精算未知 {fine['unknownCount']} 项。**", '']
            if fine['allKnown']:
                for name, metric, limit, margin_key, _ in MEASURES:
                    point = fine[name]
                    en, zh = {'worstDarkness': ('worst darkness', '最长断光'),
                              'worstEarthGap': ('worst Earth-view gap', '最长地球不可见'),
                              'leastJointVisibility': ('least joint visibility', '最少共同可见')}[name]
                    lines.append(f"- {en} / {zh}: **{number(point['hours'])} h**, at / 位置 "
                        f"`{'`, `'.join(point['tiedPatchIds'])}`; threshold / 门槛 **{limits[limit]} h**; "
                        f"signed margin / 有符号余量 **{number(fine['margins'][margin_key])} h "
                        f"({number(fine['margins'][margin_key]*60, 2)} min)**.")
                lines += [f"- Smallest threshold margin / 最薄弱门槛余量：**{number(fine['minimumMarginHours'])} h** "
                          f"({', '.join(fine['limitingMeasures'])}).", '']
            else:
                lines += ['Full-footprint extrema and preference are unavailable because coverage is incomplete. '
                          '/ 覆盖不完整，不能给出整组最不利值及整体优先建议。', '']
            for failed in fine['failedPoints']:
                reasons = '; '.join(f"{reason['code']}: {number(reason.get('actual'))} h; "
                                   f"limit / 门槛 {number(reason.get('limit'))} h" for reason in failed['reasons'])
                lines += [f"Failed point / 未通过点 `{failed['id']}`: {reasons or 'reason unavailable / 原因缺失'}.", '']
            if fine['unknownPoints']:
                lines += [f"Unknown points / 未知点：`{'`, `'.join(fine['unknownPoints'])}`.", '']
        ranking = facts['ranking']['byAddedAngle'][key]
        old, fine = ranking['published'], ranking['fine']
        if fine['status'] == 'incomplete' or old['status'] == 'incomplete':
            sentence = 'The published-to-fine preference comparison is unavailable because required observations or center metrics are missing. / 因必要观测或中心指标缺失，不能判断发布模型与精算模型的优先顺序是否一致。'
        elif fine['status'] == 'no-feasible-footprint':
            sentence = 'No evaluated site has a complete footprint meeting all thresholds in the fine calculation; no feasible site is recommended. / 精算中没有地点的整组样本满足全部门槛，因此不推荐可行地点。'
        else:
            action = 'changes' if ranking['preferenceChanged'] else 'is preserved'
            zh_action = '改变' if ranking['preferenceChanged'] else '保持'
            sentence = (f"At this common arrival, the preference **{action}**: "
                        f"**{old['preferredSiteId'] or 'no feasible footprint'} → {fine['preferredSiteId']}**. "
                        f"在同一抵达时刻，优先建议**{zh_action}**："
                        f"**{old['preferredSiteId'] or '无可行整组'} → {fine['preferredSiteId']}**。")
        lines += [sentence, '']
    lines += ['### Changed or unavailable conclusions / 改变或未知的逐项结论', '',
              '| Site / 地点 | Point / 点 | Added angle / 增量 | Published / 发布 | Fine / 精算 |',
              '|---|---|---:|---|---|']
    for change in comparison['changedPoints']:
        lines.append(f"| {change['siteId']} | `{change['patchId']}` | +{change['addedClearanceDeg']:.2f}° | "
                     f"{outcome(change['publishedPass'])} | {outcome(change['finePass'])} |")
    for unknown in comparison['unknownPoints']:
        lines.append(f"| {unknown['siteId']} | `{unknown['patchId']}` | +{unknown['addedClearanceDeg']:.2f}° | "
                     f"{'known / 已知' if unknown['publishedKnown'] else 'unknown / 未知'} | "
                     f"{'known / 已知' if unknown['fineKnown'] else 'unknown / 未知'} |")
    if not comparison['changedPoints'] and not comparison['unknownPoints']:
        lines += ['| none / 无 | — | — | all comparable / 全部可比较 | unchanged / 未改变 |']
    baseline = 0.0 if 0.0 in angles else angles[0]
    lines += ['', f'## Every position at +{baseline:.2f}° / 该档角度的每个位置', '',
        '| Site / 地点 | Point / 点 | Published dark h / 发布断光 | Fine dark h / 精算断光 | Δ dark h / 变化 | Fine Sun h / 日 | Fine Earth h / 地 | Fine Earth gap h / 对地空窗 | Fine joint h / 共同 | Published → fine / 发布→精算 |',
        '|---|---|---:|---:|---:|---:|---:|---:|---:|---|']
    for case in cases:
        old, fine = (evaluation(case, mode, baseline) for mode in [PUBLISHED, FINE])
        old_metrics, fine_metrics = (value['metrics'] if value is not None else {} for value in [old, fine])
        change = fine_metrics['longestDarkHours']-old_metrics['longestDarkHours'] if old and fine else None
        lines.append(f"| {case['siteId']} | `{case['patchId']}` | {number(old_metrics.get('longestDarkHours'))} | "
            f"{number(fine_metrics.get('longestDarkHours'))} | {number(change)} | "
            f"{number(fine_metrics.get('sunHours'))} | {number(fine_metrics.get('earthHours'))} | "
            f"{number(fine_metrics.get('longestCommGapHours'))} | {number(fine_metrics.get('jointHours'))} | "
            f"{outcome(old['passes'] if old else None)} → {outcome(fine['passes'] if fine else None)} |")
    lines += ['', '## Ranking rule / 排序规则', '',
        'This audit compares a single shared arrival and duration. It first requires known, complete data. '
        'Complete passing footprints precede failing footprints, followed by the largest smallest threshold margin, '
        'individual darkness/Earth-gap/joint margins, center darkness/Earth-gap/joint metrics, and stable site ID. '
        'A failing footprint is not recommended merely because it ranks first. This is an explicit preference, not flight certification.', '',
        '本审计只比较同一抵达时间及任务时长。先要求观测完整已知；满足全部条件的整组优先，再按最小门槛余量、'
        '分项余量、中心指标及稳定地点 ID 排序。未通过的整组即使排序第一也不称为可行建议。这是明确的偏好规则，不是飞行认证。', '',
        '## Reproduce and interpret / 复现与范围', '',
        'Run `python data-pipeline/audit_recommendations.py` with `data-pipeline/requirements.txt` installed. '
        'Original responses are reused only when parameters match; source raster hashes must match the manifest. '
        'Run `python -m unittest discover -s data-pipeline` for geometry and clearly labeled synthetic report regressions. '
        'Synthetic fixtures never write to NASA inputs or this formal result.', '',
        'The retained middle layer uses independent five-minute ephemerides with the published horizon, separating '
        'observer/time effects from further horizon refinement. Known-subset extrema remain in JSON when any point is unknown; '
        'they are not presented as complete-footprint extrema. The original query process aborts on missing epochs rather than inventing samples.', '',
        '保留的中间层使用独立五分钟星历和原发布地平线，将观测位置/时间影响与进一步地平线加密分开。'
        '有未知点时，JSON 保留已知子集的极值，但不作为完整九点极值。原始查询遇到缺测会终止，不补造样本。', '',
        'Five-minute event boundaries still use interpolation. The same underlying NASA DEM is reused; denser rays '
        'do not create new measured terrain detail. Added angles are deterministic stress conditions, not error distributions '
        'or landing-success probabilities. Geometric body-center visibility does not establish power, a working radio link, or safety.', '',
        '五分钟事件边界仍为插值估计，地形仍来自同一套 NASA DEM；加密射线不能创造实测地形细节。'
        '附加角度是确定性压力条件，不是地形误差分布或着陆成功率；几何可见不能证明供电、通信可用性或着陆安全。', '',
        '[Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) · '
        '[Horizons observing-site conventions](https://ssd.jpl.nasa.gov/horizons/manual.html#site).', '']
    return '\n'.join(lines)
