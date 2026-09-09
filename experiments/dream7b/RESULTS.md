# Dream 7B local experiment, 9 September 2026

This report covers the earlier synthetic tests. See
[EMAIL_COMPARISON.md](EMAIL_COMPARISON.md) for the subsequent 100-email comparison
against the existing trained Qwen 4B model.

Dream runs locally on the RTX 5080. The strongest result in this small experiment
was short extraction with a JSON-focused prompt and limited Markdown removal.
Reasoning and task-state interpretation were unreliable. These results support
further experimentation, not unattended production use.

## Setup

- Official `Dream-org/Dream-v0-Instruct-7B`, revision
  `05334cb9faaf763692dcf9d8737c642be2b2a6ae`.
- Downloaded all four Safetensors shards, checking their SHA256 hashes against
  Hugging Face's file metadata. Total shard size: 15,231,271,864 bytes.
- RTX 5080, 16 GB VRAM; approximately 47.1 GiB physical RAM reported by psutil.
- Python 3.11.16, PyTorch 2.7.1+cu128, Transformers 4.46.2,
  bitsandbytes 0.48.2. Complete package versions: `requirements-lock.txt`.
- NF4 with double quantization and BF16 computation; a small int8 comparison.
- All generations ran offline with synthetic inputs. No Pulse Code database,
  mailbox, or application behavior was changed.
- 57 generations total, including the smoke test, across 14 distinct prompts.
  This is a small diagnostic suite, not a general capability benchmark.

## Initial eight checks

Same prompts, 128 allocated output tokens, greedy token selection, seed 42.
Timing excludes loading, warmup, tokenization and final decoding.

| Configuration | Strict JSON and correct | Correct after fence removal | Mean generation time | Peak CUDA allocation |
|---|---:|---:|---:|---:|
| Entropy, 128 steps | 3/8 | 5/8 | 8.63 s | 5.47 GiB |
| Entropy, 32 steps | 1/8 | 3/8 | 2.16 s | 5.47 GiB |
| Margin, 32 steps | 2/8 | 6/8 | 2.22 s | 6.07 GiB |
| Optimized margin, 32 steps | 2/8 | 6/8 | 2.24 s | 6.07 GiB |
| JSON-focused prompt, entropy, 32 steps | 1/8 | 7/8 | 2.19 s | 5.48 GiB |

All seven non-arithmetic cases passed with the final configuration after fence
removal. The arithmetic task failed.

The Markdown parser accepts only plain JSON or one complete enclosing code
span/block. It does not repair malformed JSON, infer fields, or alter values.
Fence removal improves integration, not the model's reasoning. Raw outputs remain
available to distinguish formatting failures from substantive mistakes.

## Six harder follow-up checks

The same JSON-focused prompt was used. These cases were prepared before the
initial model results, and their expected answers were not supplied to Dream.

| Configuration | Strict correct | Correct after fence removal | Mean time |
|---|---:|---:|---:|
| 32 steps | 0/6 | 2/6 | 2.23 s |
| 128 steps | 0/6 | 3/6 | 8.78 s |

- Both preserved a tentative owner as null and used a corrected deadline.
- Both extracted an obsolete task despite an explicit cancellation in the current
  email. This is a substantive failure even when JSON formatting is ignored.
- Both got invoice arithmetic and Python list aliasing wrong.
- The slower configuration produced a usable dependency order. The faster one
  returned the right order inside an unfinished Markdown block, which our parser
  intentionally rejected.

## Quantization check

Int8 was tested on the arithmetic and task-extraction prompts only. At 128 steps
it still got the arithmetic and owner wrong. At 32 steps with the JSON-focused
prompt it got the owner right but arithmetic wrong, just as the NF4 configuration
did on those tasks after normalization.

Int8 averaged 21.25 s at 128 steps and 5.52 s at 32 steps, with up to 8.37 GiB CUDA
allocation. This limited comparison does not show an advantage for int8. It does
not prove that NF4 has no effect on other tasks. Full precision was not tested.

## Code optimization

The optional `margin_top2` sampler avoids sorting the entire vocabulary when only
the top two probabilities are needed. It preserves reference argmax tie-breaking.
Exact equivalence checks passed for random FP32/BF16 inputs and ties, and all eight
full-model answers matched the original margin sampler.

The isolated sampler calculation was about 5.87 times faster, but end-to-end
generation was not faster in this single run: 2.24 s versus 2.22 s. It remains an
optional experiment, not a demonstrated application speed improvement.

## Where to try it

| Use | Assessment | Practical boundary |
|---|---|---|
| Inbox labels and routing | Best candidate for a larger pilot | Only one simple routing example passed in the selected configuration; measure real categories on unseen messages. |
| Short text to JSON fields | Promising on simple inputs | Strip only known wrappers, validate schema, and reject invalid output. |
| Proposed tasks, owners and dates | Worth supervised fine-tuning research | Require review; cancellation handling failed. |
| Invoice or order field extraction | Worth a separate extraction pilot | Let ordinary code calculate totals; model arithmetic failed. |
| Short summaries and reply drafts | Plausible, not tested here | Measure factual omissions and invented commitments; human review. |
| Small coding assistance | Weak evidence for this checkpoint | Simple tracing passed, aliasing failed; evaluate Dream-Coder separately. |
| Multi-step reasoning or autonomous work | Poor fit in these tests | Do not rely on it to calculate, assign work or execute actions without independent checks. |

The next useful fine-tuning target would be a narrow message-to-proposed-task
schema with examples of cancellations, quoted history, changed deadlines and
unknown owners. Keep a separate unseen evaluation set. No weight fine-tuning has
been performed in this experiment.

## Evidence and reproduction

- `analysis.json`: combined strict and normalized scores.
- `optimization-check.json`: isolated sampler measurement.
- `results/20260909T205611Z/`: NF4 smoke test.
- `results/20260909T205720Z/`: five-configuration initial comparison.
- `results/20260909T210223Z/`: limited int8 comparison.
- `results/20260909T210447Z/`: harder follow-up comparison.
- Each result directory contains the exact prompts, model revision, configuration,
  raw answers, timings and memory readings.

Run from this folder:

```powershell
./run.ps1 --profiles structured
./run.ps1 --profiles structured structured_quality --cases challenge-cases.json
./run.ps1 --bits 8 --profiles baseline structured --limit 2
./run.ps1 --profiles structured --prompt 'Extract the owner and deadline from this message: ...'
.venv/Scripts/python.exe analyze.py
.venv/Scripts/python.exe check_json_output.py
```

Model loading took about 51-68 seconds in NF4 and 117 seconds in int8. A persistent
service could amortize that cost, but no service was started. Allocation figures
exclude other applications and driver overhead. Generation uses fixed output
slots; raw slot throughput is not equivalent to useful answer-token throughput.
There was one timed run per case/configuration, no full-precision baseline, no
competing model comparison, and no evaluation on actual user email.
