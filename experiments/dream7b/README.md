# Dream 7B local experiment

Read [EMAIL_COMPARISON.md](EMAIL_COMPARISON.md) for the completed 100-email
comparison against the existing fine-tuned Qwen 4B adapter. The earlier synthetic
tests are in [RESULTS.md](RESULTS.md).

This standalone experiment uses Dream-org/Dream-v0-Instruct-7B. It does not
change Pulse Code or use its database. Model weights, caches and the virtual
environment stay in this directory and are ignored by Git.

## Plan

- Download the official Instruct checkpoint and record its immutable revision.
- Inspect its custom Python implementation before loading it.
- Use NF4 quantization to fit the RTX 5080's 16 GB VRAM.
- Establish a mixed baseline using synthetic prompts and deterministic checks.
- Compare diffusion step counts and sampling strategies on identical prompts.
- Record raw outputs, correctness, elapsed generation time and GPU memory.

The first pass changes inference settings, not model weights. Fine-tuning should
follow a demonstrated failure pattern and use separate training and test data.
These small checks measure this experiment only, not general model capability.

## Hardware constraints

The reference Dream implementation recommends at least 20 GB GPU memory. This
machine has a 16 GB RTX 5080 with desktop applications already using some VRAM.
Quantized results are not a full precision baseline. CUDA 12.8 PyTorch is used
for Blackwell support; this is newer than Dream's original tested PyTorch.

Sources:
- https://github.com/DreamLM/Dream
- https://huggingface.co/Dream-org/Dream-v0-Instruct-7B

## Commands

Run from this directory using `.venv/Scripts/python.exe`.

Download: `.venv/Scripts/python.exe download.py`

Benchmark: `.venv/Scripts/python.exe benchmark.py`

Quick smoke test: `./run.ps1 --profiles fast --limit 1`

Custom prompt: `./run.ps1 --profiles fast --prompt 'Explain why the sky is blue.'`

The full comparison runs 128-step entropy decoding, 32-step entropy decoding,
32-step margin decoding, optimized 32-step margin decoding, and 32-step entropy
decoding with a JSON-focused system prompt. A later `structured_quality` profile
uses the same system prompt with 128 steps. All use greedy token selection and the same output allocation of 128
tokens. The baseline is our defined configuration, not a claim to reproduce the
paper's benchmarks or exact demo settings.

Results are written under `results/<UTC timestamp>/`. Exact JSON correctness
requires the entire answer to parse and match the expected value. Markdown
fences and extra commentary fail. Code tracing tests inspect returned answers;
the runner never executes generated code.

Content throughput counts only tokens before the first end token. Slot throughput
also appears in raw logs because diffusion allocates a fixed output length;
these are different measurements. Timing excludes loading and warmup, includes
generation and CUDA synchronization, and excludes final text decoding. Eight
synthetic checks and one run per configuration are exploratory evidence only.

`optimizations.py` replaces the full vocabulary sort used for greedy margin
confidence with top-2 selection. It retains the reference argmax tie-breaking.
The runner checks exact agreement on random FP32/BF16 logits and tied logits
before benchmarking. Original model files are not modified.

The separate `challenge-cases.json` covers cancellations, tentative owners,
deadline corrections, invoice arithmetic, task dependencies and Python aliasing.
Run it with `./run.ps1 --cases challenge-cases.json --profiles fast structured`.

`json_output.py` accepts JSON inside a single complete Markdown fence or inline
code span, and rejects malformed JSON or extra prose. Raw and normalized scores
are kept separate. Recompute combined scores with `.venv/Scripts/python.exe analyze.py`.

Use `--bits 8` for the optional int8 comparison. Neither configuration changes
the downloaded original weights. No weight fine-tuning has been performed.

Dependencies are recorded in `requirements-lock.txt` after installation.

## Frozen email comparison

The comparison uses the original email project's 100 inputs, shared encoder
facts, prompt construction, parser, and automatic scoring functions. It runs
Dream at 32 and 160 steps and Qwen with `summary_grounded4b_pp`, each with a
160-token output budget. It does not call the external preference judge.

Run these sequentially from this directory:

```powershell
& .venv/Scripts/python.exe email_compare.py dream
& .qwen-venv/Scripts/python.exe email_compare.py qwen
& .venv/Scripts/python.exe score_emails.py
```

Generation resumes existing completed rows. Private inputs and outputs are
under the ignored `email-comparison` directory; original source files remain
unchanged. The scorer uses an isolated copy of the installed embeddinggemma
model, starts its own localhost Ollama service, and stops that service afterward.

The separate Qwen environment overlays the shared GPU dependencies through
`.qwen-venv/Lib/site-packages/dream_shared.pth`; its additional package versions
are in `requirements-qwen.txt`. This preserves Dream's older Transformers version.
