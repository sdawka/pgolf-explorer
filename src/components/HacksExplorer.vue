<script setup lang="ts">
// @ts-nocheck
import { ref, computed } from 'vue';
import { ARCH_LABELS, HW, GOALS, RECIPES } from '../data/hacks';

const selectedId = ref(RECIPES[0].id);
const hwFilter = ref('all');
const goalFilter = ref('all');
const copiedIdx = ref(-1);

const recipes = RECIPES;
const selected = computed(() => RECIPES.find(r => r.id === selectedId.value));

function matchesFilter(r) {
  const hwOk = hwFilter.value === 'all' || r.hardware === 'all' || r.hardware === hwFilter.value;
  const goalOk = goalFilter.value === 'all' || r.goal === goalFilter.value;
  return hwOk && goalOk;
}

function hwLabel(h) { return HW[h] || h; }
function goalLabel(g) { return GOALS[g] || g; }
function archLabel(id) { return ARCH_LABELS[id] || id; }

function copyCode(code, idx) {
  navigator.clipboard.writeText(code).then(() => {
    copiedIdx.value = idx;
    setTimeout(() => { if (copiedIdx.value === idx) copiedIdx.value = -1; }, 1500);
  });
}

function nextUpLabel() {
  const nxt = RECIPES.find(r => r.id === selected.value.nextUp);
  return nxt ? `${nxt.emoji} ${nxt.title}` : '';
}
</script>

<template>
  <div class="hacks-root">
    <div class="header">
      <h1><span class="brand">Gemma 4</span> Hack Recipes</h1>
      <a class="nav-link" href="/gemma">← Architecture Explorer</a>
      <div class="filters">
        <div class="filter-group">
          <label>Hardware</label>
          <div class="chip" :class="{active:hwFilter==='all'}" @click="hwFilter='all'">All</div>
          <div class="chip" :class="{active:hwFilter==='mac'}" @click="hwFilter='mac'">Mac</div>
          <div class="chip" :class="{active:hwFilter==='cuda'}" @click="hwFilter='cuda'">NVIDIA</div>
          <div class="chip" :class="{active:hwFilter==='cpu'}" @click="hwFilter='cpu'">CPU-only</div>
        </div>
        <div class="filter-group">
          <label>Goal</label>
          <div class="chip" :class="{active:goalFilter==='all'}" @click="goalFilter='all'">All</div>
          <div class="chip" :class="{active:goalFilter==='run'}" @click="goalFilter='run'">Run</div>
          <div class="chip" :class="{active:goalFilter==='longctx'}" @click="goalFilter='longctx'">Long ctx</div>
          <div class="chip" :class="{active:goalFilter==='quant'}" @click="goalFilter='quant'">Quantize</div>
          <div class="chip" :class="{active:goalFilter==='finetune'}" @click="goalFilter='finetune'">Fine-tune</div>
          <div class="chip" :class="{active:goalFilter==='augment'}" @click="goalFilter='augment'">Augment</div>
        </div>
      </div>
    </div>

    <div class="main">
      <div class="sidebar">
        <div class="sidebar-header">Ordered easiest → hardest</div>
        <div v-for="r in recipes" :key="r.id"
             class="recipe-item"
             :class="{active: selectedId===r.id, dimmed: !matchesFilter(r)}"
             @click="selectedId=r.id">
          <div class="recipe-title">
            <span class="recipe-emoji">{{r.emoji}}</span>
            {{r.title}}
          </div>
          <div class="recipe-meta">
            <span class="stars">{{'★'.repeat(r.stars)}}<span style="color:var(--border)">{{'★'.repeat(5-r.stars)}}</span></span>
            <span>{{r.time}}</span>
            <span class="badge">{{hwLabel(r.hardware)}}</span>
            <span class="badge">{{goalLabel(r.goal)}}</span>
          </div>
        </div>
      </div>

      <div class="content" :class="{empty:!selected}">
        <div v-if="!selected">Pick a recipe on the left.</div>
        <template v-else>
          <div class="recipe-header">
            <h2><span class="emoji">{{selected.emoji}}</span>{{selected.title}}</h2>
            <div class="meta-row">
              <span class="stars">{{'★'.repeat(selected.stars)}}</span>
              <span><strong>Time:</strong> {{selected.time}}</span>
              <span><strong>Hardware:</strong> {{hwLabel(selected.hardware)}}</span>
              <span><strong>Goal:</strong> {{goalLabel(selected.goal)}}</span>
            </div>
          </div>

          <div class="section">
            <div class="analogy">{{selected.analogy}}</div>
          </div>

          <div class="section" v-if="selected.prereqs && selected.prereqs.length">
            <h3>Prerequisites</h3>
            <ul class="prereq-list">
              <li v-for="p in selected.prereqs" :key="typeof p === 'string' ? p : p.id">
                <template v-if="typeof p === 'string'">{{p}}</template>
                <template v-else>
                  <a @click="selectedId=p.id">{{p.label}}</a>
                </template>
              </li>
            </ul>
          </div>

          <div class="section" v-if="selected.touches && selected.touches.length">
            <h3>What you're actually changing</h3>
            <div class="touches-list">
              <a v-for="t in selected.touches" :key="t" class="touch-pill"
                 :href="'/gemma'" :title="'Open ' + archLabel(t) + ' in the explorer'">
                {{archLabel(t)}}<span class="arrow">↗</span>
              </a>
            </div>
          </div>

          <div class="section">
            <h3>Recipe</h3>
            <div v-for="(step, i) in selected.steps" :key="i" class="step">
              <div class="step-header">
                <span class="step-num">{{i+1}}</span>
                <div class="step-text" v-html="step.text"></div>
              </div>
              <div v-if="step.code" class="code-block">
                <button class="copy-btn" :class="{copied:copiedIdx===i}" @click="copyCode(step.code,i)">
                  {{copiedIdx===i ? 'copied' : 'copy'}}
                </button>
                <pre>{{step.code}}</pre>
              </div>
            </div>
          </div>

          <div class="section">
            <h3>Expected result</h3>
            <div class="expected" v-html="selected.expected"></div>
          </div>

          <div class="section" v-if="selected.gotchas && selected.gotchas.length">
            <h3>Gotchas</h3>
            <ul class="gotchas-list">
              <li v-for="g in selected.gotchas" :key="g" v-html="g"></li>
            </ul>
          </div>

          <div class="next-up" v-if="selected.nextUp">
            Next up → <a @click="selectedId=selected.nextUp">{{nextUpLabel()}}</a>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style>
.hacks-root { display:grid; grid-template-rows: auto 1fr; height: calc(100vh - 42px); }

.hacks-root .header { background:var(--bg2); border-bottom:1px solid var(--border); padding:12px 20px; display:flex; align-items:center; gap:20px; flex-wrap:wrap; }
.hacks-root .header h1 { font-size:16px; font-weight:600; letter-spacing:0.5px; white-space:nowrap; }
.hacks-root .header h1 .brand { color:var(--hack); }
.hacks-root .header a.nav-link { color:var(--text2); text-decoration:none; font-size:11px; text-transform:uppercase; letter-spacing:1px; padding:4px 8px; border:1px solid var(--border); border-radius:4px; }
.hacks-root .header a.nav-link:hover { color:var(--accent); border-color:var(--accent); }
.hacks-root .filters { display:flex; gap:14px; align-items:center; margin-left:auto; flex-wrap:wrap; }
.hacks-root .filter-group { display:flex; gap:4px; align-items:center; }
.hacks-root .filter-group label { font-size:9px; color:var(--text2); text-transform:uppercase; letter-spacing:1px; margin-right:4px; }
.hacks-root .chip { background:var(--bg3); border:1px solid var(--border); color:var(--text2); padding:4px 10px; border-radius:12px; font-family:inherit; font-size:10px; cursor:pointer; text-transform:uppercase; letter-spacing:0.5px; }
.hacks-root .chip.active { background:var(--accent); color:#fff; border-color:var(--accent); }
.hacks-root .chip:hover:not(.active) { color:var(--text); border-color:var(--text2); }

.hacks-root .main { display:grid; grid-template-columns: 320px 1fr; overflow:hidden; }

.hacks-root .sidebar { background:var(--bg2); border-right:1px solid var(--border); overflow-y:auto; }
.hacks-root .sidebar-header { padding:12px 16px 6px; font-size:9px; text-transform:uppercase; letter-spacing:1.5px; color:var(--text2); }
.hacks-root .recipe-item { padding:12px 16px; cursor:pointer; border-left:3px solid transparent; transition:all 0.15s; border-bottom:1px solid var(--border); }
.hacks-root .recipe-item:hover { background:var(--bg3); }
.hacks-root .recipe-item.active { background:var(--bg3); border-left-color:var(--hack); }
.hacks-root .recipe-item .recipe-title { font-size:12px; font-weight:500; color:var(--text); margin-bottom:4px; display:flex; align-items:center; gap:6px; }
.hacks-root .recipe-item .recipe-emoji { font-size:14px; }
.hacks-root .recipe-item .recipe-meta { font-size:10px; color:var(--text2); display:flex; gap:10px; flex-wrap:wrap; }
.hacks-root .recipe-item .stars { color:var(--gold); letter-spacing:1px; }
.hacks-root .recipe-item .badge { background:var(--bg); border:1px solid var(--border); padding:1px 5px; border-radius:3px; font-size:9px; }
.hacks-root .recipe-item.dimmed { opacity:0.3; }

.hacks-root .content { overflow-y:auto; padding:24px 32px 40px; }
.hacks-root .content.empty { display:flex; align-items:center; justify-content:center; color:var(--text2); text-align:center; }
.hacks-root .recipe-header { margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid var(--border); }
.hacks-root .recipe-header h2 { font-size:22px; font-weight:600; margin-bottom:8px; display:flex; align-items:center; gap:10px; }
.hacks-root .recipe-header h2 .emoji { font-size:26px; }
.hacks-root .recipe-header .meta-row { display:flex; gap:16px; flex-wrap:wrap; font-size:11px; color:var(--text2); text-transform:uppercase; letter-spacing:0.5px; }
.hacks-root .recipe-header .meta-row .stars { color:var(--gold); }
.hacks-root .recipe-header .meta-row span strong { color:var(--text); }

.hacks-root .section { margin-bottom:22px; }
.hacks-root .section h3 { font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:var(--hack); margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:4px; }

.hacks-root .analogy { background:rgba(108,140,255,0.08); border-left:3px solid var(--accent); padding:12px 14px; border-radius:4px; font-size:13px; line-height:1.6; font-style:italic; color:var(--text); }

.hacks-root .prereq-list, .hacks-root .gotchas-list { list-style:none; padding:0; }
.hacks-root .prereq-list li, .hacks-root .gotchas-list li { font-size:12px; padding:4px 0 4px 18px; position:relative; line-height:1.6; color:var(--text); }
.hacks-root .prereq-list li::before { content:'✓'; color:var(--hack); position:absolute; left:0; font-weight:bold; }
.hacks-root .gotchas-list li::before { content:'⚠'; color:var(--danger); position:absolute; left:0; }
.hacks-root .prereq-list a { color:var(--accent); text-decoration:none; cursor:pointer; }
.hacks-root .prereq-list a:hover { text-decoration:underline; }

.hacks-root .touches-list { display:flex; flex-wrap:wrap; gap:6px; }
.hacks-root .touch-pill { background:var(--bg3); border:1px solid var(--border); padding:5px 10px; border-radius:12px; font-size:11px; color:var(--text); cursor:pointer; text-decoration:none; display:inline-block; transition:all 0.15s; }
.hacks-root .touch-pill:hover { border-color:var(--accent); color:var(--accent); }
.hacks-root .touch-pill .arrow { color:var(--text2); margin-left:4px; }

.hacks-root .step { margin-bottom:14px; }
.hacks-root .step-header { display:flex; align-items:baseline; gap:10px; margin-bottom:6px; }
.hacks-root .step-num { background:var(--hack); color:#0a0e14; width:22px; height:22px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; }
.hacks-root .step-text { font-size:13px; line-height:1.6; color:var(--text); }
.hacks-root .code-block { background:var(--code-bg); border:1px solid var(--border); border-radius:6px; padding:12px 14px; margin:6px 0 0 32px; font-size:11.5px; line-height:1.55; overflow-x:auto; position:relative; }
.hacks-root .code-block pre { font-family:inherit; color:#c8ccd8; white-space:pre; }
.hacks-root .code-block .copy-btn { position:absolute; top:6px; right:6px; background:var(--bg3); border:1px solid var(--border); color:var(--text2); padding:3px 8px; border-radius:3px; font-family:inherit; font-size:9px; cursor:pointer; text-transform:uppercase; letter-spacing:0.5px; opacity:0; transition:opacity 0.15s; }
.hacks-root .code-block:hover .copy-btn { opacity:1; }
.hacks-root .code-block .copy-btn:hover { color:var(--hack); border-color:var(--hack); }
.hacks-root .code-block .copy-btn.copied { color:var(--hack); border-color:var(--hack); opacity:1; }
.hacks-root .code-block .comment { color:#6a7182; font-style:italic; }

.hacks-root .expected { background:rgba(57,217,138,0.08); border-left:3px solid var(--hack); padding:12px 14px; border-radius:4px; font-size:12px; line-height:1.6; }
.hacks-root .expected strong { color:var(--hack); }

.hacks-root .next-up { margin-top:28px; padding-top:16px; border-top:1px solid var(--border); font-size:11px; color:var(--text2); }
.hacks-root .next-up a { color:var(--accent); cursor:pointer; text-decoration:none; }
.hacks-root .next-up a:hover { text-decoration:underline; }

@media (max-width:900px) {
  .hacks-root .main { grid-template-columns:1fr; grid-template-rows:auto 1fr; }
  .hacks-root .sidebar { max-height:200px; border-right:none; border-bottom:1px solid var(--border); }
}
</style>
