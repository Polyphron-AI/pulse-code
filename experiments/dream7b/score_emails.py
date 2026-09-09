"""Reuse original metric functions without executing their write side effects."""
import collections
import json
import math
import os
import random
import re
import subprocess
import time
from pathlib import Path
import requests
from email_compare import OUT, definitions

def main():
    names = ['dream32','dream160','qwen4b_pp']
    rows = json.loads((OUT/'eval_set.json').read_text(encoding='utf-8-sig'))
    ids = [r['idx'] for r in rows]
    gold = {r['idx']:r['summary'] for r in json.loads((OUT/'golden_opus.json').read_text(encoding='utf-8-sig'))}
    assert len(ids)==len(set(ids))==len(gold)==100 and set(ids)==set(gold)
    preds = {n:[json.loads(s) for s in (OUT/(n+'.jsonl')).read_text(encoding='utf-8').splitlines()] for n in names}
    for n, ps in preds.items():
        assert len(ps)==100 and {p['idx'] for p in ps}==set(ids), n
        preds[n] = {p['idx']:p for p in ps}
    rng = random.Random(13)
    blind, key = [], {}
    for row in rows:
        i = row['idx']
        order = ['dream160','qwen4b_pp']
        rng.shuffle(order)
        pair = {'idx':i,'email':row}
        for label,name in zip(('A','B'),order):
            pair[label]={k:preds[name][i][k] for k in ('summary','why')}
        blind.append(pair)
        key[str(i)] = dict(zip(('A','B'),order))
    (OUT/'blind-review.json').write_text(json.dumps(blind,ensure_ascii=False,indent=2),encoding='utf-8')
    (OUT/'blind-review-key.json').write_text(json.dumps(key,indent=2))
    http = requests.Session()
    http.trust_env = False
    ns = dict(re=re, math=math, random=random, requests=http, BOOT=2000, SEED=7,
              EMBED_PREFIX='title: none | text:', EMBED_MODEL='embeddinggemma', OLLAMA='http://127.0.0.1:11439')
    definitions(OUT/'score_model.py', {'toks','rouge1','rougeL','embed','cos','boot_ci'}, ns)
    definitions(OUT/'eval_struct_score.py', {'REF','MONEY','DATE','norm','present'}, ns)
    env = os.environ.copy()
    local_home = OUT/'ollama-home'
    local_home.mkdir(exist_ok=True)
    env.update(OLLAMA_HOST='127.0.0.1:11439', OLLAMA_MODELS=str(OUT/'ollama-models'), OLLAMA_NO_CLOUD='1', OLLAMA_KEEP_ALIVE='0', USERPROFILE=str(local_home))
    # Refuse to take ownership of an existing service on the chosen port.
    import socket
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',11439))
    log = (OUT/'ollama.log').open('w')
    proc = subprocess.Popen(['C:/Users/qblaa/AppData/Local/Programs/Ollama/ollama.exe','serve'],env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
    (OUT/'ollama-owned-pid.json').write_text(json.dumps({'pid':proc.pid}))
    try:
        for _ in range(120):
            if proc.poll() is not None:
                raise RuntimeError('Isolated Ollama exited; inspect log')
            try:
                if http.get(ns['OLLAMA']+'/api/version',timeout=1).ok:
                    break
            except requests.RequestException:
                pass
            time.sleep(.5)
        else:
            raise RuntimeError('Isolated Ollama did not become ready')
        runtime = {'version':http.get(ns['OLLAMA']+'/api/version',timeout=5).json(),
                   'model':[m for m in http.get(ns['OLLAMA']+'/api/tags',timeout=5).json()['models'] if m['name'].split(':')[0]=='embeddinggemma']}
        assert len(runtime['model'])==1, 'Expected exactly one installed embeddinggemma model'
        (OUT/'embedding-runtime.json').write_text(json.dumps(runtime,indent=2))
        print('Embedding original references and all three prediction sets locally.',flush=True)
        vectors = {'gold':ns['embed']([gold[i] for i in ids])}
        for n in names:
            vectors[n]=ns['embed']([preds[n][i]['summary'] for i in ids])
            print('Embedded '+n,flush=True)
        assert all(len(vs)==100 for vs in vectors.values())
        dimensions={len(v) for vs in vectors.values() for v in vs}
        assert len(dimensions)==1 and next(iter(dimensions))>0
        assert all(math.isfinite(x) for vs in vectors.values() for v in vs for x in v)
        (OUT/'embeddings.json').write_text(json.dumps(vectors))
    finally:
        try:
            http.post(ns['OLLAMA']+'/api/embed',json={'model':'embeddinggemma','input':[],'keep_alive':0},timeout=20)
        except requests.RequestException:
            pass
        proc.terminate(); proc.wait(timeout=30); log.close()
    report = {'n':100,'reference':'golden_opus.json; summary only','models':{},'paired':{}}
    scores = {}
    for n in names:
        ps = preds[n]
        vals = {m:[] for m in ('sem','rougeL','rouge1')}
        peritem = {}
        for k,i in enumerate(ids):
            v = {'sem':ns['cos'](vectors[n][k],vectors['gold'][k]), 'rougeL':ns['rougeL'](ps[i]['summary'],gold[i]), 'rouge1':ns['rouge1'](ps[i]['summary'],gold[i])}
            peritem[str(i)]={m:round(x,5) for m,x in v.items()}
            for m,x in v.items(): vals[m].append(x)
        scores[n]=peritem
        (OUT/(n+'-peritem.json')).write_text(json.dumps(peritem,indent=2))
        result = {m:{'mean':sum(v)/100,'ci95':ns['boot_ci'](v)} for m,v in vals.items()}
        result.update(strict_json=sum(p['strict_json'] for p in ps.values()), nonempty_summary=sum(bool(p['summary']) for p in ps.values()), mean_seconds=sum(p['seconds'] for p in ps.values())/100, peak_gib=max(p['peak_gib'] for p in ps.values()), avg_summary_characters=sum(len(p['summary']) for p in ps.values())/100, no_eos=sum(not p['terminated'] for p in ps.values()))
        for label,fields in [('hybrid_coverage',('summary','who','what','when','why')),('generated_coverage',('summary','why'))]:
            cov = collections.defaultdict(lambda:[0,0])
            for r in rows:
                blob=' '.join(ps[r['idx']].get(k,'') for k in fields)
                email=f"{r.get('subject','')} {r.get('snippet','')}"
                for cat,rx in [('reference',ns['REF']),('amount',ns['MONEY']),('date',ns['DATE'])]:
                    found=set(m.group(0) for m in rx.finditer(email))
                    cov[cat][0]+=ns['present'](found,blob); cov[cat][1]+=len(found)
            cov['overall']=[sum(v[0] for v in cov.values()),sum(v[1] for v in cov.values())]
            result[label]={k:{'captured':v[0],'present':v[1],'rate':v[0]/v[1] if v[1] else 0} for k,v in cov.items()}
        report['models'][n]=result
    for n in names[:2]:
        report['paired'][n+' minus qwen4b_pp']={}
        for m in ('sem','rougeL','rouge1'):
            ds=[scores[n][str(i)][m]-scores['qwen4b_pp'][str(i)][m] for i in sorted(ids,key=str)]
            rng=random.Random(7)
            bs=sorted(sum(ds[rng.randrange(100)] for _ in range(100))/100 for _ in range(10000))
            report['paired'][n+' minus qwen4b_pp'][m]={'mean_difference':sum(ds)/100,'ci95':[bs[250],bs[9750]],'dream_higher':sum(d>1e-9 for d in ds),'qwen_higher':sum(d < -1e-9 for d in ds),'ties':sum(abs(d)<=1e-9 for d in ds)}
    (OUT/'scores.json').write_text(json.dumps(report,indent=2))
    lines = ['# Dream versus the trained email summarizer', '',
             'All 100 frozen email inputs (IDs 2800–2899), the original system/user prompts, shared ModernBERT facts, original parser, and 160-token output budget were used. No weights were trained in this comparison.', '',
             '| Model | Strict two-key JSON | Nonempty parsed summary | Semantic cosine | ROUGE-L | ROUGE-1 | Generation seconds/email |',
             '|---|---:|---:|---:|---:|---:|---:|']
    for n,r in report['models'].items():
        lines.append(f"| {n} | {r['strict_json']}/100 | {r['nonempty_summary']}/100 | {r['sem']['mean']:.4f} | {r['rougeL']['mean']:.4f} | {r['rouge1']['mean']:.4f} | {r['mean_seconds']:.2f} |")
    lines += ['', '## Original field coverage and generator-only coverage', '',
              '| Model | Original hybrid coverage | Generated summary + why coverage |', '|---|---:|---:|']
    for n,r in report['models'].items():
        a,b=(r[k]['overall'] for k in ('hybrid_coverage','generated_coverage'))
        lines.append(f"| {n} | {a['captured']}/{a['present']} ({100*a['rate']:.1f}%) | {b['captured']}/{b['present']} ({100*b['rate']:.1f}%) |")
    lines += ['', 'Hybrid coverage includes unchanged facts copied from the encoder. The original reference-number regex also matches ordinary long words; this score measures the original heuristic, not verified factual accuracy.', '', '## Paired semantic differences', '']
    for n,rs in report['paired'].items():
        r=rs['sem']; lo,hi=r['ci95']
        lines.append(f"- {n}: {r['mean_difference']:+.4f}, paired bootstrap 95% CI [{lo:+.4f}, {hi:+.4f}]; Dream higher on {r['dream_higher']} emails, Qwen higher on {r['qwen_higher']}, ties {r['ties']}.")
    lines += ['', '## Method and limits', '',
              '- Dream-v0-Instruct-7B: official pinned weights, NF4 double quantization with BF16 compute; entropy decoding, temperature 0, algorithm temperature 0, 32 or 160 steps, seed 42. EOS decoding follows the reference boundary; output token IDs are retained.',
              '- Qwen3-4B-Instruct-2507: cached BF16 base plus the existing unmerged summary_grounded4b_pp LoRA adapter, as in the original evaluation script. Greedy generation, original base tokenizer, thinking disabled. This is a comparison of deployable configurations; model architecture, domain training and precision differ.',
              '- Summary similarity uses the original golden_opus.json references, local embeddinggemma, and the exact title: none | text: prefix. Original metric functions are extracted from source without executing original write operations. Mean CIs use 2,000 bootstrap resamples; paired differences use rounded per-item scores and 10,000 resamples, seed 7.',
              '- Semantic cosine and ROUGE are reference-similarity measures, not factual-correctness percentages. Empty parsed summaries remain in the denominator. The original parser accepts JSON inside Markdown; strict JSON additionally requires exactly summary and why as strings.',
              '- Timing excludes loading, tokenization and decoding, uses CUDA synchronization, and includes first-call kernel warmup. Models run sequentially on the same RTX 5080. It is local latency, not a general diffusion-versus-autoregressive speed claim.',
              '- The original external Haiku preference judge was not rerun. A blinded local review file is prepared, but no preference win rate or full factual-accuracy score is claimed.',
              '- Private inputs, outputs, token IDs, embeddings, source hashes, adapter hashes, protocol metadata, per-item scores, and blind review files remain in the Git-ignored email-comparison directory. Original datasets and model files are read-only.',
              '- Preliminary runs with an additional chat-boundary stop are archived separately and excluded from final scores.', '',
              'Detailed scores: [scores.json](email-comparison/scores.json). Protocol: [protocol.json](email-comparison/protocol.json).', '']
    (OUT.parent/'EMAIL_COMPARISON.md').write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps(report,indent=2),flush=True)

if __name__=='__main__': main()
