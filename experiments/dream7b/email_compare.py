"""Local paired evaluation; original source assets are read-only."""
import ast
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = Path('F:/Dev Ops/email mcp')
OUT = ROOT / 'email-comparison'
OUT.mkdir(exist_ok=True)
os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', TOKENIZERS_PARALLELISM='false', HF_MODULES_CACHE=str(ROOT / '.hf/modules'))

def definitions(path, names, namespace):
    tree = ast.parse(path.read_text(encoding='utf-8-sig'))
    nodes = [n for n in tree.body if (isinstance(n, ast.FunctionDef) and n.name in names) or (isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in names for t in n.targets))]
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), 'exec'), namespace)

ns = {'re': re, 'json': json}
definitions(SOURCE / 'eval_grounded_gen.py', {'SYS', 'ROLE', 'parse'}, ns)

def prepare():
    paths = ['scorecard/eval_set.json', 'scorecard/golden_opus.json', 'scorecard/golden_struct.json', 'eval_struct_preds/multi.json', 'eval_grounded_gen.py', 'score_model.py', 'eval_struct_score.py', 'score_compare.py']
    hashes = {}
    for name in paths:
        data = (SOURCE / name).read_bytes()
        hashes[name] = hashlib.sha256(data).hexdigest()
        dest = OUT / Path(name).name
        if dest.exists():
            assert dest.read_bytes() == data, f'Source changed: {name}'
        else:
            dest.write_bytes(data)
    (OUT / 'source-hashes.json').write_text(json.dumps(hashes, indent=2))
    rows = json.loads((OUT / 'eval_set.json').read_text(encoding='utf-8-sig'))
    facts = {r['idx']: r for r in json.loads((OUT / 'multi.json').read_text(encoding='utf-8-sig'))}
    assert len(rows) == len({r['idx'] for r in rows}) == 100
    assert all(r['idx'] in facts for r in rows)
    cases = []
    for r in rows:
        f = facts[r['idx']]
        up = (f"From: {r.get('from','')}\nSubject: {r.get('subject','')}\n\n"
              f"Body:\n{r.get('snippet','')}\n\nExtracted facts:\n"
              f"- relationship: {ns['ROLE'].get(f.get('party','other'), 'an external party')}\n"
              f"- topic: {f.get('topic','')}\n- who: {r.get('from','')}\n"
              f"- what: {f.get('what','')}\n- when: {f.get('when','none')}")
        cases.append({'idx': r['idx'], 'messages': [{'role':'system','content':ns['SYS']},{'role':'user','content':up}], 'who':r.get('from',''), 'what':f.get('what',''), 'when':f.get('when','none')})
    (OUT / 'inputs.json').write_text(json.dumps(cases, ensure_ascii=False, indent=2), encoding='utf-8')
    return cases

def main():
    cases = prepare()
    mode = sys.argv[1]
    if mode == 'prepare':
        print('Validated and snapshotted 100 identical input pairs.')
        return
    import torch
    import transformers
    from transformers import AutoTokenizer, AutoModel, AutoModelForCausalLM, BitsAndBytesConfig
    torch.set_num_threads(4)
    dream = mode == 'dream'
    base = ROOT / 'model' if dream else Path('C:/Users/qblaa/.cache/huggingface/hub/models--Qwen--Qwen3-4B-Instruct-2507/snapshots/cdbee75f17c01a7cc42f958dc650907174af0554')
    tok = AutoTokenizer.from_pretrained(str(base), trust_remote_code=dream, local_files_only=True)
    kw = dict(torch_dtype=torch.bfloat16, device_map={'':0}, local_files_only=True)
    if dream:
        kw.update(trust_remote_code=True, attn_implementation='sdpa', quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True))
        model = AutoModel.from_pretrained(str(base), **kw).eval()
        model.config.use_cache = False
        profiles = [('dream32',32), ('dream160',160)]
    else:
        from peft import PeftModel
        model = AutoModelForCausalLM.from_pretrained(str(base), **kw)
        model = PeftModel.from_pretrained(model, str(SOURCE / 'models/summary_grounded4b_pp'), local_files_only=True).eval()
        profiles = [('qwen4b_pp',0)]
    print(json.dumps({'loaded':mode,'torch':torch.__version__,'transformers':transformers.__version__}), flush=True)
    for name, steps in profiles:
        path = OUT / (name + '.jsonl')
        done = {r['idx'] for r in map(json.loads, path.read_text(encoding='utf-8').splitlines())} if path.exists() else set()
        with path.open('a', encoding='utf-8') as log:
            for c in cases:
                if c['idx'] in done:
                    continue
                enc = tok.apply_chat_template(c['messages'], enable_thinking=False, add_generation_prompt=True, return_tensors='pt', return_dict=True).to('cuda')
                plen = enc.input_ids.shape[1]
                assert not dream or plen + 160 <= 2048
                torch.manual_seed(42)
                torch.cuda.reset_peak_memory_stats()
                torch.cuda.synchronize()
                start = time.perf_counter()
                with torch.inference_mode():
                    if dream:
                        g = model.diffusion_generate(enc.input_ids, attention_mask=enc.attention_mask, max_new_tokens=160, steps=steps, temperature=0.0, alg='entropy', alg_temp=0.0, output_history=False, return_dict_in_generate=True).sequences
                    else:
                        g = model.generate(**enc, max_new_tokens=160, do_sample=False, pad_token_id=tok.eos_token_id)
                torch.cuda.synchronize()
                elapsed = time.perf_counter() - start
                ids = g[0, plen:].tolist()
                stops = {tok.eos_token_id}
                stop = next((i for i,t in enumerate(ids) if t in stops),len(ids))
                raw = tok.decode(ids[:stop] if dream else ids, skip_special_tokens=True)
                parsed = ns['parse'](raw)
                try:
                    strict = json.loads(raw.strip())
                    strict = isinstance(strict,dict) and set(strict)=={'summary','why'} and all(isinstance(v,str) for v in strict.values())
                except ValueError:
                    strict = False
                rec = {k:c[k] for k in ('idx','who','what','when')}
                rec.update(parsed, raw=raw, token_ids=ids, strict_json=strict, seconds=elapsed, prompt_tokens=plen, content_tokens=stop, terminated=stop<len(ids), peak_gib=torch.cuda.max_memory_allocated()/1024**3)
                log.write(json.dumps(rec,ensure_ascii=False)+'\n'); log.flush()
                done.add(c['idx'])
                if len(done)%5==0:
                    print(json.dumps({'profile':name,'completed':len(done),'last_seconds':round(elapsed,2)}),flush=True)
    print('COMPLETE',flush=True)

if __name__ == '__main__':
    main()
