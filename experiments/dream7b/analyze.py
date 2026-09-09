"""Score saved generations with strict JSON and explicitly limited fence removal."""
import json
from collections import defaultdict
from pathlib import Path
from json_output import parse_json_output

root = Path(__file__).resolve().parent
runs = []
for folder in sorted((root / 'results').iterdir()):
    if not (folder / 'summary.json').exists():
        continue
    meta = json.loads((folder / 'metadata.json').read_text())
    expected = {c['id']:c.get('expected') for c in meta['cases']}
    records = [json.loads(line) for line in (folder / 'outputs.jsonl').read_text(encoding='utf-8').splitlines()]
    groups = defaultdict(list)
    for record in records:
        try:
            normalized = parse_json_output(record['output'])
            record['normalized_correct'] = normalized == expected[record['case']]
        except json.JSONDecodeError:
            record['normalized_correct'] = False
        groups[record['profile']].append(record)
    summaries = {}
    for name, rows in groups.items():
        summaries[name] = {
            'cases':len(rows), 'strict_correct':sum(r.get('correct',False) for r in rows),
            'normalized_correct':sum(r['normalized_correct'] for r in rows),
            'mean_seconds':sum(r['seconds'] for r in rows)/len(rows),
            'peak_allocated_gib':max(r['peak_allocated_gib'] for r in rows),
            'failed_cases_after_fence_removal':[r['case'] for r in rows if not r['normalized_correct']],
        }
    equivalence = None
    if 'margin' in groups and 'margin_top2' in groups:
        original = {r['case']:r['output'] for r in groups['margin']}
        optimized = {r['case']:r['output'] for r in groups['margin_top2']}
        equivalence = original == optimized
    runs.append({'run':folder.name, 'quantization':meta['quantization'],
                 'case_ids':list(expected), 'summary':summaries,
                 'margin_outputs_identical':equivalence})
(root / 'analysis.json').write_text(json.dumps(runs, indent=2))
print(json.dumps(runs, indent=2))
