# Dream versus the trained email summarizer

Decision: retain the existing trained Qwen 4B (`summary_grounded4b_pp`) for email analysis. Dream remains an experiment; this decision does not change application configuration.

All 100 frozen email inputs (IDs 2800–2899), the original system/user prompts, shared ModernBERT facts, original parser, and 160-token output budget were used. No weights were trained in this comparison.

| Model | Strict two-key JSON | Nonempty parsed summary | Semantic cosine | ROUGE-L | ROUGE-1 | Generation seconds/email |
|---|---:|---:|---:|---:|---:|---:|
| dream32 | 3/100 | 5/100 | 0.2137 | 0.0192 | 0.0219 | 4.04 |
| dream160 | 0/100 | 12/100 | 0.2324 | 0.0296 | 0.0352 | 20.41 |
| qwen4b_pp | 99/100 | 99/100 | 0.8530 | 0.5418 | 0.5999 | 8.55 |

## Original field coverage and generator-only coverage

| Model | Original hybrid coverage | Generated summary + why coverage |
|---|---:|---:|
| dream32 | 727/1263 (57.6%) | 15/1263 (1.2%) |
| dream160 | 742/1263 (58.7%) | 30/1263 (2.4%) |
| qwen4b_pp | 876/1263 (69.4%) | 520/1263 (41.2%) |

Hybrid coverage includes unchanged facts copied from the encoder. The original reference-number regex also matches ordinary long words; this score measures the original heuristic, not verified factual accuracy.

## Paired semantic differences

- dream32 minus qwen4b_pp: -0.6394, paired bootstrap 95% CI [-0.6644, -0.6116]; Dream higher on 0 emails, Qwen higher on 99, ties 1.
- dream160 minus qwen4b_pp: -0.6206, paired bootstrap 95% CI [-0.6491, -0.5899]; Dream higher on 0 emails, Qwen higher on 99, ties 1.

## Method and limits

- Dream-v0-Instruct-7B: official pinned weights, NF4 double quantization with BF16 compute; entropy decoding, temperature 0, algorithm temperature 0, 32 or 160 steps, seed 42. EOS decoding follows the reference boundary; output token IDs are retained.
- Qwen3-4B-Instruct-2507: cached BF16 base plus the existing unmerged summary_grounded4b_pp LoRA adapter, as in the original evaluation script. Greedy generation, original base tokenizer, thinking disabled. This is a comparison of deployable configurations; model architecture, domain training and precision differ.
- Summary similarity uses the original golden_opus.json references, local embeddinggemma, and the exact title: none | text: prefix. Original metric functions are extracted from source without executing original write operations. Mean CIs use 2,000 bootstrap resamples; paired differences use rounded per-item scores and 10,000 resamples, seed 7.
- Semantic cosine and ROUGE are reference-similarity measures, not factual-correctness percentages. Empty parsed summaries remain in the denominator. The original parser accepts JSON inside Markdown; strict JSON additionally requires exactly summary and why as strings.
- Timing excludes loading, tokenization and decoding, uses CUDA synchronization, and includes first-call kernel warmup. Models run sequentially on the same RTX 5080. It is local latency, not a general diffusion-versus-autoregressive speed claim.
- The original external Haiku preference judge was not rerun. A blinded local review file is prepared, but no preference win rate or full factual-accuracy score is claimed.
- Private inputs, outputs, token IDs, embeddings, source hashes, adapter hashes, protocol metadata, per-item scores, and blind review files remain in the Git-ignored email-comparison directory. Original datasets and model files are read-only.
- Preliminary runs with an additional chat-boundary stop are archived separately and excluded from final scores.

Detailed scores: [scores.json](email-scores.json). Protocol: [protocol.json](email-protocol.json).
