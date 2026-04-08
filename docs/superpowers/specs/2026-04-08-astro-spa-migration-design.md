# Astro SPA Migration + PG Golf Plain-English Design

**Date:** 2026-04-08
**Status:** Approved, pending user review of this doc
**Target deploy:** Cloudflare Pages (static)

## Goal

Unify the three standalone HTML explorers (`index.html`, `gemma.html`, `hacks.html`) into one multi-page Astro site, and add a persistent plain-English description to every node in the PG Golf Explorer.

## Non-goals

- Rewriting any explorer's rendering logic, diagram math, or interaction model.
- Modifying Gemma or Hacks *content* (they already work; they are lift-and-shift only).
- Adding a build pipeline beyond what Astro requires out of the box.
- SSR, API routes, edge functions, or any dynamic behavior — the site remains fully static.
- Configuring Cloudflare Pages programmatically (user clicks through dashboard when ready).
- Unit/E2E test suites (out of proportion to project size; verification is side-by-side visual comparison).

## Architecture

Astro project at the repo root, `output: 'static'`, `@astrojs/vue` integration. Three existing Vue apps become Vue single-file components mounted as islands with `client:load`. Landing page and shared layout ship zero JavaScript.

### File layout

```
pgolf-explorer/
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── README.md                    # build + deploy instructions
├── public/                      # static passthrough (if needed)
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro     # <html>, <head>, header+nav, theme import
│   ├── pages/
│   │   ├── index.astro          # landing, zero JS
│   │   ├── explorer.astro       # PG Golf (was index.html)
│   │   ├── gemma.astro          # Gemma 4 (was gemma.html)
│   │   └── hacks.astro          # Hack Recipes (was hacks.html)
│   ├── components/
│   │   ├── PGolfExplorer.vue
│   │   ├── GemmaExplorer.vue
│   │   └── HacksExplorer.vue
│   ├── data/
│   │   ├── pgolf-architecture.ts
│   │   ├── gemma-architecture.ts
│   │   └── hacks.ts
│   └── styles/
│       └── theme.css            # shared CSS variables, extracted from all three files
├── demo-dag/                    # UNTOUCHED — research artifacts
├── gemma-references/            # UNTOUCHED — research artifacts
└── docs/superpowers/specs/
    └── 2026-04-08-astro-spa-migration-design.md
```

### Why these choices

- **`output: 'static'`** — matches the nature of the content and makes Cloudflare Pages deploy trivial (build command `npm run build`, output dir `dist/`, no adapter, no Workers runtime, no `_redirects`).
- **Vue islands via `@astrojs/vue`** — reuses the existing 3000+ lines of working Vue code verbatim; each page only ships the Vue runtime if it actually uses Vue; landing page ships zero JS.
- **Data extracted to `src/data/*.ts`** — isolates the content edits (plain-English additions) from rendering logic; easier to diff, easier to parallelize.
- **Shared theme and layout** — the three files already use identical CSS variables; consolidating them eliminates drift.

## PG Golf Plain-English: data model

**Pattern: match Gemma's existing `analogy:` approach.** Don't build a mode toggle. Add a persistent `plainEnglish: string` field to each of the 20 nodes in `src/data/pgolf-architecture.ts`. Render it as an "In plain English" box above the existing "What it does" / "Why it matters" sections, using the same markup and class names as Gemma's `analogy-box`.

### Rationale for persistent field over toggle

1. **Consistency.** Gemma already does it this way; readers shouldn't learn a second pattern.
2. **No pre-mount flash, no localStorage, no toggle UI, no Bilingual type.** Simpler diff.
3. **Never forces a choice.** Reader sees plain version first, dives into technical when something grabs them — genuinely how people read pedagogical content.

### Data shape

```ts
details: {
  plainEnglish: string,          // NEW — drafted by Claude, refined later
  whatItDoes:   string,          // unchanged
  whyItMatters: string,          // unchanged
  keyParams:    Record<string, string>,
  alternatives: string[],
  studyFurther: { topic: string, url: string }[],
}
```

### Field naming: `plainEnglish` vs. Gemma's `analogy`

Kept distinct on purpose. Gemma's field name is accurate to Gemma's content (genuine analogies: "an eyeball bolted onto the side of the model"). PG Golf's content is mostly de-jargoned restatements, not analogies. Both render under the UI label "In plain English"; the data model stays honest to what each explorer is actually doing.

### Scope discipline

- Plain-English field applies **only** to PG Golf Explorer nodes, **only** to the `whatItDoes` / `whyItMatters` explanation pair.
- `keyParams`, `alternatives`, `studyFurther`, `changes`, category labels, node labels, and the diagram itself all stay technical.
- Gemma and Hacks content is not modified.
- All 20 `plainEnglish` strings drafted by Claude in one pass; can be refined later via web search or dispatched agents.

## localStorage keys to preserve

The ports must **not** change these key names, or existing users will silently lose their notes:

- `gemma-explorer-notes` (Gemma)
- `pgolf-explorer-notes` (PG Golf)
- Hacks: no localStorage usage.

## Implementation checkpoints

Each checkpoint is an eyeball-able working state. Side-by-side visual comparison with the old HTML file is the verification step after every port.

1. **Astro scaffold + landing page + shared layout.** Site builds, landing page renders, nav links to the three not-yet-existing routes. Old HTML files still work in place.
2. **Port PG Golf Explorer** (no plain-English yet). Data to `src/data/`, component to `src/components/`, page to `src/pages/`. Verify side-by-side against `index.html`. This is the riskiest checkpoint — 1000 lines of Vue moving from `<script>` tag to SFC.
3. **Add `plainEnglish` field to all 20 PG Golf nodes + render box.** Visual treatment matches Gemma's `analogy-box` exactly. Commit.
4. **Port Gemma Explorer.** Lift and shift. Verify all three views (Flow / Hack Matrix / Function Map) still work. Preserve `gemma-explorer-notes` key.
5. **Port Hacks.** Lift and shift.
6. **Delete old HTML files, add README, add `.gitignore` entries for `dist/` and `node_modules/`.** Document Cloudflare Pages settings in README but do not configure CF itself.

### Parallelization

Checkpoints 1, 2, 3 are sequential (each depends on the previous). Checkpoints 4 and 5 are independent of each other once 2 is done and can be dispatched to parallel subagents via the `superpowers:subagent-driven-development` skill. Within each port, data extraction, SFC construction, and page stub creation are also parallelizable subtasks. The implementation plan will mark which steps are parallel-safe.

## Testing

- **Primary:** side-by-side visual/interaction comparison with the old HTML file after each port.
- **Secondary:** `npm run build` at every checkpoint to catch TypeScript errors, missing imports, and broken Vue templates (Astro build is strict about these).
- **No unit tests, no E2E tests.** Out of proportion for the project.

## Definition of done

- `npm run build` succeeds with zero warnings.
- `npm run dev` serves `/`, `/explorer`, `/gemma`, `/hacks`.
- Every interactive feature on each explorer matches the old HTML file.
- PG Golf Explorer renders an "In plain English" box on all 20 nodes.
- `index.html`, `gemma.html`, `hacks.html` deleted from repo root.
- `README.md` documents `npm install`, `npm run dev`, `npm run build`, and the Cloudflare Pages settings (build command, output dir, framework preset).
- Existing Gemma notes in `localStorage` still load after the port.

## Out of scope for this spec (explicitly)

- Refining the drafted `plainEnglish` copy via web search or dispatched agents (will happen after this spec is done).
- Browsable views of `demo-dag/` or `gemma-references/`.
- A Gemma or Hacks plain-English pass.
- GitHub Actions / wrangler.toml deploy automation.
- Analytics, search, or any shared cross-page state.
