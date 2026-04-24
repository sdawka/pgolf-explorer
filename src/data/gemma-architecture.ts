// @ts-nocheck

export const CATEGORIES = {
  embedding:     { color:'#4A90D9', label:'Embedding' },
  normalization: { color:'#7B68EE', label:'Normalization' },
  attention:     { color:'#E8834A', label:'Attention' },
  mlp:           { color:'#50C878', label:'MLP / FFN' },
  structural:    { color:'#CD853F', label:'Structural' },
  output:        { color:'#DC4C64', label:'Output' },
  hacking:       { color:'#39d98a', label:'Hack it' },
};

// Variants = the four Gemma 4 sizes. "score" column is a rough q4 BPB-ish stand-in;
// we use it to show where each variant sits on the quality/footprint tradeoff.
export const SUBMISSIONS = [
  { id:'e2b',   label:'E2B (edge)',     score:'~2B act', ctx:'128K', layers:'35',    ramQ4:'~1.5GB' },
  { id:'e4b',   label:'E4B (edge)',     score:'~4B act', ctx:'128K', layers:'42',    ramQ4:'~3.2GB' },
  { id:'moe',   label:'26B-A4B (MoE)',  score:'4B act',  ctx:'256K', layers:'30',    ramQ4:'~14GB'  },
  { id:'dense', label:'31B (dense)',    score:'31B',     ctx:'256K', layers:'60',    ramQ4:'~18GB'  },
];

export const NODES = [
  {
    id:'input_tokens', label:'Input Tokens', sublabel:'SentencePiece 262K', category:'embedding',
    details:{
      analogy:'Before the model can think about your text, it has to chop it into puzzle pieces and give each piece a number. Gemma 4 knows 262,144 possible pieces — enough to cover 140+ languages without needing a separate model per language.',
      whatItDoes:'Text is tokenized with a large 262,144-entry SentencePiece vocabulary covering 140+ languages. Each token becomes an integer ID. Gemma 4 keeps the same tokenizer across all four variants so embeddings and fine-tunes transfer cleanly.',
      whyItMatters:'A 262K vocab is huge — the embedding table alone is hundreds of MB in fp16. This is precisely why E2B/E4B invent Per-Layer Embeddings: the "weight" lives on disk, but activations stay small. Multilingual coverage comes from tokenizer breadth, not extra parameters.',
      keyParams:{ vocab_size:'262144', tokenizer:'SentencePiece BPE', max_seq:'128K (E2B/E4B), 256K (26B/31B)' },
      hackIt:[
        'Use the exact same tokenizer Google ships (`google/gemma-4-E4B` on HF) — never reuse Gemma 2/3 tokenizers, vocab ids shifted.',
        'For low-RAM fine-tunes, freeze the embedding matrix — it\'s ~40% of E4B params and almost never needs to move for adapter fine-tunes.',
        'If you only need English, you can sparsify the unused vocab rows before quantization and save ~100MB on disk (community trick).',
      ],
      alternatives:['Byte-level BPE (GPT-style)', 'Tiktoken-style larger vocab', 'Language-specific pruned vocabs'],
      studyFurther:[
        {topic:'Let\'s build the GPT Tokenizer — Karpathy', url:'https://www.youtube.com/watch?v=zduSFxRajkE'},
        {topic:'SentencePiece paper — Kudo & Richardson 2018', url:'https://arxiv.org/abs/1808.06226'},
      ]
    },
    changes:{
      moe:'Same tokenizer, but sequence length extended to 256K during long-context SFT stage.',
      dense:'Same tokenizer, 256K context.',
    }
  },
  {
    id:'tok_emb', label:'Token Embedding', sublabel:'262144 × d_model, tied', category:'embedding',
    details:{
      analogy:'A giant dictionary where every word has a "vibe vector" — a list of 2,560 numbers that captures its meaning. The same dictionary is used both to read input words and to pick output words, which saves a huge amount of memory.',
      whatItDoes:'Standard lookup table mapping each token id to a d_model-dimensional vector. Gemma 4 ties this matrix to the output head (weight tying), so the same parameters decode logits at the top of the stack. d_model is 2048 for E2B, 2560 for E4B, larger for 26B/31B.',
      whyItMatters:'With a 262K vocab, this table dominates the static parameter count. Weight tying halves the cost. For E2B, the embedding alone is ~500MB in bf16 — bigger than the rest of the "active" weights combined.',
      keyParams:{ shape_E4B:'[262144, 2560]', dtype:'bf16 train, int4/int8 ship', tied:'Yes' },
      hackIt:[
        'Load Gemma 4 in llama.cpp with `--gguf-quant Q4_K_M` — the token embedding is auto-stored in Q6_K so you don\'t destroy quality at the vocab lookup.',
        'On MLX, use `mlx_lm.convert --q-bits 4 --q-group-size 64` — fits E4B in ~3GB of unified memory, runs on an 8GB M1 Air.',
        'If fine-tuning with LoRA, leave `embed_tokens` OUT of target_modules. Saves ~30% of optimizer RAM.',
      ],
      alternatives:['Untied input/output embeddings', 'Factorized embeddings (ALBERT-style)', 'PLE-only (no global token embedding at all)'],
      studyFurther:[
        {topic:'Weight Tying — Press & Wolf 2017', url:'https://arxiv.org/abs/1608.05859'},
        {topic:'Illustrated Word2Vec — Jay Alammar', url:'https://jalammar.github.io/illustrated-word2vec/'},
      ]
    },
    changes:{
      moe:'Wider d_model (~4096). Not tied with expert weights — only with the shared output head.',
      dense:'d_model ~5120, tied output head.',
    }
  },
  {
    id:'ple', label:'Per-Layer Embeddings', sublabel:'E2B/E4B only — THE trick', category:'embedding',
    details:{
      analogy:'Imagine an office building where every floor keeps its own private notebook about every person who enters — what the reception desk knows is different from what the legal floor knows. Instead of cramming everything into one shared fat notebook, each of Gemma\'s layers has its own thin one. That\'s how E4B feels much smarter than its "active" size suggests.',
      whatItDoes:'Each decoder layer has its OWN small embedding table (typically 256-dim per token). At runtime, every layer looks up a layer-specific vector for the current token and mixes it into the residual stream. The tables are large on disk but only a tiny slice is touched per step — pure memory lookup, no matmul.',
      whyItMatters:'This is how Google decouples "capacity" from "compute". E4B has the knowledge footprint of a much bigger model because each layer gets its own specialized per-token signal, but the effective active parameter count stays near 4B. It\'s the single reason E4B punches far above its weight on-device.',
      keyParams:{ per_layer_dim:'256', tables:'one per decoder layer', total_PLE_params_E4B:'~1.5B', active_lookup:'~256 floats/token/layer' },
      hackIt:[
        'PLE tables are the BIGGEST part of the on-disk file. In llama.cpp they land in a separate tensor group — you can mmap them from SSD and keep only the layers you\'re currently decoding in RAM. Huge win on 8GB Airs.',
        'If you fine-tune, DO NOT touch PLE tables unless you have a lot of data — they encode Google\'s multilingual pretraining and are very easy to corrupt.',
        'Experiment idea: prune PLE rows for unused languages. Community scripts exist that lop 30-40% off the file size for English-only use cases.',
        'Ollama/LM Studio handle PLE transparently — no special flags needed, it\'s baked into the gemma4 GGUF format.',
      ],
      alternatives:['Adapter layers (LoRA) — smaller, but need training', 'Mixture of Experts (26B-A4B path)', 'Hypernetworks', 'Standard dense layers (what 31B does)'],
      studyFurther:[
        {topic:'A Visual Guide to Gemma 4 — Maarten Grootendorst', url:'https://newsletter.maartengrootendorst.com/p/a-visual-guide-to-gemma-4'},
        {topic:'Gemma 4 HF model card (E4B)', url:'https://huggingface.co/google/gemma-4-E4B'},
      ]
    },
    changes:{
      moe:'NOT USED. 26B-A4B uses MoE blocks instead — a totally different capacity-vs-compute tradeoff.',
      dense:'NOT USED. 31B is a plain dense transformer, no PLE.',
    },
    advanced:true
  },
  {
    id:'pre_norm', label:'Pre-Attention RMSNorm', category:'normalization',
    details:{
      analogy:'A volume knob that resets the loudness of every word-vector to a consistent level before the next step. Without it, some numbers would get louder and louder as they pass through dozens of layers and eventually blow out the speakers.',
      whatItDoes:'Classic RMSNorm: normalize each vector by its RMS magnitude, multiply by a learned per-dim scale. Applied before the attention sub-layer. Gemma 4 uses a learned scale initialized to 1.0 (with a +1 offset trick inherited from Gemma 2: `(1 + weight) * normed_x`).',
      whyItMatters:'Pre-norm placement makes very deep residual stacks trainable without warmup gymnastics. The +1 init trick makes the weight matrix safe to initialize near zero, improving optimizer stability on TPU.',
      keyParams:{ eps:'1e-6', learned_scale:'yes (+1 offset)', placement:'pre sub-layer' },
      hackIt:[
        'When quantizing, ALWAYS keep norm weights in fp16 or fp32 — they\'re tiny (a few KB) and breaking them tanks perplexity.',
        'Unsloth/PEFT will skip these by default; don\'t override that.',
      ],
      alternatives:['LayerNorm', 'QK-Norm only', 'Post-norm (original Transformer)'],
      studyFurther:[
        {topic:'RMSNorm — Zhang & Sennrich 2019', url:'https://arxiv.org/abs/1910.07467'},
        {topic:'Pre vs Post Norm — Xiong et al. 2020', url:'https://arxiv.org/abs/2002.04745'},
      ]
    },
    changes:{}
  },
  {
    id:'decoder_block', label:'Decoder Block', sublabel:'×N, 4:1 (E2B) / 5:1 (E4B/26B/31B)', category:'structural',
    details:{
      analogy:'One floor of the building, repeated many times (35 for E2B, 42 for E4B, 30 for 26B-A4B, 60 for 31B). Each floor has the same layout (attention, then thinking, then cleanup) but learns to specialize on a different job. Most floors only talk to nearby words; every 5th or 6th floor talks to the whole document.',
      whatItDoes:'The core Transformer block, repeated N times: 35 for E2B, 42 for E4B, 30 for 26B-A4B, 60 for 31B. E2B uses a 4:1 sliding/global ratio; all other variants use 5:1. Each block does: PLE lookup → pre-norm → attention (local OR global, alternating per pattern) → post-norm → pre-MLP-norm → GeGLU MLP → post-MLP-norm → residual. Gemma 4 keeps the "double norm" pattern from Gemma 2 (norm before AND after each sub-layer).',
      whyItMatters:'The local/global interleave is THE reason long context is tractable on a laptop. Most layers only attend to a 512-token sliding window — quadratic cost in 512, not 128K. Only the global layers pay full cost. KV cache stays tiny.',
      keyParams:{ N_E2B:'35', N_E4B:'42', N_26B:'30', N_31B:'60', pattern_E2B:'4 local → 1 global', pattern_others:'5 local → 1 global', double_norm:'yes' },
      hackIt:[
        'For 128K-context inference on a MacBook Air, the global-attention layers are your bottleneck. llama.cpp now supports selective KV-cache quantization — drop global-layer KV to q4 and you\'ll still have room for long documents.',
        'To fine-tune cheaply, apply LoRA only to the GLOBAL layers — every 6th layer for E4B/26B/31B (5:1 pattern), or every 5th layer for E2B (4:1 pattern). You capture most of the long-range reasoning with a fraction of the adapter params.',
        'Experiment: rip out all global layers and re-train briefly. You get a "short-context only" variant that\'s ~15% faster but caps at ~512 tokens. Useful for embedded.',
      ],
      alternatives:['All-global attention (too expensive long-context)', 'All-local (can\'t do long-range reasoning)', 'Ring attention', 'Mamba / SSM blocks'],
      studyFurther:[
        {topic:'Gemma 3 technical report (5:1 pattern origin)', url:'https://arxiv.org/abs/2503.19786'},
        {topic:'Longformer — Beltagy et al. 2020', url:'https://arxiv.org/abs/2004.05150'},
        {topic:'Illustrated Transformer — Jay Alammar', url:'https://jalammar.github.io/illustrated-transformer/'},
      ]
    },
    changes:{
      moe:'Block contains BOTH a standard MLP and a parallel MoE block whose outputs are summed. Unusual design vs DeepSeek/Qwen.',
      dense:'Standard dense block, no MoE, no PLE.',
    }
  },
  {
    id:'local_attn', label:'Local Sliding Attn', sublabel:'window 512, 5 of every 6', category:'attention', isSub:true,
    details:{
      analogy:'Each word only gets to peek at the 512 words immediately before it — like reading with a sliding magnifying glass instead of the whole page at once. Cheap, fast, and catches most grammar and local meaning.',
      whatItDoes:'Grouped-Query Attention restricted to a 512-token sliding window (1024 for 26B/31B). Each token only attends to the 512 tokens immediately before it. Uses RoPE with base ≈10K for short-range positional precision.',
      whyItMatters:'Quadratic attention cost is bounded by window size, not sequence length. At 128K context, local layers do ~250× less work than a global layer would. This is the primary compute saving.',
      keyParams:{ window:'512 (E2B/E4B), 1024 (26B/31B)', kv_heads:'1 (E2B) / 2 (E4B) / 16 (31B)', rope_base:'10000', qk_norm:'yes' },
      hackIt:[
        'KV cache for local layers only needs to hold 512 tokens per layer — trivial. You can keep it all in fp16 even on a Raspberry Pi 5.',
        'If you run Gemma 4 under llama.cpp with flash-attn on Metal, local layers dispatch to a specialized SWA kernel. Make sure you\'re on a build from April 2026 or later.',
      ],
      alternatives:['Full attention (expensive)', 'Dilated window', 'Block-sparse', 'Linear attention (Performer)'],
      studyFurther:[
        {topic:'Longformer sliding window — Beltagy et al. 2020', url:'https://arxiv.org/abs/2004.05150'},
        {topic:'GQA paper — Ainslie et al. 2023', url:'https://arxiv.org/abs/2305.13245'},
      ]
    },
    changes:{
      moe:'Window enlarged to 1024.',
      dense:'Window enlarged to 1024.',
    }
  },
  {
    id:'global_attn', label:'Global Attn', sublabel:'p-RoPE, every 6th layer', category:'attention', isSub:true,
    details:{
      analogy:'The one layer where every word in a 128,000-word document can talk to every other word. It\'s hugely expensive, which is why only 1 in every 6 layers is allowed to do it. All long-range reasoning ("what did chapter 2 say that matters here?") happens through these rare layers.',
      whatItDoes:'Full causal attention over the entire sequence. Same GQA head layout as local layers but no window. Uses Proportional RoPE (p-RoPE): instead of rotating ALL frequency dimensions (full RoPE), only the first 25% of dimension pairs (partial_rotary_factor=0.25) receive positional encoding, preserving the remaining 75% as position-agnostic content dimensions. This makes the model robust to sequences longer than training length. The final layer of every Gemma 4 variant is always a global attention layer, guaranteeing one full-context pass at inference end. Also uses QK-Norm (RMSNorm applied to Q and K before the dot product). To reduce KV-cache cost further, the last N layers (18 for E4B, 20 for E2B) share K/V tensors with the preceding global layer instead of computing their own — eliminating redundant projections with minimal quality impact.',
      whyItMatters:'Global layers carry all long-range reasoning. p-RoPE is Gemma 4\'s answer to the extrapolation problem: instead of scaling ALL rotary frequencies (YaRN-style), only the first 25% of dimension pairs get positional encoding, preserving short-range fidelity in the remaining dimensions. QK-Norm replaces Gemma 2\'s logit soft-cap — it\'s cheaper and more stable.',
      keyParams:{ window:'full', rope:'p-RoPE, partial_rotary_factor=0.25', rope_theta:'1000000 (vs 10000 local)', final_layer:'always global', num_kv_shared_layers:'18 (E4B) / 20 (E2B) layers reuse prior K,V', qk_norm:'RMSNorm on Q,K' },
      hackIt:[
        'LONG-CONTEXT LAPTOP TRICK: quantize global-layer KV cache to q4_0, keep local KV in fp16. `llama.cpp --kv-cache-type-global q4_0`. Fits 128K context in ~4GB on E4B.',
        'The `num_kv_shared_layers` sharing means the last ~18 layers in E4B have no KV cache of their own — quantization and memory budgeting tools that account for this will estimate cache size more accurately.',
        'If you want to experiment with context extension beyond 128K, p-RoPE lets you scale ONLY the already-scaled frequencies further — much safer than naive YaRN on Gemma.',
        'QK-Norm means you can ablate the soft-cap code path entirely if you\'re porting from a Gemma 2 fork. Cleaner, faster.',
      ],
      alternatives:['Logit soft-cap (Gemma 2 style)', 'YaRN / ABF RoPE scaling', 'NoPE (no position)', 'ALiBi'],
      studyFurther:[
        {topic:'RoFormer / RoPE — Su et al. 2021', url:'https://arxiv.org/abs/2104.09864'},
        {topic:'QK-Norm — Henry et al. 2020', url:'https://arxiv.org/abs/2010.04245'},
        {topic:'YaRN context extension — Peng et al. 2023', url:'https://arxiv.org/abs/2309.00071'},
      ]
    },
    changes:{}
  },
  {
    id:'mlp', label:'MLP (GeGLU)', sublabel:'gated, 8× expand', category:'mlp', isSub:true,
    details:{
      analogy:'After the "talking to other words" step, each word goes off alone into a little factory to think. The factory briefly expands the word into an 8×-bigger scratch space, processes it, then compresses it back down. Most of the model\'s actual "knowledge" lives in these factories.',
      whatItDoes:'Gated MLP: three linear projections (gate, up, down). Compute `down( gelu(gate(x)) * up(x) )`. Expansion ratio ~8× d_model (vs. the classic 4×). Same recipe as Gemma 2/3.',
      whyItMatters:'The MLP is where most dense parameters live. Going 8× wide with GeGLU gives more representational capacity than 4× with plain GELU at similar compute, because the gating allows multiplicative interactions.',
      keyParams:{ activation:'GeGLU', expand:'~8×', projections:'gate, up, down' },
      hackIt:[
        'LoRA target list for cheap fine-tunes: `["gate_proj", "up_proj", "down_proj"]` at rank 16. Covers ~90% of adaptable capacity. Unsloth default.',
        'These three matrices are the biggest dense tensors — they benefit most from int4 quantization. llama.cpp Q4_K_M puts them in 4-bit with tiny quality loss.',
        'For really aggressive compression, try AWQ or GPTQ — the MLP projections handle 3-bit surprisingly well on Gemma.',
      ],
      alternatives:['SwiGLU (LLaMA)', 'Plain GELU', 'ReGLU', 'relu² (parameter-golf style)'],
      studyFurther:[
        {topic:'GLU Variants — Shazeer 2020', url:'https://arxiv.org/abs/2002.05202'},
        {topic:'Unsloth Gemma 4 fine-tuning guide', url:'https://huggingface.co/google/gemma-4-E4B'},
      ]
    },
    changes:{
      moe:'MoE block (128 experts, top-8 active) replaces the dense MLP entirely. Per-expert intermediate_size is 704.',
    }
  },
  {
    id:'moe_block', label:'MoE Side Block', sublabel:'26B-A4B only', category:'structural', advanced:true,
    details:{
      analogy:'A panel of 128 specialist experts that collectively ARE the feedforward layer. For every word, a tiny router picks the 8 experts most relevant to it, and their weighted outputs are the sole feedforward signal for that layer. The 26B model has ~26 billion "specialists" on staff but only calls 4 billion worth of them per word.',
      whatItDoes:'In the 26B-A4B variant, the standard dense MLP in every decoder layer is replaced by a Mixture-of-Experts block. A router picks 8 of 128 experts per token; their weighted outputs are the sole feedforward signal for that layer — there is no parallel dense MLP. Per-expert FFN width is 704 (vs. the full hidden_size of 2816), keeping each expert small while the ensemble provides large capacity.',
      whyItMatters:'MoE replaces the dense MLP entirely, giving sparse compute (only 8 of 128 experts activate per token) while retaining large total parameter capacity. Only 4B parameters activate per token despite 26B total.',
      keyParams:{ experts:'128', active:'8 (top-k)', moe_intermediate_size:'704', routing:'top-k softmax', replaces:'dense MLP entirely' },
      hackIt:[
        'The 26B-A4B is ~14GB in Q4_K_M. Fits on a 16GB M-series Mac with room for KV cache if you run short context.',
        'Expert-offload is supported in llama.cpp — with 128 experts and only 8 active per token, most experts are idle at any given step, making offloading very effective. Inactive experts live on SSD, active ones stream in. Viable on 8GB systems but slow (~3 tok/s).',
        'Fine-tuning experts individually is possible via PEFT but tricky — the router is frozen unless you explicitly unfreeze it.',
      ],
      alternatives:['Standard MoE (replaces MLP) — DeepSeek, Qwen', 'Switch Transformer (single expert)', 'Dense only (31B path)'],
      studyFurther:[
        {topic:'Switch Transformers — Fedus et al. 2021', url:'https://arxiv.org/abs/2101.03961'},
        {topic:'Mixtral of Experts — Jiang et al. 2024', url:'https://arxiv.org/abs/2401.04088'},
      ]
    },
    changes:{
      e2b:'NOT USED.', e4b:'NOT USED.', dense:'NOT USED.',
      moe:'Present in every layer.',
    }
  },
  {
    id:'vision_enc', label:'Vision Encoder', sublabel:'SigLIP-v2, var-aspect', category:'structural', advanced:true,
    details:{
      analogy:'An eyeball bolted onto the side of the model. It converts an image into a short sequence of "image words" that the main model reads alongside your text prompt. The default is 280 soft tokens, and both E2B/E4B and the larger 26B/31B variants support variable aspect ratios — no forced square crop.',
      whatItDoes:'Optional image tower (used by -it instruction-tuned variants). Based on SigLIP-v2 with variable aspect ratio support. The smaller encoder (hidden_size 768, 16 layers, ~150M params) is used for E2B/E4B; the larger encoder (hidden_size 1152, 27 layers, ~550M params) is used for 26B/31B. Default is 280 soft tokens per image across all variants, with 2D RoPE for positional encoding.',
      whyItMatters:'Two encoder sizes let Google tune the vision capacity to the text model it accompanies without wasting parameters. At 280 soft tokens per image, the vision tower adds meaningful visual context while keeping sequence length predictable for KV-cache budgeting.',
      keyParams:{ backbone:'SigLIP-v2', hidden_size:'768 (E2B/E4B) / 1152 (26B/31B)', layers:'16 (E2B/E4B) / 27 (26B/31B)', params:'~150M (E2B/E4B) / ~550M (26B/31B)', default_soft_tokens:'280', input_shape:'variable aspect ratio' },
      hackIt:[
        'Use `--vision-tokens 64` flag in llama.cpp for snappy multimodal chat on an Air. Bumps to 256 only when you actually need OCR-grade detail.',
        'The vision tower is separable — if you only need text, unload it via `--no-vision` and reclaim ~400MB.',
        'Fine-tuning vision+LLM jointly needs ~16GB VRAM minimum. Stick to text LoRA on Air-class hardware.',
      ],
      alternatives:['CLIP ViT-L/14', 'Fixed 224×224 crop (Gemma 3)', 'Tokenization-free pixel models'],
      studyFurther:[
        {topic:'SigLIP — Zhai et al. 2023', url:'https://arxiv.org/abs/2303.15343'},
        {topic:'Gemma 4 multimodal HF blog', url:'https://huggingface.co/blog/gemma4'},
      ]
    },
    changes:{}
  },
  {
    id:'audio_enc', label:'Audio Encoder', sublabel:'E2B/E4B only — USM conformer', category:'structural', advanced:true,
    details:{
      analogy:'A pair of ears bolted onto the small models. It converts speech or audio into a sequence of \"audio words\" that the text decoder reads alongside your prompt — the same way the vision encoder converts images into image words. Works natively for transcription, translation, and general audio Q&A.',
      whatItDoes:'A USM-style conformer (hidden_size 1024, 12 layers) that encodes raw audio into contextual embeddings, followed by 2D convolutional downsampling to shorten the sequence, then a linear projection to align with the text embedding space (1536 for E2B, 2560 for E4B). Exclusive to E2B/E4B — the larger 26B/31B variants are text+vision only.',
      whyItMatters:'Adds a complete speech modality without any additional decoder weights. The same quantized E4B checkpoint that fits in 3GB can transcribe audio, answer questions about it, and translate it — no separate ASR model needed.',
      keyParams:{ backbone:'USM-style conformer', hidden_size:'1024', conformer_layers:'12', output:'projected to d_model (1536/2560)', models:'E2B and E4B only' },
      hackIt:[
        'Pass audio via the standard HF `processor` for Gemma 4 — it handles chunking, feature extraction, and projection automatically.',
        'In llama.cpp, audio support requires a build from May 2026 or later with the `--audio` flag enabled.',
        'The audio encoder is separable: `--no-audio` unloads it and reclaims ~200MB if you only need text+vision.',
        'For transcription fine-tuning, freeze the conformer weights and LoRA only the projection layer. The conformer is already pretrained on massive audio data.',
      ],
      alternatives:['Whisper-style encoder (OpenAI)', 'wav2vec 2.0', 'Text-only (26B/31B path)'],
      studyFurther:[
        {topic:'USM — Universal Speech Model (Google)', url:'https://arxiv.org/abs/2303.01037'},
        {topic:'Gemma 4 HF blog — audio examples', url:'https://huggingface.co/blog/gemma4'},
      ]
    },
    changes:{
      moe:'NOT USED. 26B-A4B is text + vision only.',
      dense:'NOT USED. 31B is text + vision only.',
    }
  },
  {
    id:'final_norm', label:'Final RMSNorm', category:'normalization',
    details:{
      analogy:'One last volume-reset before the model commits to a word choice. Makes sure no single number is shouting loud enough to skew the final decision.',
      whatItDoes:'Last RMSNorm before the output projection. Same +1-offset learned-scale flavor as the internal norms.',
      whyItMatters:'Stabilizes logit magnitudes before the tied output projection so the softmax doesn\'t saturate.',
      keyParams:{ eps:'1e-6' },
      hackIt:['Leave in fp16 always. Cost is a rounding error; breaking it ruins sampling.'],
      alternatives:['LayerNorm', 'No final norm'],
      studyFurther:[{topic:'RMSNorm — Zhang & Sennrich 2019', url:'https://arxiv.org/abs/1910.07467'}]
    },
    changes:{}
  },
  {
    id:'output_head', label:'Output Head', sublabel:'tied to tok_emb', category:'output',
    details:{
      analogy:'The moment of truth: the model\'s final "thought" is compared against all 262,144 possible next words in the dictionary, and each word gets a score. Whichever word wins gets emitted. Because the comparison uses the SAME dictionary as the input step, the model gets this step for free.',
      whatItDoes:'Projects final hidden state to a logit per vocabulary token by multiplying with the transpose of the token embedding matrix (weight-tied). Gemma 4 removed Gemma 2\'s soft-cap — QK-Norm replaces it upstream.',
      whyItMatters:'Weight tying saves ~500MB on a 262K vocab. Removing soft-cap makes the output layer simpler and quantization-friendly.',
      keyParams:{ tied_to:'tok_emb', softcap:'REMOVED (was in Gemma 2)' },
      hackIt:[
        'If you see weird repetition issues on fine-tuned Gemma 4, double-check you didn\'t accidentally untie the output head — HF Trainer can do this silently if `tie_word_embeddings=false` sneaks into config.',
        'Temperature and top-p sampling work normally; no soft-cap means you might want slightly lower temperatures (0.7 vs Gemma 2\'s 0.9) for comparable determinism.',
      ],
      alternatives:['Untied head', 'Soft-capped logits (Gemma 2)', 'Adaptive softmax'],
      studyFurther:[{topic:'Weight Tying — Press & Wolf 2017', url:'https://arxiv.org/abs/1608.05859'}]
    },
    changes:{}
  },
  // ─── HACKING CATEGORY: the runtime/deploy nodes you care about ───
  {
    id:'hack_llamacpp', label:'llama.cpp / GGUF', sublabel:'universal runtime', category:'hacking',
    details:{
      analogy:'The universal duct tape of local AI. A single C++ program that runs Gemma 4 (and most other open models) on literally any device — laptop, phone, Raspberry Pi, old gaming PC. GGUF is the file format it eats.',
      whatItDoes:'llama.cpp is the de-facto runtime for running Gemma 4 on anything — Mac, Windows, Linux, phone, Raspberry Pi. It consumes GGUF files (quantized weight format) and runs on CPU, Metal, CUDA, Vulkan, or ROCm backends.',
      whyItMatters:'If you care about running Gemma 4 on a MacBook Air or a 5-year-old gaming GPU, llama.cpp is your answer. Ollama and LM Studio are friendlier wrappers around the same core.',
      keyParams:{ formats:'GGUF Q4_K_M / Q5_K_M / Q6_K / Q8_0', backend:'Metal on Mac, CUDA on NVIDIA', mem_E4B_Q4:'~3GB' },
      hackIt:[
        '**Fastest path**: `brew install ollama && ollama run gemma4:e4b`. Done. ~3GB download, runs on 8GB Air.',
        '**More control**: grab GGUF from `bartowski/gemma-4-E4B-GGUF` on HF, run with `llama-cli -m file.gguf -ngl 99 -c 8192`.',
        '**Long context**: add `--flash-attn --cache-type-k q4_0 --cache-type-v q4_0 -c 131072`. 128K context on ~6GB RAM.',
        '**Fine-tuned LoRA**: `--lora your-adapter.gguf` — hot-swap adapters without reloading base weights.',
      ],
      alternatives:['MLX (Mac-only, faster on Apple Silicon)', 'vLLM (server, needs GPU)', 'HF transformers (slow, full-precision)'],
      studyFurther:[
        {topic:'llama.cpp repo', url:'https://github.com/ggerganov/llama.cpp'},
        {topic:'Ollama', url:'https://ollama.com/library/gemma4'},
      ]
    },
    changes:{}
  },
  {
    id:'hack_mlx', label:'MLX (Apple Silicon)', sublabel:'M-series native', category:'hacking',
    details:{
      analogy:'Apple\'s own ML framework, built for M-series chips from scratch. Because the CPU and GPU share the same memory on Apple Silicon, MLX skips the usual copy-paste shuffle between them — which is why it\'s the fastest way to run (or fine-tune!) Gemma 4 on a MacBook Air.',
      whatItDoes:'Apple\'s native ML framework that uses unified memory directly — no copies between CPU and GPU. On M1/M2/M3/M4 Macs it typically beats llama.cpp by 20-40% on Gemma 4 inference and supports training/fine-tuning.',
      whyItMatters:'For MacBook Air users this is the fastest option. Also the only practical way to fine-tune Gemma 4 on an 8GB Air (LoRA, rank 8, batch 1).',
      keyParams:{ framework:'mlx / mlx-lm', install:'pip install mlx-lm', e4b_q4_ram:'~3GB' },
      hackIt:[
        '`pip install mlx-lm && mlx_lm.generate --model mlx-community/gemma-4-E4B-4bit --prompt "..."`',
        'Fine-tune with LoRA: `mlx_lm.lora --model ... --train --data ./data --iters 600`. Works on 8GB Air, ~1h for a small dataset.',
        'Convert your own: `mlx_lm.convert --hf-path google/gemma-4-E4B --q-bits 4 --q-group-size 64`.',
        'MLX supports PLE tables natively — no special handling needed, unlike some llama.cpp builds.',
      ],
      alternatives:['llama.cpp Metal backend', 'Core ML (Apple-proprietary, less flexible)'],
      studyFurther:[
        {topic:'mlx-lm repo', url:'https://github.com/ml-explore/mlx-examples/tree/main/llms'},
        {topic:'mlx-community on HF', url:'https://huggingface.co/mlx-community'},
      ]
    },
    changes:{}
  },
  {
    id:'hack_unsloth', label:'Unsloth LoRA', sublabel:'fast fine-tuning', category:'hacking',
    details:{
      analogy:'A "teach the model your vibe" toolkit. Instead of re-training the entire model (impossible on consumer hardware), it freezes the original weights and trains tiny "adapter" matrices that nudge the model\'s behavior. Cheap enough to do on a single gaming GPU in a few hours.',
      whatItDoes:'A fine-tuning stack that patches HF Transformers with custom CUDA/Metal kernels, 2-5× faster than vanilla PEFT with ~40% less memory. Supports QLoRA (4-bit base + fp16 adapters).',
      whyItMatters:'Only practical way to fine-tune E4B on a single consumer GPU (RTX 3060 12GB and up). For M-series Macs without NVIDIA, use MLX LoRA instead — Unsloth is CUDA-only as of April 2026.',
      keyParams:{ base:'4-bit nf4', adapters:'rank 8-32 LoRA', mem_E4B_qlora:'~10GB VRAM', speed:'~2× PEFT' },
      hackIt:[
        'Stock recipe: `FastLanguageModel.from_pretrained("unsloth/gemma-4-E4B-bnb-4bit")`, then standard HF Trainer loop.',
        'Target modules: `["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"]`. Skip `embed_tokens` and PLE.',
        'Rank 16 is the sweet spot for instruction tuning. Go to rank 32 only for domain adaptation with >50k examples.',
        'Export to GGUF at the end: `model.save_pretrained_gguf("out", quant_method="q4_k_m")` — ready for llama.cpp.',
      ],
      alternatives:['Vanilla PEFT+bitsandbytes (slower)', 'MLX LoRA (Mac)', 'Axolotl (multi-GPU)', 'torchtune'],
      studyFurther:[
        {topic:'Unsloth docs — Gemma fine-tuning', url:'https://docs.unsloth.ai/'},
        {topic:'QLoRA paper — Dettmers et al. 2023', url:'https://arxiv.org/abs/2305.14314'},
      ]
    },
    changes:{}
  },
  {
    id:'hack_quant', label:'QAT / Quantization', sublabel:'int4 ships', category:'hacking',
    details:{
      analogy:'Normally models store every weight as a high-precision decimal number (16 bits each). Quantization squeezes each weight into a 4-bit integer — basically rounding to one of 16 values. The model gets 4× smaller, runs 2–3× faster, and because Google trained Gemma 4 KNOWING this rounding would happen, it barely loses any smarts.',
      whatItDoes:'Google released official Quantization-Aware-Training checkpoints for Gemma 4, meaning the model was trained with simulated int4 rounding in-the-loop. Result: the "QAT" GGUFs preserve ~98% of bf16 quality at int4, versus ~94% for naive post-training quant.',
      whyItMatters:'For laptop hacking, quality at 4-bit is the whole game. QAT is why Gemma 4 feels sharper than equivalently-sized Llamas or Qwens when both are at Q4_K_M.',
      keyParams:{ official:'QAT int4 ckpts on HF', loss_vs_bf16:'~2%', file:'~3GB for E4B-QAT-Q4' },
      hackIt:[
        'Always prefer `google/gemma-4-E4B-QAT-q4` over `bartowski/...` community quants when available. Free quality.',
        'For experimentation, GPTQ and AWQ also work but tend to underperform the official QAT on Gemma 4 specifically.',
        'If you want to go sub-4-bit: try ExLlamaV2 at 3.0bpw. Quality degrades noticeably but fits E4B in ~2GB.',
      ],
      alternatives:['bitsandbytes 4-bit (training)', 'GPTQ', 'AWQ', 'ExLlamaV2 sub-4bit'],
      studyFurther:[
        {topic:'Visual Guide to Quantization — Grootendorst', url:'https://newsletter.maartengrootendorst.com/p/a-visual-guide-to-quantization'},
        {topic:'LLM.int8 — Dettmers et al. 2022', url:'https://arxiv.org/abs/2208.07339'},
      ]
    },
    changes:{}
  },
  {
    id:'hack_context', label:'Context Extension', sublabel:'p-RoPE scaling', category:'hacking',
    details:{
      analogy:'128,000 words of context is already a lot (a full novel), but you can stretch it further by telling the global-attention layers to "pretend positions are closer together than they really are". It works surprisingly well up to about 2× the native length before the model starts getting confused.',
      whatItDoes:'Gemma 4 ships with 128K context (E2B/E4B) or 256K (26B/31B). Because it uses Proportional RoPE, you can extend further by scaling only the already-scaled frequency subset — less risky than YaRN on other models.',
      whyItMatters:'For document QA, long chat history, codebase ingestion, context length is usually the first thing you run out of on a laptop. Knowing HOW to extend safely without re-training matters.',
      keyParams:{ native_ctx:'128K (E*)/256K (big)', extend_method:'p-RoPE scaling factor', safe_limit:'~2× native without fine-tune' },
      hackIt:[
        '**In llama.cpp**: `--rope-scaling linear --rope-scale 2.0` gets you to 256K on E4B. Quality degrades past that without fine-tuning.',
        '**KV cache q4** is how you actually *fit* long context in RAM. Cache dominates memory past 64K.',
        'Global layers are the position-sensitive ones — if you fine-tune for extended context, train ONLY the global-layer RoPE embeddings and attention. 10× cheaper than full fine-tune.',
      ],
      alternatives:['YaRN (generic)', 'Landmark attention', 'Self-Extend (inference-only)', 'Re-training on long docs'],
      studyFurther:[
        {topic:'YaRN — Peng et al. 2023', url:'https://arxiv.org/abs/2309.00071'},
        {topic:'Self-Extend — Jin et al. 2024', url:'https://arxiv.org/abs/2401.01325'},
      ]
    },
    changes:{}
  },
];

// ─── FUNCTIONAL ROLE GROUPINGS (plain-English "what it's FOR") ───
export const FUNCTIONS = [
  { id:'ingest',    label:'Getting words in',         analogy:'Translating text (and optionally images) into lists of numbers the model can actually do math on.', nodes:['input_tokens','tok_emb','ple','vision_enc','audio_enc'] },
  { id:'mix',       label:'Mixing info across words', analogy:'Letting each word peek at other words so it understands context. This is what "attention" means — and it\'s the only way words influence each other.', nodes:['local_attn','global_attn'] },
  { id:'think',     label:'Per-word thinking',        analogy:'After words exchange notes, each word goes off by itself to process what it just learned. Most of the model\'s stored knowledge lives here.', nodes:['mlp','moe_block'] },
  { id:'stabilize', label:'Keeping numbers sane',     analogy:'Invisible volume-reset steps that prevent signals from exploding or vanishing as they pass through many layers. Load-bearing despite being tiny.', nodes:['pre_norm','final_norm'] },
  { id:'scaffold',  label:'Structural wiring',        analogy:'The overall skeleton — many identical "floors" stacked on top of each other (35/42/30/60 depending on variant), with a rule that every 5th or 6th floor gets to see the whole document.', nodes:['decoder_block'] },
  { id:'decode',    label:'Picking the next word',    analogy:'Turning the final number-soup back into an actual word, chosen from the 262,144-word dictionary.', nodes:['output_head'] },
];

// ─── HACK × ARCH RELATIONSHIP MATRIX ───
// impact: 'high' = the hack fundamentally reshapes this part; 'medium' = important tweak;
// 'low' = the hack explicitly LEAVES this part alone (and that's worth knowing too).
export const HACK_MATRIX = [
  // llama.cpp / GGUF
  { hack:'hack_llamacpp', arch:'tok_emb',     label:'Q6_K quant',     impact:'medium' },
  { hack:'hack_llamacpp', arch:'mlp',         label:'Q4_K_M main',    impact:'high' },
  { hack:'hack_llamacpp', arch:'global_attn', label:'KV cache q4',    impact:'high' },
  { hack:'hack_llamacpp', arch:'local_attn',  label:'SWA kernel',     impact:'medium' },
  { hack:'hack_llamacpp', arch:'ple',         label:'mmap from SSD',  impact:'high' },
  // MLX
  { hack:'hack_mlx', arch:'tok_emb',    label:'4-bit group 64', impact:'high' },
  { hack:'hack_mlx', arch:'mlp',        label:'LoRA targets',   impact:'high' },
  { hack:'hack_mlx', arch:'local_attn', label:'Metal unified',  impact:'medium' },
  { hack:'hack_mlx', arch:'global_attn',label:'Metal unified',  impact:'medium' },
  { hack:'hack_mlx', arch:'ple',        label:'native support', impact:'high' },
  // Unsloth LoRA
  { hack:'hack_unsloth', arch:'mlp',         label:'LoRA r16 target', impact:'high' },
  { hack:'hack_unsloth', arch:'local_attn',  label:'q/k/v/o LoRA',    impact:'high' },
  { hack:'hack_unsloth', arch:'global_attn', label:'q/k/v/o LoRA',    impact:'high' },
  { hack:'hack_unsloth', arch:'tok_emb',     label:'FROZEN',          impact:'low' },
  { hack:'hack_unsloth', arch:'ple',         label:'FROZEN',          impact:'low' },
  // QAT / Quantization
  { hack:'hack_quant', arch:'mlp',         label:'QAT int4',     impact:'high' },
  { hack:'hack_quant', arch:'local_attn',  label:'int4 weights', impact:'medium' },
  { hack:'hack_quant', arch:'global_attn', label:'int4 weights', impact:'medium' },
  { hack:'hack_quant', arch:'pre_norm',    label:'KEEP fp16',    impact:'low' },
  { hack:'hack_quant', arch:'final_norm',  label:'KEEP fp16',    impact:'low' },
  // Context Extension
  { hack:'hack_context', arch:'global_attn', label:'p-RoPE scale 2x', impact:'high' },
  { hack:'hack_context', arch:'local_attn',  label:'unaffected',      impact:'low' },
];

export const HACK_COLS = ['hack_llamacpp','hack_mlx','hack_unsloth','hack_quant','hack_context'];

export const NODE_W = 210;
export const NODE_H = 44;
export const GAP_Y = 16;
export const SUB_NODE_W = 180;
export const SUB_NODE_H = 36;
export const SUB_GAP = 10;

export const FLOW = [
  'input_tokens',
  'tok_emb',
  'ple',
  'pre_norm',
  { block:'decoder_block', children:['local_attn','global_attn','mlp'] },
  'moe_block',
  'vision_enc',
  'audio_enc',
  'final_norm',
  'output_head',
  '__sep__',
  'hack_llamacpp',
  'hack_mlx',
  'hack_unsloth',
  'hack_quant',
  'hack_context',
];
