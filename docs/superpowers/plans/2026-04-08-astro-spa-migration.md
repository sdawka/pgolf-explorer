# Astro SPA Migration + PG Golf Plain-English — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate three standalone HTML explorers into a single Astro static site deployed to Cloudflare Pages, and add a persistent "In plain English" box to every node in the PG Golf Explorer.

**Architecture:** Astro with `output: 'static'` and `@astrojs/vue`. Each existing Vue app becomes a Vue single-file component mounted as an island via `client:load`. Data extracted from inline `<script>` tags into `src/data/*.ts` modules. Shared CSS variables extracted into `src/styles/theme.css`. Shared header/nav in `src/layouts/BaseLayout.astro`.

**Tech Stack:** Astro 5.x, Vue 3 (via `@astrojs/vue`), TypeScript (loose — data modules only), pnpm or npm. No test framework. Verification is side-by-side visual comparison against the pre-migration HTML files.

**Spec:** `docs/superpowers/specs/2026-04-08-astro-spa-migration-design.md`

**Parallelization:** Tasks 1–3 are sequential. Task 4 depends on Task 3. Tasks 5→6→7 are sequential (PG Golf port). Task 8 depends on Task 7. Tasks 9 (Gemma port) and Task 10 (Hacks port) are **independent of each other** once Task 8 is done and can be dispatched to parallel subagents. Task 11 (cleanup) depends on both 9 and 10.

---

## File Structure

**Created:**
- `astro.config.mjs` — Astro config with Vue integration, static output
- `package.json` — dependencies and scripts
- `tsconfig.json` — Astro's strict TS preset
- `.gitignore` additions — `dist/`, `node_modules/`, `.astro/`
- `src/styles/theme.css` — shared CSS variables + base element resets
- `src/layouts/BaseLayout.astro` — `<html>`, `<head>`, shared header/nav
- `src/pages/index.astro` — landing page
- `src/pages/explorer.astro` — PG Golf Explorer page
- `src/pages/gemma.astro` — Gemma 4 Explorer page
- `src/pages/hacks.astro` — Hack Recipes page
- `src/components/PGolfExplorer.vue` — PG Golf Vue SFC (lifted from `index.html`)
- `src/components/GemmaExplorer.vue` — Gemma Vue SFC (lifted from `gemma.html`)
- `src/components/HacksExplorer.vue` — Hacks Vue SFC (lifted from `hacks.html`)
- `src/data/pgolf-architecture.ts` — NODES, FLOW, CATEGORIES, SUBMISSIONS, layout constants
- `src/data/gemma-architecture.ts` — Gemma data
- `src/data/hacks.ts` — Hacks data
- `README.md` — build + Cloudflare deploy instructions

**Deleted (at the end, Task 11):**
- `index.html`
- `gemma.html`
- `hacks.html`

**Untouched:**
- `demo-dag/`
- `gemma-references/`
- `docs/`

---

## Task 1: Scaffold Astro project

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `.gitignore` (or modify if exists)

- [ ] **Step 1: Verify current state**

Run: `ls /Users/sdawka/Code/pgolf-explorer`
Expected: `index.html gemma.html hacks.html demo-dag gemma-references docs` among the entries. No `package.json` yet.

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "pgolf-explorer",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "astro": "astro"
  },
  "dependencies": {
    "astro": "^5.0.0",
    "@astrojs/vue": "^5.0.0",
    "vue": "^3.5.0"
  }
}
```

- [ ] **Step 3: Create `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';

export default defineConfig({
  output: 'static',
  integrations: [vue()],
  site: 'https://pgolf-explorer.pages.dev',
});
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "jsx": "preserve"
  }
}
```

- [ ] **Step 5: Create or append to `.gitignore`**

Check if `.gitignore` exists:
Run: `ls -la /Users/sdawka/Code/pgolf-explorer/.gitignore`

If it does not exist, create it with:
```
node_modules/
dist/
.astro/
.DS_Store
```

If it exists, append any of those lines that are missing.

- [ ] **Step 6: Install dependencies**

Run: `cd /Users/sdawka/Code/pgolf-explorer && npm install`
Expected: `node_modules/` created, no errors. `package-lock.json` generated.

- [ ] **Step 7: Verify Astro builds an empty project**

Run: `cd /Users/sdawka/Code/pgolf-explorer && npm run build`
Expected: Astro may error with "no pages found" — that's fine for now, it confirms Astro itself installed correctly. If instead it errors with "cannot find module astro", go back to Step 6.

- [ ] **Step 8: Commit**

```bash
git add package.json astro.config.mjs tsconfig.json .gitignore package-lock.json
git commit -m "Scaffold Astro project with Vue integration"
```

---

## Task 2: Extract shared theme CSS

**Files:**
- Create: `src/styles/theme.css`

**Context:** All three HTML files declare the same CSS variables in `:root`. Consolidate into one file. Also pull the `* { margin:0; padding:0; box-sizing:border-box; }` reset and the base `body` rules — they are identical across the three files.

- [ ] **Step 1: Create `src/styles/theme.css`**

```css
:root {
  --bg: #0f1117;
  --bg2: #1a1d27;
  --bg3: #242836;
  --border: #2e3345;
  --text: #e0e0e8;
  --text2: #9498a8;
  --accent: #6c8cff;
  --gold: #ffd700;
  --hack: #39d98a;
  --danger: #e8834a;
  --code-bg: #0b0d13;
  --cat-embedding: #4A90D9;
  --cat-normalization: #7B68EE;
  --cat-attention: #E8834A;
  --cat-mlp: #50C878;
  --cat-structural: #CD853F;
  --cat-output: #DC4C64;
  --cat-training: #708090;
  --cat-hacking: #39d98a;
  --func-zone: #2a3140;
  --impact-high: #39d98a;
  --impact-med: #2a6b4a;
  --impact-low: #3a3e4a;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  background: var(--bg);
  color: var(--text);
  height: 100vh;
  overflow: hidden;
}

#app {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100vh;
}

/* Shared header nav (used by BaseLayout) */
.site-nav {
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  padding: 10px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.site-nav .brand { font-weight: 600; color: var(--accent); letter-spacing: 0.5px; }
.site-nav a {
  color: var(--text2);
  text-decoration: none;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
}
.site-nav a:hover, .site-nav a.active {
  color: var(--accent);
  border-color: var(--accent);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/theme.css
git commit -m "Extract shared CSS variables and base styles"
```

---

## Task 3: BaseLayout with shared header/nav

**Files:**
- Create: `src/layouts/BaseLayout.astro`

**Context:** Shared shell used by every page. Imports `theme.css`, renders `<html>`, `<head>`, and a top nav bar. Each page supplies `title` and `activeRoute` props and fills the default slot with page content.

- [ ] **Step 1: Create `src/layouts/BaseLayout.astro`**

```astro
---
import '../styles/theme.css';

interface Props {
  title: string;
  activeRoute?: 'home' | 'explorer' | 'gemma' | 'hacks';
}

const { title, activeRoute = 'home' } = Astro.props;
---

<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
  </head>
  <body>
    <nav class="site-nav">
      <span class="brand">PGolf Explorer</span>
      <a href="/" class={activeRoute === 'home' ? 'active' : ''}>Home</a>
      <a href="/explorer" class={activeRoute === 'explorer' ? 'active' : ''}>PG Golf</a>
      <a href="/gemma" class={activeRoute === 'gemma' ? 'active' : ''}>Gemma 4</a>
      <a href="/hacks" class={activeRoute === 'hacks' ? 'active' : ''}>Hacks</a>
    </nav>
    <slot />
  </body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add src/layouts/BaseLayout.astro
git commit -m "Add BaseLayout with shared header navigation"
```

---

## Task 4: Landing page

**Files:**
- Create: `src/pages/index.astro`

**Context:** Must be created before `npm run build` will succeed (Astro requires at least one page). Ships zero JavaScript.

- [ ] **Step 1: Create `src/pages/index.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---

<BaseLayout title="PGolf Explorer" activeRoute="home">
  <main class="landing">
    <h1>Parameter Golf Explorers</h1>
    <p class="tagline">Three interactive explorers of small-model language architectures.</p>

    <section class="card-grid">
      <a href="/explorer" class="card">
        <h2>PG Golf Architecture Explorer</h2>
        <p>The ~16MB language model challenge. Click through every layer of the baseline and the top submissions, with plain-English explanations next to the technical deep-dive.</p>
      </a>

      <a href="/gemma" class="card">
        <h2>Gemma 4 Architecture Explorer</h2>
        <p>Google's Gemma 4 model family. Flow view, hack matrix, and a function map that groups the architecture by what each piece actually does.</p>
      </a>

      <a href="/hacks" class="card">
        <h2>Gemma 4 Hack Recipes</h2>
        <p>Runnable recipes for fine-tuning, quantizing, and shipping Gemma 4 on consumer hardware.</p>
      </a>
    </section>
  </main>
</BaseLayout>

<style>
  .landing { padding: 48px 32px; max-width: 900px; margin: 0 auto; overflow-y: auto; height: calc(100vh - 42px); }
  .landing h1 { font-size: 22px; margin-bottom: 8px; }
  .landing .tagline { color: var(--text2); font-size: 13px; margin-bottom: 32px; }
  .card-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
  .card {
    display: block;
    text-decoration: none;
    color: var(--text);
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 18px 20px;
    transition: border-color 0.15s;
  }
  .card:hover { border-color: var(--accent); }
  .card h2 { font-size: 14px; color: var(--accent); margin-bottom: 6px; }
  .card p { font-size: 12px; line-height: 1.6; color: var(--text2); }
</style>
```

- [ ] **Step 2: Run dev server and verify**

Run: `cd /Users/sdawka/Code/pgolf-explorer && npm run dev`
Expected: Astro starts a dev server on `http://localhost:4321`. Open it in a browser — you should see the landing page with three cards, a header nav, and the dark theme. The `/explorer`, `/gemma`, `/hacks` links all 404 (expected — those pages don't exist yet).
Stop the dev server with Ctrl+C.

- [ ] **Step 3: Verify build succeeds**

Run: `cd /Users/sdawka/Code/pgolf-explorer && npm run build`
Expected: Build succeeds with zero errors. Output directory `dist/` contains `index.html`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro
git commit -m "Add landing page with explorer cards"
```

---

## Task 5: Extract PG Golf data to a TypeScript module

**Files:**
- Create: `src/data/pgolf-architecture.ts`
- Source of truth: `index.html` lines 305–688

**Context:** The original file declares `CATEGORIES`, `SUBMISSIONS`, `NODES`, `NODE_W`/`NODE_H`/`GAP_Y`/etc., and `FLOW` as plain JS constants inside a `<script>` tag. Move them verbatim into a TypeScript module with exports. No content changes, no restructuring.

- [ ] **Step 1: Read lines 305–685 of `index.html` to copy the data**

Use the Read tool on `/Users/sdawka/Code/pgolf-explorer/index.html` with offset 305, limit 380. Copy the `CATEGORIES`, `SUBMISSIONS`, and `NODES` arrays exactly as they appear. Then read lines 686–745 to copy the layout constants and `FLOW`.

- [ ] **Step 2: Create `src/data/pgolf-architecture.ts`**

Paste the copied constants, prefix each top-level declaration with `export`, and use loose typing (the data is hand-curated; we don't need strict typing on every field).

The file structure should look like this (data bodies copied verbatim from `index.html`):

```ts
// Extracted from the original index.html script block.
// Do not restructure without updating the component that consumes it.

export const CATEGORIES = {
  embedding:     { color: '#4A90D9', label: 'Embedding' },
  normalization: { color: '#7B68EE', label: 'Normalization' },
  attention:     { color: '#E8834A', label: 'Attention' },
  mlp:           { color: '#50C878', label: 'MLP / FFN' },
  structural:    { color: '#CD853F', label: 'Structural' },
  output:        { color: '#DC4C64', label: 'Output' },
  training:      { color: '#708090', label: 'Training' },
} as const;

export const SUBMISSIONS = [
  { id: 'baseline', label: 'Naive Baseline',         score: 1.2244, date: '2026-03-17', layers: 9,  mlpMult: 2 },
  { id: 'sota',     label: 'SOTA (10L Int5)',        score: 1.1428, date: '2026-03-20', layers: 10, mlpMult: 3 },
  { id: 'rank2',    label: '#2 Int6+SmearGate',      score: 1.1458, date: '2026-03-20', layers: 9,  mlpMult: 3 },
  { id: 'rank3',    label: '#3 QAT Int6 11L',        score: 1.1502, date: '2026-03-19', layers: 11, mlpMult: 3 },
  { id: 'smear',    label: 'SmearGate+Ortho',        score: 1.1556, date: '2026-03-19', layers: 9,  mlpMult: 3 },
  { id: 'lora',     label: 'LoRA TTT',               score: 1.1928, date: '2026-03-17', layers: 9,  mlpMult: 2 },
];

export const NODES = [
  // ... all 20 nodes, copied byte-for-byte from index.html lines 330–685.
  // Preserve id, label, sublabel, category, isSub/advanced flags, and the
  // entire `details` object (whatItDoes, whyItMatters, keyParams, alternatives,
  // studyFurther) and `changes` object exactly as in the source.
];

export const NODE_W = 200;
export const NODE_H = 42;
export const GAP_Y = 16;
export const SUB_NODE_W = 170;
export const SUB_NODE_H = 36;
export const SUB_GAP = 10;
export const OFFSET_X = 100;

export const FLOW = [
  // ... copied from index.html, starting at line 697.
];
```

**Important:** when copying the `NODES` array, do NOT add the `plainEnglish` field yet. Task 8 will add it. Keep this task pure extraction so the diff is reviewable.

- [ ] **Step 3: Verify the module parses**

Run: `cd /Users/sdawka/Code/pgolf-explorer && npx tsc --noEmit src/data/pgolf-architecture.ts --target es2022 --module esnext --moduleResolution bundler`

If Astro's TS strict mode flags implicit `any` on array elements, add `// @ts-nocheck` as the first line of the file — the data is hand-curated and strict typing here has negative ROI.

Expected: No errors, or only warnings about unused exports (fine).

- [ ] **Step 4: Verify build still succeeds**

Run: `cd /Users/sdawka/Code/pgolf-explorer && npm run build`
Expected: Build succeeds. The new data module isn't imported yet so it has no runtime effect; we're just verifying it doesn't break the build.

- [ ] **Step 5: Commit**

```bash
git add src/data/pgolf-architecture.ts
git commit -m "Extract PG Golf architecture data into TypeScript module"
```

---

## Task 6: Create `PGolfExplorer.vue` single-file component

**Files:**
- Create: `src/components/PGolfExplorer.vue`
- Source of truth: `index.html` (everything from the root `<div id="app">` down through the Vue `setup()` function)

**Context:** This is the biggest and riskiest task. Lift the Vue app out of `index.html` into an SFC. The template becomes `<template>`, the script becomes `<script setup>`, the styles become `<style>` (scoped:false because the diagram uses global SVG selectors).

- [ ] **Step 1: Create `src/components/PGolfExplorer.vue` with this skeleton**

```vue
<script setup lang="ts">
// @ts-nocheck
import { ref, computed, watch, onMounted } from 'vue';
import {
  CATEGORIES,
  SUBMISSIONS,
  NODES,
  NODE_W,
  NODE_H,
  GAP_Y,
  SUB_NODE_W,
  SUB_NODE_H,
  SUB_GAP,
  OFFSET_X,
  FLOW,
} from '../data/pgolf-architecture';

// === BEGIN: paste the body of the original createApp({ setup() { ... } }) here ===
// Source: index.html, inside createApp({...}).setup()
// Remove the outer `const app = createApp({ setup() { ... return {...}; } });` wrapper.
// Remove the `app.mount('#app')` call at the bottom.
// All refs, computed, watchers, event handlers, and helper functions become
// top-level declarations in this <script setup>.
// === END ===
</script>

<template>
  <!-- Paste the contents of <div id="app"> ... </div> from index.html here,
       WITHOUT the outer #app wrapper div (Astro will provide mounting). -->
</template>

<style>
/* Paste the PG-Golf-specific styles from index.html's <style> block here.
   SKIP the :root block, the * reset, and the base body/#app rules —
   those live in src/styles/theme.css now and are imported by BaseLayout. */
</style>
```

- [ ] **Step 2: Port the template**

Read `index.html` from the line containing `<div id="app">` through `</div>` (closing tag of `#app`). Copy the inner contents (NOT the `<div id="app">` wrapper itself) into the `<template>` block of the SFC.

Vue 3 SFC templates require a single root element. If the original `#app` contents have multiple top-level siblings, wrap them in a single `<div class="pgolf-root">` and add a matching CSS rule: `.pgolf-root { display: grid; grid-template-rows: auto 1fr; height: calc(100vh - 42px); }` (the `-42px` accounts for the `BaseLayout` site nav).

- [ ] **Step 3: Port the script**

Read the `<script>` block in `index.html` that starts with `const { createApp, ref, computed, watch, onMounted } = Vue;`. Copy everything from inside the `createApp({ setup() { ... } })` body into `<script setup>`. Three mechanical changes:

1. Remove references to the constants now imported from `src/data/pgolf-architecture.ts` — they come from the import, not from local `const` declarations.
2. The original `setup()` returns an object; in `<script setup>` that return is implicit — delete the `return {...}` at the bottom.
3. Delete `createApp(...).mount('#app')` at the very bottom of the original script.

- [ ] **Step 4: Port the styles**

Copy the `<style>` block from `index.html` into the SFC's `<style>` block, but delete these sections (they're already in `src/styles/theme.css`):

- The entire `:root { ... }` block
- The `* { margin:0; padding:0; box-sizing:border-box; }` rule
- The `body { ... }` rule
- The `#app { ... }` rule

Keep everything else (header, sidebar, diagram, detail panel, tab styles, etc.).

- [ ] **Step 5: Verify the component file parses**

Run: `cd /Users/sdawka/Code/pgolf-explorer && npx vue-tsc --noEmit || true`
Expected: Warnings are acceptable (we used `@ts-nocheck`). Hard errors (cannot parse template, missing imports) must be fixed before moving on.

- [ ] **Step 6: Commit**

```bash
git add src/components/PGolfExplorer.vue
git commit -m "Port PG Golf Explorer to Vue single-file component"
```

---

## Task 7: PG Golf page + side-by-side verification

**Files:**
- Create: `src/pages/explorer.astro`

- [ ] **Step 1: Create `src/pages/explorer.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import PGolfExplorer from '../components/PGolfExplorer.vue';
---

<BaseLayout title="Parameter Golf Architecture Explorer" activeRoute="explorer">
  <PGolfExplorer client:load />
</BaseLayout>
```

- [ ] **Step 2: Run dev server**

Run: `cd /Users/sdawka/Code/pgolf-explorer && npm run dev`
Open: `http://localhost:4321/explorer`

- [ ] **Step 3: Side-by-side verification checklist**

Open `file:///Users/sdawka/Code/pgolf-explorer/index.html` in one browser tab and the dev server route in another. Walk through this checklist:

- [ ] Header renders with title, submission dropdown, legend dots
- [ ] Sidebar shows all category groups and node items
- [ ] Sidebar search filters nodes
- [ ] Clicking a sidebar item highlights it and shows the detail panel
- [ ] Diagram renders with arrows, block containers, and node rectangles
- [ ] Clicking a node in the diagram opens the detail panel
- [ ] Detail panel tabs (Learn, Variants/Compare, Notes) all switch correctly
- [ ] Learn tab shows What it does / Why it matters / Key params / Alternatives / Study further
- [ ] Compare/Variants tab shows per-submission changes
- [ ] Notes tab: typing a note and refreshing the page preserves the note (localStorage key `pgolf-explorer-notes` — must NOT have changed)
- [ ] Changing the submission dropdown highlights "changed" nodes in gold
- [ ] Skip connections render as dashed lines
- [ ] No console errors
- [ ] Layout/spacing/colors visually match the old file

**If any item fails, stop and fix before moving on.** Do not accumulate bugs across checkpoints.

- [ ] **Step 4: Verify build succeeds**

Run: `cd /Users/sdawka/Code/pgolf-explorer && npm run build`
Expected: Build succeeds. `dist/explorer/index.html` exists.

- [ ] **Step 5: Commit**

```bash
git add src/pages/explorer.astro
git commit -m "Add PG Golf Explorer route"
```

---

## Task 8: Add `plainEnglish` field to all 20 PG Golf nodes and render box

**Files:**
- Modify: `src/data/pgolf-architecture.ts`
- Modify: `src/components/PGolfExplorer.vue`

**Context:** This task adds the plain-English content. The box markup and CSS mirror Gemma's `analogy-box` exactly so the two explorers feel consistent.

- [ ] **Step 1: Add the `.analogy-box` CSS to `PGolfExplorer.vue`**

In the `<style>` block of `PGolfExplorer.vue`, append (copied from `gemma.html` lines 124–126):

```css
.analogy-box { background: rgba(108,140,255,0.08); border-left: 3px solid var(--accent); padding: 10px 12px; margin-bottom: 16px; border-radius: 4px; }
.analogy-box .analogy-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--accent); margin-bottom: 4px; }
.analogy-box p { font-size: 12px; line-height: 1.6; color: var(--text); font-style: italic; }
```

- [ ] **Step 2: Render the box in the detail panel's Learn tab**

Find the section of the template inside the `Learn` tab that currently starts with `<div class="learn-section"><h3>What it does</h3>`. Insert the following block **immediately before** it:

```html
<div class="analogy-box" v-if="selectedNode.details.plainEnglish">
  <div class="analogy-label">In plain English</div>
  <p>{{ selectedNode.details.plainEnglish }}</p>
</div>
```

- [ ] **Step 3: Add `plainEnglish` to each of the 20 nodes in `src/data/pgolf-architecture.ts`**

For each node, add a `plainEnglish:` field as the first property of the `details:` object. Use these drafts verbatim:

**3.1 — `input_tokens`:**
```ts
plainEnglish: 'Text gets chopped up into small pieces (roughly word fragments), and each piece is swapped for a number. This challenge uses a tiny dictionary of only 1024 possible pieces, which is about 50× smaller than what regular language models use — a deliberate choice to save space.',
```

**3.2 — `tok_emb`:**
```ts
plainEnglish: 'A big lookup table that turns each numbered word-piece into a list of 512 numbers the model can actually reason about. The same table is reused at the very end to pick the next word — so it does double duty, which is why good submissions keep it in high precision even while compressing everything else.',
```

**3.3 — `bigram_hash`:**
```ts
plainEnglish: 'A cheap shortcut for spotting two-word patterns. It takes each pair of consecutive word-pieces, hashes them into a bucket, and looks up a small feature vector for that bucket. This gives the model instant access to "these two words often go together" signals before the expensive layers even run.',
```

**3.4 — `smear_gate`:**
```ts
plainEnglish: 'A learned knob that blends a small amount of each word into the next one. It starts at almost pure "current word" and the model gradually learns how much of the previous word is worth mixing in, per dimension. Like BigramHash, it gives the model local context for almost free.',
```

**3.5 — `post_emb_norm`:**
```ts
plainEnglish: 'Right after looking up the word vectors, this step rescales them so they all have roughly the same length. Without it, some vectors can be huge and others tiny, which makes training unstable. RMSNorm is a cheaper version of the standard normalization used in most transformers.',
```

**3.6 — `encoder_block`:**
```ts
plainEnglish: 'The first half of the model\'s layers. Each layer does two things: let the words look at each other (attention), then think about each word on its own (MLP). The encoder\'s outputs get saved — the second half of the model will reuse them through shortcut connections.',
```

**3.7 — `resid_mix`:**
```ts
plainEnglish: 'A small learnable dial per layer that decides how much of the original word vector to mix back in. Deep models can "forget" what the input was by the time they reach the last layer; this lets each layer pull in a fresh reminder whenever it helps.',
```

**3.8 — `self_attn`:**
```ts
plainEnglish: 'The mechanism that lets each word peek at the earlier words and decide which ones matter. It''s the heart of a transformer — without this step, each word would be processed in isolation. This version uses several efficiency tricks: sharing keys and values across heads (GQA), a trick for encoding word positions without extra parameters (RoPE), and a gentle bound that keeps the attention scores from exploding.',
```

**3.9 — `mlp`:**
```ts
plainEnglish: 'After attention gathers information, this step does the actual thinking on each word separately. It expands each word into a bigger scratch space, applies a simple activation (square the positive numbers, zero the negatives), then compresses it back down. Most of the model\'s parameters live here, so the top submissions make the scratch space 50% larger and pay for it by compressing weights more aggressively.',
```

**3.10 — `skip_conn`:**
```ts
plainEnglish: 'Shortcut wires that connect the first half of the model directly to the second half. Borrowed from an image-segmentation architecture called U-Net: the early layers\' outputs get handed to the later layers, so information doesn\'t have to survive a long journey through every intermediate step.',
```

**3.11 — `decoder_block`:**
```ts
plainEnglish: 'The second half of the model\'s layers. Structurally identical to the encoder blocks, but these layers also receive the shortcut wires from the encoder. Their job is to refine everything toward the final word prediction.',
```

**3.12 — `final_norm`:**
```ts
plainEnglish: 'One last rescaling after all the layers have run. Makes sure the final vectors have a consistent size before the model commits to a word choice. Same rescaling trick as the one used right after the embedding.',
```

**3.13 — `output_proj`:**
```ts
plainEnglish: 'The final step: compare the model\'s current vector against every possible word in the dictionary and score each one. Because this reuses the exact same table from the input step (weight tying), it costs zero extra parameters — a huge win when the whole model has to fit in 16 megabytes.',
```

**3.14 — `logit_softcap`:**
```ts
plainEnglish: 'A gentle ceiling on how confident the model is allowed to be. Values near zero pass through unchanged, but extreme values get squashed back toward ±30. Keeps the model from going all-in on a single word prediction, which helps both training stability and compression.',
```

**3.15 — `ce_loss`:**
```ts
plainEnglish: 'The score the model is trying to minimize during training: "how surprised was I by the correct next word?" Lower is better. This is the number you\'d see in a training log, and the challenge\'s ranking metric is a simple transformation of it.',
```

**3.16 — `muon_opt`:**
```ts
plainEnglish: 'A newer optimizer specialized for updating the big weight matrices inside the model. Standard optimizers (like Adam) can waste steps making poorly-shaped updates; Muon does an extra math step to keep every update well-conditioned. Especially helpful for small models training on tight budgets. Adam is still used for the smaller parameters like embeddings and biases.',
```

**3.17 — `quantization`:**
```ts
plainEnglish: 'After training, the model\'s weights get compressed so the whole thing fits in 16MB. Baseline uses 8-bit numbers; top submissions push down to 6-bit or even 5-bit, buying space for more parameters. Some submissions also train with fake quantization noise baked in (QAT), so the model learns to be robust to the compression before it actually happens.',
```

**3.18 — `swa`:**
```ts
plainEnglish: 'Near the end of training, the model takes snapshots of itself every few steps and averages them all together at the very end. The averaged weights are smoother than any individual snapshot, which makes them survive compression much better — a small trick that directly improves the final score.',
```

**3.19 — `sliding_eval`:**
```ts
plainEnglish: 'A smarter way to score the model at evaluation time. Instead of chopping the test text into non-overlapping chunks (which means the first word of each chunk has zero context to work with), this slides a window forward 64 tokens at a time, so almost every token gets evaluated with a thousand tokens of context behind it. Costs 16x more forward passes but improves the score for free — no retraining required.',
```

**3.20 — `lora_ttt`:**
```ts
plainEnglish: 'A fundamentally different approach: let the model briefly adapt to each test document as it reads it. Tiny trainable adapters are added to a few layers, the model takes one quick training step on the document\'s own tokens, and then it\'s evaluated. The adapters get reset between documents. It literally learns from the test data as it goes — without cheating, since it only trains on tokens it has already been scored on.',
```

- [ ] **Step 4: Verify in the browser**

Run: `cd /Users/sdawka/Code/pgolf-explorer && npm run dev`
Open: `http://localhost:4321/explorer`

Click each of the 20 nodes in the sidebar. For each, confirm:

- [ ] An "In plain English" box renders above "What it does" in the Learn tab
- [ ] The box styling matches Gemma's `analogy-box` (blue-tinted background, left accent border, italic text)
- [ ] The plain-English text for that specific node appears (not empty, not the wrong node's text)
- [ ] The existing "What it does" and "Why it matters" sections are unchanged

- [ ] **Step 5: Verify build succeeds**

Run: `cd /Users/sdawka/Code/pgolf-explorer && npm run build`
Expected: Build succeeds with zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/data/pgolf-architecture.ts src/components/PGolfExplorer.vue
git commit -m "Add plain-English descriptions to all PG Golf nodes"
```

---

## Task 9: Port Gemma Explorer (parallel-safe with Task 10)

**Files:**
- Create: `src/data/gemma-architecture.ts`
- Create: `src/components/GemmaExplorer.vue`
- Create: `src/pages/gemma.astro`
- Source: `gemma.html`

**Context:** Pure lift-and-shift. No content changes, no refactoring of the view-toggle or the analogy blocks. This task can run as a dispatched subagent in parallel with Task 10 — they touch disjoint file sets.

- [ ] **Step 1: Identify the data block in `gemma.html`**

Open `gemma.html` and locate the `<script>` block that declares `const categories = {...}`, `const submissions = [...]`, `const NODES = [...]`, `const functionZones = [...]`, and any layout constants. Note the line ranges.

- [ ] **Step 2: Create `src/data/gemma-architecture.ts`**

Paste every top-level `const` from the Gemma script block into the new file, prefix each with `export`, and add `// @ts-nocheck` at the top of the file. Do not change any values. Do not rename anything. This is a byte-for-byte copy with `export` added.

- [ ] **Step 3: Create `src/components/GemmaExplorer.vue`**

Use the same mechanical procedure as Task 6:

1. Scaffold the SFC with `<script setup lang="ts">`, `<template>`, `<style>` blocks.
2. Add `// @ts-nocheck` at the top of `<script setup>`.
3. Import all constants from `../data/gemma-architecture`.
4. Copy the contents of `createApp({ setup() { ... } })` into `<script setup>`, minus references to the imported data and minus the `return {...}`.
5. Copy the inner contents of `<div id="app">` into `<template>`, wrapping in a single root `<div class="gemma-root">` if needed.
6. Copy the `<style>` block, minus the `:root`, `*`, `body`, `#app` rules that are now in `theme.css`.
7. Delete the `createApp(...).mount('#app')` call.

- [ ] **Step 4: Create `src/pages/gemma.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import GemmaExplorer from '../components/GemmaExplorer.vue';
---

<BaseLayout title="Gemma 4 Architecture Explorer" activeRoute="gemma">
  <GemmaExplorer client:load />
</BaseLayout>
```

- [ ] **Step 5: Side-by-side verification checklist**

Run: `cd /Users/sdawka/Code/pgolf-explorer && npm run dev`

Open `file:///Users/sdawka/Code/pgolf-explorer/gemma.html` in one tab and `http://localhost:4321/gemma` in another. Verify:

- [ ] Header, submission dropdowns, and view-toggle buttons (Flow / Hack Matrix / Function Map) all render
- [ ] All three views switch correctly and render their content
- [ ] Sidebar with category groups works
- [ ] Sidebar search filters nodes
- [ ] Clicking a node opens the detail panel
- [ ] Detail panel shows the "In plain English" analogy box (Gemma's existing feature)
- [ ] All three detail tabs (Learn, Variants, Notes) work
- [ ] **Critical:** Notes tab reads from `localStorage` key `gemma-explorer-notes`. Open the browser devtools → Application → Local Storage, confirm the key name is unchanged. Typing a note and refreshing the page preserves it.
- [ ] Hack Matrix table renders with impact dots
- [ ] Function Map view groups nodes by zone with analogies
- [ ] No console errors

- [ ] **Step 6: Verify build succeeds**

Run: `cd /Users/sdawka/Code/pgolf-explorer && npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/data/gemma-architecture.ts src/components/GemmaExplorer.vue src/pages/gemma.astro
git commit -m "Port Gemma 4 Explorer to Astro + Vue SFC"
```

---

## Task 10: Port Hacks (parallel-safe with Task 9)

**Files:**
- Create: `src/data/hacks.ts`
- Create: `src/components/HacksExplorer.vue`
- Create: `src/pages/hacks.astro`
- Source: `hacks.html`

**Context:** Pure lift-and-shift. No localStorage to preserve. Can run in parallel with Task 9.

- [ ] **Step 1: Identify the data block in `hacks.html`**

Locate the top-level `const` declarations in the `<script>` block. Note the line ranges.

- [ ] **Step 2: Create `src/data/hacks.ts`**

Byte-for-byte copy with `export` prefixes and `// @ts-nocheck` at the top.

- [ ] **Step 3: Create `src/components/HacksExplorer.vue`**

Same mechanical procedure as Task 6 and Task 9. Root wrapper class: `hacks-root`.

- [ ] **Step 4: Create `src/pages/hacks.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import HacksExplorer from '../components/HacksExplorer.vue';
---

<BaseLayout title="Gemma 4 Hack Recipes" activeRoute="hacks">
  <HacksExplorer client:load />
</BaseLayout>
```

- [ ] **Step 5: Side-by-side verification checklist**

Run: `cd /Users/sdawka/Code/pgolf-explorer && npm run dev`
Open `file:///Users/sdawka/Code/pgolf-explorer/hacks.html` and `http://localhost:4321/hacks`. Verify:

- [ ] Header and nav render
- [ ] Hack list / recipes render with the same layout
- [ ] Code blocks display with the `--code-bg` background
- [ ] Any interactive elements (filters, expandable sections, copy buttons if present) work identically
- [ ] No console errors
- [ ] Visual layout matches

- [ ] **Step 6: Verify build succeeds**

Run: `cd /Users/sdawka/Code/pgolf-explorer && npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/data/hacks.ts src/components/HacksExplorer.vue src/pages/hacks.astro
git commit -m "Port Hack Recipes to Astro + Vue SFC"
```

---

## Task 11: Delete old HTML files, add README, finalize

**Files:**
- Delete: `index.html`
- Delete: `gemma.html`
- Delete: `hacks.html`
- Create: `README.md`

- [ ] **Step 1: Final pre-deletion sanity check**

Run: `cd /Users/sdawka/Code/pgolf-explorer && npm run build && npm run preview`
Open `http://localhost:4321` and click through all four routes (/, /explorer, /gemma, /hacks). Every page must render correctly. If anything is broken, **do not proceed to deletion** — fix it first.

- [ ] **Step 2: Delete the old HTML files**

Run: `cd /Users/sdawka/Code/pgolf-explorer && rm index.html gemma.html hacks.html`

- [ ] **Step 3: Create `README.md`**

```markdown
# PGolf Explorer

Static multi-page site exploring three small-model language architectures:

- **PG Golf Architecture Explorer** (`/explorer`) — the ~16MB parameter-golf challenge baseline and top submissions, with plain-English explanations alongside the technical details.
- **Gemma 4 Architecture Explorer** (`/gemma`) — Google's Gemma 4 model family with flow, hack matrix, and function map views.
- **Gemma 4 Hack Recipes** (`/hacks`) — runnable recipes for fine-tuning, quantizing, and shipping Gemma 4.

## Development

```bash
npm install
npm run dev
```

Dev server runs on `http://localhost:4321`.

## Build

```bash
npm run build
```

Output goes to `dist/`. The site is fully static — no server runtime required.

## Deploy to Cloudflare Pages

1. Connect this repo to Cloudflare Pages.
2. Framework preset: **Astro**.
3. Build command: `npm run build`
4. Build output directory: `dist/`
5. No environment variables needed.
6. No `_redirects` file needed — every route is prerendered as a real HTML file.

## Project layout

- `src/pages/` — one `.astro` file per route
- `src/components/` — the three Vue single-file components (one per explorer)
- `src/data/` — hand-curated architecture data, separated from rendering
- `src/layouts/BaseLayout.astro` — shared `<head>` and top nav
- `src/styles/theme.css` — shared CSS variables and base styles
- `demo-dag/`, `gemma-references/` — research artifacts, not part of the site
```

- [ ] **Step 4: Final build + preview**

Run: `cd /Users/sdawka/Code/pgolf-explorer && npm run build && npm run preview`
Open `http://localhost:4321`, click through every route one more time. Nothing should reference the deleted files.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Remove old standalone HTML files, add README"
```

- [ ] **Step 6: Final `git status` check**

Run: `cd /Users/sdawka/Code/pgolf-explorer && git status`
Expected: `nothing to commit, working tree clean`. The three old HTML files should be gone. `dist/` and `node_modules/` should be ignored.

---

## Self-review notes

**Spec coverage:**
- Astro scaffold → Task 1 ✓
- Shared theme extraction → Task 2 ✓
- BaseLayout with nav → Task 3 ✓
- Landing page → Task 4 ✓
- PG Golf port → Tasks 5, 6, 7 ✓
- PG Golf `plainEnglish` field + render → Task 8 ✓
- Gemma port (lift-and-shift, preserve notes key) → Task 9 ✓
- Hacks port → Task 10 ✓
- Delete old files + README → Task 11 ✓
- Cloudflare Pages documented, not configured → Task 11 Step 3 ✓
- localStorage keys preserved → Tasks 7 Step 3 and 9 Step 5 explicitly verify

**Parallelization map (for subagent dispatch):**
- Serial: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
- Parallel: 9 and 10 can dispatch simultaneously after 8 completes
- Serial: 11 waits for both 9 and 10

**Known risk areas:**
- Task 6 is the largest single mechanical edit (~1000 lines). Verification in Task 7 is the gate — do not accept "it builds" as a pass, the checklist must be walked.
- Astro strict TS may complain about the data modules; `// @ts-nocheck` is the pragmatic escape valve and is already prescribed.
- Vue template root element: if the original `#app` has multiple children, the SFC template must wrap them in a single root div (called out in Tasks 6/9/10 step instructions).
