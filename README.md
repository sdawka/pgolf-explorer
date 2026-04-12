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

## Contributing

PRs welcome! If you've been digging into a model architecture — whether it's a new explorer page, a hack recipe, or plain-English notes on how something works — open a PR. The goal is to make small-model internals approachable for anyone curious about how these things actually work.

Good contributions:
- New architecture explorer pages (follow the pattern in `src/components/` and `src/data/`)
- Hack recipes with clear steps and explanations
- Plain-English breakdowns of model components
- Corrections or deeper dives on existing content

Keep the tone accessible — explain *why*, not just *what*.

## Project layout

- `src/pages/` — one `.astro` file per route
- `src/components/` — the three Vue single-file components (one per explorer)
- `src/data/` — hand-curated architecture data, separated from rendering
- `src/layouts/BaseLayout.astro` — shared `<head>` and top nav
- `src/styles/theme.css` — shared CSS variables and base styles
- `demo-dag/`, `gemma-references/` — research artifacts, not part of the site
