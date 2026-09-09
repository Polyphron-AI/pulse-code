"""Check the sampler shortcut independently of loading the model weights."""
import ast
import json
import time
from pathlib import Path

import torch
from optimizations import margin_top2, verify_margin_top2

root = Path(__file__).resolve().parent
source = ast.parse((root / 'model' / 'generation_utils.py').read_text())
functions = ast.Module(body=[node for node in source.body if isinstance(node, ast.FunctionDef)
                            and node.name in {'sample_tokens', 'top_p_logits', 'top_k_logits'}], type_ignores=[])
namespace = {'torch':torch, 'F':torch.nn.functional, 'dists':torch.distributions}
# Execute only the inspected sampling functions from the pinned official source.
exec(compile(functions, 'official_sampling_functions', 'exec'), namespace)
original = namespace['sample_tokens']
verify_margin_top2(original)
optimized = margin_top2(original)
logits = torch.randn(128, 152064, device='cuda', dtype=torch.bfloat16)
timings = {}
for name, sample in [('original',original), ('top2',optimized)]:
    for _ in range(3):
        sample(logits, margin_confidence=True)
    torch.cuda.synchronize()
    start = time.perf_counter()
    for _ in range(10):
        sample(logits, margin_confidence=True)
    torch.cuda.synchronize()
    timings[name] = (time.perf_counter() - start) / 10
result = {'exact_equivalence_checks':'passed', 'seconds_per_sampler_call':timings,
          'sampler_speedup':timings['original']/timings['top2'],
          'note':'Sampler microbenchmark only. This is not end-to-end model speed.'}
(root / 'optimization-check.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
