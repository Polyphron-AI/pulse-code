"""Download the official checkpoint at a recorded, immutable revision."""
import json
import hashlib
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent
repo = 'Dream-org/Dream-v0-Instruct-7B'
with urllib.request.urlopen(f'https://huggingface.co/api/models/{repo}?blobs=true', timeout=60) as response:
    info = json.load(response)
manifest = {'repo': repo, 'revision': info['sha']}
(ROOT / 'model-manifest.json').write_text(json.dumps(manifest, indent=2))
print(json.dumps(manifest), flush=True)
(ROOT / 'model').mkdir(exist_ok=True)

def download(entry):
    name = entry['rfilename']
    if not name.endswith(('.json', '.py', '.safetensors', '.txt', '.md', '.jinja')):
        return
    target = ROOT / 'model' / name
    expected = entry.get('lfs', {}).get('sha256')
    if target.exists() and target.stat().st_size == entry.get('size'):
        if not expected or hashlib.file_digest(target.open('rb'), 'sha256').hexdigest() == expected:
            print(f'Already verified: {name}', flush=True)
            return
    url = f"https://huggingface.co/{repo}/resolve/{info['sha']}/{name}"
    partial = target.with_suffix(target.suffix + '.partial')
    print(f'Downloading {name}', flush=True)
    digest = hashlib.sha256()
    count = 0
    with urllib.request.urlopen(url, timeout=180) as response, partial.open('wb') as out:
        while chunk := response.read(8 * 1024 * 1024):
            out.write(chunk)
            digest.update(chunk)
            count += len(chunk)
            if count % (512 * 1024 * 1024) == 0:
                print(f'{name}: {count / 1024**3:.1f} GiB', flush=True)
    if expected and digest.hexdigest() != expected:
        raise RuntimeError(f'SHA256 mismatch: {name}')
    if entry.get('size') is not None and count != entry['size']:
        raise RuntimeError(f'Size mismatch: {name}')
    partial.replace(target)
    print(f'Verified {name}: {count} bytes', flush=True)

with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(download, info['siblings']))
print('Download complete', flush=True)
