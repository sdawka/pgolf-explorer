# Gemma 4 Architecture Explorer — Local Reference Library

Downloaded sources backing the `gemma.html` explorer. All files are stored locally so you can read them offline on the Air.

## Papers (`papers/`)

| File | Topic | Node in explorer |
|------|-------|------------------|
| `sentencepiece_1808.06226.pdf` | Kudo & Richardson 2018 — SentencePiece tokenizer | Input Tokens |
| `weight-tying_1608.05859.pdf` | Press & Wolf 2017 — tied input/output embeddings | Token Embedding, Output Head |
| `rmsnorm_1910.07467.pdf` | Zhang & Sennrich 2019 — RMSNorm | Pre/Final RMSNorm |
| `pre-post-norm_2002.04745.pdf` | Xiong et al. 2020 — Pre vs Post norm stability | Pre-Attention RMSNorm |
| `gemma3-tech-report_2503.19786.pdf` | Google DeepMind 2025 — Gemma 3 (origin of 5:1 local/global pattern) | Decoder Block |
| `longformer_2004.05150.pdf` | Beltagy et al. 2020 — sliding-window attention | Local Sliding Attn |
| `gqa_2305.13245.pdf` | Ainslie et al. 2023 — Grouped-Query Attention | Local/Global Attn |
| `roformer-rope_2104.09864.pdf` | Su et al. 2021 — Rotary Position Embeddings | Global Attn |
| `qk-norm_2010.04245.pdf` | Henry et al. 2020 — Query/Key Normalization | Global Attn |
| `yarn_2309.00071.pdf` | Peng et al. 2023 — YaRN context extension | Context Extension |
| `self-extend_2401.01325.pdf` | Jin et al. 2024 — inference-time context extension | Context Extension |
| `glu-variants_2002.05202.pdf` | Shazeer 2020 — GeGLU / SwiGLU / ReGLU | MLP (GeGLU) |
| `switch-transformers_2101.03961.pdf` | Fedus et al. 2021 — Mixture of Experts | MoE Side Block |
| `mixtral_2401.04088.pdf` | Jiang et al. 2024 — Mixtral (modern MoE reference point) | MoE Side Block |
| `siglip_2303.15343.pdf` | Zhai et al. 2023 — SigLIP vision encoder | Vision Encoder |
| `qlora_2305.14314.pdf` | Dettmers et al. 2023 — 4-bit fine-tuning | Unsloth LoRA |
| `llm-int8_2208.07339.pdf` | Dettmers et al. 2022 — int8 quantization foundations | QAT / Quantization |

## Web articles (`web/`)

| File | Source | Why it's here |
|------|--------|---------------|
| `hf-blog-gemma4.html` | huggingface.co/blog/gemma4 | Official Gemma 4 launch post |
| `hf-model-card-gemma4-E4B.html` | huggingface.co/google/gemma-4-E4B | Canonical E4B model card |
| `visual-guide-gemma4.html` | Maarten Grootendorst newsletter | Best single explainer of PLE + MoE-parallel design |
| `visual-guide-quantization.html` | Maarten Grootendorst newsletter | Visual primer on int4/GPTQ/AWQ |
| `illustrated-transformer.html` | Jay Alammar | Attention / GQA intuition |
| `illustrated-word2vec.html` | Jay Alammar | Embedding + weight tying intuition |
| `ollama-gemma4.html` | ollama.com/library/gemma4 | Quickstart commands for local run |
| `unsloth-docs.html` | docs.unsloth.ai | LoRA / QLoRA fine-tuning recipes |
| `llamacpp-readme.md` | github.com/ggerganov/llama.cpp | GGUF flags, KV cache options |
| `mlx-lm-readme.md` | github.com/ml-explore/mlx-lm | Apple Silicon inference + LoRA |

## Not downloaded (media / live resources)

These are linked from the explorer but can't be faithfully saved as files:

- **Karpathy — "Let's build the GPT Tokenizer"** — YouTube (video): https://www.youtube.com/watch?v=zduSFxRajkE
- **mlx-community on HF** — live model index: https://huggingface.co/mlx-community
- **Google DeepMind Gemma 4 landing page** — live: https://deepmind.google/models/gemma/gemma-4/

## Quick offline workflow on a MacBook Air

```bash
# read a paper
open gemma-references/papers/gemma3-tech-report_2503.19786.pdf

# read a web article (opens in default browser, fully offline)
open gemma-references/web/visual-guide-gemma4.html
```
