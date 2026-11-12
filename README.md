# This Could Be Your Site

A standalone Front of House showcase with 36 restaurant website concepts, each with a landing page and sample menu. Built with Vite, TypeScript, and static content. No account, backend, analytics, or visitor data storage is required.

A small fixed studio bar lets visitors try their restaurant name and adjust the main and accent colors with two sliders. Moving either slider opens an overview of the concepts, and releasing it returns to the same scroll position. These changes stay in the current browser view only.

“Browse styles” opens a photographic index of all 36 concepts. Each concept has a mobile composition and a wider arrangement, with content-driven spacing, keyboard-operated menus, and reduced-motion support. See `docs/layout-review.md` for the layout review.

## Run locally

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
```

The static site is emitted to `dist/`. See `docs/content-model.md` to edit copy and menu placeholders. See `docs/asset-library.md` to source and reuse photographs.

For the local lead queue, three-option restaurant review flow, and HTML email drafts, see `docs/lead-review.md`. It runs at `/review.html` in the local development server and is excluded from the public build. Lead records, research, selections, and generated drafts are private local data and are not included in this repository. Supply your own lead CSV and research to use the review workflow.

To try the email template workflow with fictional data in a fresh clone, run:

```sh
npm run prepare:leads -- examples/demo-leads.csv examples/demo-research.json
npm run dev:review
```

Open the local `/review.html` URL printed by Vite. Preparing leads replaces `.local/lead-review.json`, so use your own CSV when you are ready to work with real leads.

The build also validates both JSON schemas, unique IDs, layout coverage, asset references, and local image files. Run `npm run validate` for those content checks alone.

## Photography

The showcase uses a local library of 66 individually verified CC0 photographs from Wikimedia Commons. Each has a source, author, license record, alt text, and optimized desktop and mobile WebP file in `content/asset-library.json`. The site credits the photographers of each displayed concept in its menu view. No generated image is used in the published site.
