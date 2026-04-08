// @ts-nocheck

// ─── CATEGORIES ───
export const CATEGORIES = {
  embedding:     { color:'#4A90D9', label:'Embedding' },
  normalization: { color:'#7B68EE', label:'Normalization' },
  attention:     { color:'#E8834A', label:'Attention' },
  mlp:           { color:'#50C878', label:'MLP / FFN' },
  structural:    { color:'#CD853F', label:'Structural' },
  output:        { color:'#DC4C64', label:'Output' },
  training:      { color:'#708090', label:'Training' },
};

// ─── SUBMISSIONS ───
export const SUBMISSIONS = [
  { id:'baseline', label:'Naive Baseline', score:1.2244, date:'2026-03-17', layers:9, mlpMult:2 },
  { id:'sota',     label:'SOTA (10L Int5)', score:1.1428, date:'2026-03-20', layers:10, mlpMult:3 },
  { id:'rank2',    label:'#2 Int6+SmearGate', score:1.1458, date:'2026-03-20', layers:9, mlpMult:3 },
  { id:'rank3',    label:'#3 QAT Int6 11L', score:1.1502, date:'2026-03-19', layers:11, mlpMult:3 },
  { id:'smear',    label:'SmearGate+Ortho', score:1.1556, date:'2026-03-19', layers:9, mlpMult:3 },
  { id:'lora',     label:'LoRA TTT', score:1.1928, date:'2026-03-17', layers:9, mlpMult:2 },
];

// ─── NODE DATA ───
export const NODES = [
  {
    id:'input_tokens', label:'Input Token IDs', category:'embedding',
    details:{
      plainEnglish:'Text gets chopped up into small pieces (roughly word fragments), and each piece is swapped for a number. This challenge uses a tiny dictionary of only 1024 possible pieces, which is about 50x smaller than what regular language models use — a deliberate choice to save space.',
      whatItDoes:'Raw integer IDs from the tokenizer. Each text chunk is split into tokens (sub-word pieces) and mapped to integers 0-1023. For this challenge, a 1024-token SentencePiece BPE vocabulary is used \u2014 much smaller than typical LLMs (GPT-2 uses 50K).',
      whyItMatters:'The vocabulary size directly affects model size. A 1024-vocab embedding table is tiny (~512KB) vs a 50K-vocab one (~25MB). In a 16MB budget, this matters enormously. Smaller vocab means more tokens per byte of text, but each token carries less information.',
      keyParams:{ vocab_size:'1024', tokenizer:'SentencePiece BPE', seq_len:'1024 (baseline), 2048-4096 (advanced)' },
      alternatives:['Larger vocabulary (trades model size for fewer tokens)', 'Byte-level tokenization (no tokenizer needed)', 'Character-level (simple but long sequences)', 'Unigram tokenization (alternative to BPE)'],
      studyFurther:[
        {topic:'Let\'s build the GPT Tokenizer \u2014 Andrej Karpathy (YouTube, 2hr)', url:'https://www.youtube.com/watch?v=zduSFxRajkE'},
        {topic:'HuggingFace NLP Course: Tokenizers (BPE, WordPiece, Unigram)', url:'https://huggingface.co/learn/nlp-course/chapter6'},
        {topic:'N-gram Language Models \u2014 Jurafsky & Martin (free textbook ch.3)', url:'https://web.stanford.edu/~jurafsky/slp3/3.pdf'},
      ]
    },
    changes:{}
  },
  {
    id:'tok_emb', label:'Token Embedding', sublabel:'1024 \u00d7 512, tied', category:'embedding',
    details:{
      plainEnglish:'A big lookup table that turns each numbered word-piece into a list of 512 numbers the model can actually reason about. The same table is reused at the very end to pick the next word — so it does double duty, which is why good submissions keep it in high precision even while compressing everything else.',
      whatItDoes:'A lookup table with 1024 rows and 512 columns. Each token ID selects one row, producing a 512-dimensional vector. This is the model\'s only way to "see" text. The same weight matrix is reused at the output to predict tokens (weight tying), so it serves double duty.',
      whyItMatters:'Weight tying halves the embedding parameter cost. But it means quantization errors here compound \u2014 they affect both input understanding AND output predictions. This is why top submissions keep embeddings in fp16 instead of quantizing them.',
      keyParams:{ shape:'[1024, 512]', dtype:'bf16 compute, fp32 stored', tied:'Yes (shared with output)', init:'N(0, 0.005)' },
      alternatives:['Separate input/output embeddings (untied, costs 2x params)', 'Factored embeddings (low-rank decomposition)', 'Hash embeddings (multiple hash functions)', 'Adaptive embeddings (variable dim per frequency)'],
      studyFurther:[
        {topic:'The Illustrated Word2Vec \u2014 Jay Alammar (visual, start here)', url:'https://jalammar.github.io/illustrated-word2vec/'},
        {topic:'Weight Tying \u2014 Press & Wolf 2017 (short paper)', url:'https://arxiv.org/abs/1608.05859'},
        {topic:'Let\'s build GPT from scratch \u2014 Karpathy (embedding section ~0:15)', url:'https://www.youtube.com/watch?v=kCc8FmEb1nY'},
      ]
    },
    changes:{
      sota:'FP16 passthrough (not quantized). BigramHash + SmearGate add extra embedding signals.',
      rank2:'FP16 passthrough. BigramHash(4096) + SmearGate added.',
      rank3:'FP16 passthrough. No additional embedding tricks.',
      smear:'FP16 passthrough. SmearGate + BigramHash(4096) added.',
    }
  },
  {
    id:'bigram_hash', label:'BigramHash', sublabel:'advanced', category:'embedding', advanced:true,
    details:{
      plainEnglish:'A cheap shortcut for spotting two-word patterns. It takes each pair of consecutive word-pieces, hashes them into a bucket, and looks up a small feature vector for that bucket. This gives the model instant access to "these two words often go together" signals before the expensive layers even run.',
      whatItDoes:'Hashes each consecutive pair of tokens (a "bigram") into a learned embedding table. For example, tokens [42, 17] get hashed to bucket (42*31 + 17) % 10240, which looks up a 128-dim vector, then a linear layer projects it to 512-dim and adds it to the token embedding. This gives the model instant access to 2-token patterns without needing attention.',
      whyItMatters:'Attention is expensive and takes a full layer to see pairs. BigramHash injects bigram features at the embedding level for almost free. The SOTA uses 10240 buckets \u2014 with 1024 vocab, there are ~1M possible bigrams, so collisions are common but the model learns to use the hashed signal anyway.',
      keyParams:{ hash_buckets:'10240 (SOTA) / 4096 (#2)', embed_dim:'128', project_to:'512', scale_init:'0.05' },
      alternatives:['Trigram hash (3-token patterns, more params)', 'Character n-gram hashing (sub-token level)', 'Convolutional embedding layer (learned local patterns)', 'No bigram features (rely on attention for all context)'],
      studyFurther:[
        {topic:'Feature Hashing (the hashing trick) \u2014 scikit-learn docs', url:'https://scikit-learn.org/stable/modules/feature_extraction.html#feature-hashing'},
        {topic:'N-gram Language Models \u2014 Jurafsky & Martin (free textbook ch.3)', url:'https://web.stanford.edu/~jurafsky/slp3/3.pdf'},
        {topic:'A Primer on Neural Network Models for NLP \u2014 Goldberg (bridges classical + neural)', url:'https://arxiv.org/abs/1510.00726'},
      ]
    },
    changes:{
      sota:'BigramHash(10240 buckets, dim=128). XOR-based hash. Scaled by learnable param (init 0.05).',
      rank2:'BigramHash(4096 buckets, dim=128). Smaller table, more collisions.',
      smear:'BigramHash(4096 buckets, dim=128). Same as #2.',
    }
  },
  {
    id:'smear_gate', label:'SmearGate', sublabel:'advanced', category:'embedding', advanced:true,
    details:{
      plainEnglish:'A learned knob that blends a small amount of each word into the next one. It starts at almost pure "current word" and the model gradually learns how much of the previous word is worth mixing in, per dimension. Like BigramHash, it gives the model local context for almost free.',
      whatItDoes:'A learned per-dimension gate that blends each token\'s embedding with the previous token\'s embedding. Formula: output = (1 - sigmoid(gate)) * current + sigmoid(gate) * previous. The gate is initialized near 0.95 (almost identity), so the model starts with mostly the current token and gradually learns how much previous-token info to mix in.',
      whyItMatters:'Like BigramHash, this gives the model local (bigram) context before the expensive transformer layers. But SmearGate is continuous and differentiable \u2014 it learns *how much* of the previous token to blend, per dimension. Adds only ~512 parameters.',
      keyParams:{ gate_shape:'[512]', init:'~0.95 (near identity)', params:'~512' },
      alternatives:['Causal convolution (1D conv over token sequence)', 'Shift-and-add (deterministic blend)', 'No local context (let attention handle everything)', 'Multi-token smear (blend N previous tokens)'],
      studyFurther:[
        {topic:'Highway Networks \u2014 Srivastava et al. 2015 (learned gating, foundational)', url:'https://arxiv.org/abs/1505.00387'},
        {topic:'The Illustrated Transformer \u2014 Jay Alammar (gating context)', url:'https://jalammar.github.io/illustrated-transformer/'},
        {topic:'Gated Linear Units \u2014 Dauphin et al. 2017 (gating for sequence models)', url:'https://arxiv.org/abs/1612.08083'},
      ]
    },
    changes:{
      sota:'SmearGate added. Gate per dimension, init ~0.95. Applied after BigramHash.',
      rank2:'SmearGate added. Same design.',
      smear:'SmearGate added (this submission introduced it to the challenge).',
    }
  },
  {
    id:'post_emb_norm', label:'RMSNorm', sublabel:'post-embedding', category:'normalization',
    details:{
      plainEnglish:'Right after looking up the word vectors, this step rescales them so they all have roughly the same length. Without it, some vectors can be huge and others tiny, which makes training unstable. RMSNorm is a cheaper version of the standard normalization used in most transformers.',
      whatItDoes:'Normalizes each vector by its root-mean-square magnitude: x_norm = x / sqrt(mean(x\u00b2) + \u03b5). Unlike LayerNorm, it has no learnable scale or bias \u2014 it just makes all vectors roughly unit length. Applied immediately after the embedding lookup.',
      whyItMatters:'Without normalization, embedding vectors can have wildly different magnitudes, which makes training unstable. RMSNorm is cheaper than LayerNorm (no mean subtraction or learned params) and works just as well for transformers.',
      keyParams:{ eps:'1e-6', learnable_params:'None' },
      alternatives:['LayerNorm (adds learnable scale+shift, slightly more expensive)', 'BatchNorm (normalizes across batch, not used in transformers)', 'No normalization (risky, but some architectures skip it)', 'QK-Norm (normalize only Q and K in attention)'],
      studyFurther:[
        {topic:'RMSNorm paper \u2014 Zhang & Sennrich 2019 (short, explains why mean-centering is unnecessary)', url:'https://arxiv.org/abs/1910.07467'},
        {topic:'Pre-norm vs Post-norm \u2014 Xiong et al. 2020 (why pre-norm is more stable)', url:'https://arxiv.org/abs/2002.04745'},
        {topic:'Batch Normalization explained \u2014 Dive into Deep Learning (interactive textbook)', url:'https://d2l.ai/chapter_convolutional-modern/batch-norm.html'},
        {topic:'Let\'s build GPT \u2014 Karpathy (LayerNorm role explained ~1:48:00)', url:'https://www.youtube.com/watch?v=kCc8FmEb1nY'},
      ]
    },
    changes:{}
  },
  {
    id:'encoder_block', label:'Encoder Blocks', sublabel:'layers 0\u20133 (baseline)', category:'structural',
    details:{
      plainEnglish:'The first half of the model\'s layers. Each layer does two things: let the words look at each other (attention), then think about each word on its own (MLP). The encoder\'s outputs get saved — the second half of the model will reuse them through shortcut connections.',
      whatItDoes:'The first half of the transformer layers. Each block applies attention (letting tokens look at each other) then an MLP (processing each token independently). The encoder stores its outputs for the U-Net skip connections \u2014 decoder layers will reuse these later.',
      whyItMatters:'Splitting into encoder/decoder with skip connections (inspired by U-Net from image segmentation) helps information flow through deep networks. Early layers capture low-level patterns, later layers capture high-level meaning, and skip connections let the decoder access both.',
      keyParams:{ num_layers:'4 (baseline) / 5 (10L) / 5 (11L)', per_block:'ResidMix \u2192 Attn \u2192 MLP' },
      alternatives:['Flat transformer (no encoder/decoder split)', 'Depth recurrence (reuse same block N times)', 'Mixture of Experts (route tokens to different blocks)', 'Progressive growing (add layers during training)'],
      studyFurther:[
        {topic:'The Illustrated Transformer \u2014 Jay Alammar (best visual overview)', url:'https://jalammar.github.io/illustrated-transformer/'},
        {topic:'U-Net architecture \u2014 Ronneberger 2015 (the skip connection inspiration)', url:'https://arxiv.org/abs/1505.04597'},
        {topic:'The Annotated Transformer \u2014 Harvard NLP (line-by-line PyTorch)', url:'https://nlp.seas.harvard.edu/annotated-transformer/'},
        {topic:'But what is a GPT? \u2014 3Blue1Brown (YouTube, visual intro)', url:'https://www.youtube.com/watch?v=wjZofJX0v4M'},
      ]
    },
    changes:{
      sota:'5 encoder layers (10L total). Orthogonal weight init.',
      rank3:'5 encoder layers (11L total). QAT during training.',
    }
  },
  {
    id:'resid_mix', label:'Residual Mix', sublabel:'per block', category:'structural', isSub:true,
    details:{
      plainEnglish:'A small learnable dial per layer that decides how much of the original word vector to mix back in. Deep models can "forget" what the input was by the time they reach the last layer; this lets each layer pull in a fresh reminder whenever it helps.',
      whatItDoes:'A learnable per-dimension blend of two signals: the current hidden state (x) and the original embedding (x0). Formula: output = mix[0] * x + mix[1] * x0. Initialized to [1, 0] (pure current state), the model learns how much initial embedding to re-inject at each layer.',
      whyItMatters:'Deep transformers can "forget" the original input signal as it passes through many layers. Residual mix lets each layer recover input information when needed. This is a lightweight alternative to dense skip connections.',
      keyParams:{ shape:'[2, 512] per block', init:'[ones, zeros]', dtype:'fp32' },
      alternatives:['Standard residual (just add, no learned mix)', 'Dense connections (connect every layer to every other)', 'Gated residual (sigmoid gate instead of linear mix)', 'No residual (very deep networks struggle without this)'],
      studyFurther:[
        {topic:'Deep Residual Learning \u2014 He et al. 2015 (the ResNet paper, foundational)', url:'https://arxiv.org/abs/1512.03385'},
        {topic:'An Overview of ResNet and Variants \u2014 Lilian Weng (clear diagrams)', url:'https://lilianweng.github.io/posts/2017-06-21-overview/'},
        {topic:'Neural Networks series \u2014 3Blue1Brown (YouTube, gradient flow intuition)', url:'https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi'},
        {topic:'DenseNet \u2014 Huang et al. 2017 (dense skip connections)', url:'https://arxiv.org/abs/1608.06993'},
      ]
    },
    changes:{}
  },
  {
    id:'self_attn', label:'Causal Self-Attention', sublabel:'GQA, RoPE, softcap', category:'attention', isSub:true,
    details:{
      plainEnglish:'The mechanism that lets each word peek at the earlier words and decide which ones matter. It\'s the heart of a transformer — without this step, each word would be processed in isolation. This version uses several efficiency tricks: sharing keys and values across heads (GQA), a trick for encoding word positions without extra parameters (RoPE), and a gentle bound that keeps the attention scores from exploding.',
      whatItDoes:'The core mechanism that lets each token "look at" all previous tokens. Three projections (Q, K, V) transform each token into queries, keys, and values. Attention scores = softmax(Q \u00b7 K\u1d40 / \u221ad). Uses Grouped-Query Attention (8 query heads share 4 KV heads), RoPE for position encoding, per-head learnable q_gain scaling, and softcap (tanh bounding of attention logits to [-30,30]).',
      whyItMatters:'Attention is what makes transformers work \u2014 it\'s the only mechanism that lets tokens interact with each other. GQA (4 KV heads vs 8 query heads) saves ~25% of attention parameters with minimal quality loss. RoPE encodes position information without adding parameters. The q_gain and softcap improve training stability.',
      keyParams:{ num_heads:'8', kv_heads:'4 (GQA)', head_dim:'64', rope_base:'10000', softcap:'30.0', q_gain_init:'1.5' },
      alternatives:['Multi-Head Attention (separate KV per head, more params)', 'Multi-Query Attention (1 KV head, most efficient)', 'Linear attention (O(n) instead of O(n\u00b2))', 'Sliding window attention (local only)', 'ALiBi positions (learned bias instead of RoPE)', 'Absolute positional embeddings (added to input)'],
      studyFurther:[
        {topic:'The Illustrated Transformer \u2014 Jay Alammar (best visual attention guide, start here)', url:'https://jalammar.github.io/illustrated-transformer/'},
        {topic:'Attention in Transformers, visually explained \u2014 3Blue1Brown (YouTube)', url:'https://www.youtube.com/watch?v=eMlx5fFNoYc'},
        {topic:'Attention Is All You Need \u2014 Vaswani et al. 2017 (the original paper)', url:'https://arxiv.org/abs/1706.03762'},
        {topic:'GQA: Grouped-Query Attention \u2014 Ainslie et al. 2023 (MHA vs MQA vs GQA)', url:'https://arxiv.org/abs/2305.13245'},
        {topic:'Rotary Embeddings: A Relative Revolution \u2014 EleutherAI blog (intuitive RoPE)', url:'https://blog.eleuther.ai/rotary-embeddings/'},
        {topic:'RoFormer: RoPE paper \u2014 Su et al. 2021 (formal treatment)', url:'https://arxiv.org/abs/2104.09864'},
      ]
    },
    changes:{
      sota:'Orthogonal init for Q/K/V/proj. Output proj scaled by 1/sqrt(2*num_layers).',
      rank3:'QAT: attention weights see fake int6 quantization noise during training via STE.',
      smear:'Orthogonal init. Same GQA structure.',
      lora:'At eval time, rank-8 LoRA adapters added to Q and V projections. Trained per-document on validation data.',
    }
  },
  {
    id:'mlp', label:'MLP (relu\u00b2)', sublabel:'2x expand (baseline)', category:'mlp', isSub:true,
    details:{
      plainEnglish:'After attention gathers information, this step does the actual thinking on each word separately. It expands each word into a bigger scratch space, applies a simple activation (square the positive numbers, zero the negatives), then compresses it back down. Most of the model\'s parameters live here, so the top submissions make the scratch space 50% larger and pay for it by compressing weights more aggressively.',
      whatItDoes:'Two linear transformations with a relu-squared activation in between. Expand: 512 \u2192 1024 (or 1536 for 3x). Activate: relu(x)\u00b2 (square the positive values). Compress: 1024 \u2192 512. This is applied independently to each token position. Think of it as the "thinking" step \u2014 attention gathers info, MLP processes it.',
      whyItMatters:'The MLP is where most parameters live. Going from 2x to 3x expansion increases MLP params by 50%, which top submissions fund by using aggressive quantization (int6/int5 instead of int8). relu\u00b2 is cheaper than GELU/SiLU and works well for small models.',
      keyParams:{ expand:'512 \u2192 1024 (2x) or 1536 (3x)', activation:'relu\u00b2', output_init:'zero' },
      alternatives:['GELU activation (smoother, used in GPT-2/3)', 'SiLU/Swish (used in LLaMA)', 'SwiGLU (gated MLP, used in modern LLMs)', 'Larger expansion (4x or 8x, standard in big models)', 'Mixture of Experts (route to different MLPs)'],
      studyFurther:[
        {topic:'Transformer Circuits \u2014 Elhage, Olah et al. (what MLP layers actually learn)', url:'https://transformer-circuits.pub/2021/framework/index.html'},
        {topic:'GLU Variants Improve Transformer \u2014 Shazeer 2020 (SwiGLU, gated MLPs, 4 pages)', url:'https://arxiv.org/abs/2002.05202'},
        {topic:'Primer: Searching for Efficient Transformers \u2014 So et al. 2021 (relu\u00b2 origin)', url:'https://arxiv.org/abs/2109.08668'},
        {topic:'Switch Transformers \u2014 Fedus et al. 2021 (Mixture of Experts)', url:'https://arxiv.org/abs/2101.03961'},
        {topic:'Let\'s build GPT \u2014 Karpathy (FFN layer explained)', url:'https://www.youtube.com/watch?v=kCc8FmEb1nY'},
      ]
    },
    changes:{
      sota:'3x expansion (1536 hidden). Int5 quantization on MLP weights to fit the extra params.',
      rank2:'3x expansion (1536 hidden). Int6 quantization.',
      rank3:'3x expansion (1536 hidden). QAT with int6 STE during training.',
      smear:'3x expansion (1536 hidden). Int6 QAT.',
    }
  },
  {
    id:'skip_conn', label:'U-Net Skip Connections', sublabel:'encoder \u2192 decoder', category:'structural',
    details:{
      plainEnglish:'Shortcut wires that connect the first half of the model directly to the second half. Borrowed from an image-segmentation architecture called U-Net: the early layers\' outputs get handed to the later layers, so information doesn\'t have to survive a long journey through every intermediate step.',
      whatItDoes:'During the encoder phase, each layer\'s output is stored. During the decoder phase, these stored outputs are fed back in reverse order with learned per-dimension weights: decoder_input = x + skip_weight * encoder_output. Layer 4 gets layer 3\'s output, layer 5 gets layer 2\'s, etc.',
      whyItMatters:'Inspired by U-Net from image segmentation. Creates "shortcut" paths that let the decoder access early-layer representations directly. This is especially helpful for small models where information can get lost through many layers.',
      keyParams:{ skip_weights_shape:'[num_skips, 512]', init:'ones', dtype:'fp32 (not quantized)' },
      alternatives:['No skip connections (simpler but worse for deep models)', 'Dense connections (every layer connects to every other)', 'Funnel transformer (progressively reduce sequence length)', 'Hourglass transformer (similar bottleneck idea)'],
      studyFurther:[
        {topic:'U-Net architecture \u2014 Ronneberger 2015 (iconic encoder-decoder + skip design)', url:'https://arxiv.org/abs/1505.04597'},
        {topic:'Deep Residual Learning \u2014 He et al. 2015 (why shortcuts help deep networks)', url:'https://arxiv.org/abs/1512.03385'},
        {topic:'The Annotated Transformer \u2014 Harvard NLP (see residual wiring in code)', url:'https://nlp.seas.harvard.edu/annotated-transformer/'},
      ]
    },
    changes:{}
  },
  {
    id:'decoder_block', label:'Decoder Blocks', sublabel:'layers 4\u20138 (baseline)', category:'structural',
    details:{
      plainEnglish:'The second half of the model\'s layers. Structurally identical to the encoder blocks, but these layers also receive the shortcut wires from the encoder. Their job is to refine everything toward the final word prediction.',
      whatItDoes:'The second half of the transformer layers. Identical structure to encoder blocks (ResidMix \u2192 Attention \u2192 MLP) but also receives skip connection inputs from the encoder. The decoder refines the representation toward the final prediction.',
      whyItMatters:'The encoder-decoder split with skip connections creates an information bottleneck and then expands back \u2014 forcing the model to learn compressed representations in the middle layers.',
      keyParams:{ num_layers:'5 (baseline) / 5 (10L) / 6 (11L)' },
      alternatives:['Same as encoder block alternatives'],
      studyFurther:[
        {topic:'The Illustrated Transformer \u2014 Jay Alammar', url:'https://jalammar.github.io/illustrated-transformer/'},
        {topic:'The Annotated Transformer \u2014 Harvard NLP (code walkthrough)', url:'https://nlp.seas.harvard.edu/annotated-transformer/'},
      ]
    },
    changes:{
      sota:'5 decoder layers (10L total).',
      rank3:'6 decoder layers (11L total).',
    }
  },
  {
    id:'final_norm', label:'Final RMSNorm', category:'normalization',
    details:{
      plainEnglish:'One last rescaling after all the layers have run. Makes sure the final vectors have a consistent size before the model commits to a word choice. Same rescaling trick as the one used right after the embedding.',
      whatItDoes:'Same RMSNorm as before, applied after all transformer blocks. Normalizes the final hidden states before projecting to vocabulary logits.',
      whyItMatters:'Ensures the output vectors have consistent scale before the logit projection. Without this, different inputs could produce wildly different logit magnitudes, making training unstable.',
      keyParams:{ eps:'1e-6' },
      alternatives:['LayerNorm', 'No final norm (some architectures skip this)'],
      studyFurther:[
        {topic:'RMSNorm paper \u2014 Zhang & Sennrich 2019', url:'https://arxiv.org/abs/1910.07467'},
      ]
    },
    changes:{}
  },
  {
    id:'output_proj', label:'Output Projection', sublabel:'tied embedding', category:'output',
    details:{
      plainEnglish:'The final step: compare the model\'s current vector against every possible word in the dictionary and score each one. Because this reuses the exact same table from the input step (weight tying), it costs zero extra parameters — a huge win when the whole model has to fit in 16 megabytes.',
      whatItDoes:'Multiplies the final hidden state by the transpose of the token embedding matrix: logits = hidden @ embedding.T. This produces a score for each vocabulary token. Because the same weight matrix is used for input embedding and output projection (weight tying), this is essentially free \u2014 no extra parameters.',
      whyItMatters:'Without weight tying, you\'d need a separate [512, 1024] output projection \u2014 another ~512K parameters. In a 16MB budget, that\'s a lot. Weight tying also acts as a regularizer, forcing the embedding to work well for both input and output.',
      keyParams:{ output_shape:'[batch*seq, 1024]', tied_to:'tok_emb.weight' },
      alternatives:['Separate output head (untied, more params but more flexible)', 'Adaptive softmax (different capacity for frequent vs rare tokens)', 'Mixture of softmaxes (multiple output distributions blended)'],
      studyFurther:[
        {topic:'Weight Tying \u2014 Press & Wolf 2017 (why sharing works)', url:'https://arxiv.org/abs/1608.05859'},
        {topic:'The Illustrated Word2Vec \u2014 Jay Alammar (embedding space intuition)', url:'https://jalammar.github.io/illustrated-word2vec/'},
      ]
    },
    changes:{}
  },
  {
    id:'logit_softcap', label:'Logit Softcap', sublabel:'tanh(\u00b730)', category:'output',
    details:{
      plainEnglish:'A gentle ceiling on how confident the model is allowed to be. Values near zero pass through unchanged, but extreme values get squashed back toward ±30. Keeps the model from going all-in on a single word prediction, which helps both training stability and compression.',
      whatItDoes:'Bounds the logits to [-30, 30] using a soft capping function: capped = 30 * tanh(logits / 30). Values near zero pass through unchanged; extreme values are squashed. Inspired by Google\'s Gemma/Gemini models.',
      whyItMatters:'Prevents the model from becoming overconfident by producing extremely large logits. This improves training stability and can help with quantization (bounded values are easier to quantize precisely).',
      keyParams:{ cap:'30.0', formula:'cap * tanh(x / cap)' },
      alternatives:['No softcap (standard in most LLMs)', 'Temperature scaling (divide logits by T)', 'Logit normalization', 'Lower cap value (more aggressive bounding)'],
      studyFurther:[
        {topic:'Gemma 2 technical report \u2014 Google 2024 (softcap origin)', url:'https://arxiv.org/abs/2408.00118'},
        {topic:'Attention in Transformers \u2014 3Blue1Brown (covers attention logit scaling)', url:'https://www.youtube.com/watch?v=eMlx5fFNoYc'},
      ]
    },
    changes:{}
  },
  {
    id:'ce_loss', label:'Cross-Entropy Loss', category:'output',
    details:{
      plainEnglish:'The score the model is trying to minimize during training: "how surprised was I by the correct next word?" Lower is better. This is the number you\'d see in a training log, and the challenge\'s ranking metric is a simple transformation of it.',
      whatItDoes:'The training objective. For each position, computes: loss = -log(probability of correct next token). Averaged over all positions and sequences in the batch. This is the number the optimizer tries to minimize.',
      whyItMatters:'Cross-entropy is the standard loss for language modeling. It\'s equivalent to minimizing the KL divergence between the model\'s predictions and the true distribution. The val_loss reported in logs is this metric on the validation set.',
      keyParams:{ reduction:'mean', units:'nats (natural log)' },
      alternatives:['Focal loss (upweights hard examples)', 'Label smoothing (soften targets)', 'Contrastive loss (used in BERT-style models)', 'Bits-per-byte (the challenge metric, derived from CE loss)'],
      studyFurther:[
        {topic:'Visual Information Theory \u2014 Chris Olah (best visual entropy/cross-entropy guide)', url:'https://colah.github.io/posts/2015-09-Visual-Information/'},
        {topic:'Perplexity of Fixed-Length Models \u2014 HuggingFace (perplexity, BPB, sliding window)', url:'https://huggingface.co/docs/transformers/perplexity'},
        {topic:'The Illustrated Word2Vec \u2014 Jay Alammar (softmax/cross-entropy in context)', url:'https://jalammar.github.io/illustrated-word2vec/'},
      ]
    },
    changes:{}
  },
  {
    id:'muon_opt', label:'Muon Optimizer', sublabel:'+ Adam for scalars', category:'training',
    details:{
      plainEnglish:'A newer optimizer specialized for updating the big weight matrices inside the model. Standard optimizers (like Adam) can waste steps making poorly-shaped updates; Muon does an extra math step to keep every update well-conditioned. Especially helpful for small models training on tight budgets. Adam is still used for the smaller parameters like embeddings and biases.',
      whatItDoes:'A specialized optimizer for matrix-shaped parameters. Takes the gradient, applies Nesterov momentum, then orthogonalizes the update via 5 rounds of Newton-Schulz iteration. This projects the update onto the nearest orthogonal matrix, preserving scale. Adam is used separately for embedding and scalar parameters.',
      whyItMatters:'Muon produces update directions that maintain weight matrix conditioning. This is especially important for small models trained quickly \u2014 standard Adam can waste steps on poorly-conditioned updates. The Newton-Schulz orthogonalization is the key innovation.',
      keyParams:{ matrix_lr:'0.04 (baseline) / 0.02 (advanced)', momentum:'0.95 (baseline) / 0.99 (advanced)', backend_steps:'5 Newton-Schulz iterations', embed_lr:'0.05 (Adam)', scalar_lr:'0.04 (Adam)' },
      alternatives:['Adam/AdamW (standard, used for non-matrix params)', 'SGD with momentum (simpler but slower convergence)', 'LARS/LAMB (layerwise adaptive rates)', 'Shampoo (full matrix preconditioner, expensive)', 'Lion (sign-based optimizer)'],
      studyFurther:[
        {topic:'Why Momentum Really Works \u2014 Distill.pub (interactive visualization, beautiful)', url:'https://distill.pub/2017/momentum/'},
        {topic:'An Overview of Gradient Descent Optimizers \u2014 Sebastian Ruder (canonical blog post)', url:'https://ruder.io/optimizing-gradient-descent/'},
        {topic:'Muon optimizer \u2014 Keller Jordan (GitHub repo + explanation)', url:'https://github.com/KellerJordan/Muon'},
        {topic:'AdamW: Decoupled Weight Decay \u2014 Loshchilov & Hutter 2019', url:'https://arxiv.org/abs/1711.05101'},
        {topic:'Are Deep Networks Dramatically Overfitted? \u2014 Lilian Weng (regularization, WD, LR warmup)', url:'https://lilianweng.github.io/posts/2019-03-14-overfit/'},
      ]
    },
    changes:{
      sota:'matrix_lr=0.02, momentum=0.99, weight_decay=0.04. Momentum warmup 0.92\u21920.99 over 1500 steps. Gradient clip norm=0.3.',
      rank2:'matrix_lr=0.02, momentum=0.99, weight_decay=0.04. Same tuning.',
      rank3:'matrix_lr=0.025, momentum=0.99, weight_decay=0.04.',
      smear:'matrix_lr=0.02, momentum=0.99, weight_decay=0.01. Decoupled WD.',
    }
  },
  {
    id:'quantization', label:'Quantization', sublabel:'int8 + zlib (baseline)', category:'training',
    details:{
      plainEnglish:'After training, the model\'s weights get compressed so the whole thing fits in 16MB. Baseline uses 8-bit numbers; top submissions push down to 6-bit or even 5-bit, buying space for more parameters. Some submissions also train with fake quantization noise baked in (QAT), so the model learns to be robust to the compression before it actually happens.',
      whatItDoes:'After training, compresses the model to fit in 16MB. Per-row quantization: find each row\'s max absolute value, scale to fit integer range, round. Baseline uses int8 (256 levels). Advanced submissions use int6 (64 levels) or int5 (32 levels) for aggressive compression, sometimes with Quantization-Aware Training (QAT) where the model trains with simulated quantization noise.',
      whyItMatters:'This is THE critical constraint of the challenge. Better quantization = more parameters in 16MB = better model. Going from int8 to int6 saves ~25% space, enabling wider MLPs or more layers. QAT with STE (Straight-Through Estimator) teaches the model to be robust to quantization noise.',
      keyParams:{ baseline:'int8 [-127, 127] + zlib-9', advanced:'int6 [-32, 31] or int5 [-16, 15] + zstd-22', passthrough:'embeddings kept in fp16', qat:'STE during training (rank3, smear)' },
      alternatives:['int8 (256 levels, baseline)', 'int6 (64 levels, good compression)', 'int5 (32 levels, aggressive)', 'int4 (16 levels, very aggressive)', 'Mixed precision (different bits per layer)', 'Pruning (zero out small weights)', 'Knowledge distillation (train small model from large one)'],
      studyFurther:[
        {topic:'A Visual Guide to Quantization \u2014 Maarten Grootendorst (visual, beginner-friendly)', url:'https://newsletter.maartengrootendorst.com/p/a-visual-guide-to-quantization'},
        {topic:'LLM.int8() \u2014 Tim Dettmers et al. 2022 (made int8 practical for LLMs)', url:'https://arxiv.org/abs/2208.07339'},
        {topic:'Introduction to Quantization \u2014 PyTorch docs (QAT, PTQ, dynamic quant)', url:'https://pytorch.org/docs/stable/quantization.html'},
        {topic:'Gentle Intro to 8-bit Quantization \u2014 HuggingFace blog (practical walkthrough)', url:'https://huggingface.co/blog/hf-bitsandbytes-integration'},
        {topic:'GPTQ: Accurate Post-Training Quantization \u2014 Frantar et al. 2023', url:'https://arxiv.org/abs/2210.17323'},
      ]
    },
    changes:{
      sota:'Mixed int5 (MLP) / int6 (attention) + zstd-22. 3% magnitude pruning. FP16 embeddings.',
      rank2:'Uniform int6 all matrices + zstd-22. FP16 embeddings.',
      rank3:'QAT during training with int6 STE. Post-training int6 + zstd-22.',
      smear:'Int6 QAT with STE. zstd-22 compression. 15.1MB artifact.',
    }
  },
  {
    id:'swa', label:'Stochastic Weight Averaging', sublabel:'advanced', category:'training', advanced:true,
    details:{
      plainEnglish:'Near the end of training, the model takes snapshots of itself every few steps and averages them all together at the very end. The averaged weights are smoother than any individual snapshot, which makes them survive compression much better — a small trick that directly improves the final score.',
      whatItDoes:'Periodically snapshots the model weights during the last portion of training, then averages all snapshots together. The SOTA collects every 50 steps during the last 40% of training (~24 checkpoints), then uses the averaged weights for the final model.',
      whyItMatters:'SWA produces smoother weight distributions that quantize better. Individual training runs produce sharp, noisy weights; averaging smooths them out. This directly reduces the quantization penalty (the gap between float and quantized model quality).',
      keyParams:{ start_frac:'0.4 (SOTA) / 0.5 (#2)', every:'50 steps', checkpoints:'~24-30' },
      alternatives:['Exponential Moving Average (EMA, continuous blend)', 'No weight averaging (standard training)', 'Ensemble (keep multiple models, expensive)', 'Late-stage low LR (achieve smoothness via LR decay)'],
      studyFurther:[
        {topic:'Stochastic Weight Averaging in PyTorch \u2014 PyTorch blog (code + flat minima intuition)', url:'https://pytorch.org/blog/stochastic-weight-averaging-in-pytorch/'},
        {topic:'Averaging Weights Leads to Wider Optima \u2014 Izmailov et al. 2018 (the SWA paper, great figures)', url:'https://arxiv.org/abs/1803.05407'},
      ]
    },
    changes:{
      sota:'SWA from last 40% of training, every 50 steps. ~24 checkpoints averaged.',
      rank2:'SWA from last 50% of training, every 50 steps. ~30 checkpoints.',
    }
  },
  {
    id:'sliding_eval', label:'Sliding Window Eval', sublabel:'advanced', category:'training', advanced:true,
    details:{
      plainEnglish:'A smarter way to score the model at evaluation time. Instead of chopping the test text into non-overlapping chunks (which means the first word of each chunk has zero context to work with), this slides a window forward 64 tokens at a time, so almost every token gets evaluated with a thousand tokens of context behind it. Costs 16x more forward passes but improves the score for free — no retraining required.',
      whatItDoes:'Instead of evaluating on non-overlapping chunks of 1024 tokens, slides a window with stride=64. Each forward pass processes 1024 tokens, but only the last 64 are scored. This means every validation token gets evaluated with 960+ tokens of context, dramatically improving BPB.',
      whyItMatters:'Standard evaluation throws away context at chunk boundaries \u2014 the first token of each chunk has zero context. Sliding window gives near-maximum context to every token. This alone improves BPB by ~0.032 with zero training changes. It\'s slower (16x more forward passes) but within the 10-min eval budget on H100s.',
      keyParams:{ stride:'64', window:'1024 (or seq_len)', improvement:'~0.032 BPB free' },
      alternatives:['Non-overlapping evaluation (fast but wastes context)', 'Stride=1 (maximum quality, very slow)', 'Larger stride (faster, less benefit)', 'Recurrent evaluation (maintain hidden state across chunks)'],
      studyFurther:[
        {topic:'Perplexity of Fixed-Length Models \u2014 HuggingFace (THE resource for sliding window eval)', url:'https://huggingface.co/docs/transformers/perplexity'},
        {topic:'Language Models are Unsupervised Multitask Learners \u2014 GPT-2 paper (eval methodology)', url:'https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf'},
      ]
    },
    changes:{
      sota:'Sliding window eval, stride=64.',
      rank2:'Sliding window eval, stride=64.',
      rank3:'Sliding window eval, stride=64. Also NTK-aware RoPE scaling option.',
      smear:'Sliding window eval, stride=64.',
    }
  },
  {
    id:'lora_ttt', label:'LoRA TTT', sublabel:'test-time training', category:'training', advanced:true,
    details:{
      plainEnglish:'A fundamentally different approach: let the model briefly adapt to each test document as it reads it. Tiny trainable adapters are added to a few layers, the model takes one quick training step on the document\'s own tokens, and then it\'s evaluated. The adapters get reset between documents. It literally learns from the test data as it goes — without cheating, since it only trains on tokens it has already been scored on.',
      whatItDoes:'At evaluation time, attaches small rank-8 LoRA adapters to Q and V projections in every layer. For each validation document, takes one Adam step to fine-tune these adapters on the document\'s tokens, then evaluates. Adapters are reset between documents. The model literally learns from the test data as it evaluates.',
      whyItMatters:'A fundamentally different approach: instead of building a better static model, make the model adapt at test time. Only trains on tokens already scored (no cheating). The LoRA adapters add minimal parameters and the single Adam step is fast. Achieved 1.1928 BPB \u2014 competitive but not SOTA.',
      keyParams:{ rank:'8', targets:'Q, V projections + lm_head', optimizer:'Adam per document', steps:'1 per chunk' },
      alternatives:['No test-time training (standard approach)', 'Full fine-tuning at test time (too expensive)', 'Prompt tuning (learn soft prompt per document)', 'In-context learning (no weight updates)'],
      studyFurther:[
        {topic:'A Visual Guide to LoRA \u2014 Maarten Grootendorst (visual, beginner-friendly)', url:'https://newsletter.maartengrootendorst.com/p/a-visual-guide-to-lora'},
        {topic:'LoRA: Low-Rank Adaptation \u2014 Hu et al. 2021 (the original paper)', url:'https://arxiv.org/abs/2106.09685'},
        {topic:'PEFT: Parameter-Efficient Fine-Tuning \u2014 HuggingFace docs (practical LoRA guide)', url:'https://huggingface.co/docs/peft/index'},
        {topic:'Test-Time Training with Self-Supervision \u2014 Sun et al. 2020 (the TTT concept)', url:'https://arxiv.org/abs/1909.13231'},
      ]
    },
    changes:{
      lora:'Per-document rank-8 LoRA on Q, V, and lm_head. 1 Adam step per chunk. Document-isolated.',
    }
  },
];

// ─── LAYOUT CONFIG ───
export const NODE_W = 200;
export const NODE_H = 42;
export const GAP_Y = 16;
export const SUB_NODE_W = 170;
export const SUB_NODE_H = 36;
export const SUB_GAP = 10;
export const OFFSET_X = 100;

// Main flow order and nesting
export const FLOW = [
  'input_tokens',
  'tok_emb',
  'bigram_hash',
  'smear_gate',
  'post_emb_norm',
  { block:'encoder_block', children:['resid_mix','self_attn','mlp'] },
  'skip_conn',
  { block:'decoder_block', children:['resid_mix','self_attn','mlp'] },
  'final_norm',
  'output_proj',
  'logit_softcap',
  'ce_loss',
  '__sep__',
  'muon_opt',
  'quantization',
  'swa',
  'sliding_eval',
  'lora_ttt',
];
